# Generated manually for MasterSpec.finish_type

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales_api", "0034_masterspec_notes"),
    ]

    operations = [
        migrations.AddField(
            model_name="masterspec",
            name="finish_type",
            field=models.CharField(
                blank=True,
                choices=[
                    ("", "미지정"),
                    ("finished", "완제품"),
                    ("needs_packaging", "포장 필요"),
                ],
                db_index=True,
                default="",
                help_text=(
                    "완제품(finished) 또는 포장을 해야 하는 제품(needs_packaging). "
                    "마스터 UI에서 수동 선택. 출고 배치와 무관."
                ),
                max_length=32,
            ),
        ),
    ]
