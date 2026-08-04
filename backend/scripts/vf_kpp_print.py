#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VF 출차관리 KPP 파렛트 전표 출력 스크립트 (Runbook — 저사양 모델용)

플로우:
  1) 1호차 plt=N 저장 (POST /departure/api/ls-data, 병합 저장)
  2) 저장 검증 (GET으로 재조회)
  3) Chrome CDP 9222 연결 확인
  4) KPP 등록 + EDI 전표 인쇄 (GET /departure/api/print-kpp/{hoche}?plt=&date=)

사용법:
  python scripts/vf_kpp_print.py 1 12              # 1호차 파렛트 12개, 오늘 날짜
  python scripts/vf_kpp_print.py 2 8 2026-08-04    # 날짜 지정
  python scripts/vf_kpp_print.py 1 12 --check-only # 저장만 하고 인쇄는 안 함

전제 조건:
  - VF 백엔드 서버 실행 중 (5176)
  - Chrome CDP 포트 9222 실행 중
  - WPPS 로그인 + PBM140MW 탭 (세션 만료 시 로그인 페이지로 튐 → 사용자 수동 로그인)
"""
import argparse
import json
import sys
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:5176"
TIMEOUT = 180  # KPP 등록+인쇄는 느림 (SpreadJS 조작)


def http_get(url):
    with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def http_post(url, payload):
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    ap = argparse.ArgumentParser(description="출차관리 plt 입력 + KPP 파렛트 전표 인쇄")
    ap.add_argument("hoche", type=int, help="호차 (1, 2, 3)")
    ap.add_argument("plt", type=int, help="파렛트 수량")
    ap.add_argument("date", nargs="?", help="날짜 YYYY-MM-DD (기본: 서버 오늘)")
    ap.add_argument("--check-only", action="store_true", help="plt 저장만, 인쇄 안 함")
    args = ap.parse_args()

    # 날짜: 인자 없으면 서버의 오늘(ls-data GET의 date) 사용
    date = args.date
    if not date:
        d = http_get(f"{BASE}/departure/api/ls-data")
        date = d.get("date")
    print(f"[1/4] 대상: {date} {args.hoche}호차, 파렛트 {args.plt}개")

    # 현재 상태 조회 → 해당 호차 plate 확인
    cur = http_get(f"{BASE}/departure/api/ls-data?date={date}")
    rows = cur.get("data", [])
    mine = [v for v in rows if v.get("hoche") == args.hoche]
    if not mine:
        print(f"ERROR: {date}에 {args.hoche}호차 차량이 없습니다. 차량 등록 먼저 필요.")
        sys.exit(2)
    plate = mine[0].get("plate", "")
    print(f"[2/4] 현재 {args.hoche}호차: {plate} / {mine[0].get('driverName','')} / plt={mine[0].get('plt', 0)}")

    # plt 저장 (병합 — 다른 호차 삭제 안 됨)
    payload = {"date": date, "vehicles": [{"hoche": args.hoche, "plate": plate, "plt": args.plt}]}
    res = http_post(f"{BASE}/departure/api/ls-data?date={date}", payload)
    if not res.get("ok"):
        print(f"ERROR: plt 저장 실패: {res}")
        sys.exit(3)

    # 저장 검증 (재조회)
    chk = http_get(f"{BASE}/departure/api/ls-data?date={date}")
    saved = [v for v in chk.get("data", []) if v.get("hoche") == args.hoche]
    saved_plt = saved[0].get("plt") if saved else None
    if saved_plt != args.plt:
        print(f"ERROR: 저장 검증 실패 — plt={saved_plt} (기대 {args.plt})")
        sys.exit(4)
    print(f"[3/4] plt={args.plt} 저장 검증 완료")

    if args.check_only:
        print("CHECK-ONLY: 저장까지 완료. 인쇄 스킵.")
        return

    # CDP 확인
    try:
        with urllib.request.urlopen("http://localhost:9222/json/version", timeout=3) as r:
            json.loads(r.read().decode("utf-8"))
    except Exception:
        print("ERROR: Chrome CDP 9222 미연결 — Chrome을 CDP 모드로 실행하세요.")
        sys.exit(5)

    # KPP 등록 + 인쇄
    print("[4/4] KPP 등록 + EDI 전표 인쇄 중... (최대 3분)")
    try:
        out = http_get(f"{BASE}/departure/api/print-kpp/{args.hoche}?plt={args.plt}&date={date}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        try:
            out = json.loads(body)
        except Exception:
            out = {"ok": False, "error": body[:300]}

    if out.get("ok"):
        print("=== KPP 전표 인쇄 성공 ===")
        for line in out.get("results", []):
            print(f"  {line}")
        print(f"  PLT={out.get('plt')}")
    else:
        print("=== KPP 인쇄 실패 ===")
        for line in out.get("results", []) or []:
            print(f"  {line}")
        print("대처: WPPS 로그인 여부 확인 (세션 만료면 사용자 수동 로그인 후 재실행)")
        sys.exit(6)


if __name__ == "__main__":
    main()
