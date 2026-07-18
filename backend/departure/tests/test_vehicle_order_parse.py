# -*- coding: utf-8 -*-
"""차량 순서 입력 — 다양한 형식 파서 테스트."""
from django.test import SimpleTestCase

from departure.services.vehicle_order import VehicleOrderService


class VehicleOrderParseTests(SimpleTestCase):
    def setUp(self):
        self.svc = VehicleOrderService()

    def test_dispatch_table_spaces(self):
        line = "1호    VF67(유원)    부천1HUB    충북80아3912    김창기    010-7774-8114    5    20:00"
        p = self.svc.parse_order_line(line)
        self.assertEqual(p["hoche"], 1)
        self.assertEqual(p["plate"], "충북80아3912")
        self.assertEqual(p["driver"], "김창기")
        self.assertEqual(p["phone"], "010-7774-8114")
        self.assertEqual(p["ton"], "5T")
        self.assertEqual(p["time"], "20:00")
        self.assertEqual(p["hub"], "부천1HUB")

    def test_glued_hoche_and_tab(self):
        line = "1호VF67(유원)\t부천1HUB\t충북80아3912\t김창기\t010-7774-8114\t5\t20:00"
        p = self.svc.parse_order_line(line)
        self.assertEqual(p["hoche"], 1)
        self.assertEqual(p["plate"], "충북80아3912")

    def test_bracket_format(self):
        line = "[부천1HUB][2호] 경기82바8956 010-4003-0297"
        p = self.svc.parse_order_line(line)
        self.assertEqual(p["hoche"], 2)
        self.assertEqual(p["hub"], "부천1HUB")
        self.assertEqual(p["plate"], "경기82바8956")
        self.assertEqual(p["phone"], "010-4003-0297")

    def test_minimal_plate_phone_time(self):
        line = "3호 광주90바1703 김경옥 11T 23:50"
        p = self.svc.parse_order_line(line)
        self.assertEqual(p["hoche"], 3)
        self.assertEqual(p["plate"], "광주90바1703")
        self.assertEqual(p["driver"], "김경옥")
        self.assertEqual(p["ton"], "11T")
        self.assertEqual(p["time"], "23:50")

    def test_mixed_block_sorted_by_hoche(self):
        text = """
3호    VF67(유원)    부천1HUB    광주90바1703    김경옥    010-2078-8556    11    23:50
1호    VF67(유원)    부천1HUB    충북80아3912    김창기    010-7774-8114    5    20:00
2호    VF67(유원)    부천1HUB    경기82바8956    김창배    010-4003-0297    5    22:00
[부천1HUB][2호] 경기82바8956 010-9999-0000
"""
        parsed = self.svc.parse_order_text(text)
        self.assertEqual([p["hoche"] for p in parsed], [1, 2, 3])
        # 동일 호차 2줄 → 마지막 비어있지 않은 값 병합
        self.assertEqual(parsed[1]["plate"], "경기82바8956")
        self.assertEqual(parsed[1]["phone"], "010-9999-0000")

    def test_csv_like_commas(self):
        line = "1호,부천1HUB,충북80아3912,김창기,010-7774-8114,5,20:00"
        p = self.svc.parse_order_line(line)
        self.assertIsNotNone(p)
        self.assertEqual(p["hoche"], 1)
        self.assertEqual(p["plate"], "충북80아3912")
        self.assertEqual(p["phone"], "010-7774-8114")
