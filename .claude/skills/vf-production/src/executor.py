#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
vf-production executor
VF 보노하우스 생산 계획 관리 메인 실행 로직
"""

import json
import logging
import subprocess
import sys
from pathlib import Path
from typing import Optional, Dict, Any, List

# 공통 유틸 import
from _common.alert import send_alert
from _common.router import route_skill

logger = logging.getLogger(__name__)

# VF 프로젝트 경로
VF_PROJECT = Path("/home/comage/coding/VF-")
VF_API_BASE = "http://bonohouse.p-e.kr:5174/api"
VF_PRODUCTS_CSV = Path("/home/comage/gbrain-docker/cleaned_data/vf_products_final.csv")


class VFProductionExecutor:
    """VF 생산 계획 실행자"""

    def __init__(self):
        self.api_base = VF_API_BASE
        self.products_csv = VF_PRODUCTS_CSV
        self._products_cache = None

    # ─── 제품 데이터 로드 ────────────────────────────────────────

    def load_products(self) -> Dict[str, Dict]:
        """vf_products_final.csv 로드 (캐시)"""
        if self._products_cache is not None:
            return self._products_cache

        products = {}
        if self.products_csv.exists():
            import csv
            with open(self.products_csv, newline='', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    code = row.get('product_code', '').strip()
                    if code:
                        products[code] = {
                            'name': row.get('product_name', ''),
                            'unit': row.get('production_unit', ''),
                        }
        self._products_cache = products
        return products

    # ─── API 호출 ────────────────────────────────────────────────

    def api_get(self, path: str) -> Dict:
        """GET 요청"""
        import urllib.request
        req = urllib.request.Request(f"{self.api_base}/{path}")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())

    def api_post(self, path: str, data: Dict) -> Dict:
        """POST 요청"""
        import urllib.request
        req = urllib.request.Request(
            f"{self.api_base}/{path}",
            data=json.dumps(data).encode(),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())

    def api_put(self, path: str, data: Dict) -> Dict:
        """PUT 요청"""
        import urllib.request
        req = urllib.request.Request(
            f"{self.api_base}/{path}",
            data=json.dumps(data).encode(),
            headers={"Content-Type": "application/json"},
            method="PUT"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())

    def api_delete(self, path: str, data: Dict = None) -> Dict:
        """DELETE 요청"""
        import urllib.request
        req = urllib.request.Request(
            f"{self.api_base}/{path}",
            data=json.dumps(data).encode() if data else None,
            headers={"Content-Type": "application/json"} if data else {},
            method="DELETE"
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())

    # ─── 생산 계획 조회 ──────────────────────────────────────────

    def get_production(self, date: str = None, machine: str = None,
                       product: str = None) -> List[Dict]:
        """
        생산 계획 조회

        Args:
            date: 날짜 필터 (YYYY-MM-DD)
            machine: 기계번호 필터
            product: 제품명 필터

        Returns:
            필터된 ProductionLog 리스트
        """
        data = self.api_get("production")
        records = data.get("data", [])

        if date:
            records = [r for r in records if r.get("date") == date]
        if machine:
            records = [r for r in records if r.get("machineNumber") == machine]
        if product:
            records = [r for r in records if product in r.get("productName", "")]

        return records

    def list_dates(self) -> List[str]:
        """전체 날짜 목록"""
        data = self.api_get("production")
        return data.get("allDates", [])

    def get_summary(self, date: str = None) -> Dict[str, Any]:
        """생산 요약 정보"""
        records = self.get_production(date=date)
        total_quantity = sum(r.get("total", 0) for r in records)
        by_status = {}
        for r in records:
            status = r.get("status", "unknown")
            by_status[status] = by_status.get(status, 0) + 1

        return {
            "date": date,
            "total_records": len(records),
            "total_quantity": total_quantity,
            "by_status": by_status,
        }

    # ─── 생산 계획 추가/수정/삭제 ────────────────────────────────

    def add_production(self, record: Dict) -> Dict:
        """생산 계획 추가"""
        return self.api_post("production-log", record)

    def update_production(self, id: int, record: Dict) -> Dict:
        """생산 계획 수정"""
        return self.api_put(f"production-log/{id}", record)

    def delete_production(self, id: int) -> Dict:
        """생산 계획 삭제"""
        return self.api_delete(f"production-log/{id}")

    def copy_production(self, from_date: str, to_date: str) -> int:
        """날짜별 생산 계획 복사 (ProductionLog)"""
        records = self.get_production(date=from_date)
        created = 0
        for r in records:
            payload = {
                "date": to_date,
                "machineNumber": r["machineNumber"],
                "moldNumber": r.get("moldNumber"),
                "productName": r["productName"],
                "productNameEng": r.get("productNameEng", ""),
                "color1": r["color1"],
                "color2": r.get("color2", ""),
                "unit": r.get("unit", ""),
                "quantity": r["quantity"],
                "unitQuantity": r["unitQuantity"],
                "status": "pending",
            }
            self.api_post("production-log", payload)
            created += 1
        return created

    # ─── 제품别名 매핑 ──────────────────────────────────────────

    PRODUCT_ALIASES = {
        "토이": {"name": "토이 바디", "mold": 17, "machine": "3"},
        "로코스": {"name": "로코스 M/S", "mold": [40, 41, 42], "machine": ["9", "11", "12"]},
        "모던플러스": {"name": "모던플러스 서랍", "mold": 2, "machine": "4"},
        "이유": {"name": "이유", "mold": 135, "machine": ["8", "11"]},
        "해피": {"name": "해피 바디", "mold": 14, "machine": "13"},
        "어반": {"name": "어반 옷걸이", "mold": 111, "machine": "10"},
        "슬림": {"name": "슬림 서랍장 프레임", "mold": 801, "machine": "7"},
        "와이드": {"name": "와이드 서랍", "mold": 32, "machine": "9"},
        "에센셜": {"name": "에센셜 서랍", "mold": None, "machine": None},
        "북트롤리": {"name": "북트롤리", "mold": [127, 128], "machine": "9"},
        "탑백": {"name": "탑백 72L", "mold": 121, "machine": "3"},
        "초대형": {"name": "초대형 바디", "mold": 12, "machine": "13"},
        "맥스": {"name": "맥스 서랍장", "mold": 118, "machine": "13"},
        "바퀴": {"name": "바퀴", "mold": 56, "machine": "1"},
        "데크타일": {"name": "데크타일", "mold": 114, "machine": "10"},
        "핸들러": {"name": "핸들러 바스켓", "mold": None, "machine": None},
    }

    def resolve_alias(self, alias: str) -> Optional[Dict]:
        """제품 별명 → 정식 정보"""
        return self.PRODUCT_ALIASES.get(alias)


# ─── 메인 실행 함수 ──────────────────────────────────────────

def run(query: str, context: dict = None) -> Dict[str, Any]:
    """
    vf-production 스킬 실행

    Args:
        query: 사용자 입력
        context: 추가 컨텍스트

    Returns:
        {"success": bool, "message": str, "data": any}
    """
    executor = VFProductionExecutor()

    # 쿼리 분석
    query_lower = query.lower()

    try:
        # 생산 계획 조회
        if any(k in query_lower for k in ["조회", "보여줘", "뭐해", "어때"]):
            date_match = None
            import re
            date_pattern = r'(\d{4}-\d{2}-\d{2})'
            m = re.search(date_pattern, query)
            if m:
                date_match = m.group(1)

            machine_match = re.search(r'기계\s*(\d+)', query)

            if date_match:
                records = executor.get_production(date=date_match)
            elif machine_match:
                records = executor.get_production(machine=machine_match.group(1))
            else:
                records = executor.get_production()

            return {
                "success": True,
                "message": f"{len(records)}건 조회됨",
                "data": records,
            }

        # 날짜 복사
        if "복사" in query_lower or "copy" in query_lower:
            import re
            dates = re.findall(r'\d{4}-\d{2}-\d{2}', query)
            if len(dates) >= 2:
                count = executor.copy_production(dates[0], dates[1])
                return {
                    "success": True,
                    "message": f"{dates[0]} → {dates[1]}로 {count}건 복사 완료",
                }

        # 요약
        if "요약" in query_lower or "summary" in query_lower:
            summary = executor.get_summary()
            return {
                "success": True,
                "message": f"총 {summary['total_records']}건, {summary['total_quantity']:,}개",
                "data": summary,
            }

        # 기본: 전체 조회
        records = executor.get_production()
        return {
            "success": True,
            "message": f"{len(records)}건 조회됨",
            "data": records,
        }

    except Exception as e:
        logger.error(f"VF Production error: {e}")
        return {
            "success": False,
            "message": f"오류: {str(e)}",
        }


if __name__ == "__main__":
    # 테스트
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "오늘 생산 계획"
    result = run(query)
    print(json.dumps(result, ensure_ascii=False, indent=2))