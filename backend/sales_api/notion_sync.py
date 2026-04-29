"""
VF 백엔드 → Notion 동기화 (VF가 원본, Notion은 읽기 전용 백업)
2026-04-25 업데이트

Notion 무료 플랜 (10개 API 요청/분) 고려하여 배치 처리
"""
import json
import os
import time
import hmac
import hashlib
import requests
from datetime import datetime, date, timedelta
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.conf import settings

# Notion OAuth Integration (새로 생성한 vf Integration)
NOTION_CLIENT_ID = '34dd872b-594c-812a-9c7c-003767093483'
NOTION_ACCESS_TOKEN = getattr(settings, 'NOTION_ACCESS_TOKEN', None)

# Integration Token
NOTION_TOKEN = getattr(settings, 'NOTION_TOKEN', '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')

# API 버전 (2026-03-11 이상 필수)
NOTION_VERSION = '2026-03-11'

NOTION_HEADERS = {
    'Authorization': f'Bearer {NOTION_TOKEN}',
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
}

# Notion Database IDs (2026-04-25 생성)
NOTION_DB_PRODUCTION = '34d99601-2f05-8191-a0ff-e19640dac704'  # 생산 계획
NOTION_DB_OUTBOUND = '34d99601-2f05-8166-a31c-e21a334f894f'   # 출고 현황
NOTION_DB_PRODUCT_MASTER = '34d99601-2f05-81b4-999a-e18241b7ebdb'  # 제품 마스터
NOTION_DB_BACO = '34d99601-2f05-81ab-82b3-c9de2142cfc7'  # BA.CO 관리
NOTION_DB_INVENTORY = '34d99601-2f05-81b1-b30e-d04b837a2586'  # 재고 현황
NOTION_DB_MACHINE_PLAN = '34d99601-2f05-81f5-a2e9-f3f6989ccaa7'  # 기계별 계획

# API 호출 제한 (Notion 무료: 10개/분)
NOTION_RATE_LIMIT = 8  # 안전률 80%
NOTION_MIN_INTERVAL = 60 / NOTION_RATE_LIMIT  # ~7.5초 간격

# Webhook 서명 검증
NOTION_WEBHOOK_SECRET = os.environ.get('NOTION_WEBHOOK_SECRET')

# API 토큰
API_TOKEN = getattr(settings, 'VF_API_TOKEN', 'vf_notion_sync_token_2026')


def wait_for_rate_limit():
    """Notion API 호출 간격 제한 (10개/분)"""
    time.sleep(NOTION_MIN_INTERVAL)


def create_notion_page(database_id: str, properties: dict) -> dict:
    """Notion Database에 페이지 생성 ( rate limit 적용)"""
    try:
        resp = requests.post(
            'https://api.notion.com/v1/pages',
            headers=NOTION_HEADERS,
            json={
                'parent': {'database_id': database_id},
                'properties': properties
            },
            timeout=15
        )
        
        # Rate Limit 체크
        if resp.status_code == 429:
            # 30초 대기 후 재시도
            time.sleep(30)
            resp = requests.post(
                'https://api.notion.com/v1/pages',
                headers=NOTION_HEADERS,
                json={
                    'parent': {'database_id': database_id},
                    'properties': properties
                },
                timeout=15
            )
        
        return {'status_code': resp.status_code, 'data': resp.json()}
        
    except Exception as e:
        return {'status_code': 500, 'error': str(e)}


def sync_production_to_notion(date_from: str = None, date_to: str = None) -> dict:
    """생산 계획 → Notion 동기화"""
    from .models import ProductionLog
    
    if not date_from:
        date_from = (date.today() - timedelta(days=7)).isoformat()
    if not date_to:
        date_to = date.today().isoformat()
    
    results = {'sent': 0, 'skipped': 0, 'errors': []}
    
    records = ProductionLog.objects.filter(
        date__gte=date_from,
        date__lte=date_to
    ).order_by('-date')[:200]
    
    for record in records:
        try:
            properties = {
                '날짜': {'date': {'start': str(record.date)}},
                '기계번호': {'multi_select': [{'name': record.machine_number or '미지정'}]},
                '금형번호': {'rich_text': [{'text': {'content': record.mold_number or ''}}]},
                '제품명': {'title': [{'text': {'content': record.product_name or ''}}]},
                '색상1': {'rich_text': [{'text': {'content': record.color1 or ''}}]},
                '색상2': {'rich_text': [{'text': {'content': record.color2 or ''}}]},
                '단위': {'select': {'name': record.unit or 'EA'}},
                '수량': {'number': record.quantity or 0},
                '비고': {'rich_text': [{'text': {'content': f"VF ID: {record.id}"}}]}
            }
            
            result = create_notion_page(NOTION_DB_PRODUCTION, properties)
            
            if result['status_code'] == 200:
                results['sent'] += 1
            elif 'already exists' in str(result.get('data', '')).lower():
                results['skipped'] += 1
            else:
                error_msg = result.get('data', {}).get('message', str(result))
                results['errors'].append(f"Production {record.id}: {error_msg[:100]}")
            
            wait_for_rate_limit()
            
        except Exception as e:
            results['errors'].append(f"Production {record.id}: {str(e)}")
    
    return results


