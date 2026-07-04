from django.urls import path, re_path
from . import views

urlpatterns = [
    re_path(r"^barcode-scanner/?$", views.render_barcode_scanner, name="barcode-scanner"),
    re_path(r"^barcode_scanner/?$", views.render_barcode_scanner, name="barcode-scanner-underscore"),
    re_path(r"^$", views.render_page, name="departure-dashboard"),
    path("api/departure-page", views.render_page, name="departure-page-fragment"),
    path("api/vehicles", views.api_vehicles, name="departure-vehicles"),
    path("api/vehicle/<str:plate>", views.api_vehicle, name="departure-vehicle"),
    path("api/deleted-placeholders", views.api_deleted_placeholders, name="departure-deleted"),
    path("api/ls-data", views.api_ls_data, name="departure-ls-data"),
    path("api/kpp-data", views.api_kpp_data, name="departure-kpp-data"),
    path("api/dispatch-request", views.api_dispatch_request, name="departure-dispatch"),
    path("api/print/<int:hoche>", views.api_print, name="departure-print"),
    path("api/ls-pdf-status", views.api_ls_pdf_status, name="departure-ls-pdf"),
    path("api/vehicle-extras", views.api_vehicle_extras, name="departure-vehicle-extras"),
    path("api/ls-sync", views.api_ls_sync, name="departure-ls-sync"),
    path("debug", views.debug, name="departure-debug"),

    # Barcode Scanner 다중 컴퓨터 공유
    path("api/barcode/save", views.api_barcode_save, name="barcode-save"),
    path("api/barcode/load", views.api_barcode_load, name="barcode-load"),
    path("api/barcode/clear", views.api_barcode_clear, name="barcode-clear"),
    path("api/barcode/subscribe", views.api_barcode_subscribe, name="barcode-subscribe"),
] 
