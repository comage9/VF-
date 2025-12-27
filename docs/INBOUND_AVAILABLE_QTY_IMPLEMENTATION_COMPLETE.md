# 입고 가능 수량(발주/미입고) 기능 구현 완료

## 개요
[`INBOUND_AVAILABLE_QTY_SPEC.md`](INBOUND_AVAILABLE_QTY_SPEC.md)에 정의된 입고 가능 수량 기능이 성공적으로 구현되었습니다.

## 구현 완료 항목

### 1. 백엔드 구현

#### 1.1 모델 생성
**파일**: [`backend/sales_api/models.py`](backend/sales_api/models.py:271)

생성된 모델:
- **`InboundOrderUpload`**: 입고 발주서 업로드 기록
- **`InboundOrderLine`**: 입고 발주서 상세 라인 (발주번호별 분리)
- **`InboundPolicy`**: 입고 발주서 필터링 정책

#### 1.2 시리얼라이저 생성
**파일**: [`backend/sales_api/serializers.py`](backend/sales_api/serializers.py:36)

#### 1.3 API 뷰 생성
**파일**: [`backend/sales_api/views.py`](backend/sales_api/views.py:3853)

생성된 API 엔드포인트:
1. **`POST /api/inventory/inbound/upload`** - 파일 업로드 (VF xlsx / 미입고 csv 자동 판별)
2. **`GET /api/inventory/inbound/latest`** - 최신 데이터 조회 (정책 적용)
3. **`DELETE /api/inventory/inbound/latest`** - 최신 업로드 데이터 초기화
4. **`POST /api/inventory/inbound/policy`** - 정책 설정
5. **`GET /api/inventory/inbound/policy`** - 정책 조회

#### 1.4 URL 라우팅 추가
**파일**: [`backend/sales_api/urls.py`](backend/sales_api/urls.py:36)

#### 1.5 데이터베이스 마이그레이션
**파일**: [`backend/sales_api/migrations/0010_inboundorderline_inboundorderupload_inboundpolicy_and_more.py`](backend/sales_api/migrations/0010_inboundorderline_inboundorderupload_inboundpolicy_and_more.py)

### 2. 프론트엔드 구현

#### 2.1 입고 가능 탭 컴포넌트
**파일**: [`frontend/client/src/components/inventory/inbound-availability-tab.tsx`](frontend/client/src/components/inventory/inbound-availability-tab.tsx:1)

기능:
- 파일 업로드 UI (VF xlsx / 미입고 csv 지원)
- 최신 업로드 정보 표시
- 최신 업로드 데이터 초기화 기능
- 발주 상태 필터링 정책 설정 UI
- 입고 가능 수량 요약 카드
- 입고 발주서 데이터 테이블 (입고 가능 수량 > 0인 항목만 표시)
- 바코드 SVG 렌더링 (JsBarcode 사용)
  - 바코드: 가운데 정렬
  - 바코드 아래 텍스트: 가운데 정렬, 값이 없으면 '-' 항상 표시

**테이블 컬럼 순서**:
1. 상품명
2. 발주수량
3. 확정수량
4. 입고수량
5. 현재고
6. 발주번호(바코드)
7. 상품바코드(바코드)
8. 로케이션(바코드)
9. 입고가능수량(바코드)
10. 입고예정일
11. 발주상태

**정렬 규칙**:
- 수량 컬럼(2-5): 우측 정렬 유지
- 바코드 컬럼(6-9): 가운데 정렬 (items-start)
- 나머지 컬럼: 좌측 정렬

#### 2.2 인벤토리 페이지 탭 추가
**파일**: [`frontend/client/src/components/inventory/enhanced-inventory-page.tsx`](frontend/client/src/components/inventory/enhanced-inventory-page.tsx:1)

변경 사항:
- `ActiveTab` 타입에 `'inbound'` 추가
- 탭 목록에 '📥 입고 가능' 탭 추가
- 탭 컨텐츠에 `<InboundAvailabilityTab />` 렌더링

#### 2.3 인벤토리 테이블 컬럼 추가
**파일**: [`frontend/client/src/components/inventory/inventory-table.tsx`](frontend/client/src/components/inventory/inventory-table.tsx:1)

변경 사항:
- `InboundOrderLine` 인터페이스 추가
- 입고 발주서 데이터 조회 쿼리 추가
- 바코드별 입고 가능 수량 맵 생성
- '입고 가능' 컬럼 추가 (현재고 고려)
- 컬럼 순서: 현재재고 → 입고 가능 → 최소재고

#### 2.4 요약 카드 추가
**파일**: [`frontend/client/src/components/inventory/enhanced-inventory-page.tsx`](frontend/client/src/components/inventory/enhanced-inventory-page.tsx:619)

변경 사항:
- 카드 레이아웃을 4열에서 5열로 변경
- '입고 가능' 요약 카드 추가
- 클릭 시 입고 가능 탭으로 이동

