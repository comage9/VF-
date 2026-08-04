# Generated manually for MasterSpec.notes

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales_api", "0033_inboundproductrestriction"),
    ]

    operations = [
        migrations.AddField(
            model_name="masterspec",
            name="notes",
            field=models.TextField(
                blank=True,
                default="",
                help_text="제품 비고. 목록 제품명 호버 시 표시.",
            ),
        ),
    ]