def sync_outbound_to_notion(date_from: str = None, date_to: str = None) -> dict:
    """출고 현황 → Notion 동기화"""
    from .models import OutboundRecord
    
    if not date_from:
        date_from = (date.today() - timedelta(days=7)).isoformat()
    if not date_to:
        date_to = date.today().isoformat()
    
    results = {'sent': 0, 'skipped': 0, 'errors': []}
    
    records = OutboundRecord.objects.filter(
        outbound_date__gte=date_from,
        outbound_date__lte=date_to
    ).order_by('-outbound_date')[:200]
    
    for record in records:
        try:
            properties = {
                '날짜': {'date': {'start': str(record.outbound_date)}},
                '바코드': {'rich_text': [{'text': {'content': record.barcode or ''}}]},
                '제품명': {'title': [{'text': {'content': record.product_name or ''}}]},
                '수량': {'number': record.box_quantity or record.quantity or 0},
                '단가': {'number': record.unit_price or 0},
                '금액': {'number': record.total_price or 0},
                '고객명': {'rich_text': [{'text': {'content': record.client_name or ''}}]},
                '비고': {'rich_text': [{'text': {'content': f"VF ID: {record.id}"}}]}
            }
            
            result = create_notion_page(NOTION_DB_OUTBOUND, properties)
            
            if result['status_code'] == 200:
                results['sent'] += 1
            elif 'already exists' in str(result.get('data', '')).lower():
                results['skipped'] += 1
            else:
                error_msg = result.get('data', {}).get('message', str(result))
                results['errors'].append(f"Outbound {record.id}: {error_msg[:100]}")
            
            wait_for_rate_limit()
            
        except Exception as e:
            results['errors'].append(f"Outbound {record.id}: {str(e)}")
    
    return results


def sync_all_to_notion(date_from: str = None, date_to: str = None) -> dict:
    """VF → Notion 전체 동기화 (Cron용)"""
    results = {
        'success': True,
        'date_range': {'from': date_from or '7 days ago', 'to': date_to or 'today'},
        'production': {},
        'outbound': {},
        'total_sent': 0,
        'total_errors': 0
    }
    
    print(f"[NOTION SYNC] Starting VF to Notion sync ({date_from or '7 days ago'} ~ {date_to or 'today'})")
    
    # 1. 생산 계획 동기화
    print("[NOTION SYNC] Syncing production logs...")
    prod_result = sync_production_to_notion(date_from, date_to)
    results['production'] = prod_result
    results['total_sent'] += prod_result['sent']
    results['total_errors'] += len(prod_result['errors'])
    
    # 2. 출고 현황 동기화
    print("[NOTION SYNC] Syncing outbound records...")
    out_result = sync_outbound_to_notion(date_from, date_to)
    results['outbound'] = out_result
    results['total_sent'] += out_result['sent']
    results['total_errors'] += len(out_result['errors'])
    
    print(f"[NOTION SYNC] Complete! Sent: {results['total_sent']}, Errors: {results['total_errors']}")
    
    return results


def test_notion_connection() -> dict:
    """Notion 연결 테스트"""
    try:
        resp = requests.post(
            'https://api.notion.com/v1/search',
            headers=NOTION_HEADERS,
            json={'query': '', 'page_size': 1},
            timeout=10
        )
        
        if resp.status_code == 200:
            return {'success': True, 'message': 'Notion API connected'}
        else:
            return {'success': False, 'error': resp.json().get('message', resp.text)}
            
    except Exception as e:
        return {'success': False, 'error': str(e)}


# ============================================================
# Django Views (VF 원본 → Notion 백업 동기화 API 엔드포인트)
# ============================================================


def verify_token(request):
    """API 토큰 검증"""
    token = request.headers.get('X-VF-API-Token', request.GET.get('token', ''))
    return token == API_TOKEN


@csrf_exempt
@require_http_methods(["GET", "POST"])
def notion_sync(request):
    """
    VF → Notion 동기화 메인 엔드포인트
    
    GET: VF 데이터 → Notion으로 전송
    POST: Notion Webhook 수신 (현재는 미사용 - VF가 원본이므로)
    """
    if request.method == 'GET':
        if not verify_token(request):
            return JsonResponse({'success': False, 'error': 'Invalid token'}, status=401)
        
        # VF → Notion 동기화 실행
        date_from = request.GET.get('date_from', (date.today() - timedelta(days=7)).isoformat())
        date_to = request.GET.get('date_to', date.today().isoformat())
        
        result = sync_all_to_notion(date_from, date_to)
        return JsonResponse(result)
    
    else:
        # POST: Notion Webhook 수신 (VF가 원본이므로 수신만 하고 처리하지 않음)
        try:
            body = json.loads(request.body)
            print(f'[DEBUG] POST received: {body}')
            return JsonResponse({'success': True, 'message': 'Webhook received but not processed (VF is source)'})
        except Exception as e:
            return JsonResponse({'success': False, 'error': str(e)}, status=400)


@csrf_exempt
@require_http_methods(["GET"])
def notion_status(request):
    """Notion 연결 상태 확인"""
    if not verify_token(request):
        return JsonResponse({'success': False, 'error': 'Invalid token'}, status=401)
    
    result = test_notion_connection()
    if result['success']:
        return JsonResponse({
            'success': True,
            'notion_connected': True,
            'databases': {
                'production': NOTION_DB_PRODUCTION,
                'outbound': NOTION_DB_OUTBOUND,
            }
        })
    else:
        return JsonResponse({
            'success': False,
            'notion_connected': False,
            'error': result['error']
        }, status=502)


if __name__ == '__main__':
    # CLI 실행용 (Crontab에서 호출)
    import django
    import sys
    
    # Django 설정
    sys.path.insert(0, '/home/comage/coding/VF/backend')
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()
    
    # 날짜 범위 파라미터
    date_from = sys.argv[1] if len(sys.argv) > 1 else None
    date_to = sys.argv[2] if len(sys.argv) > 2 else None
    
    # 전체 동기화 실행
    result = sync_all_to_notion(date_from, date_to)
    print(f"RESULT: {result}")
