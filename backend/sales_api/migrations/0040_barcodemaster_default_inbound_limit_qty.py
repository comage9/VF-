from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales_api", "0039_inboundproductrestriction_limit_qty"),
    ]

    operations = [
        migrations.AddField(
            model_name="barcodemaster",
            name="default_inbound_limit_qty",
            field=models.IntegerField(
                db_index=True,
                default=2,
                help_text="4일 보유 기본 입고제한 수량(배치). 출고 없/저조 시 최소 2.",
            ),
        ),
        migrations.AddField(
            model_name="barcodemaster",
            name="default_inbound_limit_updated_at",
            field=models.DateTimeField(
                blank=True,
                help_text="default_inbound_limit_qty 마지막 배치 시각",
                null=True,
            ),
        ),
    ]
