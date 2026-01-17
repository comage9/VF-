from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales_api', '0008_deliveryspecialnote'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='inventoryreceiptitem',
            constraint=models.UniqueConstraint(
                fields=('barcode', 'receipt_datetime'),
                name='uniq_inventory_receipt_event',
            ),
        ),
    ]
