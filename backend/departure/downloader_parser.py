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


def extract_driver_name(text: str) -> str:
    """
    LS LinehaulSlip PDF 텍스트에서 기사명 추출.
    실제 포맷은 주로 '성함\\n이름' 이며, 구형은 'Name 이름' 도 있다.
    """
    if not text:
        return ""
    patterns = [
        r"성함\s*[\r\n]+\s*([가-힣]{2,4})",
        r"성함\s*[:：\s]+([가-힣]{2,4})",
        r"Name\s*[:：]?\s*([가-힣]{2,4})",
        r"Name\s+([A-Za-z]{2,20})",
        r"기사(?:명)?\s*[:：]?\s*([가-힣]{2,4})",
    ]
    skip = {"성함", "이름", "기사", "기사명", "운전", "운전자", "연락", "연락처"}
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if not m:
            continue
        name = (m.group(1) or "").strip()
        if name and name not in skip and len(name) >= 2:
            return name
    return ""


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
        #    실제 LS PDF: "성함\n최규익" (Name 영문 라벨이 아닌 한글 성함 + 줄바꿈)
        #    구형/영문: "Name 홍길동"
        info["driver"] = extract_driver_name(text)

        # 4. 연락처 추출
        #    PDF에서 전화번호가 하이픈 뒤 줄바꿈으로 쪼개지는 경우 허용
        #    예: "010-5871-\n3541" → "010-5871-3541"
        phone_match = re.search(r'(010-\d{3,4}-\s*\n?\s*\d{4})', text)
        if phone_match:
            raw = phone_match.group(1)
            info["phone"] = re.sub(r'\s+', '', raw)  # 공백/줄바꿈 제거
        else:
            info["phone"] = ""

        # 5. 트럭 바코드 추출 (10자리 숫자)
        barcode_match = re.search(r'\b(\d{10})\b', text)
        if barcode_match:
            info["barcode"] = barcode_match.group(1).strip()
        else:
            info["barcode"] = ""

        # 6. 도착지 HUB 추출
        # Arrival 다음에 Date/Time 헤더가 오는 PDF가 있어 오인식 방지
        hub_raw = ""
        hub_match = re.search(
            r'Arrival\s*((?:부천|인천|서울|경기|광주|대전|대구|부산|창원|천안|이천|용인|안성|평택)?\s*\d*\s*HUB)',
            text,
            re.IGNORECASE,
        )
        if hub_match:
            hub_raw = hub_match.group(1).strip()
        else:
            # "부천1HUB" / "부천1 HUB" 단독 패턴
            hub_match2 = re.search(r'((?:부천|인천|서울|광주|대전|대구|부산)\s*\d*\s*HUB)', text, re.IGNORECASE)
            if hub_match2:
                hub_raw = hub_match2.group(1).strip()
        hub_raw = re.sub(r'\s+', ' ', hub_raw).strip()
        if hub_raw and "HUB" in hub_raw.upper() and "DATE" not in hub_raw.upper() and "TIME" not in hub_raw.upper():
            if " HUB" not in hub_raw.upper() and hub_raw.upper().endswith("HUB"):
                hub_raw = re.sub(r'(?i)HUB$', ' HUB', hub_raw)
            info["hub"] = hub_raw
        else:
            info["hub"] = "부천1 HUB"

    except Exception as e:
        print(f"Error parsing PDF {pdf_path}: {e}")

    return info


import threading

_scan_lock = threading.Lock()


def _epoch_to_hhmm(epoch_ms) -> str:
    """requestTimeEpoch(ms) → 'HH:MM' (로컬 시각 = 접안 요청 시간)."""
    try:
        e = int(epoch_ms or 0)
        if e <= 0:
            return ""
        # ms / sec 자동 판별
        if e > 10_000_000_000:
            e = e / 1000.0
        dt = datetime.datetime.fromtimestamp(e)
        return dt.strftime("%H:%M")
    except Exception:
        return ""


