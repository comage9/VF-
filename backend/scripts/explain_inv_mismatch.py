# -*- coding: utf-8 -*-
"""압축 파일(창고 실재고)을 기준으로 시스템 현재고 차이를 쉽게 설명."""
from __future__ import annotations

import os
import sys
from collections import defaultdict
from pathlib import Path

import django

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

import openpyxl
from django.db.models import Sum
from django.db.models.functions import Coalesce

from sales_api.inventory_stock import (
    aggregate_movements_after_baseline,
    compute_current_stock,
)
from sales_api.models import (
    InventoryBaselineItem,
    InventoryBaselineUpload,
    InventoryReceiptItem,
    OutboundRecord,
)


def load_zip_folder(folder: Path):
    raw = defaultdict(list)
    for fp in sorted(folder.glob("*.xlsx")):
        wb = openpyxl.load_workbook(fp, data_only=True)
        ws = wb.active
        for r in ws.iter_rows(min_row=2, values_only=True):
            if not r or r[6] is None:
                continue
            bc = str(r[6]).strip().replace(" ", "")
            if bc.endswith(".0"):
                bc = bc[:-2]
            if not bc.startswith("R"):
                continue
            inv = str(r[0]).replace(".0", "") if r[0] is not None else ""
            lpn = str(r[8]).replace(".0", "") if r[8] is not None else ""
            try:
                qty = int(float(r[9]))
            except Exception:
                continue
            raw[bc].append(
                {
                    "inv": inv,
                    "lpn": lpn,
                    "qty": qty,
                    "loc": r[2],
                    "grade": r[5],
                    "name": str(r[7] or ""),
                }
            )
    return raw


def sum_simple(rows):
    return sum(x["qty"] for x in rows)


def sum_by_lpn(rows):
    d = {}
    for x in rows:
        k = x["lpn"] or x["inv"]
        d[k] = x["qty"]
    return sum(d.values())


