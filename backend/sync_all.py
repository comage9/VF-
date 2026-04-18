#!/usr/bin/env python3
"""bonohouse → 로컬 DB 동기화 스크립트 (전체 테이블)"""
import os, sys, json, urllib.request, urllib.error

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, '/home/comage/coding/VF-/backend')

import django
django.setup()

from sales_api.models import (
    ProductionLog, OutboundRecord,
    DeliveryDailyRecord, BarcodeMaster, FCInboundRecord
)

REMOTE = "http://bonohouse.p-e.kr:5176"


def fetch_json(url):
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {url}")
        return None
    except Exception as e:
        print(f"  에러: {url} - {e}")
        return None


def sync_production():
    print("\n=== ProductionLog ===")
    data = fetch_json(f"{REMOTE}/api/production")
    if not data:
        return
    items = data.get("results", {}).get("latestData", [])
    created, updated = 0, 0
    for item in items:
        try:
            obj = ProductionLog.objects.get(id=item["id"])
            for k in ["status","quantity","unit_quantity","total","start_time","end_time","sort_order"]:
                setattr(obj, k, item.get(k))
            obj.save()
            updated += 1
        except ProductionLog.DoesNotExist:
            ProductionLog.objects.create(**{k: item.get(k) for k in item})
            created += 1
    print(f"  생성={created} 업데이트={updated} 총={ProductionLog.objects.count()}")


def sync_outbound():
    print("\n=== OutboundRecord ===")
    all_items = []
    url = f"{REMOTE}/api/outbound?limit=100&offset=0"
    while url:
        data = fetch_json(url)
        if not data:
            break
        if isinstance(data, list):
            all_items = data
            break
        all_items.extend(data.get("results", []))
        url = data.get("next")
    created, updated = 0, 0
    for item in all_items:
        try:
            obj = OutboundRecord.objects.get(id=item["id"])
            for k in ["quantity","sales_amount","box_quantity","unit_count","status","notes"]:
                if k in item:
                    setattr(obj, k, item[k])
            obj.save()
            updated += 1
        except OutboundRecord.DoesNotExist:
            try:
                OutboundRecord.objects.create(**{k: item[k] for k in item if k != 'id'})
                created += 1
            except Exception as e:
                print(f"  스킵: {e}")
    print(f"  생성={created} 업데이트={updated} 총={OutboundRecord.objects.count()}")


def sync_delivery_hourly():
    print("\n=== DeliveryDailyRecord ===")
    data = fetch_json(f"{REMOTE}/api/delivery/hourly")
    if not data or not data.get("success"):
        print("  스킵 (데이터 없음)")
        return
    items = data.get("data", [])
    created, updated = 0, 0
    for item in items:
        date = item.get("date")
        if not date:
            continue
        hourly = {f"hour_{str(h).zfill(2)}": item.get(f"hour_{str(h).zfill(2)}", 0) for h in range(24)}
        fields = {
            "date": date,
            "day_of_week": item.get("dayOfWeek", ""),
            "total": item.get("total", 0),
            "hourly": hourly,
        }
        try:
            obj = DeliveryDailyRecord.objects.get(date=date)
            obj.day_of_week = fields["day_of_week"]
            obj.total = fields["total"]
            obj.hourly = fields["hourly"]
            obj.save()
            updated += 1
        except DeliveryDailyRecord.DoesNotExist:
            DeliveryDailyRecord.objects.create(**fields)
            created += 1
    print(f"  생성={created} 업데이트={updated} 총={DeliveryDailyRecord.objects.count()}")


def sync_barcode_master():
    print("\n=== BarcodeMaster ===")
    data = fetch_json(f"{REMOTE}/api/inventory/barcode-master")
    if not data or not data.get("success"):
        print("  스킵 (데이터 없음)")
        return
    items = data.get("data", [])
    if not isinstance(items, list):
        print("  스킵 (데이터 형식 오류)")
        return
    created, updated = 0, 0
    for item in items:
        fields = {
            "id": item.get("id"),
            "barcode": item.get("barcode", ""),
            "sku_id": item.get("skuId", ""),
            "product_name": item.get("productName", ""),
            "category": item.get("category", ""),
            "location": item.get("location", ""),
            "lifecycle_status": item.get("lifecycleStatus", "active"),
            "min_stock": item.get("minStock", 0),
            "max_stock": item.get("maxStock", 0),
            "reorder_point": item.get("reorderPoint", 0),
            "safety_stock": item.get("safetyStock", 0),
            "notes": item.get("notes", ""),
        }
        try:
            obj = BarcodeMaster.objects.get(id=fields["id"])
            for k in ["barcode","sku_id","product_name","category","location","lifecycle_status","min_stock","max_stock","reorder_point","safety_stock","notes"]:
                setattr(obj, k, fields[k])
            obj.save()
            updated += 1
        except BarcodeMaster.DoesNotExist:
            try:
                BarcodeMaster.objects.create(**fields)
                created += 1
            except Exception as e:
                print(f"  스킵: {e}")
    print(f"  생성={created} 업데이트={updated} 총={BarcodeMaster.objects.count()}")


def sync_fc_inbound():
    print("\n=== FCInboundRecord ===")
    data = fetch_json(f"{REMOTE}/api/fc-inbound?limit=100&offset=0")
    if not data:
        return
    items = data if isinstance(data, list) else data.get("results", [])
    created, updated = 0, 0
    for item in items:
        fields = {
            "id": item.get("id"),
            "inbound_date": item.get("inbound_date"),
            "sku_id": item.get("sku_id", ""),
            "barcode": item.get("barcode", ""),
            "product_name": item.get("product_name", ""),
            "category": item.get("category", ""),
            "subcategory": item.get("subcategory", ""),
            "color": item.get("color", ""),
            "quantity": item.get("quantity", 0),
            "supply_amount": item.get("supply_amount", 0),
            "logistics_center": item.get("logistics_center", ""),
        }
        try:
            obj = FCInboundRecord.objects.get(id=fields["id"])
            for k in ["inbound_date","sku_id","barcode","product_name","category","quantity","supply_amount","logistics_center"]:
                setattr(obj, k, fields[k])
            obj.save()
            updated += 1
        except FCInboundRecord.DoesNotExist:
            try:
                FCInboundRecord.objects.create(**fields)
                created += 1
            except Exception as e:
                print(f"  스킵: {e}")
    print(f"  생성={created} 업데이트={updated} 총={FCInboundRecord.objects.count()}")


def sync_all():
    print("=== bonohouse → 로컬 DB 동기화 시작 ===")
    sync_production()
    sync_outbound()
    sync_delivery_hourly()
    sync_barcode_master()
    sync_fc_inbound()
    print("\n=== 동기화 완료 ===")


if __name__ == "__main__":
    sync_all()
