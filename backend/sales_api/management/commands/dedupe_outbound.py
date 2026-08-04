# -*- coding: utf-8 -*-
"""
출고(OutboundRecord) 실적 중복 행 정리.

동일 키: (outbound_date, product_name, barcode, category) + is_estimated=False

병합 전략 (sync lookup 버그로 생긴 중복에 맞춤):
  - 그룹 내 updated_at(없으면 created_at) 최신 행 1개 유지
  - 나머지 행 삭제
  - 수량 SUM 하지 않음 (수량 변경으로 생긴 중복이면 SUM이 이중 집계)

기본: --dry-run (삭제 없음, 리포트만)
적용: --apply

사용:
  python manage.py dedupe_outbound
  python manage.py dedupe_outbound --apply
  python manage.py dedupe_outbound --apply --limit 50
"""
from __future__ import annotations

from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from sales_api.models import OutboundRecord


def _group_key(row: OutboundRecord):
    return (
        row.outbound_date,
        (row.product_name or "").strip(),
        (row.barcode or "").strip(),
        (row.category or "").strip(),
    )


class Command(BaseCommand):
    help = "Deduplicate non-estimated OutboundRecord rows (dry-run by default)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Actually delete duplicate rows (default is dry-run)",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=0,
            help="Max groups to process (0 = all)",
        )
        parser.add_argument(
            "--since",
            type=str,
            default="",
            help="Only groups with outbound_date >= YYYY-MM-DD",
        )

    def handle(self, *args, **options):
        apply = bool(options["apply"])
        limit = int(options["limit"] or 0)
        since = (options.get("since") or "").strip()

        qs = OutboundRecord.objects.filter(is_estimated=False)
        if since:
            qs = qs.filter(outbound_date__gte=since)

        # Find keys with count > 1 via DB group (efficient key list)
        grouped = (
            qs.values("outbound_date", "product_name", "barcode", "category")
            .annotate(c=Count("id"))
            .filter(c__gt=1)
            .order_by("outbound_date")
        )
        if limit > 0:
            grouped = list(grouped[:limit])
        else:
            grouped = list(grouped)

        if not grouped:
            self.stdout.write(self.style.SUCCESS("No duplicate groups found."))
            return

        total_extra = 0
        same_qty = 0
        diff_qty = 0
        delete_ids = []
        samples = []

        for g in grouped:
            rows = list(
                qs.filter(
                    outbound_date=g["outbound_date"],
                    product_name=g["product_name"],
                    barcode=g["barcode"],
                    category=g["category"],
                ).order_by("-updated_at", "-created_at", "id")
            )
            if len(rows) < 2:
                continue

            keep = rows[0]
            drop = rows[1:]
            qtys = {int(r.box_quantity or 0) for r in rows}
            if len(qtys) == 1:
                same_qty += 1
            else:
                diff_qty += 1

            total_extra += len(drop)
            delete_ids.extend([r.id for r in drop])

            if len(samples) < 15:
                samples.append(
                    {
                        "date": str(keep.outbound_date),
                        "barcode": keep.barcode or "",
                        "product": (keep.product_name or "")[:40],
                        "keep_id": str(keep.id),
                        "keep_box": keep.box_quantity,
                        "drop_count": len(drop),
                        "drop_boxes": [r.box_quantity for r in drop],
                    }
                )

        mode = "APPLY" if apply else "DRY-RUN"
        self.stdout.write(
            f"[{mode}] duplicate groups={len(grouped)} "
            f"same_qty={same_qty} diff_qty={diff_qty} "
            f"rows_to_delete={total_extra}"
        )
        for s in samples:
            self.stdout.write(
                f"  {s['date']} {s['barcode']} {s['product']!r} "
                f"keep_box={s['keep_box']} drop={s['drop_count']} drop_boxes={s['drop_boxes']}"
            )

        if not apply:
            self.stdout.write(
                self.style.WARNING(
                    "Dry-run only. Re-run with --apply to delete extras "
                    "(keeps latest updated_at per group)."
                )
            )
            return

        # Chunked delete for safety
        chunk = 500
        deleted = 0
        with transaction.atomic():
            for i in range(0, len(delete_ids), chunk):
                batch = delete_ids[i : i + chunk]
                n, _ = OutboundRecord.objects.filter(
                    id__in=batch, is_estimated=False
                ).delete()
                deleted += n

        self.stdout.write(
            self.style.SUCCESS(f"Deleted {deleted} duplicate outbound rows.")
        )
