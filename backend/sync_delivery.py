#!/usr/bin/env python3
"""Delivery 데이터 동기화 스크립트

사용법:
  SYNC_MODE=remote python sync_delivery.py  # 원격 동기화
  python sync_delivery.py                    # 로컬 모드 (기본값)
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

from sales_api.models import DeliveryDailyRecord


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


def sync_delivery_data():
    """DeliveryDailyRecord 동기화"""
    print("=" * 50)
    print("VF Delivery 데이터 동기화")
    print("=" * 50)
    print(f"모드: {'원격' if SYNC_MODE == 'remote' else '로컬'}")
    print("=" * 50)
    
    if SYNC_MODE != "remote":
        print("[LOCAL MODE] Delivery 동기화 스킵 - 로컬 데이터 사용")
        print(f"  로컬 DB 총 레코드: {DeliveryDailyRecord.objects.count()}")
        return
        
    print(f"[REMOTE MODE] {REMOTE}에서 데이터 가져오는 중...")
    url = f"{REMOTE}/api/delivery/hourly?days=30"
    data = fetch_remote(url)
    
    if not data or not data.get("success"):
        print("[FALLBACK] 원격 연결 실패 - 로컬 모드로 전환")
        print(f"  로컬 DB 총 레코드: {DeliveryDailyRecord.objects.count()}")
        return
        
    items = data.get("data", [])
    created, updated = 0, 0
    
    for entry in items:
        date_str = entry.get('date')
        if not date_str:
            continue
            
        # hourly json fields are prefixed with 'hour_'
        hourly_data = {k: v for k, v in entry.items() if k.startswith('hour_')}
        
        try:
            obj = DeliveryDailyRecord.objects.get(date=date_str)
            obj.day_of_week = entry.get('dayOfWeek', '')
            obj.total = entry.get('total', 0)
            obj.hourly = hourly_data
            obj.save()
            updated += 1
            print(f"  Updated: {date_str}")
        except DeliveryDailyRecord.DoesNotExist:
            DeliveryDailyRecord.objects.create(
                date=date_str,
                day_of_week=entry.get('dayOfWeek', ''),
                total=entry.get('total', 0),
                hourly=hourly_data
            )
            created += 1
            print(f"  Created: {date_str}")
    
    print(f"\n동기화 완료: 생성={created} 업데이트={updated}")
    print(f"로컬 DB 총 레코드: {DeliveryDailyRecord.objects.count()}")


if __name__ == "__main__":
    sync_delivery_data()