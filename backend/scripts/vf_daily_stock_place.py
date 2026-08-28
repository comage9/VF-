# -*- coding: utf-8 -*-
"""VF 배치도 매일 재고 체크 — 재고 생긴 미배치 품목 → C동 지정 칸 배치
(사용자 규칙 2026-08-28)

규칙:
1. 재고 없는 미배치 품목 → 3개월 미출고 처리(플래그) 대상. 단, 최근 3개월 내
   출고 있으면 플래그 금지 (스킬 확정 기준).
2. 재고 생기면 → C동 좌표 1-1~1-3, 2-1~2-4의 빈칸에 한 칸 3품목씩 배치.
   출고량(최근 30일) 내림차순. 기존 점유 칸 미접촉, 전역 중복 방지.
3. 좌표→존 변환은 vf_coord_lookup.py와 동일 클러스터링(TOL=8) 재계산 —
   하드코딩 매핑 금지.

출력: 배치 내역/잔류 요약 (cron 알림용). 변경 없으면 "변경 없음".
"""
import json
import sys
import urllib.request
from datetime import datetime, timedelta

BASE = 'http://localhost:5176'
PD = BASE + '/api/product-display'
TOL = 8
C_TARGET_COORDS = ['1-1', '1-2', '1-3', '2-1', '2-2', '2-3', '2-4']
MAX_PER_CELL = 3


def get_json(url, timeout=90):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.load(r)


def center(z):
    st = z.get('style', {})
    return (float(st.get('left', 0)) + float(st.get('width', 48)) / 2,
            float(st.get('top', 0)) + float(st.get('height', 34)) / 2)


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


def c_coord_map(layout):
    """C동 {좌표: 존ID} — vf_coord_lookup.py 동일 알고리즘"""
    dl = next(d for d in layout if d.get('key') == 'C')
    zones = dl['zones']
    cx = cluster([center(z)[0] for z in zones])
    cy = cluster([center(z)[1] for z in zones])
    m = {}
    for z in zones:
        x, y = center(z)
        coord = f"{nearest(x, cx) + 1}-{nearest(y, cy) + 1}"
        m[coord] = z['id']
    return m


def outbound_qty_map():
    """바코드→(최근30일 출고박스, 최근90일 출고여부)"""
    rows = get_json(BASE + '/api/outbound')
    now = datetime.now()
    cutoff30 = now - timedelta(days=30)
    cutoff90 = now - timedelta(days=90)
    q = {}
    out90 = set()
    for r in rows:
        try:
            dt = datetime.strptime(str(r.get('outbound_date', ''))[:10], '%Y-%m-%d')
        except Exception:
            continue
        b = r.get('barcode') or ''
        if cutoff90 <= dt <= now:
            out90.add(b)
        if cutoff30 <= dt <= now:
            q[b] = q.get(b, 0) + (r.get('quantity') or 0)
    return q, out90