def _load_ls_orders(target_date: str) -> dict:
    """
    ls_orders_{date}.json 로드.
    반환:
      {
        "by_slip": { truckRequestId: epoch_ms },
        "by_slip_meta": { truckRequestId: { epoch, time, template_id, plate } },
        "by_plate": { plate_norm: { "epoch", "time", "plate", "template_id" } },
      }
    호차 SoT: templateId → 접안시간 슬롯 (연속 1·2·3 압축 금지).
    """
    orders_path = os.path.join(DATA_DIR, f"ls_orders_{target_date}.json")
    empty = {"by_slip": {}, "by_slip_meta": {}, "by_plate": {}}
    if not os.path.isfile(orders_path):
        return empty
    try:
        with open(orders_path, "r", encoding="utf-8") as f:
            orders = json.load(f)
        by_slip = {}
        by_slip_meta = {}
        by_plate = {}
        for o in orders or []:
            slip = str(o.get("truckRequestId") or "").strip()
            epoch = o.get("requestTimeEpoch") or 0
            try:
                epoch = int(epoch)
            except (TypeError, ValueError):
                epoch = 0
            plate = (o.get("plateNumber") or o.get("plate") or "").strip()
            plate_norm = re.sub(r"\s+", "", plate)
            t = _epoch_to_hhmm(epoch)
            tid = o.get("templateId") or o.get("truckOrderTemplateId")
            try:
                tid = int(tid) if tid is not None and tid != "" else None
            except (TypeError, ValueError):
                tid = None
            meta = {
                "epoch": epoch,
                "time": t,
                "plate": plate,
                "template_id": tid,
            }
            if slip:
                by_slip[slip] = epoch
                by_slip_meta[slip] = meta
            if plate_norm:
                prev = by_plate.get(plate_norm)
                if prev is None or epoch < (prev.get("epoch") or 0) or not prev.get("epoch"):
                    by_plate[plate_norm] = dict(meta)
        return {"by_slip": by_slip, "by_slip_meta": by_slip_meta, "by_plate": by_plate}
    except Exception:
        return empty


