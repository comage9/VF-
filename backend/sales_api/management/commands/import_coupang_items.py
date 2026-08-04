import csv
import os
import re
from datetime import datetime
from django.core.management.base import BaseCommand
from django.db import transaction
from sales_api.models import MasterSpec

class Command(BaseCommand):
    help = 'Import Coupang item specs from CSV into MasterSpec database table, correcting categories while preserving existing prices.'

    def add_arguments(self, parser):
        parser.add_argument('--file', type=str, required=True, help='Path to the Coupang item list CSV file')
        parser.add_argument('--discontinued', action='store_true', help='Mark imported items as discontinued')

    def parse_date(self, date_str):
        """다양한 날짜 형식을 파싱하여 datetime.date 객체로 변환합니다."""
        if not date_str:
            return datetime(2000, 1, 1).date()
        
        # 공백 제거
        clean_str = re.sub(r'\s+', '', date_str)
        
        # 1. YYYY-MM-DD 형식 시도
        try:
            return datetime.strptime(clean_str, '%Y-%m-%d').date()
        except ValueError:
            pass
            
        # 2. YY-MM-DD 형식 시도 (예: 25-03-05 -> 2025-03-05)
        try:
            # 2자리 연도 앞에 '20' 추가
            if len(clean_str.split('-')[0]) == 2:
                clean_str = '20' + clean_str
            return datetime.strptime(clean_str, '%Y-%m-%d').date()
        except ValueError:
            pass
            
        # 3. YYYYMMDD 형식 시도
        try:
            return datetime.strptime(clean_str, '%Y%m%d').date()
        except ValueError:
            pass
            
        # 기본값 반환
        return datetime(2000, 1, 1).date()

    def handle(self, *args, **options):
        csv_path = options['file']
        is_discontinued = bool(options.get('discontinued', False))
        
        if not os.path.exists(csv_path):
            self.stdout.write(self.style.ERROR(f'CSV file not found at: {csv_path}'))
            return

        self.stdout.write(f'Reading CSV from: {csv_path}')
        
        # 인코딩 자동 감지 시도 (utf-8-sig -> cp949)
        rows = []
        encodings = ['utf-8-sig', 'cp949', 'euc-kr']
        success = False
        
        for encoding in encodings:
            try:
                with open(csv_path, 'r', encoding=encoding) as f:
                    reader = csv.reader(f)
                    header = next(reader)
                    # 헤더 유효성 간이 검증
                    if '상품명' not in header and '바코드' not in header:
                        continue
                    
                    for r in reader:
                        if not r:
                            continue
                        rows.append(r)
                self.stdout.write(self.style.SUCCESS(f'Successfully read CSV file with {encoding} encoding.'))
                success = True
                break
            except Exception:
                rows = []
                continue
                
        if not success:
            self.stdout.write(self.style.ERROR('Failed to read CSV with supported encodings (UTF-8-SIG, CP949).'))
            return
            
        self.stdout.write(f'Found {len(rows)} data rows. Normalizing dates and sorting...')

        # 날짜 순서대로 정렬하기 위해 파싱
        # 정렬하여 루프를 돌면 최신 행이 이전 행 정보를 자연스럽게 덮어쓰게 됨
        normalized_data = []
        for r in rows:
            if len(r) < 12: # 컬럼 갯수 최소 한계 검증
                continue
                
            sku_id = r[3].strip()
            barcode = r[4].strip()
            product_name = r[5].strip()
            
            if not product_name:
                continue # 상품명은 필수 고유 키
                
            date_raw = r[2].strip()
            date_obj = self.parse_date(date_raw)
            
            normalized_data.append({
                'date': date_obj,
                'sku_id': sku_id,
                'barcode': barcode,
                'product_name': product_name,
                'category_lg': r[6].strip() or '미분류',
                'category_md': r[7].strip() or '미분류',
                'color1': r[8].strip(),
                'product_name_eng': r[9].strip(),
                'default_quantity': r[10].strip(),
                'lot_number': r[11].strip(),
                'components': r[13].strip() if len(r) > 13 else ''
            })
            
        # 일자 기준 오름차순 정렬 (과거 데이터 먼저 -> 최신 데이터가 최종 덮어씀)
        normalized_data.sort(key=lambda x: x['date'])

        self.stdout.write('Starting database import transaction...')
        
        created_count = 0
        updated_count = 0
        
        try:
            with transaction.atomic():
                for item in normalized_data:
                    name = item['product_name']
                    
                    # 단수 정수 변환
                    try:
                        qty = int(float(item['default_quantity'])) if item['default_quantity'] else 0
                    except ValueError:
                        qty = 0

                    spec, created = MasterSpec.objects.get_or_create(
                        product_name=name,
                        defaults={
                            'sku_id': item['sku_id'],
                            'barcode': item['barcode'],
                            'category_lg': item['category_lg'],
                            'category_md': item['category_md'],
                            'color1': item['color1'],
                            'product_name_eng': item['product_name_eng'],
                            'default_quantity': qty,
                            'lot_number': item['lot_number'],
                            'components': item['components'],
                            'price': 0, # 신규 등록 시 기본 단가
                            'is_discontinued': is_discontinued,
                        }
                    )
                    
                    if created:
                        created_count += 1
                    else:
                        # 기존 품목 업데이트 (단가 관련 필드는 유지)
                        spec.sku_id = item['sku_id']
                        spec.barcode = item['barcode']
                        spec.category_lg = item['category_lg']
                        spec.category_md = item['category_md']
                        spec.color1 = item['color1']
                        spec.product_name_eng = item['product_name_eng']
                        spec.default_quantity = qty
                        spec.lot_number = item['lot_number']
                        spec.components = item['components']
                        spec.is_discontinued = is_discontinued
                        spec.save()
                        updated_count += 1
                        
            self.stdout.write(self.style.SUCCESS(
                f'Successfully processed Coupang items.\n'
                f'- Newly Created: {created_count} items\n'
                f'- Updated/Corrected: {updated_count} items'
            ))
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Transaction failed: {str(e)}'))
