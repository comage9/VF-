# 생산 계획 페이지 — 필터·KPI 한 줄 + 우측 생산 통계 테이블 구현 계획

> 작성일: 2026-07-11  
> 대상: `frontend/client/src/pages/production-plan.tsx`  
> 상태: **계획 문서 (구현 전)**  
> 참고 스크린샷: KPI 4카드(총 수량 / 총 단위수량 / 총 레코드 / 총 생산량) 2×2 배치

---

## 1. 요구사항 정리 (이해 확인)

| # | 요청 | 해석 |
|---|------|------|
| 1 | 사진의 테이블(KPI 카드 4개)을 **한 줄**로 | 현재 2×2 그리드 → **1행 4열**, 카드 높이·패딩 축소 |
| 2 | 생산 계획 리스트 **가로 폭 축소** | 데스크탑에서 리스트가 전체 폭을 쓰지 않음 |
| 3 | **우측**에 통계 테이블 | 리스트 옆 고정(또는 sticky) 생산 통계 패널 |
| 4 | **필터 · 생산 계획** 핵심 컨트롤 **한 줄** | **날짜 · 기계번호 · 검색 · 이월**을 동일 행에 배치 |
| 5 | 구현 전 **세세한 계획 문서** | 본 문서 승인 후 코드 수정 |

### 목표 레이아웃 (데스크탑 md+)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ sticky 필터 바 (indigo 틀고정)                                             │
│ 필터 · 생산 계획                                              [선택 N건]  │
│ ┌────────┐ ┌────────┐ ┌──────────────────┐ ┌────────┐   ← 핵심 1행     │
│ │ 날짜   │ │ 기계번호│ │ 검색              │ │ 이월   │                 │
│ └────────┘ └────────┘ └──────────────────┘ └────────┘                 │
│ [양식][업로드][붙여넣기][AI][신규][삭제…] … 액션 버튼 2행 (wrap 허용)    │
└──────────────────────────────────────────────────────────────────────────┘
┌──────────┬──────────┬──────────┬──────────┐  ← KPI 1행 4열
│ 총 수량  │ 단위수량 │ 레코드   │ 총 생산량 │     (컴팩트)
└──────────┴──────────┴──────────┴──────────┘
┌──────────────────────────────┬──────────────────────────────┐
│ 진행중 / 완료 / 재고 탭       │                              │
│                              │   생산 통계 테이블 (우측)      │
│  생산 계획 리스트 (좌측)      │   - 필터 연동 집계            │
│  ~58~65% 폭                  │   ~35~42% 폭                 │
│  테이블/기계 그룹             │   sticky 권장                 │
└──────────────────────────────┴──────────────────────────────┘
```

### 모바일

| 영역 | 동작 |
|------|------|
| 필터 핵심 1행 | `flex` + `overflow-x-auto` 로 가로 스크롤 **또는** 2×2 그리드 — **권장: sm 이상 1행, 좁은 폭은 2행** |
| KPI | md 미만 2×2, md+ 1×4 |
| 리스트 + 통계 | **세로 스택**: 리스트 위, 통계 아래 |

---

## 2. 현황 분석

### 2.1 현재 KPI (`summary` useMemo)

파일: `production-plan.tsx`  
데이터: `displayRows` 기준 (진행중/완료 탭·날짜·기계·검색 필터 반영)

| 카드 | 필드 | 계산 |
|------|------|------|
| 총 수량 | `totalQuantity` | Σ `quantity` |
| 총 단위수량 | `totalUnitQuantity` | Σ `unitQuantity` |
| 총 레코드 | `totalRecords` | `displayRows.length` |
| 총 생산량 | `totalOutput` | Σ (`unitQuantity` × `quantity`) |

배치: `grid grid-cols-2` (2×2), 카드 `p-4` + 큰 타이포.

### 2.2 현재 리스트

- 데스크탑: 전체 폭 테이블 (`hidden md:block`)
- 모바일: 카드 리스트 + DnD
- 탭: 진행 중 / 완료 / 재고 확인

### 2.3 현재 필터 바 (문제)

| 항목 | 현재 | 목표 |
|------|------|------|
| 제목 | `필터 · 생산 계획` 단독 행 | 유지 가능(얇게) 또는 인라인 |
| 날짜·기계·검색 | `grid-cols-3` **세로 스택**(라벨 위 + 컨트롤 아래) | **한 줄 가로 배치** |
| 이월 | 날짜 컬럼 **아래** (`mt-1` 버튼) | 날짜·기계·검색과 **같은 줄** 우측 |
| 양식·업로드·신규 등 | 별도 `flex-wrap` 행 | **2행**으로 유지 (액션 다수) |

관련 코드: `production-plan.tsx` 데스크탑 sticky 필터 (`grid grid-cols-1 md:grid-cols-3`).

### 2.4 기존 패널

- `OutboundStatsPanel`: **출고·재고 부족** 관점 통계 (생산 집계와 별개)
- 위치: 리스트 위, 모니터링 탭 노출
- 본 과제 **「생산 통계 테이블」과는 구분** — 출고 패널은 유지하되, 레이아웃 재배치 시 위치 조정 가능

---

## 3. UI 상세 설계

### 3.0 필터 · 생산 계획 — 핵심 컨트롤 한 줄 ⭐ 추가 요구

#### 배치 구조 (md+)

```
[필터 아이콘] 필터 · 생산 계획                    [선택 N건] [스크롤 고정 안내]

