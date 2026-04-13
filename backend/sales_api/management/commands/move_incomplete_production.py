"""
미완료 생산 계획 자동 이동 관리 명령어
자정 Cron: 0 0 * * * cd /path/to/backend && .venv/bin/python manage.py move_incomplete_production
"""
from django.core.management.base import BaseCommand
from sales_api.views import move_incomplete_production_logs


class Command(BaseCommand):
    help = '미완료 생산 계획을 다음 작업일로 자동 이동'

    def handle(self, *args, **options):
        self.stdout.write('미완료 생산 계획 이동 시작...')
        result = move_incomplete_production_logs()
        
        self.stdout.write(
            self.style.SUCCESS(
                f"이동 완료: {result['old_to_today']}개→오늘, "
                f"{result['today_to_next']}개→다음작업일({result['next_workday']})"
            )
        )
