# 입고 가능 수량(발주/미입고) 기능 구현 진행 현황

## 개요
이 문서는 [`INBOUND_AVAILABLE_QTY_SPEC.md`](INBOUND_AVAILABLE_QTY_SPEC.md)에 정의된 입고 가능 수량 기능의 구현 진행 현황을 기록합니다.

## 구현 완료 항목

### 1. 백엔드 구현

#### 1.1 모델 생성
**파일**: [`backend/sales_api/models.py`](backend/sales_api/models.py:271)

생성된 모델:
- **`InboundOrderUpload`**: 입고 발주서 업로드 기록
  - `id`: UUID (PK)
  - `uploaded_at`: 업로드 일시
  - `file_name`: 파일명
  - `file_type`: 'vf_xlsx' | 'unreceived_csv'
  - `rows_total`, `rows_parsed`, `rows_skipped`: 처리 건수
  - `status`: 'pending' | 'success' | 'failed'
  - `error_message`: 에러 메시지

- **`InboundOrderLine`**: 입고 발주서 상세 라인
  - `id`: UUID (PK)
  - `upload`: FK to InboundOrderUpload
  - `barcode`: 바코드 (indexed)
  - `order_no`: 발주번호 (indexed)
  - `order_status`: 발주상태
  - `product_name`: 상품명
  - `product_no`: 상품번호/SKU ID
  - `ordered_qty`: 발주수량
  - `confirmed_qty`: 확정수량
  - `received_qty`: 입고수량 (없으면 0)
  - `expected_date`: 입고예정일
  - `created_at`: 생성일시

- **`InboundPolicy`**: 입고 발주서 필터링 정책
  - `id`: UUID (PK)
  - `status_mode`: 'exclude' | 'include'
  - `statuses`: 문자열 배열 (JSON)
  - `updated_at`: 업데이트일시

#### 1.2 시리얼라이저 생성
**파일**: [`backend/sales_api/serializers.py`](backend/sales_api/serializers.py:36)

생성된 시리얼라이저:
- `InboundOrderUploadSerializer`
- `InboundOrderLineSerializer`
- `InboundPolicySerializer`

#### 1.3 API 뷰 생성
**파일**: [`backend/sales_api/views.py`](backend/sales_api/views.py:3853)

생성된 API 엔드포인트:

1. **`POST /api/inventory/inbound/upload`**
   - 입고 발주서 파일 업로드
   - 파일 타입 자동 판별 (VF xlsx / 미입고 csv)
   - 파일 파싱 및 DB 저장
   - 응답: 업로드 ID, 파일 타입, 처리 건수

2. **`GET /api/inventory/inbound/latest`**
   - 최신 입고 발주서 데이터 조회
   - 정책 적용 (상태 필터링)
   - 응답: 발주 라인 목록 + 업로드 정보

3. **`POST /api/inventory/inbound/policy`**
   - 입고 발주서 필터링 정책 설정
   - 요청: statusMode, statuses
   - 응답: 업데이트된 정책

4. **`GET /api/inventory/inbound/policy`**
   - 현재 정책 조회
   - 응답: statusMode, statuses

#### 1.4 URL 라우팅 추가
**파일**: [`backend/sales_api/urls.py`](backend/sales_api/urls.py:36)

추가된 라우트:
- `path('inventory/inbound/upload', views.inbound_order_upload)`
- `path('inventory/inbound/latest', views.inbound_order_latest)`
- `path('inventory/inbound/policy', views.inbound_policy)`

#### 1.5 데이터베이스 마이그레이션
**파일**: [`backend/sales_api/migrations/0010_inboundorderline_inboundorderupload_inboundpolicy_and_more.py`](backend/sales_api/migrations/0010_inboundorderline_inboundorderupload_inboundpolicy_and_more.py)

마이그레이션 내용:
- `InboundOrderLine` 모델 생성
- `InboundOrderUpload` 모델 생성
- `InboundPolicy` 모델 생성
- 인덱스 추가 (barcode, order_no, uploaded_at, file_type)

### 2. 프론트엔드 구현

#### 2.1 입고 가능 탭 컴포넌트
**파일**: [`frontend/client/src/components/inventory/inbound-availability-tab.tsx`](frontend/client/src/components/inventory/inbound-availability-tab.tsx:1)

