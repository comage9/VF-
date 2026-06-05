#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
import django
from datetime import datetime

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, '/home/comtop/workspace/VF/backend')
django.setup()

from sales_api.models import OutboundRecord
from django.db import transaction

def main():
    print("=" * 60)
    print("VF Missing Dates Sync Script (2026-05-17 to 2026-05-22)")
    print("=" * 60)
    
    start_date = "2026-05-17"
    end_date = "2026-05-22"
    
    remote_url = f"http://bonohouse.p-e.kr:5176/api/outbound?start={start_date}&end={end_date}"
    print(f"Fetching from remote: {remote_url}")
    
    try:
        req = urllib.request.Request(
            remote_url, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            records = json.loads(response.read().decode('utf-8'))
            
        print(f"Successfully fetched {len(records)} records from remote server.")
        
        if not records:
            print("No records found on the remote server for this date range.")
            return

        # Clean existing local records for this range to avoid duplicates/conflicts
        with transaction.atomic():
            print(f"Deleting existing local records between {start_date} and {end_date}...")
            deleted_count, _ = OutboundRecord.objects.filter(
                outbound_date__range=(start_date, end_date)
            ).delete()
            print(f"Deleted {deleted_count} local records.")
            
            # Prepare new records for bulk creation
            new_records = []
            for item in records:
                outbound_date = datetime.strptime(item['outbound_date'], '%Y-%m-%d').date()
                
                # Create OutboundRecord instance
                rec = OutboundRecord(
                    id=item['id'],
                    outbound_date=outbound_date,
                    product_name=item.get('product_name') or '',
                    quantity=item.get('quantity'),
                    sales_amount=item.get('sales_amount'),
                    box_quantity=item.get('box_quantity'),
                    unit_count=item.get('unit_count'),
                    category=item.get('category') or '기타',
                    client=item.get('client') or '',
                    barcode=item.get('barcode'),
                    status=item.get('status') or '완료',
                    notes=item.get('notes')
                )
                new_records.append(rec)
            
            # Bulk create in chunks of 5000
            print(f"Importing {len(new_records)} records into local DB...")
            OutboundRecord.objects.bulk_create(new_records, batch_size=5000)
            print("Import completed successfully!")
            
            # Verify counts
            local_count = OutboundRecord.objects.filter(
                outbound_date__range=(start_date, end_date)
            ).count()
            print(f"Verified count in local DB: {local_count} records.")

    except Exception as e:
        print(f"Error during import: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
