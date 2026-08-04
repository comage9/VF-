from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales_api", "0024_outboundrecord_outbound_re_outboun_2ce2cc_idx"),
    ]

    operations = [
        migrations.AddField(
            model_name="outboundrecord",
            name="is_estimated",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="True면 실적이 아닌 예측 보정 데이터",
            ),
        ),
        migrations.AddField(
            model_name="outboundrecord",
            name="estimate_method",
            field=models.CharField(
                blank=True,
                default="",
                help_text="예: adjacent_avg (직전·직후 실적일 품목 평균)",
                max_length=64,
            ),
        ),
        migrations.AddIndex(
            model_name="outboundrecord",
            index=models.Index(
                fields=["outbound_date", "is_estimated"],
                name="outbound_re_outboun_est_idx",
            ),
        ),
    ]
