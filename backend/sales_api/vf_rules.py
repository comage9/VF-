# -*- coding: utf-8 -*-
"""
VF 품목 — 자동 규칙 비활성

운영 SoT = MasterSpec.is_vf_item (현재 DB).
지정/해제/수정/삭제는 마스터 UI·일괄수정·양식 import 로만 한다.

이 모듈은 출고·등록일 기준으로 is_vf_item 을 바꾸지 않는다 (noop).
(과거: 자동 해제→863, 자동 추가→872 사고)
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from django.utils import timezone


def add_months(d: date, months: int) -> date:
    """달 단위 이동 (일 클램프). 다른 모듈 호환용."""
    from calendar import monthrange

    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    last = monthrange(y, m)[1]
    return date(y, m, min(d.day, last))


def apply_vf_item_rules(
    *,
    as_of: Optional[date] = None,
    reg_months: int = 1,
    outbound_months: int = 3,
    allow_clear: bool = False,
) -> dict:
    """
    더 이상 is_vf_item 을 변경하지 않음 (읽기 전용 스냅샷).

    호환을 위해 시그니처 유지. 출고/등록 기반 ON·OFF 모두 금지.
    """
    from sales_api.models import MasterSpec

    _ = (reg_months, outbound_months, allow_clear)
    as_of = as_of or timezone.localdate()
    vf_total = MasterSpec.objects.filter(is_vf_item=True).count()

    return {
        "ok": True,
        "as_of": as_of.isoformat(),
        "reg_since": as_of.isoformat(),
        "outbound_since": as_of.isoformat(),
        "recent_reg_count": 0,
        "outbound_barcode_count": 0,
        "outbound_master_count": 0,
        "want_vf_count": vf_total,
        "before_vf": vf_total,
        "after_vf": vf_total,
        "updated_true_rows": 0,
        "cleared_false_rows": 0,
        "allow_clear": False,
        "noop": True,
        "message": (
            f"VF 규칙 적용 비활성 ({as_of}): is_vf_item 변경 안 함. "
            f"현재 VF {vf_total}건. SoT 복구는 restore_vf_sot --strict"
        ),
    }
