# Generated manually for truck freight photo field

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("truck_freight", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="truckfreight",
            name="photo",
            field=models.FileField(
                blank=True,
                max_length=500,
                null=True,
                upload_to="truck_freight/%Y/%m/",
            ),
        ),
    ]
