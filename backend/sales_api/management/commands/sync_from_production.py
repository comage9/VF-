"""
Django management command: sync_from_production

Production API (bonohouse.p-e.kr:5176)에서 데이터를 가져와서
로컬 DB에 동기화한다.

Usage:
  python manage.py sync_from_production          # 전체 동기화
  python manage.py sync_from_production --type production   # 생산 데이터만
  python manage.py sync_from_production --type inventory    # 재고만
  python manage.py sync_from_production --type outbound    # 출고만
  python manage.py sync_from_production --dry-run          # 실제 반영 없이 미리보기
"""
import requests
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import datetime
from sales_api.models import ProductionLog, OutboundRecord, InventoryItem
import logging

logger = logging.getLogger(__name__)

PRODUCTION_API = "http://bonohouse.p-e.kr:5176/api"

# Field mapping: API field -> Model field
PRODUCTION_LOG_MAPPING = {
    'id': 'id',
    'date': 'date',
    'machine_number': 'machine_number',
    'mold_number': 'mold_number',
    'product_name': 'product_name',
    'product_name_eng': 'product_name_eng',
    'color1': 'color1',
    'color2': 'color2',
    'unit': 'unit',
    'quantity': 'quantity',
    'unit_quantity': 'unit_quantity',
    'total': 'total',
    'status': 'status',
    'start_time': 'start_time',
    'end_time': 'end_time',
    'sort_order': 'sort_order',
}

INVENTORY_MAPPING = {
    'id': 'id',
    'productName': 'name',
    'category': 'category',
    'currentStock': 'current_stock',
    'minStock': 'minimum_stock',
    'barcode': 'barcode',
    'lifecycleStatus': 'status',
    'location': None,  # no matching field, skip
    'lastUpdated': 'last_restock',
}

OUTBOUND_MAPPING = {
    'outbound_date': 'outbound_date',
    'product_name': 'product_name',
    'quantity': 'quantity',
    'sales_amount': 'sales_amount',
    'box_quantity': 'box_quantity',
    'unit_count': 'unit_count',
    'category': 'category',
    'client': 'client',
    'barcode': 'barcode',
    'status': 'status',
    'notes': 'notes',
}


