# 마스터·재고 분류 불일치 문제 및 해결 방안

| 항목 | 내용 |
|------|------|
| 문서 버전 | 1.1 |
| 작성일 | 2026-07-16 |
| 상태 | **수정 적용** — 재고 분류 표시 = MasterSpec.category_lg 우선 (수량 계산 변경 없음) |
| 대표 사례 | 보노하우스 로코스 수납 바스켓 XS 6개 크림 1팩 |

---

## 1. 문제 요약

### 1.1 현상

| 화면 | 표시 분류 |
|------|-----------|
| **제품 마스터** (`/master`) | 대분류 **리빙박스 로코스** (정상 기대에 가깝음) |
| **재고(Enhanced)** 등 inventory 리스트 | **모던 플러스** (잘못 표시) |

- 동일 바코드·동일 품명인데 **마스터와 재고의 분류가 다름**.
- 사용자는 재고 쪽도 마스터와 같거나, 최소한 **로코스(리빙박스 로코스)** 계열로 보이기를 기대.

### 1.2 대표 SKU (사실 확인 완료)

| 항목 | 값 |
|------|-----|
| 품명 | 보노하우스 로코스 수납 바스켓 XS 6개 크림 1팩 |
| 바코드 | `R010638740001` |
| SKU | `18054289` |

---

## 2. 배경: 분류가 저장되는 곳이 여러 개임

VF 시스템에는 **이름이 비슷한 “분류” 필드가 서로 다른 테이블**에 있습니다.  
화면마다 **다른 테이블·다른 필드**를 읽기 때문에 불일치가 구조적으로 가능합니다.

### 2.1 데이터 모델

| 모델 / 테이블 | 필드 | 의미 | 주 사용처 |
|---------------|------|------|-----------|
| **MasterSpec** (`master_specs`) | `category_lg`, `category_md` | 대분류 / 중분류 | 제품 마스터 UI·API |
| **BarcodeMaster** (`barcode_master`) | `category` (단일 문자열) | 바코드 단위 분류 | 재고 unified 1순위 |
| **OutboundRecord** (`outbound_records`) | `category` (단일 문자열) | 출고 시트 분류 | 재고 unified 2순위(fallback) |
| **InventoryItem** (레거시) | `category` | 구 재고 | Enhanced 주력이 아님 |

### 2.2 화면별 데이터 소스

```
┌─────────────────────┐     GET /api/master/specs
│  제품 마스터 페이지   │ ◄── MasterSpec.category_lg / category_md
└─────────────────────┘

┌─────────────────────┐     GET /api/inventory/unified
│  재고 Enhanced 등    │ ◄── 아래 우선순위로 만든 flat "category"
└─────────────────────┘
         │
         ├─ 1) BarcodeMaster.category
         ├─ 2) OutboundRecord 바코드별 Max("category")
         └─ 3) "기타"
```

**핵심:** 마스터는 `MasterSpec`의 대·중분류, 재고는 `BarcodeMaster` + 출고 flat 분류.  
**`MasterSpec.category_lg`는 inventory_unified 응답에 직접 사용되지 않음.**

---

## 3. 원인 분석 (사실 기반)

### 3.1 대표 SKU DB 실측 (2026-07-16 조회)

| 출처 | 필드 | 실제 값 |
|------|------|---------|
| MasterSpec | `category_lg` | **리빙박스 로코스** |
| MasterSpec | `category_md` | 미분류 |
| MasterSpec | `product_name` | 보노하우스 로코스 수납 바스켓 XS 6개 크림 1팩 |
| BarcodeMaster | `category` | **빈 문자열** |
| BarcodeMaster | `product_name` | (로코스 품명 정상) |
| OutboundRecord | `category` 분포 | **리빙박스 로코스 1,036건** / **모던 플러스 1건** |

### 3.2 오류 출고 1건

| 항목 | 값 |
|------|-----|
| 출고일 | 2026-06-28 |
| 품명 | 보노하우스 국내제조 **템바보드 서랍장 6단 딥그린** … (로코스 아님) |
| category | **모던 플러스** |
| barcode | **R010638740001** (로코스 XS 크림 바코드) |
| box_quantity | 1 |
| is_estimated | False (실적 행) |

→ 단순 “분류 오타”가 아니라 **다른 제품에 로코스 바코드가 붙은 오매핑**에 가깝다.

### 3.3 코드 경로 (`inventory_unified`)

파일: `backend/sales_api/views.py`

**① 출고 분류 맵 생성 (바코드별 1개 값)**

```python
# BarcodeMaster.category 가 비어 있을 때 쓸 fallback
.annotate(category=Max("category"))  # 바코드 그룹별
```

**② 응답 category 결정**

