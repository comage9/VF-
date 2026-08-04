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
    path("api/vehicle-order", views.api_vehicle_order, name="departure-vehicle-order"),
    path("api/kpp-data", views.api_kpp_data, name="departure-kpp-data"),
    path("api/dispatch-request", views.api_dispatch_request, name="departure-dispatch"),
    path("api/print/<int:hoche>", views.api_print, name="departure-print"),
    path("api/print-kpp/<int:hoche>", views.api_print_kpp, name="departure-print-kpp"),
    path("api/kpp-check/<int:hoche>", views.api_kpp_check, name="departure-kpp-check"),
    path("api/kpp-session", views.api_kpp_session, name="departure-kpp-session"),
    path("api/ls-pdf-status", views.api_ls_pdf_status, name="departure-ls-pdf"),
    path("api/vehicle-extras", views.api_vehicle_extras, name="departure-vehicle-extras"),
    path("api/ls-sync", views.api_ls_sync, name="departure-ls-sync"),
    path("debug", views.debug, name="departure-debug"),

    # Barcode Scanner 다중 컴퓨터 공유
    path("api/barcode/save", views.api_barcode_save, name="barcode-save"),
    path("api/barcode/load", views.api_barcode_load, name="barcode-load"),
    path("api/barcode/clear", views.api_barcode_clear, name="barcode-clear"),
    path("api/barcode/subscribe", views.api_barcode_subscribe, name="barcode-subscribe"),

    # Downloads 폴더 스캔 API
    path("api/ls-download-scan", views.api_ls_download_scan, name="departure-download-scan"),
    # 차량정보 N vs LS M 비교·확인 후 병합
    path("api/ls-compare", views.api_ls_compare, name="departure-ls-compare"),
    path("api/ls-apply-merge", views.api_ls_apply_merge, name="departure-ls-apply-merge"),
    path("api/ls-defer-merge", views.api_ls_defer_merge, name="departure-ls-defer-merge"),
] 
