#!/usr/bin/env python3
"""InventoryItem에 CSV 매입가 업데이트 (직접 SQLite)"""
import os, json, sqlite3, time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "db.sqlite3")
PRICE_MAP_PATH = os.path.join(BASE_DIR, "data", "sku_price_map.json")

with open(PRICE_MAP_PATH, "r", encoding="utf-8") as f:
    prices = json.load(f)["prices"]

conn = sqlite3.connect(DB_PATH, timeout=60)
conn.execute("PRAGMA journal_mode=WAL")
cursor = conn.cursor()

# unit_cost 컬럼 확인
cursor.execute("PRAGMA table_info(inventory_items)")
cols = [r[1] for r in cursor.fetchall()]
if "unit_cost" not in cols:
    print("ERROR: unit_cost 컬럼 없음")
    sys.exit(1)

# InventoryItem 현황
cursor.execute("SELECT COUNT(*) FROM inventory_items")
total = cursor.fetchone()[0]
cursor.execute("SELECT COUNT(*) FROM inventory_items WHERE barcode IS NOT NULL AND barcode != ''")
with_bc = cursor.fetchone()[0]
print(f"InventoryItem: {total}개 (바코드 있음: {with_bc})")

# 업데이트
updated = 0
for bc, info in prices.items():
    cursor.execute(
        "UPDATE inventory_items SET unit_cost = ? WHERE barcode = ? AND (unit_cost IS NULL OR unit_cost = 0)",
        (info["price"], bc)
    )
    updated += cursor.rowcount

# 통계
cursor.execute("SELECT COUNT(*), SUM(current_stock * unit_cost) FROM inventory_items WHERE unit_cost > 0")
cnt, total_val = cursor.fetchone()
cursor.execute("SELECT COUNT(*) FROM inventory_items WHERE barcode IS NOT NULL AND barcode != '' AND (unit_cost IS NULL OR unit_cost = 0)")
unmatched = cursor.fetchone()[0]

print(f"단가 업데이트: {updated}개")
print(f"단가 있음: {cnt}개 | 재고금액 합계: {total_val or 0:,.0f}원")
print(f"단가 없음(매칭실패): {unmatched}개")

conn.commit()
conn.close()
print("✅ 완료")