[날짜 Select ▾]  [기계번호 Select ▾]  [검색 Input …………]  [이월 버튼]
     ↑ flex-1 비율 또는 고정 폭        ↑ min-w / flex-1     ↑ shrink-0
```

| 컨트롤 | 권장 폭 | 비고 |
|--------|---------|------|
| 날짜 | `min-w-[160px] w-[180px]` ~ `flex-[1.1]` | SelectTrigger `h-9` |
| 기계번호 | `min-w-[120px] w-[140px]` ~ `flex-1` | 동일 높이 |
| 검색 | `flex-[1.4] min-w-[160px]` | placeholder 짧게: `품목·색상` |
| 이월 | `shrink-0 h-9` | 날짜 아래 제거, **우측 정렬 동행** |

#### 마크업 스케치

```tsx
{/* 제목 행 (얇게) */}
<div className="flex items-center justify-between ...">
  <div>필터 · 생산 계획</div>
  ...
</div>

{/* 핵심 필터 1행 */}
<div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-3">
  <div className="flex flex-col gap-1 min-w-0 sm:w-[180px]">
    <Label className="text-[11px] ...">날짜</Label>
    <SelectTrigger className="h-9 bg-white ..." />
  </div>
  <div className="flex flex-col gap-1 min-w-0 sm:w-[140px]">
    <Label className="text-[11px] ...">기계번호</Label>
    <SelectTrigger className="h-9 ..." />
  </div>
  <div className="flex flex-col gap-1 min-w-0 flex-1">
    <Label className="text-[11px] ...">검색</Label>
    <Input className="h-9 ..." />
  </div>
  <Button className="h-9 shrink-0 ...">이월 (어제 → 오늘)</Button>
</div>

{/* 액션 버튼 2행 — 기존 유지, wrap */}
<div className="flex flex-wrap gap-2">양식 · 업로드 · …</div>
```

#### 라벨 처리

| 옵션 | 내용 | 권장 |
|------|------|------|
| A | 각 컨트롤 위 작은 라벨 (`text-[11px]`) 유지 | **1차 권장** (접근성) |
| B | 라벨 숨기고 placeholder·aria-label만 | 높이 최소화 시 |
| C | 제목 행에 아이콘만, 라벨 인라인 | — |

`items-end` 로 Select/Input/Button **하단 정렬** → 라벨이 있어도 한 줄 정렬 유지.

#### sticky 바 높이

- 현재: 제목 + 3열 그리드(이월 포함 세로) + 액션 → **높음**  
- 변경 후: 제목 + **필터 1행** + 액션 1행 → **낮아짐** → 우측 통계 sticky `top` 값 재조정 용이  

#### 반응형

| 폭 | 동작 |
|----|------|
| `lg+` | 날짜·기계·검색·이월 **완전 1행** |
| `md` | 1행 유지, 검색 `flex-1`, 필요 시 가로 스크롤 `overflow-x-auto` |
| `sm 미만` | 날짜+기계 / 검색+이월 **2행** 허용 |

#### 하지 않을 것

- 양식·업로드·신규·삭제 등 **액션 버튼을 필터 1행에 억지로 넣지 않음** (줄바꿈·가독성 악화)  
- 액션은 **바로 아래 2행** 유지  

### 3.1 KPI 한 줄 (컴팩트)

**마크업 변경**

```tsx
// Before
<div className="grid grid-cols-2 gap-3 ...">

