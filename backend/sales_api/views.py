from rest_framework import status, viewsets, generics
from rest_framework.decorators import api_view
from rest_framework.pagination import LimitOffsetPagination
from rest_framework.response import Response
from django.db import models
from django.db.models import Sum, Count, Min, Max
from django.db.models.functions import Coalesce
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek
from django.http import HttpResponse
from django.utils import timezone
from django.db import transaction
from .models import (
    OutboundRecord,
    InventoryItem,
    DataSource,
    DeliveryDailyRecord,
    DeliverySpecialNote,
    BarcodeTransferRecord,
    BarcodeMaster,
    InventoryBaselineUpload,
    InventoryBaselineItem,
    InventoryReceiptUpload,
    InventoryReceiptItem,
    MasterSpec,
    ProductionLog,
    InboundOrderUpload,
    InboundOrderLine,
    InboundPolicy,
)
from .serializers import (
    OutboundRecordSerializer, InventoryItemSerializer, DataSourceSerializer, DeliverySpecialNoteSerializer,
    InboundOrderUploadSerializer, InboundOrderLineSerializer, InboundPolicySerializer
)
from datetime import datetime, timedelta
from decimal import Decimal
import json
import uuid
import hashlib
import os
import logging
import traceback
import pandas as pd
import csv
import io
import urllib.request
import urllib.error

logger = logging.getLogger('sales_api.inventory')

_MASTER_SPECS = []
_MASTER_SPEC_NEXT_ID = 1

_PRODUCTION_LOG = []
_PRODUCTION_NEXT_ID = 1


_PRODUCTION_STATUS_VALUES = {'pending', 'started', 'ended', 'stopped'}


def _production_calc_total(quantity, unit_quantity, current_total=None):
    try:
        q = int(float(quantity))
    except Exception:
        q = 0
    try:
        uq = int(float(unit_quantity))
    except Exception:
        uq = 0
    if q < 0:
        q = 0
    if uq < 0:
        uq = 0
    return q * uq


def _production_normalize_status(value: str):
    s = (value or '').strip().lower()
    if s in _PRODUCTION_STATUS_VALUES:
        return s
    # legacy mapping
    if s in ('in-progress', 'inprogress', 'progress'):
        return 'started'
    if s in ('completed', 'complete', 'done'):
        return 'ended'
    return 'pending'


def _production_apply_status(item: dict, status_value: str):
    now_iso = timezone.now().isoformat()
    s = _production_normalize_status(status_value)
    item['status'] = s
    if s == 'pending':
        item['startTime'] = None
        item['endTime'] = None
    elif s == 'started':
        if not item.get('startTime'):
            item['startTime'] = now_iso
        item['endTime'] = None
    elif s == 'ended':
        if not item.get('startTime'):
            item['startTime'] = now_iso
        if not item.get('endTime'):
            item['endTime'] = now_iso
    elif s == 'stopped':
        if not item.get('startTime'):
            item['startTime'] = now_iso
        if not item.get('endTime'):
            item['endTime'] = now_iso
    return item


def _production_apply_status_model(obj: ProductionLog, status_value: str):
    now = timezone.now()
    s = _production_normalize_status(status_value)
    obj.status = s
    if s == 'pending':
        obj.start_time = None
        obj.end_time = None
    elif s == 'started':
        if not obj.start_time:
            obj.start_time = now
        obj.end_time = None
    elif s in ('ended', 'stopped'):
        if not obj.start_time:
            obj.start_time = now
        if not obj.end_time:
            obj.end_time = now
    return obj


def _production_model_to_dict(obj: ProductionLog):
    return {
        'id': obj.id,
        'date': obj.date.isoformat() if obj.date else '',
        'machineNumber': obj.machine_number or '',
        'moldNumber': obj.mold_number or '',
        'productName': obj.product_name or '',
        'productNameEng': obj.product_name_eng or '',
        'color1': obj.color1 or '',
        'color2': obj.color2 or '',
        'unit': obj.unit or '',
        'quantity': int(obj.quantity or 0),
        'unitQuantity': int(obj.unit_quantity or 0),
        'total': int(obj.total or 0),
        'status': obj.status or 'pending',
        'startTime': obj.start_time.isoformat() if obj.start_time else None,
        'endTime': obj.end_time.isoformat() if obj.end_time else None,
    }


def _zai_get_config():
    base_url = (os.getenv('ANTHROPIC_BASE_URL') or '').strip().rstrip('/')
    api_key = (os.getenv('ANTHROPIC_AUTH_TOKEN') or '').strip()
    model = (os.getenv('ANTHROPIC_DEFAULT_SONNET_MODEL') or 'glm-4.7').strip()
    # Backward-compat: transparently move old default/model name forward.
    if (model or '').strip().lower() == 'glm-4.6':
        model = 'glm-4.7'

    timeout_ms_raw = (os.getenv('API_TIMEOUT_MS') or '').strip()
    timeout_s = 60
    if timeout_ms_raw:
        try:
            timeout_s = max(1, int(int(timeout_ms_raw) / 1000))
        except Exception:
            timeout_s = 60

    if not base_url or not api_key:
        return None

    return {
        'base_url': base_url,
        'api_key': api_key,
        'model': model,
        'timeout_s': timeout_s,
    }


def _zai_call_messages(*, system: str, user: str, max_tokens: int = 2048, temperature: float = 0.3):
    cfg = _zai_get_config()
    if not cfg:
        return None

    url = f"{cfg['base_url']}/v1/messages"
    payload = {
        'model': cfg['model'],
        'messages': [{'role': 'user', 'content': user}],
        'system': system,
        'max_tokens': max_tokens,
        'temperature': temperature,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'x-api-key': cfg['api_key'],
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
        },
        method='POST',
    )

    with urllib.request.urlopen(req, timeout=cfg['timeout_s']) as resp:
        raw = resp.read().decode('utf-8')

    data = json.loads(raw) if raw else {}
    content = data.get('content')
    if isinstance(content, list):
        for item in content:
            if isinstance(item, dict) and item.get('type') == 'text':
                return (item.get('text') or '').strip()

    return None

class StandardResultsSetPagination(LimitOffsetPagination):
    default_limit = 10000
    max_limit = 20000

class OutboundRecordListView(generics.ListAPIView):
    queryset = OutboundRecord.objects.all().order_by('-outbound_date')
    serializer_class = OutboundRecordSerializer
    pagination_class = StandardResultsSetPagination

    def get_queryset(self):
        queryset = super().get_queryset()
        start = self.request.query_params.get('start') or self.request.query_params.get('startDate')
        end = self.request.query_params.get('end') or self.request.query_params.get('endDate')
        
        if start:
            queryset = queryset.filter(outbound_date__gte=start)
        if end:
            queryset = queryset.filter(outbound_date__lte=end)
            
        return queryset

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        # Return only the list for frontend compatibility
        return Response(response.data['results'])

class InventoryItemViewSet(viewsets.ModelViewSet):
    queryset = InventoryItem.objects.all()
    serializer_class = InventoryItemSerializer

class DataSourceViewSet(viewsets.ModelViewSet):
    queryset = DataSource.objects.all()
    serializer_class = DataSourceSerializer


def _parse_int(val) -> int:
    if val is None:
        return 0
    s = str(val).strip().replace(',', '')
    if not s:
        return 0
    try:
        return int(float(s))
    except Exception:
        return 0


def _parse_date_ymd(val):
    s = ('' if val is None else str(val)).strip()
    if not s:
        return None
    for fmt in ('%Y-%m-%d', '%Y.%m.%d', '%Y/%m/%d', '%Y%m%d'):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    try:
        dt = pd.to_datetime(s, errors='coerce')
        if pd.isna(dt):
            return None
        return dt.date()
    except Exception:
        return None


def _parse_datetime(val):
    if val is None:
        return None
    try:
        if isinstance(val, datetime):
            return val
    except Exception:
        pass
    s = str(val).strip()
    if not s:
        return None
    for fmt in (
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d %H:%M',
        '%Y/%m/%d %H:%M:%S',
        '%Y/%m/%d %H:%M',
        '%Y.%m.%d %H:%M:%S',
        '%Y.%m.%d %H:%M',
    ):
        try:
            return datetime.strptime(s, fmt)
        except Exception:
            pass
    try:
        dt = pd.to_datetime(s, errors='coerce')
        if pd.isna(dt):
            return None
        return dt.to_pydatetime()
    except Exception:
        return None


def _normalize_cols(cols):
    out = []
    for c in cols:
        s = ' '.join(str(c).strip().lower().split())
        out.append(s)
    return out


def _find_col_index(cols, candidates):
    for cand in candidates:
        cand_norm = ' '.join(str(cand).strip().lower().split())
        if not cand_norm:
            continue

        # Prefer exact match first (avoids picking '로케이션 유형' when '로케이션' exists)
        for i, c in enumerate(cols):
            if cand_norm == (c or ''):
                return i

        # Fallback to substring match
        for i, c in enumerate(cols):
            if cand_norm in (c or ''):
                return i
    return None


@api_view(['GET'])
def inventory_unified(request):
    # Source of truth: latest baseline upload (single active snapshot)
    latest_upload = InventoryBaselineUpload.objects.order_by('-uploaded_at').first()
    if not latest_upload:
        return Response({
            'success': True,
            'data': [],
            'pagination': {
                'page': 1,
                'limit': 1000,
                'total': 0,
                'pages': 1,
                'hasMore': False,
            },
            'summary': {'overall': {}, 'filtered': {}, 'options': {}},
            'lastUploadDate': None,
            'latestDataInfo': {
                'latestUploadDate': None,
                'totalItems': 0,
                'filteredItems': 0,
                'dataCompleteness': 100,
                'hasLatestDataOnly': True,
            },
        })

    as_of = latest_upload.as_of_date
    baseline_items = InventoryBaselineItem.objects.filter(upload=latest_upload)

    master_qs = BarcodeMaster.objects.all()
    master_map = {m.barcode: m for m in master_qs}

    # Category fallback from outbound records (when BarcodeMaster.category is empty)
    baseline_barcodes = list(
        baseline_items.exclude(barcode__isnull=True).exclude(barcode='').values_list('barcode', flat=True).distinct()
    )
    outbound_category_map = {}
    if baseline_barcodes:
        for row in (
            OutboundRecord.objects.filter(barcode__in=baseline_barcodes)
            .exclude(category__isnull=True)
            .exclude(category='')
            .values('barcode')
            .annotate(category=Max('category'))
        ):
            outbound_category_map[(row.get('barcode') or '').strip()] = (row.get('category') or '').strip()

    # Receipts since baseline date (including same day)
    receipt_qs = InventoryReceiptItem.objects.filter(receipt_date__gte=as_of)
    if baseline_barcodes:
        receipt_qs = receipt_qs.filter(barcode__in=baseline_barcodes)
    receipt_agg = {
        row['barcode']: int(row.get('qty') or 0)
        for row in receipt_qs.values('barcode').annotate(qty=Sum('quantity_box'))
    }

    # Outbound since baseline date (including same day), boxes only
    outbound_qs = OutboundRecord.objects.filter(outbound_date__gte=as_of)
    outbound_qs = outbound_qs.exclude(barcode__isnull=True).exclude(barcode='')
    if baseline_barcodes:
        outbound_qs = outbound_qs.filter(barcode__in=baseline_barcodes)
    outbound_agg = {
        row['barcode']: int(row.get('qty') or 0)
        for row in outbound_qs.values('barcode').annotate(qty=Coalesce(Sum('box_quantity'), 0))
    }

    # 30-day stats for threshold calc (min/max)
    end_date = timezone.localdate()
    start_30 = end_date - timedelta(days=29)
    outbound_30_qs = OutboundRecord.objects.filter(outbound_date__range=[start_30, end_date])
    outbound_30_qs = outbound_30_qs.exclude(barcode__isnull=True).exclude(barcode='')
    if baseline_barcodes:
        outbound_30_qs = outbound_30_qs.filter(barcode__in=baseline_barcodes)
    outbound_30_agg = {
        row['barcode']: int(row.get('qty') or 0)
        for row in outbound_30_qs.values('barcode').annotate(qty=Coalesce(Sum('box_quantity'), 0))
    }

    # 14-day stats for cover days
    start_14 = end_date - timedelta(days=13)
    outbound_14_qs = OutboundRecord.objects.filter(outbound_date__range=[start_14, end_date])
    outbound_14_qs = outbound_14_qs.exclude(barcode__isnull=True).exclude(barcode='')
    if baseline_barcodes:
        outbound_14_qs = outbound_14_qs.filter(barcode__in=baseline_barcodes)
    outbound_14_agg = {
        row['barcode']: int(row.get('qty') or 0)
        for row in outbound_14_qs.values('barcode').annotate(qty=Coalesce(Sum('box_quantity'), 0))
    }

    def _status_from_thresholds(current_qty: int, min_stock: int, safety_stock: int, max_stock: int) -> str:
        # 우선순위: 위험(긴급발주) > 부족(발주요청) > 안전 > 과잉
        # - 위험: 0 이하(품절 포함) 또는 최소재고 미달
        # - 부족: 안전재고 이하
        if current_qty <= 0:
            return 'critical'
        if min_stock > 0 and current_qty < min_stock:
            return 'critical'
        if safety_stock > 0 and current_qty <= safety_stock:
            return 'low'
        if max_stock > 0 and current_qty > max_stock:
            return 'high'
        return 'normal'

    data = []
    for item in baseline_items:
        bc = (item.barcode or '').strip()
        master = master_map.get(bc)
        base_qty = int(item.quantity_box or 0)
        rcv_qty = int(receipt_agg.get(bc) or 0)
        out_qty = int(outbound_agg.get(bc) or 0)
        current_qty = base_qty + rcv_qty - out_qty

        out14 = int(outbound_14_agg.get(bc) or 0)
        avg_daily = (out14 / 14.0) if out14 > 0 else 0.0
        cover_days = (current_qty / avg_daily) if avg_daily > 0 else None

        out30 = int(outbound_30_agg.get(bc) or 0)
        avg_daily_30 = (out30 / 30.0) if out30 > 0 else 0.0
        # 정책: 최소재고=3일치, 최대재고=30일치(한달)
        calc_min_stock = int(round(avg_daily_30 * 3)) if avg_daily_30 > 0 else 0
        calc_max_stock = int(round(avg_daily_30 * 30)) if avg_daily_30 > 0 else 0

        # 임계값의 source of truth:
        # 1) BarcodeMaster에 설정값이 있으면 그것을 우선 사용
        # 2) 없으면(0) 계산값을 fallback
        bm_min_stock = int(getattr(master, 'min_stock', 0) or 0) if master else 0
        bm_max_stock = int(getattr(master, 'max_stock', 0) or 0) if master else 0
        bm_reorder_point = int(getattr(master, 'reorder_point', 0) or 0) if master else 0
        bm_safety_stock = int(getattr(master, 'safety_stock', 0) or 0) if master else 0
        bm_lifecycle_status = (getattr(master, 'lifecycle_status', None) or 'active') if master else 'active'

        min_stock = bm_min_stock if bm_min_stock > 0 else calc_min_stock
        max_stock = bm_max_stock if bm_max_stock > 0 else calc_max_stock

        # safetyStock은 부족(발주요청)의 기준으로 사용
        # 값이 없으면(0) min_stock 이상이 되도록 보정하여 분류가 안정적으로 동작하게 함
        safety_stock = bm_safety_stock
        if safety_stock <= 0:
            safety_stock = min_stock
        else:
            safety_stock = max(safety_stock, min_stock)

        reorder_point = bm_reorder_point if bm_reorder_point > 0 else min_stock

        stock_status = _status_from_thresholds(int(current_qty), int(min_stock), int(safety_stock), int(max_stock))

        hidden_reason = None
        if str(bm_lifecycle_status) in ('paused', 'discontinued') and int(current_qty) == 0:
            hidden_reason = 'lifecycle_zero_stock'

        data.append({
            'id': str(item.id),
            'skuId': (master.sku_id if master else None),
            'productName': (master.product_name if (master and master.product_name) else (item.product_name or '-')),
            'currentStock': int(current_qty),
            'minStock': int(min_stock),
            'maxStock': int(max_stock),
            'reorderPoint': int(reorder_point),
            'safetyStock': int(safety_stock),
            'lifecycleStatus': str(bm_lifecycle_status),
            'hiddenReason': hidden_reason,
            'category': (
                (master.category if (master and master.category) else '')
                or outbound_category_map.get(bc)
                or '기타'
            ),
            'location': (
                (master.location if (master and master.location) else (item.location or ''))
            ),
            'barcode': bc,
            'lastUpdated': latest_upload.uploaded_at.isoformat() if latest_upload.uploaded_at else None,
            'inventoryDate': as_of.isoformat(),
            'stockStatus': stock_status,
            'coverDays': cover_days,
            'outbound14dTotal': out14,
            'avgDailyOutbound14d': avg_daily,
            'outbound30dTotal': out30,
            'avgDailyOutbound30d': avg_daily_30,
        })

    return Response({
        'success': True,
        'data': data,
        'pagination': {
            'page': 1,
            'limit': 1000,
            'total': len(data),
            'pages': 1,
            'hasMore': False,
        },
        'summary': {
            'overall': {},
            'filtered': {},
            'options': {},
        },
        'lastUploadDate': latest_upload.uploaded_at.isoformat() if latest_upload.uploaded_at else None,
        'latestDataInfo': {
            'latestUploadDate': latest_upload.uploaded_at.isoformat() if latest_upload.uploaded_at else None,
            'totalItems': len(data),
            'filteredItems': len(data),
            'dataCompleteness': 100,
            'hasLatestDataOnly': True,
        },
    })


