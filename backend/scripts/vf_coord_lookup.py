#!/usr/bin/env python3
"""VF 제품배치도 좌표 조회 — 숫자 좌표 체계 (2026-08-28 확정)

좌표 형식: "동 가로-세로" (예: C동 1-7 = 가로 1열, 세로 7행)
— 브라우저 화면의 열 번호(상단)/행 번호(좌측) 라벨과 정확히 일치.
브라우저의 computeGridCoords와 동일한 클러스터링(TOL=8)으로 서버 스냅샷에서
각 동의 좌표를 재계산하여 조회. 좌표/제품번호/로케이션/제품명 상호 변환.
⚠ 내부 존 아이디(예: C-R9-C1) ≠ 좌표 — 절대 좌표로 사용하지 말 것.

사용:
  python vf_coord_lookup.py coord C 1-7      # 좌표(가로-세로) → 존·제품·로케이션
  python vf_coord_lookup.py product 322      # 제품번호 → 좌표·존
  python vf_coord_lookup.py loc 45           # 로케이션 → 좌표·존·제품
  python vf_coord_lookup.py dump             # 전체 좌표표 (JSON, 키=가로-세로)
"""
import json
import sys
import urllib.request

API = "http://localhost:5176/api/product-display/latest"
TOL = 8  # 브라우저 computeGridCoords와 동일


def fetch_snapshot():
    with urllib.request.urlopen(API, timeout=10) as r:
        d = json.load(r)
    return d["version"], json.loads(d["payload"])


def center(z):
    st = z.get("style", {})
    return (
        float(st.get("left", 0)) + float(st.get("width", 48)) / 2,
        float(st.get("top", 0)) + float(st.get("height", 34)) / 2,
    )


def cluster(vals):
    reps = []
    for v in sorted(set(vals)):
        if not reps or v - reps[-1] > TOL:
            reps.append(v)
        else:
            reps[-1] = (reps[-1] + v) / 2
    return reps


def nearest(v, reps):
    return min(range(len(reps)), key=lambda i: abs(v - reps[i]))


def build_index(layout, master):
    """동별 {coord: {zone, row, col, products, locs}} 구성"""
    index = {}
    for dong_layout in layout:
        key = dong_layout.get("key")
        if key not in ("A", "B", "C", "D"):
            continue
        zones = dong_layout.get("zones", [])
        if not zones:
            continue
        cx_list = [center(z)[0] for z in zones]
        cy_list = [center(z)[1] for z in zones]
        col_reps = cluster(cx_list)
        row_reps = cluster(cy_list)

        def row_label(ri):
            if key != "A":
                return str(ri + 1)
            # A동: 해당 행의 L1~L6 슬롯 번호 사용 (아래=1), 하단 1줄=20
            in_row = [z for z in zones if nearest(center(z)[1], row_reps) == ri]
            for z in in_row:
                zid = z.get("id", "")
                parts = zid.split("-")
                if len(parts) == 3 and parts[1].startswith("L") and parts[1][1:].isdigit():
                    n = int(parts[1][1:])
                    if 1 <= n <= 6:
                        return parts[2]
            if any(z.get("id", "").startswith("A-L7") for z in in_row):
                return "20"
            return str(len(row_reps) - ri)

        entries = {}
        for z in zones:
            zid = z.get("id", "")
            cx, cy = center(z)
            ci = nearest(cx, col_reps)
            ri = nearest(cy, row_reps)
            # 좌표 = "가로-세로" (화면 라벨 기준 확정, 2026-08-28)
            coord = f"{ci + 1}-{row_label(ri)}"
            entries[coord] = {
                "zone": zid,
                "row": row_label(ri),
                "col": ci + 1,
            }
        index[key] = entries
    return index


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    cmd = sys.argv[1]
    version, payload = fetch_snapshot()
    data = payload.get("data", {})
    layout = payload.get("layout", [])
    index = build_index(layout, None)

    # 존 → 배치 제품
    def products_of(zid):
        v = data.get(zid, "")
        return [x.strip() for x in v.split(",") if x.strip()] if v else []

    # 로케이션: A동은 존에 내장 계산 불가 — 브라우저 공식을 간략 재현하지 않고
    # A동 존 아이디에서 지그재그 공식으로 계산 (calcZigzagLocNo 동일 구현)
    def zigzag(line, slot):
        if not (1 <= line <= 6 and slot >= 1):
            return None
        pair = (line - 1) // 2
        odd = line % 2 == 1
        if pair == 0 and slot > 19:
            k = slot - 19
            base = 114 + 2 * (k - 1)
            odd_first = k % 2 == 1
            return base + 1 if ((odd and odd_first) or (not odd and not odd_first)) else base + 2
        offset = 19 - slot if pair == 0 else slot - 1
        odd_first = offset % 2 == 0
        base = pair * 38 + offset * 2
        return base + 1 if ((odd and odd_first) or (not odd and not odd_first)) else base + 2

    def locs_of(zid):
        parts = zid.split("-")
        if zid.startswith("A-L") and len(parts) == 3 and parts[1][1:].isdigit():
            n = int(parts[1][1:])
            if 1 <= n <= 6:
                loc = zigzag(n, int(parts[2]))
                return [loc] if loc else []
        if zid.startswith("A-L7") and len(parts) == 2 and parts[1].isdigit():
            return [114 + int(parts[1])]
        # B/C/D 로케이션: 서버 마스터/별도 계산 대상 아님 — 스냅샷에 미포함
        return []

    if cmd == "dump":
        out = {"version": version, "dongs": {}}
        for k, entries in index.items():
            out["dongs"][k] = {
                coord: {**e, "products": products_of(e["zone"]), "locs": locs_of(e["zone"])}
                for coord, e in entries.items()
            }
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return 0

    if cmd == "coord" and len(sys.argv) >= 4:
        dong, coord = sys.argv[2].upper(), sys.argv[3]
        e = index.get(dong, {}).get(coord)
        if not e:
            print(f"{dong}동 {coord}: 칸 없음")
            return 1
        prods = products_of(e["zone"])
        locs = locs_of(e["zone"])
        print(f"{dong}동 {coord} | 존: {e['zone']}")
        print(f"  제품: {', '.join(prods) if prods else '(빈 칸)'}")
        if locs:
            print(f"  로케이션: {locs[0]}→{locs[-1]}" if len(locs) > 1 else f"  로케이션: {locs[0]}")
        return 0

    if cmd == "product" and len(sys.argv) >= 3:
        target = sys.argv[2]
        found = False
        for k, entries in index.items():
            for coord, e in entries.items():
                if target in products_of(e["zone"]):
                    print(f"{target} → {k}동 {coord} (존: {e['zone']})")
                    found = True
        if not found:
            print(f"{target}: 미배치")
        return 0 if found else 1

    if cmd == "loc" and len(sys.argv) >= 3:
        target = int(sys.argv[2])
        found = False
        for k, entries in index.items():
            for coord, e in entries.items():
                if target in locs_of(e["zone"]):
                    prods = products_of(e["zone"])
                    print(f"로케이션 {target} → {k}동 {coord} (존: {e['zone']}, 제품: {', '.join(prods) or '없음'})")
                    found = True
        if not found:
            print(f"로케이션 {target}: 미배정 (또는 B/C/D동 — 로케이션은 A동 지그재그 체계)")
        return 0 if found else 1

    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())
