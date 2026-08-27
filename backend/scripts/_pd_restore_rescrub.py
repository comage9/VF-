"""일회성: 원본 백업에서 v204 복원 + 동 우선순위 재스크럽 (2026-08-28).
이전 스크럽이 JSON 키 순서 기준이라 C동을 남기고 B동 정본을 지웠음 → 교정.
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from sales_api.models import ProductDisplaySnapshot
from sales_api.views import _pd_sanitize_payload

BACKUP = '/tmp/pd_latest.json'

def count_dups(payload_str):
    p = json.loads(payload_str)
    data = p.get('data') or {}
    seen = set()
    dups = 0
    for val in data.values():
        if not isinstance(val, str):
            continue
        for pn in [x.strip() for x in val.split(',') if x.strip()]:
            if pn in seen:
                dups += 1
            seen.add(pn)
    return dups

bak = json.load(open(BACKUP, encoding='utf-8'))
orig = bak['payload']
print('backup version:', bak.get('version'), 'by:', bak.get('saved_by'), 'dups:', count_dups(orig))

cleaned = _pd_sanitize_payload(orig)
print('cleaned dups:', count_dups(cleaned))

# B동 정본 보존 확인
cd = json.loads(cleaned)['data']
b_vals = [cd.get(f'B-B상단-{i}', '') for i in range(1, 9)]
slim_in_b = [pn for v in b_vals for pn in v.split(',') if pn.isdigit() and 420 <= int(pn) <= 484]
print('슬림형(420-484) B동 잔존:', len(slim_in_b), slim_in_b)
slim_in_c = [pn for z, v in cd.items() if z.startswith('C-') for pn in v.split(',') if pn.isdigit() and 420 <= int(pn) <= 484]
print('슬림형(420-484) C동 잔존:', len(slim_in_c), slim_in_c)

# v204 복원 (원본 → 동 우선순위 sanitize)
s204 = ProductDisplaySnapshot.objects.filter(version=204).first()
if s204:
    s204.payload = cleaned
    s204.save(update_fields=['payload'])
    print('v204 restored+resanitized')
else:
    print('v204 NOT FOUND')

# v203: 잘못된 방향 스크럽본 → 복원 불가(원본 없음) → 삭제
ProductDisplaySnapshot.objects.filter(version=203).delete()
print('v203 deleted (wrong-direction scrub, no original backup)')

for s in ProductDisplaySnapshot.objects.order_by('version'):
    print(f"final: v{s.version} by={s.saved_by} dups={count_dups(s.payload)} zones={len(json.loads(s.payload)['data'])}")