// After (권장)
<div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 ...">
```

**카드 축소 스펙**

| 속성 | 현재 | 변경 |
|------|------|------|
| 패딩 | `p-4` | `px-3 py-2` ~ `py-2.5` |
| 숫자 | `text-xl` | `text-lg` 또는 `text-base font-bold` |
| 라벨 | `text-xs` | `text-[10px]` ~ `text-xs` |
| 아이콘 | `w-8 h-8` | `w-6 h-6` 또는 숨김(md+) |
| 부제 | 유지 가능 | 1줄 truncate |

**색상**: 기존 그라데이션 유지 (파랑/초록/회색/앰버) — 인식성 유지.

### 3.2 메인 2열 레이아웃 (md+)

```tsx
{activeTab !== 'inventory' && (
  <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 items-start">
    {/* 좌: 리스트 */}
    <div className="w-full lg:flex-[1.6] min-w-0 space-y-3">
      {/* 진행중/완료 탭 + 테이블/모바일 카드 */}
    </div>
    {/* 우: 생산 통계 */}
    <aside className="w-full lg:flex-[1] lg:max-w-md lg:sticky lg:top-[/* 필터바 높이 보정 */] space-y-3">
      <ProductionStatsPanel ... />
    </aside>
  </div>
)}
```

비율 권장: **좌 약 62% : 우 약 38%** (`flex-[1.6]` / `flex-1` + `max-w-md`~`max-w-lg`).

**재고 확인 탭**: 통계 패널 숨김 또는 전체 폭 유지 (재고 UI가 넓음).

### 3.3 우측 「생산 통계 테이블」 내용

신규 컴포넌트 권장:  
`frontend/client/src/components/production/production-stats-panel.tsx`  
(또는 페이지 내 함수 컴포넌트로 시작 후 분리)

#### A. 요약 스트립 (선택, 작음)

- 진행중 / 완료 / 대기 건수  
- 필터 기간·기계 표시  

#### B. 상태별 집계 표

| 상태 | 건수 | 수량(박스) | 생산량(낱개 환산) |
|------|------|------------|-------------------|
| pending | … | … | … |
| started | … | … | … |
| ended | … | … | … |
| … | … | … | … |

#### C. 기계별 집계 표 (핵심)

| 기계 | 건수 | 수량 | 단위수량 합 | 생산량 | 진행중/완료 |
|------|------|------|-------------|--------|-------------|
| 1 | … | … | … | … | … |
| … | … | … | … | … | … |
| **합계** | … | … | … | … | … |

- 행 클릭 시 좌측 기계 필터 연동(옵션, Phase 2)

#### D. 품목 Top N (옵션)

| 순위 | 제품명 | 수량 | 생산량 |
|------|--------|------|--------|
| 1~10 | … | … | … |

데이터 소스: **동일 필터의 `displayRows` / `filteredRows`** (클라이언트 집계, 추가 API 불필요).

#### E. 기존 OutboundStatsPanel 배치

| 옵션 | 내용 |
|------|------|
| A (권장) | 우측 패널 **하단**에 접기 가능 섹션으로 유지 |
| B | 모니터링 탭 전용으로 리스트 위 유지 |
| C | 별도 탭 「출고 연동」 |

1차 구현: **A 또는 B** — 생산 통계와 시각적으로 분리.

### 3.4 리스트 쪽 조정

| 항목 | 내용 |
|------|------|
| 테이블 가로 스크롤 | 컬럼 다수 → `overflow-x-auto` 유지 |
| 선택 컬럼 축소(선택) | 영문명·롯트 등 우선순위 낮은 열 `hidden xl:table-cell` |
| sticky thead | 긴 목록 시 헤더 고정 권장 |
| DnD | 좌측 영역 내 동작 유지, 우측과 충돌 없음 |

### 3.5 sticky 필터와의 관계

- 필터 바: `z-30 sticky top-0` (기존)  
- 우측 통계: `lg:sticky top-[필터 대략 높이]`  
  - 1차: `top-24` ~ `top-28` 휴리스틱  
  - 2차: 필터 ref 높이 측정 후 동적 `top` (선택)

---

## 4. 데이터·상태 설계

### 4.1 집계 입력

```ts
// 기존
const summary = useMemo(() => ({ ... }), [displayRows]);

