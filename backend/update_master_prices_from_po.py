import os
import glob
import pandas as pd
import datetime
import django

# Django 환경 초기화
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from sales_api.models import MasterSpec

def main():
    files = [
        "C:/Users/kis/AppData/Local/Temp/tg_1784030418994_PO_FOR_CONFIRM(133795630).xlsx",
        "C:/Users/kis/AppData/Local/Temp/tg_1784030419189_PO_FOR_CONFIRM(132935998).xlsx",
        "C:/Users/kis/AppData/Local/Temp/tg_1784030419162_PO_FOR_CONFIRM(135341596) (1).xlsx",
        "C:/Users/kis/AppData/Local/Temp/tg_1784030419171_PO_FOR_CONFIRM(134372670).xlsx"
    ]

    print("PO 엑셀 파일로부터 단가 분석 및 갱신을 시작합니다...")
    
    # 엑셀 내 모든 품목 데이터 수집
    collected_prices = {} # (sku_id, barcode, product_name) -> price
    
    for f in files:
        if not os.path.exists(f):
            print(f"오류: 파일을 찾을 수 없습니다: {f}")
            continue
            
        try:
            df = pd.read_excel(f, dtype=str)
            df = df.fillna("")
            
            # 필수 헤더 검증
            required = ['상품번호', '상품바코드', '상품이름', '매입가']
            missing = [c for c in required if c not in df.columns]
            if missing:
                print(f"경고: {os.path.basename(f)} 파일에 필수 컬럼 {missing}이 누락되어 스킵합니다.")
                continue
                
            for _, row in df.iterrows():
                sku_id = str(row['상품번호']).strip()
                barcode = str(row['상품바코드']).strip()
                product_name = str(row['상품이름']).strip()
                price_raw = str(row['매입가']).replace(",", "").strip()
                
                if not price_raw or price_raw.lower() == 'nan':
                    continue
                    
                try:
                    price = int(float(price_raw))
                except ValueError:
                    continue
                    
                if not barcode and not sku_id and not product_name:
                    continue
                    
                # 고유 키 구성
                key = (sku_id, barcode, product_name)
                # 동일 제품이 여러 번 나올 경우 최신/최대 매입가를 반영하기 위해 덮어씀
                collected_prices[key] = price
                
            print(f"성공: {os.path.basename(f)} 파싱 완료 (누적 고유 품목 수: {len(collected_prices)}개)")
        except Exception as e:
            print(f"오류: {os.path.basename(f)} 처리 중 에러 발생: {e}")

    # 데이터베이스 업데이트
    print("\n데이터베이스 단가 동기화를 진행합니다...")
    updated_count = 0
    skipped_count = 0
    not_found_count = 0
    
    today = datetime.date.today()
    
    # 캐시용 매핑 구성
    # sku_id -> spec, barcode -> spec, name -> spec
    specs = MasterSpec.objects.all()
    spec_by_sku = {s.sku_id.strip(): s for s in specs if s.sku_id}
    spec_by_barcode = {s.barcode.strip(): s for s in specs if s.barcode}
    spec_by_name = {s.product_name.strip(): s for s in specs if s.product_name}

    for (sku_id, barcode, product_name), new_price in collected_prices.items():
        spec = None
        
        # 1순위: 바코드로 매칭
        if barcode and barcode in spec_by_barcode:
            spec = spec_by_barcode[barcode]
        # 2순위: SKU ID로 매칭
        elif sku_id and sku_id in spec_by_sku:
            spec = spec_by_sku[sku_id]
        # 3순위: 상품명으로 매칭
        elif product_name and product_name in spec_by_name:
            spec = spec_by_name[product_name]
            
        if spec:
            old_price = spec.price or 0
            if old_price != new_price:
                spec.prev_price = old_price
                spec.price = new_price
                spec.price_changed_at = today
                spec.save()
                
                # 캐시 업데이트
                if spec.sku_id:
                    spec_by_sku[spec.sku_id.strip()] = spec
                if spec.barcode:
                    spec_by_barcode[spec.barcode.strip()] = spec
                if spec.product_name:
                    spec_by_name[spec.product_name.strip()] = spec
                    
                print(f"업데이트: [{spec.product_name}] {old_price}원 -> {new_price}원 (바코드: {spec.barcode})")
                updated_count += 1
            else:
                skipped_count += 1
        else:
            print(f"미등록 품목: [{product_name}] (SKU: {sku_id}, 바코드: {barcode}) -> 매입가 {new_price}원")
            not_found_count += 1
            
    print(f"\n동기화 완료:")
    print(f"- 업데이트(단가 변경): {updated_count}개 품목")
    print(f"- 건너뜀(단가 일치): {skipped_count}개 품목")
    print(f"- 미등록 품목(DB에 없음): {not_found_count}개 품목")

if __name__ == '__main__':
    main()
