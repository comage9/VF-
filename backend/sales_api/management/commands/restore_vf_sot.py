# -*- coding: utf-8 -*-
"""
엑셀 SoT 바코드 목록으로 MasterSpec.is_vf_item 복구.

기본 파일: backend/data/vf_sot_barcodes.txt (한 줄 1 바코드)

  python manage.py restore_vf_sot
  python manage.py restore_vf_sot --file path/to/list.txt
  python manage.py restore_vf_sot --strict   # SoT 밖 VF 해제 (정확히 목록만)
"""
from __future__ import annotations

import os

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings


class Command(BaseCommand):
    help = "VF 품목 SoT(바코드 목록) 복구. 기본은 목록만 True 추가. --strict 시 목록 외 해제."

    def add_arguments(self, parser):
        default = os.path.join(
            getattr(settings, "BASE_DIR", os.getcwd()),
            "data",
            "vf_sot_barcodes.txt",
        )
        parser.add_argument(
            "--file",
            type=str,
            default=default,
            help=f"바코드 목록 경로 (기본: {default})",
        )
        parser.add_argument(
            "--strict",
            action="store_true",
            help="SoT에 없는 is_vf_item=True 를 False 로 맞춤 (정확히 목록 개수)",
        )

    def handle(self, *args, **options):
        from sales_api.models import MasterSpec

        path = options["file"]
        if not os.path.isfile(path):
            raise CommandError(f"SoT 파일 없음: {path}")

        with open(path, "r", encoding="utf-8") as f:
            sot = {line.strip() for line in f if line.strip() and not line.startswith("#")}

        if not sot:
            raise CommandError("SoT 목록이 비어 있습니다.")

        before = MasterSpec.objects.filter(is_vf_item=True).count()
        on_n = MasterSpec.objects.filter(barcode__in=list(sot)).update(is_vf_item=True)
        off_n = 0
        if options.get("strict"):
            off_n = (
                MasterSpec.objects.filter(is_vf_item=True)
                .exclude(barcode__in=list(sot))
                .update(is_vf_item=False)
            )
        after = MasterSpec.objects.filter(is_vf_item=True).count()
        missing = sot - {
            str(b).strip()
            for b in MasterSpec.objects.filter(barcode__in=list(sot)).values_list(
                "barcode", flat=True
            )
        }

        self.stdout.write(
            self.style.SUCCESS(
                f"SoT 복구: 파일 {len(sot)}건 | 이전 VF {before} → 이후 {after} "
                f"(ON update {on_n}, OFF {off_n}, strict={bool(options.get('strict'))})"
            )
        )
        if missing:
            self.stdout.write(
                self.style.WARNING(
                    f"마스터에 없는 SoT 바코드 {len(missing)}: {sorted(missing)[:10]}"
                )
            )
