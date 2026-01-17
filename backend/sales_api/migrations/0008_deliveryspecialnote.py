from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('sales_api', '0007_barcodemaster_lifecycle_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeliverySpecialNote',
            fields=[
                ('id', models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False, serialize=False)),
                ('date', models.DateField(db_index=True)),
                ('event_datetime', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('product_name', models.CharField(blank=True, db_index=True, default='', max_length=255)),
                ('barcode', models.CharField(blank=True, db_index=True, max_length=100, null=True)),
                ('sku_id', models.CharField(blank=True, db_index=True, default='', max_length=100)),
                ('quantity', models.IntegerField(blank=True, null=True)),
                ('memo', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'delivery_special_notes',
            },
        ),
        migrations.AddIndex(
            model_name='deliveryspecialnote',
            index=models.Index(fields=['date'], name='delivery_sp_date_31d2d3_idx'),
        ),
        migrations.AddIndex(
            model_name='deliveryspecialnote',
            index=models.Index(fields=['date', 'product_name'], name='delivery_sp_date_pr_8f6d2b_idx'),
        ),
        migrations.AddIndex(
            model_name='deliveryspecialnote',
            index=models.Index(fields=['date', 'barcode'], name='delivery_sp_date_ba_1c1d59_idx'),
        ),
    ]
