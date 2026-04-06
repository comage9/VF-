from django.db import models
import uuid

class OutboundRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    outbound_date = models.DateField(db_index=True)
    product_name = models.CharField(max_length=255, db_index=True)
    quantity = models.IntegerField(default=0, null=True, blank=True) # None 허용
    sales_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True) # None 허용
    box_quantity = models.IntegerField(null=True, blank=True)
    unit_count = models.IntegerField(null=True, blank=True)
    category = models.CharField(max_length=100, db_index=True)
    client = models.CharField(max_length=255, blank=True, default='')
    barcode = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    status = models.CharField(max_length=50, default='완료')
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'outbound_records'
        indexes = [
            models.Index(fields=['outbound_date', 'category']), # 복합 인덱스
        ]

    def __str__(self):
        return f"{self.outbound_date} - {self.product_name}"

class InventoryItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255, db_index=True)
    category = models.CharField(max_length=100, default='기타')
    current_stock = models.IntegerField(default=0)
    minimum_stock = models.IntegerField(default=0)
    status = models.CharField(max_length=50, default='충분')
    barcode = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    last_restock = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inventory_items'

    def __str__(self):
        return self.name

class DataSource(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    type = models.CharField(max_length=50)  # 'csv', 'google_sheets'
    name = models.CharField(max_length=255)
    url = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_sync = models.DateTimeField(null=True, blank=True)
    sync_data = models.JSONField(null=True, blank=True)  # Store sync metadata or small data
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'data_sources'

    def __str__(self):
        return f"{self.type} - {self.name}"

class DeliveryDailyRecord(models.Model):
    date = models.DateField(primary_key=True)
    day_of_week = models.CharField(max_length=20, blank=True, default='')
    total = models.IntegerField(default=0)
    hourly = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'delivery_daily_records'

    def __str__(self):
        return str(self.date)


class DeliverySpecialNote(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    date = models.DateField(db_index=True)
    event_datetime = models.DateTimeField(null=True, blank=True, db_index=True)
    product_name = models.CharField(max_length=255, blank=True, default='', db_index=True)
    barcode = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    sku_id = models.CharField(max_length=100, blank=True, default='', db_index=True)
    quantity = models.IntegerField(null=True, blank=True)
    memo = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'delivery_special_notes'
        indexes = [
            models.Index(fields=['date']),
            models.Index(fields=['date', 'product_name']),
            models.Index(fields=['date', 'barcode']),
        ]

    def __str__(self):
        return f"{self.date} - {self.product_name or '-'}"


class BarcodeTransferRecord(models.Model):
    tracking_no = models.CharField(max_length=100, primary_key=True)
    barcode = models.CharField(max_length=100, db_index=True)
    product_name = models.CharField(max_length=255, blank=True, default='')
    category = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'barcode_transfer_records'

    def __str__(self):
        return self.tracking_no


class BarcodeMaster(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    barcode = models.CharField(max_length=100, unique=True, db_index=True)
    sku_id = models.CharField(max_length=100, blank=True, default='')
    product_name = models.CharField(max_length=255, blank=True, default='')
    category = models.CharField(max_length=255, blank=True, default='')
    location = models.CharField(max_length=255, blank=True, default='')
    lifecycle_status = models.CharField(max_length=20, blank=True, default='active', db_index=True)
    min_stock = models.IntegerField(default=0)
    max_stock = models.IntegerField(default=0)
    reorder_point = models.IntegerField(default=0)
    safety_stock = models.IntegerField(default=0)
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'barcode_master'
        indexes = [
            models.Index(fields=['barcode']),
        ]

    def __str__(self):
        return self.barcode


class InventoryBaselineUpload(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    as_of_date = models.DateField(db_index=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    file_count = models.IntegerField(default=0)
    file_names = models.JSONField(null=True, blank=True)
    total_rows = models.IntegerField(default=0)
    total_barcodes = models.IntegerField(default=0)

    class Meta:
        db_table = 'inventory_baseline_uploads'
        indexes = [
            models.Index(fields=['as_of_date', 'uploaded_at']),
        ]

    def __str__(self):
        return f"{self.as_of_date} ({self.uploaded_at})"


class InventoryBaselineItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    upload = models.ForeignKey(InventoryBaselineUpload, on_delete=models.CASCADE, related_name='items')
    barcode = models.CharField(max_length=100, db_index=True)
    product_name = models.CharField(max_length=255, blank=True, default='')
    location = models.CharField(max_length=255, blank=True, default='')
    quantity_box = models.IntegerField(default=0)

    class Meta:
        db_table = 'inventory_baseline_items'
        indexes = [
            models.Index(fields=['barcode']),
        ]

    def __str__(self):
        return f"{self.barcode} ({self.quantity_box})"


class InventoryReceiptUpload(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    file_name = models.CharField(max_length=255, blank=True, default='')
    file_hash = models.CharField(max_length=64, unique=True, db_index=True)
    rows_processed = models.IntegerField(default=0)
    rows_skipped = models.IntegerField(default=0)

    class Meta:
        db_table = 'inventory_receipt_uploads'

    def __str__(self):
        return f"{self.file_name} ({self.uploaded_at})"


class InventoryReceiptItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    upload = models.ForeignKey(InventoryReceiptUpload, on_delete=models.CASCADE, related_name='items')
    receipt_datetime = models.DateTimeField(db_index=True)
    receipt_date = models.DateField(db_index=True)
    barcode = models.CharField(max_length=100, db_index=True)
    quantity_box = models.IntegerField(default=0)
    product_name = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        db_table = 'inventory_receipt_items'
        indexes = [
            models.Index(fields=['barcode', 'receipt_date']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['barcode', 'receipt_datetime'],
                name='uniq_inventory_receipt_event',
            )
        ]

    def __str__(self):
        return f"{self.receipt_date} {self.barcode} (+{self.quantity_box})"


class MasterSpec(models.Model):
    product_name = models.CharField(max_length=255, unique=True, db_index=True)
    product_name_eng = models.TextField(blank=True, default='')
    mold_number = models.CharField(max_length=255, blank=True, default='')
    color1 = models.CharField(max_length=255, blank=True, default='')
    color2 = models.CharField(max_length=255, blank=True, default='')
    default_quantity = models.IntegerField(default=0)
    # FC 카테고리 매핑을 위한 필드
    sku_id = models.CharField(max_length=100, blank=True, default='', db_index=True)
    barcode = models.CharField(max_length=100, blank=True, default='', db_index=True)
    category_lg = models.CharField(max_length=255, blank=True, default='', db_index=True)  # 대분류
    category_md = models.CharField(max_length=255, blank=True, default='')  # 중분류
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'master_specs'

    def __str__(self):
        return self.product_name


class ProductionLog(models.Model):
    date = models.DateField(db_index=True)
    machine_number = models.CharField(max_length=100, blank=True, default='', db_index=True)
    mold_number = models.CharField(max_length=255, blank=True, default='')
    product_name = models.CharField(max_length=255, blank=True, default='', db_index=True)
    product_name_eng = models.TextField(blank=True, default='')
    color1 = models.CharField(max_length=255, blank=True, default='')
    color2 = models.CharField(max_length=255, blank=True, default='')
    unit = models.CharField(max_length=100, blank=True, default='')
    quantity = models.IntegerField(default=0)
    unit_quantity = models.IntegerField(default=0)
    total = models.IntegerField(default=0)
    status = models.CharField(max_length=20, default='pending', db_index=True)
    start_time = models.DateTimeField(null=True, blank=True)
    sort_order = models.IntegerField(default=0, null=True, blank=True, db_index=True)
    end_time = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'production_logs'
        indexes = [
            models.Index(fields=['date', 'machine_number']),
            models.Index(fields=['date', 'product_name']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['date', 'machine_number', 'mold_number', 'product_name', 'color1', 'color2', 'unit'],
                name='uniq_productionlog_key',
            )
        ]

    def __str__(self):
        return f"{self.date} {self.machine_number} {self.product_name}"


class MachineUser(models.Model):
    """기계별 사용자 (사원번호 + PIN 인증)"""
    machine_number = models.CharField(max_length=20, db_index=True)
    employee_number = models.CharField(max_length=20, db_index=True, null=True, blank=True)  # 사원번호 (1, 2, 3, 8, 12 등)
    user_pin = models.CharField(max_length=64)  # SHA-256 해시 저장
    user_name = models.CharField(max_length=50)
    is_active = models.BooleanField(default=True)
    failed_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'machine_users'
        unique_together = [['machine_number', 'user_name']]
        indexes = [
            models.Index(fields=['machine_number']),
            models.Index(fields=['employee_number']),
        ]

    def __str__(self):
        return f"{self.employee_number or 'N/A'} - {self.machine_number} - {self.user_name}"


class MachinePlan(models.Model):
    """AI 추천 계획 (Draft 상태 관리)"""
    STATUS_CHOICES = [
        ('draft', '임시저장'),
        ('recommended', '추천'),
        ('applied', '적용됨'),
        ('cancelled', '취소됨'),
    ]

    date = models.DateField(db_index=True)
    machine_number = models.CharField(max_length=20, db_index=True)
    user = models.ForeignKey(MachineUser, on_delete=models.SET_NULL, null=True, blank=True, related_name='plans')
    product_name = models.CharField(max_length=255)
    product_name_eng = models.TextField(blank=True, default='')
    mold_number = models.CharField(max_length=255, blank=True, default='')
    color1 = models.CharField(max_length=100)
    color2 = models.CharField(max_length=100, blank=True, default='')
    unit = models.CharField(max_length=20, default='BOX')
    quantity = models.IntegerField(default=0)
    unit_quantity = models.IntegerField(default=0)
    total = models.IntegerField(default=0)
    status = models.CharField(max_length=20, default='recommended', choices=STATUS_CHOICES, db_index=True)
    ai_reason = models.TextField(blank=True, default='')
    outbound_data = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'machine_plans'
        indexes = [
            models.Index(fields=['date', 'machine_number']),
            models.Index(fields=['machine_number', 'status']),
        ]

    def __str__(self):
        return f"{self.date} {self.machine_number} {self.product_name} ({self.status})"


class InboundOrderUpload(models.Model):
    """입고 발주서 업로드 기록"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    uploaded_at = models.DateTimeField(auto_now_add=True, db_index=True)
    file_name = models.CharField(max_length=255, blank=True, default='')
    file_type = models.CharField(max_length=20, choices=[
        ('vf_xlsx', 'VF 발주서 업로드.xlsx'),
        ('unreceived_csv', '발주서 미입고 물량.csv'),
    ], db_index=True)
    rows_total = models.IntegerField(default=0)
    rows_parsed = models.IntegerField(default=0)
    rows_skipped = models.IntegerField(default=0)
    status = models.CharField(max_length=20, choices=[
        ('pending', '대기'),
        ('success', '성공'),
        ('failed', '실패'),
    ], default='pending')
    error_message = models.TextField(null=True, blank=True)

    class Meta:
        db_table = 'inbound_order_uploads'
        ordering = ['-uploaded_at']
        indexes = [
            models.Index(fields=['-uploaded_at']),
            models.Index(fields=['file_type']),
        ]

    def __str__(self):
        return f"{self.file_name} ({self.uploaded_at})"


class InboundOrderLine(models.Model):
    """입고 발주서 상세 라인"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    upload = models.ForeignKey(InboundOrderUpload, on_delete=models.CASCADE, related_name='lines')
    barcode = models.CharField(max_length=100, db_index=True)
    order_no = models.CharField(max_length=100, db_index=True)
    order_status = models.CharField(max_length=100, blank=True, default='')
    product_name = models.CharField(max_length=255, blank=True, default='')
    product_no = models.CharField(max_length=100, blank=True, default='')  # 상품번호/SKU ID
    ordered_qty = models.IntegerField(default=0)  # 발주수량 (표시용)
    confirmed_qty = models.IntegerField(default=0)  # 확정수량 (필수)
    received_qty = models.IntegerField(default=0)  # 입고수량 (없으면 0)
    expected_date = models.DateField(null=True, blank=True)  # 입고예정일
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inbound_order_lines'
        indexes = [
            models.Index(fields=['barcode']),
            models.Index(fields=['order_no']),
            models.Index(fields=['barcode', 'order_no']),
        ]

    def __str__(self):
        return f"{self.order_no} - {self.barcode}"


class InboundPolicy(models.Model):
    """입고 발주서 필터링 정책"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status_mode = models.CharField(max_length=20, choices=[
        ('exclude', '제외'),
        ('include', '포함'),
    ], default='exclude')
    statuses = models.JSONField(default=list)  # 문자열 배열
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inbound_policies'

    def __str__(self):
        return f"Policy ({self.status_mode})"


class FCInboundRecord(models.Model):
    """FC 입고 기록"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    inbound_date = models.DateField(db_index=True)
    sku_id = models.CharField(max_length=100, db_index=True)
    barcode = models.CharField(max_length=100, db_index=True)
    product_name = models.CharField(max_length=255, db_index=True)
    category = models.CharField(max_length=255, blank=True, default='')
    subcategory = models.CharField(max_length=255, blank=True, default='')
    color = models.CharField(max_length=100, blank=True, default='')
    quantity = models.IntegerField(default=0)
    supply_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0, null=True, blank=True)
    logistics_center = models.CharField(max_length=100, db_index=True, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'fc_inbound_records'
        indexes = [
            models.Index(fields=['inbound_date', 'category']),
            models.Index(fields=['inbound_date', 'logistics_center']),
        ]

    def __str__(self):
        return f"{self.inbound_date} - {self.product_name} ({self.logistics_center})"


class FCInboundFileUpload(models.Model):
    """FC 입고 엑셀 파일 업로드 이력"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    file_name = models.CharField(max_length=255, db_index=True)
    file_hash = models.CharField(max_length=64, db_index=True, unique=True)  # SHA-256 hash
    upload_date = models.DateTimeField(auto_now_add=True, db_index=True)
    records_processed = models.IntegerField(default=0)
    records_created = models.IntegerField(default=0)
    records_skipped = models.IntegerField(default=0)
    records_duplicate = models.IntegerField(default=0)
    status = models.CharField(max_length=20, default='completed')  # completed, failed, partial
    error_message = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'fc_inbound_file_uploads'
        ordering = ['-upload_date']

    def __str__(self):
        return f"{self.file_name} ({self.upload_date.strftime('%Y-%m-%d %H:%M')}) - {self.records_created} created"