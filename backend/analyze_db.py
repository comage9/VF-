# -*- coding: utf-8 -*-
import os
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from sales_api.models import ProductionLog, MasterSpec
from django.db.models import Count

print("=== ProductionLog 분석 ===")
total = ProductionLog.objects.count()
print(f"ProductionLog 총 건수: {total}")

ms_count = MasterSpec.objects.count()
print(f"MasterSpec 총 건수: {ms_count}")

if total > 0:
    print("\n=== 품목별 unit_quantity (top 30) ===")
    data = ProductionLog.objects.filter(unit_quantity__gt=0).values('product_name', 'unit_quantity').annotate(cnt=Count('id')).order_by('-cnt')[:30]
    for r in data:
        print(f"  {r['product_name']}: unit_quantity={r['unit_quantity']}, count={r['cnt']}")
    
    print("\n=== 금형번호 샘플 (30개) ===")
    molds = ProductionLog.objects.exclude(mold_number='').exclude(mold_number=None).values('product_name', 'mold_number').distinct()[:30]
    for r in molds:
        print(f"  {r['product_name']} -> mold_number={r['mold_number']}")
    
    print("\n=== 색상 분포 (top 20) ===")
    colors = ProductionLog.objects.exclude(color1='').exclude(color1=None).values('color1').annotate(cnt=Count('id')).order_by('-cnt')[:20]
    for r in colors:
        print(f"  {r['color1']}: {r['cnt']}건")

print("\n=== MasterSpec 목록 (20개) ===")
for m in MasterSpec.objects.all()[:20]:
    print(f"  {m.product_name}: mold={m.mold_number}, color1={m.color1}, default_qty={m.default_quantity}")