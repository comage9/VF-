from django.contrib import admin
from .models import DepartureRecord, PrintLog


@admin.register(DepartureRecord)
class DepartureRecordAdmin(admin.ModelAdmin):
    list_display = ("date", "hoche", "plate", "driver_name", "ton", "plt", "hub")
    list_filter = ("date", "hub")
    search_fields = ("plate", "driver_name", "hoche")


@admin.register(PrintLog)
class PrintLogAdmin(admin.ModelAdmin):
    list_display = ("created_at", "date", "kind", "hoche", "plate", "ok", "printer", "client_ip")
    list_filter = ("kind", "ok", "date")
    search_fields = ("plate", "hoche", "job_title")
    readonly_fields = ("created_at",)
