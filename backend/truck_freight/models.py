from django.db import models


class TruckFreight(models.Model):
    """트럭 운송비 기록"""

    UNIT_CHOICES = [
        ("파렛트", "파렛트"),
        ("박스", "박스"),
    ]

    PAYMENT_CHOICES = [
        ("입금", "입금"),
        ("미입금", "미입금"),
        ("확인중", "확인중"),
        ("", "미입력"),
    ]

    date = models.DateField(db_index=True)
    destination = models.CharField(max_length=100, blank=True, default="")
    quantity = models.IntegerField(default=0)
    unit = models.CharField(max_length=10, choices=UNIT_CHOICES, default="파렛트")
    freight_fee = models.IntegerField(default=0)
    driver_name = models.CharField(max_length=50, blank=True, default="")
    phone = models.CharField(max_length=30, blank=True, default="")
    invoice_type = models.CharField(max_length=50, blank=True, default="")
    account_number = models.CharField(max_length=100, blank=True, default="")
    payment_status = models.CharField(max_length=10, choices=PAYMENT_CHOICES, blank=True, default="")
    note = models.TextField(blank=True, default="")
    # 증빙 사진 (송장·영수증 등) — 선택
    # FileField: Pillow 의존 없이 이미지 파일 저장 (뷰에서 확장자·content-type 검증)
    photo = models.FileField(
        upload_to="truck_freight/%Y/%m/",
        blank=True,
        null=True,
        max_length=500,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "truck_freights"
        ordering = ["-date", "-id"]
        indexes = [
            models.Index(fields=["date"]),
            models.Index(fields=["invoice_type"]),
        ]

    def __str__(self):
        return f"{self.date} - {self.destination} ({self.freight_fee:,}원)"
