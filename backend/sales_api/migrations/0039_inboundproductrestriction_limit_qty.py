from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales_api", "0038_barcodemaster_is_long_term_no_order"),
    ]

    operations = [
        migrations.AddField(
            model_name="inboundproductrestriction",
            name="limit_qty",
            field=models.IntegerField(
                blank=True,
                default=None,
                help_text="입고 제한 수량. null 또는 0이면 수량 제한 없음. 양수면 스캐너/마스터 공유 상한.",
                null=True,
            ),
        ),
    ]
