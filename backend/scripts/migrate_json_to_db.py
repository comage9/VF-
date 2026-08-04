import os
import sys
import json
import glob
import re
import django

# Django 환경 설정
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from departure.models import DepartureRecord

DATA_DIR = os.path.join(BASE_DIR, "departure", "data")

def get_best_field(d, keys, default=''):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default

def migrate_entry(date_str, v):
    hoche = v.get("hoche")
    if not hoche:
        return
        
    seals = v.get("seals") or {}
    
    # DepartureRecord 매칭 데이터 생성 또는 업데이트
    record, created = DepartureRecord.objects.update_or_create(
        date=date_str,
        hoche=hoche,
        defaults={
            "plate": get_best_field(v, ["plate"]),
            "driver_name": get_best_field(v, ["driver", "driverName", "name"]),
            "driver_phone": get_best_field(v, ["driverPhone", "phone"]),
            "ton": get_best_field(v, ["ton"], "5T"),
            "original_ton": get_best_field(v, ["original_ton"], "5T"),
            "time": get_best_field(v, ["time"]),
            "plt": v.get("plt", 0),
            "hub": get_best_field(v, ["hub"]),
            "is_new": v.get("isNew", False),
            "slip_no": get_best_field(v, ["slipNo", "slip_no"]),
            "barcode": get_best_field(v, ["barcode"]),
            "last_seen": get_best_field(v, ["lastSeen", "last_seen"], "-"),
            "total_orders": v.get("totalOrders", 0),
            "seal_left_wing": seals.get("leftWing", ""),
            "seal_right_wing": seals.get("rightWing", ""),
            "seal_back_door": seals.get("backDoor", ""),
        }
    )
    status = "Created" if created else "Updated"
    print(f"[{status}] {date_str} - {hoche}호차 ({record.plate})")

def run():
    print("=" * 60)
    print("MIGRATING JSON DATA TO SQLITE DATABASE")
    print("=" * 60)
    
    # 1. 일별 파일 스캔 (ls_data_YYYY-MM-DD.json)
    pattern = os.path.join(DATA_DIR, "ls_data_*.json")
    files = glob.glob(pattern)
    print(f"Found {len(files)} daily JSON files to process...")
    
    for fpath in files:
        fname = os.path.basename(fpath)
        m = re.match(r"ls_data_(\d{4}-\d{2}-\d{2})\.json", fname)
        if not m:
            continue
        date_str = m.group(1)
        
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                for entry in data:
                    migrate_entry(date_str, entry)
        except Exception as e:
            print(f"Error processing {fname}: {e}")
            
    # 2. 공통 파일 fallback 스캔 (ls_data.json)
    common_path = os.path.join(DATA_DIR, "ls_data.json")
    if os.path.isfile(common_path):
        print("Processing common ls_data.json...")
        try:
            with open(common_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                for entry in data:
                    date_str = entry.get("date")
                    if date_str:
                        migrate_entry(date_str, entry)
        except Exception as e:
            print(f"Error processing common ls_data.json: {e}")
            
    print("=" * 60)
    print("MIGRATION COMPLETED SUCCESSFULLY")
    print("=" * 60)

if __name__ == "__main__":
    run()
