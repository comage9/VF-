#!/usr/bin/env python3
"""bonohouse → 로컬 DB 동기화 스크립트"""
import os, sys, json, urllib.request

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, '/home/comage/coding/VF-/backend')

import django
django.setup()

from sales_api.models import ProductionLog

REMOTE = "http://bonohouse.p-e.kr:5176"

def sync_production():
    url = f"{REMOTE}/api/production"
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.loads(resp.read())

    items = data.get("results", {}).get("latestData", [])
    created, updated, skipped = 0, 0, 0

    for item in items:
        try:
            obj = ProductionLog.objects.get(id=item["id"])
            # 기존 데이터 업데이트
            for key in ["status", "quantity", "unit_quantity", "total", "start_time", "end_time", "sort_order"]:
                setattr(obj, key, item.get(key))
            obj.save()
            updated += 1
        except ProductionLog.DoesNotExist:
            ProductionLog.objects.create(
                id=item["id"],
                date=item.get("date"),
                machine_number=item.get("machine_number", ""),
                mold_number=item.get("mold_number", ""),
                product_name=item.get("product_name", ""),
                product_name_eng=item.get("product_name_eng", ""),
                color1=item.get("color1", ""),
                color2=item.get("color2", ""),
                unit=item.get("unit", ""),
                quantity=item.get("quantity", 0),
                unit_quantity=item.get("unit_quantity", 0),
                total=item.get("total", 0),
                status=item.get("status", "pending"),
                start_time=item.get("start_time"),
                end_time=item.get("end_time"),
                sort_order=item.get("sort_order", 0),
            )
            created += 1

    print(f"동기화 완료: 생성={created} 업데이트={updated} 스킵={skipped}")
    print(f"로컬 DB 총 레코드: {ProductionLog.objects.count()}")

if __name__ == "__main__":
    sync_production()