```python
"category": (
    (master.category if (master and master.category) else "")  # master = BarcodeMaster
    or outbound_category_map.get(bc)
    or "기타"
)
```

여기서 `master`는 **MasterSpec이 아니라 BarcodeMaster** 이다.

### 3.4 `Max("category")`에 대한 오해

| 오해 | 실제 |
|------|------|
| 가장 **최근** 출고일의 분류 | ❌ |
| 가장 **많이** 나온 분류(최빈값) | ❌ |
| 문자열 비교 **최대값** | ✅ |

로코스 사례:

- 최빈값 → `리빙박스 로코스` (1,036건)
- `Max("category")` → **`모던 플러스`** (1건이지만 문자열이 “더 큼”)

따라서 **소수 오류 1건이 대표 분류로 승격**된다.

### 3.5 인과 사슬

```
1. 마스터 정답: category_lg = 리빙박스 로코스
2. 재고 API는 MasterSpec을 분류에 쓰지 않음
3. BarcodeMaster.category 공란 → fallback으로 출고 맵 사용
4. 출고에 바코드 오매핑 1건 (템바보드 + 모던 플러스)
5. Max(category) = 모던 플러스
6. unified / 재고 테이블에 "모던 플러스" 표시
```

### 3.6 원인이 아닌 것

- 마스터 페이지가 로코스를 모던으로 저장한 것이 아님
- 예측 보정(`is_estimated`) 데이터가 원인 아님 (오류 행은 실적)
- 품명 자체가 MasterSpec에서 틀린 것이 아님

### 3.7 범위 (시스템 전반)

- 동일 패턴(출고 분류가 바코드당 2종 이상): 조회 시점 기준 **약 265 바코드**
- 전부 화면 오류는 아니나, **BM.category 공란 + Max 사용**이면 같은 유형의 불일치 가능

---

## 4. 관련 파일 인덱스

| 구분 | 경로 | 역할 |
|------|------|------|
| 재고 분류 조립 | `backend/sales_api/views.py` → `inventory_unified` | BM / Max(출고) / 기타 |
| 마스터 모델 | `backend/sales_api/models.py` → `MasterSpec` | category_lg/md |
| 바코드 모델 | `models.py` → `BarcodeMaster` | category (flat) |
| 출고 모델 | `models.py` → `OutboundRecord` | category (flat) |
| 마스터 UI | `frontend/client/src/pages/product-master.tsx` | category_lg/md 표시 |
| 재고 UI | `frontend/.../inventory/inventory-table.tsx` 등 | flat `category` |
| 타입 | `frontend/.../types/enhanced-inventory.ts` | `category: string` |

---

## 5. 해결 방안

실서비스이므로 **데이터 수정**과 **로직 수정**을 분리하고, 가능하면 둘 다 적용하는 것을 권장한다.

### 5.1 방안 A — 오류 출고 데이터 정리 (즉시·국소)

**내용**

- `R010638740001` + `category='모던 플러스'` + 템바보드 품명 행:
  - 올바른 바코드로 수정, 또는
  - 잘못된 행 삭제

**효과**

- 이 SKU에 한해 Max 결과가 `리빙박스 로코스`로 돌아갈 가능성 큼
- BM이 비어 있어도 당장 화면이 정상화될 수 있음

**한계**

- 다른 바코드의 동일 패턴·향후 오매핑 재발 방지 못함
- `Max` 로직 자체는 그대로라 구조 문제는 남음

**권장:** 필수 (데이터 품질)

---

### 5.2 방안 B — 재고 분류에 MasterSpec.category_lg 우선 (구조 수정, 권장)

**내용** (`inventory_unified` 분류 우선순위 변경 제안)

```
1) MasterSpec.category_lg  (바코드 또는 품명 매칭)
2) BarcodeMaster.category
3) OutboundRecord: 최빈값(mode) 권장 — Max 금지 또는 최후순위
4) "기타"
```

**효과**

- 마스터와 재고 분류 **의도적으로 일치**
- 사용자가 요구한 “마스터와 동일 표시”에 가장 부합

**주의**

- MasterSpec에 바코드 공란·중복 바코드 있으면 매칭 규칙 필요 (현재 해당 SKU는 바코드 1:1)
- 출고 시트 분류와 마스터 대분류 이름이 다를 수 있음 (운영 정책: 마스터 우선이 맞는지 합의)

**권장:** 핵심 수정

---

### 5.3 방안 C — Outbound 집계를 Max → 최빈값(mode)으로 변경

**내용**

- `annotate(category=Max("category"))` 대신  
  바코드별 가장 많은 `category` 선택 (동률 시 최근일 등 규칙)

**효과**

- 로코스 사례처럼 **1건 오염이 전체를 덮는 문제** 완화
- 마스터와 완전 일치까지는 보장 안 함

