#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VF 출고 수량 조회 스크립트 (Runbook — 저사양 모델용)

플로우:
  1) 제품 번호/제품명/바코드 → master/specs에서 바코드 확정
  2) outbound/barcode-daily 조회 (최근 N일, 기본 7일=이번 주)
  3) 해당 바코드 일별 출고 + 합계 출력

사용법:
  python scripts/vf_outbound_lookup.py 151                # 151번 최근 7일 출고
  python scripts/vf_outbound_lookup.py 151 --days 30      # 최근 30일
  python scripts/vf_outbound_lookup.py --name "이유 정리함" --days 7
  python scripts/vf_outbound_lookup.py --barcode R246905820012

출력: 일자별 수량 + 기간 합계 + 일평균.
"""
import argparse
import json
import re
import sys
import urllib.request

BASE = "http://127.0.0.1:5176"
TIMEOUT = 60


def http_get(url):
    with urllib.request.urlopen(url, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def loc_to_number(location: str):
    if not location:
        return None
    m = re.match(r"^320-A1-1-(\d+)$", location.strip())
    if m:
        return int(m.group(1))
    m = re.match(r"^320-A1-2-(\d+)$", location.strip())
    if m:
        return int("2" + m.group(1))
    return None


def number_to_locations(number) -> list:
    n = str(int(number))
    locs = []
    if n.startswith("2") and len(n) >= 2:
        locs.append(f"320-A1-2-{n[1:]}")
    locs.append(f"320-A1-1-{n}")
    return locs


def main():
    ap = argparse.ArgumentParser(description="VF 출고 수량 조회")
    ap.add_argument("number", nargs="?", help="제품 번호 (예: 151, 2115)")
    ap.add_argument("--name", help="제품명 부분 검색")
    ap.add_argument("--barcode", help="바코드 직접 지정")
    ap.add_argument("--days", type=int, default=7, help="조회 기간 일수 (기본 7=이번 주)")
    args = ap.parse_args()

    if not any([args.number, args.name, args.barcode]):
        ap.print_help()
        sys.exit(1)

    # 1) 마스터에서 대상 확정 (바코드 목록 수집)
    targets = []  # (barcode, product_name, location, current_stock)
    if args.barcode:
        targets.append((args.barcode.strip(), "", "", None))
    else:
        specs = http_get(f"{BASE}/api/master/specs")
        specs = specs if isinstance(specs, list) else specs.get("data", [])
        if args.number:
            locs = set(number_to_locations(args.number))
            for r in specs:
                if r.get("location") in locs and loc_to_number(r.get("location", "")) == int(args.number):
                    targets.append((r.get("barcode"), r.get("product_name"), r.get("location"), r.get("current_stock")))
        elif args.name:
            q = args.name.strip().lower()
            for r in specs:
                if (
                    q in (r.get("product_name") or "").lower()
                    or q in (r.get("category_lg") or "").lower()
                ):
                    targets.append((r.get("barcode"), r.get("product_name"), r.get("location"), r.get("current_stock")))
        # 바코드 있는 것만
        targets = [t for t in targets if t[0]]

    if not targets:
        print("대상을 찾을 수 없습니다. 번호/제품명/바코드를 확인하세요.")
        sys.exit(0)

    if len(targets) > 30:
        print(f"매칭 {len(targets)}건 — 너무 많습니다. 더 구체적으로 지정하세요.")
        for bc, name, loc, _ in targets[:10]:
            print(f"  {name} | {loc}")
        sys.exit(0)

    # 2) 출고 데이터 조회 (전체 반환 → 클라이언트 필터)
    ob = http_get(f"{BASE}/api/outbound/barcode-daily?days={args.days}")
    ob_rows = ob.get("data", []) if isinstance(ob, dict) else ob
    ob_map = {r.get("barcode"): r for r in ob_rows}

    print(f"조회 기간: 최근 {args.days}일")
    for bc, name, loc, stock in targets:
        num = loc_to_number(loc) if loc else None
        head = f"{name or bc}"
        if num is not None:
            head = f"{num}번 = {head}"
        print(f"\n=== {head} ===")
        if loc:
            print(f"  로케이션: {loc} | 현재고: {stock if stock is not None else 'N/A'}개")
        row = ob_map.get(bc)
        if not row or not row.get("dailyData"):
            print(f"  출고 없음 (최근 {args.days}일)")
            continue
        total = 0
        for d in row["dailyData"]:
            q = int(d.get("quantity") or 0)
            total += q
            print(f"  {d.get('date')}: {q}개")
        n_days = len(row["dailyData"])
        print(f"  --- 합계: {total}개 | 출고일 {n_days}일 | 일평균 {total / n_days:.1f}개")


if __name__ == "__main__":
    main()
