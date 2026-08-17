# -*- coding: utf-8 -*-
"""입고 제한 기본 수량(default_inbound_limit_qty) 일일 재계산.

공식 (입고 가능 탭/스캐너 기간 메트릭과 동일 계열):
  base   = 90일(3개월) 일평균 출고 우선 (없으면 60→30→14)
  recent = 30일 일평균 (1달 추이; 14일만 있으면 14일)
  avg    = base + max(0, recent-base)*0.4   # 급증분만 가산
  hold4  = round(avg * 4);  raw<0.5 → 0
  default_inbound_limit_qty = max(2, hold4)  # 출고 없/저조 → 최소 2

사용:
  python manage.py recompute_inbound_limit_defaults
크론: 매일 04:00
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import Sum
from django.utils import timezone

from sales_api.models import BarcodeMaster, OutboundRecord


TREND_WEIGHT = 0.4
MIN_QTY = 2
HOLD_DAYS = 4


def _avg(total: float, days: int) -> float:
    if days <= 0:
        return 0.0
    t = float(total or 0)
    return (t / float(days)) if t > 0 else 0.0


def compute_default_limit(out14: float, out30: float, out60: float, out90: float) -> int:
    a14 = _avg(out14, 14)
    a30 = _avg(out30, 30)
    a60 = _avg(out60, 60)
    a90 = _avg(out90, 90)

    base = 0.0
    if a90 > 0:
        base = a90
    elif a60 > 0:
        base = a60
    elif a30 > 0:
        base = a30
    elif a14 > 0:
        base = a14

    # 최근 1달 추이 (30d 우선, 없으면 14d)
    recent = a30 if a30 > 0 else a14

    avg = base
    if recent > base and base > 0:
        avg = base + (recent - base) * TREND_WEIGHT
    elif base <= 0 and recent > 0:
        avg = recent

    raw = avg * HOLD_DAYS
    hold = 0 if raw < 0.5 else int(round(raw))
    return max(MIN_QTY, hold)


class Command(BaseCommand):
    help = "BarcodeMaster.default_inbound_limit_qty 재계산 (4일 보유, 최소 2)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="DB 저장 없이 샘플만 출력",
        )

    def handle(self, *args, **options):
        dry = bool(options.get("dry_run"))
        today = timezone.localdate()
        d14 = today - timedelta(days=14)
        d30 = today - timedelta(days=30)
        d60 = today - timedelta(days=60)
        d90 = today - timedelta(days=90)

        def agg_since(since):
            qs = (
                OutboundRecord.objects.filter(outbound_date__gte=since)
                .exclude(barcode__isnull=True)
                .exclude(barcode="")
                .values("barcode")
                .annotate(total=Sum("quantity"))
            )
            out = {}
            for row in qs:
                bc = str(row.get("barcode") or "").strip()
                if not bc:
                    continue
                try:
                    out[bc] = float(row.get("total") or 0)
                except (TypeError, ValueError):
                    out[bc] = 0.0
            return out

        self.stdout.write(f"[recompute] today={today} dry_run={dry}")
        m14 = agg_since(d14)
        m30 = agg_since(d30)
        m60 = agg_since(d60)
        m90 = agg_since(d90)

        barcodes = set(m90) | set(m60) | set(m30) | set(m14)
        # 마스터에만 있는 바코드도 최소 2로 갱신
        for bc in BarcodeMaster.objects.values_list("barcode", flat=True).iterator():
            b = str(bc or "").strip()
            if b:
                barcodes.add(b)

        now = timezone.now()
        updated = 0
        created = 0
        samples = []

        for bc in barcodes:
            qty = compute_default_limit(
                m14.get(bc, 0), m30.get(bc, 0), m60.get(bc, 0), m90.get(bc, 0)
            )
            if dry:
                if len(samples) < 15:
                    samples.append((bc, qty, m90.get(bc, 0), m30.get(bc, 0)))
                continue
            obj, was_created = BarcodeMaster.objects.get_or_create(
                barcode=bc,
                defaults={
                    "default_inbound_limit_qty": qty,
                    "default_inbound_limit_updated_at": now,
                },
            )
            if was_created:
                created += 1
                updated += 1
            else:
                if (
                    int(obj.default_inbound_limit_qty or 0) != qty
                    or obj.default_inbound_limit_updated_at is None
                ):
                    obj.default_inbound_limit_qty = qty
                    obj.default_inbound_limit_updated_at = now
                    obj.save(
                        update_fields=[
                            "default_inbound_limit_qty",
                            "default_inbound_limit_updated_at",
                            "updated_at",
                        ]
                    )
                    updated += 1
            if len(samples) < 10:
                samples.append((bc, qty))

        self.stdout.write(
            f"[recompute] barcodes={len(barcodes)} updated={updated} created={created}"
        )
        for s in samples:
            self.stdout.write(f"  sample {s}")
        self.stdout.write(self.style.SUCCESS("done"))
