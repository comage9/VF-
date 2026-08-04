import os
import sys
import django
from django.db import connections
from django.core.management.color import no_style

# Django 환경 설정
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.apps import apps
from django.db import transaction

def reset_sequences(db_name='default'):
    """PostgreSQL의 AutoField 시퀀스를 최신 ID 값으로 동기화합니다."""
    print(f"[{db_name}] AutoField 시퀀스 동기화 중...")
    connection = connections[db_name]
    with connection.cursor() as cursor:
        for app_config in apps.get_app_configs():
            for model in app_config.get_models():
                table_name = model._meta.db_table
                for f in model._meta.local_fields:
                    if isinstance(f, django.db.models.AutoField):
                        seq_name = f"{table_name}_{f.column}_seq"
                        print(f" - {table_name} 시퀀스 리셋 시도")
                        try:
                            cursor.execute(f"SELECT setval('{seq_name}', COALESCE((SELECT MAX({f.column}) FROM {table_name}), 1), false);")
                        except Exception as e:
                            print(f"   => 에러 (무시됨): {e}")

def migrate_data():
    models_to_migrate = []
    
    # 순서를 위해 앱/모델을 가져옴. 참조 무결성(ForeignKey)을 위해
    # 참조되는 모델이 먼저 마이그레이션 되어야 함
    # 이 프로젝트에서는 ForeignKey가 InboundOrderUpload -> InboundOrderLine, 
    # InventoryBaselineUpload -> InventoryBaselineItem, MachineUser -> MachinePlan 등이 있음.
    
    # 마이그레이션 할 모델을 하드코딩하거나 순서를 지정 (참조되는 모델 우선)
    target_models = [
        # auth (users) - if any
        apps.get_model('auth', 'User'),
        
        # sales_api
        apps.get_model('sales_api', 'OutboundRecord'),
        apps.get_model('sales_api', 'InventoryItem'),
        apps.get_model('sales_api', 'DataSource'),
        apps.get_model('sales_api', 'DeliveryDailyRecord'),
        apps.get_model('sales_api', 'DeliverySpecialNote'),
        apps.get_model('sales_api', 'BarcodeTransferRecord'),
        apps.get_model('sales_api', 'BarcodeMaster'),
        apps.get_model('sales_api', 'InventoryBaselineUpload'),
        apps.get_model('sales_api', 'InventoryBaselineItem'),
        apps.get_model('sales_api', 'InventoryReceiptUpload'),
        apps.get_model('sales_api', 'InventoryReceiptItem'),
        apps.get_model('sales_api', 'MasterSpec'),
        apps.get_model('sales_api', 'MasterColor'),
        apps.get_model('sales_api', 'MasterUnit'),
        apps.get_model('sales_api', 'MasterMold'),
        apps.get_model('sales_api', 'ProductUnitSpec'),
        apps.get_model('sales_api', 'ProductionLog'),
        apps.get_model('sales_api', 'MachineUser'),
        apps.get_model('sales_api', 'MachinePlan'),
        apps.get_model('sales_api', 'InboundOrderUpload'),
        apps.get_model('sales_api', 'InboundOrderLine'),
        apps.get_model('sales_api', 'InboundPolicy'),
        apps.get_model('sales_api', 'FCInboundRecord'),
        apps.get_model('sales_api', 'FCInboundFileUpload'),
        apps.get_model('sales_api', 'OutboundAnalysis'),
        
        # departure
        apps.get_model('departure', 'DepartureRecord'),
    ]

    for model in target_models:
        model_name = model.__name__
        print(f"\n[{model_name}] 마이그레이션 시작...")
        
        # PostgreSQL에 이미 데이터가 있는지 확인
        if model.objects.using('default').exists():
            print(f" => {model_name}: 대상 DB에 이미 데이터가 존재하여 생략합니다.")
            continue
            
        # SQLite에서 데이터 가져오기
        source_qs = model.objects.using('old_sqlite').all()
        total_count = source_qs.count()
        print(f" => 총 {total_count}건 복사 예정")
        
        if total_count == 0:
            continue
            
        batch_size = 5000
        instances = []
        count = 0
        
        # 데이터 순회
        for item in source_qs.iterator(chunk_size=batch_size):
            # 상태 변경 추적을 방지하기 위해 강제로 저장 상태 초기화
            item._state.adding = True
            item._state.db = 'default'
            instances.append(item)
            
            if len(instances) >= batch_size:
                with transaction.atomic(using='default'):
                    model.objects.using('default').bulk_create(instances)
                count += len(instances)
                print(f"   ... {count}/{total_count} 건 복사 완료")
                instances = []
                
        if instances:
            with transaction.atomic(using='default'):
                model.objects.using('default').bulk_create(instances)
            count += len(instances)
            print(f"   ... {count}/{total_count} 건 복사 완료")
            
        print(f"[{model_name}] 성공적으로 완료되었습니다.")
        
    print("\n모든 데이터 마이그레이션이 완료되었습니다.")
    reset_sequences('default')
    print("완료!")

if __name__ == "__main__":
    migrate_data()
