import sqlite3
from django.core.management.base import BaseCommand
from django.conf import settings
import os
import uuid
from datetime import datetime

class Command(BaseCommand):
    help = 'Import data from legacy SQLite database using Raw SQL'

    def handle(self, *args, **options):
        # Paths
        legacy_db_path = os.path.join(settings.BASE_DIR.parent, 'data', 'analytics.db')
        django_db_path = os.path.join(settings.BASE_DIR, 'db.sqlite3')
        
        if not os.path.exists(legacy_db_path):
            self.stdout.write(self.style.ERROR(f'Legacy DB not found at: {legacy_db_path}'))
            return

        self.stdout.write(f'Legacy DB: {legacy_db_path}')
        self.stdout.write(f'Target DB: {django_db_path}')
        
        # Connect to both DBs
        conn_legacy = sqlite3.connect(legacy_db_path)
        conn_django = sqlite3.connect(django_db_path)
        
        cursor_legacy = conn_legacy.cursor()
        cursor_django = conn_django.cursor()
        
        try:
            # 1. Fetch data from legacy
            self.stdout.write('Fetching data from legacy DB...')
            cursor_legacy.execute("SELECT * FROM outbound_records")
            rows = cursor_legacy.fetchall()
            
            # Get column names to map correctly
            columns = [desc[0] for desc in cursor_legacy.description]
            self.stdout.write(f'Found {len(rows)} records. Columns: {columns}')
            
            # 2. Insert into Django DB
            insert_query = """
                INSERT INTO outbound_records (
                    id, outbound_date, product_name, quantity, sales_amount,
                    box_quantity, unit_count, category, client, barcode,
                    status, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            
            # Django table name is 'outbound_records' as defined in Meta.db_table
            
            batch_data = []
            count = 0
            
            for row in rows:
                row_dict = dict(zip(columns, row))
                
                # Data transformation
                id_val = row_dict.get('id')
                # Validate UUID format or generate new if invalid (simple check length)
                if not id_val or len(str(id_val)) != 36:
                    id_val = str(uuid.uuid4())
                else:
                    id_val = str(id_val).replace('-', '') # Django UUIDField in SQLite stores as 32 hex chars usually, but let's check
                    # Actually, Django UUIDField on SQLite stores as 32-char hex string (no hyphens) usually.
                    # Let's keep it safe: store as 32 char hex.
                    if len(id_val) == 36:
                        id_val = id_val.replace('-', '')

                # Date formatting (YYYY-MM-DD)
                out_date = row_dict.get('outbound_date')
                if out_date and len(out_date) >= 10:
                    out_date = out_date[:10]
                else:
                    out_date = '2000-01-01' # Fallback

                # Numeric handling
                qty = row_dict.get('quantity')
                sales = row_dict.get('sales_amount')
                box = row_dict.get('box_quantity')
                unit = row_dict.get('unit_count')
                
                # Convert None to 0 or None as per model
                qty = float(qty) if qty is not None else 0
                sales = float(sales) if sales is not None else 0
                box = int(box) if box is not None else None
                unit = int(unit) if unit is not None else None
                
                # Timestamps
                created = row_dict.get('created_at') or datetime.now().isoformat()
                updated = row_dict.get('updated_at') or datetime.now().isoformat()

                batch_data.append((
                    id_val,
                    out_date,
                    row_dict.get('product_name') or '',
                    int(qty), # IntegerField
                    sales,    # DecimalField (stored as Real/Text in SQLite)
                    box,
                    unit,
                    row_dict.get('category') or '',
                    row_dict.get('client') or '',
                    row_dict.get('barcode'),
                    row_dict.get('status') or '완료',
                    row_dict.get('notes'),
                    created,
                    updated
                ))
                
                count += 1
                if len(batch_data) >= 5000:
                    cursor_django.executemany(insert_query, batch_data)
                    conn_django.commit()
                    self.stdout.write(f'Inserted {count} records...')
                    batch_data = []

            # Insert remaining
            if batch_data:
                cursor_django.executemany(insert_query, batch_data)
                conn_django.commit()
                
            self.stdout.write(self.style.SUCCESS(f'Successfully imported {count} records via Raw SQL.'))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error: {e}'))
            conn_django.rollback()
        finally:
            conn_legacy.close()
            conn_django.close()
