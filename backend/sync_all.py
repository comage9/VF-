#!/usr/bin/env python3
"""bonohouse → 로컬 DB 동기화 스크립트 (전체 테이블)

사용법:
  SYNC_MODE=remote python sync_all.py  # 전체 원격 동기화
  python sync_all.py                     # 로컬 모드 (기본값)
"""
import os
import sys
import json
import urllib.request
import urllib.error

# 로컬 우선 모드 (기본값)
SYNC_MODE = os.getenv("SYNC_MODE", "local").lower()
REMOTE = os.getenv("REMOTE_URL", "http://bonohouse.p-e.kr:5176")

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, '/home/comtop/workspace/VF/backend')

import django
django.setup()

from sales_api.models import (
    ProductionLog, OutboundRecord,
    DeliveryDailyRecord, BarcodeMaster, FCInboundRecord
)


def fetch_remote(url):
    """원격 서버에서 데이터 가져오기 (실패 시 None 반환)"""
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"  HTTP 오류 {e.code}: {url}")
        return None
    except urllib.error.URLError as e:
        print(f"  연결 오류: {e.reason}")
        return None
    except Exception as e:
        print(f"  오류: {e}")
        return None


def sync_production():
    """ProductionLog 동기화"""
    print("\n=== ProductionLog ===")
    if SYNC_MODE != "remote":
        print("  [LOCAL MODE] 동기화 스킵")
        print(f"  로컬 DB 총 레코드: {ProductionLog.objects.count()}")
        return
        
    data = fetch_remote(f"{REMOTE}/api/production")
    if not data:
        print("  [FALLBACK] 원격 연결 실패")
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
    """OutboundRecord 동기화"""
    print("\n=== OutboundRecord ===")
    if SYNC_MODE != "remote":
        print("  [LOCAL MODE] 동기화 스킵")
        print(f"  로컬 DB 총 레코드: {OutboundRecord.objects.count()}")
        return
        
    all_items = []
    url = f"{REMOTE}/api/outbound?limit=100&offset=0"
    data = fetch_remote(url)
    if not data:
        print("  [FALLBACK] 원격 연결 실패")
        return
        
    if isinstance(data, list):
        all_items = data
    else:
        all_items.extend(data.get("results", []))
        next_url = data.get("next")
        while next_url:
            data = fetch_remote(next_url)
            if data:
                all_items.extend(data.get("results", []))
                next_url = data.get("next")
            else:
                break
                
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
    """DeliveryDailyRecord 동기화"""
    print("\n=== DeliveryDailyRecord ===")
    if SYNC_MODE != "remote":
        print("  [LOCAL MODE] 동기화 스킵")
        print(f"  로컬 DB 총 레코드: {DeliveryDailyRecord.objects.count()}")
        return
        
    data = fetch_remote(f"{REMOTE}/api/delivery/hourly")
    if not data or not data.get("success"):
        print("  [FALLBACK] 원격 연결 실패 또는 데이터 없음")
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
    """BarcodeMaster 동기화"""
    print("\n=== BarcodeMaster ===")
    if SYNC_MODE != "remote":
        print("  [LOCAL MODE] 동기화 스킵")
        print(f"  로컬 DB 총 레코드: {BarcodeMaster.objects.count()}")
        return
        
    data = fetch_remote(f"{REMOTE}/api/inventory/barcode-master")
    if not data or not data.get("success"):
        print("  [FALLBACK] 원격 연결 실패 또는 데이터 없음")
        return
        
    items = data.get("data", [])
    if not isinstance(items, list):
        print("  [ERROR] 데이터 형식 오류")
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
    """FCInboundRecord 동기화"""
    print("\n=== FCInboundRecord ===")
    if SYNC_MODE != "remote":
        print("  [LOCAL MODE] 동기화 스킵")
        print(f"  로컬 DB 총 레코드: {FCInboundRecord.objects.count()}")
        return
        
    data = fetch_remote(f"{REMOTE}/api/fc-inbound?limit=100&offset=0")
    if not data:
        print("  [FALLBACK] 원격 연결 실패")
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
    """전체 동기화 실행"""
    print("=" * 50)
    print("VF 전체 동기화")
    print("=" * 50)
    print(f"모드: {'원격' if SYNC_MODE == 'remote' else '로컬'}")
    print(f"원격 서버: {REMOTE}")
    print("=" * 50)
    
    sync_production()
    sync_outbound()
    sync_delivery_hourly()
    sync_barcode_master()
    sync_fc_inbound()
    
    print("\n" + "=" * 50)
    print("동기화 완료")
    print("=" * 50)


if __name__ == "__main__":
    sync_all()