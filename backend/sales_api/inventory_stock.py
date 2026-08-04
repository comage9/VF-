# -*- coding: utf-8 -*-
"""
Enhanced 재고 현재고 산출 규칙 (단일 진실 공급원)

⚠️ 이 파일의 규칙을 바꾸지 말고 views.py 등에 인라인 재구현하지 말 것.
   inventory_unified / 입고 반영 / 집계는 모두 여기를 사용한다.

## 비즈니스 정의 (2026-07-27 확정 — 현장 운영, 단순 장부)

1) 재고 데이터 업로드 = 기준 수량 (그 시점 정답). 전일 출고를 다시 계산하지 않음.
2) 입고 데이터 업로드(InventoryReceiptItem) = 기준에 가산 (+). 기준일(as_of) 당일 입고도 포함.
3) 출고 = 일자 맞춰 차감. 당일 출고 합계는 보통 익일 집계되지만,
   데이터가 들어오면 outbound_date 가 as_of 이상인 분을 그대로 뺌.
   → (오늘 기준재고 + 오늘 입고) − 오늘 출고 = 내일로 이어지는 장부.
4) 입고 가능 탭 발주서(InboundOrderLine) · FC 입고 실적(FCInboundRecord)은
   이 공식에 **직접 포함하지 않음**. 발주 업로드의 전산 가산은 기본 OFF.

공식:
  current_stock = baseline_qty
                + receipts  with receipt_date  >= as_of_date   # 당일 입고 포함 가산
                - outbound  with outbound_date >= as_of_date   # 당일 출고 차감
                  (실적만: is_estimated=False)
                + adjustments with adjustment_date > as_of_date

예) as_of=7/27 스냅샷 100, 7/27 입고 +10, 7/27 출고 −3
    → 현재고 107. 별도 +1일 보정·우회 없음.

예측 보정 출고(is_estimated=True)는 재고 차감에 포함하지 않는다.

## 연속 일치가 깨지는 구조적 원인

시스템은 WMS 실물을 직접 읽지 않고 장부만 재구성한다.
  스냅샷 + 입고(as_of~) − 출고(as_of~) + 조정
빠지면 어긋남: ① 입고 미업로드 ② 스냅샷 미갱신 ③ 바코드 불일치
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Dict, Iterable, List, Mapping, MutableMapping, Optional, Tuple

from django.db.models import Sum
from django.db.models.functions import Coalesce


# 스냅샷 = 업로드 시점 기준 수량만. 당일 입고는 스냅샷에 없다 → 입고 업로드로 가산.
# 당일 출고도 스냅샷에 없다 → 출고 실적으로 차감. (일자만 맞추면 됨)
SNAPSHOT_INCLUDES_AS_OF_DAY_RECEIPTS = False
SNAPSHOT_INCLUDES_AS_OF_DAY_OUTBOUND = False

# 하위 호환 별칭 (False = 당일 입고도 가산 창에 포함)
SNAPSHOT_INCLUDES_AS_OF_DAY_MOVEMENTS = SNAPSHOT_INCLUDES_AS_OF_DAY_RECEIPTS

# 재고/커버리지 산출 시 예측 출고 제외
STOCK_EXCLUDES_ESTIMATED_OUTBOUND = True

# 같은 상품명 바코드끼리 출고·입고를 묶어 차감 (연속 드리프트 완화)
STOCK_USES_PRODUCT_NAME_ALIASES = True

# 조정 전표(WMS 대조·파손 등)를 현재고에 반영
STOCK_INCLUDES_ADJUSTMENTS = True


def outbound_after_baseline_lookup(as_of: date | None = None) -> str:
    """
    출고 Django 룩업.
    당일 출고는 스냅샷에 없음 → 'gte' (outbound_date >= as_of)
    """
    if SNAPSHOT_INCLUDES_AS_OF_DAY_OUTBOUND:
        return "gt"
    return "gte"


def receipt_after_baseline_lookup(as_of: date | None = None) -> str:
    """
    입고 Django 룩업.
    스냅샷에 당일 입고 없음 → 'gte' (receipt_date >= as_of)
    """
    if SNAPSHOT_INCLUDES_AS_OF_DAY_RECEIPTS:
        return "gt"
    return "gte"


def adjustment_after_baseline_lookup(as_of: date | None = None) -> str:
    """조정 전표: 기준일 다음날부터 (gt). 당일 조정은 스냅샷에 넣지 않는 전제."""
    return "gt"


def movement_after_baseline_lookup(
    as_of: date | None = None,
    kind: str = "receipt",
) -> str:
    """
    kind: 'outbound' | 'receipt' | 'adjustment'
    기본 receipt (입고 업로드 등 기존 호출 호환).
    """
    k = (kind or "receipt").lower()
    if k in ("out", "outbound", "출고"):
        return outbound_after_baseline_lookup(as_of)
    if k in ("adj", "adjustment", "조정"):
        return adjustment_after_baseline_lookup(as_of)
    return receipt_after_baseline_lookup(as_of)


def is_movement_date_applicable(movement_date: date, as_of: date) -> bool:
    """입고 업로드: 기준일(as_of) 당일부터 가산 허용 (스냅샷 이전 일자만 제외)."""
    if movement_date is None or as_of is None:
        return False
    if SNAPSHOT_INCLUDES_AS_OF_DAY_RECEIPTS:
        return movement_date > as_of
    return movement_date >= as_of


def is_outbound_date_applicable(outbound_date: date, as_of: date) -> bool:
    """실출고: 기준일 당일부터 차감 (다음날 입력되는 당일 출고 포함)."""
    if outbound_date is None or as_of is None:
        return False
    if SNAPSHOT_INCLUDES_AS_OF_DAY_OUTBOUND:
        return outbound_date > as_of
    return outbound_date >= as_of


def compute_current_stock(
    base_qty: int,
    receipt_qty_after: int = 0,
    outbound_qty_after: int = 0,
    adjustment_qty_after: int = 0,
) -> int:
    """현재고 = 기준 스냅샷 + 이후 입고 − 이후 출고 + 이후 조정."""
    try:
        base = int(base_qty or 0)
    except (TypeError, ValueError):
        base = 0
    try:
        rcv = int(receipt_qty_after or 0)
    except (TypeError, ValueError):
        rcv = 0
    try:
        out = int(outbound_qty_after or 0)
    except (TypeError, ValueError):
        out = 0
    try:
        adj = int(adjustment_qty_after or 0)
    except (TypeError, ValueError):
        adj = 0
    if not STOCK_INCLUDES_ADJUSTMENTS:
        adj = 0
    return base + rcv - out + adj


def stock_value(qty: int, unit_price: int) -> int:
    """재고 금액. 음수 재고는 0으로 클램프."""
    try:
        q = max(0, int(qty or 0))
    except (TypeError, ValueError):
        q = 0
    try:
        p = max(0, int(unit_price or 0))
    except (TypeError, ValueError):
        p = 0
    return q * p


def filter_outbound_for_stock(queryset):
    """
    재고·커버리지용 출고 QuerySet.
    is_estimated=True (예측 보정) 행을 제외한다.
    필드가 없는 모델/목(mock)은 그대로 반환.
    """
    if not STOCK_EXCLUDES_ESTIMATED_OUTBOUND:
        return queryset
    try:
        return queryset.filter(is_estimated=False)
    except Exception:
        return queryset


def build_barcode_alias_groups(
    name_by_barcode: Mapping[str, str],
) -> Dict[str, List[str]]:
    """
    product_name → [barcode, ...]
    이름이 비면 바코드 단독 그룹.
    """
    groups: Dict[str, List[str]] = defaultdict(list)
    for bc, name in (name_by_barcode or {}).items():
        b = (bc or "").strip()
        if not b:
            continue
        key = (name or "").strip() or b
        if b not in groups[key]:
            groups[key].append(b)
    return dict(groups)


def expand_alias_barcode_list(
    barcodes: Iterable[str],
    name_by_barcode: Mapping[str, str],
    *,
    extra_names: Optional[Mapping[str, str]] = None,
) -> List[str]:
    """
    요청 바코드 + 동일 상품명 별칭 바코드를 모두 포함.
    extra_names: BarcodeMaster 등에서 온 {barcode: product_name} 추가 맵.
    """
    names = {str(k).strip(): (v or "").strip() for k, v in (name_by_barcode or {}).items()}
    if extra_names:
        for k, v in extra_names.items():
            kk = str(k).strip()
            if kk and kk not in names:
                names[kk] = (v or "").strip()

    # name → barcodes
    by_name: Dict[str, List[str]] = defaultdict(list)
    for b, n in names.items():
        key = n or b
        if b not in by_name[key]:
            by_name[key].append(b)

    wanted = set()
    seed = [str(b).strip() for b in barcodes if b and str(b).strip()]
    for b in seed:
        wanted.add(b)
        n = names.get(b, "")
        key = n or b
        for ab in by_name.get(key, []):
            wanted.add(ab)
        # 이름이 같은 다른 엔트리
        if n:
            for ab, an in names.items():
                if an == n:
                    wanted.add(ab)
    return sorted(wanted)


def allocate_alias_movements(
    *,
    base_by_barcode: Mapping[str, int],
    outbound_raw: Mapping[str, int],
    receipt_raw: Mapping[str, int],
    name_by_barcode: Mapping[str, str],
) -> Tuple[Dict[str, int], Dict[str, int]]:
    """
    같은 상품명 그룹 내에서 출고·입고를 묶어,
    기준 재고가 있는 바코드에 비례 배분 후 바코드별 out/rcv 반환.

    목적: 창고 스냅샷은 R-A 에 있고 매출 출고는 R-B 로 잡히는 경우
          R-A 재고가 안 줄어드는 드리프트를 완화.
    """
    if not STOCK_USES_PRODUCT_NAME_ALIASES:
        bcs = set(base_by_barcode) | set(outbound_raw) | set(receipt_raw)
        return (
            {b: int(outbound_raw.get(b, 0) or 0) for b in bcs},
            {b: int(receipt_raw.get(b, 0) or 0) for b in bcs},
        )

    names = {str(k).strip(): (v or "").strip() for k, v in (name_by_barcode or {}).items()}
    groups = build_barcode_alias_groups(names)

    # ensure every base barcode is in some group
    for b in base_by_barcode:
        b = str(b).strip()
        if not b:
            continue
        n = names.get(b, "")
        key = n or b
        if b not in groups.get(key, []):
            groups.setdefault(key, []).append(b)

    out_alloc: Dict[str, int] = defaultdict(int)
    rcv_alloc: Dict[str, int] = defaultdict(int)

    assigned_bc = set()
    for key, members in groups.items():
        members = [m for m in members if m]
        if not members:
            continue
        # include raw movement barcodes that share this name
        pool = set(members)
        for b, n in names.items():
            if (n or b) == key or n == key:
                pool.add(b)
        pool_list = sorted(pool)
        total_out = sum(int(outbound_raw.get(b, 0) or 0) for b in pool_list)
        total_rcv = sum(int(receipt_raw.get(b, 0) or 0) for b in pool_list)

        # 배분 대상: baseline에 있는 멤버 우선
        targets = [b for b in pool_list if int(base_by_barcode.get(b, 0) or 0) > 0]
        if not targets:
            targets = [b for b in pool_list if b in base_by_barcode]
        if not targets:
            # 기준에 없으면 이동이 찍힌 바코드에 그대로
            for b in pool_list:
                out_alloc[b] += int(outbound_raw.get(b, 0) or 0)
                rcv_alloc[b] += int(receipt_raw.get(b, 0) or 0)
                assigned_bc.add(b)
            continue

        weights = {b: max(0, int(base_by_barcode.get(b, 0) or 0)) for b in targets}
        wsum = sum(weights.values()) or len(targets)

        # 출고 비례 배분 (나머지 1단위는 가중치 큰 쪽)
        remaining_out = total_out
        ordered = sorted(targets, key=lambda x: weights[x], reverse=True)
        for i, b in enumerate(ordered):
            if i == len(ordered) - 1:
                share = remaining_out
            else:
                share = int(total_out * (weights[b] / wsum))
                remaining_out -= share
            out_alloc[b] += max(0, share)

        remaining_rcv = total_rcv
        for i, b in enumerate(ordered):
            if i == len(ordered) - 1:
                share = remaining_rcv
            else:
                share = int(total_rcv * (weights[b] / wsum))
                remaining_rcv -= share
            rcv_alloc[b] += max(0, share)

        for b in pool_list:
            assigned_bc.add(b)

    # 그룹 밖 잔여
    for b, q in outbound_raw.items():
        if b not in assigned_bc:
            out_alloc[b] += int(q or 0)
    for b, q in receipt_raw.items():
        if b not in assigned_bc:
            rcv_alloc[b] += int(q or 0)

    return dict(out_alloc), dict(rcv_alloc)


def aggregate_movements_after_baseline(
    *,
    as_of: date,
    barcodes: Iterable[str],
    outbound_model,
    receipt_model,
    exclude_estimated: bool = True,
    name_by_barcode: Optional[Mapping[str, str]] = None,
    extra_name_by_barcode: Optional[Mapping[str, str]] = None,
    base_qty_by_barcode: Optional[Mapping[str, int]] = None,
    apply_aliases: bool = True,
) -> Tuple[Dict[str, int], Dict[str, int]]:
    """
    기준일 이후 출고/입고 박스 수량 집계.
    Returns: (outbound_agg_by_barcode, receipt_agg_by_barcode)

    name_by_barcode / apply_aliases=True 이면 동일 상품명 별칭 바코드 출고를
    baseline 비중이 있는 바코드로 재배분한다.
    """
    bc_list = [str(b).strip() for b in barcodes if b and str(b).strip()]
    if not bc_list or not as_of:
        return {}, {}

    names = {str(k).strip(): (v or "").strip() for k, v in (name_by_barcode or {}).items()}
    query_list = bc_list
    if apply_aliases and STOCK_USES_PRODUCT_NAME_ALIASES:
        query_list = expand_alias_barcode_list(
            bc_list, names, extra_names=extra_name_by_barcode
        )

    out_lookup = outbound_after_baseline_lookup(as_of)
    rcv_lookup = receipt_after_baseline_lookup(as_of)
    out_filter = {f"outbound_date__{out_lookup}": as_of}
    rcv_filter = {f"receipt_date__{rcv_lookup}": as_of}

    out_qs = (
        outbound_model.objects.filter(**out_filter)
        .exclude(barcode__isnull=True)
        .exclude(barcode="")
        .filter(barcode__in=query_list)
    )
    if exclude_estimated and STOCK_EXCLUDES_ESTIMATED_OUTBOUND:
        out_qs = filter_outbound_for_stock(out_qs)

    outbound_raw = {
        str(row["barcode"]).strip(): int(row.get("qty") or 0)
        for row in out_qs.values("barcode").annotate(qty=Coalesce(Sum("box_quantity"), 0))
    }
    receipt_raw = {
        str(row["barcode"]).strip(): int(row.get("qty") or 0)
        for row in (
            receipt_model.objects.filter(**rcv_filter)
            .filter(barcode__in=query_list)
            .values("barcode")
            .annotate(qty=Sum("quantity_box"))
        )
    }

    if not apply_aliases or not STOCK_USES_PRODUCT_NAME_ALIASES:
        return outbound_raw, receipt_raw

    # baseline 수량 맵 (배분 가중치)
    base_map: Dict[str, int] = {}
    if base_qty_by_barcode:
        for b, q in base_qty_by_barcode.items():
            base_map[str(b).strip()] = int(q or 0)
    else:
        for b in bc_list:
            base_map[b] = 1  # 균등

    # 별칭 이름 보강 (query_list 중 names 없는 것)
    if extra_name_by_barcode:
        for b, n in extra_name_by_barcode.items():
            bb = str(b).strip()
            if bb and bb not in names and n:
                names[bb] = str(n).strip()

    return allocate_alias_movements(
        base_by_barcode=base_map,
        outbound_raw=outbound_raw,
        receipt_raw=receipt_raw,
        name_by_barcode=names,
    )


def aggregate_adjustments_after_baseline(
    *,
    as_of: date,
    barcodes: Iterable[str],
    adjustment_model,
) -> Dict[str, int]:
    """
    기준일 이후 조정 전표 합계 (바코드 → qty_delta 합).
    adjustment_date > as_of.
    """
    if not STOCK_INCLUDES_ADJUSTMENTS or not as_of:
        return {}
    bc_list = [str(b).strip() for b in barcodes if b and str(b).strip()]
    if not bc_list:
        return {}
    lookup = adjustment_after_baseline_lookup(as_of)
    filt = {f"adjustment_date__{lookup}": as_of}
    try:
        rows = (
            adjustment_model.objects.filter(**filt)
            .filter(barcode__in=bc_list)
            .values("barcode")
            .annotate(qty=Coalesce(Sum("qty_delta"), 0))
        )
    except Exception:
        return {}
    return {
        str(row["barcode"]).strip(): int(row.get("qty") or 0)
        for row in rows
        if row.get("barcode")
    }
