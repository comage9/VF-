# -*- coding: utf-8 -*-
"""
VF 데이터 → GoClaw Vault 자동 동기화

VF API에서 다음 데이터를 가져와서 GoClaw Vault에 업로드:
- 생산 계획 (production)
- 전산 재고 수량 (inventory/unified)
- 출고 현황 (outbound)
- 출고 수량 (outbound/stats)

Usage:
  python manage.py sync_to_vault              # 전체 동기화
  python manage.py sync_to_vault --type production   # 생산 데이터만
  python manage.py sync_to_vault --type inventory     # 재고만
  python manage.py sync_to_vault --type outbound      # 출고만
  python manage.py sync_to_vault --dry-run            # 실제 업로드 없이 미리보기

GoClaw Vault DB에 직접 파일을 등록합니다.
"""
import json
import csv
import requests
from django.utils import timezone
from datetime import datetime, date, timedelta
from django.core.management.base import BaseCommand
import logging
import os
import tempfile
import uuid
import shutil

logger = logging.getLogger(__name__)

# VF API 기본 URL
VF_API_BASE = "http://bonohouse.p-e.kr:5176/api"

# GoClaw Vault 경로
GOCLAW_VAULT_DIR = os.environ.get('GOCLAW_VAULT_DIR', '/home/comtop/.goclaw/workspace/vault')


