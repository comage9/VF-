# -*- coding: utf-8 -*-
import os
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from sales_api.models import OutboundRecord
from django.db.models import Count, Sum
import datetime

print("=== OutboundRecord DB Analysis ===")
print("Total Outbound Records:", OutboundRecord.objects.count())

start_date = datetime.date(2026, 5, 10)
end_date = datetime.date(2026, 5, 23)

print(f"\nDaily aggregation from {start_date} to {end_date}:")
date_counts = OutboundRecord.objects.filter(outbound_date__range=[start_date, end_date]).values('outbound_date').annotate(
    count=Count('id'),
    total_qty=Sum('box_quantity'),
    total_sales=Sum('sales_amount')
).order_by('outbound_date')

for item in date_counts:
    print(f"  Date: {item['outbound_date']}, Records: {item['count']}, Total Box Qty: {item['total_qty']}, Total Sales: {item['total_sales']}")

print("\nChecking duplicate keys (same date and product_name) globally:")
duplicates = OutboundRecord.objects.values('outbound_date', 'product_name').annotate(
    cnt=Count('id')
).filter(cnt__gt=1).order_by('-cnt')[:30]

print(f"Total duplicate combinations (top 30 shown out of {len(duplicates)}):")
for r in duplicates:
    print(f"  Date: {r['outbound_date']}, Product: {r['product_name']}, Count: {r['cnt']}")
