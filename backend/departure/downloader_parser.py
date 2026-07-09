# -*- coding: utf-8 -*-
import os
import re
import shutil
import datetime
import json
import fitz  # PyMuPDF

# 경로 설정
DEPARTURE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(DEPARTURE_DIR, "data")
DOWNLOADS_DIR = os.path.join(os.path.expanduser("~"), "Downloads")
PROCESSED_SLIPS_PATH = os.path.join(DATA_DIR, "processed_slips.json")
VEHICLE_DB_PATH = os.path.join(DATA_DIR, "vehicle_db_merged.json")


def load_processed_slips():
    """이미 처리 완료된 송장번호(slipNo) 목록 로드"""
    if os.path.isfile(PROCESSED_SLIPS_PATH):
        try:
            with open(PROCESSED_SLIPS_PATH, "r", encoding="utf-8") as f:
                return set(json.load(f))
        except Exception:
            pass
    return set()


def save_processed_slips(slips):
    """처리 완료된 송장번호 목록 저장"""
    with open(PROCESSED_SLIPS_PATH, "w", encoding="utf-8") as f:
        json.dump(list(slips), f, ensure_ascii=False, indent=2)


def load_vehicle_master():
    """차량 마스터 DB 로드"""
    if os.path.isfile(VEHICLE_DB_PATH):
        try:
            with open(VEHICLE_DB_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return []


def extract_pdf_info(pdf_path):
    """PDF 파일로부터 차량 및 배차 정보 추출"""
    info = {}
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()

        # 1. 날짜 추출 (Operation Date)
        date_match = re.search(r'(?:Date|일자)\s*(\d{4}-\d{2}-\d{2})', text, re.IGNORECASE)
        if date_match:
            info["date"] = date_match.group(1).strip()
        else:
            info["date"] = datetime.date.today().strftime("%Y-%m-%d")

        # 2. 차량번호 추출
        plate_match = re.search(r'([가-힣]{2}\d{2}[가-힣]\d{4})', text)
        if not plate_match:
            plate_match = re.search(r'([가-힣a-zA-Z0-9]+(?:\d{2}|\d{3})[가-힣]\d{4})', text)

        if plate_match:
            info["plate"] = plate_match.group(1).strip()
        else:
            info["plate"] = ""

        # 3. 기사명 추출
        driver_match = re.search(r'Name\s+([가-힣a-zA-Z]+)', text)
        if driver_match:
            info["driver"] = driver_match.group(1).strip()
        else:
            info["driver"] = ""

        # 4. 연락처 추출
        phone_match = re.search(r'(010-\d{3,4}-\d{4})', text)
        if phone_match:
            info["phone"] = phone_match.group(1).strip()
        else:
            info["phone"] = ""

        # 5. 트럭 바코드 추출 (10자리 숫자)
        barcode_match = re.search(r'\b(\d{10})\b', text)
        if barcode_match:
            info["barcode"] = barcode_match.group(1).strip()
        else:
            info["barcode"] = ""

        # 6. 도착지 HUB 추출
        hub_match = re.search(r'Arrival\s*([^\n\s]+HUB|[^\n\s]+)', text, re.IGNORECASE)
        if hub_match:
            hub_raw = hub_match.group(1).strip()
            if "HUB" in hub_raw and " HUB" not in hub_raw:
                hub_raw = hub_raw.replace("HUB", " HUB")
            info["hub"] = hub_raw
        else:
            info["hub"] = "부천1 HUB"

    except Exception as e:
        print(f"Error parsing PDF {pdf_path}: {e}")

    return info


import threading

_scan_lock = threading.Lock()


def scan_downloads_folder():
    """Downloads 폴더를 스캔하여 신규 PDF 차량 정보를 DB화"""
    with _scan_lock:
        if not os.path.isdir(DOWNLOADS_DIR):
            return {"ok": False, "error": "Downloads directory not found"}

        processed_slips = load_processed_slips()
    vehicle_master = load_vehicle_master()

    # 1. Downloads 폴더에서 LinehaulSlip-*.pdf 파일 검색
    files = [f for f in os.listdir(DOWNLOADS_DIR) if f.startswith("LinehaulSlip-") and f.endswith(".pdf")]

    # 파일을 수정한 시간(다운로드 받은 시간) 순서대로 정렬
    files.sort(key=lambda x: os.path.getmtime(os.path.join(DOWNLOADS_DIR, x)))

    new_records_count = 0
    synced_dates = set()

    # VehicleOrderService import (순환 참조 방지 위해 함수 내부에서)
    from .services.vehicle_order import vehicle_order_service

    for filename in files:
        # 파일명에서 slipNo 추출
        slip_match = re.search(r'LinehaulSlip-(\d+)', filename)
        if not slip_match:
            continue

        slip_no = slip_match.group(1)
        if slip_no in processed_slips:
            continue  # 이미 처리된 송장은 패스

        pdf_path = os.path.join(DOWNLOADS_DIR, filename)
        info = extract_pdf_info(pdf_path)

        if not info.get("plate"):
            continue  # 차량번호 파싱 실패 시 제외

        target_date = info["date"]
        synced_dates.add(target_date)

        # 날짜별 기존 데이터 로드 (VehicleOrderService 사용)
        date_data = vehicle_order_service.get_vehicles_by_date(target_date)

        # 이미 동일 송장번호가 DB에 있는지 확인
        if any(v.get("slipNo") == slip_no for v in date_data):
            processed_slips.add(slip_no)
            continue

        # VehicleOrderService를 통해 차량 추가 (호차 자동 결정 포함)
        result = vehicle_order_service.add_vehicle_from_pdf(
            target_date=target_date,
            slip_no=slip_no,
            pdf_path=pdf_path,
            info=info,
            vehicle_master=vehicle_master
        )

        if result["ok"]:
            processed_slips.add(slip_no)
            new_records_count += 1

    if new_records_count > 0:
        save_processed_slips(processed_slips)

        # 모듈 캐시 동기화를 위해 views 모듈 전역 변수 리셋
        try:
            from . import views
            views.LS_DATA = []
        except Exception:
            pass

    return {
        "ok": True,
        "new_count": new_records_count,
        "synced_dates": list(synced_dates)
    }