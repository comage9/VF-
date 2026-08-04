# -*- coding: utf-8 -*-
"""
WMS 실물 목록 ↔ 장부 현재고 대조 후 조정 전표 생성.

목표: baseline 스냅샷을 매번 덮어쓰지 않고,
      차이(qty_delta)만 InventoryStockAdjustment 로 남겨 원장을 연속 유지.
"""
from __future__ import annotations

import io
import zipfile
from collections import defaultdict
from datetime import date
from typing import Any, Dict, Iterable, List, Mapping, Optional, Tuple

import pandas as pd


def _normalize_cols(cols) -> List[str]:
    return [str(c).strip().lower().replace(" ", "") for c in cols]


def _find_col_index(cols: List[str], candidates: List[str]) -> Optional[int]:
    """정확 일치 우선, 그다음 부분 일치. '로케이션유형'이 '로케이션'에 먹히지 않게 처리."""
    cand = [c.strip().lower().replace(" ", "") for c in candidates]
    for i, c in enumerate(cols):
        if c in cand:
            return i
    # partial — 후보가 컬럼의 진부분 문자열일 때, 더 긴 오매칭 컬럼 제외
    # 예: 후보 "로케이션" 이 "로케이션유형"에 매칭되면 스킵하고 다음 컬럼 탐색
    for k in cand:
        if not k:
            continue
        for i, c in enumerate(cols):
            if k == c:
                return i
            if k in c:
                # 유형/type 이 붙은 컬럼은 로케이션 본체로 보지 않음
                if k in ("로케이션", "location") and (
                    "유형" in c or "type" in c or "구분" in c
                ):
                    continue
                return i
    return None


def _parse_int(v) -> int:
    try:
        if v is None or v == "":
            return 0
        s = str(v).strip().replace(",", "")
        if not s or s.lower() in ("nan", "none"):
            return 0
        return int(float(s))
    except (TypeError, ValueError):
        return 0


def _iter_dataframes_from_upload(file_obj) -> List[pd.DataFrame]:
    """단일 xlsx 또는 zip(내부 xlsx 다수) → DataFrame 목록."""
    name = (getattr(file_obj, "name", "") or "").lower()
    raw = file_obj.read()
    if hasattr(file_obj, "seek"):
        try:
            file_obj.seek(0)
        except Exception:
            pass

    frames: List[pd.DataFrame] = []
    if name.endswith(".zip") or (len(raw) >= 2 and raw[:2] == b"PK" and "xl/" not in name):
        # zip of page files (or xlsx which is also PK — try zip members with xlsx first)
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw))
            members = [
                n
                for n in zf.namelist()
                if n.lower().endswith((".xlsx", ".xls", ".csv"))
                and not n.startswith("__MACOSX")
            ]
            if members:
                for n in sorted(members):
                    with zf.open(n) as fh:
                        data = fh.read()
                    if n.lower().endswith(".csv"):
                        frames.append(pd.read_csv(io.BytesIO(data), dtype=str))
                    else:
                        frames.append(pd.read_excel(io.BytesIO(data), dtype=str))
                return frames
        except zipfile.BadZipFile:
            pass

    # plain xlsx/xls/csv
    if name.endswith(".csv"):
        frames.append(pd.read_csv(io.BytesIO(raw), dtype=str))
    else:
        frames.append(pd.read_excel(io.BytesIO(raw), dtype=str))
    return frames


