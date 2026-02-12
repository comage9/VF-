from django.core.management.base import BaseCommand
from sales_api.models import FCInboundRecord, MasterSpec
from django.db import transaction


class Command(BaseCommand):
    help = 'Update FC inbound records with categories from MasterSpec'

    def add_arguments(self, parser):
        parser.add_argument(
            '--batch-size',
            type=int,
            default=1000,
            help='Number of records to process in each batch (default: 1000)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be updated without actually updating'
        )

    def handle(self, *args, **options):
        batch_size = options['batch_size']
        dry_run = options['dry_run']

        # Get all FC records that need updating (empty category)
        queryset = FCInboundRecord.objects.filter(category='').order_by('id')

        total_to_update = queryset.count()
        total_records = FCInboundRecord.objects.count()

        self.stdout.write(self.style.SUCCESS(
            f'Total FC records: {total_records}'
        ))
        self.stdout.write(self.style.WARNING(
            f'Records with empty category: {total_to_update}'
        ))

        if total_to_update == 0:
            self.stdout.write(self.style.SUCCESS('No records need updating!'))
            return

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN MODE - No changes will be made'))

        # Process in batches
        updated_count = 0
        not_found_count = 0
        error_count = 0

        for i in range(0, total_to_update, batch_size):
            batch = queryset[i:i + batch_size]

            for record in batch:
                try:
                    # Try to find matching MasterSpec by sku_id first, then barcode
                    spec = None
                    if record.sku_id:
                        spec = MasterSpec.objects.filter(sku_id=record.sku_id).first()

                    if not spec and record.barcode:
                        spec = MasterSpec.objects.filter(barcode=record.barcode).first()

                    if spec and spec.category_lg:
                        if not dry_run:
                            record.category = spec.category_lg
                            record.save(update_fields=['category'])
                        updated_count += 1
                    else:
                        not_found_count += 1

                except Exception as e:
                    self.stdout.write(self.style.ERROR(
                        f'Error updating record {record.id}: {str(e)}'
                    ))
                    error_count += 1

            # Progress update
            progress = min(i + batch_size, total_to_update)
            self.stdout.write(f'Progress: {progress}/{total_to_update} ({progress*100//total_to_update}%)')

        # Summary
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('Update Summary:'))
        self.stdout.write(f'  Total processed: {total_to_update}')
        self.stdout.write(self.style.SUCCESS(f'  Updated: {updated_count}'))
        self.stdout.write(self.style.WARNING(f'  Not found in MasterSpec: {not_found_count}'))
        if error_count > 0:
            self.stdout.write(self.style.ERROR(f'  Errors: {error_count}'))
        self.stdout.write('='*60)

        if dry_run:
            self.stdout.write(self.style.WARNING(
                '\nThis was a DRY RUN. To apply changes, run without --dry-run'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                '\nUpdate complete! Run again to catch any new records.'
            ))
