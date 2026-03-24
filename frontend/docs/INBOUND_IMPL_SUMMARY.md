# 입고 가능 수량 기능 구현 완료 요약

## 문서 정보
- **작성일**: 2025-12-25
- **버전**: v1.0 Final
- **상태**: 완료

---

## 1. 개요

입고 가능 수량 기능이 사양서([`INBOUND_AVAILABLE_QTY_SPEC.md`](INBOUND_AVAILABLE_QTY_SPEC.md))에 따라 완전히 구현되었습니다. 이 기능은 업로드한 발주서 파일을 기준으로 입고 가능 수량을 계산하고 표시합니다.

---

## 2. 구현 범위

### 2.1 백엔드 구현

#### 모델 (Models)
- **[`InboundOrderUpload`](backend/sales_api/models.py:271-285)**: 업로드 기록 관리
  - `id`: UUID (PK)
  - `uploaded_at`: 업로드 일시
  - `file_name`: 파일명
  - `file_type`: 파일 타입 (`vf_xlsx` | `unreceived_csv`)
  - `rows_total`, `rows_parsed`, `rows_skipped`: 처리 통계
  - `status`: 상태 (`success` | `failed`)
  - `error_message`: 에러 메시지

- **[`InboundOrderLine`](backend/sales_api/models.py:288-313)**: 발주 라인 데이터
  - `id`: UUID (PK)
  - `upload`: FK to InboundOrderUpload
  - `barcode`: 바코드 (indexed)
  - `order_no`: 발주번호 (indexed)
  - `order_status`: 발주 상태
  - `product_name`: 상품명
  - `product_no`: 상품번호
  - `ordered_qty`, `confirmed_qty`, `received_qty`: 수량 정보
  - `expected_date`: 입고 예정일

- **[`InboundPolicy`](backend/sales_api/models.py:316-328)**: 필터링 정책
  - `id`: UUID (PK)
  - `status_mode`: 필터 모드 (`exclude` | `include`)
  - `statuses`: 상태 목록 (JSON)
  - `updated_at`: 업데이트 일시

#### 시리얼라이저 (Serializers)
- **[`InboundOrderUploadSerializer`](backend/sales_api/serializers.py:36-38)**
- **[`InboundOrderLineSerializer`](backend/sales_api/serializers.py:41-44)**
- **[`InboundPolicySerializer`](backend/sales_api/serializers.py:47-52)**

#### API 엔드포인트 (Views)
- **[`POST /api/inventory/inbound/upload`](backend/sales_api/views.py:3853-3923)**: 파일 업로드
  - VF 발주서 업로드.xlsx 자동 감지
  - 발주서 미입고 물량.csv 자동 감지
  - 파일 파싱 및 데이터 저장
  - 현재고 차감 계산

- **[`GET /api/inventory/inbound/latest`](backend/sales_api/views.py:3926-3985)**: 최신 업로드 조회
  - 최신 업로드 정보 반환
  - 정책 필터링 적용
  - 발주 라인 데이터 반환

- **[`DELETE /api/inventory/inbound/latest`](backend/sales_api/views.py:3988-4005)**: 최신 데이터 초기화
  - 최신 업로드 및 관련 라인 삭제

- **[`GET /api/inventory/inbound/policy`](backend/sales_api/views.py:4008-4020)**: 정책 조회
  - 현재 필터링 정책 반환

- **[`POST /api/inventory/inbound/policy`](backend/sales_api/views.py:4023-4050)**: 정책 업데이트
  - 필터 모드 및 상태 목록 업데이트

#### URL 라우팅
- [`backend/sales_api/urls.py`](backend/sales_api/urls.py:36-38)에 추가됨

#### 데이터베이스 마이그레이션
- **[`0010_inboundorderline_inboundorderupload_inboundpolicy_and_more.py`](backend/sales_api/migrations/0010_inboundorderline_inboundorderupload_inboundpolicy_and_more.py)**

### 2.2 프론트엔드 구현

#### 메인 페이지
- **[`enhanced-inventory-page.tsx`](frontend/client/src/components/inventory/enhanced-inventory-page.tsx)**
  - 'inbound' 탭 추가
  - 입고 가능 수량 카드 추가 (5번째 카드)
  - 입고 가능 수량 합계 계산

#### 입고 가능 탭
- **[`inbound-availability-tab.tsx`](frontend/client/src/components/inventory/inbound-availability-tab.tsx)** (524 라인)
  - 파일 업로드 UI
  - 최신 업로드 정보 표시
  - 목표치 선택 (적정/최대 재고)
  - 발주 상태 필터링 정책 UI
  - 입고 가능 수량 요약 카드
  - 발주 데이터 테이블 (11 컬럼)
  - 바코드 렌더링 (JsBarcode)

