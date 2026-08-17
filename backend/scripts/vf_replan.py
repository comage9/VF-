#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VF 제품배치도 조건 기반 재배치 도구 (2026-08-17)
================================================
사용 예시:
  # 상위 출고 품목으로 전체 재배치 (시안만 출력, 파일 미변경)
  python vf_replan.py --rule top_rank

  # 시안대로 파일 적용
  python vf_replan.py --rule top_rank --apply

  # 로코스 계열은 한 칸에 2개씩 배치 (분류별 칸당 개수 오버라이드)
  python vf_replan.py --per-slot "리빙박스 로코스:2" --apply

  # 옷걸이는 3개/칸, 와이드는 2개/칸, 그 외 rank 우선
  python vf_replan.py --per-slot "옷걸이:3,와이드 서랍장:2" --priority rank --apply

  # 특정 동만 재배치
  python vf_replan.py --dong A --apply
  python vf_replan.py --dong C --per-slot "슬림형 서랍장:4" --apply

규칙:
  --rule top_rank  : rank(1개월 출고박스) 오름차순 우선 배치
  --priority finished : (기본) 완제품 > 포장필요 > 0박스, 그 안에서 rank순
  --priority rank  : rank 순만 (finish 무관)
  --per-slot "분류:N,..." : 해당 분류 칸당 개수 지정
  --dong A|B|C|D|ALL : 재배치 대상 동 (기본 ALL)
  --dry-run (기본) / --apply : 파일 갱신 여부

데이터 소스:
  - 마스터: http://localhost:5176/api/master/specs (finish_type, 재고, 분류)
  - 랭크: docs/product-display/1111-rank-top-20260817.txt (1~80)
          docs/product-display/1111-rank-extend-20260816.txt (81~875)
  - 배치 구조: frontend/client/src/pages/product-display-{a,b,c,d}-data.ts
