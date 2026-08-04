# -*- coding: utf-8 -*-
from datetime import date
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from sales_api.outbound_estimates import _as_date, delete_estimates_for_dates


class OutboundEstimatesHelperTests(SimpleTestCase):
    def test_as_date(self):
        self.assertEqual(_as_date(date(2025, 7, 1)), date(2025, 7, 1))
        self.assertEqual(_as_date("2025-07-01"), date(2025, 7, 1))
        self.assertIsNone(_as_date("bad"))

    def test_delete_estimates_dry_run(self):
        with patch("sales_api.outbound_estimates.OutboundRecord") as M:
            qs = MagicMock()
            qs.count.return_value = 5
            M.objects.filter.return_value = qs
            result = delete_estimates_for_dates(
                [date(2025, 8, 1)], dry_run=True
            )
            self.assertTrue(result["dry_run"])
            self.assertEqual(result["deleted"], 5)
            qs.delete.assert_not_called()
