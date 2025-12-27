# 입고 가능 수량(발주/미입고) 기능 심층 설계서

## 0. 목적(Goal)

- `/sales/inventory/enhanced`에서 **"입고 가능 수량"(발주 기반 보충 가능 수량)**을 보여준다.
- 입고 가능 수량은 **업로드한 파일 스냅샷 1개(최신 업로드)**를 기준으로 계산한다.
  - 오늘 업로드하면 오늘 파일이 기준
  - 내일 업로드하면 내일 파일이 기준(이전 파일은 히스토리로 남길 수 있음)
- 같은 바코드라도 **발주번호가 다르면 별도 행으로 표시**한다(합산하지 않음).
- 화면에서 **적정 재고(minStock)** 또는 **최대 재고(maxStock)** 목표치를 선택할 수 있으며,
  - **기본 목표치는 적정 재고(minStock)**

---

## 1. 입력 파일(업로드) 종류 및 컬럼 매핑

### 1.1 VF 발주서 업로드.xlsx
- 파일: `sample/VF 발주서 업로드.xlsx`
- 시트: `상품목록`
- 확인된 헤더(발췌)
  - `발주번호`
  - `발주상태`
  - `상품바코드`
  - `상품이름`
  - `발주수량`
  - `확정수량`
  - `입고예정일`
  - `발주등록일시`

#### 매핑
- `orderNo` = `발주번호`
- `orderStatus` = `발주상태`
- `barcode` = `상품바코드`
- `productName` = `상품이름`
- `orderedQty` = `발주수량` (표시용)
- `confirmedQty` = `확정수량` (필수)
- `expectedDate` = `입고예정일` (표시용)

### 1.2 발주서 미입고 물량.csv
- 파일: `sample/발주서 미입고 물량.csv`
- 확인된 헤더(발췌)
  - `발주번호`
  - `발주현황`
  - `SKU Barcode`
  - `SKU 이름`
  - `발주수량`
  - `확정수량`
  - `입고수량`
  - `입고예정일`

#### 매핑
- `orderNo` = `발주번호`
- `orderStatus` = `발주현황`
- `barcode` = `SKU Barcode`
- `productName` = `SKU 이름`
- `orderedQty` = `발주수량` (표시용)
- `confirmedQty` = `확정수량` (필수)
- `receivedQty` = `입고수량` (필수)
- `expectedDate` = `입고예정일` (표시용)

### 1.3 바코드 포맷
- 기본: `R...` 형태가 많음
- 예외: `1000...` 같은 숫자형 바코드도 존재
- 정책
  - 바코드는 문자열로 취급(선행 0 손실 방지)
  - 공백/개행 제거 후 저장

---

## 2. 핵심 산식(입고 가능 수량)

### 2.1 재고 목표치(기본=적정 재고)
- 목표치 선택 옵션
  - `targetMode = "min"` (기본)
  - `targetMode = "max"`

- 목표 재고
  - `targetStock = minStock` when `targetMode=min`
  - `targetStock = maxStock` when `targetMode=max`

### 2.2 파일별 입고 가능 수량 정의(사용자 확정)

#### A) VF 발주서 업로드.xlsx (입고수량 컬럼이 없음)
- `inboundAvailableQty = confirmedQty - currentStock`

#### B) 발주서 미입고 물량.csv
- `inboundAvailableQty = (confirmedQty - receivedQty) - currentStock`

#### 공통 보정
- `inboundAvailableQty = max(0, inboundAvailableQty)`

### 2.3 표시용 추가 지표
- `gapToTarget = max(0, targetStock - currentStock)`
- 사용자가 원하는 의미(요청사항 반영)
  - **현재고를 확인하고**
  - **적정(min) / 최대(max) 목표치를 함께 보여준 후**
  - 목표치 대비 부족분을 확인하고
  - 발주 스냅샷 기반 입고 가능 수량을 확인

> 주의: 위 산식은 “발주가 존재한다”는 가정 하에서 현재고를 고려해 ‘얼마나 더 채울 수 있나’를 보는 목적이다.

---

## 3. 행 구성(발주번호별 분리)

### 3.1 기본 원칙
- 같은 바코드라도 **발주번호(orderNo)**가 다르면 **별도 행으로 표시**
- 즉, `(barcode, orderNo)`가 프론트 표의 기본 키가 됨

### 3.2 화면용 행(예시)
- 제품명
- 발주수량 / 확정수량
- 입고 수량(미입고 CSV에서만)
- 제조일자(있으면)
- 전산재고수량(currentStock)
- 재고 이동 수량(추후 확장: 내부 이동)
- 입고 가능 수량(핵심)
- 4일 평균 출고 수량(추후 확장: outbound 기반)
- 발주번호
- 바코드
- 로케이션
- 제품번호(상품번호/SKU ID)

---

## 4. 발주 상태 제외 규칙(설정 가능)

요구사항: “발주 상태에서 제외할 값 목록 - 설정은 할 수 있어야 한다”

### 4.1 설정 모델(서버)
- `InboundPolicy`
  - `statusMode`: `exclude` | `include` (초기값: exclude)
  - `statuses`: 문자열 배열