def scan_downloads_folder():
    """Downloads 폴더를 스캔하여 신규 PDF 차량 정보를 DB화"""
    with _scan_lock:
        if not os.path.isdir(DOWNLOADS_DIR):
            return {"ok": False, "error": "Downloads directory not found"}

        processed_slips = load_processed_slips()
    vehicle_master = load_vehicle_master()

    # 1. Downloads 폴더에서 LinehaulSlip-*.pdf 파일 검색
    files = [f for f in os.listdir(DOWNLOADS_DIR) if f.startswith("LinehaulSlip-") and f.endswith(".pdf")]

    new_records_count = 0
    synced_dates = set()

    # VehicleOrderService import (순환 참조 방지 위해 함수 내부에서)
    from .services.vehicle_order import vehicle_order_service

    # DB 검증: processed_slips에 있더라도 DB에 없으면 재처리 대상
    try:
        from departure.models import DepartureRecord
        db_slip_set = set(
            DepartureRecord.objects
            .exclude(slip_no="")
            .exclude(slip_no__isnull=True)
            .values_list("slip_no", flat=True)
        )
    except Exception:
        db_slip_set = set()

    # 2. 미처리 PDF 수집 (slip_no, filename, pdf_path, info, target_date)
    pending = []
    for filename in files:
        slip_match = re.search(r'LinehaulSlip-(\d+)', filename)
        if not slip_match:
            continue
        slip_no = slip_match.group(1)

        # 중복 체크: processed_slips에 있고 DB에도 있으면 패스
        if slip_no in processed_slips and slip_no in db_slip_set:
            continue

        pdf_path = os.path.join(DOWNLOADS_DIR, filename)
        info = extract_pdf_info(pdf_path)
        if not info.get("plate"):
            continue

        target_date = info["date"]
        date_data = vehicle_order_service.get_vehicles_by_date(target_date)
        if any(v.get("slipNo") == slip_no for v in date_data):
            processed_slips.add(slip_no)
            continue

        pending.append({
            "slip_no": slip_no,
            "filename": filename,
            "pdf_path": pdf_path,
            "info": info,
            "target_date": target_date,
        })
        synced_dates.add(target_date)

    if not pending:
        # processed_slips 동기화만 수행
        valid_slips = [s for s in processed_slips if s in db_slip_set]
        save_processed_slips(valid_slips)
        return {"ok": True, "new_count": 0, "synced_dates": []}

    # 3. 날짜별 호차 배정: LS templateId / 접안시간 슬롯 (1=20:00,2=22:00,3=23:50)
    # ※ 연속 1·2·3 압축 금지 — 1·3호만 배차 시 23:50은 3호, 2호 슬롯 비움
    from collections import defaultdict
    by_date = defaultdict(list)
    for item in pending:
        by_date[item["target_date"]].append(item)

    for target_date, items in by_date.items():
        ls_orders = _load_ls_orders(target_date)
        by_slip = ls_orders.get("by_slip") or {}
        by_slip_meta = ls_orders.get("by_slip_meta") or {}
        by_plate = ls_orders.get("by_plate") or {}

        # 접안 시간 빠른 순 (등록 안정용 · 호차는 슬롯 매핑)
        def sort_key(item):
            slip = str(item.get("slip_no") or "")
            epoch = by_slip.get(slip) or 0
            if not epoch:
                plate_norm = re.sub(r"\s+", "", (item.get("info") or {}).get("plate") or "")
                epoch = (by_plate.get(plate_norm) or {}).get("epoch") or 0
            if epoch:
                return (0, epoch)
            return (1, os.path.getmtime(item["pdf_path"]))

        items.sort(key=sort_key)

        existing_hoches = set()
        try:
            existing = DepartureRecord.objects.filter(date=target_date).values_list(
                "hoche", flat=True
            )
            existing_hoches = {int(h) for h in existing if h is not None}
        except Exception:
            pass

        for item in items:
            slip = str(item.get("slip_no") or "")
            plate_norm = re.sub(r"\s+", "", (item.get("info") or {}).get("plate") or "")
            meta = by_slip_meta.get(slip) or by_plate.get(plate_norm) or {}
            epoch = meta.get("epoch") or by_slip.get(slip) or 0
            dock_time = meta.get("time") or _epoch_to_hhmm(epoch)
            tid = meta.get("template_id")
            if dock_time:
                item["info"]["time"] = dock_time
                item["info"]["requestTimeEpoch"] = epoch
            else:
                item["info"]["time"] = ""

            hoche = vehicle_order_service.resolve_ls_hoche(
                time_str=dock_time or "",
                template_id=tid,
                plate=(item.get("info") or {}).get("plate") or "",
                used_hoches=existing_hoches,
            )
            existing_hoches.add(hoche)

            result = vehicle_order_service.add_vehicle_from_pdf(
                target_date=target_date,
                slip_no=item["slip_no"],
                pdf_path=item["pdf_path"],
                info=item["info"],
                vehicle_master=vehicle_master,
                hoche_override=hoche,
            )

            if result["ok"]:
                processed_slips.add(item["slip_no"])
                db_slip_set.add(item["slip_no"])
                new_records_count += 1
                print(
                    f"[Scanner] {target_date} {hoche}호차: "
                    f"{item['info'].get('plate')} time={dock_time or '-'} "
                    f"template={tid} (slip:{item['slip_no']})"
                )

        # 신규 등록 후: LS 슬롯 기준 호차 재정렬 (빈 슬롯 유지)
        try:
            n_fix = vehicle_order_service.reorder_by_dock_time(target_date)
            if n_fix:
                print(f"[Scanner] {target_date} LS슬롯 호차 재정렬 {n_fix}대")
        except Exception as re_err:
            print(f"[Scanner] 호차 재정렬 스킵: {re_err}")

    # processed_slips을 DB 실제 상태와 동기화
    # (DB에 없는 slip_no는 processed_slips에서도 제거)
    valid_slips = [s for s in processed_slips if s in db_slip_set]
    save_processed_slips(valid_slips)

    if new_records_count > 0:
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