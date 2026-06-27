#!/usr/bin/env python3
"""
CSV 발주서 → SKU별 매입가 매핑 구축
PO_SKU_LIST 두 파일을 읽어 SKU Barcode 기준 매입가 매핑 생성
최종: sku_price_map.json 파일 출력

사용법: python import_purchase_prices.py
"""

import csv
import json
import os
import sys

# CSV 파일 경로
CSV_OLD = "C:/Users/kis/Downloads/PO_SKU_LIST_20260619172102.csv"
CSV_NEW = "C:/Users/kis/Downloads/PO_SKU_LIST_20260619172133.csv"
OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "sku_price_map.json")

def parse_price(val):
    """매입가를 정수로 파싱"""
    if val is None:
        return None
    s = str(val).strip().replace(",", "")
    if not s:
        return None
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None

def load_csv(filepath):
    """CSV 로드 → {barcode: {sku, name, price, date}}"""
    result = {}
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            barcode = row.get("SKU Barcode", "").strip() or row.get("SKU ID", "").strip()
            if not barcode:
                continue
            price = parse_price(row.get("매입가"))
            if price is None:
                continue
            # 이미 있는 항목보다 최신 입고일이면 덮어쓰기
            if barcode in result:
                existing_date = result[barcode].get("date", "")
                new_date = row.get("입고예정일", "")
                if new_date <= existing_date:
                    continue  # 덮어쓰지 않음
            result[barcode] = {
                "sku_id": row.get("SKU ID", "").strip(),
                "product_name": row.get("SKU 이름", "").strip(),
                "price": price,
                "date": row.get("입고예정일", ""),
                "supply_price": parse_price(row.get("공급가")),
                "vat": parse_price(row.get("부가세")),
            }
    return result

def main():
    print("=== CSV → SKU 매입가 매핑 생성 ===")
    
    # 두 CSV 로드
    old_map = load_csv(CSV_OLD)
    new_map = load_csv(CSV_NEW)
    
    print(f"구버전 CSV (02): {len(old_map)}개 SKU")
    print(f"신버전 CSV (33): {len(new_map)}개 SKU")
    
    # 신버전 우선 병합 (동일 SKU는 신버전 가격 우선)
    merged = {}
    merged.update(old_map)  # 구버전 기본
    merged.update(new_map)  # 신버전 덮어쓰기 (동일 SKU는 신버전 우선)
    
    print(f"병합 후: {len(merged)}개 SKU")
    
    # 중복 체크
    common_barcodes = set(old_map.keys()) & set(new_map.keys())
    price_changed = []
    for bc in common_barcodes:
        if old_map[bc]["price"] != new_map[bc]["price"]:
            price_changed.append({
                "barcode": bc,
                "name": old_map[bc]["product_name"],
                "old_price": old_map[bc]["price"],
                "new_price": new_map[bc]["price"],
                "old_date": old_map[bc]["date"],
                "new_date": new_map[bc]["date"],
            })
    
    if price_changed:
        print(f"\n⚠️ 가격 변경된 SKU: {len(price_changed)}개")
        for p in price_changed[:10]:
            print(f"  {p['barcode']} {p['name'][:30]}: {p['old_price']}→{p['new_price']} (날짜: {p['old_date']}→{p['new_date']})")
    else:
        print("\n✅ 동일 SKU 기준 가격 변경 없음 (날짜만 차이)")
    
    # 파일 저장
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": __import__("datetime").datetime.now().isoformat(),
            "total_skus": len(merged),
            "old_count": len(old_map),
            "new_count": len(new_map),
            "price_changed_count": len(price_changed),
            "prices": merged,
        }, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 저장 완료: {OUTPUT}")
    print(f"  총 {len(merged)}개 SKU 매입가 매핑")

if __name__ == "__main__":
    main()
