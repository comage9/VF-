# -*- coding: utf-8 -*-
"""
재고 현재고 구성 진단 (read-only).

  python manage.py diagnose_inventory_stock
  python manage.py diagnose_inventory_stock --barcode Rxxxx
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import Count, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from sales_api.inventory_stock import (
    aggregate_adjustments_after_baseline,
    aggregate_movements_after_baseline,
    compute_current_stock,
    stock_value,
)
from sales_api.inventory_reconcile import receipt_calendar_gaps
from sales_api.models import (
    InventoryBaselineItem,
    InventoryBaselineUpload,
    InventoryReceiptItem,
    InventoryStockAdjustment,
    MasterSpec,
    OutboundRecord,
)


class Command(BaseCommand):
    help = "Print inventory stock breakdown (baseline + receipts - outbound + adjustments)"

    def add_arguments(self, parser):
        parser.add_argument("--barcode", type=str, default="")

    def handle(self, *args, **options):
        latest = InventoryBaselineUpload.objects.order_by("-uploaded_at").first()
        if not latest:
            self.stdout.write(self.style.ERROR("No baseline upload"))
            return

        as_of = latest.as_of_date
        self.stdout.write(f"as_of={as_of} uploaded_at={latest.uploaded_at}")
        self.stdout.write(f"today={timezone.localdate()}")

        bc_filter = (options.get("barcode") or "").strip()
        items_qs = InventoryBaselineItem.objects.filter(upload=latest)
        if bc_filter:
            items_qs = items_qs.filter(barcode=bc_filter)

        items = list(items_qs)
        bcs = [(i.barcode or "").strip() for i in items if (i.barcode or "").strip()]
        base_sum = sum(int(i.quantity_box or 0) for i in items)

        out_agg, rcv_agg = aggregate_movements_after_baseline(
            as_of=as_of,
            barcodes=bcs,
            outbound_model=OutboundRecord,
            receipt_model=InventoryReceiptItem,
        )
        adj_agg = aggregate_adjustments_after_baseline(
            as_of=as_of,
            barcodes=bcs,
            adjustment_model=InventoryStockAdjustment,
        )
        out_sum = sum(out_agg.values())
        rcv_sum = sum(rcv_agg.values())
        adj_sum = sum(adj_agg.values())

        from sales_api.inventory_stock import outbound_after_baseline_lookup

        _olk = outbound_after_baseline_lookup(as_of)
        out_rows = OutboundRecord.objects.filter(
            is_estimated=False, **{f"outbound_date__{_olk}": as_of}
        )
        rcv_rows = InventoryReceiptItem.objects.filter(receipt_date__gt=as_of)
        if bc_filter:
            out_rows = out_rows.filter(barcode=bc_filter)
            rcv_rows = rcv_rows.filter(barcode=bc_filter)

        price_by_bc = {}
        for s in MasterSpec.objects.exclude(barcode="").only("barcode", "price"):
            bc = (s.barcode or "").strip()
            p = int(s.price or 0)
            if bc and p > 0 and bc not in price_by_bc:
                price_by_bc[bc] = p

        total_qty = 0
        total_val = 0
        for it in items:
            bc = (it.barcode or "").strip()
            cur = compute_current_stock(
                it.quantity_box,
                rcv_agg.get(bc, 0),
                out_agg.get(bc, 0),
                adj_agg.get(bc, 0),
            )
            total_qty += max(0, cur)
            total_val += stock_value(cur, price_by_bc.get(bc, 0))

        self.stdout.write("--- 구성 ---")
        self.stdout.write(f"baseline items: {len(items)}  sum_qty: {base_sum}")
        self.stdout.write(
            f"receipts after as_of: rows={rcv_rows.count()}  sum_qty={rcv_sum}"
        )
        self.stdout.write(
            f"outbound after as_of (real only): rows={out_rows.count()}  sum_qty={out_sum}"
        )
        self.stdout.write(f"adjustments after as_of: sum_qty={adj_sum}")
        self.stdout.write(
            f"current_stock total (clamped>=0): qty={total_qty}  value={total_val:,}"
        )
        self.stdout.write(
            f"formula check: {base_sum} + {rcv_sum} - {out_sum} + {adj_sum} "
            f"= {base_sum + rcv_sum - out_sum + adj_sum}"
        )
        health = receipt_calendar_gaps(
            as_of,
            timezone.localdate(),
            list(rcv_rows.values_list("receipt_date", flat=True).distinct()),
            list(out_rows.values_list("outbound_date", flat=True).distinct()),
        )
        gaps = health.get("outbound_days_without_receipt_upload") or []
        if gaps:
            self.stdout.write(
                self.style.WARNING(
                    f"드리프트 경고: 출고 있으나 입고 업로드 없는 날: {', '.join(gaps)}"
                )
            )

        daily_out = (
            out_rows.values("outbound_date")
            .annotate(q=Coalesce(Sum("box_quantity"), 0), c=Count("id"))
            .order_by("outbound_date")
        )
        self.stdout.write("--- 기준일 이후 일별 실출고 ---")
        for row in daily_out:
            self.stdout.write(
                f"  {row['outbound_date']}: qty={row['q']} rows={row['c']}"
            )

        daily_rcv = (
            rcv_rows.values("receipt_date")
            .annotate(q=Coalesce(Sum("quantity_box"), 0), c=Count("id"))
            .order_by("receipt_date")
        )
        self.stdout.write("--- 기준일 이후 일별 입고 ---")
        for row in daily_rcv:
            self.stdout.write(
                f"  {row['receipt_date']}: qty={row['q']} rows={row['c']}"
            )
