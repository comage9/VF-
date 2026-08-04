"""
VF 발주서 업로드.xlsx / 미입고 CSV 공통 컬럼 매핑.

Single source of truth for column aliases used by:
  - POST /api/inventory/inbound/upload
  - barcode_scanner.html (client mirrors these aliases — see docs/VF_ORDER_XLSX_MAPPING.md)

정책 (2026-07 확정):
  - 수량: 확정수량 우선
  - 입고예정일: U열 = 입고예정일
  - 로케이션: 파일에 없음 → BarcodeMaster / inventory unified
"""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence

# 기본 시트명
VF_XLSX_SHEET = "상품목록"

# field_key -> 헤더 후보 (우선순위 순)
VF_XLSX_COLUMNS: Dict[str, List[str]] = {
    "order_no": ["발주번호", "order no", "orderno"],
    "order_status": ["발주상태", "order status"],
    "barcode": ["상품바코드", "바코드", "barcode"],
    "product_name": ["상품이름", "상품명", "product name"],
    "ordered_qty": ["발주수량", "ordered qty"],
    "confirmed_qty": ["확정수량", "confirmed qty"],
    "expected_date": ["입고예정일", "expected date"],
    "product_no": ["상품번호", "sku id", "sku_id", "product no"],
}

# 미입고 CSV 추가/대체 별칭
UNRECEIVED_CSV_COLUMNS: Dict[str, List[str]] = {
    **VF_XLSX_COLUMNS,
    "order_status": ["발주현황", "발주상태", "order status"],
    "barcode": ["sku barcode", "상품바코드", "바코드", "barcode"],
    "product_name": ["sku 이름", "상품이름", "상품명", "product name"],
    "received_qty": ["입고수량", "received qty"],
}

# 헤더 없을 때 VF 열 순서 (0-based, A=0 … U=20)
VF_FIXED_INDICES = {
    "order_no": 0,
    "product_no": 4,
    "barcode": 5,
    "product_name": 6,
    "ordered_qty": 7,
    "confirmed_qty": 8,
    "expected_date": 20,  # U
}

REQUIRED_VF_FIELDS = ("order_no", "barcode", "confirmed_qty")


def normalize_cols(cols: Sequence) -> List[str]:
    out = []
    for c in cols:
        s = " ".join(str(c).strip().lower().split())
        out.append(s)
    return out


def find_col_index(cols: Sequence[str], candidates: Sequence[str]) -> Optional[int]:
    """Prefer exact match, then substring (avoids '로케이션 유형' vs '로케이션')."""
    for cand in candidates:
        cand_norm = " ".join(str(cand).strip().lower().split())
        if not cand_norm:
            continue
        for i, c in enumerate(cols):
            if cand_norm == (c or ""):
                return i
        for i, c in enumerate(cols):
            if cand_norm in (c or ""):
                return i
    return None


def resolve_column_indices(
    headers: Sequence,
    *,
    file_type: str = "vf_xlsx",
) -> Dict[str, Optional[int]]:
    """
    headers: raw column names from dataframe/sheet.
    file_type: 'vf_xlsx' | 'unreceived_csv'
    returns: { field_key: col_index or None }
    """
    cols = normalize_cols(headers)
    aliases = UNRECEIVED_CSV_COLUMNS if file_type == "unreceived_csv" else VF_XLSX_COLUMNS
    return {key: find_col_index(cols, cands) for key, cands in aliases.items()}


def missing_required(indices: Dict[str, Optional[int]]) -> List[str]:
    return [k for k in REQUIRED_VF_FIELDS if indices.get(k) is None]
