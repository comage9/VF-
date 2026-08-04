# -*- coding: utf-8 -*-
"""
예측 보정 출고(is_estimated) 정리 헬퍼.

원칙: 해당 날짜에 실적 출고가 1건이라도 있으면 그 날짜의 보정 행은 불필요 → 삭제.
"""
from __future__ import annotations

from datetime import date
from typing import Iterable, Optional, Sequence, Union

from django.db.models import Count

from .models import OutboundRecord

DateLike = Union[date, str]


def _as_date(d: DateLike) -> Optional[date]:
    if d is None:
        return None
    if isinstance(d, date):
        return d
    s = str(d).strip()[:10]
    try:
        y, m, day = s.split("-")
        return date(int(y), int(m), int(day))
    except Exception:
        return None


def real_dates_with_estimates(
    dates: Optional[Iterable[DateLike]] = None,
) -> list[date]:
    """
    실적과 보정이 동시에 있는 날짜 목록.
    dates 가 주어지면 그 범위/집합만 검사.
    """
    real_qs = OutboundRecord.objects.filter(is_estimated=False)
    est_qs = OutboundRecord.objects.filter(is_estimated=True)

    if dates is not None:
        date_list = []
        for d in dates:
            ad = _as_date(d)
            if ad:
                date_list.append(ad)
        if not date_list:
            return []
        real_qs = real_qs.filter(outbound_date__in=date_list)
        est_qs = est_qs.filter(outbound_date__in=date_list)

    real_days = set(real_qs.values_list("outbound_date", flat=True).distinct())
    est_days = set(est_qs.values_list("outbound_date", flat=True).distinct())
    return sorted(real_days & est_days)


def delete_estimates_for_dates(
    dates: Sequence[DateLike],
    *,
    dry_run: bool = False,
) -> dict:
    """
    지정 날짜들의 예측 보정 행 삭제.
    Returns: {dates, deleted, dry_run}
    """
    clean_dates = []
    for d in dates:
        ad = _as_date(d)
        if ad:
            clean_dates.append(ad)
    clean_dates = sorted(set(clean_dates))
    if not clean_dates:
        return {"dates": [], "deleted": 0, "dry_run": dry_run}

    qs = OutboundRecord.objects.filter(
        is_estimated=True, outbound_date__in=clean_dates
    )
    count = qs.count()
    if dry_run or count == 0:
        return {"dates": [d.isoformat() for d in clean_dates], "deleted": count, "dry_run": True if dry_run else False}

    deleted, _ = qs.delete()
    return {
        "dates": [d.isoformat() for d in clean_dates],
        "deleted": deleted,
        "dry_run": False,
    }


def cleanup_estimates_where_real_exists(
    *,
    dates: Optional[Iterable[DateLike]] = None,
    dry_run: bool = False,
) -> dict:
    """
    실적이 있는 날의 보정 행만 삭제.
    dates: 검사 대상 날짜 (None이면 전체)
    """
    overlap = real_dates_with_estimates(dates)
    if not overlap:
        return {"overlap_dates": 0, "deleted": 0, "dates": [], "dry_run": dry_run}
    result = delete_estimates_for_dates(overlap, dry_run=dry_run)
    return {
        "overlap_dates": len(overlap),
        "deleted": result["deleted"],
        "dates": result["dates"],
        "dry_run": result["dry_run"],
    }


def estimate_stats() -> dict:
    """간단 통계."""
    total_est = OutboundRecord.objects.filter(is_estimated=True).count()
    est_days = (
        OutboundRecord.objects.filter(is_estimated=True)
        .values("outbound_date")
        .distinct()
        .count()
    )
    overlap = real_dates_with_estimates()
    return {
        "estimated_rows": total_est,
        "estimated_days": est_days,
        "overlap_days": len(overlap),
        "overlap_sample": [d.isoformat() for d in overlap[:10]],
    }
