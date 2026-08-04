# 입고 가능 탭: 발주서 없을 때 재고 기반 추천 표시

> **상태:** ✅ 구현 완료 (2026-07-24)  
> **작성일:** 2026-07-24  
> **경로:** `/inventory/enhanced` → **입고 가능** 탭  
> **대상 파일:** `frontend/client/src/components/inventory/inbound-availability-tab.tsx`  
> **관련:** [INBOUND_AVAILABLE_QTY_SPEC.md](INBOUND_AVAILABLE_QTY_SPEC.md) · 스캐너 기간 로직(README §5.3)

## 구현 요약 (완료)

| 항목 | 내용 |
|------|------|
| 발주 없음 모드 | `stockBasedRows` + `calcStockBasedMetrics` · 표 · 안내 배너 |
| 공식 | **스캐너와 동일 SoT** — 아래 §통일 |
| 정렬 | 권장 입고 내림차순 (`periodDays` 기준) |
| 합계 카드 | 재고 모드에서도 기간별 보유/권장 합 |
| 엑셀 | `재고기반_입고권장_YYYYMMDD.xlsx` · 열: 보유목표/입고권장 · SKU |
| 발주 있음 | `available = min(gap, 확정)` (구 `hold−(stock+base)` 제거) |

## 스캐너 · 입고 가능 탭 공식 통일 (2026-07-24)

| 파일 | 역할 |
|------|------|
| `src/lib/inboundPeriodMetrics.ts` | **SoT** (React 탭 import) |
| `public/js/inbound-period-metrics.js` | 스캐너 로드 (동일 로직 미러) |

```text
avg       = unified 14d/30d/60d (10·14일→14d 우선, 30일→30d 우선)
hold      = round(avg × N)   (raw < 0.5 → 0)
gap       = max(0, hold − stock)
available = orderIn > 0 ? min(gap, orderIn) : gap   // 권장=gap
extraOrder= max(0, hold − stock − orderIn)
```

- Enhanced(barcode-daily 가중) 일평균은 **기간 수량에 사용하지 않음** (숫자 불일치 방지)
- 로직 변경 시 TS와 public JS **둘 다** 수정

---

## 1. 목표

발주서(업로드 데이터)가 **없을 때** 현재처럼 빈 화면만 보이지 않고,

- 품목별 **전산 재고**와 **일평균 출고**를 기준으로
- **10일 / 14일 / 한 달(30일)** 각각
  - **보유 목표량** (`일평균 × N`)
  - **권장 입고량(부족분)** (`max(0, 목표 − 현재고)`)

을 표로 보여 준다.

### 확정 요구사항 (사용자 확인)

| 항목 | 결정 |
|------|------|
| 표시 수량 | **둘 다** — N일 보유 목표량 + 권장 입고량(부족분) |
| 품목 범위 | **출고 이력 있는 전체** 품목 |
| 발주서 있을 때 | **기존 동작 100% 유지** (새 분기만 추가) |

---

## 2. 현재 동작 (As-Is)

| 상태 | 화면 |
|------|------|
| 발주서 로드 중 | 스피너 |
| `visibleInboundLines.length === 0` | **「발주서 데이터가 없습니다. 파일을 업로드해주세요.」** 빈 화면 |
| 발주서 있음 | 표: 전산 · 일평균 · N일 보유 · N일 입고 가능 · 발주/확정/예정일/상태 등 |

핵심 코드:

```text
// calcPeriodMetrics(line, days)  — line(InboundOrderLine) 필수
//   holdQty        = round(avgDaily × days)
//   inboundAvailable = min(확정 기반 base, max(0, hold − (재고+base)))

// 888–891행: 발주 0건 → 빈 메시지
```

**문제:** 재고·출고 데이터(`/api/inventory/unified`, `/api/outbound/barcode-daily`)는 이미 탭에서 쓰고 있으나, **발주 행이 없으면 표 자체가 렌더되지 않음.**

---

## 3. 목표 동작 (To-Be)

```text
발주서 있음  →  기존 발주 기반 표 (변경 없음)
발주서 없음  →  재고 기반 추천 표
                 · 출고 이력 있는 품목만
                 · N일 보유 목표 + N일 입고 권장
                 · 안내 배너로 "업로드 없음 · 추정값" 명시
```

### 모드 구분 (라벨 주의)

| 모드 | 오른쪽 기간 열 의미 | 상한 |
|------|---------------------|------|
| **발주 있음** | **입고 가능** — 확정 수량 안에서 목표까지 채울 수 있는 양 | 확정/미입고 base |
| **발주 없음** | **입고 권장** — 목표까지 부족한 양 (추정) | 없음 (`max(0, hold−stock)`) |

