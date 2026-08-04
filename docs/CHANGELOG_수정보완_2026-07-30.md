# VF-new 수정·보완 사항 (2026-07-30)

> **작성일:** 2026-07-30  
> **범위:** 전산 재고 / 입고 가능 / VF 재고 조사 / Vite 프록시  
> **상태:** 구현·로컬 검증 완료 (운영 배포 시 Django·Vite 재시작 필요)

---

## 1. 요약

| # | 영역 | 내용 | 상태 |
|---|------|------|------|
| 1 | Vite 프록시 | `/api/master/*` 를 미기동 Go(:5177) → Django(:5176) 복구 | ✅ |
| 2 | VF 재고 조사 | 마스터 API 실패 시에도 재고 목록 표시 | ✅ |
| 3 | 입고 가능 | 일수 자유 선택 (1~365) | ✅ |
| 4 | 입고 가능 | 발주서 물량 반영 비중 (%) | ✅ |
| 5 | 입고 가능 | 일 출고 = **최근 90일(3개월) 평균** + 급증 가중 40% | ✅ |
| 6 | 문서 | 본 파일 (수정·보완 기록) | ✅ |

---

## 2. 제품 마스터 / 재고 조사 로딩 불가 (프록시 502)

### 증상
- 캐시 삭제·강제 새로고침으로도 해결 안 됨
- VF 재고 조사 탭·제품 마스터 등 `/api/master/specs` 의존 화면 데이터 로딩 실패

### 원인
`frontend/client/vite.config.ts` Phase 3 시험 설정:

```
/api/master/*  →  http://127.0.0.1:5177  (Go)
```

Go 서버(:5177) 미기동 → **502 Bad Gateway**  
Django 직접 호출(`:5176/api/master/specs`)은 정상.

### 조치
- `/api/master` 프록시 대상을 **Django `:5176`** 으로 복구
- 개별 예외 규칙(sync/export/upload 등) 중복 제거, 단일 `/api/master` 규칙으로 단순화

### 관련 파일
- `frontend/client/vite.config.ts`

### 재발 방지
- Go 마스터 API를 다시 쓸 경우 **:5177 기동 확인 후** 프록시 전환
- Go 미기동 시 Django 폴백 유지

---

## 3. VF 재고 조사 탭 견고화

### 조치
- 화면 로딩 게이트: **재고(unified)만 필수** (`loading = isLoading`)
- 마스터(`/api/master/specs`)는 로케이션 보강·미등록 칸용 → 실패해도 목록 표시
- 마스터 지연/실패 시 안내 문구
- TS 정리: 미사용 `walkMode` 제거, `buildFullLocationSequence` 제네릭화

### 관련 파일
- `frontend/client/src/components/inventory/stock-survey-tab.tsx`

---

## 4. 입고 가능 탭 — 일수 자유 선택

### 이전
- 고정 옵션: 10 / 14 / 30일 + 「전체 선택」

### 이후
- **프리셋 토글:** 3, 4, 7, 10, 12, 14, 20, 30일
- **직접 입력:** 1~365일 임의 추가 (예: 5, 18, 45)
- 선택 칩 표시·제거 (최소 1개 유지)
- `localStorage` 키: `inboundSelectedPeriods`

### 관련 파일
- `frontend/client/src/components/inventory/inbound-availability-tab.tsx`

---

## 5. 입고 가능 탭 — 발주서 물량 반영 비중

### 목적
업로드한 입고 발주서의 확정(미입고) 수량을 **비율로 줄여** 입고 가능 상한을 조절

### UI
- 프리셋: 10% · 20% · 30% · 50% · 100%
- 직접 입력: 0~200%
- 슬라이더: 0~100%
- `localStorage` 키: `inboundOrderSharePercent`

### 공식
```
baseOrderIn  = 확정수량 (미입고 CSV면 확정 − 기입고)
orderIn      = round(baseOrderIn × 비중%)
입고가능     = min(gap, orderIn)
```

### 표시
- 요약 카드: 비중 ≠ 100% 이면 안내 배너
- 입고 비중 % = 입고가능금액 ÷ **발주금액(전체)** (상한에만 비중 반영)

---

## 6. 입고 가능 — 일 출고 속도 (3개월 + 급증 가중)

### 요구
- 최근 **3개월 일 출고 평균**으로 일 출고 수량 산정
- 최근 출고가 급증할 때 **가중** 허용

### 백엔드 (`/api/inventory/unified`)
신규 필드:

| 필드 | 의미 |
|------|------|
| `outbound90dTotal` | 최근 90일 실출고 합(박스) |
| `avgDailyOutbound90d` | 합 ÷ 90 |

기존 14d / 30d / 60d 필드는 유지 (커버일수·임계값·급증 비교용).

### 프론트 SoT (`inboundPeriodMetrics.ts` · 스캐너 JS 동기화)

