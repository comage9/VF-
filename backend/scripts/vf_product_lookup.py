#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VF 제품 번호 조회 스크립트 (Runbook — 저사양 모델용)

제품 번호 규칙 (Wiki: 운영원칙/VF-제품번호-조회규칙-20260802.md):
  320-A1-1-XXX → 제품 번호 XXX      (예: 320-A1-1-178 → 178)
  320-A1-2-XXX → 제품 번호 2XXX     (예: 320-A1-2-115 → 2115)

현재고 SoT: GET /api/master/specs 의 current_stock
  (= inventory_stock.py compute_current_stock: 스냅샷+입고−출고+조정)

사용법:
  python scripts/vf_product_lookup.py 2115
  python scripts/vf_product_lookup.py 178
  python scripts/vf_product_lookup.py --name "야채 4단 화이트"
  python scripts/vf_product_lookup.py --barcode R016128090006
  python scripts/vf_product_lookup.py --location 320-A1-2-115
"""
import argparse
import json
import re
import sys
import urllib.request

API = "http://127.0.0.1:5176/api/master/specs"
TIMEOUT = 30


def fetch_specs():
    req = urllib.request.Request(API)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data if isinstance(data, list) else data.get("results", data.get("data", []))


def loc_to_number(location: str):
    """로케이션 → 제품 번호. 규칙 외 패턴은 None."""
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
    """제품 번호 → 후보 로케이션 목록."""
    n = int(number)
    s = str(n)
    locs = []
    if s.startswith("2") and len(s) >= 2:
        # 2XXX → 320-A1-2-XXX 가 1순위 (320-A1-1-2XXX 도 이론상 가능하나 3자리 초과 드묾)
        locs.append(f"320-A1-2-{s[1:]}")
    locs.append(f"320-A1-1-{s}")
    return locs


def fmt_row(r: dict) -> str:
    num = loc_to_number(r.get("location", ""))
    num_s = f"{num}번" if num is not None else "(규칙 외)"
    stock = r.get("current_stock")
    stock_s = "N/A" if stock is None else f"{stock}개"
    disc = " [단종]" if r.get("is_discontinued") else ""
    return (
        f"{num_s} = {r.get('product_name')}{disc}\n"
        f"  로케이션: {r.get('location')} | 바코드: {r.get('barcode')}\n"
        f"  현재고: {stock_s} | 분류: {r.get('category_lg','')}/{r.get('category_md','')}"
        f" | 색상: {r.get('color1','')} | 가격: {r.get('price','')}"
    )


def main():
    ap = argparse.ArgumentParser(description="VF 제품 번호/제품명/재고 조회")
    ap.add_argument("number", nargs="?", help="제품 번호 (예: 2115, 178)")
    ap.add_argument("--name", help="제품명 또는 약칭 부분 검색")
    ap.add_argument("--barcode", help="바코드 검색")
    ap.add_argument("--location", help="로케이션 검색")
    args = ap.parse_args()

    if not any([args.number, args.name, args.barcode, args.location]):
        ap.print_help()
        sys.exit(1)

    try:
        specs = fetch_specs()
    except Exception as e:
        print(f"ERROR: API 조회 실패 ({e})", file=sys.stderr)
        sys.exit(2)

    hits = []
    if args.number:
        locs = number_to_locations(args.number)
        hits = [r for r in specs if r.get("location") in locs]
        # 역산된 번호와 정확히 일치하는 것만 (A1-1-2115 같은 오매칭 방지)
        hits = [r for r in hits if loc_to_number(r.get("location", "")) == int(args.number)]
    elif args.barcode:
        hits = [r for r in specs if r.get("barcode") == args.barcode.strip()]
    elif args.location:
        hits = [r for r in specs if r.get("location") == args.location.strip()]
    elif args.name:
        q = args.name.strip().lower()
        hits = [
            r for r in specs
            if q in (r.get("product_name") or "").lower()
            or q in (r.get("category_lg") or "").lower()
            or q in (r.get("category_md") or "").lower()
        ]

    if not hits:
        print("결과 없음. 번호 규칙 확인: A1-1-N → N번, A1-2-N → 2N번")
        sys.exit(0)

    for r in hits:
        print(fmt_row(r))
        print()


if __name__ == "__main__":
    main()
