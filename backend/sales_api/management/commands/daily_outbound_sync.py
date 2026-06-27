# -*- coding: utf-8 -*-
"""매일 출고 데이터 자동 동기화 (Google Sheets → DB)
사용: python manage.py daily_outbound_sync
크론: 0 7 * * * (매일 아침 7시)
"""
import os
import sys
import requests
import io
import pandas as pd
from datetime import datetime, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from sales_api.models import OutboundRecord
from django.utils import timezone


class Command(BaseCommand):
    help = "Google Sheets에서 출고 데이터를 자동 동기화"

    def handle(self, *args, **options):
        url = os.environ.get("OUTBOUND_GOOGLE_SHEET_URL")
        if not url:
            self.stderr.write("OUTBOUND_GOOGLE_SHEET_URL not set")
            return

        # 동기화 전 DB 최신 날짜 확인
        latest = OutboundRecord.objects.order_by("-outbound_date").first()
        latest_date = latest.outbound_date if latest else None
        today = timezone.now().date()
        self.stdout.write(f"DB 최신 날짜: {latest_date}, 오늘: {today}")

        # 어제 날짜부터 동기화 (이미 있으면 update_or_create로 갱신)
        sync_start = (today - timedelta(days=2)).isoformat()

        # CSV 다운로드
        try:
            r = requests.get(url, timeout=120)
            r.raise_for_status()
            decoded = None
            for enc in ["utf-8-sig", "cp949", "euc-kr", "utf-8"]:
                try:
                    decoded = r.content.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            if decoded is None:
                self.stderr.write("디코딩 실패")
                return
            df = pd.read_csv(io.StringIO(decoded), dtype=str).fillna("")
            df.columns = [str(c).strip().lstrip("\ufeff") for c in df.columns]
        except Exception as e:
            self.stderr.write(f"CSV 다운로드 실패: {e}")
            return

        # 컬럼 매핑
        def find_col(candidates):
            for cand in candidates:
                for c in df.columns:
                    if cand in str(c):
                        return c
            return None

        date_col = find_col(["일자", "출고일", "date"])
        product_col = find_col(["품목", "상품명", "product"])
        category_col = find_col(["분류", "카테고리"])
        barcode_col = find_col(["바코드", "barcode"])
        box_col = find_col(["수량(박스)", "박스"])
        unit_col = find_col(["수량(낱개)", "낱개"])
        amount_col = find_col(["판매금액", "금액", "매출"])

        if not date_col or not product_col:
            self.stderr.write("필수 컬럼 없음")
            return

        def parse_date(val):
            s = str(val).strip() if val else ""
            if not s:
                return None
            for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d"):
                try:
                    return datetime.strptime(s, fmt).date()
                except Exception:
                    pass
            try:
                dt = pd.to_datetime(s, errors="coerce")
                return dt.date() if not pd.isna(dt) else None
            except Exception:
                return None

        def parse_num(val):
            if val is None:
                return 1
            s = str(val).strip().replace(",", "")
            try:
                n = float(s)
                return max(n, 0)
            except Exception:
                return 0

        new_count = 0
        update_count = 0
        now = timezone.now()

        for _, row in df.iterrows():
            d = parse_date(row.get(date_col))
            if not d:
                continue
            # 최근 2일만 동기화 (속도)
            if d.isoformat() < sync_start:
                continue

            product = str(row.get(product_col, "")).strip()
            if not product:
                continue

            category = str(row.get(category_col, "")).strip()
            barcode = str(row.get(barcode_col, "")).strip()
            box_qty = int(parse_num(row.get(box_col)))
            unit_qty = int(parse_num(row.get(unit_col)))
            amount = Decimal(str(parse_num(row.get(amount_col))))

            obj, created = OutboundRecord.objects.update_or_create(
                outbound_date=d,
                product_name=product,
                barcode=barcode,
                category=category,
                box_quantity=box_qty,
                defaults={
                    "unit_count": unit_qty,
                    "sales_amount": amount,
                },
            )
            if created:
                new_count += 1
            else:
                update_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"동기화 완료: 신규 {new_count}건, 갱신 {update_count}건 "
                f"(기준일: {sync_start}~)"
            )
        )