def main():
    master = get_json(BASE + '/api/master/specs')
    snap = get_json(PD + '/latest')
    payload = json.loads(snap['payload'])
    data = payload['data']
    ver = snap.get('version')

    placed = set()
    for z, v in data.items():
        for t in str(v).split(','):
            t = t.strip()
            if t:
                placed.add(t)

    oq, no3m_out = outbound_qty_map()
    mb = {}
    for m in master:
        pn = str(m.get('product_number') or '').strip()
        if pn and m.get('is_vf_item'):
            mb[pn] = m  # 중복 번호는 마지막 유지(기존 스크립트와 동일)

    # 배치 후보 ① 미배치 + 재고>0 + 플래그 없음
    #          ② 3개월미출고 플래그 품목 중 재고 생긴 것 → 플래그 해제 후 배치 대상
    pool = []
    unflag_ids = []
    flag_ids = []
    for pn, m in mb.items():
        if pn in placed or m.get('is_discontinued'):
            continue
        try:
            st = float(m.get('current_stock') or 0)
        except Exception:
            st = 0
        bc = str(m.get('barcode') or '')
        if st <= 0:
            # 재고 0 + 최근 3개월 출고 없음 + 미플래그 → 3개월 미출고 이동
            if bc not in no3m_out and not m.get('is_no_outbound_3m'):
                flag_ids.append(m.get('id'))
            continue
        if m.get('is_no_outbound_3m'):
            unflag_ids.append(m.get('id'))
            pool.append(pn)
        else:
            pool.append(pn)

    # 재고 생긴 미출고 플래그 해제 (스킬 확정: 재고>0이면 배치 대상 유지)
    if unflag_ids:
        body = json.dumps({'ids': unflag_ids, 'is_no_outbound_3m': False}).encode()
        req = urllib.request.Request(BASE + '/api/master/specs/bulk-update', data=body,
                                     headers={'Content-Type': 'application/json'}, method='PATCH')
        try:
            res = get_json_from_req(req)
            print(f'3개월미출고 플래그 해제(재고 생김): {len(unflag_ids)}건 → {res}')
        except Exception as e:
            print(f'플래그 해제 실패: {e}')

    # 재고 0 + 3개월 출고 없음 → 3개월 미출고로 이동
    if flag_ids:
        body = json.dumps({'ids': flag_ids, 'is_no_outbound_3m': True}).encode()
        req = urllib.request.Request(BASE + '/api/master/specs/bulk-update', data=body,
                                     headers={'Content-Type': 'application/json'}, method='PATCH')
        try:
            res = get_json_from_req(req)
            print(f'3개월미출고 이동(재고 0): {len(flag_ids)}건 → {res}')
        except Exception as e:
            print(f'플래그 설정 실패: {e}')

    pool.sort(key=lambda x: -oq.get(str(mb[x].get('barcode') or ''), 0))

    cmap = c_coord_map(payload['layout'])
    plan = {}
    leftovers = []
    # 지정 좌표 순서대로, 한 칸 3품목 — 점유 칸·3품목 찬 칸은 건너뛰기
    ci = 0
    pool_idx = 0
    while ci < len(C_TARGET_COORDS) and pool_idx < len(pool):
        coord = C_TARGET_COORDS[ci]
        zid = cmap.get(coord)
        if not zid:
            ci += 1
            continue
        cur = [t.strip() for t in str(data.get(zid) or '').split(',') if t.strip()]
        room = MAX_PER_CELL - len(cur)
        if room <= 0:
            ci += 1
            continue
        fill = []
        while room > 0 and pool_idx < len(pool):
            pn = pool[pool_idx]
            pool_idx += 1
            dup = any(pn in [t.strip() for t in str(v).split(',')] for v in data.values())
            if dup:
                continue
            fill.append(pn)
            room -= 1
        if fill:
            data[zid] = ','.join(cur + fill)
            plan[coord] = (zid, fill)
        ci += 1
    leftovers = pool[pool_idx:]

    if not plan:
        print(f'변경 없음 — 미배치 재고 후보 {len(pool)}종, C동 지정 칸 여유 없음 또는 후보 없음 (버전 {ver})')
        return

    payload['data'] = data
    body = json.dumps({'payload': json.dumps(payload, ensure_ascii=False),
                       'saved_by': 'daily-stock-check', 'base_version': ver}).encode()
    req = urllib.request.Request(PD, data=body,
                                 headers={'Content-Type': 'application/json'}, method='POST')
    res = get_json_from_req(req)

    # 검증
    chk = get_json(PD + '/latest')
    cp = json.loads(chk['payload'])
    print(f'매일 재고 체크 배치 완료 — 버전 {ver}→{chk.get("version")}')
    for coord, (zid, items) in plan.items():
        ok = all(t in str(cp['data'].get(zid) or '') for t in items)
        print(f'  C동 {coord} ({zid}): {",".join(items)} {"✅" if ok else "❌ 검증실패"}')
    print(f'배치 {sum(len(v[1]) for v in plan.values())}종 | 잔류 {len(leftovers)}종'
          + (f': {",".join(leftovers[:15])}' if leftovers else ''))


def get_json_from_req(req):
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


if __name__ == '__main__':
    main()
