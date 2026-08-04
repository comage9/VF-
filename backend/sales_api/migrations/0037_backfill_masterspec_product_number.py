# 기존 MasterSpec 행의 product_number 를 BarcodeMaster.location 기준으로 채움.
# 파생 규칙: 320-A1-1-XXX → XXX, 320-A1-2-XXX → 2XXX, 그 외 null.

import re

from django.db import migrations

P1 = "320-A1-1-"
P2 = "320-A1-2-"


def _product_number_from_location(location):
    loc = (location or "").strip()
    if not loc:
        return None
    for prefix, lead in ((P1, ""), (P2, "2")):
        if loc.startswith(prefix):
            suffix = loc[len(prefix):]
            if suffix and re.fullmatch(r"\d+", suffix):
                return int(lead + suffix)
            return None
    return None


def backfill(apps, schema_editor):
    MasterSpec = apps.get_model("sales_api", "MasterSpec")
    BarcodeMaster = apps.get_model("sales_api", "BarcodeMaster")

    # barcode → location (BarcodeMaster 가 로케이션 SoT)
    loc_map = {}
    for bc, loc in BarcodeMaster.objects.exclude(barcode="").values_list(
        "barcode", "location"
    ):
        bc = (bc or "").strip()
        if bc and bc not in loc_map:
            loc_map[bc] = (loc or "").strip()

    batch = []
    for s in MasterSpec.objects.exclude(barcode="").only(
        "id", "barcode", "product_number"
    ).iterator(chunk_size=1000):
        bc = (s.barcode or "").strip()
        pn = _product_number_from_location(loc_map.get(bc, ""))
        if s.product_number != pn:
            s.product_number = pn
            batch.append(s)
        if len(batch) >= 1000:
            MasterSpec.objects.bulk_update(batch, ["product_number"])
            batch = []
    if batch:
        MasterSpec.objects.bulk_update(batch, ["product_number"])


def noop(apps, schema_editor):
    # 되돌릴 값 없음 (파생 필드)
    pass


class Migration(migrations.Migration):

    dependencies = [
        (
            "sales_api",
            "0036_rename_inventory_s_barcode_adj_idx_inventory_s_barcode_7f4a22_idx_and_more",
        ),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