def parse_wms_stock_quantity(
    files: Iterable[Any],
    *,
    dedupe_lpn: bool = False,
) -> Tuple[Dict[str, int], Dict[str, str], Dict[str, Any], Dict[str, List[str]]]:
    """
    WMS 페이지별재고리스트 등에서 바코드별 수량 합산 + 로케이션 목록.

    규칙 (SoT = 압축/페이지별 파일):
      - 기본 dedupe_lpn=False: 여러 행은 정상 표기 → 전부 합산
      - dedupe_lpn=True: (barcode, LPN) 재등장 행만 1회 합산 (옵션)

    Returns:
      qty_by_barcode, name_by_barcode, stats, locations_by_barcode (sorted unique)
    """
    qty_by_bc: Dict[str, int] = defaultdict(int)
    name_by_bc: Dict[str, str] = {}
    loc_by_bc: Dict[str, set] = defaultdict(set)
    seen_lpn: set = set()
    stats = {
        "files": 0,
        "rows": 0,
        "rows_used": 0,
        "rows_lpn_skipped": 0,
        "barcodes": 0,
        "locationConflicts": 0,
    }

    for f in files:
        stats["files"] += 1
        try:
            frames = _iter_dataframes_from_upload(f)
        except Exception as e:
            stats.setdefault("errors", []).append(
                f"{getattr(f, 'name', '?')}: {e}"
            )
            continue

        for df in frames:
            df = df.fillna("")
            cols = _normalize_cols(df.columns)
            bc_idx = _find_col_index(
                cols, ["상품바코드", "상품 바코드", "바코드", "barcode"]
            )
            qty_idx = _find_col_index(cols, ["수량", "quantity", "qty", "재고수량"])
            name_idx = _find_col_index(cols, ["상품명", "품목", "product", "productname"])
            lpn_idx = _find_col_index(cols, ["lpn", "lpn번호", "lpn no", "lpnno"])
            # 정확 '로케이션' 우선 (로케이션유형 제외)
            loc_idx = _find_col_index(cols, ["로케이션", "location", "적재위치", "셀"])
            if bc_idx is None or qty_idx is None:
                continue

            for _, row in df.iterrows():
                stats["rows"] += 1
                bc = str(row.iloc[bc_idx]).strip()
                if not bc or bc.lower() in ("nan", "none"):
                    continue
                qty = _parse_int(row.iloc[qty_idx])
                if qty <= 0:
                    continue

                if dedupe_lpn and lpn_idx is not None:
                    lpn = str(row.iloc[lpn_idx]).strip()
                    if lpn:
                        soft = (bc, lpn)
                        if soft in seen_lpn:
                            stats["rows_lpn_skipped"] += 1
                            continue
                        seen_lpn.add(soft)

                qty_by_bc[bc] += qty
                stats["rows_used"] += 1
                if name_idx is not None and bc not in name_by_bc:
                    nm = str(row.iloc[name_idx]).strip()
                    if nm and nm.lower() not in ("nan", "none"):
                        name_by_bc[bc] = nm[:255]
                if loc_idx is not None:
                    loc = str(row.iloc[loc_idx]).strip()
                    if loc and loc.lower() not in ("nan", "none", ""):
                        loc_by_bc[bc].add(loc[:120])

    locations_out: Dict[str, List[str]] = {
        bc: sorted(locs) for bc, locs in loc_by_bc.items() if locs
    }
    stats["barcodes"] = len(qty_by_bc)
    stats["locationConflicts"] = sum(
        1 for locs in locations_out.values() if len(locs) > 1
    )
    return dict(qty_by_bc), name_by_bc, stats, locations_out


def build_reconcile_deltas(
    *,
    ledger_qty: Mapping[str, int],
    wms_qty: Mapping[str, int],
    name_by_barcode: Optional[Mapping[str, str]] = None,
    min_abs_delta: int = 1,
) -> List[Dict[str, Any]]:
    """
    wms - ledger 차이 목록.
    양수: 장부가 부족(실물이 더 많음) → 조정 +
    음수: 장부가 과다 → 조정 -
    """
    names = name_by_barcode or {}
    all_bc = set(ledger_qty) | set(wms_qty)
    rows: List[Dict[str, Any]] = []
    for bc in sorted(all_bc):
        if not bc:
            continue
        led = int(ledger_qty.get(bc, 0) or 0)
        wms = int(wms_qty.get(bc, 0) or 0)
        # 음수 장부는 0 기준으로 비교(화면 clamp 와 동일 정책)
        led_cmp = max(0, led)
        delta = wms - led_cmp
        if abs(delta) < min_abs_delta:
            continue
        rows.append(
            {
                "barcode": bc,
                "product_name": (names.get(bc) or "")[:255],
                "ledger_qty": led_cmp,
                "wms_qty": wms,
                "qty_delta": delta,
            }
        )
    return rows


def receipt_calendar_gaps(
    as_of: date,
    today: date,
    receipt_dates: Iterable[date],
    outbound_dates: Iterable[date],
) -> Dict[str, Any]:
    """
    기준일 이후 ~ 오늘 사이, 출고는 있는데 입고 업로드가 없는 날짜 탐지.
    (입고가 없는 날이 정상일 수도 있으나 드리프트 경고 신호로 사용)
    """
    rcv_set = {d for d in receipt_dates if d}
    out_set = {d for d in outbound_dates if d}
    # 출고: as_of 당일 포함 (당일 출고는 스냅샷 밖, 다음날 입력)
    gaps = sorted(
        d for d in out_set if d >= as_of and d <= today and d not in rcv_set
    )
    return {
        "outbound_days_without_receipt_upload": [d.isoformat() for d in gaps],
        "receipt_days": sorted(d.isoformat() for d in rcv_set if d > as_of),
        "outbound_days": sorted(d.isoformat() for d in out_set if d >= as_of),
    }