#### 재고 테이블
- **[`inventory-table.tsx`](frontend/client/src/components/inventory/inventory-table.tsx)**
  - '입고 가능' 컬럼 추가
  - 입고 가능 수량 표시

---

## 3. 핵심 기능

### 3.1 입고 가능 수량 계산

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

### 3.2 바코드별 합산
- 같은 바코드의 발주 수량을 합산
- 현재고를 차감하여 최종 입고 가능 수량 계산

### 3.3 발주번호별 행 분리
- 같은 바코드라도 발주번호가 다르면 별도 행으로 표시
- `(barcode, orderNo)`가 표의 기본 키

### 3.4 발주 상태 필터링 정책
- **exclude 모드**: 지정된 상태를 제외
- **include 모드**: 지정된 상태만 포함
- 정책 변경 시 즉시 반영 (재업로드 불필요)

### 3.5 목표치 선택
- **적정 재고 (minStock)**: 기본값
- **최대 재고 (maxStock)**: 선택 가능

---

## 4. UI 구성

### 4.1 입고 가능 탭

#### 업로드 섹션
- 파일 선택 (VF xlsx / 미입고 csv 지원)
- 업로드 버튼
- 최신 업로드 정보 표시
- 데이터 초기화 버튼

#### 목표치 선택 섹션
- 라디오 버튼: 적정 재고 / 최대 재고
- 현재 선택에 대한 설명 텍스트

#### 정책 설정 섹션
- 필터 모드 선택 (exclude / include)
- 발주 상태 목록 관리 (추가/삭제)
- 정책 저장 버튼

#### 입고 가능 수량 요약
- 총 입고 가능 수량 표시
- 그라데이션 배경

#### 데이터 테이블 (11 컬럼)
1. 상품명
2. 발주수량 (우측 정렬)
3. 확정수량 (우측 정렬)
4. 입고수량 (우측 정렬)
5. 현재고 (우측 정렬)
6. 발주번호(바코드) (중앙 정렬)
7. 상품바코드(바코드) (중앙 정렬)
8. 로케이션(바코드) (중앙 정렬)
9. 입고가능수량(바코드) (중앙 정렬)
10. 입고예정일
11. 발주상태

### 4.2 바코드 표시
- **JsBarcode** 라이브러리 사용 (CODE128 포맷)
- SVG 렌더링
- 바코드 아래 텍스트 항상 표시
- 빈 값일 때 `-` 표시
- 중앙 정렬 (`items-center`)

### 4.3 재고 현황 탭
- **입고 가능** 카드 추가 (5번째)
- 입고 가능 수량 합계 표시
- 클릭 시 입고 가능 탭으로 이동

---

## 5. 파일 위치

### 백엔드
- **모델**: [`backend/sales_api/models.py`](backend/sales_api/models.py:271-328)
- **시리얼라이저**: [`backend/sales_api/serializers.py`](backend/sales_api/serializers.py:36-52)
- **뷰**: [`backend/sales_api/views.py`](backend/sales_api/views.py:3853-4050)
- **URL**: [`backend/sales_api/urls.py`](backend/sales_api/urls.py:36-38)
- **마이그레이션**: [`backend/sales_api/migrations/0010_inboundorderline_inboundorderupload_inboundpolicy_and_more.py`](backend/sales_api/migrations/0010_inboundorderline_inboundorderupload_inboundpolicy_and_more.py)

### 프론트엔드
- **메인 페이지**: [`frontend/client/src/components/inventory/enhanced-inventory-page.tsx`](frontend/client/src/components/inventory/enhanced-inventory-page.tsx)
- **입고 가능 탭**: [`frontend/client/src/components/inventory/inbound-availability-tab.tsx`](frontend/client/src/components/inventory/inbound-availability-tab.tsx)
- **재고 테이블**: [`frontend/client/src/components/inventory/inventory-table.tsx`](frontend/client/src/components/inventory/inventory-table.tsx)

### 문서
- **사양서**: [`docs/INBOUND_AVAILABLE_QTY_SPEC.md`](docs/INBOUND_AVAILABLE_QTY_SPEC.md)
- **진행 문서**: [`docs/INBOUND_AVAILABLE_QTY_IMPLEMENTATION_PROGRESS.md`](docs/INBOUND_AVAILABLE_QTY_IMPLEMENTATION_PROGRESS.md)
- **완료 문서**: [`docs/INBOUND_AVAILABLE_QTY_IMPLEMENTATION_COMPLETE.md`](docs/INBOUND_AVAILABLE_QTY_IMPLEMENTATION_COMPLETE.md)
- **UI 수정 문서**: [`docs/INBOUND_AVAILABLE_QTY_UI_FIX_COMPLETE.md`](docs/INBOUND_AVAILABLE_QTY_UI_FIX_COMPLETE.md)
- **이 문서**: [`docs/INBOUND_AVAILABLE_QTY_IMPLEMENTATION_SUMMARY.md`](docs/INBOUND_AVAILABLE_QTY_IMPLEMENTATION_SUMMARY.md)

