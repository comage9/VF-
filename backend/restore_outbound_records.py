#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
import io
import django
import pandas as pd
from datetime import datetime
from decimal import Decimal

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, '/home/comtop/workspace/VF/backend')
django.setup()

from sales_api.models import OutboundRecord
from django.db import transaction

def parse_num(val):
    if pd.isna(val) or val is None:
        return 0
    s = str(val).strip().replace(",", "")
    if s == "":
        return 0
    try:
        return float(s)
    except Exception:
        return 0

def parse_date(val):
    s = str(val).strip()
    if not s or s == 'nan':
        return None
    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    try:
        return pd.to_datetime(s).date()
    except Exception:
        return None

def main():
    print("=" * 60)
    print("OutboundRecord DB Restoration from Google Sheet (Standard)")
    print("=" * 60)
    
    url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv'
    print("Fetching CSV from Google Sheet...")
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as r:
            df = pd.read_csv(io.BytesIO(r.read()), dtype=str)
            
        print(f"Successfully fetched Google Sheet CSV. Rows: {len(df)}")
        
        records_to_create = []
        now = datetime.now()
        
        print("Parsing CSV rows...")
        for idx, row in df.iterrows():
            date_val = parse_date(row.get('일자'))
            if not date_val:
                continue
                
            product_name = str(row.get('품목') or '').strip()
            if not product_name:
                continue
                
            barcode = str(row.get('바코드') or '').strip()
            if barcode == 'nan' or not barcode:
                barcode = None
                
            category = str(row.get('분류') or '').strip()
            if category == 'nan' or not category:
                category = '기타'
                
            box_qty = int(parse_num(row.get('수량(박스)')))
            if box_qty <= 0:
                box_qty = 1
                
            unit_qty = int(parse_num(row.get('수량(낱개)')))
            sales_amount = parse_num(row.get('판매금액'))
            
            notes = str(row.get('비고') or '').strip()
            if notes == 'nan' or not notes:
                notes = None
                
            import uuid
            rec = OutboundRecord(
                id=str(uuid.uuid4()),
                outbound_date=date_val,
                product_name=product_name,
                category=category,
                barcode=barcode,
                quantity=box_qty,
                box_quantity=box_qty,
                unit_count=unit_qty,
                sales_amount=sales_amount,
                status="완료",
                notes=notes,
                client=""
            )
            records_to_create.append(rec)
            
            if len(records_to_create) % 50000 == 0:
                print(f"Parsed {len(records_to_create)} rows...")
                
        print(f"Parsing complete. Total valid records to import: {len(records_to_create)}")
        
        # Clear DB and Import under a single transaction
        with transaction.atomic():
            print("Clearing all existing OutboundRecord objects in local DB...")
            deleted, _ = OutboundRecord.objects.all().delete()
            print(f"Deleted {deleted} old records from DB.")
            
            print("Bulk inserting new records into DB...")
            # SQLite handles batches of 5000 comfortably
            OutboundRecord.objects.bulk_create(records_to_create, batch_size=5000)
            
        print("Restoration completed successfully!")
        print(f"New local database OutboundRecord count: {OutboundRecord.objects.count()}")
        
    except Exception as e:
        print(f"Error during restoration: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
