# -*- coding: utf-8 -*-
"""
KPP WPPS 자동화 — Scrapling 우선 (https://github.com/D4Vinci/Scrapling)

역할 분담:
  1) Scrapling FetcherSession
       - 로그인 후 쿠키로 가벼운 HTTP 조회 (가능 시)
  2) Scrapling StealthyFetcher / DynamicFetcher
       - 봇 차단·SPA HTML 확인
  3) kpp_session.py (Chrome CDP :9222)
       - 실제 로그인 UI·PBM140MW SpreadJS 등록·EDI 출력
         (그리드 조작은 CDP가 안정적 — 기존 스킬 검증됨)

URL (실서버):
  HOME     https://wpps.logisall.net/
  LOGIN    https://wpps.logisall.net/login
  PBM140MW https://wpps.logisall.net/ps/PBM140MW   ← 출하통보등록
  PBM110MW https://wpps.logisall.net/ps/PBM110MW

실행:
  python kpp_automation.py --status
  python kpp_automation.py --probe-login     # Stealthy로 로그인 페이지 구조 확인
  python kpp_automation.py --session all     # CDP: 로그인 페이지 → (수동/자동) → PBM140
  python kpp_automation.py --session register
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from typing import Any, Dict

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(BASE_DIR, ".env")

WPPS_HOME = "https://wpps.logisall.net/"
WPPS_LOGIN = "https://wpps.logisall.net/login"
PBM140_URL = "https://wpps.logisall.net/ps/PBM140MW"
PBM110_URL = "https://wpps.logisall.net/ps/PBM110MW"


def load_env() -> dict:
    env = {}
    if os.path.isfile(ENV_PATH):
        with open(ENV_PATH, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    for k in (
        "KPP_USERNAME",
        "KPP_PASSWORD",
        "KPP_ID",
        "KPP_PW",
        "KPP_id",
        "KPP_password",
    ):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


def scrapling_probe_login_page(headless: bool = True) -> Dict[str, Any]:
    """
    Scrapling StealthyFetcher 로 로그인 페이지 HTML/셀렉터 확인.
    (실제 로그인·SpreadJS 는 kpp_session CDP 권장)
    """
    from scrapling_client import SCRAPLING_READY, stealth_get_html, status

    st = status()
    if not SCRAPLING_READY:
        return {"ok": False, "error": "Scrapling 미설치", "scrapling": st}

    print("[KPP] Scrapling StealthyFetcher → 로그인 페이지")
    res = stealth_get_html(WPPS_LOGIN, headless=headless, network_idle=True)
    if not res.get("ok"):
        # Stealthy 실패 시 Dynamic 폴백
        print(f"[KPP] Stealthy 실패: {res.get('error')} → DynamicFetcher 시도")
        from scrapling_client import dynamic_get_html

        res = dynamic_get_html(WPPS_LOGIN, headless=headless, network_idle=True)

    html = res.get("html") or ""
    # 간단 셀렉터 힌트
    hints = {
        "has_loginId": 'id="loginId"' in html or "loginId" in html,
        "has_password": 'type="password"' in html or 'id="password"' in html,
        "title": res.get("css_title"),
        "html_len": len(html),
        "engine": res.get("engine"),
    }
    print(f"[KPP] probe: {hints}")
    return {"ok": res.get("ok"), "hints": hints, "engine": res.get("engine"), "error": res.get("error")}


def run_session(step: str = "all", wait: int = 180) -> Dict[str, Any]:
    """kpp_session (CDP) 위임 — Scrapling과 병행 사용."""
    import kpp_session as ks

    if step == "status":
        return ks.step_status()
    if step == "launch":
        return ks.step_launch()
    if step == "login":
        return ks.step_login(wait_manual_sec=wait)
    if step == "register":
        return ks.step_register()
    # all
    r1 = ks.step_launch()
    r2 = ks.step_login(wait_manual_sec=wait)
    r3 = {"ok": False, "skipped": True}
    if r2.get("ok"):
        r3 = ks.step_register()
    return {"launch": r1, "login": r2, "register": r3}


def main():
    parser = argparse.ArgumentParser(description="KPP + Scrapling")
    parser.add_argument("--status", action="store_true", help="Scrapling/CDP 상태")
    parser.add_argument("--probe-login", action="store_true", help="Stealthy로 로그인 HTML 프로브")
    parser.add_argument("--no-headless", action="store_true", help="브라우저 표시")
    parser.add_argument(
        "--session",
        choices=["launch", "login", "register", "status", "all"],
        help="CDP 세션 단계 (kpp_session)",
    )
    parser.add_argument("--wait", type=int, default=180, help="수동 로그인 대기 초")
    args = parser.parse_args()

    from scrapling_client import status as scrapling_status

    print("=" * 60)
    print(" KPP + Scrapling")
    print(f"  time={datetime.now().isoformat(timespec='seconds')}")
    print("=" * 60)
    print("[Scrapling]", json.dumps(scrapling_status(), ensure_ascii=False))

    if args.status and not args.session:
        try:
            import kpp_session as ks

            print("[CDP]", json.dumps(ks.step_status(), ensure_ascii=False, indent=2))
        except Exception as e:
            print("[CDP]", e)
        return

    if args.probe_login:
        r = scrapling_probe_login_page(headless=not args.no_headless)
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return

    if args.session:
        r = run_session(args.session, wait=args.wait)
        print(json.dumps(r, ensure_ascii=False, indent=2))
        return

    # 기본: 상태 + 사용법
    print(
        """
사용법:
  # 1) Scrapling 으로 로그인 페이지 구조 확인
  python kpp_automation.py --probe-login

  # 2) Chrome CDP 로 로그인 → 출하통보등록 (같이 진행)
  python kpp_automation.py --session all
  python kpp_session.py --step all

  # 3) Departure 화면 [📦 KPP] 출력 (PBM140 탭 열린 상태)

.env:
  KPP_USERNAME=...
  KPP_PASSWORD=...

Scrapling 설치:
  pip install "scrapling[fetchers]"
  scrapling install
"""
    )


if __name__ == "__main__":
    main()
