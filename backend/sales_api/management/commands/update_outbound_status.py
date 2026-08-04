# -*- coding: utf-8 -*-
"""
마스터 상태열「출고 진행 / 3개월 미출고」(is_no_outbound_3m) 갱신.

도메인 구분
-----------
1) VF 품목 (is_vf_item=True)
   - 기준: 우리 창고 → 고객 **실출고** (OutboundRecord, is_estimated 제외)
   - 최근 90일 실출고 없음 → is_no_outbound_3m=True

2) VF 외 품목 (is_vf_item=False)
   - 기준: 쿠팡 **FC 입고** (= 우리 입장 쿠팡 센터 납품/출고)
   - FCInboundRecord 바코드 또는 SKU 매칭
   - 최근 90일 FC 입고 없음 → is_no_outbound_3m=True

단종(is_discontinued) 품목은 스킵.
"""
from datetime import date, timedelta

from django.core.management.base import BaseCommand

from sales_api.models import FCInboundRecord, MasterSpec, OutboundRecord


class Command(BaseCommand):
    help = (
        "is_no_outbound_3m 갱신: VF=실출고 기준, 비VF=FC 입고(센터 납품) 기준. 단종 스킵."
    )

    def handle(self, *args, **options):
        self.stdout.write("상태 동기화 시작 (VF=출고 / 비VF=FC 입고)...")

        today = date.today()
        three_months_ago = today - timedelta(days=90)
        self.stdout.write(f"기준 구간: {three_months_ago} ~ {today} (90일)")

        # --- VF: 실출고 바코드 ---
        out_qs = (
            OutboundRecord.objects.filter(outbound_date__gte=three_months_ago)
            .exclude(barcode="")
            .exclude(barcode__isnull=True)
        )
        if hasattr(OutboundRecord, "is_estimated"):
            out_qs = out_qs.filter(is_estimated=False)
        recent_out_barcodes = {
            str(b).strip()
            for b in out_qs.values_list("barcode", flat=True).distinct()
            if b and str(b).strip()
        }
        self.stdout.write(f"  VF 실출고 바코드: {len(recent_out_barcodes)}개")

        # --- 비VF: FC 입고 (센터 납품) ---
        recent_fc_barcodes = {
            str(b).strip()
            for b in FCInboundRecord.objects.filter(inbound_date__gte=three_months_ago)
            .exclude(barcode="")
            .exclude(barcode__isnull=True)
            .values_list("barcode", flat=True)
            .distinct()
            if b and str(b).strip()
        }
        recent_fc_skus = {
            str(s).strip()
            for s in FCInboundRecord.objects.filter(inbound_date__gte=three_months_ago)
            .exclude(sku_id="")
            .exclude(sku_id__isnull=True)
            .values_list("sku_id", flat=True)
            .distinct()
            if s and str(s).strip()
        }
        self.stdout.write(
            f"  FC 입고 바코드: {len(recent_fc_barcodes)}개, SKU: {len(recent_fc_skus)}개"
        )

        specs = MasterSpec.objects.filter(is_discontinued=False).only(
            "id",
            "barcode",
            "sku_id",
            "is_vf_item",
            "is_no_outbound_3m",
        )
        skipped_discontinued = MasterSpec.objects.filter(is_discontinued=True).count()

        to_active = []
        to_no_outbound = []
        vf_n = non_vf_n = 0

        for spec in specs.iterator():
            bc = (spec.barcode or "").strip()
            sku = (spec.sku_id or "").strip()

            if spec.is_vf_item:
                vf_n += 1
                # VF: 우리 창고 고객 출고만
                has_activity = bool(bc and bc in recent_out_barcodes)
            else:
                non_vf_n += 1
                # 비VF: 쿠팡 FC 납품(=FC 입고 기록)
                has_activity = bool(
                    (bc and bc in recent_fc_barcodes)
                    or (sku and sku in recent_fc_skus)
                )

            if has_activity:
                if spec.is_no_outbound_3m:
                    spec.is_no_outbound_3m = False
                    to_active.append(spec)
            else:
                if not spec.is_no_outbound_3m:
                    spec.is_no_outbound_3m = True
                    to_no_outbound.append(spec)

        if to_active:
            MasterSpec.objects.bulk_update(to_active, ["is_no_outbound_3m"])
            self.stdout.write(f"  → 미출고 → 출고 진행: {len(to_active)}개")
        if to_no_outbound:
            MasterSpec.objects.bulk_update(to_no_outbound, ["is_no_outbound_3m"])
            self.stdout.write(f"  → 출고 진행 → 3개월 미출고: {len(to_no_outbound)}개")

        active_count = MasterSpec.objects.filter(
            is_discontinued=False, is_no_outbound_3m=False
        ).count()
        no_outbound_count = MasterSpec.objects.filter(
            is_discontinued=False, is_no_outbound_3m=True
        ).count()
        vf_active = MasterSpec.objects.filter(
            is_discontinued=False, is_vf_item=True, is_no_outbound_3m=False
        ).count()
        vf_no = MasterSpec.objects.filter(
            is_discontinued=False, is_vf_item=True, is_no_outbound_3m=True
        ).count()
        non_vf_active = MasterSpec.objects.filter(
            is_discontinued=False, is_vf_item=False, is_no_outbound_3m=False
        ).count()
        non_vf_no = MasterSpec.objects.filter(
            is_discontinued=False, is_vf_item=False, is_no_outbound_3m=True
        ).count()

        self.stdout.write(self.style.SUCCESS("동기화 완료"))
        self.stdout.write(f"  스캔 VF {vf_n} / 비VF {non_vf_n} (단종 스킵 {skipped_discontinued})")
        self.stdout.write(f"  전체 출고 진행 {active_count} / 3개월 미출고 {no_outbound_count}")
        self.stdout.write(f"  VF  출고진행 {vf_active} / 미출고 {vf_no}  (실출고 기준)")
        self.stdout.write(f"  비VF 출고진행 {non_vf_active} / 미출고 {non_vf_no}  (FC 입고 기준)")