def main():
    folder = Path(r"C:\Users\kis\AppData\Local\Temp\vf_inv_compare_20260720")
    if not list(folder.glob("*.xlsx")):
        import zipfile

        z = Path(r"C:\Users\kis\Downloads\20260720095555_페이지별재고리스트.zip")
        folder.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(z) as zf:
            zf.extractall(folder)

    raw = load_zip_folder(folder)
    wh_simple = {bc: sum_simple(v) for bc, v in raw.items()}
    wh_lpn = {bc: sum_by_lpn(v) for bc, v in raw.items()}

    latest = InventoryBaselineUpload.objects.order_by(
        "-as_of_date", "-uploaded_at"
    ).first()
    as_of = latest.as_of_date
    base_map = {}
    for it in InventoryBaselineItem.objects.filter(upload=latest).values(
        "barcode", "product_name", "quantity_box"
    ):
        bc = (it["barcode"] or "").strip()
        if not bc:
            continue
        q = int(it["quantity_box"] or 0)
        if bc in base_map:
            base_map[bc]["base"] += q
        else:
            base_map[bc] = {"base": q, "name": it["product_name"] or ""}

    for row in (
        InventoryReceiptItem.objects.filter(receipt_date__gt=as_of)
        .values("barcode")
        .annotate(q=Coalesce(Sum("quantity_box"), 0))
    ):
        bc = (row["barcode"] or "").strip()
        if bc and bc not in base_map:
            base_map[bc] = {"base": 0, "name": ""}

    out_agg, rcv_agg = aggregate_movements_after_baseline(
        as_of=as_of,
        barcodes=list(base_map.keys()),
        outbound_model=OutboundRecord,
        receipt_model=InventoryReceiptItem,
    )
    sys = {}
    for bc, m in base_map.items():
        o = int(out_agg.get(bc, 0) or 0)
        r = int(rcv_agg.get(bc, 0) or 0)
        sys[bc] = {
            "cur": compute_current_stock(m["base"], r, o),
            "base": m["base"],
            "rcv": r,
            "out": o,
            "name": m["name"],
        }

    print("=" * 60)
    print("기준: 압축 파일(페이지별재고리스트) = 실제 현재고")
    print("비교: /inventory/enhanced 시스템 계산 현재고")
    print("=" * 60)
    print(f"시스템 스냅샷 기준일 as_of = {as_of}")
    print(f"시스템 공식 = baseline + 입고(>{as_of}) - 출고(>{as_of})")
    print()
    print(f"압축파일 바코드 수: {len(wh_simple)}")
    print(f"압축파일 총수량(행 전부 합): {sum(wh_simple.values())}")
    print(f"압축파일 총수량(LPN 중복 제거): {sum(wh_lpn.values())}")
    print(f"시스템 총수량: {sum(v['cur'] for v in sys.values())}")
    print()

    # --- Truth = zip as downloaded (row sum) ---
    print("【1】 압축 파일 그대로(행 합산) 기준 오류")
    mm = []
    for bc, wq in sorted(wh_simple.items()):
        sc = sys.get(bc, {}).get("cur")
        if sc is None:
            if wq != 0:
                mm.append({"bc": bc, "wh": wq, "sys": None, "diff": -wq})
            continue
        if int(sc) != int(wq):
            mm.append({"bc": bc, "wh": wq, "sys": sc, "diff": sc - wq})
    print(f"  오류 품목 수: {len(mm)}")
    abs_sum = sum(abs(x["diff"]) for x in mm)
    net_sum = sum(x["diff"] for x in mm)
    print(f"  차이 수량(절대값 합): {abs_sum}")
    print(f"  차이 수량(순합, 시스템-창고): {net_sum}")
    print()
    print("  품목별:")
    for x in sorted(mm, key=lambda z: abs(z["diff"]), reverse=True):
        s = sys.get(x["bc"], {})
        name = (raw[x["bc"]][0]["name"] if raw[x["bc"]] else s.get("name", ""))[:36]
        if x["sys"] is None:
            print(f"  - {x['bc']} | 창고={x['wh']} | 시스템=없음 | {name}")
        else:
            print(
                f"  - {x['bc']} | 창고={x['wh']} | 시스템={x['sys']} | "
                f"차이={x['diff']:+d} | "
                f"(기준{s.get('base')}+입고{s.get('rcv')}-출고{s.get('out')}) | {name}"
            )

    print()
    print("【2】 압축 파일 안 중복 행 점검 (같은 바코드+같은 LPN이 2번 이상)")
    dup_cases = []
    for bc, rows in raw.items():
        by = defaultdict(list)
        for x in rows:
            by[x["lpn"]].append(x["qty"])
        dups = {k: v for k, v in by.items() if len(v) > 1}
        if dups:
            dup_cases.append((bc, dups, wh_simple[bc], wh_lpn[bc]))
            print(
                f"  - {bc}: 단순합={wh_simple[bc]}, LPN1회만합={wh_lpn[bc]}, "
                f"중복LPN={ {k: v for k, v in dups.items()} }"
            )
            if bc in sys:
                print(
                    f"    → 시스템={sys[bc]['cur']}  /  "
                    f"LPN중복제거 창고와 비교 차이={sys[bc]['cur'] - wh_lpn[bc]:+d}"
                )
    if not dup_cases:
        print("  (없음)")

    print()
    print("【3】 LPN 중복 제거 후(실물 LPN 1회) 재비교")
    mm2 = []
    for bc, wq in wh_lpn.items():
        sc = sys.get(bc, {}).get("cur")
        if sc is None:
            continue
        if int(sc) != int(wq):
            mm2.append((bc, wq, sc, sc - wq))
    print(f"  오류 품목 수: {len(mm2)}")
    print(f"  차이 수량(절대값 합): {sum(abs(x[3]) for x in mm2)}")
    for bc, wq, sc, d in sorted(mm2, key=lambda z: abs(z[3]), reverse=True):
        s = sys[bc]
        print(
            f"  - {bc} | 창고(LPN유일)={wq} | 시스템={sc} | 차이={d:+d} | "
            f"base={s['base']} rcv={s['rcv']} out={s['out']}"
        )

    print()
    print("【4】 쉬운 원인 설명")
    print(
        """
  ① 시스템 기준일이 7/14 입니다.
     압축 파일은 7/20 실재고입니다.
     → 그 사이 입·출고가 DB에 없으면 차이가 납니다.

  ② 압축 파일은 '페이지별' 리스트라 같은 LPN이 여러 번 나올 수 있습니다.
     → 바코드만 더하면 수량이 2배로 잡힙니다. (실제 재고는 LPN 1번만)

  ③ 시스템 계산식:
       현재고 = 7/14 스냅샷 + (7/15~오늘 입고) - (7/15~오늘 출고)
     창고 파일과 맞추려면 오늘 스냅샷을 다시 올리거나,
     7/14 이후 입출고가 전부 시스템에 들어와 있어야 합니다.
"""
    )


if __name__ == "__main__":
    main()