@api_view(['GET', 'DELETE'])
def inventory_upload_history(request):
    if request.method == 'GET':
        uploads = InventoryBaselineUpload.objects.order_by('-uploaded_at')
        data = []
        for u in uploads:
            data.append({
                'id': str(u.id),
                'fileName': ', '.join((u.file_names or [])[:5]) if isinstance(u.file_names, list) else '',
                'uploadDate': u.uploaded_at.isoformat() if u.uploaded_at else None,
                'inventoryDate': u.as_of_date.isoformat() if u.as_of_date else None,
                'status': 'success',
                'recordsProcessed': int(u.total_barcodes or 0),
                'recordsSkipped': 0,
                'uploadedBy': 'system',
                'fileSize': 0,
            })
        return Response({'success': True, 'data': data})

    # DELETE = full reset (baseline + receipts)
    InventoryBaselineItem.objects.all().delete()
    InventoryBaselineUpload.objects.all().delete()
    InventoryReceiptItem.objects.all().delete()
    InventoryReceiptUpload.objects.all().delete()
    return Response({'success': True, 'message': 'reset ok'})


@api_view(['DELETE'])
def inventory_upload_history_by_date(request, date: str):
    # For now, deleting by date means full reset per user policy
    InventoryBaselineItem.objects.all().delete()
    InventoryBaselineUpload.objects.all().delete()
    InventoryReceiptItem.objects.all().delete()
    InventoryReceiptUpload.objects.all().delete()
    return Response({'success': True, 'message': 'reset ok'})


