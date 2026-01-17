from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales_api", "0002_datasource_inventoryitem_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="DeliveryDailyRecord",
            fields=[
                ("date", models.DateField(primary_key=True, serialize=False)),
                ("day_of_week", models.CharField(blank=True, default="", max_length=20)),
                ("total", models.IntegerField(default=0)),
                ("hourly", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "delivery_daily_records",
            },
        ),
        migrations.CreateModel(
            name="BarcodeTransferRecord",
            fields=[
                ("tracking_no", models.CharField(max_length=100, primary_key=True, serialize=False)),
                ("barcode", models.CharField(db_index=True, max_length=100)),
                ("product_name", models.CharField(blank=True, default="", max_length=255)),
                ("category", models.CharField(blank=True, default="", max_length=255)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "barcode_transfer_records",
            },
        ),
    ]
