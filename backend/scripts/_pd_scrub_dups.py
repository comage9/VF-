"""일회성: 기존 ProductDisplaySnapshot payload의 제품번호 중복 제거 (2026-08-28).
사용: backend/.venv/Scripts/python.exe scripts/_pd_scrub_dups.py
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


def count_dups(payload_str):
    try:
        p = json.loads(payload_str)
    except Exception:
        return -1
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


total = 0
for s in ProductDisplaySnapshot.objects.order_by('version'):
    before = count_dups(s.payload)
    cleaned = _pd_sanitize_payload(s.payload)
    after = count_dups(cleaned)
    if cleaned != s.payload:
        s.payload = cleaned
        s.save(update_fields=['payload'])
    total += 1
    print(f"v{s.version} by={s.saved_by}: dups {before} -> {after}")
print(f"DONE {total} snapshots scrubbed")
