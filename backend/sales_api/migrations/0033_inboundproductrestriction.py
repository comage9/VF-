# Generated manually for InboundProductRestriction

from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("sales_api", "0032_masterspec_vf_registered_at"),
    ]

    operations = [
        migrations.CreateModel(
            name="InboundProductRestriction",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("barcode", models.CharField(db_index=True, max_length=100, unique=True)),
                ("product_name", models.CharField(blank=True, default="", max_length=255)),
                ("location", models.CharField(blank=True, default="", max_length=100)),
                ("enabled", models.BooleanField(db_index=True, default=True)),
                ("note", models.TextField(blank=True, default="")),
                (
                    "allowed_from",
                    models.DateField(
                        blank=True,
                        db_index=True,
                        help_text="이 날짜부터 입고 허용 (포함). null + enabled=True → 무기한 차단",
                        null=True,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "db_table": "inbound_product_restrictions",
                "ordering": ["-updated_at"],
            },
        ),
    ]
