# -*- coding: utf-8 -*-
"""재고 현재고 규칙 회귀 테스트 — 이중 차감 재발 방지."""
from datetime import date

from django.test import SimpleTestCase

from sales_api.inventory_stock import (
    SNAPSHOT_INCLUDES_AS_OF_DAY_MOVEMENTS,
    compute_current_stock,
    is_movement_date_applicable,
    movement_after_baseline_lookup,
    stock_value,
)


class InventoryStockRuleTests(SimpleTestCase):
    def test_snapshot_is_post_outbound_closing(self):
        self.assertTrue(SNAPSHOT_INCLUDES_AS_OF_DAY_MOVEMENTS)
        self.assertEqual(movement_after_baseline_lookup(date(2026, 7, 14)), "gt")

    def test_same_day_movement_not_applied(self):
        as_of = date(2026, 7, 14)
        # 기준일 당일 출고는 스냅샷에 이미 반영 → 재적용 금지
        self.assertFalse(is_movement_date_applicable(as_of, as_of))
        # 다음 날부터 적용
        self.assertTrue(is_movement_date_applicable(date(2026, 7, 15), as_of))
        # 이전 날은 미적용
        self.assertFalse(is_movement_date_applicable(date(2026, 7, 13), as_of))

    def test_no_double_subtract_same_day_outbound(self):
        # baseline 2, same-day outbound 2 already in snapshot → current stays 2
        # (if wrongly using gte, would become 0)
        self.assertEqual(compute_current_stock(base_qty=2, receipt_qty_after=0, outbound_qty_after=0), 2)
        # next day outbound 1
        self.assertEqual(compute_current_stock(base_qty=2, receipt_qty_after=0, outbound_qty_after=1), 1)

    def test_stock_value_clamps_negative(self):
        self.assertEqual(stock_value(-3, 1000), 0)
        self.assertEqual(stock_value(5, 1000), 5000)
