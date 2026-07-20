# -*- coding: utf-8 -*-
"""재고 현재고 규칙 회귀 테스트 — 이중 차감·예측출고 혼입 재발 방지."""
from datetime import date
from unittest.mock import MagicMock

from django.test import SimpleTestCase

from sales_api.inventory_stock import (
    SNAPSHOT_INCLUDES_AS_OF_DAY_MOVEMENTS,
    STOCK_EXCLUDES_ESTIMATED_OUTBOUND,
    compute_current_stock,
    filter_outbound_for_stock,
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

    def test_estimated_outbound_excluded_from_stock_filter(self):
        """예측 출고는 재고 집계 QuerySet에서 제외해야 함."""
        self.assertTrue(STOCK_EXCLUDES_ESTIMATED_OUTBOUND)
        qs = MagicMock()
        qs.filter.return_value = "filtered"
        result = filter_outbound_for_stock(qs)
        qs.filter.assert_called_once_with(is_estimated=False)
        self.assertEqual(result, "filtered")

    def test_alias_outbound_allocated_to_stocked_barcode(self):
        """같은 상품명: 출고가 다른 바코드로 잡혀도 재고 있는 바코드로 배분."""
        from sales_api.inventory_stock import allocate_alias_movements

        base = {"R-A": 31, "R-B": 4}
        out = {"R-A": 2, "R-B": 7}  # 매출은 R-B 위주
        rcv = {"R-B": 7}
        names = {"R-A": "슬림 서랍장 6단 화이트", "R-B": "슬림 서랍장 6단 화이트"}
        out_a, rcv_a = allocate_alias_movements(
            base_by_barcode=base,
            outbound_raw=out,
            receipt_raw=rcv,
            name_by_barcode=names,
        )
        # 총 출고 9, 총 입고 7 이 비율 배분되어 합이 보존
        self.assertEqual(sum(out_a.values()), 9)
        self.assertEqual(sum(rcv_a.values()), 7)
        # 재고 큰 R-A 에 출고 배분이 더 많아야 함
        self.assertGreaterEqual(out_a.get("R-A", 0), out_a.get("R-B", 0))
        cur_a = compute_current_stock(31, rcv_a.get("R-A", 0), out_a.get("R-A", 0))
        cur_b = compute_current_stock(4, rcv_a.get("R-B", 0), out_a.get("R-B", 0))
        self.assertEqual(cur_a + cur_b, 31 + 4 + 7 - 9)
