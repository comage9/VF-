from django.db import models


class PrintLog(models.Model):
    """출력(인쇄) 이력 — LS 전표 / KPP EDI 출력 기록."""

    date = models.DateField(db_index=True)
    hoche = models.IntegerField(db_index=True)
    plate = models.CharField(max_length=50, blank=True, default="")
    kind = models.CharField(max_length=20, blank=True, default="LS")  # LS / KPP
    job_title = models.CharField(max_length=200, blank=True, default="")
    ok = models.BooleanField(default=True)
    printer = models.CharField(max_length=100, blank=True, default="")
    client_ip = models.CharField(max_length=50, blank=True, default="")
    results = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "departure_print_logs"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.created_at:%m-%d %H:%M} · {self.hoche}호차 · {self.plate} · {'성공' if self.ok else '실패'}"


class DepartureRecord(models.Model):
    date = models.DateField(db_index=True)
    hoche = models.IntegerField(db_index=True)
    
    plate = models.CharField(max_length=50, blank=True, default="")
    driver_name = models.CharField(max_length=100, blank=True, default="")
    driver_phone = models.CharField(max_length=50, blank=True, default="")
    ton = models.CharField(max_length=20, blank=True, default="5T")
    original_ton = models.CharField(max_length=20, blank=True, default="5T")
    time = models.CharField(max_length=20, blank=True, default="")
    plt = models.IntegerField(default=0)
    hub = models.CharField(max_length=100, blank=True, default="")
    is_new = models.BooleanField(default=False)
    slip_no = models.CharField(max_length=100, blank=True, default="")
    barcode = models.CharField(max_length=100, blank=True, default="")
    last_seen = models.CharField(max_length=50, blank=True, default="-")
    total_orders = models.IntegerField(default=0)
    
    # Seals
    seal_left_wing = models.CharField(max_length=100, blank=True, default="")
    seal_right_wing = models.CharField(max_length=100, blank=True, default="")
    seal_back_door = models.CharField(max_length=100, blank=True, default="")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'departure_records'
        unique_together = [['date', 'hoche']]
        ordering = ['date', 'hoche']

    def __str__(self):
        return f"{self.date} - {self.hoche}호차 ({self.plate})"