기능:
- 파일 업로드 UI (VF xlsx / 미입고 csv 지원)
- 최신 업로드 정보 표시
- 발주 상태 필터링 정책 설정 UI
- 입고 가능 수량 요약 카드
- 입고 발주서 데이터 테이블
  - 발주번호별 행 분리 (동일 바코드라도 별도 행)
  - 입고 가능 수량 계산 (파일 타입별 산식 적용)

#### 2.2 인벤토리 페이지 탭 추가
**파일**: [`frontend/client/src/components/inventory/enhanced-inventory-page.tsx`](frontend/client/src/components/inventory/enhanced-inventory-page.tsx:23)

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
  - 바코드 기준 입고 가능 수량 합계 표시
  - 클릭 시 입고 가능 탭으로 이동

---

## 추가 요구사항 반영 계획(요청: 2025-12-25)

### 목표
입고 가능 탭에서 사용자 의사결정에 필요 없는 값을 제거하고, 실제로 “입고 가능 수량이 있는 품목”만 빠르게 볼 수 있도록 표를 개편합니다.

### 확정된 요구사항(사용자 답변 기준)
1. **필터 적용 범위**
   - **입고 가능 탭(발주서 라인 테이블)에서만** `입고 가능수량 > 0` 필터 적용
2. **필터 기준(>0 판단)**
   - **바코드 기준 최종값**
     - `inboundAvailable(barcode) = max(0, Σ(lineBase) - currentStock(barcode))`
       - VF xlsx: `lineBase = confirmedQty`
       - 미입고 csv: `lineBase = max(0, confirmedQty - receivedQty)`
3. **필터 시 행 유지 규칙**
   - 해당 바코드가 필터에 포함되면 **그 바코드의 발주번호 행을 모두 표시**
4. **목표 부족분(목표치/타겟 모드) 관련 UI**
   - **불필요하므로 제거** (표 컬럼/계산/상태값 포함)
5. **입고 발주서 표 UI**
   - 두번째 스크린샷과 유사하게 **바코드 이미지가 포함된 레이아웃**으로 표시

### 확인이 필요한 사항(질문)
바코드 이미지를 어느 필드에 대해 렌더링할지 확정이 필요합니다.
- **Q1. 바코드 이미지로 표시할 대상**
  - **A안(추천)**: `SKU Barcode` 1개만 바코드 이미지로 표시
  - B안: `발주번호`도 바코드 이미지로 표시
  - C안: `로케이션`도 바코드 이미지로 표시(텍스트/바코드 혼합)

### 구현 범위(프론트엔드)
대상 파일: `frontend/client/src/components/inventory/inbound-availability-tab.tsx`

#### 1) “목표 부족분” 제거
제거 대상(예상):
- **UI**
  - 목표치 선택 UI(라디오/셀렉트 등)
  - 테이블 컬럼: `목표 부족분`
- **로직**
  - `calculateGapToTarget` 함수
  - 관련 상태값(`targetMode`) 및 이를 사용하는 계산/표시

#### 2) 입고 가능수량(바코드 기준) 계산을 단일 소스로 고정
현재 탭에서 바코드 기준 합산을 위해 이미 `inboundAvailableByBarcode` 맵을 만들고 있으므로 이를 “단일 소스”로 사용합니다.

- **정의**
  - `inboundAvailableByBarcode: Map<string, number>`
    - key: barcode
    - value: `max(0, Σ(lineBase) - currentStock)`

#### 3) `입고 가능수량 > 0` 필터 적용(입고 가능 탭 전용)
표 렌더링 직전에 `visibleInboundLines`를 만들어 필터합니다.

- **필터 규칙**
  - `includedBarcodeSet = { bc | inboundAvailableByBarcode.get(bc) > 0 }`
  - `visibleInboundLines = inboundLines.filter(line => includedBarcodeSet.has(line.barcode))`
  - 표시 행은 “발주번호별 행 분리”를 유지하므로, 같은 바코드면 여러 행이 그대로 남습니다.

- **UI 옵션(권장)**
  - 기본은 필터 ON(요구사항)
  - 필요하면 추후 “필터 해제(전체 보기)” 토글을 추가할 수 있도록 코드 구조만 열어둡니다.

#### 4) 표 UI를 스크린샷 형태로 개편(바코드 이미지 포함)
목표는 “바코드가 눈에 들어오는 작업표” 형태입니다.