스캐너 `hold` / `available=min(gap, orderIn)` 과 개념은 맞추되, **발주 없음 모드에는 orderIn이 없으므로 권장=gap**.

---

## 4. 데이터 소스 (백엔드 변경 없음)

| API | 이미 탭에서 사용 | 용도 |
|-----|------------------|------|
| `GET /api/inventory/unified` | ✅ | `currentStock`, `productName`, `category`, `barcode`, `avgDailyOutbound14d/30d/60d` |
| `GET /api/outbound/barcode-daily` | ✅ | Enhanced 일평균 (`calcEnhancedAvgDaily` / `getAvgDailyOutbound`) |
| `GET /api/inventory/inbound/latest` | ✅ | 발주 유무 판단 · 발주 모드 표 |

→ **프론트 단일 파일 수정**으로 충분.

---

## 5. 계산 공식

### 5.1 재고 기반 metrics (신규 `calcStockBasedMetrics`)

```text
avgDaily           = getAvgDailyOutbound(item, days)   // 기존 함수 재사용
holdQty            = round(avgDaily × days)            // N일 보유 목표
currentStock       = item.currentStock
recommendedInbound = max(0, holdQty − currentStock)    // 권장 입고(부족분)
```

- 과잉 재고면 권장 입고 = **0**
- Enhanced 가중치·14d/30d 폴백은 발주 모드와 **동일 경로** (`getAvgDailyOutbound`)

### 5.2 발주 모드 (기존 유지)

```text
holdQty          = round(avgDaily × days)
base             = 확정(또는 미입고 CSV: 확정−입고)
needToTarget     = max(0, hold − (stock + base))
inboundAvailable = min(base, needToTarget)
```

### 5.3 수치 예시

**품목 A:** 재고 5, 일평균 3

| 기간 | 보유 목표 | 권장 입고 |
|------|-----------|-----------|
| 10일 | 30 | 25 |
| 14일 | 42 | 37 |
| 30일 | 90 | 85 |

**품목 B:** 재고 50, 일평균 1

| 기간 | 보유 목표 | 권장 입고 |
|------|-----------|-----------|
| 10일 | 10 | **0** (과잉) |

---

## 6. 구현 설계

### 6.1 수정 파일

| 파일 | 내용 |
|------|------|
| `frontend/client/src/components/inventory/inbound-availability-tab.tsx` | 재고 모드 분기 · metrics · 표 · 합계 · (선택) 엑셀 |

백엔드·모델·API **변경 없음**.

### 6.2 발주 유무

```typescript
const hasInboundData = inboundLines.length > 0;
// UI 분기: hasInboundData ? 발주 표 : 재고 기반 표
// (로딩 중 분기는 기존 isLoadingInbound 유지)
```

### 6.3 `stockBasedRows` (useMemo)

필터 조건 (출고 이력 있는 전체):

1. `barcode` 비어 있지 않음  
2. 아래 중 하나:
   - `outboundDailyMap`에 일별 데이터 있음
   - `avgDailyOutbound14d > 0` 또는 `avgDailyOutbound30d > 0`

정렬 (기본):

- **권장 입고량 내림차순** (시급도 높은 품목 상위)  
  — 기준 기간: 현재 `periodDays`(첫 선택 기간) 또는 선택 기간 중 최대일
- 권장 0 품목: 기존 `hideZeroQty` 토글이 있으면 동일 정책 적용 검토

### 6.4 UI 구조

#### 안내 배너 (발주 없음 전용)

```text
업로드된 발주서가 없습니다.
품목별 재고·출고 속도 기준으로 {10/14/30}일 보유 목표량과 권장 입고량을 표시합니다.
```

#### 표 헤더 (발주 없음)

| 상품명 | 현재재고 | 일평균출고 | 10일 보유 | 10일 입고권장 | 14일 보유 | 14일 입고권장 | 30일 보유 | 30일 입고권장 | 바코드 |

- `selectedPeriods` 에 포함된 기간 열만 표시 (기존 기간 토글 재사용)
- **제외:** 발주수량 · 확정수량 · 입고예정일 · 발주상태 (의미 없음)

#### 표 헤더 (발주 있음) — 변경 없음

| 상품명 | 전산재고 | 일평균 | N일 보유 | N일 입고가능 | 발주… |

### 6.5 합계 카드

발주 없음일 때도 상단 합계 카드 표시:

- 기간별 **보유 목표 합**
- 기간별 **권장 입고 합**
- (선택) 표시 품목 수