// 추가
const productionStats = useMemo(() => {
  // byStatus, byMachine, byProductTop
}, [displayRows]); // 또는 filteredRows (탭 무관 전체 필터 기준이면 filteredRows)
```

**권장 기준**

| 집계 | 기준 행 |
|------|---------|
| KPI 4카드 | `displayRows` (탭 반영) — 현행 유지 |
| 우측 통계 | `displayRows` 동일 (탭과 일치) **또는** `filteredRows` (진행+완료 통합 보기) |

1차: **KPI·우측 모두 `displayRows`** 로 일관성 확보.  
토글 「전체 필터 기준」은 Phase 2.

### 4.2 타입 스케치

```ts
type StatusBucket = {
  status: string;
  label: string;
  count: number;
  quantity: number;
  output: number;
};

type MachineBucket = {
  machineNumber: string;
  count: number;
  quantity: number;
  unitQuantity: number;
  output: number;
  activeCount: number;
  endedCount: number;
};

type ProductBucket = {
  productName: string;
  count: number;
  quantity: number;
  output: number;
};
```

### 4.3 API

- **1차: 신규 API 없음** (프론트 집계)  
- 향후 서버 집계 필요 시: `GET /api/production/stats?date=&machine=` (선택)

---

## 5. 구현 단계 (Phase)

### Phase 0 — 필터 한 줄 ⭐ 필수 (추가)

1. 날짜·기계번호·검색·이월을 **`flex` 1행**으로 재배치  
2. 이월 버튼을 날짜 컬럼 아래에서 **분리**해 같은 행 우측으로  
3. 라벨 `text-[11px]` + `items-end` 정렬  
4. 액션 버튼 행은 그 아래 유지  
5. sticky 바 전체 높이 축소 확인  

**완료 기준**: md+ 에서 날짜·기계·검색·이월이 한 줄로 보임.

### Phase 1 — KPI 한 줄 + 레이아웃 골격 ⭐ 필수

1. KPI `grid-cols-2 md:grid-cols-4`, 카드 컴팩트 클래스  
2. `activeTab !== 'inventory'` 구간에 `lg:flex-row` 래퍼  
3. 리스트를 좌측 컬럼으로 이동  
4. 우측 placeholder 카드 (`생산 통계` 제목만)

**완료 기준**: 데스크탑에서 KPI 1행, 리스트|빈 우측 패널 나란히 보임.

### Phase 2 — 생산 통계 테이블 ⭐ 필수

1. `ProductionStatsPanel` 컴포넌트  
2. 상태별·기계별 표 (컴팩트 `text-xs`, max-height + 스크롤)  
3. 합계 행  
4. 필터/탭 변경 시 숫자 즉시 갱신  

**완료 기준**: 기계 필터·날짜 변경 시 우측 표가 같이 바뀜.

### Phase 3 — 다듬기

1. 품목 Top 10  
2. 기계 행 클릭 → `setMachineFilter`  
3. 우측 sticky top 미세 조정  
4. 리스트 컬럼 반응형 숨김  
5. OutboundStatsPanel 위치 최종 결정  
6. 빈 데이터 / 로딩 UX  

### Phase 4 — 문서·회귀

1. `docs/OUTBOUND_DASHBOARD_README.md` 와 별도로 본 문서에 구현 완료 체크  
2. DnD·선택 삭제·상태 변경 동작 확인  
3. 모바일 모니터링/계획표 탭 깨짐 없음  

---

## 6. 파일 변경 예상

| 파일 | 변경 |
|------|------|
| `frontend/client/src/pages/production-plan.tsx` | KPI 그리드, 2열 레이아웃, stats useMemo 연결 |
| `frontend/client/src/components/production/production-stats-panel.tsx` | **신규** 우측 통계 UI |
| (선택) `docs/PRODUCTION_STATS_LAYOUT_PLAN.md` | 구현 후 상태 → 완료 로 갱신 |

백엔드 변경: **1차 없음**.

---

## 7. 스타일 가이드 (출고 페이지와 조화)

| 요소 | 스타일 |
|------|--------|
| 우측 카드 헤더 | indigo 계열 소제목 (`text-indigo-900 font-semibold text-sm`) |
| 표 | `text-xs`, 헤더 `bg-indigo-50/80 sticky top-0` |
| 합계 행 | `font-semibold bg-slate-50` |
| 테두리 | `border border-indigo-100 rounded-lg shadow-sm` |
| KPI | 기존 색 유지, 높이만 축소 |

---

## 8. 위험·주의

| 위험 | 완화 |
|------|------|
| 리스트 폭 축소로 컬럼 잘림 | `overflow-x-auto`, 비핵심 열 반응형 숨김 |
| sticky 필터 + sticky 우측 겹침 | z-index: 필터 30 > 통계 20 |
| DnD 성능 | 통계는 읽기 전용, DnD 영역 분리 |
| 재고 탭 | 2열 해제, 전체 폭 |
| 출고 패널과 혼동 | 제목 명확히 「생산 통계」 vs 「출고·재고」 |

---

## 9. 테스트 시나리오

1. 날짜 최신 / 특정일 / 전체 → KPI·우측 수치 일치  
2. 기계 필터 1대 → 기계 표 1행(+합계)  
3. 검색 품명 → 레코드·수량 감소 반영  
4. 진행중 ↔ 완료 탭 전환  
5. 데스크탑 리사이즈 1024 / 1440  
6. 모바일: KPI·리스트·통계 세로 스크롤  
7. 선택·삭제·상태변경·DnD 회귀  

---

## 10. 구현 순서 체크리스트

- [ ] **Phase 0: 필터 한 줄** (날짜 · 기계 · 검색 · 이월)  
- [ ] Phase 1: KPI 1행 컴팩트  
- [ ] Phase 1: 좌·우 flex 레이아웃  
- [ ] Phase 2: `productionStats` 집계  
- [ ] Phase 2: 상태·기계 표 UI  
- [ ] Phase 3: Top 품목, sticky, 클릭 연동  
- [ ] Phase 3: OutboundStatsPanel 배치 확정  
- [ ] Phase 4: 수동 QA  

---

## 11. 합의 포인트 (구현 전 확인)

아래만 확정되면 바로 코드 착수 가능합니다.

| # | 질문 | 권장 기본값 |
|---|------|-------------|
| 1 | 우측 통계 기준 행 | `displayRows` (탭 연동) |
| 2 | 출고 통계 패널 | 우측 하단 접기 또는 모니터링 상단 유지 |
| 3 | 모바일 KPI | md 미만 2×2, md+ 1×4 |
| 4 | 필터 한 줄 | **날짜·기계·검색·이월** (액션은 2행) ✅ 확정 |
| 5 | 기계 클릭 필터 | Phase 3 |
| 6 | 신규 API | 1차 없음 |

---

## 12. 다음 액션

1. 본 계획 검토·합의  
2. 합의 후 **Phase 1 → Phase 2** 순 구현  
3. 완료 시 본 문서 체크리스트 갱신 및 변경 이력 추가  

---

*문서 끝 — 구현은 사용자 승인 후 진행.*