**권장:** B와 함께 쓰거나, B 도입 전 단기 완화

---

### 5.4 방안 D — BarcodeMaster.category를 마스터와 동기화

**내용**

- 마스터 저장/일괄 수정/스냅샷 업로드 시  
  `BarcodeMaster.category ← MasterSpec.category_lg` (또는 lg/md 조합 문자열)
- 기존 공란 BM 일괄 백필 커맨드

**효과**

- 현재 1순위(BM)가 채워지면 출고 fallback을 덜 탐
- 스캐너·로케이션 SoT인 BM에 분류도 맞춤

**권장:** B와 병행 시 일관성↑

---

### 5.5 방안 E — 프론트에서 마스터 조인 표시

**내용**

- 재고 테이블이 unified `category` 대신 마스터 API 맵으로 대분류 표시

**한계**

- API/서버 단일 진실 공급원이 깨지기 쉬움
- 다운로드 CSV·다른 클라이언트와 불일치 가능

**권장:** 비권장 (서버 우선순위 B가 낫다)

---

## 6. 권장 실행 순서 (실서비스 안전)

| 단계 | 작업 | 위험 | 비고 |
|------|------|------|------|
| **1** | 방안 A: 오매핑 출고 1건 수정/삭제 | 낮음 | 해당 SKU 즉시 개선 |
| **2** | 방안 B: unified에 `MasterSpec.category_lg` 1순위 | 중 | 회귀: 분류 필터·집계 문구 확인 |
| **3** | 방안 C: fallback을 최빈값으로 | 낮~중 | Max 제거 |
| **4** | 방안 D: BM.category 백필 + 저장 시 동기화 | 중 | 선택 |
| **5** | 검증 | — | 아래 체크리스트 |

**이번 문서 시점:** 원인 확인만 완료. 위 단계는 아직 코드 미반영.

---

## 7. 구현 시 수정 포인트 (가이드)

### 7.1 `inventory_unified` (필수에 가깝음)

1. baseline 바코드 목록으로 `MasterSpec` 조회  
   - `barcode` 매칭 우선, 없으면 `product_name` (정책에 따라)
2. `price_by_barcode` 와 유사하게 `category_lg_by_barcode` 맵 구성
3. 응답:

```text
category =
  category_lg_by_barcode[bc]
  or BarcodeMaster.category
  or mode_outbound_category[bc]   # Max 대신
  or "기타"
```

### 7.2 데이터 수정 (A)

```text
대상: barcode=R010638740001 AND category='모던 플러스'
확인: product_name 이 템바보드인지
조치: 올바른 바코드로 UPDATE 또는 DELETE (운영 확인 후)
```

### 7.3 테스트 제안

| 케이스 | 기대 |
|--------|------|
| R010638740001 unified | category = 리빙박스 로코스 (또는 마스터 category_lg) |
| 마스터 동일 품목 | category_lg 와 unified category 일치 |
| BM.category 수동 설정 시 | 정책: 마스터 우선이면 BM보다 마스터가 이김 (문서화) |
| 출고만 있고 마스터 바코드 공란 | fallback 동작 확인 |

---

## 8. 검증 체크리스트 (수정 후)

- [ ] `GET /api/master/specs` 해당 품목: `category_lg` = 리빙박스 로코스  
- [ ] `GET /api/inventory/unified` 해당 바코드: `category` = 마스터와 동일 계열  
- [ ] Enhanced 재고 테이블 UI 동일  
- [ ] 출고 오매핑 1건 처리 여부 확인  
- [ ] 다른 샘플 바코드 2~3개 (BM 있음 / 없음 / 출고 다중 분류) 스모크  
- [ ] 재고 분류 필터·CSV 다운로드 깨지지 않음  

---

## 9. 요약

| 항목 | 내용 |
|------|------|
| **문제** | 마스터와 재고 리스트 분류 불일치 (로코스 → 모던 플러스) |
| **구조 원인** | 마스터=`MasterSpec.lg/md`, 재고=`BM.category`→`Max(출고.category)` |
| **데이터 원인** | 템바보드 출고 1건이 로코스 바코드 + 모던 플러스 |
| **증폭 원인** | `Max`가 최빈값이 아닌 문자열 최대 |
| **해결** | (A) 오매핑 수정 + (B) 마스터 대분류 우선 + (C) Max→최빈값 + (D) BM 동기화 권장 |

---

## 10. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-07-16 | 초안: 원인 사실 확인 및 해결 방안 문서화 (코드 수정 전) |
| 2026-07-16 | 적용: `inventory_unified` 분류 우선순위 = MasterSpec.category_lg → BM → 출고 최빈값 → 기타. 수량 공식 불변. |