# --- 전산 vs WMS 차이 원인 분류 (바코드 단위, 상품명 합산 없음) ---

CAUSE_NO_MOVEMENT_WMS_LOWER = "NO_MOVEMENT_WMS_LOWER"
CAUSE_NO_MOVEMENT_WMS_HIGHER = "NO_MOVEMENT_WMS_HIGHER"
CAUSE_AFTER_RECEIPT_GAP = "AFTER_RECEIPT_GAP"
CAUSE_AFTER_OUTBOUND_GAP = "AFTER_OUTBOUND_GAP"
CAUSE_LEDGER_ONLY = "LEDGER_ONLY"
CAUSE_WMS_ONLY = "WMS_ONLY"
CAUSE_MATCH = "MATCH"
CAUSE_OTHER = "OTHER"

CAUSE_LABELS: Dict[str, str] = {
    CAUSE_NO_MOVEMENT_WMS_LOWER: "입출고 기록 없이 창고만 감소",
    CAUSE_NO_MOVEMENT_WMS_HIGHER: "입출고 기록 없이 창고만 증가",
    CAUSE_AFTER_RECEIPT_GAP: "입고 반영 후 잔차",
    CAUSE_AFTER_OUTBOUND_GAP: "출고 반영 후 잔차",
    CAUSE_LEDGER_ONLY: "전산에만 있음",
    CAUSE_WMS_ONLY: "WMS에만 있음",
    CAUSE_MATCH: "일치",
    CAUSE_OTHER: "기타 잔차",
}

CAUSE_HINTS: Dict[str, str] = {
    CAUSE_NO_MOVEMENT_WMS_LOWER: (
        "기준일 이후 이 바코드의 시트 출고·입고 업로드가 없습니다. "
        "전산은 기본 재고 그대로인데 창고 수량이 더 적습니다. "
        "(폐기·실사·시트 미반영 이동 등 확인)"
    ),
    CAUSE_NO_MOVEMENT_WMS_HIGHER: (
        "기준일 이후 입출고 기록이 없는데 창고 수량이 전산보다 많습니다. "
        "입고 미업로드 또는 WMS 집계를 확인하세요."
    ),
    CAUSE_AFTER_RECEIPT_GAP: (
        "입고는 전산에 반영됐지만 최종 수량이 창고와 다릅니다. "
        "입고 수량·입고 후 비매출 감소·시점 차이를 확인하세요."
    ),
    CAUSE_AFTER_OUTBOUND_GAP: (
        "출고 반영 후에도 전산과 창고가 다릅니다. "
        "시트 출고 누락·추가 감소·시점 차이를 확인하세요."
    ),
    CAUSE_LEDGER_ONLY: (
        "전산에는 재고가 있으나 이번 WMS 파일에 수량이 없습니다."
    ),
    CAUSE_WMS_ONLY: (
        "WMS에는 수량이 있으나 전산 현재고가 0입니다. "
        "신규 바코드 입고 미반영 또는 baseline 미포함 가능."
    ),
    CAUSE_MATCH: "전산 현재고와 창고 수량이 일치합니다.",
    CAUSE_OTHER: "전산과 창고 수량 차이가 있습니다. 구성 분해를 확인하세요.",
}


def classify_variance_cause(
    *,
    base_qty: int,
    receipt_qty: int,
    outbound_qty: int,
    ledger_qty: int,
    wms_qty: int,
) -> str:
    """바코드 1건 원인 코드. 상품명 그룹 합산 없음."""
    base = int(base_qty or 0)
    rcv = int(receipt_qty or 0)
    out = int(outbound_qty or 0)
    led = max(0, int(ledger_qty or 0))
    wms = max(0, int(wms_qty or 0))
    delta = wms - led

    if delta == 0:
        return CAUSE_MATCH
    if led > 0 and wms == 0:
        return CAUSE_LEDGER_ONLY
    if led == 0 and wms > 0:
        return CAUSE_WMS_ONLY
    if out == 0 and rcv == 0:
        if wms < led:
            return CAUSE_NO_MOVEMENT_WMS_LOWER
        return CAUSE_NO_MOVEMENT_WMS_HIGHER
    if rcv > 0 and out == 0:
        return CAUSE_AFTER_RECEIPT_GAP
    if out > 0:
        return CAUSE_AFTER_OUTBOUND_GAP
    return CAUSE_OTHER


