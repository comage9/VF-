# -*- coding: utf-8 -*-
import os
import sys
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, '/home/comtop/workspace/VF/backend')
import django
django.setup()

from django.test import RequestFactory
from sales_api.views import outbound_sync
from sales_api.models import OutboundRecord
from django.db.models import Sum

print("=== 동기화 실행 전 5/16 DB 상태 ===")
qs_before = OutboundRecord.objects.filter(outbound_date='2026-05-16')
print(f"  건수: {qs_before.count()}건")
print(f"  총 수량: {qs_before.aggregate(total=Sum('box_quantity'))['total'] or 0} Box")
print(f"  총 매출: {qs_before.aggregate(total=Sum('sales_amount'))['total'] or 0} 원")

print("\n=== Django 백엔드 동기화 로직 직접 강제 실행 ===")
rf = RequestFactory()
# outbound-tabs.tsx에 정의된 구글 시트 출고 CSV URL 전달
request_payload = {
    'url': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv'
}
req = rf.post('/api/outbound/sync', data=request_payload, content_type='application/json')

try:
    resp = outbound_sync(req)
    print(f"  응답 코드: {resp.status_code}")
    print(f"  동기화 응답 데이터: {resp.data}")
except Exception as e:
    print(f"  동기화 에러 발생: {e}")

print("\n=== 동기화 완료 후 5/16 DB 상태 ===")
qs_after = OutboundRecord.objects.filter(outbound_date='2026-05-16')
print(f"  건수: {qs_after.count()}건")
print(f"  총 수량: {qs_after.aggregate(total=Sum('box_quantity'))['total'] or 0} Box")
print(f"  총 매출: {qs_after.aggregate(total=Sum('sales_amount'))['total'] or 0} 원")