`totalsByPeriod` 계산을 `stockBasedRows` 기준으로 분기 확장.

### 6.6 엑셀 내보내기 (권장 · 2차 가능)

| 모드 | 동작 |
|------|------|
| 발주 있음 | 기존 확정/입고가능 내보내기 유지 |
| 발주 없음 | `stockBasedRows` 기준: 상품명, 바코드, 재고, 일평균, 기간별 보유·권장 |

미구현 시: 발주 없음에서는 기존처럼 “내보낼 데이터 없음” 안내 가능 → **Phase 2**.

### 6.7 기간 선택 UI

- 기존 `selectedPeriods` / 10·14·30 토글 **그대로 사용**
- 재고 모드에서도 복수 기간 열 지원

---

## 7. 구현 단계 (권장 순서)

| 단계 | 작업 | 완료 기준 |
|------|------|-----------|
| **P0** | `calcStockBasedMetrics` + `stockBasedRows` + 빈 화면 분기 표 | 발주 없을 때 표 표시 |
| **P0** | 안내 배너 · 열 라벨 “입고 권장” | 발주 모드와 혼동 없음 |
| **P0** | 권장 내림차순 정렬 · 출고 이력 필터 | 요구사항 범위 충족 |
| **P1** | 합계 카드 재고 모드 합산 | 상단 숫자 일치 |
| **P1** | `hideZeroQty` 등 기존 토글 연동 | UX 일관 |
| **P2** | 엑셀 내보내기 재고 모드 | 다운로드 검증 |
| **P2** | (선택) 로케이션·대분류 열 | 운영 요청 시 |

---

## 8. 검증 체크리스트

1. [ ] 발주 0건 상태로 탭 진입 → **추천 표** (빈 메시지 아님)  
2. [ ] 10 / 14 / 30 복수 선택 → 기간별 보유·권장 열 표시  
3. [ ] `getAvgDailyOutbound` 결과가 발주 모드 동일 품목과 일치  
4. [ ] 권장 = `max(0, hold − stock)` · 과잉 재고 0  
5. [ ] 정렬: 권장 입고 내림차순  
6. [ ] 출고 이력 없는 품목 미표시  
7. [ ] 발주 업로드 후 **자동으로 발주 모드** 표  
8. [ ] 발주 모드 기존 입고가능·편집·업로드 회귀 없음  
9. [ ] (P1) 합계 카드  
10. [ ] (P2) 엑셀  

---

## 9. 리스크 · 주의

| 리스크 | 완화 |
|--------|------|
| 품목 수가 많아 표 느림 | 출고 이력 필터 · 가상 스크롤은 필요 시 후속 |
| “입고 가능” vs “입고 권장” 혼동 | 배너 + 열 라벨 명확 분리 |
| `InventoryItem` 타입에 `avgDailyOutbound30d` 누락 가능성 | 컴포넌트 로컬 타입/unified 응답 필드 확인 후 타입 보강 |
| Enhanced 일평균 0인데 14d 필드만 있는 경우 | 기존 `getAvgDailyOutbound` 폴백 경로 그대로 사용 |

---

## 10. 스캐너·재고 탭과의 정합

| 화면 | hold | 입고 쪽 숫자 |
|------|------|----------------|
| 스캐너 (기간 선택) | `avg × N` | `min(hold−stock, 확정)` |
| 입고 가능 · **발주 있음** | 동일 hold | `min(base, need)` ≈ 확정 상한 |
| 입고 가능 · **발주 없음** (본 계획) | 동일 hold | `max(0, hold−stock)` 권장 |

일평균 소스는 Enhanced/unified 를 공유하는 방향이 이상적 (이미 탭 내부 동일 함수).

---

## 11. 문서·README 반영 (구현 시)

- 본 문서 상태: `계획` → `구현 완료` + 검증일  
- README §5.x 또는 재고 절에 “입고 가능 · 발주 없을 때 재고 기반 추천” 한 단락  
- 문서 인덱스에 본 파일 링크  

---

## 12. 요약

| 질문 | 답 |
|------|-----|
| 무엇을? | 발주 없을 때 10/14/30 **보유 목표 + 권장 입고** 표 |
| 어디? | Enhanced → 입고 가능 탭 |
| 어떻게? | `inbound-availability-tab.tsx` 분기 + `calcStockBasedMetrics` |
| API? | 기존 unified + barcode-daily 만 |
| 발주 있을 때? | 기존 그대로 |

**다음 액션:** 계획 승인 후 **P0 구현** (표·metrics·정렬·배너).