def build_variance_items(
    *,
    base_by_barcode: Mapping[str, int],
    receipt_by_barcode: Mapping[str, int],
    outbound_by_barcode: Mapping[str, int],
    ledger_by_barcode: Mapping[str, int],
    wms_by_barcode: Mapping[str, int],
    name_by_barcode: Optional[Mapping[str, str]] = None,
    master_location_by_barcode: Optional[Mapping[str, str]] = None,
    wms_locations_by_barcode: Optional[Mapping[str, List[str]]] = None,
    include_matches: bool = False,
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """
    전산 vs WMS 전 바코드 행 + 요약.
    로케이션: 마스터(SoT) vs WMS 전체 목록(복수면 전부).
    Returns: (items, summary_counts)
    """
    names = name_by_barcode or {}
    master_loc = master_location_by_barcode or {}
    wms_locs_map = wms_locations_by_barcode or {}
    all_bc = set(base_by_barcode) | set(wms_by_barcode) | set(ledger_by_barcode)
    items: List[Dict[str, Any]] = []
    match_count = 0
    mismatch_count = 0
    abs_delta = 0
    net_delta = 0
    loc_conflict_count = 0

    for bc in sorted(all_bc):
        if not bc:
            continue
        base = int(base_by_barcode.get(bc, 0) or 0)
        rcv = int(receipt_by_barcode.get(bc, 0) or 0)
        out = int(outbound_by_barcode.get(bc, 0) or 0)
        led = max(0, int(ledger_by_barcode.get(bc, 0) or 0))
        wms = max(0, int(wms_by_barcode.get(bc, 0) or 0))
        # 둘 다 0이고 baseline에도 없으면 스킵
        if led == 0 and wms == 0 and base == 0 and rcv == 0 and out == 0:
            continue
        delta = wms - led
        cause = classify_variance_cause(
            base_qty=base,
            receipt_qty=rcv,
            outbound_qty=out,
            ledger_qty=led,
            wms_qty=wms,
        )
        mloc = (master_loc.get(bc) or "").strip()
        wlocs = list(wms_locs_map.get(bc) or [])
        if not isinstance(wlocs, list):
            wlocs = [str(wlocs)]
        wlocs = [str(x).strip() for x in wlocs if str(x).strip()]
        # 로케이션 불일치: 마스터 기준 — WMS 목록에 마스터가 없거나 WMS에 마스터 외 로케이션이 있음
        if mloc and wlocs:
            location_conflict = mloc not in wlocs or any(x != mloc for x in wlocs)
        elif mloc and not wlocs and wms > 0:
            location_conflict = True  # WMS 수량 있는데 로케이션 파싱 없음
        elif not mloc and len(wlocs) > 1:
            location_conflict = True  # 마스터 없고 WMS 복수 로케이션
        else:
            location_conflict = False
        if location_conflict:
            loc_conflict_count += 1

        if cause == CAUSE_MATCH:
            match_count += 1
            if not include_matches and not location_conflict:
                continue
        else:
            mismatch_count += 1
            abs_delta += abs(delta)
            net_delta += delta

        items.append(
            {
                "barcode": bc,
                "productName": (names.get(bc) or "")[:255],
                "baseQty": base,
                "receiptQty": rcv,
                "outboundQty": out,
                "ledgerQty": led,
                "wmsQty": wms,
                "delta": delta,
                "causeCode": cause,
                "causeLabel": CAUSE_LABELS.get(cause, cause),
                "causeHint": CAUSE_HINTS.get(cause, ""),
                "masterLocation": mloc,
                "wmsLocations": wlocs,
                "locationConflict": location_conflict,
            }
        )

    # 불일치 우선: 로케이션 충돌 → |delta| 큰 순
    items.sort(
        key=lambda r: (
            0 if r.get("locationConflict") else 1,
            0 if r["causeCode"] != CAUSE_MATCH else 1,
            -abs(r["delta"]),
            r["barcode"],
        )
    )

    summary = {
        "compared": match_count + mismatch_count,
        "matchCount": match_count,
        "mismatchCount": mismatch_count,
        "absDeltaSum": abs_delta,
        "netDeltaSum": net_delta,
        "locationConflictCount": loc_conflict_count,
    }
    return items, summary
