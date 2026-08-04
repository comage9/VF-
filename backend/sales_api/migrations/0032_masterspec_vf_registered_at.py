# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales_api", "0031_inventorystockadjustment"),
    ]

    operations = [
        migrations.AddField(
            model_name="masterspec",
            name="vf_registered_at",
            field=models.DateField(
                blank=True,
                db_index=True,
                help_text="VF 지정일. 쿠팡 발주서 VF 품목 CSV 등록 일자 등. is_vf_item=True 일 때 의미 있음.",
                null=True,
            ),
        ),
    ]
