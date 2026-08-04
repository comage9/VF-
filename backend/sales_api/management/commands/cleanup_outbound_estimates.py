# -*- coding: utf-8 -*-
"""
실적 출고가 있는 날짜의 예측 보정(is_estimated) 행 정리.

기본: dry-run
적용: --apply

  python manage.py cleanup_outbound_estimates
  python manage.py cleanup_outbound_estimates --apply
  python manage.py cleanup_outbound_estimates --apply --since 2025-07-01 --until 2025-11-30
"""
from __future__ import annotations

from datetime import date, timedelta

from django.core.management.base import BaseCommand

from sales_api.outbound_estimates import (
    cleanup_estimates_where_real_exists,
    estimate_stats,
)


class Command(BaseCommand):
    help = "Delete estimate outbound rows on days that already have real data"

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--since", type=str, default="")
        parser.add_argument("--until", type=str, default="")

    def handle(self, *args, **options):
        stats = estimate_stats()
        self.stdout.write(
            f"현재 보정: {stats['estimated_rows']:,}행 / {stats['estimated_days']}일, "
            f"실적과 겹침: {stats['overlap_days']}일"
        )
        if stats["overlap_sample"]:
            self.stdout.write(f"  겹침 샘플: {', '.join(stats['overlap_sample'])}")

        dates = None
        since = (options.get("since") or "").strip()
        until = (options.get("until") or "").strip()
        if since or until:
            try:
                s = date.fromisoformat(since) if since else date(2000, 1, 1)
                e = date.fromisoformat(until) if until else date.today() + timedelta(days=1)
            except ValueError:
                self.stderr.write("since/until must be YYYY-MM-DD")
                return
            # expand to list of days in range that have estimates - helper accepts filter via dates list of candidates
            from sales_api.models import OutboundRecord

            dates = list(
                OutboundRecord.objects.filter(
                    is_estimated=True,
                    outbound_date__gte=s,
                    outbound_date__lte=e,
                )
                .values_list("outbound_date", flat=True)
                .distinct()
            )

        dry = not options["apply"]
        result = cleanup_estimates_where_real_exists(dates=dates, dry_run=dry)
        mode = "DRY-RUN" if dry else "APPLY"
        self.stdout.write(
            f"[{mode}] overlap={result['overlap_dates']} deleted={result['deleted']}"
        )
        if dry and result["overlap_dates"]:
            self.stdout.write(self.style.WARNING("Re-run with --apply to delete."))
        elif not dry:
            self.stdout.write(self.style.SUCCESS("Cleanup done."))
