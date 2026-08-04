# -*- coding: utf-8 -*-
"""LS 호차 슬롯 매핑 · 완료 조건 (1·3호만 먼저 배차 시나리오)."""
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

# backend 루트를 path 에
BACKEND = Path(__file__).resolve().parents[2]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
import django

django.setup()

from departure.services.vehicle_order import VehicleOrderService


class LsHocheSlotTests(unittest.TestCase):
    def setUp(self):
        self.svc = VehicleOrderService()

    def test_template_id_map(self):
        self.assertEqual(self.svc.hoche_from_template_id(90626), 1)
        self.assertEqual(self.svc.hoche_from_template_id(90628), 2)
        self.assertEqual(self.svc.hoche_from_template_id(90269), 3)
        self.assertIsNone(self.svc.hoche_from_template_id(None))
        self.assertIsNone(self.svc.hoche_from_template_id(99999))

    def test_dock_time_nearest_slot(self):
        self.assertEqual(self.svc.hoche_from_dock_time("20:00"), 1)
        self.assertEqual(self.svc.hoche_from_dock_time("22:00"), 2)
        self.assertEqual(self.svc.hoche_from_dock_time("23:50"), 3)
        # 중간 시각도 최근접
        self.assertEqual(self.svc.hoche_from_dock_time("21:00"), 1)  # 20:00과 거리=60, 22:00=60 → 작은 호차
        self.assertEqual(self.svc.hoche_from_dock_time("22:30"), 2)
        self.assertEqual(self.svc.hoche_from_dock_time("23:40"), 3)

    def test_one_and_three_only_keeps_slot_gap(self):
        """LS에 1호(20:00)+3호(23:50)만 있을 때 2호 슬롯 비움."""
        used = set()
        h1 = self.svc.resolve_ls_hoche(
            time_str="20:00", template_id=90626, plate="경기86자5342", used_hoches=used
        )
        used.add(h1)
        h3 = self.svc.resolve_ls_hoche(
            time_str="23:50", template_id=90269, plate="광주90바1703", used_hoches=used
        )
        used.add(h3)
        self.assertEqual(h1, 1)
        self.assertEqual(h3, 3)
        self.assertNotIn(2, used)

        # 이후 2호 배차
        h2 = self.svc.resolve_ls_hoche(
            time_str="22:01", template_id=90628, plate="서울80바4103", used_hoches=used
        )
        self.assertEqual(h2, 2)

    def test_time_only_without_template(self):
        used = set()
        h1 = self.svc.resolve_ls_hoche(time_str="20:00", used_hoches=used)
        used.add(h1)
        h3 = self.svc.resolve_ls_hoche(time_str="23:50", used_hoches=used)
        self.assertEqual((h1, h3), (1, 3))


class DayCompleteLocalTests(unittest.TestCase):
    def test_two_vehicles_not_complete(self):
        import ls_automation as la

        with tempfile.TemporaryDirectory() as td:
            day = "2026-07-26"
            orders = [
                {"truckRequestId": 1, "plateNumber": "A", "requestTimeEpoch": 1},
                {"truckRequestId": 2, "plateNumber": "B", "requestTimeEpoch": 2},
            ]
            path = os.path.join(td, f"ls_orders_{day}.json")
            import json

            with open(path, "w", encoding="utf-8") as f:
                json.dump(orders, f)

            with patch.object(la, "DATA_DIR", td), patch.object(
                la, "_count_registered_plates", return_value=2
            ), patch.object(la, "is_already_downloaded", return_value=True):
                done, reason = la.check_day_complete_local(day, min_vehicles=3)
            self.assertFalse(done)
            self.assertIn("최소 3", reason)

    def test_three_vehicles_complete(self):
        import ls_automation as la

        with tempfile.TemporaryDirectory() as td:
            day = "2026-07-26"
            orders = [
                {"truckRequestId": 1, "plateNumber": "A"},
                {"truckRequestId": 2, "plateNumber": "B"},
                {"truckRequestId": 3, "plateNumber": "C"},
            ]
            path = os.path.join(td, f"ls_orders_{day}.json")
            import json

            with open(path, "w", encoding="utf-8") as f:
                json.dump(orders, f)

            with patch.object(la, "DATA_DIR", td), patch.object(
                la, "_count_registered_plates", return_value=3
            ), patch.object(la, "is_already_downloaded", return_value=True):
                done, reason = la.check_day_complete_local(day, min_vehicles=3)
            self.assertTrue(done)
            self.assertIn("완료", reason)


if __name__ == "__main__":
    unittest.main()