@api_view(['POST'])
def inventory_baseline_upload(request):
    error_id = str(uuid.uuid4())
    # full reset before applying new baseline
    as_of_str = (request.data.get('inventoryDate') or request.data.get('asOfDate') or '').strip() if isinstance(request.data, dict) else ''
    as_of = _parse_date_ymd(as_of_str)
    if not as_of:
        return Response({'message': 'inventoryDate is required (YYYY-MM-DD)'}, status=status.HTTP_400_BAD_REQUEST)

    files = request.FILES.getlist('files')
    if not files:
        files = request.FILES.getlist('xlsx')
    if not files:
        # backward compatibility with existing UI
        files = request.FILES.getlist('csv')
    if not files:
        return Response({'message': 'files are required'}, status=status.HTTP_400_BAD_REQUEST)

    total_bytes = 0
    try:
        for f in files:
            total_bytes += int(getattr(f, 'size', 0) or 0)
    except Exception:
        total_bytes = 0

    logger.info(
        'baseline_upload start error_id=%s as_of=%s file_count=%s total_mb=%.2f',
        error_id,
        as_of.isoformat(),
        len(files),
        (total_bytes / 1024 / 1024) if total_bytes else 0.0,
    )
    logger.debug('baseline_upload files=%s', [getattr(f, 'name', '') for f in files])

    InventoryBaselineItem.objects.all().delete()
    InventoryBaselineUpload.objects.all().delete()
    InventoryReceiptItem.objects.all().delete()
    InventoryReceiptUpload.objects.all().delete()

    upload = InventoryBaselineUpload.objects.create(
        as_of_date=as_of,
        file_count=len(files),
        file_names=[getattr(f, 'name', '') for f in files],
    )

    total_rows = 0
    agg = {}
    meta = {}
    for f in files:
        try:
            logger.debug('baseline_upload read_excel start error_id=%s file=%s size=%s', error_id, getattr(f, 'name', ''), getattr(f, 'size', None))
            df = pd.read_excel(f, dtype=str)
            logger.debug('baseline_upload read_excel done error_id=%s file=%s rows=%s cols=%s', error_id, getattr(f, 'name', ''), len(df), len(df.columns))
        except Exception as e:
            logger.exception('baseline_upload read_excel failed error_id=%s file=%s', error_id, getattr(f, 'name', ''))
            return Response(
                {
                    'message': f'엑셀 파싱 실패: {getattr(f, "name", "")}: {str(e)}',
                    'errorId': error_id,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        df = df.fillna('')
        cols = _normalize_cols(df.columns)
        bc_idx = _find_col_index(cols, ['상품 바코드', '상품바코드', '바코드', 'barcode'])
        qty_idx = _find_col_index(cols, ['수량'])
        name_idx = _find_col_index(cols, ['상품명', '품목', 'product'])
        # Prefer external SKU id when available
        sku_idx = _find_col_index(cols, [
            '외부 sku id',
            'external sku id',
            'external skuid',
            'ext sku id',
            'sku id',
            'sku_id',
            'sku-id',
            'skuid',
            'sku',
            '품목코드',
            '상품코드',
            '상품 코드',
            '상품id',
            '상품 id',
        ])
        cat_idx = _find_col_index(cols, ['분류', '카테고리', 'category', '제품분류', '제품 분류'])
        loc_idx = _find_col_index(cols, ['로케이션', 'location', '위치', '보관', '창고', '적치'])

        if bc_idx is None or qty_idx is None:
            logger.warning(
                'baseline_upload missing required cols error_id=%s file=%s cols=%s',
                error_id,
                getattr(f, 'name', ''),
                cols,
            )
            continue

        total_rows += len(df)
        for _, row in df.iterrows():
            bc = str(row.iloc[bc_idx]).strip()
            if not bc:
                continue
            qty = _parse_int(row.iloc[qty_idx])
            if qty <= 0:
                continue
            agg[bc] = int(agg.get(bc) or 0) + qty
            if bc not in meta:
                meta[bc] = {
                    'product_name': str(row.iloc[name_idx]).strip() if name_idx is not None else '',
                    'sku_id': str(row.iloc[sku_idx]).strip() if sku_idx is not None else '',
                    'category': str(row.iloc[cat_idx]).strip() if cat_idx is not None else '',
                    'location': str(row.iloc[loc_idx]).strip() if loc_idx is not None else '',
                }

    items = []
    for bc, qty in agg.items():
        m = meta.get(bc) or {}
        items.append(InventoryBaselineItem(
            upload=upload,
            barcode=bc,
            quantity_box=int(qty),
            product_name=(m.get('product_name') or '')[:255],
            location=(m.get('location') or '')[:255],
        ))

    if items:
        InventoryBaselineItem.objects.bulk_create(items, batch_size=2000)

    # Upsert BarcodeMaster with SKU/category/location so unified inventory can display them
    try:
        barcodes = list(agg.keys())
        existing_map = {m.barcode: m for m in BarcodeMaster.objects.filter(barcode__in=barcodes)}
        to_create = []
        to_update = []

        for bc in barcodes:
            m = meta.get(bc) or {}
            sku_id_val = (m.get('sku_id') or '').strip()
            cat_val = (m.get('category') or '').strip()
            loc_val = (m.get('location') or '').strip()
            name_val = (m.get('product_name') or '').strip()

            bm = existing_map.get(bc)
            if not bm:
                to_create.append(BarcodeMaster(
                    barcode=bc,
                    sku_id=sku_id_val or '',
                    category=cat_val or '',
                    location=loc_val or '',
                    product_name=name_val[:255] if name_val else '',
                ))
                continue

            changed = False
            if sku_id_val and (bm.sku_id or '').strip() != sku_id_val:
                bm.sku_id = sku_id_val
                changed = True
            if cat_val and (bm.category or '').strip() != cat_val:
                bm.category = cat_val
                changed = True
            if loc_val and (bm.location or '').strip() != loc_val:
                bm.location = loc_val
                changed = True
            if name_val and (bm.product_name or '').strip() != name_val:
                bm.product_name = name_val[:255]
                changed = True

            if changed:
                to_update.append(bm)

        if to_create:
            BarcodeMaster.objects.bulk_create(to_create, ignore_conflicts=True, batch_size=2000)
        if to_update:
            BarcodeMaster.objects.bulk_update(to_update, ['sku_id', 'category', 'location', 'product_name'], batch_size=2000)
    except Exception:
        logger.exception('baseline_upload barcode_master upsert failed error_id=%s', error_id)

    upload.total_rows = int(total_rows)
    upload.total_barcodes = int(len(items))
    upload.save(update_fields=['total_rows', 'total_barcodes'])

    logger.info(
        'baseline_upload done error_id=%s as_of=%s total_rows=%s total_barcodes=%s',
        error_id,
        as_of.isoformat(),
        int(total_rows),
        int(len(items)),
    )

    return Response({
        'success': True,
        'message': 'baseline uploaded',
        'rowsProcessed': len(items),
        'asOfDate': as_of.isoformat(),
    })


@api_view(['POST'])
def inventory_receipts_upload(request):
    error_id = str(uuid.uuid4())
    latest_upload = InventoryBaselineUpload.objects.order_by('-uploaded_at').first()
    if not latest_upload:
        return Response({'message': '기준재고 업로드 후 입고 업로드가 가능합니다.'}, status=status.HTTP_400_BAD_REQUEST)

    as_of = latest_upload.as_of_date
    file_obj = request.FILES.get('file') or request.FILES.get('xlsx')
    if not file_obj:
        return Response({'message': 'file is required'}, status=status.HTTP_400_BAD_REQUEST)

    logger.info(
        'receipts_upload start error_id=%s baseline_as_of=%s file=%s size=%s',
        error_id,
        as_of.isoformat() if as_of else None,
        getattr(file_obj, 'name', ''),
        getattr(file_obj, 'size', None),
    )

    raw = file_obj.read()
    file_hash = hashlib.sha256(raw).hexdigest()
    if InventoryReceiptUpload.objects.filter(file_hash=file_hash).exists():
        return Response({'success': True, 'message': '이미 업로드된 파일입니다.'})

    try:
        df = pd.read_excel(io.BytesIO(raw), dtype=str).fillna('')
    except Exception as e:
        logger.exception('receipts_upload read_excel failed error_id=%s file=%s', error_id, getattr(file_obj, 'name', ''))
        return Response(
            {
                'message': f'엑셀 파싱 실패: {str(e)}',
                'errorId': error_id,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    cols = _normalize_cols(df.columns)
    bc_idx = _find_col_index(cols, ['상품바코드', '상품 바코드', '바코드', 'barcode'])
    qty_idx = _find_col_index(cols, ['입고 수량', '입고수량', '수량'])
    dt_idx = _find_col_index(cols, ['입고 일시', '입고일시', '입고일', 'datetime', 'date'])
    name_idx = _find_col_index(cols, ['상품명', '품목', 'product'])

    if bc_idx is None or qty_idx is None or dt_idx is None:
        logger.warning('receipts_upload missing required cols error_id=%s cols=%s', error_id, cols)
        return Response(
            {
                'message': '필수 컬럼(상품바코드/입고 수량/입고 일시)을 찾을 수 없습니다.',
                'errorId': error_id,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    upload = InventoryReceiptUpload.objects.create(
        file_name=getattr(file_obj, 'name', '') or 'receipts.xlsx',
        file_hash=file_hash,
    )

    rows_processed = 0
    rows_skipped = 0
    rows_created = 0
    rows_updated = 0
    rows_unchanged = 0
    rows_invalid = 0

    parsed = []
    for _, row in df.iterrows():
        bc = str(row.iloc[bc_idx]).strip()
        if not bc:
            rows_invalid += 1
            continue
        qty = _parse_int(row.iloc[qty_idx])
        if qty <= 0:
            rows_invalid += 1
            continue
        dt = _parse_datetime(row.iloc[dt_idx])
        if not dt:
            rows_invalid += 1
            continue
        rdate = dt.date()
        if rdate < as_of:
            # 기준일 이전 입고는 반영하지 않음
            rows_skipped += 1
            continue
        parsed.append({
            'barcode': bc,
            'receipt_datetime': dt,
            'receipt_date': rdate,
            'quantity_box': int(qty),
            'product_name': (str(row.iloc[name_idx]).strip()[:255] if name_idx is not None else ''),
        })

    # Auto-register new products into catalog (BarcodeMaster)
    try:
        parsed_barcodes = sorted({p.get('barcode') for p in parsed if p.get('barcode')})
        if parsed_barcodes:
            existing = set(BarcodeMaster.objects.filter(barcode__in=parsed_barcodes).values_list('barcode', flat=True))
            to_create = []
            # pick first non-empty name per barcode
            name_map = {}
            for p in parsed:
                bc = p.get('barcode')
                if not bc or bc in name_map:
                    continue
                nm = (p.get('product_name') or '').strip()
                if nm:
                    name_map[bc] = nm[:255]
            for bc in parsed_barcodes:
                if bc in existing:
                    continue
                to_create.append(BarcodeMaster(
                    barcode=bc,
                    product_name=(name_map.get(bc) or ''),
                ))
            if to_create:
                BarcodeMaster.objects.bulk_create(to_create, ignore_conflicts=True, batch_size=2000)
    except Exception:
        logger.exception('receipts_upload barcode_master auto-register failed error_id=%s', error_id)

    # Upsert by (barcode, receipt_datetime)
    # - same qty: unchanged (skip)
    # - different qty: update to new qty (delta semantics)
    # - missing: create
    keys = {(p['barcode'], p['receipt_datetime']) for p in parsed}
    existing_map = {}
    if keys:
        # SQLite doesn't support composite IN well; fetch by barcode and then filter in memory.
        barcodes = sorted({bc for bc, _ in keys})
        qs = InventoryReceiptItem.objects.filter(barcode__in=barcodes)
        for obj in qs:
            k = ((obj.barcode or '').strip(), obj.receipt_datetime)
            if k in keys:
                existing_map[k] = obj

    to_create = []
    to_update = []

    for p in parsed:
        k = (p['barcode'], p['receipt_datetime'])
        existing = existing_map.get(k)
        if not existing:
            to_create.append(InventoryReceiptItem(
                upload=upload,
                receipt_datetime=p['receipt_datetime'],
                receipt_date=p['receipt_date'],
                barcode=p['barcode'],
                quantity_box=p['quantity_box'],
                product_name=p['product_name'],
            ))
            rows_created += 1
            rows_processed += 1
            continue

        new_qty = int(p['quantity_box'])
        old_qty = int(existing.quantity_box or 0)
        if new_qty == old_qty:
            rows_unchanged += 1
            rows_processed += 1
            continue

        existing.quantity_box = new_qty
        # Keep most recent name if provided
        if p.get('product_name'):
            existing.product_name = p['product_name']
        # Tie latest upload reference to most recent file
        existing.upload = upload
        existing.receipt_date = p['receipt_date']
        to_update.append(existing)
        rows_updated += 1
        rows_processed += 1

    try:
        with transaction.atomic():
            if to_create:
                InventoryReceiptItem.objects.bulk_create(to_create, batch_size=2000, ignore_conflicts=True)
            if to_update:
                InventoryReceiptItem.objects.bulk_update(
                    to_update,
                    ['quantity_box', 'product_name', 'upload', 'receipt_date'],
                    batch_size=2000,
                )
    except Exception:
        logger.exception('receipts_upload upsert failed error_id=%s', error_id)
        return Response(
            {
                'message': '입고 업로드 처리 중 오류가 발생했습니다.',
                'errorId': error_id,
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    rows_skipped += int(rows_invalid)

    upload.rows_processed = int(rows_processed)
    upload.rows_skipped = int(rows_skipped)
    upload.save(update_fields=['rows_processed', 'rows_skipped'])

    logger.info(
        'receipts_upload done error_id=%s rows_processed=%s rows_skipped=%s',
        error_id,
        int(rows_processed),
        int(rows_skipped),
    )

    return Response({
        'success': True,
        'message': 'receipts uploaded',
        'rowsProcessed': rows_processed,
        'rowsSkipped': rows_skipped,
        'rowsCreated': rows_created,
        'rowsUpdated': rows_updated,
        'rowsUnchanged': rows_unchanged,
    })


@api_view(['GET'])
def inventory_unified_download_csv(request):
    # inventory_unified is decorated with @api_view, so it expects a Django HttpRequest.
    # Here we are inside DRF already, so we must pass the underlying HttpRequest.
    raw_request = getattr(request, '_request', request)
    resp = inventory_unified(raw_request)
    try:
        payload = resp.data if hasattr(resp, 'data') else None
    except Exception:
        payload = None

    rows = []
    if isinstance(payload, dict):
        rows = payload.get('data') or []

    headers = [
        'barcode',
        'skuId',
        'productName',
        'category',
        'location',
        'inventoryDate',
        'currentStock',
        'minStock',
        'safetyStock',
        'reorderPoint',
        'maxStock',
        'stockStatus',
        'coverDays',
        'outbound14dTotal',
        'avgDailyOutbound14d',
        'outbound30dTotal',
        'avgDailyOutbound30d',
        'lifecycleStatus',
    ]

    def _fmt2(v):
        if v is None or v == '':
            return ''
        try:
            return f"{float(v):.2f}"
        except Exception:
            return str(v)

    encoding = (request.query_params.get('encoding') or '').strip().lower()
    if encoding not in ('utf-8', 'utf-8-sig', 'cp949'):
        encoding = 'utf-8-sig'

    out = io.StringIO(newline='')
    writer = csv.writer(out, lineterminator='\n')
    writer.writerow(headers)
    for r in rows:
        if not isinstance(r, dict):
            continue
        writer.writerow([
            (r.get('barcode') or ''),
            (r.get('skuId') or ''),
            (r.get('productName') or ''),
            (r.get('category') or ''),
            (r.get('location') or ''),
            (r.get('inventoryDate') or ''),
            (r.get('currentStock') or 0),
            (r.get('minStock') or 0),
            (r.get('safetyStock') or 0),
            (r.get('reorderPoint') or 0),
            (r.get('maxStock') or 0),
            (r.get('stockStatus') or ''),
            (_fmt2(r.get('coverDays'))),
            (r.get('outbound14dTotal') or 0),
            (_fmt2(r.get('avgDailyOutbound14d'))),
            (r.get('outbound30dTotal') or 0),
            (_fmt2(r.get('avgDailyOutbound30d'))),
            (r.get('lifecycleStatus') or ''),
        ])

    content = out.getvalue()
    out.close()

    filename = f"inventory_unified_{timezone.localdate().isoformat()}.csv"
    data = content.encode(encoding, errors='replace')
    charset = 'cp949' if encoding == 'cp949' else 'utf-8'
    response = HttpResponse(data, content_type=f'text/csv; charset={charset}')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


@api_view(['GET'])
def inventory_barcode_master(request):
    q = (request.query_params.get('q') or request.query_params.get('search') or '').strip()
    limit_raw = request.query_params.get('limit')
    try:
        limit = int(limit_raw) if limit_raw else 1000
    except Exception:
        limit = 1000
    limit = max(1, min(limit, 5000))

    # Seed missing barcodes from latest baseline so SKU/threshold can be edited later
    latest_upload = InventoryBaselineUpload.objects.order_by('-uploaded_at').first()
    if latest_upload:
        items = InventoryBaselineItem.objects.filter(upload=latest_upload).exclude(barcode__isnull=True).exclude(barcode='')
        for row in items.values('barcode').annotate(
            product_name=Max('product_name'),
            location=Max('location'),
        )[:2000]:
            bc = (row.get('barcode') or '').strip()
            if not bc:
                continue
            BarcodeMaster.objects.get_or_create(
                barcode=bc,
                defaults={
                    'product_name': (row.get('product_name') or '')[:255],
                    'location': (row.get('location') or '')[:255],
                },
            )

    qs = BarcodeMaster.objects.all().order_by('barcode')
    if q:
        qs = qs.filter(
            models.Q(barcode__icontains=q)
            | models.Q(product_name__icontains=q)
            | models.Q(sku_id__icontains=q)
            | models.Q(category__icontains=q)
            | models.Q(location__icontains=q)
        )

    rows = []
    for bm in qs[:limit]:
        rows.append({
            'id': str(bm.id),
            'barcode': bm.barcode,
            'skuId': bm.sku_id or '',
            'productName': bm.product_name or '',
            'category': bm.category or '',
            'location': bm.location or '',
            'lifecycleStatus': getattr(bm, 'lifecycle_status', 'active') or 'active',
            'minStock': int(bm.min_stock or 0),
            'maxStock': int(bm.max_stock or 0),
            'reorderPoint': int(bm.reorder_point or 0),
            'safetyStock': int(bm.safety_stock or 0),
            'notes': bm.notes or '',
            'createdAt': bm.created_at.isoformat() if bm.created_at else None,
            'updatedAt': bm.updated_at.isoformat() if bm.updated_at else None,
        })

    return Response({'success': True, 'data': rows})


@api_view(['PATCH'])
def inventory_unified_patch(request, _id: str):
    payload = request.data if isinstance(request.data, dict) else {}

    try:
        item = InventoryBaselineItem.objects.filter(id=_id).first()
    except Exception:
        item = None

    barcode = (payload.get('barcode') or '').strip()
    if not barcode and item:
        barcode = (item.barcode or '').strip()
    if not barcode:
        try:
            bm = BarcodeMaster.objects.filter(id=_id).first()
        except Exception:
            bm = None
        if bm:
            barcode = (bm.barcode or '').strip()
    if not barcode:
        return Response({'success': False, 'message': 'barcode is required'}, status=status.HTTP_400_BAD_REQUEST)

    def _to_int(v):
        try:
            if v is None or v == '':
                return None
            return int(float(v))
        except Exception:
            return None

    min_stock = _to_int(payload.get('minStock'))
    max_stock = _to_int(payload.get('maxStock'))
    reorder_point = _to_int(payload.get('reorderPoint'))
    safety_stock = _to_int(payload.get('safetyStock'))

    lifecycle_status = (payload.get('lifecycleStatus') or payload.get('lifecycle_status') or '').strip()

    sku_id = (payload.get('skuId') or payload.get('sku_id') or '').strip()
    category = (payload.get('category') or '').strip()
    location = (payload.get('location') or '').strip()
    product_name = (payload.get('productName') or payload.get('product_name') or '').strip()

    bm, _created = BarcodeMaster.objects.get_or_create(barcode=barcode)
    if sku_id:
        bm.sku_id = sku_id
    if category:
        bm.category = category
    if location:
        bm.location = location
    if product_name:
        bm.product_name = product_name

    if min_stock is not None:
        bm.min_stock = max(0, min_stock)
    if max_stock is not None:
        bm.max_stock = max(0, max_stock)
    if reorder_point is not None:
        bm.reorder_point = max(0, reorder_point)
    if safety_stock is not None:
        bm.safety_stock = max(0, safety_stock)

    if lifecycle_status:
        lifecycle_status = lifecycle_status.lower()
        if lifecycle_status in ('active', 'paused', 'discontinued'):
            bm.lifecycle_status = lifecycle_status

    bm.save()

    return Response({'success': True, 'barcode': barcode})


@api_view(['GET', 'POST'])
def master_specs(request):
    if request.method == 'GET':
        specs = MasterSpec.objects.all().order_by('product_name')
        return Response([
            {
                'id': s.id,
                'product_name': s.product_name,
                'product_name_eng': s.product_name_eng,
                'mold_number': s.mold_number,
                'color1': s.color1,
                'color2': s.color2,
                'default_quantity': int(s.default_quantity or 0),
            }
            for s in specs
        ])

    payload = request.data if isinstance(request.data, dict) else {}
    product_name = (payload.get('product_name') or '').strip()
    if not product_name:
        return Response({'message': 'product_name is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        spec = MasterSpec.objects.create(
            product_name=product_name,
            product_name_eng=payload.get('product_name_eng') or '',
            mold_number=payload.get('mold_number') or '',
            color1=payload.get('color1') or '',
            color2=payload.get('color2') or '',
            default_quantity=int(payload.get('default_quantity') or 0),
        )
    except Exception:
        return Response({'message': 'already exists'}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        'id': spec.id,
        'product_name': spec.product_name,
        'product_name_eng': spec.product_name_eng,
        'mold_number': spec.mold_number,
        'color1': spec.color1,
        'color2': spec.color2,
        'default_quantity': int(spec.default_quantity or 0),
    }, status=status.HTTP_201_CREATED)


@api_view(['PUT', 'DELETE'])
def master_specs_detail(request, id: int):
    spec = MasterSpec.objects.filter(id=int(id)).first()
    if not spec:
        return Response({'message': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        spec.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    payload = request.data if isinstance(request.data, dict) else {}
    for key in ['product_name', 'product_name_eng', 'mold_number', 'color1', 'color2', 'default_quantity']:
        if key in payload:
            setattr(spec, key, payload.get(key))
    try:
        spec.default_quantity = int(spec.default_quantity or 0)
    except Exception:
        spec.default_quantity = 0
    spec.save()

    return Response({
        'id': spec.id,
        'product_name': spec.product_name,
        'product_name_eng': spec.product_name_eng,
        'mold_number': spec.mold_number,
        'color1': spec.color1,
        'color2': spec.color2,
        'default_quantity': int(spec.default_quantity or 0),
    })


@api_view(['POST'])
def master_extract(request):
    existing = set(MasterSpec.objects.values_list('product_name', flat=True))

    def _as_int(v):
        try:
            if v is None:
                return 0
            if isinstance(v, str):
                v = v.replace(',', '').strip()
            return int(float(v))
        except Exception:
            return 0

    # Best row per product_name: latest date, then highest id
    best_by_name = {}
    qs = ProductionLog.objects.exclude(product_name='').order_by('-date', '-id')
    for row in qs.iterator():
        name = (row.product_name or '').strip()
        if name and name not in best_by_name:
            best_by_name[name] = row

    added = 0
    updated = 0
    for name in sorted(best_by_name.keys()):
        row = best_by_name.get(name)
        if not row:
            continue

        eng = (row.product_name_eng or '').strip()
        mold = (row.mold_number or '').strip()
        c1 = (row.color1 or '').strip()
        c2 = (row.color2 or '').strip()
        # Use unit for default_quantity (as requested)
        default_qty = _as_int(row.unit)

        if name in existing:
            spec = MasterSpec.objects.filter(product_name=name).first()
            if not spec:
                continue
            changed = False
            if eng and not (spec.product_name_eng or '').strip():
                spec.product_name_eng = eng
                changed = True
            if mold and not (spec.mold_number or '').strip():
                spec.mold_number = mold
                changed = True
            if c1 and not (spec.color1 or '').strip():
                spec.color1 = c1
                changed = True
            if c2 and not (spec.color2 or '').strip():
                spec.color2 = c2
                changed = True
            if default_qty and int(spec.default_quantity or 0) == 0:
                spec.default_quantity = default_qty
                changed = True
            if changed:
                spec.save()
                updated += 1
            continue

        spec = MasterSpec.objects.create(
            product_name=name,
            product_name_eng=eng,
            mold_number=mold,
            color1=c1,
            color2=c2,
            default_quantity=default_qty,
        )
        existing.add(spec.product_name)
        added += 1

    return Response({'added': added, 'updated': updated})


@api_view(['GET'])
def production_list(request):
    all_dates = list(ProductionLog.objects.values_list('date', flat=True).distinct().order_by('date'))
    latest = all_dates[-1].isoformat() if all_dates else None
    data_qs = ProductionLog.objects.all()
    latest_qs = ProductionLog.objects.filter(date=all_dates[-1]) if all_dates else ProductionLog.objects.none()
    data = [_production_model_to_dict(x) for x in data_qs]
    latest_data = [_production_model_to_dict(x) for x in latest_qs]
    return Response({
        'success': True,
        'latestDate': latest,
        'data': data,
        'latestData': latest_data,
        'allDates': [d.isoformat() for d in all_dates],
        'totalRecords': data_qs.count(),
    })


@api_view(['POST'])
def production_bulk_status(request):
    payload = request.data if isinstance(request.data, dict) else {}
    status_value = payload.get('status')
    if not status_value:
        return Response({'message': 'status is required'}, status=status.HTTP_400_BAD_REQUEST)
    status_value = _production_normalize_status(str(status_value))

    scope = (payload.get('scope') or '').strip().lower()
    ids = payload.get('ids')
    date = (payload.get('date') or '').strip()

    targets = []
    if isinstance(ids, list) and ids:
        idset = [int(x) for x in ids if str(x).isdigit()]
        targets = list(ProductionLog.objects.filter(id__in=idset))
    elif date:
        try:
            targets = list(ProductionLog.objects.filter(date=date))
        except Exception:
            targets = []
    elif scope == 'all':
        targets = list(ProductionLog.objects.all())
    else:
        return Response({'message': 'ids or date or scope=all is required'}, status=status.HTTP_400_BAD_REQUEST)

    updated = 0
    for row in targets:
        _production_apply_status_model(row, status_value)
        row.save()
        updated += 1

    return Response({'success': True, 'updated': updated, 'status': status_value})


@api_view(['GET'])
def production_template(request):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['date', 'machineNumber', 'moldNumber', 'productName', 'productNameEng', 'color1', 'color2', 'unit', 'quantity', 'unitQuantity', 'total', 'status'])
    resp = HttpResponse(output.getvalue(), content_type='text/csv; charset=utf-8')
    resp['Content-Disposition'] = 'attachment; filename="production_template.csv"'
    return resp


@api_view(['POST', 'DELETE'])
def production_log(request):
    if request.method == 'POST':
        payload = request.data if isinstance(request.data, dict) else {}
        record = payload.get('record') if isinstance(payload.get('record'), dict) else payload
        date = (record.get('date') or '').strip() if isinstance(record, dict) else ''
        if not date:
            return Response({'message': 'date is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            date_obj = datetime.fromisoformat(date).date()
        except Exception:
            try:
                date_obj = pd.to_datetime(date).date()
            except Exception:
                return Response({'message': 'invalid date'}, status=status.HTTP_400_BAD_REQUEST)

        machine = str(record.get('machineNumber') or '').strip()
        mold = str(record.get('moldNumber') or '').strip()
        pname = str(record.get('productName') or '').strip()
        c1 = str(record.get('color1') or '').strip()
        c2 = str(record.get('color2') or '').strip()

        def _to_int(v):
            try:
                if v is None:
                    return 0
                if isinstance(v, str):
                    v = v.replace(',', '').strip()
                return int(float(v))
            except Exception:
                return 0

        qty = _to_int(record.get('quantity'))
        unit_qty = _to_int(record.get('unitQuantity'))
        unit_raw = str(record.get('unit') or '').replace(',', '').strip()
        if not unit_qty and unit_raw.isdigit():
            unit_qty = int(unit_raw)
        total = _production_calc_total(qty, unit_qty, record.get('total'))
        status_value = _production_normalize_status(record.get('status') or 'pending')

        defaults = {
            'product_name_eng': str(record.get('productNameEng') or '').strip(),
            'unit': str(record.get('unit') or '').strip(),
            'quantity': qty,
            'unit_quantity': unit_qty,
            'total': total,
            'color1': c1,
            'color2': c2,
            'status': status_value,
        }

        obj, created = ProductionLog.objects.update_or_create(
            date=date_obj,
            machine_number=machine,
            mold_number=mold,
            product_name=pname,
            color1=c1,
            color2=c2,
            defaults=defaults,
        )
        _production_apply_status_model(obj, status_value)
        obj.total = _production_calc_total(obj.quantity, obj.unit_quantity, obj.total)
        obj.save()

        return Response({'success': True, 'record': _production_model_to_dict(obj)}, status=status.HTTP_201_CREATED)

    payload = request.data if isinstance(request.data, dict) else {}
    if payload.get('type') == 'ids' and isinstance(payload.get('ids'), list):
        ids = [int(x) for x in payload.get('ids') if str(x).isdigit()]
        deleted, _ = ProductionLog.objects.filter(id__in=ids).delete()
        return Response({'success': True, 'deleted': deleted})

    deleted, _ = ProductionLog.objects.all().delete()
    return Response({'success': True, 'deleted': deleted})


@api_view(['PUT', 'DELETE'])
def production_log_detail(request, id: int):
    item = ProductionLog.objects.filter(id=int(id)).first()
    if not item:
        return Response({'message': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        item.delete()
        return Response({'success': True})

    payload = request.data if isinstance(request.data, dict) else {}
    if 'date' in payload:
        try:
            item.date = datetime.fromisoformat(str(payload.get('date'))).date()
        except Exception:
            pass
    if 'machineNumber' in payload:
        item.machine_number = str(payload.get('machineNumber') or '').strip()
    if 'moldNumber' in payload:
        item.mold_number = str(payload.get('moldNumber') or '').strip()
    if 'productName' in payload:
        item.product_name = str(payload.get('productName') or '').strip()
    if 'productNameEng' in payload:
        item.product_name_eng = str(payload.get('productNameEng') or '').strip()
    if 'color1' in payload:
        item.color1 = str(payload.get('color1') or '').strip()
    if 'color2' in payload:
        item.color2 = str(payload.get('color2') or '').strip()
    if 'unit' in payload:
        item.unit = str(payload.get('unit') or '').strip()
    if 'quantity' in payload:
        try:
            item.quantity = int(float(str(payload.get('quantity')).replace(',', '').strip()))
        except Exception:
            item.quantity = 0
    if 'unitQuantity' in payload:
        try:
            item.unit_quantity = int(float(str(payload.get('unitQuantity')).replace(',', '').strip()))
        except Exception:
            item.unit_quantity = 0
    if not item.unit_quantity:
        u = str(item.unit or '').replace(',', '').strip()
        if u.isdigit():
            item.unit_quantity = int(u)
    if 'status' in payload:
        item.status = _production_normalize_status(str(payload.get('status') or 'pending'))

    _production_apply_status_model(item, item.status)
    item.total = _production_calc_total(item.quantity, item.unit_quantity, item.total)
    item.save()
    return Response({'success': True, 'record': _production_model_to_dict(item)})


@api_view(['DELETE'])
def production_log_by_date(request, date: str):
    try:
        date_obj = datetime.fromisoformat(date).date()
    except Exception:
        return Response({'message': 'invalid date'}, status=status.HTTP_400_BAD_REQUEST)
    deleted, _ = ProductionLog.objects.filter(date=date_obj).delete()
    return Response({'success': True, 'deleted': deleted})


@api_view(['POST'])
def upload_production_file(request):
    _file = request.FILES.get('productionFile')
    if not _file:
        return Response({'message': 'productionFile is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        xls = pd.ExcelFile(_file)

        sheet_name = None
        preferred = '상품목록 구성하기'
        if preferred in (xls.sheet_names or []):
            sheet_name = preferred
        else:
            for name in (xls.sheet_names or []):
                try:
                    df_probe = xls.parse(name, nrows=1)
                    cols = [str(c).strip() for c in df_probe.columns]
                    if 'date' in cols and 'productName' in cols:
                        sheet_name = name
                        break
                except Exception:
                    continue
            if not sheet_name and (xls.sheet_names or []):
                sheet_name = xls.sheet_names[0]

        df = xls.parse(sheet_name) if sheet_name else pd.DataFrame()
        if df is None or df.empty:
            return Response({'message': '엑셀 파일에 데이터가 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)

        df.columns = [str(c).strip() for c in df.columns]

        # Support common Korean column names by mapping them to canonical keys.
        col_aliases = {
            'date': ['일자', '날짜'],
            'machineNumber': ['기계번호', '기계'],
            'moldNumber': ['금형', '금형번호'],
            'productName': ['제품명', '품명', '상품명'],
            'productNameEng': ['제품명(영문)', '영문명'],
            'color1': ['색상', '색상1'],
            'color2': ['색상2'],
            'unit': ['단위(문자)', 'unit'],
            'quantity': ['생산수량', '수량'],
            'unitQuantity': ['단위', '단위수량'],
            'total': ['총계', '합계'],
            'status': ['상태'],
        }

        rename_map = {}
        existing_cols = set(df.columns)
        for canonical, aliases in col_aliases.items():
            if canonical in existing_cols:
                continue
            for alias in aliases:
                if alias in existing_cols:
                    rename_map[alias] = canonical
                    break
        if rename_map:
            df = df.rename(columns=rename_map)

        required_cols = ['date', 'machineNumber', 'moldNumber', 'productName']
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            return Response({'message': f"필수 컬럼이 없습니다: {', '.join(missing)}"}, status=status.HTTP_400_BAD_REQUEST)

        rows_processed = 0
        rows_added = 0
        rows_updated = 0
        from django.db import transaction
        with transaction.atomic():
            for _idx, row in df.iterrows():
                product_name = row.get('productName')
                if product_name is None or str(product_name).strip() == '':
                    continue

                dt = row.get('date')
                date_str = ''
                try:
                    if pd.isna(dt):
                        date_str = ''
                    else:
                        date_str = pd.to_datetime(dt).date().isoformat()
                except Exception:
                    date_str = str(dt).strip() if dt is not None else ''

                if not date_str:
                    continue

                def _to_int(v):
                    try:
                        if v is None or (isinstance(v, float) and pd.isna(v)):
                            return 0
                        if isinstance(v, str):
                            v = v.replace(',', '').strip()
                        return int(float(v))
                    except Exception:
                        return 0

                machine = str(row.get('machineNumber') or '').strip()
                mold = str(row.get('moldNumber') or '').strip()
                pname = str(product_name or '').strip()
                c1 = str(row.get('color1') or '').strip()
                c2 = str(row.get('color2') or '').strip()
                try:
                    date_obj = datetime.fromisoformat(date_str).date()
                except Exception:
                    continue

                qty = _to_int(row.get('quantity'))
                unit_qty = _to_int(row.get('unitQuantity')) or _to_int(row.get('unit'))
                total = _production_calc_total(qty, unit_qty, row.get('total'))
                status_value = _production_normalize_status(str(row.get('status') or 'pending'))

                defaults = {
                    'product_name_eng': str(row.get('productNameEng') or '').strip(),
                    'unit': str(row.get('unit') or '').strip(),
                    'quantity': qty,
                    'unit_quantity': unit_qty,
                    'total': total,
                    'status': status_value,
                }

                obj, created = ProductionLog.objects.update_or_create(
                    date=date_obj,
                    machine_number=machine,
                    mold_number=mold,
                    product_name=pname,
                    color1=c1,
                    color2=c2,
                    defaults=defaults,
                )
                _production_apply_status_model(obj, status_value)
                obj.total = _production_calc_total(obj.quantity, obj.unit_quantity, obj.total)
                obj.save()

                if created:
                    rows_added += 1
                else:
                    rows_updated += 1
                rows_processed += 1

        all_dates = list(ProductionLog.objects.values_list('date', flat=True).distinct().order_by('date'))
        latest_date = all_dates[-1].isoformat() if all_dates else None

        return Response({
            'success': True,
            'message': '생산 계획 파일을 업로드했습니다.',
            'rowsProcessed': rows_processed,
            'rowsAdded': rows_added,
            'rowsUpdated': rows_updated,
            'latestDate': latest_date,
        })
    except Exception as e:
        return Response({'message': '생산 계획 파일 처리 중 오류가 발생했습니다.', 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
def bulk_create_inventory(request):
    items = request.data
    if not isinstance(items, list):
        return Response({'error': 'Expected a list of items'}, status=status.HTTP_400_BAD_REQUEST)
    
    created_items = []
    for item_data in items:
        # Simple upsert logic based on name (or other unique key if available)
        # For now, we just create new ones or update if ID is provided
        try:
            if 'id' in item_data and item_data['id']:
                 item, created = InventoryItem.objects.update_or_create(
                    id=item_data['id'],
                    defaults=item_data
                )
            else:
                # If no ID, create new
                serializer = InventoryItemSerializer(data=item_data)
                if serializer.is_valid():
                    serializer.save()
                    created_items.append(serializer.data)
        except Exception as e:
            print(f"Error processing item: {e}")
            continue

    return Response({'message': f'Processed {len(items)} items'}, status=status.HTTP_201_CREATED)

from django.db import transaction

@api_view(['POST'])
def bulk_create_outbound(request):
    records = request.data
    if not isinstance(records, list):
        return Response({'error': 'Expected a list of records'}, status=status.HTTP_400_BAD_REQUEST)
    
    outbound_instances = []
    errors = []

    for record_data in records:
        try:
            # Manual mapping for speed and bulk_create compatibility
            # Assuming input keys match serializer fields exactly or close enough
            
            # Handle dates
            outbound_date = record_data.get('outbound_date')
            if not outbound_date:
                continue # Skip invalid dates

            instance = OutboundRecord(
                id=record_data.get('id') or str(uuid.uuid4()),
                product_name=record_data.get('product_name'),
                category=record_data.get('category'),
                quantity=record_data.get('quantity', 0),
                sales_amount=record_data.get('sales_amount', 0),
                outbound_date=outbound_date,
                status=record_data.get('status', '완료'),
                barcode=record_data.get('barcode'),
                box_quantity=record_data.get('box_quantity'),
                unit_count=record_data.get('unit_count'),
                notes=record_data.get('notes'),
                client=record_data.get('client') or ''
            )
            if len(outbound_instances) < 5:
                print(f"DEBUG BACKEND: Date={outbound_date}, SalesAmountInput={record_data.get('sales_amount')}, InstanceAmount={instance.sales_amount}")
            outbound_instances.append(instance)
        except Exception as e:
            errors.append(str(e))
            if len(errors) > 10: # Don't flood logs
                break
    
    if outbound_instances:
        # Fallback to simple loop since bulk_create is failing with SQLite driver issues
        # Use transaction to speed up loop
        total_created = 0
        try:
            with transaction.atomic():
                for instance in outbound_instances:
                    try:
                        instance.save()
                        total_created += 1
                    except Exception as e:
                        errors.append(str(e))
                        if len(errors) > 10:
                            break
        except Exception as e:
            errors.append(f"Transaction failed: {str(e)}")

    return Response({
        'message': f'Successfully created {total_created} records',
        'errors_sample': errors[:5] if errors else []
    }, status=status.HTTP_201_CREATED)

@api_view(['DELETE'])
def delete_outbound_by_date(request):
    start = request.query_params.get('start')
    end = request.query_params.get('end')
    
    if not start or not end:
        return Response({'error': 'Start and end dates are required'}, status=status.HTTP_400_BAD_REQUEST)
        
    try:
        count, _ = OutboundRecord.objects.filter(outbound_date__range=[start, end]).delete()
        return Response({'message': f'Deleted {count} records between {start} and {end}'})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
def outbound_sync(request):
    url = None
    if isinstance(request.data, dict):
        url = request.data.get('url')
    url = url or os.environ.get('OUTBOUND_GOOGLE_SHEET_URL')

    if not url:
        return Response({'error': 'OUTBOUND_GOOGLE_SHEET_URL is not set and no url was provided'}, status=status.HTTP_400_BAD_REQUEST)

    def parse_num(val):
        if val is None:
            return 0
        s = str(val).strip()
        if s == '':
            return 0
        s = s.replace(',', '')
        try:
            return float(s)
        except Exception:
            return 0

    def parse_date(val):
        s = ('' if val is None else str(val)).strip()
        if not s:
            return None
        for fmt in ('%Y-%m-%d', '%Y.%m.%d', '%Y/%m/%d', '%Y-%m-%d %H:%M:%S', '%Y/%m/%d %H:%M:%S'):
            try:
                return datetime.strptime(s, fmt).date()
            except Exception:
                pass
        try:
            dt = pd.to_datetime(s, errors='coerce')
            if pd.isna(dt):
                return None
            return dt.date()
        except Exception:
            return None

    try:
        df = pd.read_csv(url, dtype=str).fillna('')
    except Exception as e:
        return Response({'error': f'Failed to fetch/parse CSV: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

    if df.empty:
        return Response({'success': True, 'synced': 0, 'message': 'No rows found in sheet'}, status=status.HTTP_200_OK)

    cols = [str(c).strip() for c in df.columns]

    def find_col(candidates):
        for cand in candidates:
            for c in cols:
                if cand in c:
                    return c
        return None

    date_col = find_col(['일자', '출고일', 'date'])
    product_col = find_col(['품목', '상품명', 'product'])
    category_col = find_col(['분류', '카테고리', 'category'])
    barcode_col = find_col(['바코드', 'barcode'])
    box_col = find_col(['수량(박스)', '박스'])
    unit_col = find_col(['수량(낱개)', '낱개'])
    amount_col = find_col(['판매금액', '금액', '매출', 'amount'])
    notes_col = find_col(['비고', '메모', 'note'])
    client_col = find_col(['거래처', '고객', 'client'])

    if not date_col or not product_col:
        return Response({'error': 'Required columns not found', 'columns': cols}, status=status.HTTP_400_BAD_REQUEST)

    records = []
    dates = []
    now = timezone.now()

    for _, row in df.iterrows():
        outbound_date = parse_date(row.get(date_col))
        if not outbound_date:
            continue

        product_name = str(row.get(product_col) or '').strip()
        barcode = str(row.get(barcode_col) or '').strip() if barcode_col else ''
        if not product_name and not barcode:
            continue

        box_qty = int(parse_num(row.get(box_col))) if box_col else 0
        unit_qty = int(parse_num(row.get(unit_col))) if unit_col else 0
        sales_amount = parse_num(row.get(amount_col)) if amount_col else 0

        category = str(row.get(category_col) or '').strip() if category_col else ''
        client = str(row.get(client_col) or '').strip() if client_col else ''
        notes = str(row.get(notes_col) or '').strip() if notes_col else ''

        records.append(OutboundRecord(
            id=str(uuid.uuid4()),
            outbound_date=outbound_date,
            product_name=product_name or '-',
            category=category or '기타',
            barcode=barcode or None,
            quantity=box_qty,
            box_quantity=box_qty,
            unit_count=unit_qty,
            sales_amount=sales_amount,
            client=client,
            status='완료',
            notes=notes or None,
            created_at=now,
            updated_at=now,
        ))
        dates.append(outbound_date)

    if not records:
        return Response({'success': True, 'synced': 0, 'message': 'No valid records found'}, status=status.HTTP_200_OK)

    start = min(dates)
    end = max(dates)

    from django.db import transaction
    created = 0
    deleted = 0

    try:
        with transaction.atomic():
            deleted, _ = OutboundRecord.objects.filter(outbound_date__range=[start, end]).delete()
            try:
                OutboundRecord.objects.bulk_create(records, batch_size=5000)
                created = len(records)
            except Exception:
                for r in records:
                    r.save()
                    created += 1
    except Exception as e:
        return Response({'error': f'Sync failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    try:
        DataSource.objects.update_or_create(
            type='google_sheets',
            name='Google Sheets - outbound',
            defaults={
                'url': url,
                'is_active': True,
                'last_sync': timezone.now(),
                'sync_data': {
                    'source': 'outbound_sync',
                    'start': start.isoformat(),
                    'end': end.isoformat(),
                    'deleted': deleted,
                    'created': created,
                },
            }
        )
    except Exception:
        pass

    return Response({
        'success': True,
        'url': url,
        'start': start.isoformat(),
        'end': end.isoformat(),
        'deleted': deleted,
        'created': created,
        'updated': created,
        'synced': created,
        'timestamp': timezone.now().isoformat(),
    })


def _normalize_header(value: str) -> str:
    return (value or '').strip().lower().replace(' ', '').replace('\t', '').replace('\n', '')


def _find_header(headers, candidates):
    normalized = [_normalize_header(h) for h in headers]
    for cand in candidates:
        nc = _normalize_header(cand)
        for idx, h in enumerate(normalized):
            if nc and nc in h:
                return idx
    return None


def _parse_uploaded_csv(file_obj):
    raw = file_obj.read()
    try:
        text = raw.decode('utf-8-sig')
    except Exception:
        text = raw.decode('utf-8', errors='ignore')
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if any((c or '').strip() for c in r)]
    if not rows:
        return [], []
    headers = [c.strip() for c in rows[0]]
    body = [[c.strip() for c in r] for r in rows[1:]]
    return headers, body


def _process_inventory_csv_rows(headers, rows, now):
    name_idx = _find_header(headers, ['name', '상품명', '품목'])
    cat_idx = _find_header(headers, ['category', '카테고리', '분류'])
    stock_idx = _find_header(headers, ['current_stock', 'stock', '재고'])
    min_idx = _find_header(headers, ['minimum_stock', 'min', '최소'])
    barcode_idx = _find_header(headers, ['barcode', '바코드'])

    if name_idx is None:
        raise ValueError('CSV 헤더에 상품명이 필요합니다.')

    processed = 0
    for r in rows:
        name = (r[name_idx] if name_idx is not None and name_idx < len(r) else '').strip()
        if not name:
            continue
        category = (r[cat_idx] if cat_idx is not None and cat_idx < len(r) else '기타').strip() or '기타'
        current_stock = int(float((r[stock_idx] if stock_idx is not None and stock_idx < len(r) else 0) or 0))
        minimum_stock = int(float((r[min_idx] if min_idx is not None and min_idx < len(r) else 0) or 0))
        barcode = (r[barcode_idx] if barcode_idx is not None and barcode_idx < len(r) else '').strip() or None

        InventoryItem.objects.update_or_create(
            name=name,
            defaults={
                'category': category,
                'current_stock': current_stock,
                'minimum_stock': minimum_stock,
                'barcode': barcode,
                'updated_at': now,
            }
        )
        processed += 1

    return processed


def _process_outbound_csv_rows(headers, rows, now):
    date_idx = _find_header(headers, ['outbound_date', 'date', '일자', '출고일'])
    product_idx = _find_header(headers, ['product_name', 'product', '품목', '상품명'])
    category_idx = _find_header(headers, ['category', '분류', '카테고리'])
    barcode_idx = _find_header(headers, ['barcode', '바코드'])
    box_idx = _find_header(headers, ['수량(박스)', 'box', '박스'])
    unit_idx = _find_header(headers, ['수량(낱개)', 'unit', '낱개'])
    amount_idx = _find_header(headers, ['판매금액', 'sales_amount', 'amount', '금액', '매출'])
    notes_idx = _find_header(headers, ['비고', 'notes', '메모'])
    client_idx = _find_header(headers, ['거래처', 'client', '고객'])

    if date_idx is None or product_idx is None:
        raise ValueError('CSV 헤더에 일자/상품명이 필요합니다.')

    def parse_num(val):
        s = ('' if val is None else str(val)).strip().replace(',', '')
        if not s:
            return 0
        try:
            return float(s)
        except Exception:
            return 0

    def parse_date(val):
        s = ('' if val is None else str(val)).strip()
        if not s:
            return None
        for fmt in ('%Y-%m-%d', '%Y.%m.%d', '%Y/%m/%d', '%Y-%m-%d %H:%M:%S', '%Y/%m/%d %H:%M:%S'):
            try:
                return datetime.strptime(s, fmt).date()
            except Exception:
                pass
        try:
            dt = pd.to_datetime(s, errors='coerce')
            if pd.isna(dt):
                return None
            return dt.date()
        except Exception:
            return None

    instances = []
    dates = []
    for r in rows:
        outbound_date = parse_date(r[date_idx] if date_idx < len(r) else None)
        if not outbound_date:
            continue
        product_name = (r[product_idx] if product_idx < len(r) else '').strip()
        barcode = (r[barcode_idx] if barcode_idx is not None and barcode_idx < len(r) else '').strip() or None
        if not product_name and not barcode:
            continue

        category = (r[category_idx] if category_idx is not None and category_idx < len(r) else '').strip() or '기타'
        box_qty = int(parse_num(r[box_idx] if box_idx is not None and box_idx < len(r) else 0))
        unit_qty = int(parse_num(r[unit_idx] if unit_idx is not None and unit_idx < len(r) else 0))
        sales_amount = parse_num(r[amount_idx] if amount_idx is not None and amount_idx < len(r) else 0)
        notes = (r[notes_idx] if notes_idx is not None and notes_idx < len(r) else '').strip() or None
        client = (r[client_idx] if client_idx is not None and client_idx < len(r) else '').strip()

        instances.append(OutboundRecord(
            id=str(uuid.uuid4()),
            outbound_date=outbound_date,
            product_name=product_name or '-',
            category=category,
            barcode=barcode,
            quantity=box_qty,
            box_quantity=box_qty,
            unit_count=unit_qty,
            sales_amount=sales_amount,
            client=client,
            status='완료',
            notes=notes,
            created_at=now,
            updated_at=now,
        ))
        dates.append(outbound_date)

    if not instances:
        return 0

    start = min(dates)
    end = max(dates)

    from django.db import transaction
    with transaction.atomic():
        OutboundRecord.objects.filter(outbound_date__range=[start, end]).delete()
        try:
            OutboundRecord.objects.bulk_create(instances, batch_size=5000)
        except Exception:
            for inst in instances:
                inst.save()

    return len(instances)


@api_view(['POST'])
def upload_csv(request):
    if 'csv' not in request.FILES:
        return Response({'message': 'CSV 파일이 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)

    data_type = (request.data.get('type') or '').strip()
    if data_type not in ('inventory', 'outbound'):
        return Response({'message': '올바른 데이터 타입을 선택해주세요.'}, status=status.HTTP_400_BAD_REQUEST)

    file_obj = request.FILES['csv']
    headers, rows = _parse_uploaded_csv(file_obj)
    if not headers or not rows:
        return Response({'message': '빈 CSV 파일입니다.'}, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    try:
        if data_type == 'inventory':
            rows_processed = _process_inventory_csv_rows(headers, rows, now)
        else:
            rows_processed = _process_outbound_csv_rows(headers, rows, now)
    except ValueError as e:
        return Response({'message': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    DataSource.objects.create(
        type='csv',
        name=getattr(file_obj, 'name', '') or getattr(file_obj, 'original_name', '') or 'csv',
        is_active=True,
        last_sync=now,
        sync_data={'headers': headers, 'rowsProcessed': rows_processed}
    )

    return Response({
        'message': 'CSV 파일이 성공적으로 처리되었습니다.',
        'rowsProcessed': rows_processed,
    })


@api_view(['POST'])
def google_sheets_connect(request):
    url = (request.data.get('url') or '').strip()
    data_type = (request.data.get('type') or '').strip()
    if not url:
        return Response({'message': '구글 시트 URL이 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)
    if data_type not in ('inventory', 'outbound'):
        return Response({'message': '올바른 데이터 타입을 선택해주세요.'}, status=status.HTTP_400_BAD_REQUEST)

    m = None
    try:
        import re
        m = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', url)
    except Exception:
        m = None
    if not m:
        return Response({'message': '올바른 구글 시트 URL이 아닙니다.'}, status=status.HTTP_400_BAD_REQUEST)

    sheet_id = m.group(1)
    api_key = os.environ.get('GOOGLE_SHEETS_API_KEY') or os.environ.get('GOOGLE_API_KEY') or ''
    if not api_key:
        return Response({'message': 'Google Sheets API 키가 설정되지 않았습니다.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    range_name = 'A:Z'
    api_url = f'https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{range_name}?key={api_key}'

    try:
        with urllib.request.urlopen(api_url) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        return Response({'message': '구글 시트에서 데이터를 가져올 수 없습니다.', 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    values = payload.get('values') or []
    if not values:
        return Response({'message': '구글 시트에 데이터가 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)

    headers = [str(c).strip() for c in (values[0] or [])]
    rows = [[str(c).strip() for c in r] for r in values[1:]]

    now = timezone.now()
    try:
        if data_type == 'inventory':
            rows_processed = _process_inventory_csv_rows(headers, rows, now)
        else:
            rows_processed = _process_outbound_csv_rows(headers, rows, now)
    except ValueError as e:
        return Response({'message': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    ds, _created = DataSource.objects.update_or_create(
        type='google_sheets',
        name=f'Google Sheets - {data_type}',
        defaults={
            'url': url,
            'is_active': True,
            'last_sync': now,
            'sync_data': payload,
        }
    )

    return Response({
        'message': '구글 시트가 성공적으로 연결되었습니다.',
        'rowsProcessed': rows_processed,
        'dataSource': {
            'id': str(ds.id),
            'type': ds.type,
            'name': ds.name,
            'url': ds.url,
            'isActive': ds.is_active,
            'lastSync': ds.last_sync.isoformat() if ds.last_sync else None,
        }
    })


@api_view(['POST'])
def google_sheets_refresh(request, id: str):
    try:
        ds = DataSource.objects.get(id=id)
    except Exception:
        return Response({'message': '구글 시트 데이터 소스를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

    if ds.type != 'google_sheets' or not ds.url:
        return Response({'message': '구글 시트 데이터 소스를 찾을 수 없습니다.'}, status=status.HTTP_404_NOT_FOUND)

    data_type = 'inventory' if 'inventory' in (ds.name or '').lower() else 'outbound'

    now = timezone.now()
    try:
        import re
        m = re.search(r'/spreadsheets/d/([a-zA-Z0-9-_]+)', ds.url)
    except Exception:
        m = None
    if not m:
        return Response({'message': '올바른 구글 시트 URL이 아닙니다.'}, status=status.HTTP_400_BAD_REQUEST)

    sheet_id = m.group(1)
    api_key = os.environ.get('GOOGLE_SHEETS_API_KEY') or os.environ.get('GOOGLE_API_KEY') or ''
    if not api_key:
        return Response({'message': 'Google Sheets API 키가 설정되지 않았습니다.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    range_name = 'A:Z'
    api_url = f'https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}/values/{range_name}?key={api_key}'

    try:
        with urllib.request.urlopen(api_url) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        return Response({'message': '구글 시트에서 데이터를 가져올 수 없습니다.', 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    values = payload.get('values') or []
    if not values:
        return Response({'message': '구글 시트에 데이터가 없습니다.'}, status=status.HTTP_400_BAD_REQUEST)

    headers = [str(c).strip() for c in (values[0] or [])]
    rows = [[str(c).strip() for c in r] for r in values[1:]]

    try:
        if data_type == 'inventory':
            rows_processed = _process_inventory_csv_rows(headers, rows, now)
        else:
            rows_processed = _process_outbound_csv_rows(headers, rows, now)
    except ValueError as e:
        return Response({'message': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    ds.last_sync = now
    ds.is_active = True
    ds.sync_data = payload
    ds.save(update_fields=['last_sync', 'is_active', 'sync_data'])

    return Response({
        'message': '데이터가 성공적으로 새로고침되었습니다.',
        'lastSync': ds.last_sync.isoformat(),
        'rowsProcessed': rows_processed,
    })


@api_view(['GET'])
def outbound_date_range(request):
    meta = OutboundRecord.objects.aggregate(
        earliestDate=Min('outbound_date'),
        latestDate=Max('outbound_date'),
        totalRecords=Count('id'),
    )
    earliest = meta.get('earliestDate')
    latest = meta.get('latestDate')
    return Response({
        'success': True,
        'data': {
            'earliestDate': earliest.isoformat() if earliest else None,
            'latestDate': latest.isoformat() if latest else None,
            'hasData': bool(earliest and latest),
            'totalRecords': meta.get('totalRecords') or 0,
        }
    })


@api_view(['GET'])
def outbound_barcode_daily(request):
    start = request.query_params.get('startDate')
    end = request.query_params.get('endDate')
    days = request.query_params.get('days')

    qs = OutboundRecord.objects.all()
    if start and end:
        qs = qs.filter(outbound_date__range=[start, end])
    elif days:
        try:
            d = int(days)
        except Exception:
            d = 90
        since = timezone.localdate() - timedelta(days=d)
        qs = qs.filter(outbound_date__gte=since)

    qs = qs.exclude(barcode__isnull=True).exclude(barcode='')

    daily = qs.values('barcode', 'product_name', 'category', 'outbound_date').annotate(
        quantity=Coalesce(Sum('box_quantity'), 0),
        sales_amount=Coalesce(Sum('sales_amount'), Decimal('0')),
    ).order_by('barcode', 'outbound_date')

    grouped = {}
    total_records = 0
    for row in daily:
        total_records += 1
        bc = row['barcode']
        g = grouped.get(bc)
        if not g:
            g = {
                'barcode': bc,
                'productName': row.get('product_name') or '-',
                'category': row.get('category') or '-',
                'dailyData': [],
            }
            grouped[bc] = g
        g['dailyData'].append({
            'date': row['outbound_date'].isoformat() if row.get('outbound_date') else None,
            'quantity': int(row.get('quantity') or 0),
            'salesAmount': float(row.get('sales_amount') or 0),
        })

    data = []
    for bc, g in grouped.items():
        total_qty = sum(int(d.get('quantity') or 0) for d in g['dailyData'])
        days_count = len(g.get('dailyData') or [])
        avg_daily = (total_qty / float(days_count)) if days_count > 0 else 0.0
        g['totalOutbound'] = total_qty
        g['avgDaily'] = float(avg_daily)
        g['calculatedSettings'] = {
            'minStock': int(round(avg_daily * 3)),
            'maxStock': int(round(avg_daily * 30)),
            'reorderPoint': int(round(avg_daily * 3)),
        }
        data.append(g)

    return Response({
        'success': True,
        'data': data,
        'summary': {
            'totalRecords': total_records,
            'totalBarcodes': len(data),
        }
    })


@api_view(['GET'])
def outbound_daily_analysis(request):
    latest = OutboundRecord.objects.aggregate(latest=Max('outbound_date')).get('latest')
    if not latest:
        return Response({'insight': None})

    totals = OutboundRecord.objects.filter(outbound_date=latest).aggregate(
        totalSales=Sum('sales_amount'),
        totalQty=Sum('quantity'),
        totalCount=Count('id'),
    )
    insight = (
        f"### {latest.isoformat()} 출고 요약\n\n"
        f"- 총 건수: {totals.get('totalCount') or 0}건\n"
        f"- 총 박스수량: {int(totals.get('totalQty') or 0)}\n"
        f"- 총 매출: {float(totals.get('totalSales') or 0):,.0f}원\n"
    )
    return Response({'date': latest.isoformat(), 'insight': insight})


@api_view(['POST'])
def outbound_ai_analysis(request):
    summary_stats = request.data.get('summaryStats') if isinstance(request.data, dict) else None
    start_date = request.data.get('startDate') if isinstance(request.data, dict) else None
    end_date = request.data.get('endDate') if isinstance(request.data, dict) else None
    category = request.data.get('category') if isinstance(request.data, dict) else None
    search_query = request.data.get('searchQuery') if isinstance(request.data, dict) else None
    product = request.data.get('product') if isinstance(request.data, dict) else None

    total_sales = 0
    try:
        total_sales = float((summary_stats or {}).get('totalSales') or 0)
    except Exception:
        total_sales = 0

    if total_sales <= 0:
        return Response({'analysis': "### 데이터 부족\n\n분석할 데이터가 충분하지 않습니다. 데이터를 업로드하거나 동기화해주세요."})

    system_prompt = (
        "당신은 출고/매출 데이터 분석 전문가입니다. 한국어로만 답변하세요. "
        "답변은 마크다운 형식으로 작성하세요. "
        "데이터에 없는 내용은 추측하지 말고 '추가 데이터 필요'라고 명시하세요."
    )

    user_prompt = (
        "다음 조건의 출고 데이터를 요약 분석해 주세요.\n\n"
        f"- 기간: {start_date or '-'} ~ {end_date or '-'}\n"
        f"- 카테고리 필터: {category or 'all'}\n"
        f"- 검색어: {search_query or '-'}\n"
        f"- 선택 품목: {product or '-'}\n\n"
        "요약 지표:\n"
        f"- 총 매출: {total_sales:,.0f}원\n"
        f"- 총 박스수량: {float((summary_stats or {}).get('totalQty') or 0):,.0f}\n"
        f"- 주요 카테고리(추정): {((summary_stats or {}).get('topCategory') or '-') }\n\n"
        "아래 형식으로 작성하세요:\n"
        "1) 핵심 요약(3줄)\n"
        "2) 주요 인사이트(불릿 3~6개)\n"
        "3) 리스크/주의사항(있으면)\n"
        "4) 다음 액션 제안(2~4개)\n"
    )

    try:
        zai_text = _zai_call_messages(system=system_prompt, user=user_prompt, max_tokens=2048, temperature=0.2)
        if isinstance(zai_text, str) and zai_text.strip():
            return Response({'analysis': zai_text})
    except urllib.error.HTTPError as e:
        try:
            err_body = e.read().decode('utf-8')
        except Exception:
            err_body = ''
        return Response(
            {
                'analysis': (
                    "### AI 서버 응답 오류\n\n"
                    f"HTTP {getattr(e, 'code', '-')}: {getattr(e, 'reason', 'error')}\n\n"
                    f"(응답 본문 일부)\n\n{err_body[:800]}"
                )
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        return Response(
            {
                'analysis': (
                    "### AI 서버 연결 실패\n\n"
                    f"- 사유: {str(e)}\n\n"
                    "(환경변수/네트워크 상태를 확인하세요.)"
                )
            },
            status=status.HTTP_200_OK,
        )

    analysis = (
        f"### AI 분석 결과\n\n"
        f"현재 데이터(총 매출: {total_sales:,.0f}원)에 따르면 전반적인 출고량이 안정적인 추세를 보이고 있습니다.\n\n"
        f"**주요 인사이트:**\n"
        f"- 주말 대비 평일 출고량이 높을 가능성이 있습니다.\n"
        f"- 특정 카테고리의 매출 비중이 상승하고 있을 수 있습니다.\n\n"
        f"(이 분석은 현재 시뮬레이션된 결과입니다. 실제 AI 연동이 필요합니다.)"
    )
    return Response({'analysis': analysis})


@api_view(['POST'])
def ai_chat(request):
    question = (request.data.get('question') or '').strip() if isinstance(request.data, dict) else ''
    if not question:
        return Response({'answer': '질문을 입력해주세요.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'answer': f"현재는 AI 연동 전입니다. 질문: {question}"})


@api_view(['POST'])
def ai_analyze(request):
    payload = request.data if isinstance(request.data, dict) else {}
    data = payload.get('data') if isinstance(payload.get('data'), dict) else {}

    date = data.get('date')
    day_of_week = data.get('dayOfWeek')
    total = data.get('total')
    average_total = data.get('averageTotal')
    current_hour = data.get('currentHour')
    data_cutoff_hour = data.get('dataCutoffHour')
    data_lag_hours = data.get('dataLagHours')
    current_cum_at_hour = data.get('currentCumAtHour')
    current_inc_at_hour = data.get('currentIncAtHour')
    recent_inc_trend = data.get('recentIncTrend') if isinstance(data.get('recentIncTrend'), list) else None
    comparison = data.get('comparison') if isinstance(data.get('comparison'), dict) else None
    weekday_profile = data.get('weekdayProfile') if isinstance(data.get('weekdayProfile'), dict) else None
    weekday_hourly_inc_profile = data.get('weekdayHourlyIncProfile') if isinstance(data.get('weekdayHourlyIncProfile'), dict) else None
    ai_predictions = data.get('aiPredictions') if isinstance(data.get('aiPredictions'), dict) else None
    special_notes = data.get('specialNotes') if isinstance(data.get('specialNotes'), list) else None

    try:
        total_val = int(float(str(total).replace(',', ''))) if total is not None else 0
    except Exception:
        total_val = 0

    try:
        avg_val = int(float(str(average_total).replace(',', ''))) if average_total is not None else 0
    except Exception:
        avg_val = 0

    try:
        current_hour_int = int(current_hour) if current_hour is not None else None
    except Exception:
        current_hour_int = None

    try:
        data_cutoff_hour_int = int(data_cutoff_hour) if data_cutoff_hour is not None else None
    except Exception:
        data_cutoff_hour_int = None

    try:
        data_lag_hours_int = int(data_lag_hours) if data_lag_hours is not None else None
    except Exception:
        data_lag_hours_int = None

    if current_hour_int is None:
        try:
            current_hour_int = int(timezone.localtime(timezone.now()).hour)
        except Exception:
            current_hour_int = None

    analysis_hour_int = data_cutoff_hour_int if data_cutoff_hour_int is not None else current_hour_int

    def _to_int_or_none(v):
        if v is None:
            return None
        try:
            return int(float(str(v).replace(',', '')))
        except Exception:
            return None

    cur_cum_int = _to_int_or_none(current_cum_at_hour)
    cur_inc_int = _to_int_or_none(current_inc_at_hour)

    fallback_expected_cum = None
    fallback_expected_inc = None
    if analysis_hour_int is not None and analysis_hour_int >= 0 and avg_val > 0:
        try:
            progress = max(0.0, min(1.0, float(analysis_hour_int) / 23.0))
            fallback_expected_cum = int(round(avg_val * progress))
            fallback_expected_inc = int(round(avg_val / 23.0))
        except Exception:
            fallback_expected_cum = None
            fallback_expected_inc = None

    diff = total_val - avg_val
    diff_pct = (diff / avg_val * 100) if avg_val else 0

    predicted_23 = None
    if ai_predictions:
        try:
            predicted_23 = ai_predictions.get('hour_23')
            if predicted_23 is not None:
                predicted_23 = int(float(str(predicted_23).replace(',', '')))
        except Exception:
            predicted_23 = None

    def _fmt(v):
        if v is None:
            return '-'
        try:
            return f"{int(v):,}"
        except Exception:
            return str(v)

    def _baseline_block(label, b):
        if not isinstance(b, dict):
            return f"- {label}: 데이터 없음\n"

        sample = b.get('sampleCount')
        avg_cum = _to_int_or_none(b.get('avgCumAtHour'))
        avg_inc = _to_int_or_none(b.get('avgIncAtHour'))
        avg_final = _to_int_or_none(b.get('avgFinal'))

        by_period_cum = b.get('byPeriodCumAtHour') if isinstance(b.get('byPeriodCumAtHour'), dict) else {}
        by_period_final = b.get('byPeriodFinal') if isinstance(b.get('byPeriodFinal'), dict) else {}

        def _period_line(title, src):
            s = _to_int_or_none(src.get('start'))
            m = _to_int_or_none(src.get('mid'))
            e = _to_int_or_none(src.get('end'))
            return f"  - {title}: 월초 {_fmt(s)} / 월중 {_fmt(m)} / 월말 {_fmt(e)}\n"

        out = (
            f"- {label} (표본 {sample or 0}일):\n"
            f"  - 동시간대 누적 평균: {_fmt(avg_cum)}\n"
            f"  - 동시간대 시간증감 평균: {_fmt(avg_inc)}\n"
            f"  - 최종(23시) 누적 평균: {_fmt(avg_final)}\n"
        )
        out += _period_line('동시간대 누적 평균(월초/중/말)', by_period_cum)
        out += _period_line('최종(23시) 누적 평균(월초/중/말)', by_period_final)
        return out

    def _weekday_profile_block(p):
        if not isinstance(p, dict):
            return "- 요일별 프로필: 데이터 없음\n"

        day_names = {
            0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토'
        }

        lines = ["- 요일별 프로필(최근 데이터):"]
        for dow in range(0, 7):
            item = p.get(str(dow)) if str(dow) in p else p.get(dow)
            if not isinstance(item, dict):
                lines.append(f"  - {day_names.get(dow, str(dow))}: 데이터 없음")
                continue

            sc = _to_int_or_none(item.get('sampleCount'))
            avg_cum = _to_int_or_none(item.get('avgCumAtHour'))
            avg_fin = _to_int_or_none(item.get('avgFinal'))
            lines.append(
                f"  - {day_names.get(dow, str(dow))}: 표본 {sc or 0}일 / 동시간대 누적 {_fmt(avg_cum)} / 최종 {_fmt(avg_fin)}"
            )
        return "\n".join(lines) + "\n"

    def _weekday_hourly_inc_summary(p):
        if not isinstance(p, dict):
            return "- 요일×시간대 증감 프로필: 데이터 없음\n"

        by_dow = p.get('byDow') if isinstance(p.get('byDow'), dict) else None
        if not isinstance(by_dow, dict):
            return "- 요일×시간대 증감 프로필: 데이터 없음\n"

        def _get_bucket(dow):
            b = by_dow.get(str(dow)) if str(dow) in by_dow else by_dow.get(dow)
            return b if isinstance(b, dict) else {}

        def _avg_inc(bucket, hours, min_hour_samples=3):
            vals = []
            used = 0
            for h in hours:
                key = str(int(h))
                item = bucket.get(key)
                if not isinstance(item, dict):
                    continue
                sc = _to_int_or_none(item.get('sampleCount')) or 0
                inc = _to_int_or_none(item.get('avgInc'))
                if sc >= min_hour_samples and inc is not None:
                    vals.append(int(inc))
                    used += 1
            if not vals:
                return None, 0
            return int(round(sum(vals) / len(vals))), used

        # late: 17~23, mid: 12~16
        fri_bucket = _get_bucket(5)
        mid_avg, mid_used = _avg_inc(fri_bucket, range(12, 17))
        late_avg, late_used = _avg_inc(fri_bucket, range(17, 24))

        out = ["- 금요일 시간대별 증감 요약(근거 기반):"]
        out.append(f"  - 중반(12~16시) 평균 증감: {_fmt(mid_avg)} (유효시간 {mid_used}/5)")
        out.append(f"  - 후반(17~23시) 평균 증감: {_fmt(late_avg)} (유효시간 {late_used}/7)")
        if mid_avg is not None and late_avg is not None:
            out.append(f"  - 후반-중반 차이: {late_avg - mid_avg:+,}")
        else:
            out.append("  - (주의) 표본/유효시간 부족으로 후반 둔화 여부 단정 불가")

        return "\n".join(out) + "\n"

    same8w = comparison.get('sameWeekday8w') if isinstance(comparison, dict) else None
    prev_month = comparison.get('prevMonthSameWeekday') if isinstance(comparison, dict) else None

    trend_lines = []
    if recent_inc_trend:
        for item in recent_inc_trend[-3:]:
            if isinstance(item, dict):
                h = _to_int_or_none(item.get('hour'))
                inc = _to_int_or_none(item.get('inc'))
                if h is not None and inc is not None:
                    trend_lines.append(f"- {h}시 증감: {inc:,}")

    system_prompt = (
        "당신은 주문 데이터 분석 전문가입니다. 한국어로만 답변하세요. "
        "답변은 10줄 이하로 간결하게 작성하세요. "
        "시간 해석 규칙: currentHour는 '현재 시각', dataCutoffHour는 '실제 데이터가 확정(입력/집계)된 마지막 시각'입니다. "
        "동시간대 비교/증감/최근 추이는 반드시 dataCutoffHour 기준으로만 수행하세요(추측 금지). "
        "dataLagHours>0 또는 dataCutoffHour < currentHour 인 경우, 아직 집계 전 시간대가 존재할 수 있으므로 0/None 증감을 '주문 증가 멈춤'으로 단정하지 마세요. "
        "입력 지연/시스템 오류 등의 원인을 추정하지 말고, 필요한 경우 '집계/입력 현황 확인 필요'로만 표현하세요. "
        "단, dataLagHours가 1인 경우는 일반적인 1시간 입력/집계 지연일 수 있으므로 별도 이슈로 강조하지 마세요(요청한 형식의 5번 문장에서 언급하지 말 것). "
        "dataLagHours가 2 이상이거나(또는 cutoff이 비정상적으로 낮음) 데이터 공백이 명확할 때만 '확인 필요'로 1줄 언급하세요. "
        "비교는 '동시간대 누적'과 '동시간대 증감'을 최우선으로 사용하고, '최종(23시) 평균'은 별도로 분리해서 언급하세요. "
        "단, 기준선/표본이 부족해도 '분석 불가/불가능'이라고 단정하지 말고, 가능한 범위에서 최선의 분석을 제시하세요(부족한 정보는 명시). "
        "comparison(최근8주/이전월 기준선)이 비어있으면 [폴백 기준]을 사용해 '근사 비교'를 수행하세요. "
        "weekdayProfile이 제공되면, '요일별 패턴(예: 일/월 높고 금 낮음)'을 avgCumAtHour(동시간대 누적) 기준으로만 1줄 언급할 수 있습니다. 표본이 적으면 단정하지 말고 '경향'으로 표현하세요. "
        "weekdayHourlyIncProfile이 제공되면, 금요일 후반 시간대(17~23시) 증감이 줄어드는지 여부를 이 데이터에서만 근거로 1줄 언급할 수 있습니다(근거 없으면 언급 금지). "
        "데이터에 없는 내용은 추측하지 말고 확인이 필요하다고 말하세요."
    )

    user_prompt = (
        "현재 주문(누적) 데이터를 '동시간대 기준'으로 비교 분석하여 리포트를 작성해주세요.\n\n"
        f"- 날짜: {date or '-'}\n"
        f"- 요일: {day_of_week or '-'}\n"
        f"- currentHour(현재 시각): {current_hour_int if current_hour_int is not None else '-'}\n"
        f"- dataCutoffHour(확정 데이터 기준 시각): {analysis_hour_int if analysis_hour_int is not None else '-'}\n"
        f"- dataLagHours: {data_lag_hours_int if data_lag_hours_int is not None else '-'}\n"
        f"- 현재 누적(마지막 입력 기준): {total_val:,}건\n"
        f"- 동시간대 누적(dataCutoffHour 기준): {_fmt(cur_cum_int)}건\n"
        f"- 동시간대 시간증감(dataCutoffHour 기준): {_fmt(cur_inc_int)}건\n"
        f"- AI 예측 23시 최종 누적: {_fmt(predicted_23)}건\n\n"
        "[폴백 기준(기준선 부족 시 사용)]\n"
        "- 참고 averageTotal(최종 누적 평균일 가능성): " + f"{avg_val:,}" + "\n"
        "- (근사) 동시간대 기대 누적: " + f"{_fmt(fallback_expected_cum)}" + "\n"
        "- (근사) 시간당 평균 증가량: " + f"{_fmt(fallback_expected_inc)}" + "\n\n"
        "[비교 기준 요약]\n"
        "(주의) '동일 요일 평균(averageTotal)'은 과거 최종 누적 기반일 수 있으므로 참고용으로만 사용하세요.\n"
        f"- 참고 averageTotal: {avg_val:,}\n\n"
        "[동시간대/최종 기준선]\n"
        + _baseline_block('같은 요일 최근 8주', same8w)
        + _baseline_block('같은 요일 이전 월', prev_month)
        + "\n[요일별 프로필(패턴 검증)]\n"
        + _weekday_profile_block(weekday_profile)
        + "\n[금요일 후반 둔화 검증(요일×시간대 증감)]\n"
        + _weekday_hourly_inc_summary(weekday_hourly_inc_profile)
        + "\n"
        + ("[최근 3시간 증감 추이]\n" + "\n".join(trend_lines) + "\n\n" if trend_lines else "")
        + "아래 형식으로 6~10줄로 작성하세요:\n"
        + "1) 동시간대 기준 현재 상황(최근 8주 평균 대비)\n"
        + "2) 이전 월/월초·월중·월말 기준과의 차이(있으면 1줄)\n"
        + "3) 최근 증감 추이(가속/감속 여부)\n"
        + "4) 최종 예측(23시)과 최종 평균 비교\n"
        + "5) 요일 패턴(weekdayProfile, avgCumAtHour 기준) 또는 금요일 후반 둔화 여부(weekdayHourlyIncProfile 근거 있을 때만)\n"
    )

    if special_notes:
        lines = []
        for n in special_notes[:20]:
            if not isinstance(n, dict):
                continue
            dt = (n.get('event_datetime') or n.get('eventDateTime') or '').strip() if isinstance(n.get('event_datetime') or n.get('eventDateTime'), str) else ''
            pname = (n.get('product_name') or n.get('productName') or '').strip() if isinstance(n.get('product_name') or n.get('productName'), str) else ''
            barcode = (n.get('barcode') or '').strip() if isinstance(n.get('barcode'), str) else ''
            sku = (n.get('sku_id') or n.get('skuId') or '').strip() if isinstance(n.get('sku_id') or n.get('skuId'), str) else ''
            memo = (n.get('memo') or n.get('text') or '').strip() if isinstance(n.get('memo') or n.get('text'), str) else ''
            qty = n.get('quantity')
            try:
                qty_str = f"{int(float(str(qty).replace(',', ''))):,}" if qty is not None and str(qty).strip() != '' else '-'
            except Exception:
                qty_str = str(qty) if qty is not None else '-'
            parts = []
            if dt:
                parts.append(dt)
            if pname:
                parts.append(pname)
            if barcode:
                parts.append(f"barcode:{barcode}")
            if sku:
                parts.append(f"sku:{sku}")
            parts.append(f"qty:{qty_str}")
            if memo:
                parts.append(memo)
            if parts:
                lines.append("- " + " / ".join(parts))
        if lines:
            user_prompt += "\n[특이사항 메모(업무 컨텍스트)]\n" + "\n".join(lines) + "\n"

    try:
        zai_text = _zai_call_messages(system=system_prompt, user=user_prompt, max_tokens=800, temperature=0.3)
        if isinstance(zai_text, str) and zai_text.strip():
            return Response({'success': True, 'insight': zai_text}, status=status.HTTP_200_OK)
    except Exception:
        pass

    insight = (
        f"## AI 분석 (간이)\n\n"
        f"- 기준일: {date or '-'} ({day_of_week or '-'})\n"
        f"- 현재 누적: {total_val:,}\n"
        f"- 동요일 평균: {avg_val:,}\n"
        f"- 평균 대비: {diff:+,} ({diff_pct:+.1f}%)\n"
    )

    if predicted_23 is not None:
        insight += f"- 23시 예측: {predicted_23:,}\n"

    insight += (
        "\n### 해석\n\n"
        "- 0(미입력) 구간은 예측값으로 보완됩니다.\n"
        "- 실제 값이 업데이트되면 예측/분석이 다시 계산됩니다.\n"
    )

    return Response({'success': True, 'insight': insight}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
def delivery_notes(request):
    if request.method == 'GET':
        date_str = (request.query_params.get('date') or '').strip()
        if not date_str:
            return Response({'success': False, 'message': 'date query param required'}, status=status.HTTP_400_BAD_REQUEST)
        qs = DeliverySpecialNote.objects.filter(date=date_str).order_by('-event_datetime', '-created_at')
        return Response({'success': True, 'data': DeliverySpecialNoteSerializer(qs, many=True).data})

    payload = request.data if isinstance(request.data, dict) else {}
    date_str = (payload.get('date') or '').strip()
    if not date_str:
        return Response({'success': False, 'message': 'date required'}, status=status.HTTP_400_BAD_REQUEST)

    event_dt_raw = payload.get('event_datetime') if 'event_datetime' in payload else payload.get('eventDateTime')
    event_dt = None
    if isinstance(event_dt_raw, str) and event_dt_raw.strip():
        try:
            event_dt = datetime.fromisoformat(event_dt_raw.strip())
        except Exception:
            event_dt = None

    quantity = payload.get('quantity')
    qty_val = None
    if quantity is not None and str(quantity).strip() != '':
        try:
            qty_val = int(float(str(quantity).replace(',', '')))
        except Exception:
            qty_val = None

    note = DeliverySpecialNote.objects.create(
        date=date_str,
        event_datetime=event_dt,
        product_name=str(payload.get('product_name') or payload.get('productName') or '').strip(),
        barcode=(str(payload.get('barcode')).strip() if payload.get('barcode') is not None else None) or None,
        sku_id=str(payload.get('sku_id') or payload.get('skuId') or '').strip(),
        quantity=qty_val,
        memo=str(payload.get('memo') or payload.get('text') or '').strip(),
    )
    return Response({'success': True, 'data': DeliverySpecialNoteSerializer(note).data}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
def ai_predict_hourly(request):
    payload = request.data if isinstance(request.data, dict) else {}

    base_predictions = payload.get('basePredictions')
    if isinstance(base_predictions, dict) and base_predictions:
        return Response({'success': True, 'predictions': base_predictions}, status=status.HTTP_200_OK)

    current_hour = payload.get('currentHour')
    current_data = payload.get('currentData') if isinstance(payload.get('currentData'), dict) else {}
    total = current_data.get('total', 0)

    try:
        current_hour_int = int(current_hour)
    except Exception:
        current_hour_int = 0

    try:
        total_int = int(float(str(total).replace(',', '')))
    except Exception:
        total_int = 0

    remaining_hours = max(0, 23 - current_hour_int)
    predicted_total = total_int + (remaining_hours * 10)

    return Response({
        'success': True,
        'predictions': {
            'hour_23': predicted_total,
        }
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
def get_outbound_meta(request):
    meta = OutboundRecord.objects.aggregate(
        earliestDate=Min('outbound_date'),
        latestDate=Max('outbound_date'),
    )

    earliest = meta.get('earliestDate')
    latest = meta.get('latestDate')

    return Response({
        'earliestDate': earliest.isoformat() if earliest else None,
        'latestDate': latest.isoformat() if latest else None,
    })

@api_view(['GET'])
def get_outbound_stats(request):
    start = request.query_params.get('start') or request.query_params.get('startDate')
    end = request.query_params.get('end') or request.query_params.get('endDate')
    group_by = request.query_params.get('groupBy', 'day')
    category = request.query_params.get('category')
    search = request.query_params.get('search')
    product = request.query_params.get('product')

    queryset = OutboundRecord.objects.all()

    if start:
        queryset = queryset.filter(outbound_date__gte=start)
    if end:
        queryset = queryset.filter(outbound_date__lte=end)
    
    if category and category != 'all':
        if category == '__others__':
            top_cats = list(
                queryset.values('category')
                .annotate(salesAmount=Sum('sales_amount'))
                .order_by('-salesAmount')
                .values_list('category', flat=True)[:10]
            )
            if top_cats:
                queryset = queryset.exclude(category__in=top_cats)
        else:
            queryset = queryset.filter(category=category)
    if search:
        queryset = queryset.filter(product_name__icontains=search)
    if product:
        queryset = queryset.filter(product_name=product)

    # 1. Summary
    summary = queryset.aggregate(
        totalCount=Count('id'),
        totalQuantity=Coalesce(Sum('box_quantity'), 0),
        totalSalesAmount=Coalesce(Sum('sales_amount'), Decimal('0'))
    )

    # 2. Daily Trend (Group By)
    # SQLite supports TruncDate, TruncMonth etc.
    trunc_func = TruncDay
    if group_by == 'week':
        trunc_func = TruncWeek
    elif group_by == 'month':
        trunc_func = TruncMonth
    
    daily_trend = queryset.annotate(
        date=trunc_func('outbound_date')
    ).values('date').annotate(
        quantity=Coalesce(Sum('box_quantity'), 0),
        salesAmount=Coalesce(Sum('sales_amount'), Decimal('0'))
    ).order_by('date')

    # Format date for frontend
    trend_data = []
    for item in daily_trend:
        if item['date']:
            trend_data.append({
                'date': item['date'].strftime('%Y-%m-%d'),
                'quantity': item['quantity'] or 0,
                'salesAmount': item['salesAmount'] or 0
            })

    # 3. Category Breakdown
    category_breakdown = queryset.values('category').annotate(
        quantity=Coalesce(Sum('box_quantity'), 0),
        salesAmount=Coalesce(Sum('sales_amount'), Decimal('0'))
    ).order_by('-salesAmount')

    return Response({
        'summary': {
            'totalCount': summary['totalCount'] or 0,
            'totalQuantity': summary['totalQuantity'] or 0,
            'totalSalesAmount': summary['totalSalesAmount'] or 0
        },
        'dailyTrend': trend_data,
        'categoryBreakdown': category_breakdown
    })


@api_view(['GET'])
def get_outbound_top_products(request):
    start = request.query_params.get('start') or request.query_params.get('startDate')
    end = request.query_params.get('end') or request.query_params.get('endDate')
    category = request.query_params.get('category')
    search = request.query_params.get('search')
    product = request.query_params.get('product')
    try:
        limit = int(request.query_params.get('limit') or 100)
    except Exception:
        limit = 100
    limit = max(1, min(limit, 500))

    queryset = OutboundRecord.objects.all()
    if start:
        queryset = queryset.filter(outbound_date__gte=start)
    if end:
        queryset = queryset.filter(outbound_date__lte=end)
    if category and category != 'all':
        if category == '__others__':
            top_cats = list(
                queryset.values('category')
                .annotate(salesAmount=Sum('sales_amount'))
                .order_by('-salesAmount')
                .values_list('category', flat=True)[:10]
            )
            if top_cats:
                queryset = queryset.exclude(category__in=top_cats)
        else:
            queryset = queryset.filter(category=category)
    if search:
        queryset = queryset.filter(product_name__icontains=search)
    if product:
        queryset = queryset.filter(product_name=product)

    rows = queryset.values('product_name').annotate(
        quantity=Coalesce(Sum('box_quantity'), 0),
        salesAmount=Coalesce(Sum('sales_amount'), Decimal('0')),
    ).order_by('-quantity')[:limit]

    return Response([
        {
            'name': r.get('product_name') or '-',
            'quantity': r.get('quantity') or 0,
            'salesAmount': r.get('salesAmount') or 0,
        }
        for r in rows
    ])


@api_view(['GET'])
def get_outbound_pivot(request):
    start = request.query_params.get('start') or request.query_params.get('startDate')
    end = request.query_params.get('end') or request.query_params.get('endDate')
    row = request.query_params.get('row', 'category')
    group_by = request.query_params.get('groupBy', 'day')
    category = request.query_params.get('category')
    search = request.query_params.get('search')
    product = request.query_params.get('product')
    try:
        limit = int(request.query_params.get('limit') or 100)
    except Exception:
        limit = 100
    limit = max(1, min(limit, 500))

    if row not in ['category', 'product']:
        return Response({'message': 'row must be category or product'}, status=status.HTTP_400_BAD_REQUEST)
    if group_by not in ['day', 'week', 'month']:
        return Response({'message': 'groupBy must be day, week, or month'}, status=status.HTTP_400_BAD_REQUEST)

    queryset = OutboundRecord.objects.all()
    if start:
        queryset = queryset.filter(outbound_date__gte=start)
    if end:
        queryset = queryset.filter(outbound_date__lte=end)
    if category and category != 'all':
        if category == '__others__':
            top_cats = list(
                queryset.values('category')
                .annotate(salesAmount=Sum('sales_amount'))
                .order_by('-salesAmount')
                .values_list('category', flat=True)[:10]
            )
            if top_cats:
                queryset = queryset.exclude(category__in=top_cats)
        else:
            queryset = queryset.filter(category=category)
    if search:
        queryset = queryset.filter(product_name__icontains=search)
    if product:
        queryset = queryset.filter(product_name=product)

    trunc_func = TruncDay
    if group_by == 'week':
        trunc_func = TruncWeek
    elif group_by == 'month':
        trunc_func = TruncMonth

    row_field = 'category' if row == 'category' else 'product_name'

    if row_field == 'product_name' and not product:
        top_products = list(
            queryset.values('product_name')
            .annotate(salesAmount=Sum('sales_amount'))
            .order_by('-salesAmount')
            .values_list('product_name', flat=True)[:limit]
        )
        if top_products:
            queryset = queryset.filter(product_name__in=top_products)
    grouped = (
        queryset.annotate(date=trunc_func('outbound_date'))
        .values(row_field, 'date')
        .annotate(
            quantity=Coalesce(Sum('box_quantity'), 0),
            salesAmount=Coalesce(Sum('sales_amount'), Decimal('0')),
        )
        .order_by(row_field, 'date')
    )

    pivot = {}
    for item in grouped:
        key = item.get(row_field) or '-'
        date_val = item.get('date')
        if not date_val:
            continue
        date_key = date_val.strftime('%Y-%m-%d')
        if key not in pivot:
            pivot[key] = {'values': {}, 'total': {'quantity': 0, 'salesAmount': 0}}

        q = item.get('quantity') or 0
        s = item.get('salesAmount') or 0

        pivot[key]['values'][date_key] = {
            'quantity': q,
            'salesAmount': s,
        }
        pivot[key]['total']['quantity'] += q
        pivot[key]['total']['salesAmount'] += s

    rows = [
        {
            'key': key,
            'values': data['values'],
            'total': data['total'],
        }
        for key, data in pivot.items()
    ]
    rows.sort(key=lambda r: (r.get('total', {}).get('salesAmount', 0) or 0), reverse=True)
    return Response(rows)

import openpyxl
import io
import csv
import zipfile

@api_view(['POST'])
def parse_excel_delivery(request):
    if 'file' not in request.FILES:
        return Response({'error': 'No file uploaded'}, status=status.HTTP_400_BAD_REQUEST)
    
    file_obj = request.FILES['file']
    
    try:
        # Read file into BytesIO
        file_content = file_obj.read()
        
        if len(file_content) == 0:
             return Response({'error': 'Empty file'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            wb = openpyxl.load_workbook(io.BytesIO(file_content), data_only=True)
            sheet = wb.active
            rows = []
            for row in sheet.iter_rows(values_only=True):
                cleaned_row = [str(cell) if cell is not None else '' for cell in row]
                rows.append(cleaned_row)
        except (zipfile.BadZipFile, OSError) as e:
            # Fallback to CSV parsing
            try:
                # Decode bytes to string (assume utf-8, fallback to cp949/euc-kr if needed)
                try:
                    text_content = file_content.decode('utf-8')
                except UnicodeDecodeError:
                    text_content = file_content.decode('cp949')
                
                csv_reader = csv.reader(io.StringIO(text_content))
                rows = list(csv_reader)
            except Exception as csv_e:
                raise e # Re-raise original Excel error if CSV also fails

        return Response({'rows': rows})
    except Exception as e:
        return Response({'error': f"Failed to parse file: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _normalize_stock_status(current_stock: int, minimum_stock: int) -> str:
    if current_stock <= 0:
        return 'critical'
    if current_stock <= minimum_stock:
        return 'low'
    max_stock = (minimum_stock or 0) * 3
    if max_stock > 0 and current_stock > max_stock:
        return 'high'
    return 'normal'


def _order_recommendation(stock_status: str) -> str:
    if stock_status == 'critical':
        return '즉시 발주'
    if stock_status == 'low':
        return '발주 권장'
    if stock_status == 'high':
        return '과재고'
    return '적정'


@api_view(['GET'])
def inventory_integrated(request):
    search = (request.query_params.get('search') or '').strip()
    stock_status = (request.query_params.get('stockStatus') or '').strip()

    all_qs = InventoryItem.objects.all()
    qs = all_qs.order_by('name')
    if search:
        qs = qs.filter(
            models.Q(name__icontains=search)
            | models.Q(category__icontains=search)
            | models.Q(barcode__icontains=search)
        )

    items = []
    for item in qs:
        current_stock = int(item.current_stock or 0)
        min_stock = int(item.minimum_stock or 0)
        max_stock = min_stock * 3
        computed_status = _normalize_stock_status(current_stock, min_stock)
        is_order_required = computed_status in ('critical', 'low')

        payload = {
            'id': str(item.id),
            'productName': item.name,
            'barcode': item.barcode or None,
            'currentStock': current_stock,
            'minStock': min_stock,
            'maxStock': max_stock,
            'stockStatus': computed_status,
            'reliability': 100,
            'location': '창고 A',
            'category': item.category,
            'lastUpdated': item.updated_at.isoformat() if item.updated_at else None,
            'orderRecommendation': _order_recommendation(computed_status),
            'isOrderRequired': is_order_required,
            'hasInventoryData': True,
            'inventoryId': str(item.id),
            'hasBarcodeMaster': bool(item.barcode),
            'createdAt': item.created_at.isoformat() if item.created_at else timezone.now().isoformat(),
            'updatedAt': item.updated_at.isoformat() if item.updated_at else timezone.now().isoformat(),
        }

        if stock_status:
            if stock_status == 'order_required' and not is_order_required:
                continue
            if stock_status in ('critical', 'low', 'normal', 'high') and payload['stockStatus'] != stock_status:
                continue
            if stock_status == 'no_barcode' and payload['barcode']:
                continue

        items.append(payload)

    summary = {
        'totalItems': all_qs.count(),
        'filteredItems': len(items),
        'orderRequired': sum(1 for i in items if i['isOrderRequired']),
        'criticalStock': sum(1 for i in items if i['stockStatus'] == 'critical'),
        'lowStock': sum(1 for i in items if i['stockStatus'] == 'low'),
        'highStock': sum(1 for i in items if i['stockStatus'] == 'high'),
        'withoutBarcode': sum(1 for i in items if not i['barcode']),
        'withInventoryData': len(items),
    }

    return Response({
        'items': items,
        'summary': summary,
        'message': '재고 데이터를 성공적으로 불러왔습니다.'
    })


def _decode_bytes(data: bytes) -> str:
    try:
        return data.decode('utf-8').replace('\ufeff', '')
    except UnicodeDecodeError:
        return data.decode('cp949').replace('\ufeff', '')


@api_view(['POST'])
def inventory_import_csv(request):
    files = request.FILES.getlist('csv')
    if not files:
        return Response({'message': '파일이 필요합니다.'}, status=status.HTTP_400_BAD_REQUEST)

    total_processed = 0
    for file_obj in files:
        content = _decode_bytes(file_obj.read())
        reader = csv.reader(io.StringIO(content))
        rows = list(reader)
        if len(rows) < 2:
            continue
        headers = [h.strip() for h in rows[0]]
        normalized = [h.lower().replace(' ', '') for h in headers]

        name_idx = next((i for i, h in enumerate(normalized) if 'name' in h or '상품명' in h or '품목' in h), -1)
        cat_idx = next((i for i, h in enumerate(normalized) if 'category' in h or '분류' in h or '카테고리' in h), -1)
        stock_idx = next((i for i, h in enumerate(normalized) if 'stock' in h or '재고' in h), -1)
        barcode_idx = next((i for i, h in enumerate(normalized) if 'barcode' in h or '바코드' in h), -1)

        if name_idx == -1:
            continue

        for row in rows[1:]:
            if not row or all(not str(c).strip() for c in row):
                continue
            name = row[name_idx].strip() if name_idx < len(row) else ''
            if not name:
                continue
            category = row[cat_idx].strip() if cat_idx > -1 and cat_idx < len(row) else '기타'
            barcode = row[barcode_idx].strip() if barcode_idx > -1 and barcode_idx < len(row) else None
            try:
                current_stock = int(str(row[stock_idx]).replace(',', '').strip()) if stock_idx > -1 and stock_idx < len(row) else 0
            except Exception:
                current_stock = 0

            defaults = {
                'category': category or '기타',
                'current_stock': current_stock,
            }
            if barcode:
                defaults['barcode'] = barcode

            InventoryItem.objects.update_or_create(
                name=name,
                defaults=defaults,
            )
            total_processed += 1

    return Response({
        'message': '파일이 성공적으로 업로드되었습니다.',
        'rowsProcessed': total_processed,
    })


@api_view(['GET'])
def inventory_template(request):
    content = 'name,category,current_stock,minimum_stock,barcode\n'
    resp = HttpResponse(content, content_type='text/csv; charset=utf-8')
    resp['Content-Disposition'] = 'attachment; filename="inventory_template.csv"'
    return resp


@api_view(['POST'])
def inventory_apply_calculated_thresholds(request):
    payload = request.data if isinstance(request.data, dict) else {}
    products = payload.get('products')
    if not isinstance(products, list):
        return Response({'error': 'products must be a list'}, status=status.HTTP_400_BAD_REQUEST)

    products = [p.strip() for p in products if isinstance(p, str) and p.strip()]
    if not products:
        return Response({'success': True, 'applied': 0}, status=status.HTTP_200_OK)

    period = (payload.get('period') or '3month').strip()
    days = 90
    if period == '1month':
        days = 30
    elif period == '6month':
        days = 180

    since = timezone.localdate() - timedelta(days=days)
    qs = (
        OutboundRecord.objects.filter(outbound_date__gte=since)
        .exclude(barcode__isnull=True)
        .exclude(barcode='')
        .filter(barcode__in=products)
    )

    daily = qs.values('barcode', 'outbound_date').annotate(
        qty=Coalesce(Sum('box_quantity'), 0)
    )

    by_barcode = {}
    for row in daily:
        bc = row.get('barcode')
        if not bc:
            continue
        agg = by_barcode.get(bc)
        if not agg:
            agg = {'total': 0, 'days': set()}
            by_barcode[bc] = agg
        agg['total'] += int(row.get('qty') or 0)
        if row.get('outbound_date'):
            agg['days'].add(row['outbound_date'])

    applied = 0
    for bc in products:
        agg = by_barcode.get(bc) or {'total': 0, 'days': set()}
        days_count = len(agg['days'])
        avg_daily = (agg['total'] / float(days_count)) if days_count > 0 else 0.0
        min_stock = int(round(avg_daily * 3))
        max_stock = int(round(avg_daily * 30))
        reorder_point = int(round(avg_daily * 3))

        bm, _created = BarcodeMaster.objects.get_or_create(barcode=bc)
        bm.min_stock = min_stock
        bm.max_stock = max_stock
        bm.reorder_point = reorder_point
        bm.save(update_fields=['min_stock', 'max_stock', 'reorder_point', 'updated_at'])
        applied += 1

    return Response({'success': True, 'applied': applied}, status=status.HTTP_200_OK)


def _delivery_row_to_payload(record: DeliveryDailyRecord) -> dict:
    hourly = record.hourly or {}
    payload = {
        'date': record.date.isoformat(),
        'dayOfWeek': record.day_of_week or '',
        'total': int(record.total or 0),
    }
    for h in range(24):
        key = f'hour_{h:02d}'
        payload[key] = int(hourly.get(key) or 0)
    return payload


def _recompute_delivery_total(hourly: dict) -> int:
    for h in range(23, -1, -1):
        key = f'hour_{h:02d}'
        try:
            val = int(hourly.get(key) or 0)
        except Exception:
            val = 0
        if val > 0:
            return val
    return 0


@api_view(['GET', 'POST'])
def delivery_hourly(request):
    if request.method == 'GET':
        days = request.query_params.get('days')
        try:
            days_int = int(days) if days else 365
        except Exception:
            days_int = 365

        cutoff = timezone.localdate() - timedelta(days=days_int)
        qs = DeliveryDailyRecord.objects.filter(date__gte=cutoff).order_by('date')
        return Response({
            'success': True,
            'data': [_delivery_row_to_payload(r) for r in qs],
        })

    entries = request.data
    if not isinstance(entries, list) or len(entries) == 0:
        return Response({'success': False, 'message': 'entries array required'}, status=status.HTTP_400_BAD_REQUEST)

    today = timezone.localdate()
    record, _created = DeliveryDailyRecord.objects.get_or_create(date=today)

    hourly = record.hourly or {}
    for entry in entries:
        hour = entry.get('hour')
        quantity = entry.get('quantity')
        try:
            h = int(hour)
        except Exception:
            continue
        if h < 0 or h > 23:
            continue
        try:
            q = int(quantity)
        except Exception:
            q = 0
        hourly[f'hour_{h:02d}'] = q

    record.hourly = hourly
    record.total = _recompute_delivery_total(hourly)
    record.save()

    return Response({
        'success': True,
        'date': record.date.isoformat(),
        'row': _delivery_row_to_payload(record),
    })


@api_view(['GET'])
def delivery_range(request):
    start = request.query_params.get('start')
    end = request.query_params.get('end')
    if not start or not end:
        return Response({'success': False, 'message': 'start and end required'}, status=status.HTTP_400_BAD_REQUEST)

    qs = DeliveryDailyRecord.objects.filter(date__gte=start, date__lte=end).order_by('date')
    data = [_delivery_row_to_payload(r) for r in qs]
    return Response({
        'success': True,
        'start': start,
        'end': end,
        'count': len(data),
        'data': data,
    })


def _upsert_delivery_from_payload(payload: dict):
    date_str = (payload.get('date') or '').strip()
    if not date_str:
        return False
    try:
        date_obj = datetime.fromisoformat(date_str).date()
    except Exception:
        try:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        except Exception:
            return False

    record, _created = DeliveryDailyRecord.objects.get_or_create(date=date_obj)
    hourly = record.hourly or {}
    for h in range(24):
        key = f'hour_{h:02d}'
        if key not in payload:
            continue
        try:
            hourly[key] = int(payload.get(key) or 0)
        except Exception:
            hourly[key] = 0

    total = payload.get('total')
    try:
        total_val = int(total) if total is not None else _recompute_delivery_total(hourly)
    except Exception:
        total_val = _recompute_delivery_total(hourly)
    if total_val <= 0:
        total_val = _recompute_delivery_total(hourly)

    day_of_week = payload.get('dayOfWeek') or payload.get('day_of_week') or ''

    record.day_of_week = str(day_of_week)
    record.total = total_val
    record.hourly = hourly
    record.save()
    return True


@api_view(['POST'])
def delivery_import(request):
    file_obj = request.FILES.get('file')
    if not file_obj:
        return Response({'success': False, 'message': 'file field required'}, status=status.HTTP_400_BAD_REQUEST)

    name = (file_obj.name or '').lower()
    raw = file_obj.read()

    imported = 0

    if name.endswith('.json'):
        try:
            text = _decode_bytes(raw)
            obj = json.loads(text)
        except Exception as e:
            return Response({'success': False, 'message': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        arr = obj if isinstance(obj, list) else obj.get('delivery_data')
        if not isinstance(arr, list):
            return Response({'success': False, 'message': 'Invalid JSON format'}, status=status.HTTP_400_BAD_REQUEST)

        for row in arr:
            if isinstance(row, dict) and _upsert_delivery_from_payload(row):
                imported += 1

        return Response({'success': True, 'result': {'count': imported}})

    text = _decode_bytes(raw)
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if len(rows) < 2:
        return Response({'success': False, 'message': 'Empty file'}, status=status.HTTP_400_BAD_REQUEST)

    header = [str(h).strip() for h in rows[0]]
    normalized = [h.replace(' ', '') for h in header]
    date_idx = 0

    matrix = any(h in ('00', '0', '01') for h in normalized) and any(h in ('23',) for h in normalized)

    if matrix:
        hour_map = {}
        for idx, h in enumerate(normalized):
            if h.isdigit():
                hh = int(h)
                if 0 <= hh <= 23:
                    hour_map[idx] = f'hour_{hh:02d}'

        for row in rows[1:]:
            if not row:
                continue
            date_str = str(row[date_idx]).strip() if date_idx < len(row) else ''
            if not date_str:
                continue
            payload = {'date': date_str}
            for idx, key in hour_map.items():
                if idx < len(row):
                    try:
                        payload[key] = int(str(row[idx]).replace(',', '').strip() or 0)
                    except Exception:
                        payload[key] = 0
            if _upsert_delivery_from_payload(payload):
                imported += 1
    else:
        for row in rows[1:]:
            if len(row) < 3:
                continue
            date_str = str(row[0]).strip()
            hour_str = str(row[1]).strip()
            qty_str = str(row[2]).strip()
            try:
                hour_val = int(hour_str)
            except Exception:
                continue
            if hour_val < 0 or hour_val > 23:
                continue
            try:
                qty_val = int(qty_str)
            except Exception:
                qty_val = 0
            payload = {
                'date': date_str,
                f'hour_{hour_val:02d}': qty_val,
            }
            if _upsert_delivery_from_payload(payload):
                imported += 1

    return Response({'success': True, 'result': {'count': imported}})


@api_view(['POST'])
def delivery_import_excel(request):
    if 'file' not in request.FILES:
        return Response({'success': False, 'message': 'file field required'}, status=status.HTTP_400_BAD_REQUEST)

    file_obj = request.FILES['file']
    file_content = file_obj.read()
    if len(file_content) == 0:
        return Response({'success': False, 'message': 'Empty file'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_content), data_only=True)
        sheet = wb.active
        rows = []
        for row in sheet.iter_rows(values_only=True):
            rows.append([str(cell) if cell is not None else '' for cell in row])
    except Exception as e:
        return Response({'success': False, 'message': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    if len(rows) < 2:
        return Response({'success': False, 'message': 'Empty or invalid Excel file'}, status=status.HTTP_400_BAD_REQUEST)

    headers = [str(h).strip() for h in rows[0]]
    imported = 0
    for values in rows[1:]:
        if not values:
            continue
        payload = {}
        for idx, header in enumerate(headers):
            if idx >= len(values):
                continue
            clean = str(header).strip()
            val = values[idx]
            if clean in ('날짜', '일자', 'date'):
                payload['date'] = val
            elif clean in ('요일', 'dayOfWeek'):
                payload['dayOfWeek'] = val
            elif clean in ('합계', '총계', '누적', 'total'):
                payload['total'] = val
            else:
                if clean.isdigit():
                    h = int(clean)
                    if 0 <= h <= 23:
                        payload[f'hour_{h:02d}'] = val
        if _upsert_delivery_from_payload(payload):
            imported += 1

    return Response({'success': True, 'result': {'count': imported}})


@api_view(['GET'])
def delivery_export_xlsx(request):
    start = request.query_params.get('start')
    end = request.query_params.get('end')
    qs = DeliveryDailyRecord.objects.all().order_by('date')
    if start:
        qs = qs.filter(date__gte=start)
    if end:
        qs = qs.filter(date__lte=end)

    wb = openpyxl.Workbook()
    ws = wb.active
    header = ['date', 'dayOfWeek', 'total'] + [f'{h:02d}' for h in range(24)]
    ws.append(header)

    for rec in qs:
        payload = _delivery_row_to_payload(rec)
        row = [payload['date'], payload['dayOfWeek'], payload['total']]
        for h in range(24):
            row.append(payload[f'hour_{h:02d}'])
        ws.append(row)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    resp = HttpResponse(buf.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    resp['Content-Disposition'] = 'attachment; filename="delivery_export.xlsx"'
    return resp


@api_view(['GET', 'POST', 'DELETE'])
def baco_transfer_stats(request):
    if request.method == 'DELETE':
        BarcodeTransferRecord.objects.all().delete()
        return Response({'success': True, 'message': 'Transferred data cleared.'})

    if request.method == 'POST':
        new_data = request.data
        if not isinstance(new_data, list):
            return Response({'success': False, 'error': 'Array expected'}, status=status.HTTP_400_BAD_REQUEST)

        new_count = 0
        for item in new_data:
            tracking = (item.get('trackingNo') or '').strip()
            barcode = (item.get('barcode') or '').strip()
            if not tracking or not barcode:
                continue
            obj, created = BarcodeTransferRecord.objects.get_or_create(
                tracking_no=tracking,
                defaults={
                    'barcode': barcode,
                    'product_name': (item.get('productName') or '').strip(),
                    'category': (item.get('category') or '').strip(),
                }
            )
            if created:
                new_count += 1

        return Response({'success': True, 'message': f'Data transferred successfully. Added {new_count} new items.'})

    raw = list(BarcodeTransferRecord.objects.all().order_by('created_at').values('tracking_no', 'barcode', 'product_name', 'category'))
    aggregated = BarcodeTransferRecord.objects.values('barcode', 'product_name', 'category').annotate(count=Count('tracking_no')).order_by('-count')
    data = []
    for row in aggregated:
        data.append({
            'barcode': row.get('barcode'),
            'productName': row.get('product_name') or '-',
            'category': row.get('category') or '-',
            'count': row.get('count') or 0,
        })

    return Response({
        'success': True,
        'timestamp': timezone.now().isoformat(),
        'rawData': raw,
        'data': data,
        'totalItems': BarcodeTransferRecord.objects.count(),
    })


@api_view(['GET'])
def outbound_template(request):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'outbound_template'
    headers = [
        'outbound_date',
        'product_name',
        'category',
        'barcode',
        'quantity',
        'box_quantity',
        'unit_count',
        'sales_amount',
        'client',
        'status',
        'notes',
    ]
    ws.append(headers)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    resp = HttpResponse(buf.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    resp['Content-Disposition'] = 'attachment; filename="outbound_upload_template.xlsx"'
    return resp


@api_view(['GET'])
def outbound_download_excel(request):
    start = request.query_params.get('start')
    end = request.query_params.get('end')

    qs = OutboundRecord.objects.all().order_by('outbound_date')
    if start:
        qs = qs.filter(outbound_date__gte=start)
    if end:
        qs = qs.filter(outbound_date__lte=end)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'outbound'

    headers = [
        'outbound_date',
        'product_name',
        'category',
        'barcode',
        'quantity',
        'box_quantity',
        'unit_count',
        'sales_amount',
        'client',
        'status',
        'notes',
    ]
    ws.append(headers)

    for r in qs:
        ws.append([
            r.outbound_date.isoformat() if r.outbound_date else '',
            r.product_name,
            r.category,
            r.barcode or '',
            r.quantity or 0,
            r.box_quantity or 0,
            r.unit_count or 0,
            float(r.sales_amount or 0),
            r.client or '',
            r.status or '',
            r.notes or '',
        ])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    resp = HttpResponse(buf.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    resp['Content-Disposition'] = 'attachment; filename="outbound_data.xlsx"'
    return resp


# ============================================================================
# Inbound Order Management (입고 가능 수량)
# ============================================================================

@api_view(['POST'])
def inbound_order_upload(request):
    """입고 발주서 파일 업로드 (VF xlsx / 미입고 csv)"""
    error_id = str(uuid.uuid4())
    file_obj = request.FILES.get('file')
    if not file_obj:
        return Response({'message': 'file is required'}, status=status.HTTP_400_BAD_REQUEST)

    file_name = getattr(file_obj, 'name', '') or 'unknown'
    file_name_lower = file_name.lower()

    # 파일 타입 판별
    if 'vf' in file_name_lower and file_name_lower.endswith('.xlsx'):
        file_type = 'vf_xlsx'
    elif '미입고' in file_name_lower or 'unreceived' in file_name_lower:
        file_type = 'unreceived_csv'
    elif file_name_lower.endswith('.csv'):
        file_type = 'unreceived_csv'  # 기본 CSV는 미입고로 간주
    elif file_name_lower.endswith('.xlsx'):
        file_type = 'vf_xlsx'  # 기본 xlsx는 VF로 간주
    else:
        return Response({'message': '지원하지 않는 파일 형식입니다.'}, status=status.HTTP_400_BAD_REQUEST)

    logger.info(
        'inbound_upload start error_id=%s file_type=%s file=%s',
        error_id,
        file_type,
        file_name,
    )

    try:
        raw = file_obj.read()
        if file_type == 'vf_xlsx':
            df = pd.read_excel(io.BytesIO(raw), dtype=str, sheet_name='상품목록')
        else:
            # CSV 처리
            try:
                text = raw.decode('utf-8-sig')
            except Exception:
                text = raw.decode('cp949', errors='ignore')
            df = pd.read_csv(io.StringIO(text), dtype=str)
    except Exception as e:
        logger.exception('inbound_upload parse failed error_id=%s', error_id)
        return Response(
            {'message': f'파일 파싱 실패: {str(e)}', 'errorId': error_id},
            status=status.HTTP_400_BAD_REQUEST,
        )

    df = df.fillna('')
    cols = _normalize_cols(df.columns)

    # 컬럼 인덱스 찾기
    if file_type == 'vf_xlsx':
        # VF 발주서 업로드.xlsx 컬럼
        order_no_idx = _find_col_index(cols, ['발주번호', 'order no', 'orderno'])
        order_status_idx = _find_col_index(cols, ['발주상태', 'order status'])
        barcode_idx = _find_col_index(cols, ['상품바코드', '바코드', 'barcode'])
        product_name_idx = _find_col_index(cols, ['상품이름', '상품명', 'product name'])
        ordered_qty_idx = _find_col_index(cols, ['발주수량', 'ordered qty'])
        confirmed_qty_idx = _find_col_index(cols, ['확정수량', 'confirmed qty'])
        expected_date_idx = _find_col_index(cols, ['입고예정일', 'expected date'])
        product_no_idx = _find_col_index(cols, ['상품번호', 'sku id', 'sku_id', 'product no'])
    else:
        # 발주서 미입고 물량.csv 컬럼
        order_no_idx = _find_col_index(cols, ['발주번호', 'order no', 'orderno'])
        order_status_idx = _find_col_index(cols, ['발주현황', '발주상태', 'order status'])
        barcode_idx = _find_col_index(cols, ['sku barcode', '상품바코드', '바코드', 'barcode'])
        product_name_idx = _find_col_index(cols, ['sku 이름', '상품이름', '상품명', 'product name'])
        ordered_qty_idx = _find_col_index(cols, ['발주수량', 'ordered qty'])
        confirmed_qty_idx = _find_col_index(cols, ['확정수량', 'confirmed qty'])
        received_qty_idx = _find_col_index(cols, ['입고수량', 'received qty'])
        expected_date_idx = _find_col_index(cols, ['입고예정일', 'expected date'])
        product_no_idx = _find_col_index(cols, ['상품번호', 'sku id', 'sku_id', 'product no'])

    # 필수 컬럼 확인
    if order_no_idx is None or barcode_idx is None or confirmed_qty_idx is None:
        logger.warning(
            'inbound_upload missing required cols error_id=%s cols=%s',
            error_id,
            cols,
        )
        return Response(
            {
                'message': '필수 컬럼(발주번호/바코드/확정수량)을 찾을 수 없습니다.',
                'errorId': error_id,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    # 업로드 레코드 생성
    upload = InboundOrderUpload.objects.create(
        file_name=file_name,
        file_type=file_type,
        rows_total=len(df),
        status='pending',
    )

    rows_parsed = 0
    rows_skipped = 0
    lines_to_create = []

    for _, row in df.iterrows():
        order_no = str(row.iloc[order_no_idx]).strip()
        barcode = str(row.iloc[barcode_idx]).strip()

        if not order_no or not barcode:
            rows_skipped += 1
            continue

        confirmed_qty = _parse_int(row.iloc[confirmed_qty_idx])
        if confirmed_qty <= 0:
            rows_skipped += 1
            continue

        order_status = str(row.iloc[order_status_idx]).strip() if order_status_idx is not None else ''
        product_name = str(row.iloc[product_name_idx]).strip() if product_name_idx is not None else ''
        ordered_qty = _parse_int(row.iloc[ordered_qty_idx]) if ordered_qty_idx is not None else 0
        received_qty = _parse_int(row.iloc[received_qty_idx]) if file_type == 'unreceived_csv' and received_qty_idx is not None else 0
        expected_date = _parse_date_ymd(row.iloc[expected_date_idx]) if expected_date_idx is not None else None
        product_no = str(row.iloc[product_no_idx]).strip() if product_no_idx is not None else ''

        lines_to_create.append(InboundOrderLine(
            upload=upload,
            barcode=barcode,
            order_no=order_no,
            order_status=order_status,
            product_name=product_name,
            product_no=product_no,
            ordered_qty=ordered_qty,
            confirmed_qty=confirmed_qty,
            received_qty=received_qty,
            expected_date=expected_date,
        ))
        rows_parsed += 1

    # 일괄 생성
    if lines_to_create:
        InboundOrderLine.objects.bulk_create(lines_to_create, batch_size=2000)

    # 업로드 상태 업데이트
    upload.rows_parsed = rows_parsed
    upload.rows_skipped = rows_skipped
    upload.status = 'success'
    upload.save(update_fields=['rows_parsed', 'rows_skipped', 'status'])

    logger.info(
        'inbound_upload done error_id=%s rows_parsed=%s rows_skipped=%s',
        error_id,
        rows_parsed,
        rows_skipped,
    )

    return Response({
        'success': True,
        'message': '입고 발주서 파일이 업로드되었습니다.',
        'uploadId': str(upload.id),
        'fileType': file_type,
        'rowsParsed': rows_parsed,
        'rowsSkipped': rows_skipped,
    })


@api_view(['GET', 'DELETE'])
def inbound_order_latest(request):
    """최신 입고 발주서 데이터 조회 / 최신 업로드 초기화(삭제)"""
    latest_upload = InboundOrderUpload.objects.filter(status='success').order_by('-uploaded_at').first()
    if request.method == 'DELETE':
        with transaction.atomic():
            deleted_lines_count, _ = InboundOrderLine.objects.all().delete()
            deleted_uploads_count, _ = InboundOrderUpload.objects.all().delete()

        return Response({
            'success': True,
            'deleted': True,
            'deletedUploadsCount': int(deleted_uploads_count or 0),
            'deletedLinesCount': int(deleted_lines_count or 0),
        })

    if not latest_upload:
        return Response({
            'success': True,
            'data': [],
            'uploadInfo': None,
        })

    # 정책 적용
    policy = InboundPolicy.objects.first()
    status_mode = (getattr(policy, 'status_mode', '') or '').strip().lower() if policy else ''
    statuses = (getattr(policy, 'statuses', None) or []) if policy else []
    statuses_norm = [str(s).strip() for s in statuses if str(s).strip()]

    lines_qs = InboundOrderLine.objects.filter(upload=latest_upload)

    if statuses_norm:
        q = models.Q()
        for s in statuses_norm:
            q |= models.Q(order_status__iexact=s)

        if status_mode == 'exclude':
            lines_qs = lines_qs.exclude(q)
        elif status_mode == 'include':
            lines_qs = lines_qs.filter(q)

    lines = []
    for line in lines_qs:
        lines.append({
            'id': str(line.id),
            'barcode': line.barcode,
            'orderNo': line.order_no,
            'orderStatus': line.order_status,
            'productName': line.product_name,
            'productNo': line.product_no,
            'orderedQty': line.ordered_qty,
            'confirmedQty': line.confirmed_qty,
            'receivedQty': line.received_qty,
            'expectedDate': line.expected_date.isoformat() if line.expected_date else None,
        })

    return Response({
        'success': True,
        'data': lines,
        'uploadInfo': {
            'id': str(latest_upload.id),
            'fileName': latest_upload.file_name,
            'fileType': latest_upload.file_type,
            'uploadedAt': latest_upload.uploaded_at.isoformat(),
            'rowsTotal': latest_upload.rows_total,
            'rowsParsed': latest_upload.rows_parsed,
            'rowsSkipped': latest_upload.rows_skipped,
        },
    })


@api_view(['GET', 'POST'])
def inbound_policy(request):
    """입고 발주서 필터링 정책 조회/설정"""
    if request.method == 'GET':
        policy = InboundPolicy.objects.first()
        if not policy:
            return Response({
                'statusMode': 'exclude',
                'statuses': [],
            })
        return Response({
            'statusMode': policy.status_mode,
            'statuses': policy.statuses or [],
        })

    payload = request.data if isinstance(request.data, dict) else {}
    status_mode = (payload.get('statusMode') or payload.get('status_mode') or 'exclude').strip()
    statuses = payload.get('statuses') or []

    if status_mode not in ('exclude', 'include'):
        return Response(
            {'message': 'statusMode must be "exclude" or "include"'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not isinstance(statuses, list):
        return Response(
            {'message': 'statuses must be an array'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    policy = InboundPolicy.objects.first()
    if policy:
        policy.status_mode = status_mode
        policy.statuses = statuses
        policy.save(update_fields=['status_mode', 'statuses', 'updated_at'])
    else:
        policy = InboundPolicy.objects.create(
            status_mode=status_mode,
            statuses=statuses,
        )

    return Response({
        'success': True,
        'statusMode': policy.status_mode,
        'statuses': policy.statuses or [],
    })