"""
import argparse, json, re, sys, urllib.request
from collections import Counter, defaultdict

BASE = r'E:/coding/VF-new'
DATA = BASE + r'/frontend/client/src/pages'
DOCS = BASE + r'/docs/product-display'
MASTER_URL = 'http://localhost:5176/api/master/specs'
TOP_RANK_FILE = DOCS + r'/1111-rank-top-20260817.txt'
EXT_RANK_FILE = DOCS + r'/1111-rank-extend-20260816.txt'

# ---------------------------------------------------------------- 데이터 로드
def load_master():
    with urllib.request.urlopen(MASTER_URL, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))

def load_rank():
    """barcode -> (rank, boxes, loc). top 파일 col2=rank col7=boxes col4=loc col6=bc"""
    rank = {}
    try:
        for ln in open(TOP_RANK_FILE, encoding='utf-8').read().splitlines()[1:]:
            p = ln.split('\t')
            if len(p) < 8: continue
            try: rk, bx = int(p[1]), int(p[6])
            except: continue
            rank[p[5]] = (rk, bx, p[3])
    except FileNotFoundError:
        pass
    for ln in open(EXT_RANK_FILE, encoding='utf-8').read().splitlines()[1:]:
        p = ln.split('\t')
        if len(p) < 6: continue
        try: rk, bx = int(p[0]), int(p[5])
        except: continue
        rank.setdefault(p[4], (rk, bx, p[2]))
    return rank

def build_pool(master, rank):
    """loc -> {loc, rank, boxes, finish, cat, name, n_items, barcode}"""
    m_by_loc = defaultdict(list)
    for x in master:
        if x.get('location'): m_by_loc[x['location']].append(x)
    pool = {}
    for loc, items in m_by_loc.items():
        if not loc.startswith('320-A1'): continue
        ranks, boxes, fins, cats, names = [], [], set(), set(), []
        bc0 = items[0].get('barcode', '')
        for it in items:
            rb = rank.get(it['barcode'])
            if rb: ranks.append(rb[0]); boxes.append(rb[1])
            if it.get('finish_type'): fins.add(it['finish_type'])
            if it.get('category_lg'): cats.add(it['category_lg'])
            names.append(it['product_name'])
        pool[loc] = {
            'loc': loc,
            'rank': min(ranks) if ranks else 9999,
            'boxes': sum(boxes) if boxes else 0,
            'finish': ','.join(sorted(fins)) if fins else '',
            'cat': next(iter(cats)) if len(cats) == 1 else ('/'.join(sorted(cats)) if cats else ''),
            'name': names[0][:42] if names else '?',
            'n_items': len(items),
            'barcode': bc0,
        }
    return pool

# ---------------------------------------------------------------- 배치 구조
def parse_slots(path, name):
    src = open(path, encoding='utf-8').read()
    m = re.search(rf'export const {name}.*?= \{{(.*?)\}};', src, re.S)
    slots = {}
    if m:
        for line in m.group(1).splitlines():
            mm = re.match(r'\s*"([^"]+)":\s*"([^"]*)",?\s*$', line)
            if mm and mm.group(2): slots[mm.group(1)] = mm.group(2).split(',')
    return slots

def pnum_to_loc(p):
    p = str(p)
    if len(p) == 4 and p.startswith('2'): return f'320-A1-2-{int(p)-2000}'
    return f'320-A1-1-{p}'

def loc_to_pnum(loc):
    m = re.match(r'320-A1-(\d)-(\d+)$', loc)
    if not m: return loc
    zone, num = m.group(1), m.group(2)
    return num if zone == '1' else str(2000 + int(num))

def get_slot_meta(slots, pool):
    """slot -> (cat, size) — 현재 품목 분류 기준"""
    meta = []
    for slot, pnums in slots.items():
        cats = [pool[pnum_to_loc(p)]['cat'] for p in pnums if pnum_to_loc(p) in pool]
        c = Counter(cats)
        main = c.most_common(1)[0][0] if c else ''
        meta.append({'slot': slot, 'cat': main, 'size': len(pnums)})
    return meta

def get_a_meta(a_src, a_slots, pool):
    m_cat = re.search(r'export const A_ZONE_CATEGORY_LG.*?= \{(.*?)\};', a_src, re.S)
    a_cat = dict(re.findall(r'"([^"]+)":\s*"([^"]*)"', m_cat.group(1))) if m_cat else {}
    meta = []
    for slot, pnums in a_slots.items():
        cat = a_cat.get(slot, '')
        if not cat:
            cat = pool[pnum_to_loc(pnums[0])]['cat'] if pnum_to_loc(pnums[0]) in pool else ''
        meta.append({'slot': slot, 'cat': cat, 'size': 1})
    return meta

# ---------------------------------------------------------------- 재배치 엔진
def replan(pool, metas, priority, per_slot_overrides, assigned=()):
    """
    metas: [{slot, cat, size}] — 칸 순서/분류/칸당 개수
    priority: 'finished' | 'rank'
    per_slot_overrides: {cat: n} 분류별 칸당 개수 오버라이드
    assigned: 이미 배정된 loc (전역 제외용)
    """
    used = set(assigned)
    def key(x):
        if priority == 'rank':
            return (0 if x['rank'] != 9999 else 1, x['rank'])
        # finished 우선
        p = 2 if x['boxes'] == 0 else (0 if x['finish'] == 'finished' else 1)
        return (p, x['rank'])
    ranked = sorted(pool.values(), key=key)
    result, info = {}, {}
    for meta in metas:
        size = per_slot_overrides.get(meta['cat'], meta['size'])
        cands = [x for x in ranked if x['loc'] not in used and (not meta['cat'] or meta['cat'] in x['cat'] or x['cat'] in meta['cat'])]
        take = cands[:size]
        if len(take) < size:
            rest = [x for x in ranked if x['loc'] not in used]
            take += rest[:size - len(take)]
        for x in take: used.add(x['loc'])
        result[meta['slot']] = [x['loc'] for x in take]
        info[meta['slot']] = take
    return result, info, used

def stats(info):
    allx = [x for take in info.values() for x in take]
    ranks = sorted(x['rank'] for x in allx if x['rank'] != 9999)
    return {
        'count': len(allx),
        'median_rank': ranks[len(ranks)//2] if ranks else None,
        'top200': sum(1 for x in allx if x['rank'] <= 200),
        'zero': sum(1 for x in allx if x['boxes'] == 0),
        'finished': sum(1 for x in allx if x['finish'] == 'finished'),
        'pack': sum(1 for x in allx if x['finish'] == 'needs_packaging'),
    }

# ---------------------------------------------------------------- 파일 갱신
def replace_export(src, name, new_body):
    m = re.search(rf'(export const {name}.*?= \{{)(.*?)(\n\}};)', src, re.S)
    if not m: return src, False
    return src[:m.start(2)] + '\n' + new_body + m.group(3) + src[m.end(3):], True

def write_a_file(path, plan, pool):
    src = open(path, encoding='utf-8').read()
    def qmap(items): return '\n'.join(f'  "{k}": "{v}",' for k, v in items)
    def smap(items): return '\n'.join(f'  "{k}": {v},' for k, v in items)
    rank_, cat_, mn_, lg_, md_, st_, bc_ = [], [], [], [], [], [], []
    for slot, locs in plan.items():
        loc = locs[0]
        inf = pool[loc]
        rank_.append((slot, loc_to_pnum(loc)))
        cat_.append((slot, inf['cat'].split('/')[0]))
        mn_.append((slot, inf['name']))
        lg_.append((slot, inf['cat'].split('/')[0]))
        md_.append((slot, '미분류'))
        st_.append((slot, 0))
        bc_.append((slot, inf['barcode']))
    for name, body in [('A_RANK_PLACEMENT', qmap(rank_)), ('A_ZONE_CAT', qmap(cat_)),
                       ('A_ZONE_MASTER_NAME', qmap(mn_)), ('A_ZONE_CATEGORY_LG', qmap(lg_)),
                       ('A_ZONE_CATEGORY_MD', qmap(md_)), ('A_ZONE_STOCK', smap(st_)),
                       ('A_ZONE_BARCODE', qmap(bc_))]:
        src, ok = replace_export(src, name, body)
        if not ok: print(f'!! {name} 교체 실패')
    m = re.search(r'export const A_PLACED_COUNT = (\d+);', src)
    if m: src = src.replace(m.group(0), f'export const A_PLACED_COUNT = {len(plan)};', 1)
    open(path, 'w', encoding='utf-8').write(src)

def write_bcd_file(path, plan, pool, info_field):
    src = open(path, encoding='utf-8').read()
    base = 'B' if 'b-data' in path else ('C' if 'c-data' in path else 'D')
    lines = []
    for slot, locs in plan.items():
        lines.append(f'  "{slot}": "{",".join(loc_to_pnum(l) for l in locs)}",')
    src, ok = replace_export(src, f'{base}_RANK_PLACEMENT', '\n'.join(lines))
    if not ok: print(f'!! {base}_RANK_PLACEMENT 교체 실패')
    ilines, seen = [], set()
    for locs in plan.values():
        for loc in locs:
            pnum = loc_to_pnum(loc)
            if pnum in seen: continue
            seen.add(pnum)
            inf = pool[loc]
            ilines.append(f'  "{pnum}": {{ name: "{inf["name"]}", lg: "{inf["cat"].split("/")[0]}", md: "미분류", {info_field}: "", stock: 0, barcode: "{inf["barcode"]}" }},')
    m = re.search(rf'(export const {base}_PNUM_INFO:.*?= \{{)(.*?)(\n\}};)', src, re.S)
    if m:
        src = src[:m.start(2)] + '\n' + '\n'.join(ilines) + m.group(3) + src[m.end(3):]
    else:
        print(f'!! {base}_PNUM_INFO 교체 실패')
    open(path, 'w', encoding='utf-8').write(src)

# ---------------------------------------------------------------- 메인
def main():
    ap = argparse.ArgumentParser(description='VF 제품배치도 조건 기반 재배치')
    ap.add_argument('--rule', default='top_rank', choices=['top_rank'])
    ap.add_argument('--priority', default='finished', choices=['finished', 'rank'])
    ap.add_argument('--per-slot', default='', help='분류:개수,... (예: "리빙박스 로코스:2,옷걸이:3")')
    ap.add_argument('--dong', default='ALL', choices=['ALL', 'A', 'B', 'C', 'D'])
    ap.add_argument('--apply', action='store_true', help='파일 갱신 (기본 dry-run)')
    args = ap.parse_args()

    per_slot = {}
    for kv in args.per_slot.split(','):
        if not kv.strip(): continue
        k, _, v = kv.strip().partition(':')
        per_slot[k.strip()] = int(v.strip())
    if per_slot: print('칸당 개수 오버라이드:', per_slot)

    master = load_master()
    rank = load_rank()
    pool = build_pool(master, rank)
    print(f'마스터 {len(master)}건 / 로케이션 풀 {len(pool)} / 랭크 {len(rank)}')

    a_src = open(DATA + '/product-display-a-data.ts', encoding='utf-8').read()
    a_slots = parse_slots(DATA + '/product-display-a-data.ts', 'A_RANK_PLACEMENT')
    b_slots = parse_slots(DATA + '/product-display-b-data.ts', 'B_RANK_PLACEMENT')
    c_slots = parse_slots(DATA + '/product-display-c-data.ts', 'C_RANK_PLACEMENT')
    d_slots = parse_slots(DATA + '/product-display-d-data.ts', 'D_RANK_PLACEMENT')

    assigned = set()
    plans = {}
    dong_metas = {
        'A': get_a_meta(a_src, a_slots, pool),
        'B': get_slot_meta(b_slots, pool),
        'C': get_slot_meta(c_slots, pool),
        'D': get_slot_meta(d_slots, pool),
    }
    for dong in ['A', 'C', 'B', 'D']:
        if args.dong != 'ALL' and args.dong != dong:
            plans[dong] = None
            continue
        res, info, assigned = replan(pool, dong_metas[dong], args.priority, per_slot, assigned)
        plans[dong] = res
        s = stats(info)
        print(f'{dong}동: {s["count"]}품목 | rank중앙 {s["median_rank"]} | rank≤200 {s["top200"]} | '
              f'0박스 {s["zero"]} | 포장필요 {s["pack"]} | 완제품 {s["finished"]}')

    if not args.apply:
        print('\n[dry-run] 파일 미변경. --apply 로 적용.')
        return

    if args.dong in ('ALL', 'A') and plans['A']:
        write_a_file(DATA + '/product-display-a-data.ts', plans['A'], pool)
        print('A동 파일 갱신')
    if args.dong in ('ALL', 'B') and plans['B']:
        write_bcd_file(DATA + '/product-display-b-data.ts', plans['B'], pool, 'dansu')
        print('B동 파일 갱신')
    if args.dong in ('ALL', 'C') and plans['C']:
        write_bcd_file(DATA + '/product-display-c-data.ts', plans['C'], pool, 'danse')
        print('C동 파일 갱신')
    if args.dong in ('ALL', 'D') and plans['D']:
        write_bcd_file(DATA + '/product-display-d-data.ts', plans['D'], pool, 'dansu')
        print('D동 파일 갱신')
    print('\n완료. tsc 검증: cd frontend/client && npx tsc --noEmit')

if __name__ == '__main__':
    main()
