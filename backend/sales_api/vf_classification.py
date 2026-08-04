# -*- coding: utf-8 -*-
"""
VF 카드 상태 분할 (is_vf_item 은 변경하지 않음)

SoT: MasterSpec.is_vf_item (엑셀 바코드 목록). 이 모듈은 그 안 분할만.

1) VF 출고(active)
   - is_vf_item + 비단종
   - (등록 3개월 미만 OR 최근 3개월 실출고)
2) VF 출고없음
   - is_vf_item + 최근 3개월 실출고 없음
   - 등록 3개월 미만은 active 쪽

VF 전체 건수 = is_vf_item 합 (active + no_out, 비단종 기준 분할)
"""
from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Optional


def add_months(d: date, months: int) -> date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    last = monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def is_registered_within_months(
    reg: Optional[date],
    *,
    as_of: date,
    months: int = 3,
) -> bool:
    if not reg:
        return False
    since = add_months(as_of, -abs(int(months or 3)))
    return since <= reg <= as_of


def is_vf_active_for_inventory(
    *,
    is_vf_item: bool,
    is_discontinued: bool = False,
    current_stock: int = 0,
    has_outbound_3m: bool = False,
    vf_registered_at: Optional[date] = None,
    as_of: Optional[date] = None,
    reg_months: int = 3,
) -> bool:
    """
    마스터 'VF 품목' 카드 대상.
    재고 0이어도 3개월 실출고(또는 등록 3개월 미만 유예)면 True.
    current_stock 인자는 호환용으로 받지만 판정에 사용하지 않음.
    """
    if not is_vf_item:
        return False
    if is_discontinued:
        return False
    _ = current_stock  # 재고는 VF 카드 분할 기준에서 제외
    as_of = as_of or date.today()
    if is_registered_within_months(
        vf_registered_at, as_of=as_of, months=reg_months
    ):
        return True
    return bool(has_outbound_3m)


def is_vf_no_outbound_bucket(
    *,
    is_vf_item: bool,
    is_discontinued: bool = False,
    current_stock: int = 0,
    has_outbound_3m: bool = False,
    vf_registered_at: Optional[date] = None,
    as_of: Optional[date] = None,
    reg_months: int = 3,
) -> bool:
    """
    마스터 'VF 출고없음 확인' 카드 대상.
    VF 품목 중 최근 3개월 실출고가 없는 제품만 (재고 무관).
    등록 3개월 미만은 VF 품목 유예 → 여기 미포함.
    """
    if not is_vf_item:
        return False
    _ = is_discontinued  # 출고 여부만 기준 (단종 여부와 무관)
    _ = current_stock
    as_of = as_of or date.today()
    if is_registered_within_months(
        vf_registered_at, as_of=as_of, months=reg_months
    ):
        return False
    return not bool(has_outbound_3m)
