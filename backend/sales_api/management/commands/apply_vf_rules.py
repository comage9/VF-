# -*- coding: utf-8 -*-
"""
VF 규칙 커맨드 (호환용).

is_vf_item 은 엑셀 SoT / 마스터 수동만 변경한다.
이 커맨드는 더 이상 ON/OFF 하지 않음 (apply_vf_item_rules = noop).

복구가 필요하면:
  python manage.py restore_vf_sot --strict
"""
from datetime import date

from django.core.management.base import BaseCommand
from django.utils import timezone

from sales_api.vf_rules import apply_vf_item_rules


class Command(BaseCommand):
    help = (
        "VF is_vf_item 변경 없음(noop). 현재 건수만 출력. "
        "SoT 복구는 restore_vf_sot --strict"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--as-of",
            type=str,
            default="",
            help="기준일 YYYY-MM-DD (표시용, 기본: 오늘)",
        )
        parser.add_argument(
            "--reg-months",
            type=int,
            default=1,
            help="호환 인자 (무시됨)",
        )
        parser.add_argument(
            "--outbound-months",
            type=int,
            default=3,
            help="호환 인자 (무시됨)",
        )

    def handle(self, *args, **options):
        as_of = None
        raw = (options.get("as_of") or "").strip()
        if raw:
            as_of = date.fromisoformat(raw[:10])
        else:
            as_of = timezone.localdate()

        stats = apply_vf_item_rules(
            as_of=as_of,
            reg_months=int(options.get("reg_months") or 1),
            outbound_months=int(options.get("outbound_months") or 3),
        )
        self.stdout.write(self.style.WARNING(stats.get("message") or str(stats)))
        self.stdout.write(
            f"  after_vf={stats.get('after_vf')} "
            f"updated_true={stats.get('updated_true_rows')} "
            f"cleared={stats.get('cleared_false_rows')} noop={stats.get('noop')}"
        )
