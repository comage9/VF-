"""
Vehicle Order Service - 단일 진입점
차량 호차 할당, 순서 관리, PDF/씰 매핑을 모두 여기서 처리
"""
import os
import json
import re
import shutil
from datetime import date, datetime
from typing import Optional, List, Dict, Any
from django.db import connection

from ..models import DepartureRecord


class VehicleOrderService:
    """
    차량 순서/호차 관리 서비스

    핵심 원칙:
    1. 호차 = 사용자 수동 입력 우선 (차량 순서 입력 모달)
    2. 자동 스캔 시: 기존 순서 있으면 따름, 없으면 차량마스터 preferred_hoche 참조
    3. PDF 파일명: {plate}_{date}.pdf (호차 무관)
    4. 봉인씰: plate + date 기준 저장/조회
    """

    # 차량마스터 preferred_hoche (우선순위 힌트만)
    VEHICLE_PREFERRED_HOCHE = {
        "광주90바1703": 1,  # 김경옥
        "경기89바1454": 2,  # 김동수
        "경기82바3167": 1,  # 고민석
    }

    DEFAULT_TIMES = {1: "20:00", 2: "22:00", 3: "23:50"}

    def __init__(self):
        self.data_dir = os.path.join(os.path.dirname(__file__), "..", "data")
        self.ls_pdfs_dir = os.path.join(self.data_dir, "ls_pdfs")
        self.vehicle_master_path = os.path.join(self.data_dir, "vehicle_db_merged.json")
        self._vehicle_master_cache = None

    # ═══════════════════════════════════════════════════════
    # 차량 마스터
    # ═══════════════════════════════════════════════════════

    def _load_vehicle_master(self) -> List[Dict]:
        if self._vehicle_master_cache is None:
            if os.path.isfile(self.vehicle_master_path):
                with open(self.vehicle_master_path, "r", encoding="utf-8") as f:
                    self._vehicle_master_cache = json.load(f)
            else:
                self._vehicle_master_cache = []
        return self._vehicle_master_cache

    def get_vehicle_info(self, plate: str) -> Optional[Dict]:
        """차량번호로 마스터 정보 조회 (fuzzy match 포함)"""
        plate_clean = plate.replace(" ", "")
        for v in self._load_vehicle_master():
            db_plate = v.get("plateNumber", "").replace(" ", "")
            if db_plate == plate_clean:
                return v
        # fuzzy match (끝 4자리)
        plate_num = re.sub(r'[^0-9]', '', plate_clean)
        if len(plate_num) >= 4:
            for v in self._load_vehicle_master():
                db_num = re.sub(r'[^0-9]', '', v.get("plateNumber", ""))
                if len(db_num) >= 4 and db_num[-4:] == plate_num[-4:]:
                    return v
        return None

    def get_preferred_hoche(self, plate: str) -> Optional[int]:
        """차량 선호 호차 반환"""
        return self.VEHICLE_PREFERRED_HOCHE.get(plate)

    # ═══════════════════════════════════════════════════════
    # 호차 할당 로직 (핵심)
    # ═══════════════════════════════════════════════════════

    def get_today_order(self, target_date: str) -> List[Dict]:
        """날짜별 현재 차량 순서 조회 (호차순 정렬)"""
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT hoche, plate, driver_name, driver_phone, time, ton, hub,
                       seal_left_wing, seal_right_wing, seal_back_door
                FROM departure_records
                WHERE date = %s
                ORDER BY hoche
            """, [target_date])
            rows = cursor.fetchall()

        return [
            {
                "hoche": r[0], "plate": r[1], "driver": r[2], "phone": r[3],
                "time": r[4], "ton": r[5], "hub": r[6],
                "seals": {"leftWing": r[7], "rightWing": r[8], "backDoor": r[9]}
            }
            for r in rows
        ]

    def get_vehicles_by_date(self, target_date: str) -> List[Dict]:
        """날짜별 차량 목록 조회 (파서용 - slipNo 포함)"""
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT hoche, plate, driver_name, driver_phone, time, ton, hub,
                       seal_left_wing, seal_right_wing, seal_back_door,
                       slip_no, barcode, is_new, original_ton
                FROM departure_records
                WHERE date = %s
                ORDER BY hoche
            """, [target_date])
            rows = cursor.fetchall()

        return [
            {
                "hoche": r[0], "plate": r[1], "driver": r[2], "phone": r[3],
                "time": r[4], "ton": r[5], "hub": r[6],
                "seals": {"leftWing": r[7], "rightWing": r[8], "backDoor": r[9]},
                "slipNo": r[10], "barcode": r[11], "isNew": r[12], "original_ton": r[13]
            }
            for r in rows
        ]

    def assign_hoche(self, plate: str, target_date: str, current_order: List[Dict]) -> int:
        """
        새 차량의 호차 결정

        우선순위:
        1. 이미 같은 날짜에 등록된 차량이면 기존 호차 유지
        2. 사용자 입력 순서(current_order)에 빈 슬롯 있으면 채움
        3. 차량마스터 preferred_hoche 참조 (비어있으면)
        4. 없으면 다음 번호
        """
        # 1. 이미 등록된 차량인지 확인
        for v in current_order:
            if v["plate"].replace(" ", "") == plate.replace(" ", ""):
                return v["hoche"]

        # 2. 현재 사용 중인 호차들
        used_hoches = {v["hoche"] for v in current_order}

        # 3. 1~3호차 중 빈 슬롯 찾기 (우선순위: 1, 2, 3)
        for h in [1, 2, 3]:
            if h not in used_hoches:
                preferred = self.get_preferred_hoche(plate)
                if preferred == h or preferred is None:
                    return h

        # 4. 선호 호차 비어있으면 그것 사용 (1~3 넘어선 경우)
        preferred = self.get_preferred_hoche(plate)
        if preferred and preferred not in used_hoches:
            return preferred

        # 5. 다음 번호
        return max(used_hoches) + 1 if used_hoches else 1

    def reorder_from_input(self, target_date: str, lines: List[str]) -> List[Dict]:
        """
        차량 순서 입력 모달에서 받은 텍스트로 전체 재정렬

        입력 형식: [허브][호차] 차량번호 연락처
        예: [부천1HUB][1호] 경기82바3167 010-5216-6253

        반환: 적용된 순서 리스트
        """
        parsed = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            match = re.search(r'\[([^\]]+)\]\[(\d+)호\]\s+(\S+)\s+(\S+)', line)
            if match:
                hub, hoche_str, plate, phone = match.groups()
                parsed.append({
                    "hoche": int(hoche_str),
                    "plate": plate,
                    "phone": phone,
                    "hub": hub
                })

        if not parsed:
            return []

        # 호차순 정렬
        parsed.sort(key=lambda x: x["hoche"])

        # DB 업데이트
        for item in parsed:
            with connection.cursor() as cursor:
                cursor.execute("""
                    UPDATE departure_records
                    SET plate=%s, driver_phone=%s, hub=%s
                    WHERE date=%s AND hoche=%s
                """, [item["plate"], item["phone"], item["hub"], target_date, item["hoche"]])

        return parsed

    # ═══════════════════════════════════════════════════════
    # PDF 파일 관리 (plate + date 기준)
    # ═══════════════════════════════════════════════════════

    def get_pdf_path(self, plate: str, target_date: str) -> Optional[str]:
        """차량별 PDF 경로 조회 (날짜별 폴더 우선, 없으면 공통)"""
        plate_clean = plate.replace(" ", "")
        # 1. 날짜별 폴더
        date_dir = os.path.join(self.ls_pdfs_dir, target_date)
        path = os.path.join(date_dir, f"{plate_clean}.pdf")
        if os.path.isfile(path):
            return path
        # 2. 공통 폴더
        path = os.path.join(self.ls_pdfs_dir, f"{plate_clean}.pdf")
        if os.path.isfile(path):
            return path
        return None

    def save_pdf(self, source_path: str, plate: str, target_date: str) -> str:
        """PDF를 plate 기준 파일명으로 저장"""
        plate_clean = plate.replace(" ", "")
        date_dir = os.path.join(self.ls_pdfs_dir, target_date)
        os.makedirs(date_dir, exist_ok=True)
        dest_path = os.path.join(date_dir, f"{plate_clean}.pdf")
        shutil.copy2(source_path, dest_path)
        return dest_path

    def delete_pdf(self, plate: str, target_date: str) -> bool:
        """PDF 삭제"""
        plate_clean = plate.replace(" ", "")
        deleted = False
        # 날짜별
        path = os.path.join(self.ls_pdfs_dir, target_date, f"{plate_clean}.pdf")
        if os.path.isfile(path):
            os.remove(path)
            deleted = True
        # 공통
        path = os.path.join(self.ls_pdfs_dir, f"{plate_clean}.pdf")
        if os.path.isfile(path):
            os.remove(path)
            deleted = True
        return deleted

    def delete_all_pdfs_for_date(self, target_date: str) -> int:
        """날짜별 PDF 폴더 전체 삭제"""
        date_dir = os.path.join(self.ls_pdfs_dir, target_date)
        if os.path.isdir(date_dir):
            shutil.rmtree(date_dir)
            return 1
        return 0

    # ═══════════════════════════════════════════════════════
    # 봉인씰 관리 (plate + date 기준)
    # ═══════════════════════════════════════════════════════

    def get_seals(self, plate: str, target_date: str) -> Dict[str, str]:
        """차량+날짜 기준 봉인씰 조회"""
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT seal_left_wing, seal_right_wing, seal_back_door
                FROM departure_records
                WHERE date=%s AND plate=%s
            """, [target_date, plate])
            row = cursor.fetchone()
        if row:
            return {"leftWing": row[0] or "", "rightWing": row[1] or "", "backDoor": row[2] or ""}
        return {"leftWing": "", "rightWing": "", "backDoor": ""}

    def save_seals(self, plate: str, target_date: str, seals: Dict[str, str]) -> bool:
        """차량+날짜 기준 봉인씰 저장"""
        with connection.cursor() as cursor:
            cursor.execute("""
                UPDATE departure_records
                SET seal_left_wing=%s, seal_right_wing=%s, seal_back_door=%s
                WHERE date=%s AND plate=%s
            """, [seals.get("leftWing", ""), seals.get("rightWing", ""), seals.get("backDoor", ""), target_date, plate])
            return cursor.rowcount > 0

    # ═══════════════════════════════════════════════════════
    # 초기화/삭제
    # ═══════════════════════════════════════════════════════

    def reset_date(self, target_date: str) -> Dict[str, int]:
        """날짜 데이터 완전 초기화 (DB + PDF)"""
        # DB 삭제
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM departure_records WHERE date=%s", [target_date])
            db_deleted = cursor.rowcount

        # PDF 삭제
        pdf_deleted = self.delete_all_pdfs_for_date(target_date)

        return {"db_deleted": db_deleted, "pdf_deleted": pdf_deleted}

    def delete_vehicle(self, plate: str, target_date: str) -> bool:
        """특정 차량 삭제 (DB + PDF)"""
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM departure_records WHERE date=%s AND plate=%s", [target_date, plate])
            db_deleted = cursor.rowcount > 0

        pdf_deleted = self.delete_pdf(plate, target_date)
        return db_deleted or pdf_deleted

    def add_vehicle_from_pdf(self, target_date: str, slip_no: str, pdf_path: str, info: dict, vehicle_master: list) -> dict:
        """PDF에서 추출한 정보로 차량 추가 (호차 자동 결정 포함)"""
        try:
            plate = info.get("plate", "")
            if not plate:
                return {"ok": False, "error": "No plate number"}

            # 현재 날짜 데이터 조회
            current_order = self.get_today_order(target_date)

            # 호차 결정
            hoche = self.assign_hoche(plate, target_date, current_order)
            time_val = self.DEFAULT_TIMES.get(hoche, "13:00")

            # 차량 마스터에서 톤수/기사 정보 조회
            matched_master = None
            for mv in vehicle_master:
                if self._is_plate_match(mv.get("plateNumber", ""), plate):
                    matched_master = mv
                    break

            if matched_master and matched_master.get("ton"):
                ton_val = matched_master["ton"]
                is_new_vehicle = False
            else:
                ton_val = "11T" if hoche == 3 or hoche > 3 else "5T"
                is_new_vehicle = True

            driver = info.get("driver", "") or (matched_master.get("driverName", "") if matched_master else "")
            phone = info.get("phone", "") or (matched_master.get("driverPhone", "") if matched_master else "")
            hub = info.get("hub", "부천1 HUB")

            # DB 저장
            with connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO departure_records
                    (date, hoche, plate, driver_name, driver_phone, time, ton, original_ton, plt, hub, is_new, slip_no, barcode,
                     last_seen, total_orders, seal_left_wing, seal_right_wing, seal_back_door, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                """, [target_date, hoche, plate, driver, phone, time_val, ton_val, ton_val, 0, hub, is_new_vehicle, slip_no, info.get("barcode", ""),
                      "-", 0, "", "", ""])

            # PDF 저장 (plate + date 기준)
            self.save_pdf(pdf_path, plate, target_date)

            return {"ok": True, "hoche": hoche, "plate": plate}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def _is_plate_match(self, plate1: str, plate2: str) -> bool:
        """차량번호 매칭 (기존 is_plate_match 로직)"""
        p1 = plate1.replace(" ", "")
        p2 = plate2.replace(" ", "")
        if not p1 or not p2:
            return False
        if p1 == p2:
            return True
        n1 = re.sub(r'[^0-9]', '', p1)
        n2 = re.sub(r'[^0-9]', '', p2)
        if len(n1) >= 4 and len(n2) >= 4 and n1[-4:] == n2[-4:]:
            return True
        return False


# 싱글톤 인스턴스
vehicle_order_service = VehicleOrderService()