# -*- coding: utf-8 -*-
"""
파괴적 API 가드.

DESTRUCTIVE_API_KEY 환경변수가 설정된 경우에만 강제.
미설정 시 기존 동작 유지 (실서비스 프론트 호환).

헤더: X-VF-Destructive-Key: <key>
또는 쿼리: ?destructive_key=<key>
"""
from __future__ import annotations

import os
from functools import wraps

from rest_framework import status
from rest_framework.response import Response


def _expected_destructive_key() -> str:
    return (os.environ.get("DESTRUCTIVE_API_KEY") or "").strip()


def _provided_destructive_key(request) -> str:
    header = ""
    try:
        header = (request.headers.get("X-VF-Destructive-Key") or "").strip()
    except Exception:
        header = ""
    if header:
        return header
    # DRF Request / Django HttpRequest
    try:
        qp = getattr(request, "query_params", None) or request.GET
        return (qp.get("destructive_key") or "").strip()
    except Exception:
        return ""


def destructive_guard_response(request):
    """
    파괴 작업 직전 호출. 통과 시 None, 거부 시 Response.
    DESTRUCTIVE_API_KEY 미설정 시 항상 None (기존 동작).
    """
    expected = _expected_destructive_key()
    if not expected:
        return None
    if _provided_destructive_key(request) != expected:
        return Response(
            {
                "success": False,
                "error": "destructive API key required",
                "hint": "Set header X-VF-Destructive-Key or query destructive_key. "
                "Key is configured via DESTRUCTIVE_API_KEY env.",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def destructive_api_guard(view_func):
    """
    전량 삭제·광범위 삭제 등 파괴 엔드포인트용 데코레이터.
    env DESTRUCTIVE_API_KEY 가 비어 있으면 no-op.
    """

    @wraps(view_func)
    def _wrapped(request, *args, **kwargs):
        blocked = destructive_guard_response(request)
        if blocked is not None:
            return blocked
        return view_func(request, *args, **kwargs)

    return _wrapped