---

## 6. 기술 스택

### 백엔드
- Django 4.2
- Django REST Framework
- openpyxl (Excel 처리)
- Python csv 모듈
- SQLite (개발용)

### 프론트엔드
- React 18
- TypeScript
- Tailwind CSS
- React Query (@tanstack/react-query)
- JsBarcode (바코드 렌더링)

---

## 7. 사용 방법

### 7.1 파일 업로드
1. 입고 가능 탭 접속
2. 파일 선택 버튼 클릭
3. VF 발주서 업로드.xlsx 또는 발주서 미입고 물량.csv 선택
4. 업로드 버튼 클릭

### 7.2 목표치 선택
1. 목표치 선택 섹션에서 원하는 모드 선택
2. 적정 재고 (minStock) 또는 최대 재고 (maxStock)

### 7.3 정책 설정
1. 필터 모드 선택 (exclude / include)
2. 발주 상태 목록 관리 (+ 상태 추가 버튼)
3. 불필요한 상태 삭제 (× 버튼)
4. 정책 저장 버튼 클릭

### 7.4 데이터 확인
1. 입고 가능 수량 요약에서 총합 확인
2. 테이블에서 상세 데이터 확인
3. 바코드 컬럼에서 바코드 이미지 확인

---

## 8. 알려진 제한사항

1. **바코드 렌더링**: JsBarcode는 CODE128 포맷을 사용합니다. 일부 특수 문자는 렌더링되지 않을 수 있습니다.
2. **파일 크기**: 대용량 파일 업로드 시 성능 저하가 발생할 수 있습니다.
3. **동시 업로드**: 동시에 여러 파일을 업로드하면 마지막 파일만 반영됩니다.
4. **상세 드로어/툴팁**: 현재 미구현 상태 (추후 확장 가능)

---

## 9. 다음 단계 (추후 확장)

1. **상세 드로어/툴팁 구현**
   - 발주번호, 입고예정일, 확정수량, 입고수량 상세 표시
   - 클릭 시 드로어 또는 툴팁 표시

2. **재고 이동 수량 데이터 소스**
   - 내부 이동 데이터 연동
   - 입고 가능 수량 계산에 반영

3. **4일 평균 출고 수량**
   - outbound 기반 데이터 연동
   - 예측 및 분석 기능 강화

4. **페이지네이션**
   - 대량 데이터 처리를 위한 페이지네이션 추가

5. **정렬 및 필터링**
   - 테이블 컬럼별 정렬
   - 추가 필터링 옵션

---

## 10. 테스트 체크리스트

### 백엔드
- [x] VF xlsx 파일 업로드 테스트
- [x] 미입고 csv 파일 업로드 테스트
- [x] 최신 업로드 조회 테스트
- [x] 정책 필터링 테스트
- [x] 데이터 초기화 테스트

### 프론트엔드
- [x] 파일 업로드 UI 테스트
- [x] 목표치 선택 테스트
- [x] 정책 설정 UI 테스트
- [x] 테이블 컬럼 순서 확인
- [x] 바코드 중앙 정렬 확인
- [x] 텍스트 항상 표시 확인
- [x] 입고 가능 수량 계산 확인

---

## 11. 문제 해결

### 11.1 TypeScript 타입 에러
- 바코드 타입 처리 (string vs undefined)
- 해결: 명시적 타입 캐스팅 및 null 체크

### 11.2 컬럼 순서
- 초기 구현 시 컬럼 순서가 올바르지 않음
- 해결: 사용자 피드백에 따라 11개 컬럼 순서 재배치

### 11.3 바코드 정렬
- 초기 구현 시 items-start 사용
- 해결: items-center로 변경하여 중앙 정렬

---

## 12. 결론

입고 가능 수량 기능이 사양서에 따라 완전히 구현되었습니다. 백엔드 API, 프론트엔드 UI, 데이터베이스 스키마가 모두 준비되었으며, 테스트를 통해 기능이 정상 작동함을 확인했습니다.

추후 확장 가능한 기능들(상세 드로어, 재고 이동 수량, 4일 평균 출고 수량 등)은 Phase 2에서 구현할 수 있습니다.

---

**문서 끝**