### 4.2 적용 위치
- 업로드 시 원문 상태(`orderStatus`)는 저장
- 집계/표시 API에서 정책을 적용하여 제외/포함
  - 정책 변경 시 재업로드 없이 즉시 반영 가능

---

## 5. 백엔드 설계(Django/DRF)

### 5.1 신규 모델(제안)

#### `InboundOrderUpload`
- `id`
- `uploaded_at`
- `file_name`
- `file_type` (`vf_xlsx` | `unreceived_csv`)
- `rows_total`, `rows_parsed`, `rows_skipped`
- `status` (`success` | `failed`)
- `error_message`

#### `InboundOrderLine`
- `id`
- `upload_id` (FK)
- `barcode` (indexed)
- `order_no` (indexed)
- `order_status`
- `product_name`
- `product_no` (상품번호/SKU ID)
- `ordered_qty`
- `confirmed_qty`
- `received_qty` (없으면 0)
- `expected_date` (nullable)
- `created_at`

#### `InboundPolicy`
- `id`
- `status_mode`
- `statuses` (JSON)
- `updated_at`

### 5.2 업로드 API
- `POST /api/inventory/inbound/upload`
  - multipart: `file`
  - 서버에서 확장자/헤더로 파일 종류 판별
  - 업로드 레코드 생성
  - 파싱 후 line 저장

### 5.3 최신 스냅샷 조회 API
- `GET /api/inventory/inbound/latest`
  - 최신 업로드 + 라인 목록 반환(페이지네이션 필요)

### 5.4 재고 현황과 결합 API(권장)
- 기존 `GET /api/inventory/unified` 결과에
  - `inboundTargetMode`(선택값은 프론트 state로 유지 가능)
  - `inboundAvailableQtyMinTarget` / `inboundAvailableQtyMaxTarget`
  - 또는 프론트에서 결합

> 구현 단순화를 위해 1차는 “프론트 결합”을 추천(백엔드 변경 최소화)

---

## 6. 프론트 설계(React)

### 6.1 탭 추가
- 기존 탭: `재고 현황 / 출고 분석 / 재고 설정`
- 추가 탭: `입고 가능`
  - 위치: “재고 설정” 옆(동일 레벨)

### 6.2 재고 현황 탭 변경
- 테이블 컬럼 추가: `입고 가능 수량`
- 상단 카드 추가: `입고가능`
- 상세 드로어/툴팁
  - 발주번호, 입고예정일, 확정수량, 입고수량(있으면)

### 6.3 입고 가능 탭 구성(요청 이미지 기준)
- 1) 업로드 섹션
  - 파일 선택(VF xlsx / 미입고 csv)
  - 업로드 버튼
  - 최신 업로드 정보 표시

- 2) 목표치 선택
  - 라디오/토글: `적정(minStock)`(기본) / `최대(maxStock)`

- 3) 테이블
  - 발주번호별 행
  - 바코드 렌더링(1D)

### 6.4 바코드 렌더링
- 현재 프로젝트에 JsBarcode 패키지 의존성은 없음.
- 옵션
  - (A) `jsbarcode` 추가
  - (B) 단순 텍스트/복사 버튼 + 서버에서 이미지 생성

권장(A): 프론트에서 SVG 렌더
- `npm i jsbarcode`
- `<svg ref>` + JsBarcode(ref, value, {format:'CODE128'})

---

## 7. 구현 단계(권장)

### Phase 1 (MVP)
- 백엔드
  - 모델 3개 + 업로드 API + latest 조회 API + policy API
- 프론트
  - 입고 가능 탭
  - 업로드 + 표(텍스트 바코드)
  - 재고 현황에 “입고 가능” 숫자만 컬럼/카드로 표시

### Phase 2
- 바코드 SVG 렌더링
- 상세 드로어(발주별 상세)
- 정책(상태 제외) UI 제공

---

## 8. 파일/폴더 제안(정확한 경로)

### Backend
- `backend/sales_api/models.py`
  - `InboundOrderUpload`, `InboundOrderLine`, `InboundPolicy` 추가
- `backend/sales_api/migrations/` 신규 마이그레이션
- `backend/sales_api/views.py`
  - 업로드/조회/정책 API 추가
- `backend/sales_api/urls.py`
  - 라우트 추가

### Frontend
- `frontend/client/src/components/inventory/enhanced-inventory-page.tsx`
  - 탭 추가 및 입고 가능 탭 연결
- `frontend/client/src/components/inventory/inbound-availability-tab.tsx` (신규)
  - 업로드/표/토글 등 전용 컴포넌트
- `frontend/client/src/components/inventory/inbound-order-drawer.tsx` (신규)
  - 상세 드로어
- `frontend/client/src/components/inventory/barcode-svg.tsx` (신규)
  - JsBarcode 렌더

---

## 9. 미확정(구현자 확인 필요)

- `입고 가능 수량`이 목표치(`min/max`) 선택과 결합되는 최종 UX
  - 현재 문서에서는 목표치 선택을 "표시" 기준으로 두고,
  - 입고 가능 산식은 사용자 확정(confirmed/received/currentStock)으로 적용

- `재고 이동 수량` 데이터 소스
  - 현재 시스템에 이동 데이터가 없으면 Phase2/추후로 분리