## 핵심 기능 구현 상세

### 입고 가능 수량 산식

#### VF 발주서 업로드.xlsx
```
inboundAvailableQty = confirmedQty - currentStock
```

#### 발주서 미입고 물량.csv
```
inboundAvailableQty = (confirmedQty - receivedQty) - currentStock
```

#### 공통 보정
```
inboundAvailableQty = max(0, inboundAvailableQty)
```

### 발주번호별 행 분리
- 동일 바코드라도 발주번호(`orderNo`)가 다르면 별도 행으로 표시
- `(barcode, orderNo)`를 기본 키로 사용

### 바코드 포맷 처리
- 바코드는 문자열로 취급 (선행 0 손실 방지)
- 공백/개행 제거 후 저장

### 발주 상태 필터링 정책
- `statusMode='exclude'`: 지정된 상태 목록 제외
- `statusMode='include'`: 지정된 상태 목록만 포함
- 정책 변경 시 재업로드 없이 즉시 반영

### 데이터 필터링
- 입고 가능 수량이 0보다 큰 바코드만 테이블에 표시
- 필터링된 항목만 요약 카드에 반영

### 바코드 표시
- SVG 바코드 렌더링 (JsBarcode 라이브러리 사용)
- 바코드: 가운데 정렬
- 바코드 아래 텍스트: 가운데 정렬, 값이 없으면 '-' 항상 표시
- 텍스트는 항상 중앙 정렬

## 파일 위치 요약

### Backend
- [`backend/sales_api/models.py`](backend/sales_api/models.py:271) - 모델 정의
- [`backend/sales_api/serializers.py`](backend/sales_api/serializers.py:36) - 시리얼라이저
- [`backend/sales_api/views.py`](backend/sales_api/views.py:3853) - API 뷰
- [`backend/sales_api/urls.py`](backend/sales_api/urls.py:36) - URL 라우팅
- [`backend/sales_api/migrations/0010_inboundorderline_inboundorderupload_inboundpolicy_and_more.py`](backend/sales_api/migrations/0010_inboundorderline_inboundorderupload_inboundpolicy_and_more.py) - 마이그레이션

### Frontend
- [`frontend/client/src/components/inventory/inbound-availability-tab.tsx`](frontend/client/src/components/inventory/inbound-availability-tab.tsx:1) - 입고 가능 탭
- [`frontend/client/src/components/inventory/enhanced-inventory-page.tsx`](frontend/client/src/components/inventory/enhanced-inventory-page.tsx:1) - 인벤토리 페이지
- [`frontend/client/src/components/inventory/inventory-table.tsx`](frontend/client/src/components/inventory/inventory-table.tsx:1) - 인벤토리 테이블

## 다음 단계 (옵션)

### Phase 2 (옵션)
- 바코드 상세 드로어 (발주별 상세 정보)
- 정책 UI 개선
- 바코드별 합계 표시 (발주번호별 행 유지하면서)

### 기능 개선
- 입고 가능 수량이 목표치(min/max) 선택과 결합되는 UX 개선
- 재고 이동 수량 데이터 소스 연동

## 테스트 가이드

### 1. 백엔드 테스트
```bash
cd backend
source .venv/bin/activate
python manage.py migrate
python manage.py runserver
```

### 2. 파일 업로드 테스트
1. VF 발주서 업로드.xlsx 파일 업로드
2. 발주서 미입고 물량.csv 파일 업로드
3. 업로드 정보 확인 (파일명, 타입, 처리 건수)
4. 최신 업로드 데이터 초기화 테스트

### 3. 데이터 조회 테스트
1. `/api/inventory/inbound/latest` 호출
2. 응답 데이터 확인 (발주 라인 목록)
3. 입고 가능 수량 계산 확인
4. 필터링 확인 (입고 가능 수량 > 0인 항목만 표시)

### 4. 정책 설정 테스트
1. `/api/inventory/inbound/policy` GET 호출 (현재 정책 확인)
2. `/api/inventory/inbound/policy` POST 호출 (정책 업데이트)
3. 필터링 확인 (상태 제외/포함)

### 5. 프론트엔드 테스트
1. 재고 현황 페이지 접속
2. '📥 입고 가능' 탭 클릭
3. 파일 업로드 테스트
4. 정책 설정 테스트
5. 입고 가능 수량 확인
6. 바코드 SVG 렌더링 확인
7. 재고 현황 탭에서 '입고 가능' 컬럼 확인

## 참고 문서
- [입고 가능 수량 기능 심층 설계서](INBOUND_AVAILABLE_QTY_SPEC.md)
- [프로젝트 설명서](PROJECT_DESCRIPTION.md)

## 구현 완료일
2025-12-25

## 구현자
Kilo Code (AI Assistant)
