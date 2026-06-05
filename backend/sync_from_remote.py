#!/usr/bin/env python3
"""bonohouse → 로컬 DB 동기화 스크립트

사용법:
  SYNC_MODE=remote python sync_from_remote.py  # 원격 동기화
  python sync_from_remote.py                    # 로컬 모드 (기본)
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

from sales_api.models import ProductionLog


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
    """ProductionLog 동기화 (선택적)"""
    if SYNC_MODE != "remote":
        print("[LOCAL MODE] ProductionLog 동기화 스킵 - 로컬 데이터 사용")
        print(f"  로컬 DB 총 레코드: {ProductionLog.objects.count()}")
        return

    print(f"[REMOTE MODE] {REMOTE}에서 데이터 가져오는 중...")
    url = f"{REMOTE}/api/production"
    data = fetch_remote(url)
    
    if not data:
        print("[FALLBACK] 원격 연결 실패 - 로컬 모드로 전환")
        print(f"  로컬 DB 총 레코드: {ProductionLog.objects.count()}")
        return

    items = data.get("results", {}).get("latestData", [])
    created, updated, skipped = 0, 0, 0

    for item in items:
        try:
            obj = ProductionLog.objects.get(id=item["id"])
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


def main():
    print("=" * 50)
    print("VF ProductionLog 동기화")
    print("=" * 50)
    print(f"모드: {'원격' if SYNC_MODE == 'remote' else '로컬'}")
    print("=" * 50)
    sync_production()


if __name__ == "__main__":
    main()