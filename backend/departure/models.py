from django.db import models

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
