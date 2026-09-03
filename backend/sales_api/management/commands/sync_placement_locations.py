# -*- coding: utf-8 -*-
"""배치도(product-display) 기준으로 마스터 로케이션 동기화 (정기 안전망).

배치도 저장·복원 때는 자동 실행되지만(views._pd_save_snapshot 후크),
스캐너 수동 저장·차이탭 "마스터 적용" 등 다른 경로로 마스터 loc이 바뀐 경우를
되돌리기 위해 주기적으로 실행한다 (예: code-bot 크론 매일 1회).

실행:
    python manage.py sync_placement_locations            # 전체 동 적용
    python manage.py sync_placement_locations --dongs A  # A동만
    python manage.py sync_placement_locations --dry-run  # 통계만 출력
"""
import json

from django.core.management.base import BaseCommand

from sales_api.placement_location_sync import sync_placement_locations


class Command(BaseCommand):
    help = "배치도 위치번호 기준으로 BarcodeMaster.location 동기화"

    def add_arguments(self, parser):
        parser.add_argument("--dongs", default="", help="동 제한 (예: A 또는 A,C · 기본: 전체)")
        parser.add_argument("--dry-run", action="store_true", help="변경 없이 통계만 출력")

    def handle(self, *args, **options):
        import os
        if not os.environ.get("PLACEMENT_SYNC_ENABLED"):
            self.stdout.write(self.style.WARNING(
                "[비활성] placement sync는 2026-09-03 좌표 규칙(마스터 location 자동 덮어쓰기 금지)에 "
                "따라 기본 차단됩니다. 수동 실행 시 PLACEMENT_SYNC_ENABLED=1 환경변수를 설정하세요."
            ))
            return
        dongs_raw = str(options.get("dongs") or "").strip()
        dongs = tuple(d for d in (x.strip().upper() for x in dongs_raw.split(",")) if d) or None
        stats = sync_placement_locations(dongs=dongs, dry_run=options.get("dry_run"), actor="cron")
        self.stdout.write(json.dumps(stats, ensure_ascii=False, indent=2, default=str))
