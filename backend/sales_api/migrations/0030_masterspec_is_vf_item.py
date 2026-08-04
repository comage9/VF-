from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales_api", "0029_masterspec_is_no_outbound_3m"),
    ]

    operations = [
        migrations.AddField(
            model_name="masterspec",
            name="is_vf_item",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="True면 쿠팡 발주서 VF 품목 목록에 포함된 생산/출고 대상 품목.",
            ),
        ),
    ]
