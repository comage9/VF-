import os
import hashlib
from django.core.management.base import BaseCommand
from django.conf import settings
import pandas as pd
from sales_api.models import FCInboundRecord, FCInboundFileUpload


class Command(BaseCommand):
    help = 'Load FC inbound sample Excel files from sample/Fc sample folder'

    def handle(self, *args, **options):
        # 프로젝트 루트 경로
        base_dir = settings.BASE_DIR
        sample_dir = os.path.join(os.path.dirname(base_dir), 'sample', 'Fc sample')

        if not os.path.exists(sample_dir):
            self.stderr.write(self.style.ERROR(f'Sample directory not found: {sample_dir}'))
            return

        # 엑셀 파일 목록 가져오기
        excel_files = [f for f in os.listdir(sample_dir) if f.endswith(('.xlsx', '.xls'))]

        if not excel_files:
            self.stdout.write(self.style.WARNING('No Excel files found in sample directory'))
            return

        self.stdout.write(self.style.SUCCESS(f'Found {len(excel_files)} Excel file(s)'))

        for excel_file in excel_files:
            file_path = os.path.join(sample_dir, excel_file)
            self.stdout.write(f'\nProcessing: {excel_file}')

            try:
                # 파일 해시 계산
                with open(file_path, 'rb') as f:
                    file_hash = hashlib.sha256(f.read()).hexdigest()

                # 이미 업로드된 파일인지 확인
                if FCInboundFileUpload.objects.filter(file_hash=file_hash).exists():
                    existing = FCInboundFileUpload.objects.filter(file_hash=file_hash).first()
                    self.stdout.write(self.style.WARNING(
                        f'  → Already uploaded on {existing.upload_date.strftime("%Y-%m-%d %H:%M")} - Skipped'
                    ))
                    continue

                # 엑셀 파일 로드
                df = pd.read_excel(file_path)

                # 필수 컬럼 확인
                required_columns = ['SKU번호', 'SKU명', '입고/반출시각', '물류센터', '수량']
                missing = [col for col in required_columns if col not in df.columns]
                if missing:
                    self.stderr.write(self.style.ERROR(f'  → Missing columns: {", ".join(missing)}'))
                    continue

                records_created = 0
                records_skipped = 0
                records_duplicate = 0
                records_processed = 0

                for _, row in df.iterrows():
                    records_processed += 1
                    try:
                        # 날짜 파싱
                        date_str = str(row.get('입고/반출시각', ''))
                        if not date_str or date_str == 'nan':
                            records_skipped += 1
                            continue

                        date_obj = pd.to_datetime(date_str, errors='coerce')
                        if pd.isna(date_obj):
                            records_skipped += 1
                            continue
                        inbound_date = date_obj.date()

                        # 데이터 추출
                        sku_id = str(row.get('SKU번호', '')).strip()
                        barcode = str(row.get('SKU번호', '')).strip()
                        product_name = str(row.get('SKU명', '')).strip()

                        try:
                            quantity = int(float(str(row.get('수량', 0)).replace(',', '')))
                        except Exception:
                            quantity = 0

                        logistics_center = str(row.get('물류센터', '')).strip()

                        if not sku_id or not product_name or quantity <= 0:
                            records_skipped += 1
                            continue

                        # 중복 체크
                        existing_record = FCInboundRecord.objects.filter(
                            inbound_date=inbound_date,
                            sku_id=sku_id,
                            product_name=product_name,
                            logistics_center=logistics_center,
                            quantity=quantity
                        ).first()

                        if existing_record:
                            records_duplicate += 1
                            continue

                        # 레코드 생성
                        FCInboundRecord.objects.create(
                            inbound_date=inbound_date,
                            sku_id=sku_id,
                            barcode=barcode,
                            product_name=product_name,
                            category='',
                            subcategory='',
                            color='',
                            quantity=quantity,
                            logistics_center=logistics_center,
                        )
                        records_created += 1

                    except Exception as e:
                        self.stderr.write(self.style.ERROR(f'  → Row error: {e}'))
                        records_skipped += 1
                        continue

                # 파일 업로드 이력 저장
                file_upload = FCInboundFileUpload.objects.create(
                    file_name=excel_file,
                    file_hash=file_hash,
                    records_processed=records_processed,
                    records_created=records_created,
                    records_skipped=records_skipped,
                    records_duplicate=records_duplicate,
                    status='completed' if records_created > 0 else 'partial',
                )

                self.stdout.write(self.style.SUCCESS(
                    f'  ✓ Created: {records_created}, Skipped: {records_skipped}, '
                    f'Duplicate: {records_duplicate}, Total: {len(df)}'
                ))

            except Exception as e:
                self.stderr.write(self.style.ERROR(f'  ✗ Error: {e}'))
                continue

        self.stdout.write(self.style.SUCCESS('\n✓ All sample files processed'))
