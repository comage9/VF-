# -*- coding: utf-8 -*-
"""재고 현재고 규칙 회귀 테스트 — 이중 차감·예측출고 혼입 재발 방지."""
from datetime import date
from unittest.mock import MagicMock

from django.test import SimpleTestCase

from sales_api.inventory_stock import (
    SNAPSHOT_INCLUDES_AS_OF_DAY_OUTBOUND,
    SNAPSHOT_INCLUDES_AS_OF_DAY_RECEIPTS,
    STOCK_EXCLUDES_ESTIMATED_OUTBOUND,
    compute_current_stock,
    filter_outbound_for_stock,
    is_movement_date_applicable,
    is_outbound_date_applicable,
    movement_after_baseline_lookup,
    outbound_after_baseline_lookup,
    receipt_after_baseline_lookup,
    stock_value,
)


class InventoryStockRuleTests(SimpleTestCase):
    def test_snapshot_is_baseline_only_receipts_and_outbound_by_date(self):
        """스냅샷=기준. 당일 입고 가산, 당일 출고 차감. 우회 없음."""
        self.assertFalse(SNAPSHOT_INCLUDES_AS_OF_DAY_RECEIPTS)
        self.assertFalse(SNAPSHOT_INCLUDES_AS_OF_DAY_OUTBOUND)
        as_of = date(2026, 7, 21)
        self.assertEqual(receipt_after_baseline_lookup(as_of), "gte")
        self.assertEqual(outbound_after_baseline_lookup(as_of), "gte")
        self.assertEqual(movement_after_baseline_lookup(as_of, "receipt"), "gte")
        self.assertEqual(movement_after_baseline_lookup(as_of, "outbound"), "gte")

    def test_same_day_receipt_and_outbound_both_apply(self):
        as_of = date(2026, 7, 21)
        # 당일 입고: 기준에 가산
        self.assertTrue(is_movement_date_applicable(as_of, as_of))
        self.assertTrue(is_movement_date_applicable(date(2026, 7, 22), as_of))
        self.assertFalse(is_movement_date_applicable(date(2026, 7, 20), as_of))
        # 당일 출고: 일자 맞춰 차감
        self.assertTrue(is_outbound_date_applicable(as_of, as_of))
        self.assertTrue(is_outbound_date_applicable(date(2026, 7, 22), as_of))
        self.assertFalse(is_outbound_date_applicable(date(2026, 7, 20), as_of))

    def test_current_stock_subtracts_as_of_day_outbound(self):
        # 7/21 스냅샷 100, 7/21 출고 30 → 현재고 70
        self.assertEqual(
            compute_current_stock(base_qty=100, receipt_qty_after=0, outbound_qty_after=30),
            70,
        )
        # 7/21 스냅샷 100 + 7/22 입고 10 − 7/21~ 출고 30 = 80
        self.assertEqual(
            compute_current_stock(base_qty=100, receipt_qty_after=10, outbound_qty_after=30),
            80,
        )

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

    def test_adjustment_included_in_current_stock(self):
        """조정 전표(+/-)가 현재고 공식에 포함된다."""
        # base 10, rcv 2, out 3, adj -1 → 8
        self.assertEqual(
            compute_current_stock(10, 2, 3, adjustment_qty_after=-1),
            8,
        )
        self.assertEqual(
            compute_current_stock(10, 0, 0, adjustment_qty_after=5),
            15,
        )

    def test_reconcile_delta_builder(self):
        from sales_api.inventory_reconcile import build_reconcile_deltas

        rows = build_reconcile_deltas(
            ledger_qty={"A": 10, "B": 5},
            wms_qty={"A": 8, "B": 5, "C": 2},
            name_by_barcode={"A": "품A", "C": "품C"},
        )
        by = {r["barcode"]: r for r in rows}
        self.assertEqual(by["A"]["qty_delta"], -2)
        self.assertNotIn("B", by)  # match
        self.assertEqual(by["C"]["qty_delta"], 2)

    def test_classify_variance_cause(self):
        from sales_api.inventory_reconcile import (
            CAUSE_AFTER_RECEIPT_GAP,
            CAUSE_LEDGER_ONLY,
            CAUSE_MATCH,
            CAUSE_NO_MOVEMENT_WMS_LOWER,
            classify_variance_cause,
            build_variance_items,
        )

        self.assertEqual(
            classify_variance_cause(
                base_qty=26, receipt_qty=0, outbound_qty=0, ledger_qty=26, wms_qty=22
            ),
            CAUSE_NO_MOVEMENT_WMS_LOWER,
        )
        self.assertEqual(
            classify_variance_cause(
                base_qty=2, receipt_qty=4, outbound_qty=0, ledger_qty=6, wms_qty=5
            ),
            CAUSE_AFTER_RECEIPT_GAP,
        )
        self.assertEqual(
            classify_variance_cause(
                base_qty=3, receipt_qty=0, outbound_qty=0, ledger_qty=3, wms_qty=0
            ),
            CAUSE_LEDGER_ONLY,
        )
        self.assertEqual(
            classify_variance_cause(
                base_qty=1, receipt_qty=0, outbound_qty=0, ledger_qty=1, wms_qty=1
            ),
            CAUSE_MATCH,
        )
        items, summary = build_variance_items(
            base_by_barcode={"A": 26, "B": 1},
            receipt_by_barcode={},
            outbound_by_barcode={},
            ledger_by_barcode={"A": 26, "B": 1},
            wms_by_barcode={"A": 22, "B": 1},
            include_matches=False,
        )
        self.assertEqual(summary["mismatchCount"], 1)
        self.assertEqual(summary["matchCount"], 1)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["barcode"], "A")
