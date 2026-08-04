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

    # 차량마스터 preferred_hoche (힌트만 · LS template/시간보다 후순위)
    VEHICLE_PREFERRED_HOCHE = {
        "광주90바1703": 3,  # 김경옥 — 통상 3호(23:50)
        "경기89바1454": 2,  # 김동수
        "경기82바3167": 1,  # 고민석
    }

    # 기본 배차 3대 슬롯 (VF67 운영 표준)
    DEFAULT_TIMES = {1: "20:00", 2: "22:00", 3: "23:50"}

    # LS truckOrderTemplateId → 호차 (실데이터 07/22~07/26 확인)
    # 1호=90626(20:00), 2호=90628(22:xx), 3호=90269(23:50)
    LS_TEMPLATE_HOCHE = {
        90626: 1,
        90628: 2,
        90269: 3,
    }

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
        plate_norm = re.sub(r"\s+", "", plate or "")
        return self.VEHICLE_PREFERRED_HOCHE.get(plate_norm) or self.VEHICLE_PREFERRED_HOCHE.get(
            plate or ""
        )

    # ═══════════════════════════════════════════════════════
    # 호차 할당 로직 (핵심)
    # ═══════════════════════════════════════════════════════

    @staticmethod
    def _hhmm_to_mins(time_str: str) -> Optional[int]:
        m = re.match(r"^(\d{1,2}):(\d{2})$", (time_str or "").strip())
        if not m:
            return None
        return int(m.group(1)) * 60 + int(m.group(2))

    def hoche_from_template_id(self, template_id) -> Optional[int]:
        """LS truckOrderTemplateId → 고정 호차 (1/2/3)."""
        if template_id is None or template_id == "":
            return None
        try:
            tid = int(template_id)
        except (TypeError, ValueError):
            return None
        return self.LS_TEMPLATE_HOCHE.get(tid)

    def hoche_from_dock_time(self, time_str: str) -> Optional[int]:
        """
        접안 HH:MM → 기본 슬롯 호차 (가장 가까운 DEFAULT_TIMES).
        예: 20:00→1, 22:00→2, 23:50→3.
        1·3호만 먼저 배차돼도 23:50은 3호에 고정 (2호 빈 슬롯 유지).
        """
        mins = self._hhmm_to_mins(time_str)
        if mins is None:
            return None
        best_h = None
        best_dist = 10**9
        for h, t in self.DEFAULT_TIMES.items():
            tm = self._hhmm_to_mins(t)
            if tm is None:
                continue
            dist = abs(tm - mins)
            # 동거리면 번호 작은 호차 우선
            if dist < best_dist or (dist == best_dist and (best_h is None or h < best_h)):
                best_dist = dist
                best_h = h
        return best_h

    def resolve_ls_hoche(
        self,
        *,
        time_str: str = "",
        template_id=None,
        plate: str = "",
        used_hoches: Optional[set] = None,
    ) -> int:
        """
        LS 배차 호차 결정.

        우선순위:
          1) templateId 매핑 (LS 템플릿 = 호차 슬롯 SoT)
          2) 접안시간 → DEFAULT_TIMES 최근접 슬롯
          3) 차량 preferred_hoche
          4) 1·2·3 중 빈 슬롯 → 그 다음 번호

        used 슬롯이면 다음 후보로 폴백 (슬롯 충돌 시).
        """
        used = set(used_hoches or [])

        def _take(cand: Optional[int]) -> Optional[int]:
            if cand is None:
                return None
            try:
                h = int(cand)
            except (TypeError, ValueError):
                return None
            if h <= 0:
                return None
            if h not in used:
                return h
            return None

        for cand in (
            self.hoche_from_template_id(template_id),
            self.hoche_from_dock_time(time_str),
            self.get_preferred_hoche(plate),
        ):
            got = _take(cand)
            if got is not None:
                return got

        for h in (1, 2, 3):
            if h not in used:
                return h
        return (max(used) + 1) if used else 1

    def get_today_order(self, target_date: str) -> List[Dict]:
        """날짜별 현재 차량 순서 조회 (호차순 정렬)"""
        # 기사명 빈 칸이면 저장된 PDF에서 1회 보정
        try:
            self.backfill_missing_drivers(target_date)
        except Exception:
            pass
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

    def assign_hoche(
        self,
        plate: str,
        target_date: str,
        current_order: List[Dict],
        *,
        time_str: str = "",
        template_id=None,
    ) -> int:
        """
        새 차량의 호차 결정

        우선순위:
        1. 이미 같은 날짜에 등록된 차량이면 기존 호차 유지
        2. LS templateId / 접안시간 슬롯 (1·3호만 와도 3호 유지)
        3. 차량마스터 preferred_hoche
        4. 1·2·3 빈 슬롯 → 다음 번호
        """
        # 1. 이미 등록된 차량인지 확인
        for v in current_order:
            if (v.get("plate") or "").replace(" ", "") == (plate or "").replace(" ", ""):
                return int(v["hoche"])

        used_hoches = {int(v["hoche"]) for v in current_order if v.get("hoche") is not None}
        return self.resolve_ls_hoche(
            time_str=time_str,
            template_id=template_id,
            plate=plate,
            used_hoches=used_hoches,
        )

    def _normalize_order_text(self, line: str) -> str:
        s = (line or "").replace("\u00a0", " ").replace("\ufeff", "")
        out = []
        for ch in s:
            o = ord(ch)
            if 0xFF10 <= o <= 0xFF19:
                out.append(chr(o - 0xFF10 + ord("0")))
            elif ch in "：":
                out.append(":")
            elif ch in "－–—":
                out.append("-")
            else:
                out.append(ch)
        return "".join(out).strip()

    def _split_order_tokens(self, text: str) -> List[str]:
        """탭/쉼표/세미콜론/다중공백 등 다양한 구분자로 토큰 분리."""
        if not text:
            return []
        # 구분자 통일
        t = text
        for sep in ("\t", ",", ";", "|", "｜"):
            t = t.replace(sep, " ")
        # 2칸 이상 → 단일 공백 토큰 경계 유지 위해 먼저 분리
        if re.search(r"\s{2,}", t):
            parts = [p.strip() for p in re.split(r"\s{2,}", t) if p.strip()]
            # 각 파트 안 단일 공백도 분리
            tokens: List[str] = []
            for p in parts:
                tokens.extend([x for x in re.split(r"\s+", p) if x])
            return tokens
        return [x for x in re.split(r"\s+", t) if x]

    def _fmt_phone(self, digits: str) -> str:
        d = re.sub(r"\D", "", digits or "")
        if len(d) == 11:
            return f"{d[:3]}-{d[3:7]}-{d[7:]}"
        if len(d) == 10:
            return f"{d[:3]}-{d[3:6]}-{d[6:]}"
        return digits

    def parse_order_line(self, line: str) -> Optional[Dict[str, Any]]:
        """
        다양한 배차/순서 텍스트에서 필요 필드만 추출.

        인식 대상 (위치 무관, 패턴 매칭):
          - 호차: N호, N호차, [N호]
          - 차량번호: 한글+숫자 번호판 패턴
          - 전화: 01x...
          - 허브: HUB/허브 포함
          - 톤: 5, 5T, 11T (1~25)
          - 시간: HH:MM
          - 기사: 한글 2~4자 (운송사 제외)
        """
        line = self._normalize_order_text(line)
        if not line or line.startswith("#"):
            return None

        hub = plate = phone = driver = time = ton = ""
        hoche = 0

        # ── 1) 줄 전체 정규식 선추출 (토큰 깨짐 대비) ──
        m_hoche = re.search(r"\[(\d{1,2})\s*호(?:차)?\]|(\d{1,2})\s*호(?:차)?", line)
        if m_hoche:
            hoche = int(m_hoche.group(1) or m_hoche.group(2))

        m_bracket_hub = re.search(r"\[([^\]]*?HUB[^\]]*)\]", line, re.I)
        if m_bracket_hub:
            hub = m_bracket_hub.group(1).strip()

        plate_re = re.compile(r"[가-힣]{1,2}\d{2,3}[가-힣]\d{4}")
        pm = plate_re.search(re.sub(r"\s+", "", line))
        if pm:
            plate = pm.group(0)

        ph = re.search(r"01[016789]\d{7,8}", re.sub(r"[\s\-()]", "", line))
        if ph:
            phone = self._fmt_phone(ph.group(0))

        tm = re.search(r"\b(\d{1,2}:\d{2})\b", line)
        if tm:
            time = tm.group(1)

        # ── 2) 토큰 단위 보완 ──
        tokens = self._split_order_tokens(line)
        phone_re = re.compile(r"^01[016789]-?\d{3,4}-?\d{4}$|^01[016789]\d{7,8}$")
        time_re = re.compile(r"^\d{1,2}:\d{2}$")
        ton_re = re.compile(r"^(\d{1,2})\s*T$", re.I)
        ton_num_re = re.compile(r"^(\d{1,2})$")

        for t in tokens:
            if t in ("수배중", "수배 중", "-", "–", "—"):
                continue
            t_clean = re.sub(r"\s+", "", t)

            # 호차 토큰 단독: "1호", "3호차"
            mh = re.match(r"^(\d{1,2})\s*호(?:차)?$", t)
            if mh and not hoche:
                hoche = int(mh.group(1))
                continue

            if plate_re.search(t_clean) and not plate:
                plate = plate_re.search(t_clean).group(0)
                continue
            if phone_re.match(t_clean) and not phone:
                phone = self._fmt_phone(t_clean)
                continue
            if time_re.match(t) and not time:
                time = t
                continue
            # 5T / 11T
            if ton_re.match(t) and not ton:
                ton = f"{int(re.match(r'(\d+)', t).group(1))}T"
                continue
            # 단독 숫자 톤 (호차와 구분: 이미 호차 잡힌 뒤, 또는 1~25)
            if ton_num_re.match(t) and not ton:
                tn = int(t)
                # 호차가 아직 없고 1~9면 호차 후보로도 쓸 수 있음 → 뒤쪽 톤 우선은 차량 있으면 톤
                if 1 <= tn <= 25:
                    # 호차 미확정 + 줄 앞에 가까운 작은 숫자는 아래에서 처리
                    if hoche and tn != hoche:
                        ton = f"{tn}T"
                        continue
                    if hoche and tn == hoche:
                        continue
                    if not hoche and tn <= 15:
                        # 호차 후보로 보류하지 않고, 번호판이 있으면 톤으로
                        if plate:
                            ton = f"{tn}T"
                        else:
                            hoche = tn
                        continue
            if re.search(r"HUB|허브", t, re.I) and not hub:
                hub = t
                continue
            # 운송사/센터 스킵
            if (
                re.match(r"^VF\d+", t, re.I)
                or "유원" in t
                or re.search(r"VF\d+", t, re.I)
            ):
                continue
            if re.match(r"^[가-힣]{2,4}$", t) and not driver:
                # 지역명 제외 휴리스틱
                if t in ("부천", "광주", "경기", "충북", "서울", "인천", "대구", "부산"):
                    continue
                driver = t

        # 호차 미검출: 줄 시작 숫자 1~20 + 번호판 있으면 호차로
        if not hoche:
            m0 = re.match(r"^(\d{1,2})\b", line)
            if m0 and plate:
                cand = int(m0.group(1))
                if 1 <= cand <= 20:
                    hoche = cand
                    # 시작 숫자가 톤으로 잡혔으면 톤 클리어 후 재탐색
                    if ton == f"{cand}T":
                        ton = ""
                        for t in tokens:
                            if ton_num_re.match(t) and int(t) != cand and 1 <= int(t) <= 25:
                                ton = f"{int(t)}T"
                                break

        # 최소 조건: 호차 또는 (번호판+전화)
        if not hoche:
            if plate:
                # 호차 없으면 적용 불가 — 순서를 모름
                return None
            return None

        return {
            "hoche": int(hoche),
            "hub": hub,
            "plate": plate,
            "phone": phone,
            "driver": driver,
            "time": time,
            "ton": ton,
        }

    def parse_order_text(self, text: str) -> List[Dict[str, Any]]:
        """
        여러 줄/혼합 형식 텍스트 전체 파싱 후 호차순 정렬.
        빈 줄·주석(#) 무시. 동일 호차 중복 시 마지막 값 우선.
        """
        text = self._normalize_order_text(text or "")
        if not text:
            return []
        by_hoche: Dict[int, Dict[str, Any]] = {}
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            item = self.parse_order_line(line)
            if not item or not item.get("hoche"):
                continue
            h = int(item["hoche"])
            # 병합: 비어 있지 않은 필드만 덮어쓰기
            prev = by_hoche.get(h) or {"hoche": h}
            for k, v in item.items():
                if v not in ("", None):
                    prev[k] = v
            by_hoche[h] = prev
        return [by_hoche[h] for h in sorted(by_hoche.keys())]

    def reorder_from_input(self, target_date: str, lines: List[str]) -> List[Dict]:
        """
        차량 순서 입력 텍스트로 전체 재정렬 (호차 번호순 정렬 후 DB 반영).
        다양한 형식 혼합 가능 — parse_order_text 가 필요 필드만 추출.
        """
        if len(lines) == 1 and "\n" not in lines[0]:
            # 단일 문자열 블록일 수도 있음
            parsed = self.parse_order_text(lines[0])
            if not parsed:
                parsed = self.parse_order_text("\n".join(lines))
        else:
            parsed = self.parse_order_text("\n".join(lines))

        if not parsed:
            return []

        for item in parsed:
            hoche = int(item["hoche"])
            plate = item.get("plate") or ""
            phone = item.get("phone") or ""
            hub = item.get("hub") or ""
            driver = item.get("driver") or ""
            time = item.get("time") or ""
            ton = item.get("ton") or ""

            defaults = {}
            if plate:
                defaults["plate"] = plate
            if phone:
                defaults["driver_phone"] = phone
            if hub:
                defaults["hub"] = hub
            if driver:
                defaults["driver_name"] = driver
            if time:
                defaults["time"] = time
            if ton:
                defaults["ton"] = ton
                defaults["original_ton"] = ton

            from datetime import datetime as _dt

            try:
                d = _dt.strptime(target_date, "%Y-%m-%d").date()
            except Exception:
                d = target_date

            existing = DepartureRecord.objects.filter(date=d, hoche=hoche).first()
            if existing:
                for k, v in defaults.items():
                    if v != "" and v is not None:
                        setattr(existing, k, v)
                existing.save()
            else:
                DepartureRecord.objects.create(
                    date=d,
                    hoche=hoche,
                    plate=plate,
                    driver_name=driver,
                    driver_phone=phone,
                    hub=hub or "부천1HUB",
                    ton=ton or ("11T" if hoche == 3 else "5T"),
                    original_ton=ton or ("11T" if hoche == 3 else "5T"),
                    time=time or "",  # LS SoT — 수동 입력 없으면 빈 칸 (가짜 기본 시각 금지)
                )

        return parsed

    # ═══════════════════════════════════════════════════════
    # PDF 파일 관리 (plate + date 기준)
    # ═══════════════════════════════════════════════════════

    def extract_plate_from_pdf(self, pdf_path: str) -> str:
        """PDF 본문에서 차량번호 추출. 실패 시 빈 문자열."""
        if not pdf_path or not os.path.isfile(pdf_path):
            return ""
        try:
            import fitz
            doc = fitz.open(pdf_path)
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()
            m = re.search(r"([가-힣]{2}\d{2}[가-힣]\d{4})", text)
            if m:
                return m.group(1).strip()
            m = re.search(r"([가-힣a-zA-Z0-9]+(?:\d{2}|\d{3})[가-힣]\d{4})", text)
            if m:
                return m.group(1).strip()
        except Exception:
            pass
        return ""

    def _pdf_matches_plate(self, pdf_path: str, plate: str) -> bool:
        """PDF 본문 차량번호가 요청 plate와 일치하는지 (끝 4자리 포함)."""
        content_plate = self.extract_plate_from_pdf(pdf_path)
        if not content_plate or not plate:
            # 본문 파싱 실패 시 파일명 매칭만 허용하지 않음 → False (오인쇄 방지)
            return False
        return self._is_plate_match(content_plate, plate)

    def get_pdf_path(self, plate: str, target_date: str) -> Optional[str]:
        """
        차량별 PDF 경로 조회.
        파일명뿐 아니라 PDF 본문 차량번호가 일치하는 파일만 반환.
        호차 재정렬로 파일명이 뒤바뀐 경우 날짜 폴더 전체에서 내용 기준으로 탐색.
        """
        plate_clean = plate.replace(" ", "")
        date_dir = os.path.join(self.ls_pdfs_dir, target_date)

        # 1. 정상 파일명 후보 (내용 검증 필수)
        candidates = []
        named = os.path.join(date_dir, f"{plate_clean}.pdf")
        if os.path.isfile(named):
            candidates.append(named)
        common = os.path.join(self.ls_pdfs_dir, f"{plate_clean}.pdf")
        if os.path.isfile(common):
            candidates.append(common)

        for path in candidates:
            if self._pdf_matches_plate(path, plate_clean):
                return path

        # 2. 날짜 폴더 전체 스캔 (오명명/교차 저장 복구)
        if os.path.isdir(date_dir):
            for fname in os.listdir(date_dir):
                if not fname.lower().endswith(".pdf"):
                    continue
                if ".sealed." in fname.lower() or fname.lower().endswith(".sealed.pdf"):
                    continue
                path = os.path.join(date_dir, fname)
                if not os.path.isfile(path):
                    continue
                if self._pdf_matches_plate(path, plate_clean):
                    # 내용 일치 → 올바른 파일명으로 자동 교정 시도
                    correct = os.path.join(date_dir, f"{plate_clean}.pdf")
                    if os.path.normpath(path) != os.path.normpath(correct):
                        try:
                            if os.path.isfile(correct) and not self._pdf_matches_plate(correct, plate_clean):
                                # 잘못된 파일명이 점유 중이면 임시 교체
                                wrong_tmp = correct + ".wrong.tmp"
                                os.replace(correct, wrong_tmp)
                                os.replace(path, correct)
                                # wrong_tmp 내용 plate로 재명명 시도
                                wrong_plate = self.extract_plate_from_pdf(wrong_tmp)
                                if wrong_plate:
                                    wrong_dest = os.path.join(date_dir, f"{wrong_plate.replace(' ', '')}.pdf")
                                    if not os.path.isfile(wrong_dest):
                                        os.replace(wrong_tmp, wrong_dest)
                                    else:
                                        os.remove(wrong_tmp)
                                elif os.path.isfile(wrong_tmp):
                                    os.remove(wrong_tmp)
                                return correct
                            elif not os.path.isfile(correct):
                                os.replace(path, correct)
                                return correct
                        except Exception:
                            return path  # 교정 실패해도 내용 맞는 파일 반환
                    return path

        return None

    def save_pdf(self, source_path: str, plate: str, target_date: str) -> str:
        """PDF를 plate 기준 파일명으로 저장. 본문 plate가 있으면 그것을 우선."""
        content_plate = self.extract_plate_from_pdf(source_path)
        if content_plate:
            plate = content_plate
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

    def compose_seals_on_pdf(
        self,
        src_pdf: str,
        dest_pdf: str,
        seals: Dict[str, str],
    ) -> bool:
        """
        LS PDF에 봉인씰 번호 합성.

        봉인 행 실측 그리드 (셀 ≈ 65.4pt, y 178~192):
          [0 봉인][1 좌측윙][2 좌측값][3 우측윙][4 우측값 2칸폭][5 후면][6 후면값]

        현장: 번호가 라벨 위에 찍혀 왼쪽로 치우침 → **입력 칸(값 셀)으로 2칸 우측** 이동.
        좌측윙(1)→값(2) 가 한 칸처럼 보이지만, 봉인(0) 기준 열로는 2번째 데이터 칸.
        배치: 값 셀 2 / 4 / 6 중앙.
        """
        import fitz

        left = (seals.get("leftWing") or "").strip()
        right = (seals.get("rightWing") or "").strip()
        back = (seals.get("backDoor") or "").strip()
        if not (left or right or back):
            return False
        if not src_pdf or not os.path.isfile(src_pdf):
            return False

        # PDF drawings 실측 셀 (x0, x1)
        SEAL_VALUE_CELLS = {
            "left": (166.8, 232.1),   # 좌측 윙 오른쪽 빈칸
            "right": (297.5, 428.2),  # 우측 윙 오른쪽 빈칸 (와이드)
            "back": (493.6, 559.0),   # 후면 도어 오른쪽 빈칸
        }

        slots = [
            (left, ["좌측 윙", "좌측윙", "좌측"], "left"),
            (right, ["우측 윙", "우측윙", "우측"], "right"),
            (back, ["후면 도어", "후면도어", "후면"], "back"),
        ]

        def _text_x_in_cell(x0: float, x1: float, text: str) -> float:
            approx_w = max(len(text), 1) * 6.2
            cx = (x0 + x1) / 2.0 - approx_w / 2.0
            return max(x0 + 2.0, min(cx, x1 - approx_w - 2.0))

        doc = fitz.open(src_pdf)
        try:
            page = doc[0]
            for value, labels, kind in slots:
                if not value:
                    continue
                x0, x1 = SEAL_VALUE_CELLS[kind]
                y_base = 191.0
                for lab in labels:
                    hits = page.search_for(lab)
                    if hits:
                        y_base = float(hits[0].y1) - 2.0
                        break
                x = _text_x_in_cell(x0, x1, value)
                page.insert_text(
                    (x, y_base),
                    value,
                    fontsize=11,
                    fontname="cour",
                    color=(0, 0, 0),
                )
            doc.save(dest_pdf, garbage=4, deflate=True, incremental=False)
        finally:
            doc.close()
        return os.path.isfile(dest_pdf)

    def backfill_missing_drivers(self, target_date: str) -> int:
        """
        driver_name 이 비어 있는 당일 차량에 대해
        저장된 LS PDF에서 기사명을 다시 추출해 채운다.
        (get_today_order 를 호출하지 않음 — 재귀 방지)
        """
        from ..downloader_parser import extract_pdf_info

        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT plate, driver_name, driver_phone
                FROM departure_records
                WHERE date = %s
                """,
                [target_date],
            )
            rows = cursor.fetchall()

        updated = 0
        for plate, driver_name, driver_phone in rows:
            if (driver_name or "").strip():
                continue
            plate = (plate or "").strip()
            if not plate:
                continue
            pdf = self.get_pdf_path(plate, target_date)
            if not pdf:
                continue
            try:
                info = extract_pdf_info(pdf)
            except Exception:
                continue
            driver = (info.get("driver") or "").strip()
            phone = (info.get("phone") or "").strip()
            if not driver and not phone:
                continue
            with connection.cursor() as cursor:
                if driver and phone:
                    cursor.execute(
                        """
                        UPDATE departure_records
                        SET driver_name=%s,
                            driver_phone=CASE
                                WHEN COALESCE(driver_phone,'')='' THEN %s
                                ELSE driver_phone END
                        WHERE date=%s AND plate=%s
                        """,
                        [driver, phone, target_date, plate],
                    )
                elif driver:
                    cursor.execute(
                        """
                        UPDATE departure_records
                        SET driver_name=%s
                        WHERE date=%s AND plate=%s
                        """,
                        [driver, target_date, plate],
                    )
                if cursor.rowcount and cursor.rowcount > 0:
                    updated += cursor.rowcount
                elif driver:
                    updated += 1
        return updated

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

    def _ls_time_for(self, target_date: str, slip_no: str = "", plate: str = "") -> str:
        """LS SoT: ls_orders_{date}.json 의 requestTime → HH:MM. 없으면 ''."""
        from ..downloader_parser import _load_ls_orders, _epoch_to_hhmm

        ls = _load_ls_orders(str(target_date)[:10])
        slip = str(slip_no or "").strip()
        plate_norm = re.sub(r"\s+", "", plate or "")
        epoch = 0
        if slip:
            epoch = (ls.get("by_slip") or {}).get(slip) or 0
        if not epoch and plate_norm:
            epoch = ((ls.get("by_plate") or {}).get(plate_norm) or {}).get("epoch") or 0
        return _epoch_to_hhmm(epoch) if epoch else ""

    def _load_ls_order_rows(self, day: str) -> list:
        """ls_orders_{day}.json → 정규화 row 리스트 (접안시간 순)."""
        from ..downloader_parser import _epoch_to_hhmm

        orders_path = os.path.join(self.data_dir, f"ls_orders_{day}.json")
        if not os.path.isfile(orders_path):
            return []
        try:
            with open(orders_path, "r", encoding="utf-8") as f:
                orders = json.load(f) or []
        except Exception:
            return []
        rows = []
        for o in orders:
            slip = str(o.get("truckRequestId") or "").strip()
            plate = (o.get("plateNumber") or o.get("plate") or "").strip()
            plate_norm = re.sub(r"\s+", "", plate)
            if not plate_norm:
                continue
            epoch = o.get("requestTimeEpoch") or 0
            try:
                epoch = int(epoch)
            except (TypeError, ValueError):
                epoch = 0
            tid = o.get("templateId") or o.get("truckOrderTemplateId")
            try:
                tid = int(tid) if tid is not None and tid != "" else None
            except (TypeError, ValueError):
                tid = None
            time_hhmm = _epoch_to_hhmm(epoch) if epoch else ""
            slot = self.resolve_ls_hoche(
                time_str=time_hhmm, template_id=tid, plate=plate, used_hoches=set()
            )
            rows.append(
                {
                    "slip": slip,
                    "plate": plate,
                    "plate_norm": plate_norm,
                    "epoch": epoch,
                    "time": time_hhmm,
                    "template_id": tid,
                    "slot_hoche": slot,
                    "driver": (o.get("driverName") or "").strip(),
                    "phone": (o.get("driverPhone") or "").strip(),
                    "seal_left": str(o.get("sealLeft") or "").strip(),
                    "seal_right": str(o.get("sealRight") or "").strip(),
                    "seal_back": str(o.get("sealBack") or "").strip(),
                }
            )
        rows.sort(key=lambda r: (r["epoch"] or 10**18, r["plate_norm"]))
        return rows

    def count_vehicle_info(self, target_date: str) -> int:
        """차량 정보 대수 = plate 있는 Departure 행."""
        try:
            d = datetime.strptime(str(target_date)[:10], "%Y-%m-%d").date()
        except ValueError:
            return 0
        return (
            DepartureRecord.objects.filter(date=d)
            .exclude(plate__isnull=True)
            .exclude(plate="")
            .count()
        )

    def compare_ls_vehicle_info(self, target_date: str) -> dict:
        """
        차량 정보 N vs LS 배정 M 비교.
        needs_confirm: N>0 이고 M>N (LS가 더 많음 → UI 확인 필요)
        """
        day = str(target_date)[:10]
        rows = self._load_ls_order_rows(day)
        n = self.count_vehicle_info(day)
        m = len(rows)
        try:
            d = datetime.strptime(day, "%Y-%m-%d").date()
        except ValueError:
            d = None
        db_plates = set()
        if d is not None:
            for p in (
                DepartureRecord.objects.filter(date=d)
                .exclude(plate="")
                .values_list("plate", flat=True)
            ):
                db_plates.add(re.sub(r"\s+", "", p or ""))
        ls_plates = {r["plate_norm"] for r in rows}
        extra = [
            {"plate": r["plate"], "time": r["time"], "slip": r["slip"]}
            for r in rows
            if r["plate_norm"] not in db_plates
        ]
        missing = sorted(db_plates - ls_plates)
        return {
            "ok": True,
            "date": day,
            "vehicle_info_count": n,
            "ls_count": m,
            "needs_confirm": bool(n > 0 and m > n),
            "extra_ls": extra,
            "missing_on_ls": missing,
            "db_plates": sorted(db_plates),
            "ls_plates": sorted(ls_plates),
        }

    def sync_from_ls_orders(
        self, target_date: str, *, add_new: bool | None = None, reorder: bool = True
    ) -> dict:
        """
        차량 정보 기준 + LS 보강.

        정책 (A+B 병합):
          - 기존에 값이 있는 필드는 유지
          - 미입력(빈 칸)만 LS 값으로 채움
          - add_new=True: LS에만 있는 차량 행 추가
          - add_new=None(자동):
              · 차량정보 0대 → LS 전부 추가 허용 (초기 LS 선등록)
              · 차량정보 >0 이고 LS가 더 많으면 추가 안 함 (UI 확인 후 apply)
              · 그 외 매칭되는 미등록 plate 만 추가 가능(M<=N 슬롯 여유 시)

        plt·출고시간 수동값·이미 채운 봉인/기사는 덮지 않음.
        """
        from ..downloader_parser import _epoch_to_hhmm

        day = str(target_date)[:10]
        try:
            d = datetime.strptime(day, "%Y-%m-%d").date()
        except ValueError:
            return {"ok": False, "updated": 0, "error": "bad_date"}

        rows = self._load_ls_order_rows(day)
        if not rows:
            return {"ok": False, "updated": 0, "error": "no_ls_orders", "orders": 0}

        by_slip = {r["slip"]: r for r in rows if r.get("slip")}
        by_plate = {r["plate_norm"]: r for r in rows}

        qs = list(DepartureRecord.objects.filter(date=d))
        n = sum(1 for r in qs if (r.plate or "").strip())
        m = len(rows)

        if add_new is None:
            # 0대: LS 선등록 전부 / LS가 더 많으면 확인 전 추가 금지
            if n == 0:
                add_new = True
            elif m > n:
                add_new = False
            else:
                add_new = True  # M<=N: 아직 plate 없는 슬롯·미등록 LS 매칭 추가

        updated = 0
        for rec in qs:
            slip = str(rec.slip_no or "").strip()
            plate_norm = re.sub(r"\s+", "", rec.plate or "")
            row = by_slip.get(slip) or by_plate.get(plate_norm)
            if not row:
                continue
            changed = []
            # 미입력만 LS로 채움 (기존 값 유지)
            if row.get("time") and not (rec.time or "").strip():
                rec.time = row["time"]
                changed.append("time")
            if row.get("slip") and not (rec.slip_no or "").strip():
                rec.slip_no = row["slip"]
                changed.append("slip")
            if row.get("plate") and not (rec.plate or "").strip():
                rec.plate = row["plate"]
                changed.append("plate")
            if row.get("driver") and not (rec.driver_name or "").strip():
                rec.driver_name = row["driver"]
                changed.append("driver")
            if row.get("phone") and not (rec.driver_phone or "").strip():
                rec.driver_phone = row["phone"]
                changed.append("phone")
            if row.get("seal_left") and not (rec.seal_left_wing or "").strip():
                rec.seal_left_wing = row["seal_left"]
                changed.append("seal_l")
            if row.get("seal_right") and not (rec.seal_right_wing or "").strip():
                rec.seal_right_wing = row["seal_right"]
                changed.append("seal_r")
            if row.get("seal_back") and not (rec.seal_back_door or "").strip():
                rec.seal_back_door = row["seal_back"]
                changed.append("seal_b")
            if changed:
                rec.save()
                updated += 1
                print(f"[LS-merge] {day} {rec.plate or row.get('plate')}: fill {','.join(changed)}")

        added = 0
        if add_new:
            existing_plates = {
                re.sub(r"\s+", "", (r.plate or ""))
                for r in DepartureRecord.objects.filter(date=d)
                if (r.plate or "").strip()
            }
            used_hoches = set(
                int(h)
                for h in DepartureRecord.objects.filter(date=d).values_list(
                    "hoche", flat=True
                )
                if h is not None
            )
            for row in rows:
                if row["plate_norm"] in existing_plates:
                    continue
                hoche = self.resolve_ls_hoche(
                    time_str=row.get("time") or "",
                    template_id=row.get("template_id"),
                    plate=row.get("plate") or "",
                    used_hoches=used_hoches,
                )
                ton_val = "11T" if hoche == 3 or hoche > 3 else "5T"
                DepartureRecord.objects.create(
                    date=d,
                    hoche=hoche,
                    plate=row["plate"],
                    driver_name=row.get("driver") or "",
                    driver_phone=row.get("phone") or "",
                    time=row.get("time") or "",
                    ton=ton_val,
                    original_ton=ton_val,
                    plt=0,
                    hub="부천1 HUB",
                    slip_no=row.get("slip") or "",
                    seal_left_wing=row.get("seal_left") or "",
                    seal_right_wing=row.get("seal_right") or "",
                    seal_back_door=row.get("seal_back") or "",
                    last_seen="-",
                    total_orders=0,
                    is_new=True,
                )
                used_hoches.add(hoche)
                existing_plates.add(row["plate_norm"])
                added += 1
                print(f"[LS-merge] {day} ADD {row['plate']} → {hoche}호 time={row.get('time') or '-'}")

        n_re = self.reorder_by_dock_time(day) if reorder else 0
        cmp = self.compare_ls_vehicle_info(day)
        print(
            f"[LS-merge] {day} fill={updated} add={added} reorder={n_re} "
            f"N={cmp['vehicle_info_count']} M={cmp['ls_count']} "
            f"needs_confirm={cmp['needs_confirm']}"
        )
        return {
            "ok": True,
            "updated": updated,
            "added": added,
            "reordered": n_re,
            "orders": m,
            "db": self.count_vehicle_info(day),
            "add_new": add_new,
            "compare": cmp,
        }

    def apply_ls_merge_confirmed(self, target_date: str) -> dict:
        """
        UI 확인 후: LS에만 있는 차량 추가 + 미입력 채움 + 접안시간 순 호차.
        기존 입력값(plt·봉인·기사 등)은 비어 있지 않으면 유지.
        """
        return self.sync_from_ls_orders(
            target_date, add_new=True, reorder=True
        )

    def add_vehicle_from_pdf(self, target_date: str, slip_no: str, pdf_path: str, info: dict, vehicle_master: list, hoche_override: int = None) -> dict:
        """PDF에서 추출한 정보로 차량 추가 (호차 자동 결정 또는 외부 지정). 접안시간은 LS SoT."""
        try:
            plate = info.get("plate", "")
            if not plate:
                return {"ok": False, "error": "No plate number"}

            # 현재 날짜 데이터 조회
            current_order = self.get_today_order(target_date)

            # 호차 결정: 외부 지정(hoche_override)이 있으면 우선, 없으면 자동 결정
            # (스캔 경로는 접안시간 순으로 hoche_override 를 넘김)
            if hoche_override is not None:
                hoche = hoche_override
            else:
                hoche = self.assign_hoche(plate, target_date, current_order)
            # 접안 시간: LS requestTime 절대 우선 · PDF time 차선 · 기본값 사용 안 함(빈 칸)
            ls_time = self._ls_time_for(target_date, slip_no=slip_no, plate=plate)
            time_val = (
                ls_time
                or (info.get("time") or "").strip()
                or ""
            )
            if ls_time:
                info["time"] = ls_time

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
            # 전화번호: PDF 파싱값 우선, 비어있으면 마스터 DB에서 보완
            # (PDF에서 줄바꿈 등으로 파싱 실패하는 경우 마스터 값으로 채움)
            phone = info.get("phone", "") or (matched_master.get("driverPhone", "") if matched_master else "")
            hub = info.get("hub", "부천1 HUB") or "부천1 HUB"
            # PDF 오파싱 보정 (Arrival Date/Time 헤더 오인식)
            hub_up = str(hub).upper()
            if (
                hub_up in ("DATE/TIME", "DATE", "TIME")
                or "DATE" in hub_up
                or ("TIME" in hub_up and "HUB" not in hub_up)
                or "HUB" not in hub_up
            ):
                hub = "부천1 HUB"
            elif not re.search(r"\sHUB$", hub, re.I) and re.search(r"HUB$", hub, re.I):
                hub = re.sub(r"HUB$", " HUB", hub, flags=re.I)

            # 접안 통계: DB 이력 기준 (해당 일자 이전)
            last_seen, total_orders, is_new_vehicle = self._compute_dock_stats(
                plate, target_date
            )

            # DB 저장 (이미 존재하는 호차/차량이면 업데이트, 없으면 생성)
            try:
                # plate 우선 (호차 재정렬 후에도 기사명 갱신), 없으면 해당 호차 슬롯
                record = DepartureRecord.objects.filter(
                    date=target_date, plate=plate
                ).first()
                if record is None:
                    record = DepartureRecord.objects.filter(
                        date=target_date, hoche=hoche
                    ).first()
                if record is None:
                    raise DepartureRecord.DoesNotExist()
                record.plate = plate
                # 기사명: PDF에서 확보되면 채움/갱신 (성함 파싱 수정 반영)
                if driver:
                    record.driver_name = driver
                if phone:
                    record.driver_phone = phone
                # 접안시간: LS SoT — LS/info 시간 있으면 무조건 덮어씀 (13:00 기본값 고착 방지)
                if time_val:
                    record.time = time_val
                if not record.ton:
                    record.ton = ton_val
                    record.original_ton = ton_val
                record.hub = hub
                record.is_new = is_new_vehicle
                record.last_seen = last_seen
                record.total_orders = total_orders
                record.slip_no = slip_no
                record.barcode = info.get("barcode", "")
                record.save()
            except DepartureRecord.DoesNotExist:
                DepartureRecord.objects.create(
                    date=target_date,
                    hoche=hoche,
                    plate=plate,
                    driver_name=driver,
                    driver_phone=phone,
                    time=time_val,  # LS 없으면 빈 칸 (가짜 기본 시각 금지)
                    ton=ton_val,
                    original_ton=ton_val,
                    plt=0,
                    hub=hub,
                    is_new=is_new_vehicle,
                    slip_no=slip_no,
                    barcode=info.get("barcode", ""),
                    last_seen=last_seen,
                    total_orders=total_orders,
                    seal_left_wing="",
                    seal_right_wing="",
                    seal_back_door=""
                )

            # PDF 저장 (plate + date 기준)
            self.save_pdf(pdf_path, plate, target_date)

            # 차량 마스터 dates 동기화
            self._touch_vehicle_master_dates(
                plate, target_date, driver=driver, phone=phone, ton=ton_val
            )

            return {"ok": True, "hoche": hoche, "plate": plate}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def reorder_by_dock_time(self, target_date: str) -> int:
        """
        당일 차량 호차를 LS 슬롯에 맞게 재정렬.

        구버전: 접안시간 순으로 1·2·3 연속 부여 → 1·3호만 배차 시
        23:50 차량이 2호+23:50 로 잘못 들어감.

        신버전: templateId/접안시간 → 고정 슬롯(1=20:00,2=22:00,3=23:50).
        빈 슬롯(미배차 2호 등)은 비워 둠. 연속 압축 금지.
        """
        from django.db import transaction

        try:
            d = datetime.strptime(str(target_date)[:10], "%Y-%m-%d").date()
        except ValueError:
            return 0

        qs = list(DepartureRecord.objects.filter(date=d).order_by("hoche", "id"))
        if not qs:
            return 0

        # LS 주문으로 slip/plate → template·time 보강
        ls_rows = self._load_ls_order_rows(str(target_date)[:10])
        by_slip = {r["slip"]: r for r in ls_rows if r.get("slip")}
        by_plate = {r["plate_norm"]: r for r in ls_rows}

        # (rec, desired_hoche) 계산 — 충돌 시 epoch 빠른 쪽 우선, 나머지는 빈 슬롯
        planned: List[tuple] = []  # (rec, desired)
        used: set = set()
        # 1차: 원하는 슬롯 수집
        desires = []
        for rec in qs:
            slip = str(rec.slip_no or "").strip()
            plate_norm = re.sub(r"\s+", "", rec.plate or "")
            ls = by_slip.get(slip) or by_plate.get(plate_norm) or {}
            time_str = (ls.get("time") or rec.time or "").strip()
            tid = ls.get("template_id")
            desired = self.resolve_ls_hoche(
                time_str=time_str,
                template_id=tid,
                plate=rec.plate or "",
                used_hoches=set(),  # 1차는 충돌 무시하고 이상적 슬롯
            )
            # resolve with empty used always returns ideal; use template/time pure
            ideal = (
                self.hoche_from_template_id(tid)
                or self.hoche_from_dock_time(time_str)
                or self.get_preferred_hoche(rec.plate or "")
                or desired
            )
            epoch = int(ls.get("epoch") or 0)
            desires.append((rec, int(ideal), epoch, time_str))

        # epoch 빠른 순으로 슬롯 확정 (같은 슬롯 원하면 먼저 온 차량 우선)
        desires.sort(key=lambda x: (x[2] if x[2] else 10**18, x[1], x[0].id or 0))
        for rec, ideal, _epoch, _t in desires:
            h = ideal if ideal not in used else self.resolve_ls_hoche(
                time_str=_t,
                template_id=None,
                plate=rec.plate or "",
                used_hoches=used,
            )
            # ideal 점유 시 resolve 가 다른 슬롯 줌
            if h in used:
                h = self.resolve_ls_hoche(
                    time_str="",
                    template_id=None,
                    plate="",
                    used_hoches=used,
                )
            used.add(h)
            planned.append((rec, h))

        already_ok = all(rec.hoche == h for rec, h in planned)
        if already_ok:
            return 0

        with transaction.atomic():
            # unique(date,hoche) 충돌 회피: 임시 음수 호차
            for i, (rec, _h) in enumerate(planned):
                rec.hoche = -(i + 1)
                rec.save(update_fields=["hoche", "updated_at"])
            for rec, h in planned:
                rec.hoche = h
                rec.save(update_fields=["hoche", "updated_at"])

        print(
            f"[VehicleOrder] {target_date} LS슬롯 호차 재정렬: "
            + ", ".join(f"{h}호={rec.plate}/{(rec.time or '-')}" for rec, h in planned)
        )
        return len(planned)

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

    def _compute_dock_stats(self, plate: str, as_of: str):
        """
        최근 접안일 / 접안 횟수 (as_of 이전 이력만).
        returns (last_seen, total_orders, is_new)
        """
        plate_clean = (plate or "").replace(" ", "")
        if not plate_clean or plate_clean in ("수배중", "-"):
            return "-", 0, True
        try:
            as_of_s = str(as_of)[:10]
            qs = DepartureRecord.objects.exclude(plate="").exclude(plate="수배중")
            dates = set()
            for p, d in qs.values_list("plate", "date"):
                if not self._is_plate_match(p or "", plate_clean):
                    continue
                ds = d.isoformat() if hasattr(d, "isoformat") else str(d)[:10]
                if ds < as_of_s:
                    dates.add(ds)
            # 마스터 dates 보완
            for v in self._load_vehicle_master():
                if self._is_plate_match(v.get("plateNumber", ""), plate_clean):
                    for raw in v.get("dates") or []:
                        ds = str(raw)[:10]
                        if re.match(r"^\d{4}-\d{2}-\d{2}$", ds) and ds < as_of_s:
                            dates.add(ds)
                    break
            if not dates:
                return "-", 0, True
            past = sorted(dates)
            return past[-1], len(past), False
        except Exception:
            return "-", 0, True

    def _touch_vehicle_master_dates(
        self, plate: str, dock_date: str, *, driver: str = "", phone: str = "", ton: str = ""
    ):
        """vehicle_db_merged.json dates 에 접안일 추가 (변경 시만 저장)."""
        plate_clean = (plate or "").replace(" ", "")
        ds = str(dock_date or "")[:10]
        if not plate_clean or plate_clean in ("수배중", "-"):
            return
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", ds):
            return
        master = self._load_vehicle_master()
        matched = None
        for v in master:
            if self._is_plate_match(v.get("plateNumber", ""), plate_clean):
                matched = v
                break
        changed = False
        if matched is None:
            master.append(
                {
                    "plateNumber": plate_clean,
                    "driverName": driver or "",
                    "driverPhone": phone or "",
                    "ton": ton or "5T",
                    "dates": [ds],
                }
            )
            changed = True
        else:
            dates = set(str(x)[:10] for x in (matched.get("dates") or []) if x)
            if ds not in dates:
                dates.add(ds)
                matched["dates"] = sorted(dates)
                changed = True
            if driver and not (matched.get("driverName") or "").strip():
                matched["driverName"] = driver
                changed = True
            if phone and not (matched.get("driverPhone") or "").strip():
                matched["driverPhone"] = phone
                changed = True
        if not changed:
            return
        try:
            with open(self.vehicle_master_path, "w", encoding="utf-8") as f:
                json.dump(master, f, ensure_ascii=False, indent=2)
            self._vehicle_master_cache = master
            # views 모듈 캐시도 갱신
            try:
                from departure import views as dep_views
                dep_views.VEHICLES = master
            except Exception:
                pass
        except Exception:
            pass


# 싱글톤 인스턴스
vehicle_order_service = VehicleOrderService()