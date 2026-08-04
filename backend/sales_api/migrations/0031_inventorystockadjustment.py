# Generated manually for continuous inventory ledger adjustments

from django.db import migrations, models
from django.db.models import Q
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ("sales_api", "0030_masterspec_is_vf_item"),
    ]

    operations = [
        migrations.CreateModel(
            name="InventoryStockAdjustment",
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
                ("adjustment_date", models.DateField(db_index=True)),
                ("barcode", models.CharField(db_index=True, max_length=100)),
                (
                    "product_name",
                    models.CharField(blank=True, default="", max_length=255),
                ),
                ("qty_delta", models.IntegerField(default=0)),
                (
                    "reason",
                    models.CharField(
                        choices=[
                            ("wms_reconcile", "WMS 실물 대조"),
                            ("damage", "파손/폐기"),
                            ("audit", "실사"),
                            ("grade_change", "등급변경"),
                            ("manual", "수동 조정"),
                            ("other", "기타"),
                        ],
                        db_index=True,
                        default="manual",
                        max_length=32,
                    ),
                ),
                ("note", models.CharField(blank=True, default="", max_length=500)),
                (
                    "source_key",
                    models.CharField(
                        blank=True, db_index=True, default="", max_length=200
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={
                "db_table": "inventory_stock_adjustments",
            },
        ),
        migrations.AddIndex(
            model_name="inventorystockadjustment",
            index=models.Index(
                fields=["barcode", "adjustment_date"],
                name="inventory_s_barcode_adj_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="inventorystockadjustment",
            index=models.Index(
                fields=["adjustment_date", "reason"],
                name="inventory_s_adj_date_reason_idx",
            ),
        ),
        migrations.AddConstraint(
            model_name="inventorystockadjustment",
            constraint=models.UniqueConstraint(
                condition=~Q(source_key=""),
                fields=("source_key",),
                name="uniq_inv_adj_source_key_nonempty",
            ),
        ),
    ]