- **컬럼(초안)**
  - 제품명
  - 확정수량
  - 입고 가능수량(바코드 기준 최종값)
  - 바코드 이미지(= SKU Barcode)
  - 발주번호(텍스트)
  - 로케이션/입고예정일/발주상태(필요한 것만 유지)

※ `목표 부족분` 컬럼은 제거합니다.

#### 5) 바코드 이미지 렌더링 방식(선택지)
두번째 스크린샷처럼 브라우저에서 바코드 이미지를 생성해야 합니다.

- **A안(추천): 프론트에서 JsBarcode로 SVG 생성**
  - 장점: 서버 변경 없음, 빠르게 적용 가능, CODE128로 알파뉴메릭 바코드 지원
  - 단점: 렌더링 비용이 있으므로 표 행이 많을 때 최적화 필요
  - 구현: `JsBarcode` 의존성 추가 후 `<svg ref>`에 렌더링

- **B안: 백엔드에서 바코드 PNG/SVG 생성 API 제공**
  - 장점: 렌더링 비용을 서버로 이동, 클라이언트는 이미지 로딩만 수행
  - 단점: 서버 구현/캐싱/보안 고려 필요

현재 요구사항 충족 목적에서는 **A안**을 기본으로 계획합니다.

#### 6) 성능/UX 고려
- 테이블 행이 100~500개 수준이면 SVG 렌더링이 부담될 수 있으므로,
  - 바코드 SVG 컴포넌트를 `React.memo`로 분리
  - 동일 barcode에 대한 렌더링 캐시(Map) 적용(가능하면)
  - 스크롤/리렌더 최소화를 위해 `key` 안정화 유지

### 테스트 시나리오
1. VF xlsx 업로드 후
   - `입고 가능수량 > 0`인 바코드가 있는지 확인
   - 입고 가능 탭에서 해당 바코드 행만 보이는지 확인
2. 미입고 csv 업로드 후
   - `(confirmed - received)` 기준으로 바코드별 합계가 맞는지 확인
3. 동일 바코드가 여러 발주번호로 존재할 때
   - 필터 포함 시 **해당 바코드의 모든 행이 표시**되는지 확인
4. 정책(include/exclude) 적용 후
   - 상태 필터가 적용된 데이터 기준으로 `입고 가능수량 > 0` 필터가 동작하는지 확인

### 작업 순서(권장)
1. `목표 부족분` 제거(상태/함수/컬럼/표현)
2. `inboundAvailableByBarcode` 기반으로 `visibleInboundLines` 필터 적용
3. 표 레이아웃 재구성 + 바코드 이미지 렌더링 도입
4. 업로드/정책/필터 스모크 테스트

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

### 목표치 부족분 계산
```
gapToTarget = max(0, targetStock - currentStock)
```
- `targetStock = minStock` when targetMode='min'
- `targetStock = maxStock` when targetMode='max'

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

## 다음 단계 (추후 확장)

### Phase 2 (옵션)
- 바코드 SVG 렌더링 (JsBarcode 패키지 추가)
- 상세 드로어 (발주별 상세 정보)
- 정책(상태 제외) UI 개선

### 기능 개선
- 입고 가능 수량이 목표치(min/max) 선택과 결합되는 UX 개선
- 바코드별 합계 표시 (발주번호별 행 유지하면서)
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

### 3. 데이터 조회 테스트
1. `/api/inventory/inbound/latest` 호출
2. 응답 데이터 확인 (발주 라인 목록)
3. 입고 가능 수량 계산 확인

### 4. 정책 설정 테스트
1. `/api/inventory/inbound/policy` GET 호출 (현재 정책 확인)
2. `/api/inventory/inbound/policy` POST 호출 (정책 업데이트)
3. 필터링 확인 (상태 제외/포함)

### 5. 프론트엔드 테스트
1. 재고 현황 페이지 접속
2. '📥 입고 가능' 탭 클릭
3. 파일 업로드 테스트
4. 목표치 선택 테스트 (적정/최대)
5. 정책 설정 테스트
6. 입고 가능 수량 확인
7. 재고 현황 탭에서 '입고 가능' 컬럼 확인

## 참고 문서
- [입고 가능 수량 기능 심층 설계서](INBOUND_AVAILABLE_QTY_SPEC.md)
- [프로젝트 설명서](PROJECT_DESCRIPTION.md)

## 구현 완료일
2025-12-25

## 구현자
Kilo Code (AI Assistant)