class Command(BaseCommand):
    help = 'VF API 데이터 → GoClaw Vault 동기화'

    def add_arguments(self, parser):
        parser.add_argument(
            '--type',
            type=str,
            choices=['production', 'inventory', 'outbound', 'all'],
            default='all',
            help='동기화할 데이터 타입'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='실제 업로드 없이 미리보기'
        )
        parser.add_argument(
            '--date',
            type=str,
            default=None,
            help='특정 날짜 데이터 (YYYY-MM-DD 형식, 출고 데이터용)'
        )
        parser.add_argument(
            '--api-url',
            type=str,
            default=VF_API_BASE,
            help='VF API 기본 URL'
        )
        parser.add_argument(
            '--vault-dir',
            type=str,
            default=GOCLAW_VAULT_DIR,
            help='GoClaw Vault 디렉토리'
        )

    def handle(self, *args, **options):
        self.api_url = options['api_url']
        self.dry_run = options['dry_run']
        self.sync_type = options['type']
        self.sync_date = options['date']
        self.vault_dir = options['vault_dir']

        self.stdout.write(self.style.SUCCESS('=' * 60))
        self.stdout.write(self.style.SUCCESS('VF → GoClaw Vault 동기화 시작'))
        self.stdout.write(self.style.SUCCESS('=' * 60))

        if self.dry_run:
            self.stdout.write(self.style.WARNING('⚠️ DRY RUN 모드 - 실제 업로드 없음'))

        today = date.today()
        if self.sync_date:
            try:
                sync_date = datetime.strptime(self.sync_date, '%Y-%m-%d').date()
            except ValueError:
                self.stdout.write(self.style.ERROR(f'잘못된 날짜 형식: {self.sync_date}'))
                return
        else:
            sync_date = today

        # 동기화 실행
        results = {}

        if self.sync_type in ['production', 'all']:
            results['production'] = self.sync_production()

        if self.sync_type in ['inventory', 'all']:
            results['inventory'] = self.sync_inventory()

        if self.sync_type in ['outbound', 'all']:
            results['outbound'] = self.sync_outbound(sync_date)

        # 결과 요약
        self.stdout.write(self.style.SUCCESS('\n' + '=' * 60))
        self.stdout.write(self.style.SUCCESS('동기화 완료 요약'))
        self.stdout.write(self.style.SUCCESS('=' * 60))

        for data_type, result in results.items():
            status = self.style.SUCCESS('✅') if result['success'] else self.style.ERROR('❌')
            self.stdout.write(f'{status} {data_type}: {result["message"]}')

    def sync_production(self):
        """생산 계획 동기화"""
        self.stdout.write(f'\n[{timezone.now().strftime("%H:%M:%S")}] 🔄 생산 계획 동기화 중...')

        try:
            # VF API에서 생산 데이터 가져오기
            response = requests.get(f'{self.api_url}/production', timeout=30)
            response.raise_for_status()
            data = response.json()

            # API 응답 구조 확인
            results_data = data.get('results', {})
            if isinstance(results_data, dict):
                records = results_data.get('data', [])
                total = results_data.get('totalRecords', 0)
            else:
                records = results_data
                total = len(records)

            if not records:
                return {'success': True, 'message': '데이터 없음'}

            # CSV 파일 생성
            filename = f'vf_생산계획_{date.today().strftime("%Y-%m-%d")}.csv'
            filepath = self._create_csv(records, filename, self._production_columns())

            # Vault에 업로드
            if filepath:
                self._upload_to_vault(filepath, f'VF 생산계획 {date.today().strftime("%Y-%m-%d")}')

            return {
                'success': True,
                'message': f'{len(records)}개 레코드'
            }

        except Exception as e:
            return {'success': False, 'message': str(e)}

    def sync_inventory(self):
        """전산 재고 수량 동기화"""
        self.stdout.write(f'\n[{timezone.now().strftime("%H:%M:%S")}] 🔄 전산 재고 동기화 중...')

        try:
            # VF API에서 재고 데이터 가져오기
            response = requests.get(f'{self.api_url}/inventory/unified', timeout=60)
            response.raise_for_status()
            data = response.json()

            items = data.get('data', [])
            total = data.get('pagination', {}).get('total', 0)

            if not items:
                return {'success': True, 'message': '데이터 없음'}

            # CSV 파일 생성
            filename = f'vf_재고_{date.today().strftime("%Y-%m-%d")}.csv'
            filepath = self._create_csv(items, filename, self._inventory_columns())

            # Vault에 업로드
            if filepath:
                self._upload_to_vault(filepath, f'VF 전산재고 {date.today().strftime("%Y-%m-%d")} ({total}개 품목)')

            return {
                'success': True,
                'message': f'{len(items)}개 품목'
            }

        except Exception as e:
            return {'success': False, 'message': str(e)}

    def sync_outbound(self, sync_date):
        """출고 현황 & 출고 수량 동기화"""
        self.stdout.write(f'\n[{timezone.now().strftime("%H:%M:%S")}] 🔄 출고 데이터 동기화 중...')

        try:
            results = {}
            date_str = sync_date.strftime('%Y-%m-%d')

            # 1. 출고 현황 (일별 데이터)
            response = requests.get(
                f'{self.api_url}/outbound',
                params={'date': date_str},
                timeout=30
            )
            response.raise_for_status()
            outbound_data = response.json()

            if outbound_data and isinstance(outbound_data, list) and len(outbound_data) > 0:
                records = outbound_data if isinstance(outbound_data, list) else []
                filename = f'vf_출고현황_{date_str}.csv'
                filepath = self._create_csv(records, filename, self._outbound_columns())

                if filepath:
                    self._upload_to_vault(filepath, f'VF 출고현황 {date_str}')

                results['현황'] = len(records)
            else:
                results['현황'] = 0

            # 2. 출고 수량 (통계)
            response = requests.get(
                f'{self.api_url}/outbound/stats',
                params={'start_date': date_str, 'end_date': date_str},
                timeout=30
            )
            response.raise_for_status()
            stats_data = response.json()

            if stats_data:
                filename = f'vf_출고수량_{date_str}.json'
                temp_dir = os.path.join(tempfile.gettempdir(), 'vf_vault_sync')
                os.makedirs(temp_dir, exist_ok=True)
                filepath = os.path.join(temp_dir, filename)

                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump({
                        'sync_date': date_str,
                        'data': stats_data
                    }, f, ensure_ascii=False, indent=2)

                self._upload_to_vault(filepath, f'VF 출고수량 {date_str}')

                if isinstance(stats_data, dict):
                    results['수량'] = stats_data.get('total_outbound', '통계 데이터')
                else:
                    results['수량'] = '통계 데이터'
            else:
                results['수량'] = '없음'

            return {
                'success': True,
                'message': f'현황:{results["현황"]}건, 수량:{results["수량"]}'
            }

        except Exception as e:
            return {'success': False, 'message': str(e)}

    def _production_columns(self):
        """생산 계획 CSV 컬럼"""
        return [
            'id', 'date', 'machine_number', 'mold_number', 'product_name',
            'product_name_eng', 'color1', 'color2', 'unit', 'quantity',
            'unit_quantity', 'total', 'status', 'start_time', 'end_time',
            'sort_order'
        ]

    def _inventory_columns(self):
        """재고 CSV 컬럼"""
        return [
            'productName', 'skuId', 'currentStock', 'minStock', 'maxStock',
            'reorderPoint', 'safetyStock', 'category', 'location', 'barcode',
            'stockStatus', 'outbound14dTotal', 'outbound30dTotal', 'inventoryDate'
        ]

    def _outbound_columns(self):
        """출고 CSV 컬럼"""
        return [
            'id', 'outbound_date', 'product_name', 'product_name_eng',
            'quantity', 'unit', 'barcode', 'created_at'
        ]

    def _create_csv(self, records, filename, columns):
        """CSV 파일 생성"""
        if not records:
            return None

        temp_dir = os.path.join(tempfile.gettempdir(), 'vf_vault_sync')
        os.makedirs(temp_dir, exist_ok=True)

        filepath = os.path.join(temp_dir, filename)

        with open(filepath, 'w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=columns, extrasaction='ignore')
            writer.writeheader()
            writer.writerows(records)

        self.stdout.write(f'  ✅ CSV 생성: {filename} ({len(records)}개)')
        return filepath

    def _upload_to_vault(self, filepath, title):
        """GoClaw Vault에 파일 업로드"""
        if self.dry_run:
            self.stdout.write(f'  ⚠️ [DRY RUN] Vault 업로드: {title}')
            return

        try:
            # Vault 디렉토리 생성
            os.makedirs(self.vault_dir, exist_ok=True)

            # 파일 복사 (타임스탬프로 구분)
            ext = os.path.splitext(filepath)[1]
            timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
            vault_filename = f'{timestamp}_{uuid.uuid4().hex[:8]}{ext}'
            vault_path = os.path.join(self.vault_dir, vault_filename)

            shutil.copy2(filepath, vault_path)

            self.stdout.write(f'  ✅ Vault 업로드 완료: {title}')
            self.stdout.write(f'     경로: {vault_path}')

            # GoClaw 데이터베이스에 메타데이터 등록
            self._register_to_goclaw_db(vault_path, title, os.path.getsize(filepath))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  ❌ Vault 업로드 실패: {str(e)}'))

    def _register_to_goclaw_db(self, filepath, title, file_size):
        """GoClaw 데이터베이스에 파일 메타데이터 등록"""
        try:
            # GoClaw는 PostgreSQL 사용 (루트 권한 필요)
            # 현재는 파일만 복사, 메타데이터는 수동 또는 별도 처리
            # TODO: psql로 vault_documents 테이블에 INSERT
            
            self.stdout.write(f'     (DB 등록은 수동 또는 cron에서 처리)')
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'     DB 등록 실패: {str(e)}'))