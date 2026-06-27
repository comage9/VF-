#!/usr/bin/env python3
"""
OutboundRecord 매입가 매칭 - SQLite 벌크 업데이트
"""
import os, sys, json, sqlite3, time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "db.sqlite3")
PRICE_MAP_PATH = os.path.join(BASE_DIR, "data", "sku_price_map.json")

with open(PRICE_MAP_PATH, "r", encoding="utf-8") as f:
    price_data = json.load(f)["prices"]

# WAL 모드로 연결 (서버와 병행 가능)
conn = sqlite3.connect(DB_PATH, timeout=60)
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA synchronous=NORMAL")
cursor = conn.cursor()

# purchase_price 컬럼 확인
cursor.execute("PRAGMA table_info(outbound_records)")
cols = [r[1] for r in cursor.fetchall()]
if "purchase_price" not in cols:
    print("ERROR: purchase_price 컬럼이 없습니다. 먼저 migrate 실행 필요")
    sys.exit(1)

print(f"매입가 매핑: {len(price_data)}개 SKU")
cursor.execute("SELECT COUNT(*) FROM outbound_records")
total = cursor.fetchone()[0]
print(f"OutboundRecord: {total}개")

# 업데이트: 바코드 정확 매칭
updated = 0
for bc, info in price_data.items():
    price = info["price"]
    cursor.execute(
        "UPDATE outbound_records SET purchase_price = ? WHERE barcode = ? AND (purchase_price IS NULL OR purchase_price = 0)",
        (price, bc)
    )
    updated += cursor.rowcount

print(f"매입가 설정: {updated}개 레코드")

# 매칭 안 된 DB 바코드 확인
cursor.execute("SELECT COUNT(*) FROM outbound_records WHERE (purchase_price IS NULL OR purchase_price = 0) AND barcode IS NOT NULL AND barcode != ''")
unmatched = cursor.fetchone()[0]
print(f"매칭 안 됨 (가격 미설정): {unmatched}개")

conn.commit()
conn.close()

print("✅ 업데이트 완료")
