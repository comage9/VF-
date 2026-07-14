# -*- coding: utf-8 -*-
"""
Enhanced 재고 현재고 산출 규칙 (단일 진실 공급원)

⚠️ 이 파일의 규칙을 바꾸지 말고 views.py 등에 인라인 재구현하지 말 것.
   inventory_unified / 입고 반영 / 집계는 모두 여기를 사용한다.

## 비즈니스 정의 (2026-07-15 확정)

업로드 재고 스냅샷(as_of_date)의 의미:
  → 해당 일자 **출고가 반영된 이후 남은 재고** (클로징/잔여 스냅샷)

따라서:
  current_stock = baseline_qty
                + receipts with receipt_date  > as_of_date
                - outbound  with outbound_date > as_of_date

기준일 당일(as_of) 출고·입고를 다시 가감하면 이중 반영 → 위험/금액 오류가 반복됨.
"""
from __future__ import annotations

from datetime import date
from typing import Dict, Iterable, Mapping, Optional, Tuple

from django.db.models import Sum
from django.db.models.functions import Coalesce


# 클로징 스냅샷: 기준일 당일 이동은 스냅샷에 이미 포함
SNAPSHOT_INCLUDES_AS_OF_DAY_MOVEMENTS = True


def movement_after_baseline_lookup(as_of: date) -> str:
    """
    Django 룩업 접미사 반환.
    - 클로징 스냅샷(기본): 'gt'  → date > as_of
    - 시초 스냅샷(미사용): 'gte' → date >= as_of
    """
    if SNAPSHOT_INCLUDES_AS_OF_DAY_MOVEMENTS:
        return "gt"
    return "gte"


def is_movement_date_applicable(movement_date: date, as_of: date) -> bool:
    """입고 업로드 등에서 기준일 대비 반영 여부 판정."""
    if movement_date is None or as_of is None:
        return False
    if SNAPSHOT_INCLUDES_AS_OF_DAY_MOVEMENTS:
        return movement_date > as_of
    return movement_date >= as_of


def compute_current_stock(
    base_qty: int,
    receipt_qty_after: int = 0,
    outbound_qty_after: int = 0,
) -> int:
    """현재고 = 기준 스냅샷 + 이후 입고 − 이후 출고."""
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
    return base + rcv - out


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


def aggregate_movements_after_baseline(
    *,
    as_of: date,
    barcodes: Iterable[str],
    outbound_model,
    receipt_model,
) -> Tuple[Dict[str, int], Dict[str, int]]:
    """
    기준일 이후 출고/입고 박스 수량 집계.
    Returns: (outbound_agg_by_barcode, receipt_agg_by_barcode)
    """
    from django.db.models import Q

    bc_list = [str(b).strip() for b in barcodes if b and str(b).strip()]
    if not bc_list or not as_of:
        return {}, {}

    lookup = movement_after_baseline_lookup(as_of)
    out_filter = {f"outbound_date__{lookup}": as_of}
    rcv_filter = {f"receipt_date__{lookup}": as_of}

    outbound_agg = {
        str(row["barcode"]).strip(): int(row.get("qty") or 0)
        for row in (
            outbound_model.objects.filter(**out_filter)
            .exclude(barcode__isnull=True)
            .exclude(barcode="")
            .filter(barcode__in=bc_list)
            .values("barcode")
            .annotate(qty=Coalesce(Sum("box_quantity"), 0))
        )
    }
    receipt_agg = {
        str(row["barcode"]).strip(): int(row.get("qty") or 0)
        for row in (
            receipt_model.objects.filter(**rcv_filter)
            .filter(barcode__in=bc_list)
            .values("barcode")
            .annotate(qty=Sum("quantity_box"))
        )
    }
    return outbound_agg, receipt_agg
