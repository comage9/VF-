# VF 발주서 업로드.xlsx — 공통 컬럼 매핑

> Single source of truth. 코드: `backend/sales_api/vf_order_xlsx.py`  
> 클라이언트 미러: `frontend/client/public/barcode_scanner.html` (`buildColIndicesFromHeaders`)

## 파일

| 항목 | 값 |
|------|-----|
| 파일 예 | `VF 발주서 업로드.xlsx` |
| 시트 | `상품목록` |
| 대안 | `발주서 미입고 물량.csv` |

## 컬럼 (상품목록)

| Excel | 열 | 필드 | 용도 |
|-------|----|------|------|
| 발주번호 | A | order_no | 발주 바코드 / 필터 |
| 물류센터 | B | (참고) | |
| 입고유형 | C | (참고) | |
| 발주상태 | D | order_status | 표시 |
| 상품번호 | E | product_no | 정렬 |
| 상품바코드 | F | barcode | 상품 바코드 |
| 상품이름 | G | product_name | 표시명 |
| 발주수량 | H | ordered_qty | 표시용 |
| **확정수량** | I | **confirmed_qty** | **작업 수량 (필수)** |
| … | J–T | | |
| **입고예정일** | **U** | expected_date | 스캐너 표시 |
| 발주등록일시 | V | | |
| Xdock | W | | |

## 정책 (2026-07 확정)

1. **VF xlsx** 수량 = **확정수량** (≤0 또는 바코드 공란 행 스킵)
2. **미입고 CSV** (PO_SKU_LIST 포함) 필터 순서:
   - 물류센터 = **유원피에스** 만
   - **입고예정일 ≥ 오늘** (로컬 날짜, 이전이면 제외 · 파싱 실패 제외)
   - 수량 = **입고 가능 = max(0, 확정수량 − 입고수량)** (0 스킵)
3. 로케이션 = 파일에 **없음** → 스캐너 캐시 병합:
   - `GET /api/inventory/unified` (현재고 있는 스냅샷 품목)
   - `GET /api/inventory/barcode-master?limit=5000` (**로케이션 SoT**, 재고 0·baseline 미포함 기존 품목 포함)
4. 로케이션 없으면 스캐너 **수동 입력** (자동 확보 시 입력 UI 숨김)
5. 행 단위 유지 (수량만큼 복제하지 않음)
6. 발주번호 필터: 기본 **전체 선택**
7. 텍스트 붙여넣기 = 동일 헤더 보조 · **기본 진입은 파일 업로드**

## 발주서 미입고 물량.csv

| CSV 컬럼 | 필드 |
|----------|------|
| 발주번호 | order_no |
| 발주현황 | order_status |
| SKU ID | product_no |
| SKU 이름 | product_name |
| SKU Barcode | barcode |
| 발주수량 | ordered_qty |
| 확정수량 | confirmed_qty |
| **입고수량** | received_qty |
| 입고예정일 | expected_date |

- 인코딩: UTF-8 BOM
- 스캐너 표시 라벨: **입고 가능 수량**
- 합계 수량: 필터된 행의 **입고 가능 수량** 합

## 사용처

| 기능 | 경로 |
|------|------|
| 입고 가능 수량 업로드 | `POST /api/inventory/inbound/upload` |
| 바코드 스캐너 | `/departure/…` → `barcode_scanner.html` |