```
base   = avgDailyOutbound90d   (없으면 60 → 30 → 14)
recent = avgDailyOutbound14d   (없으면 30d)

if recent > base:
  일평균 = base + (recent − base) × 0.4   // TREND_WEIGHT = 0.4
  source = "90d+surge(14d)" 등
else:
  일평균 = base
  source = "90d" 등

hold      = round(일평균 × N)   // raw < 0.5 → 0
gap       = max(0, hold − 전산재고)
입고가능  = orderIn > 0 ? min(gap, orderIn) : gap
```

- **하락 시:** 3개월 평균 유지 (목표를 깎지 않음)
- **N일 선택과 무관:** 동일 일평균 사용 (기간 차이는 hold = avg×N 으로만 반영)

### 관련 파일
| 파일 | 역할 |
|------|------|
| `backend/sales_api/views.py` | 90일 집계·API 필드 |
| `frontend/client/src/lib/inboundPeriodMetrics.ts` | FE SoT |
| `frontend/client/public/js/inbound-period-metrics.js` | 스캐너 미러 (동일 공식 필수) |
| `frontend/client/src/types/enhanced-inventory.ts` | 타입 |
| `frontend/client/src/components/inventory/inbound-availability-tab.tsx` | UI·도움말·급증 표시 |

### UI
- 일평균 열: 「3개월 기준」 · source 툴팁 · 급증 시 **급증가중** 라벨

### 검증 (로컬)
- Django runserver 재시작 후 `avgDailyOutbound90d` 필드 존재 확인
- 예시: 14d≈0.79, 30d≈1.33, 90d≈1.06 등 품목 단위 응답 정상

---

## 7. FAQ — 14일 입고 비중 16% → 30일 65%인 이유

**일할 비례(16% × 30/14 ≈ 34%)로 안 늘어나는 것이 정상.**

### 입고 비중 정의
```
입고 비중 % = 입고가능금액 ÷ 발주금액
입고가능    = min(gap, 확정×비중)
gap         = max(0, hold − 전산재고)
hold        = round(일평균 × N)
```

### 급등 요인
1. **임계값 효과 (핵심)**  
   전산이 14일 hold를 넘기면 gap=0.  
   N을 30으로 늘리면 hold가 커져 **버티던 품목이 한꺼번에 gap 발생** → 합계 비중 점프.
2. **(구 공식) 일평균 소스 전환**  
   예전에는 N&lt;30 → 14d, N≥30 → 30d 를 썼음.  
   **현재는 90d(+급증) 단일 속도**로 통일되어 이 항목 영향은 감소.
3. **고단가·대량 발주 품목 가중**  
   금액 비중이라 큰 품목이 gap으로 전환되면 %를 크게 끌어올림.
4. **상한 포화**  
   N이 커질수록 gap이 확정 상한에 가까워져 비중이 올라감.

---

## 8. 운영·배포 체크리스트

- [ ] Django 프로세스 재시작 (90d 필드 반영)
- [ ] Vite dev 서버 재시작 (`vite.config.ts` 프록시 변경 시)
- [ ] 브라우저 일반 새로고침 후  
  - 제품 마스터 목록  
  - 전산 재고 → 입고 가능 (일평균 3개월·비중·일수)  
  - VF 재고 조사
- [ ] 스캐너 HTML이 `inbound-period-metrics.js` 를 로드하는지 확인 (캐시 시 강제 갱신)

### 선택 조정
| 항목 | 현재 | 변경 위치 |
|------|------|-----------|
| 급증 가산 비중 | 40% (`OUTBOUND_TREND_WEIGHT`) | `inboundPeriodMetrics.ts` + `inbound-period-metrics.js` **둘 다** |
| 기본 선택 일수 | `[10]` | `inboundSelectedPeriods` localStorage / 초기 state |
| 기본 발주 비중 | `100` | `inboundOrderSharePercent` localStorage |

---

## 9. 의도적으로 건드리지 않은 것

- 현재고 공식 (`inventory_stock.py`: baseline + 입고 − 실출고) — 변경 없음
- 재고 min/max/safety 임계값 산출 (여전히 30d 기반 백엔드 로직)
- coverDays (화면 커버일수) — 기존 14d 기준 유지
- Go(:5177) 마스터 서비스 본체 — 미기동 환경에서 프록시만 Django로 복구

---

## 10. 변경 파일 목록 (체크용)

```
frontend/client/vite.config.ts
frontend/client/src/components/inventory/stock-survey-tab.tsx
frontend/client/src/components/inventory/inbound-availability-tab.tsx
frontend/client/src/lib/inboundPeriodMetrics.ts
frontend/client/public/js/inbound-period-metrics.js
frontend/client/src/types/enhanced-inventory.ts
backend/sales_api/views.py
docs/CHANGELOG_수정보완_2026-07-30.md   ← 본 문서
```

---

*이 문서는 2026-07-30 세션의 수정·보완 사항을 재현·인수인계용으로 정리한 것입니다.*