def parse_date(val):
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    for fmt in ['%Y-%m-%d', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M:%S.%f', '%Y-%m-%dT%H:%M:%S%z']:
        try:
            return datetime.strptime(val.replace('+00:00', '').split('.')[0], fmt if '%f' not in fmt else '%Y-%m-%dT%H:%M:%S')
        except ValueError:
            continue
    return None


def parse_int(val):
    try:
        return int(val)
    except (TypeError, ValueError):
        return 0


def get_nested(d, *keys, default=None):
    for k in keys:
        if isinstance(d, dict):
            d = d.get(k)
        else:
            return default
        if d is None:
            return default
    return d


class Command(BaseCommand):
    help = 'Sync data from production API to local DB'

    def add_arguments(self, parser):
        parser.add_argument('--type', type=str, choices=['production', 'inventory', 'outbound', 'all'], default='all')
        parser.add_argument('--dry-run', action='store_true', help='Show what would be synced without writing')
        parser.add_argument('--replace', action='store_true', help='Delete existing records before sync')

    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        sync_type = options['type']
        replace = options['replace']

        self.stdout.write(self.style.WARNING(f"=== Production API Sync ==="))
        if self.dry_run:
            self.stdout.write(self.style.WARNING("⚠️  DRY RUN - No changes will be written"))

        if sync_type in ('production', 'all'):
            self.sync_production(replace)
        if sync_type in ('inventory', 'all'):
            self.sync_inventory(replace)
        if sync_type in ('outbound', 'all'):
            self.sync_outbound(replace)

        self.stdout.write(self.style.SUCCESS("✅ Sync complete!"))

    def fetch_api(self, endpoint):
        try:
            resp = requests.get(f"{PRODUCTION_API}/{endpoint}", timeout=30)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"  ❌ API error ({endpoint}): {e}"))
            return None

    # ── Production Log ──────────────────────────────────────────────

    def sync_production(self, replace):
        self.stdout.write("\n📦 Syncing ProductionLog...")
        data = self.fetch_api('production')
        if not data:
            return

        records = data.get('data', [])
        if not records:
            self.stdout.write("  No records found.")
            return

        # Check for new records (by date filter)
        latest_local = ProductionLog.objects.order_by('-date').first()
        latest_date = latest_local.date if latest_local else None

        to_sync = []
        skipped = 0
        for r in records:
            try:
                date_val = r.get('date')
                if isinstance(date_val, str):
                    date_obj = datetime.strptime(date_val[:10], '%Y-%m-%d').date()
                else:
                    date_obj = date_val

                if latest_date and date_obj <= latest_date:
                    skipped += 1
                    continue

                obj = ProductionLog(
                    id=r.get('id'),
                    date=date_obj,
                    machine_number=str(r.get('machine_number', '') or ''),
                    mold_number=str(r.get('mold_number', '') or ''),
                    product_name=str(r.get('product_name', '') or ''),
                    product_name_eng=str(r.get('product_name_eng', '') or ''),
                    color1=str(r.get('color1', '') or ''),
                    color2=str(r.get('color2', '') or ''),
                    unit=str(r.get('unit', '') or ''),
                    quantity=parse_int(r.get('quantity')),
                    unit_quantity=parse_int(r.get('unit_quantity')),
                    total=parse_int(r.get('total')),
                    status=str(r.get('status', 'pending') or 'pending'),
                    sort_order=parse_int(r.get('sort_order')),
                    start_time=r.get('start_time'),
                    end_time=r.get('end_time'),
                )
                to_sync.append(obj)
            except Exception as e:
                self.stdout.write(f"  ⚠️  Skip record: {e}")

        if self.dry_run:
            self.stdout.write(f"  Would sync: {len(to_sync)} new records (latest local date: {latest_date})")
            self.stdout.write(f"  Skipped (already exist): {skipped}")
            return

        if to_sync:
            ProductionLog.objects.bulk_create(to_sync, ignore_conflicts=True)
            self.stdout.write(self.style.SUCCESS(f"  ✅ Synced {len(to_sync)} records"))
        else:
            self.stdout.write(f"  ℹ️  No new records (skipped {skipped} existing)")

    # ── Inventory ───────────────────────────────────────────────────

    def sync_inventory(self, replace):
        self.stdout.write("\n📦 Syncing InventoryItem...")
        data = self.fetch_api('inventory/unified')
        if not data:
            return

        records = data.get('data', [])
        if not records:
            self.stdout.write("  No records found.")
            return

        if replace:
            count = InventoryItem.objects.count()
            InventoryItem.objects.all().delete()
            self.stdout.write(f"  🗑️  Deleted {count} existing records")

        created = 0
        updated = 0
        for r in records:
            try:
                last_updated = r.get('lastUpdated')
                last_restock = parse_date(last_updated) if last_updated else None

                defaults = {
                    'name': r.get('productName', ''),
                    'category': r.get('category', ''),
                    'current_stock': parse_int(r.get('currentStock')),
                    'minimum_stock': parse_int(r.get('minStock')),
                    'barcode': r.get('barcode', ''),
                    'status': r.get('lifecycleStatus', 'active'),
                    'last_restock': last_restock,
                }

                item, was_created = InventoryItem.objects.update_or_create(
                    id=r.get('id'),
                    defaults=defaults
                )
                if was_created:
                    created += 1
                else:
                    updated += 1
            except Exception as e:
                self.stdout.write(f"  ⚠️  Skip: {r.get('id')} - {e}")

        if self.dry_run:
            self.stdout.write(f"  Would sync: {len(records)} records")
            return

        self.stdout.write(self.style.SUCCESS(f"  ✅ {created} created, {updated} updated (total {len(records)})"))

    # ── Outbound ───────────────────────────────────────────────────

    def sync_outbound(self, replace):
        self.stdout.write("\n📦 Syncing OutboundRecord...")
        data = self.fetch_api('outbound')
        if not data:
            self.stdout.write("  ℹ️  No outbound endpoint or empty response")
            return

        records = data if isinstance(data, list) else data.get('data', [])
        if not records:
            self.stdout.write("  ℹ️  No outbound records found")
            return

        if replace:
            count = OutboundRecord.objects.count()
            OutboundRecord.objects.all().delete()
            self.stdout.write(f"  🗑️  Deleted {count} existing records")

        created = 0
        for r in records:
            try:
                outbound_date = parse_date(r.get('outbound_date'))
                defaults = {
                    'product_name': r.get('product_name', ''),
                    'quantity': parse_int(r.get('quantity')),
                    'sales_amount': get_nested(r, 'sales_amount') or 0,
                    'box_quantity': parse_int(r.get('box_quantity')),
                    'unit_count': parse_int(r.get('unit_count')),
                    'category': r.get('category', ''),
                    'client': r.get('client', ''),
                    'barcode': r.get('barcode', ''),
                    'status': r.get('status', 'completed'),
                    'notes': r.get('notes', ''),
                }
                obj, was_created = OutboundRecord.objects.update_or_create(
                    id=r.get('id'),
                    defaults=defaults
                )
                if was_created:
                    created += 1
            except Exception as e:
                self.stdout.write(f"  ⚠️  Skip: {r.get('id', 'unknown')} - {e}")

        if self.dry_run:
            self.stdout.write(f"  Would sync: {len(records)} records")
            return

        self.stdout.write(self.style.SUCCESS(f"  ✅ {created} created (total {len(records)})"))
