# -*- coding: utf-8 -*-
"""파괴 API 가드 단위 테스트 (env 토글)."""
import os
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from rest_framework import status

from sales_api.api_guards import destructive_api_guard, destructive_guard_response


class DestructiveGuardTests(SimpleTestCase):
    def test_no_key_configured_allows(self):
        with patch.dict(os.environ, {"DESTRUCTIVE_API_KEY": ""}, clear=False):
            os.environ.pop("DESTRUCTIVE_API_KEY", None)
            req = MagicMock()
            req.headers = {}
            req.query_params = {}
            self.assertIsNone(destructive_guard_response(req))

    def test_key_required_when_configured(self):
        with patch.dict(os.environ, {"DESTRUCTIVE_API_KEY": "secret-test"}, clear=False):
            req = MagicMock()
            req.headers = {}
            req.query_params = {}
            req.GET = {}
            blocked = destructive_guard_response(req)
            self.assertIsNotNone(blocked)
            self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)

            req2 = MagicMock()
            req2.headers = {"X-VF-Destructive-Key": "secret-test"}
            req2.query_params = {}
            self.assertIsNone(destructive_guard_response(req2))

    def test_decorator_passthrough_without_key(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DESTRUCTIVE_API_KEY", None)

            @destructive_api_guard
            def view(request):
                return "ok"

            self.assertEqual(view(MagicMock()), "ok")
