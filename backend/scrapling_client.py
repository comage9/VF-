# -*- coding: utf-8 -*-
"""
Scrapling 공식 API 래퍼 (https://github.com/D4Vinci/Scrapling)

설치:
  pip install "scrapling[fetchers]"
  scrapling install   # Dynamic/Stealthy 브라우저 바이너리 (최초 1회)

Fetcher 선택 가이드 (공식 docs):
  - Fetcher / FetcherSession
      HTTP + TLS impersonate (chrome). 빠름. API JSON·정적 HTML.
  - StealthyFetcher / StealthySession
      스텔스 브라우저. Cloudflare Turnstile 등 우회. 로그인 페이지·봇 차단 사이트.
  - DynamicFetcher / DynamicSession
      Playwright Chromium/Chrome 전체 자동화. SPA·JS 렌더링 필수 화면.

VF 사용:
  - LS 주문 API JSON  → FetcherSession(impersonate='chrome') + 쿠키
  - KPP WPPS 로그인/HTML → StealthySession 또는 DynamicSession (headless=False 권장)
  - PDF 바이너리      → FetcherSession.get 후 content / body
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional, Union

log = logging.getLogger("scrapling_client")

SCRAPLING_READY = False
_IMPORT_ERROR = ""

try:
    from scrapling.fetchers import (
        Fetcher,
        FetcherSession,
        StealthyFetcher,
        DynamicFetcher,
    )

    SCRAPLING_READY = True
except Exception as e:  # pragma: no cover
    _IMPORT_ERROR = str(e)
    Fetcher = None  # type: ignore
    FetcherSession = None  # type: ignore
    StealthyFetcher = None  # type: ignore
    DynamicFetcher = None  # type: ignore


def status() -> Dict[str, Any]:
    return {
        "ready": SCRAPLING_READY,
        "error": _IMPORT_ERROR or None,
        "import": "from scrapling.fetchers import Fetcher, FetcherSession, StealthyFetcher, DynamicFetcher",
        "docs": "https://scrapling.readthedocs.io/en/latest/",
        "github": "https://github.com/D4Vinci/Scrapling",
    }


def _cookies_to_dict(cookies: Optional[Union[dict, str]]) -> dict:
    if not cookies:
        return {}
    if isinstance(cookies, dict):
        return dict(cookies)
    # "a=1; b=2"
    out = {}
    for part in str(cookies).split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def _response_json(page) -> Any:
    """Scrapling Response → JSON (dict/list)."""
    if page is None:
        return None
    # 일부 버전: page.json
    if hasattr(page, "json") and callable(page.json):
        try:
            return page.json()
        except Exception:
            pass
    body = None
    for attr in ("body", "text", "content", "html"):
        if hasattr(page, attr):
            body = getattr(page, attr)
            if callable(body):
                try:
                    body = body()
                except Exception:
                    continue
            if body is not None:
                break
    if body is None:
        return None
    if isinstance(body, (bytes, bytearray)):
        body = body.decode("utf-8", errors="replace")
    if isinstance(body, str):
        body = body.strip()
        if not body:
            return None
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return None
    return body


def _response_status(page) -> int:
    for attr in ("status", "status_code", "statusCode"):
        if hasattr(page, attr):
            try:
                return int(getattr(page, attr) or 0)
            except Exception:
                pass
    return 0


def _response_bytes(page) -> bytes:
    if page is None:
        return b""
    for attr in ("body", "content"):
        if hasattr(page, attr):
            v = getattr(page, attr)
            if callable(v):
                try:
                    v = v()
                except Exception:
                    continue
            if isinstance(v, (bytes, bytearray)):
                return bytes(v)
            if isinstance(v, str):
                return v.encode("utf-8", errors="replace")
    if hasattr(page, "text"):
        t = page.text
        if callable(t):
            t = t()
        if isinstance(t, str):
            return t.encode("utf-8", errors="replace")
    return b""


def http_get_json(
    url: str,
    *,
    cookies: Optional[Union[dict, str]] = None,
    headers: Optional[dict] = None,
    params: Optional[dict] = None,
    impersonate: str = "chrome",
    timeout: int = 30,
) -> Dict[str, Any]:
    """
    FetcherSession + chrome TLS impersonate 로 JSON GET.
    Returns: {ok, status, data, error, engine}
    """
    if not SCRAPLING_READY:
        return {
            "ok": False,
            "status": 0,
            "data": None,
            "error": f"scrapling not installed: {_IMPORT_ERROR}",
            "engine": None,
        }

    jar = _cookies_to_dict(cookies)
    hdrs = dict(headers or {})

    try:
        with FetcherSession(impersonate=impersonate) as session:
            page = session.get(
                url,
                cookies=jar or None,
                headers=hdrs or None,
                params=params or None,
                stealthy_headers=True,
                timeout=timeout,
            )
        st = _response_status(page)
        data = _response_json(page)
        return {
            "ok": st == 200 and data is not None,
            "status": st,
            "data": data,
            "error": None if st == 200 else f"HTTP {st}",
            "engine": "scrapling.FetcherSession",
        }
    except Exception as e:
        log.warning("http_get_json failed: %s", e)
        return {
            "ok": False,
            "status": 0,
            "data": None,
            "error": str(e),
            "engine": "scrapling.FetcherSession",
        }


def http_get_bytes(
    url: str,
    *,
    cookies: Optional[Union[dict, str]] = None,
    headers: Optional[dict] = None,
    impersonate: str = "chrome",
    timeout: int = 60,
) -> Dict[str, Any]:
    """PDF 등 바이너리 GET."""
    if not SCRAPLING_READY:
        return {
            "ok": False,
            "status": 0,
            "content": b"",
            "error": f"scrapling not installed: {_IMPORT_ERROR}",
            "engine": None,
        }
    jar = _cookies_to_dict(cookies)
    try:
        with FetcherSession(impersonate=impersonate) as session:
            page = session.get(
                url,
                cookies=jar or None,
                headers=headers or None,
                stealthy_headers=True,
                timeout=timeout,
            )
        st = _response_status(page)
        content = _response_bytes(page)
        return {
            "ok": st == 200 and len(content) > 0,
            "status": st,
            "content": content,
            "error": None if st == 200 else f"HTTP {st}",
            "engine": "scrapling.FetcherSession",
        }
    except Exception as e:
        return {
            "ok": False,
            "status": 0,
            "content": b"",
            "error": str(e),
            "engine": "scrapling.FetcherSession",
        }


def stealth_get_html(
    url: str,
    *,
    headless: bool = True,
    network_idle: bool = True,
    solve_cloudflare: bool = False,
    timeout: int = 60,
) -> Dict[str, Any]:
    """
    StealthyFetcher — 봇 차단/Turnstile 대응 HTML 조회.
    KPP 로그인 페이지 구조 확인·정적 파싱용.
    """
    if not SCRAPLING_READY:
        return {
            "ok": False,
            "html": "",
            "error": f"scrapling not installed: {_IMPORT_ERROR}",
            "engine": None,
        }
    try:
        StealthyFetcher.adaptive = True
        page = StealthyFetcher.fetch(
            url,
            headless=headless,
            network_idle=network_idle,
            solve_cloudflare=solve_cloudflare,
            timeout=timeout,
        )
        html = ""
        if hasattr(page, "html"):
            html = page.html if not callable(page.html) else page.html()
        elif hasattr(page, "body"):
            b = page.body if not callable(page.body) else page.body()
            html = b.decode("utf-8", errors="replace") if isinstance(b, (bytes, bytearray)) else str(b or "")
        return {
            "ok": bool(html),
            "html": html or "",
            "status": _response_status(page),
            "error": None,
            "engine": "scrapling.StealthyFetcher",
            "css_title": page.css("title::text").get() if hasattr(page, "css") else None,
        }
    except Exception as e:
        return {
            "ok": False,
            "html": "",
            "error": str(e),
            "engine": "scrapling.StealthyFetcher",
        }


def dynamic_get_html(
    url: str,
    *,
    headless: bool = False,
    network_idle: bool = True,
    timeout: int = 60,
) -> Dict[str, Any]:
    """
    DynamicFetcher — Playwright 기반 실제 브라우저 (JS SPA).
    KPP WPPS 로그인 후 화면 등.
    """
    if not SCRAPLING_READY:
        return {
            "ok": False,
            "html": "",
            "error": f"scrapling not installed: {_IMPORT_ERROR}",
            "engine": None,
        }
    try:
        page = DynamicFetcher.fetch(
            url,
            headless=headless,
            network_idle=network_idle,
            timeout=timeout,
        )
        html = ""
        if hasattr(page, "html"):
            html = page.html if not callable(page.html) else page.html()
        return {
            "ok": True,
            "html": html or "",
            "status": _response_status(page),
            "error": None,
            "engine": "scrapling.DynamicFetcher",
            "css_title": page.css("title::text").get() if hasattr(page, "css") else None,
        }
    except Exception as e:
        return {
            "ok": False,
            "html": "",
            "error": str(e),
            "engine": "scrapling.DynamicFetcher",
        }
