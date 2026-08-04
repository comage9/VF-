# -*- coding: utf-8 -*-
"""
ProductionLog 유니크 키 영향 분석 (read-only).

현재 unique: date+machine+mold+product+color1+color2+unit+quantity+unit_quantity
권장 비즈 키: date+machine+mold+product+color1+color2+unit  (수량 제외)

migration 전에 반드시 dry-run으로 확인.
"""
from __future__ import annotations

from collections import defaultdict

from django.core.management.base import BaseCommand
from django.db.models import Count

from sales_api.models import ProductionLog


class Command(BaseCommand):
    help = "Analyze ProductionLog natural-key collisions (read-only)"

    def handle(self, *args, **options):
        # Biz key without quantities
        rows = ProductionLog.objects.values(
            "date",
            "machine_number",
            "mold_number",
            "product_name",
            "color1",
            "color2",
            "unit",
        ).annotate(c=Count("id")).filter(c__gt=1).order_by("-c")

        multi = list(rows)
        self.stdout.write(f"biz-key multi-row groups: {len(multi)}")

        # Among multi, how many have distinct quantities
        samples = []
        diff_qty_groups = 0
        for g in multi[:200]:
            qs = ProductionLog.objects.filter(
                date=g["date"],
                machine_number=g["machine_number"],
                mold_number=g["mold_number"],
                product_name=g["product_name"],
                color1=g["color1"],
                color2=g["color2"],
                unit=g["unit"],
            ).values_list("id", "quantity", "unit_quantity", "status", "total")
            items = list(qs)
            qtys = {(q, u) for _, q, u, _, _ in items}
            if len(qtys) > 1:
                diff_qty_groups += 1
            if len(samples) < 10:
                samples.append(
                    {
                        "date": str(g["date"]),
                        "machine": g["machine_number"],
                        "product": (g["product_name"] or "")[:40],
                        "count": g["c"],
                        "qty_pairs": list(qtys)[:5],
                    }
                )

        # Full scan for diff qty among all multi groups
        if len(multi) > 200:
            for g in multi[200:]:
                qs = ProductionLog.objects.filter(
                    date=g["date"],
                    machine_number=g["machine_number"],
                    mold_number=g["mold_number"],
                    product_name=g["product_name"],
                    color1=g["color1"],
                    color2=g["color2"],
                    unit=g["unit"],
                ).values_list("quantity", "unit_quantity")
                if len(set(qs)) > 1:
                    diff_qty_groups += 1

        self.stdout.write(f"biz-key groups with different qty: {diff_qty_groups}")
        self.stdout.write(
            "NOTE: Cannot safely drop quantity from UniqueConstraint until "
            "these groups are merged or business rule is decided."
        )
        for s in samples:
            self.stdout.write(
                f"  {s['date']} m={s['machine']} {s['product']!r} "
                f"n={s['count']} qtys={s['qty_pairs']}"
            )
