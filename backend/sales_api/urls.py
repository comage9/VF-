from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import views_master
from .agents import views as agent_views

router = DefaultRouter()
router.register(r"inventory", views.InventoryItemViewSet)
router.register(r"data-sources", views.DataSourceViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("outbound", views.OutboundRecordListView.as_view(), name="outbound-list"),
    path("outbound/meta", views.get_outbound_meta, name="outbound-meta"),
    path("outbound/stats", views.get_outbound_stats, name="outbound-stats"),
    path(
        "outbound/top-products",
        views.get_outbound_top_products,
        name="outbound-top-products",
    ),
    path("outbound/pivot", views.get_outbound_pivot, name="outbound-pivot"),
    path("outbound/sync", views.outbound_sync, name="outbound-sync"),
    path("outbound/date-range", views.outbound_date_range, name="outbound-date-range"),
    path(
        "outbound/barcode-daily",
        views.outbound_barcode_daily,
        name="outbound-barcode-daily",
    ),
    path(
        "outbound/daily-analysis",
        views.outbound_daily_analysis,
        name="outbound-daily-analysis",
    ),
    path(
        "outbound/ai-analysis", views.outbound_ai_analysis, name="outbound-ai-analysis"
    ),
    path("outbound/template", views.outbound_template, name="outbound-template"),
    path(
        "outbound/download/excel",
        views.outbound_download_excel,
        name="outbound-download-excel",
    ),
    path("inventory/bulk", views.bulk_create_inventory, name="bulk-create-inventory"),
    path(
        "inventory/integrated", views.inventory_integrated, name="inventory-integrated"
    ),
    path(
        "inventory/import.csv", views.inventory_import_csv, name="inventory-import-csv"
    ),
    path("inventory/template", views.inventory_template, name="inventory-template"),
    path(
        "inventory/apply-calculated-thresholds",
        views.inventory_apply_calculated_thresholds,
        name="inventory-apply-calculated-thresholds",
    ),
    path("inventory/unified", views.inventory_unified, name="inventory-unified"),
    path(
        "inventory/stock-diagnostics",
        views.inventory_stock_diagnostics,
        name="inventory-stock-diagnostics",
    ),
    path(
        "inventory/unified/download.csv",
        views.inventory_unified_download_csv,
        name="inventory-unified-download-csv",
    ),
    path(
        "inventory/unified/<str:_id>",
        views.inventory_unified_patch,
        name="inventory-unified-patch",
    ),
    path(
        "inventory/upload-history",
        views.inventory_upload_history,
        name="inventory-upload-history",
    ),
    path(
        "inventory/upload-history/<str:date>",
        views.inventory_upload_history_by_date,
        name="inventory-upload-history-by-date",
    ),
    path(
        "inventory/baseline-upload",
        views.inventory_baseline_upload,
        name="inventory-baseline-upload",
    ),
    path(
        "inventory/receipts-upload",
        views.inventory_receipts_upload,
        name="inventory-receipts-upload",
    ),
    path(
        "inventory/wms-reconcile",
        views.inventory_wms_reconcile,
        name="inventory-wms-reconcile",
    ),
    path(
        "inventory/variance-check",
        views.inventory_variance_check,
        name="inventory-variance-check",
    ),
    path(
        "inventory/variance-check/apply-location",
        views.inventory_variance_apply_location,
        name="inventory-variance-check-apply-location",
    ),
    path(
        "inventory/barcode-master",
        views.inventory_barcode_master,
        name="inventory-barcode-master",
    ),
    path(
        "inventory/barcode-location",
        views.inventory_barcode_location_upsert,
        name="inventory-barcode-location",
    ),
    path(
        "inventory/inbound/upload",
        views.inbound_order_upload,
        name="inbound-order-upload",
    ),
    path(
        "inventory/inbound/latest",
        views.inbound_order_latest,
        name="inbound-order-latest",
    ),
    path("inventory/inbound/policy", views.inbound_policy, name="inbound-policy"),
    path(
        "inventory/inbound/restrictions/resolve",
        views.inbound_product_restrictions_resolve,
        name="inbound-product-restrictions-resolve",
    ),
    path(
        "inventory/inbound/restrictions",
        views.inbound_product_restrictions,
        name="inbound-product-restrictions",
    ),
    path(
        "inventory/inbound/restrictions/<str:barcode>",
        views.inbound_product_restriction_detail,
        name="inbound-product-restriction-detail",
    ),
    path("outbound/bulk", views.bulk_create_outbound, name="bulk-create-outbound"),
    path(
        "outbound/delete-range",
        views.delete_outbound_by_date,
        name="delete-outbound-range",
    ),
    path("upload/csv", views.upload_csv, name="upload-csv"),
    path(
        "google-sheets/connect",
        views.google_sheets_connect,
        name="google-sheets-connect",
    ),
    path(
        "google-sheets/refresh/<str:id>",
        views.google_sheets_refresh,
        name="google-sheets-refresh",
    ),
    path("google-sheets/proxy", views.google_sheets_proxy, name="google-sheets-proxy"),
    path("ai/predict-hourly", views.ai_predict_hourly, name="ai-predict-hourly"),
    path("ai/analyze", views.ai_analyze, name="ai-analyze"),
    path("ai/free-models", views.ai_free_models, name="ai-free-models"),
    path("ai/chat", views.ai_chat, name="ai-chat"),
    path("ai/agent-chat", agent_views.ai_agent_chat, name="ai-agent-chat"),
    path("ai/agent-status", agent_views.ai_agent_status, name="ai-agent-status"),
    path("ai/backtest-log", views.ai_backtest_log, name="ai-backtest-log"),
    path("ai/accuracy-stats", views.ai_accuracy_stats, name="ai-accuracy-stats"),
    path(
        "parse-excel-delivery", views.parse_excel_delivery, name="parse-excel-delivery"
    ),
    path("delivery/hourly", views.delivery_hourly, name="delivery-hourly"),
    path("delivery/range", views.delivery_range, name="delivery-range"),
    path(
        "delivery/weekday-ratio",
        views.delivery_weekday_hourly_ratio,
        name="delivery-weekday-ratio",
    ),
    path(
        "delivery/daily-prediction",
        views.delivery_daily_prediction,
        name="delivery-daily-prediction",
    ),
    path("delivery/notes", views.delivery_notes, name="delivery-notes"),
    path("delivery/import", views.delivery_import, name="delivery-import"),
    path(
        "delivery/import-excel",
        views.delivery_import_excel,
        name="delivery-import-excel",
    ),
    path(
        "outbound/upload-excel",
        views.outbound_upload_excel,
        name="outbound-upload-excel",
    ),
    path(
        "delivery/export.xlsx", views.delivery_export_xlsx, name="delivery-export-xlsx"
    ),
    path("baco/transfer-stats", views.baco_transfer_stats, name="baco-transfer-stats"),
    path("production", views.production_list, name="production-list"),
    path(
        "production/<int:id>",
        views.production_delete,
        name="production-delete",
    ),
    path(
        "production/bulk-status",
        views.production_bulk_status,
        name="production-bulk-status",
    ),
    path("production/template", views.production_template, name="production-template"),
    path(
        "production-log/bulk-reorder",
        views.production_log_bulk_reorder,
        name="production-log-bulk-reorder",
    ),
    path(
        "production-log/bulk-delete",
        views.production_log_bulk_delete,
        name="production-log-bulk-delete",
    ),
    path("production-log", views.production_log, name="production-log"),
    path(
        "production-log/<int:id>",
        views.production_log_detail,
        name="production-log-detail",
    ),
    path(
        "production-log/move-pending-to-today",
        views.production_log_move_pending_to_today,
        name="production-log-move-pending-to-today",
    ),
    path(
        "production-log/carry-forward",
        views.production_log_carry_forward,
        name="production-log-carry-forward",
    ),
    path("production-log/<str:date>", views.production_log_by_date, name="production-log-by-date"),
    path("production/copy-day", views.production_copy_day, name="production-copy-day"),
    path(
        "upload-production-file",
        views.upload_production_file,
        name="upload-production-file",
    ),
    path(
        "upload-production-text",
        views.upload_production_text,
        name="upload-production-text",
    ),
    # Machine User & Plan APIs (모바일 웹앱)
    path("machine/login", views.machine_login, name="machine-login"),
    path("machine/logout", views.machine_logout, name="machine-logout"),
    path("machine/users", views.machine_user_list, name="machine-users"),
    path("machine/users/create", views.machine_user_create, name="machine-user-create"),
    path("machine/plans", views.machine_plan_list, name="machine-plans"),
    path(
        "machine/plans/<int:plan_id>",
        views.machine_plan_detail,
        name="machine-plan-detail",
    ),
    path(
        "machine/plans/<int:plan_id>/apply",
        views.machine_plan_apply,
        name="machine-plan-apply",
    ),
    path(
        "ai/production-recommend",
        views.ai_production_recommend,
        name="ai-production-recommend",
    ),
    path("ai/production-chat", views.ai_production_chat, name="ai-production-chat"),
    # Prophet 예측 API
    path("ai/production-forecast", views.ai_production_forecast, name="ai-production-forecast"),
    path("ai/production-forecast/<str:product_name>", views.ai_production_forecast_by_product, name="ai-production-forecast-by-product"),
    path("master/specs", views.master_specs, name="master-specs"),
    path("master/specs/bulk-update", views.master_specs_bulk_update, name="master-specs-bulk-update"),
    path("master/specs/sync-outbound-status", views.master_specs_sync_outbound_status, name="master-specs-sync-outbound-status"),
    path("master/specs/sync-vf-from-stock", views.master_specs_sync_vf_from_stock, name="master-specs-sync-vf-from-stock"),
    path(
        "master/specs/sync-vf-from-outbound",
        views.master_specs_sync_vf_from_outbound,
        name="master-specs-sync-vf-from-outbound",
    ),
    path("master/specs/export.xlsx", views.master_specs_export_xlsx, name="master-specs-export-xlsx"),
    path("master/specs/import-bulk", views.master_specs_import_bulk, name="master-specs-import-bulk"),
    path("master/specs/current-stock", views.master_spec_current_stock, name="master-specs-current-stock"),
    path("master/category-lg-options", views.master_category_lg_options, name="master-category-lg-options"),
    path("master/specs/register-from-scan", views.master_specs_register_from_scan, name="master-specs-register-from-scan"),
    path(
        "master/specs/upload-image",
        views.master_spec_upload_image,
        name="master-specs-upload-image",
    ),
    path(
        "master/specs/upload-excel",
        views.master_spec_upload_excel,
        name="master-specs-upload-excel",
    ),
    # <int:id> 는 정적 경로 뒤에 두어 export/import 와 충돌 방지
    path(
        "master/specs/<int:id>", views.master_specs_detail, name="master-specs-detail"
    ),
    path("master/extract", views.master_extract, name="master-extract"),
    path(
        "master/sync-from-sheet",
        views.sync_master_specs_from_sheet,
        name="master-sync-from-sheet",
    ),
    path("fc-inbound", views.get_fc_inbound_records, name="fc-inbound"),
    path("fc-inbound/stats", views.get_fc_inbound_stats, name="fc-inbound-stats"),
    path(
        "fc-inbound/top-products",
        views.get_fc_inbound_top_products,
        name="fc-inbound-top-products",
    ),
    path("fc-inbound/pivot", views.get_fc_inbound_pivot, name="fc-inbound-pivot"),
    path("fc-inbound/upload", views.fc_inbound_upload, name="fc-inbound-upload"),
    path("fc-inbound/uploads", views.get_fc_inbound_uploads, name="fc-inbound-uploads"),
    path(
        "fc-inbound/upload/<str:upload_id>",
        views.delete_fc_inbound_upload,
        name="fc-inbound-upload-delete",
    ),
    path(
        "fc-inbound/sync-from-sheet",
        views.sync_fc_inbound_from_sheet,
        name="fc-inbound-sync-from-sheet",
    ),
    path(
        "fc-inbound/delete-all",
        views.delete_fc_inbound_uploaded_data,
        name="fc-inbound-delete-all",
    ),
    path("health", views.health_check, name="health-check"),
    path(
        "production/move-incomplete",
        views.production_move_incomplete,
        name="production-move-incomplete",
    ),
    # NotebookLM 분석 API
    path('analytics/list', views.outbound_analysis_list),
    path('analytics/detail/<int:pk>', views.outbound_analysis_detail),
    path('analytics/summary', views.outbound_analytics_summary),
    
    # 마스터 데이터 API (색상, 단위, 금형, 제품단위규격)
    path('master/colors', views_master.master_colors, name='master-colors'),
    path('master/units', views_master.master_units, name='master-units'),
    path('master/molds', views_master.master_molds, name='master-molds'),
    path('master/product-specs', views_master.master_product_specs, name='master-product-specs'),
    path('master/product-specs/<str:product_name>', views_master.master_product_specs_by_product, name='master-product-specs-by-product'),
    path('master/lookup', views_master.master_lookup, name='master-lookup'),
    path('master/summary', views_master.master_summary, name='master-summary'),

    # 제품배치도 스냅샷 API (서버 영속화 — 2026-08-23)
    path("product-display", views.product_display_save, name="product-display-save"),
    path("product-display/latest", views.product_display_latest, name="product-display-latest"),
    path("product-display/history", views.product_display_history, name="product-display-history"),
    path("product-display/restore", views.product_display_restore, name="product-display-restore"),
    path("product-display/config", views.product_display_config, name="product-display-config"),
]
