#!/usr/bin/env python3
"""Sync missing June 5, 2026 outbound data from Google Sheets into local DB."""
import os
import sys
import io
import uuid
import django
import pandas as pd
import requests
from datetime import datetime, date

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
django.setup()

from sales_api.models import OutboundRecord
from django.db import transaction

TARGET_DATE = date(2026, 6, 5)
OUTBOUND_GOOGLE_SHEET_URL = (
    "https://docs.google.com/spreadsheets/d/e/"
    "2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/"
    "pub?gid=1152588885&single=true&output=csv"
)


def parse_num(val):
    if val is None:
        return 1
    s = str(val).strip()
    if s == "":
        return 1
    s = s.replace(",", "")
    try:
        num = float(s)
        if num <= 0:
            return 1
        return num
    except Exception:
        return 1


def parse_date(val):
    s = ("" if val is None else str(val)).strip()
    if not s or s == "nan":
        return None
    for fmt in (
        "%Y-%m-%d",
        "%Y.%m.%d",
        "%Y/%m/%d",
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
    ):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    try:
        dt = pd.to_datetime(s, errors="coerce")
        if pd.isna(dt):
            return None
        return dt.date()
    except Exception:
        return None


def main():
    print(f"Syncing outbound data for {TARGET_DATE}...")

    # Fetch Google Sheet
    print("Fetching Google Sheet CSV...")
    r = requests.get(OUTBOUND_GOOGLE_SHEET_URL, timeout=120)
    r.raise_for_status()
    encodings = ["utf-8-sig", "cp949", "euc-kr", "utf-8"]
    decoded = None
    for encoding in encodings:
        try:
            decoded = r.content.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if decoded is None:
        raise ValueError("Failed to decode CSV")
    df = pd.read_csv(io.StringIO(decoded), dtype=str).fillna("")
    df.columns = [str(c).strip().lstrip("\ufeff") for c in df.columns]

    print(f"Total rows in sheet: {len(df)}")

    # Find columns
    cols = [str(c).strip() for c in df.columns]

    def find_col(candidates):
        for cand in candidates:
            for c in cols:
                if cand in c:
                    return c
        return None

    date_col = find_col(["일자", "출고일", "date"])
    product_col = find_col(["품목", "상품명", "product"])
    category_col = find_col(["분류", "카테고리", "category"])
    barcode_col = find_col(["바코드", "barcode"])
    box_col = find_col(["수량(박스)", "박스"])
    unit_col = find_col(["수량(낱개)", "낱개"])
    amount_col = find_col(["판매금액", "금액", "매출", "amount"])
    notes_col = find_col(["비고", "메모", "note"])
    client_col = find_col(["거래처", "고객", "client"])

    if not date_col or not product_col:
        print(f"ERROR: Required columns not found. Available: {cols}")
        return

    print(f"Date column: {date_col}")

    # Parse and filter for target date
    records = []
    now = datetime.now()

    for _, row in df.iterrows():
        outbound_date = parse_date(row.get(date_col))
        if not outbound_date:
            continue
        if outbound_date != TARGET_DATE:
            continue

        product_name = str(row.get(product_col) or "").strip()
        barcode = str(row.get(barcode_col) or "").strip() if barcode_col else ""
        if not product_name and not barcode:
            continue

        box_qty = int(parse_num(row.get(box_col))) if box_col else 1
        if box_qty <= 0:
            box_qty = 1
        unit_qty = int(parse_num(row.get(unit_col))) if unit_col else 0
        sales_amount = parse_num(row.get(amount_col)) if amount_col else 0

        category = str(row.get(category_col) or "").strip() if category_col else ""
        client = str(row.get(client_col) or "").strip() if client_col else ""
        notes = str(row.get(notes_col) or "").strip() if notes_col else ""

        records.append(
            OutboundRecord(
                id=str(uuid.uuid4()),
                outbound_date=outbound_date,
                product_name=product_name or "-",
                category=category or "기타",
                barcode=barcode or None,
                quantity=box_qty,
                box_quantity=box_qty,
                unit_count=unit_qty,
                sales_amount=sales_amount,
                client=client,
                status="완료",
                notes=notes or None,
                created_at=now,
                updated_at=now,
            )
        )

    print(f"Parsed {len(records)} records for {TARGET_DATE}")

    if not records:
        print("No records found. Check if Google Sheet has data for this date.")
        return

    # Delete existing records for target date and insert new ones
    with transaction.atomic():
        deleted, _ = OutboundRecord.objects.filter(
            outbound_date=TARGET_DATE
        ).delete()
        print(f"Deleted {deleted} existing records for {TARGET_DATE}")

        OutboundRecord.objects.bulk_create(records, batch_size=5000)
        print(f"Inserted {len(records)} records for {TARGET_DATE}")

    # Verify
    count = OutboundRecord.objects.filter(outbound_date=TARGET_DATE).count()
    print(f"Verification: {count} records now in DB for {TARGET_DATE}")
    print("Done!")


if __name__ == "__main__":
    main()
