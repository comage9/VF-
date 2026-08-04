# 전산 재고 차이(불일치) 확인 — 기획 · UI · API 설계

| 항목 | 내용 |
|------|------|
| 문서 버전 | 1.0 |
| 작성일 | 2026-07-20 |
| 대상 화면 | `/inventory/enhanced` 내부 탭 추가 |
| 상태 | P0 구현 완료 (2026-07-20) |
| 관련 모듈 | `inventory_stock.py`, unified API, WMS zip 대조 |

---

## 1. 배경과 전제

### 1.1 현재고 로직 (변경하지 않음)

```
현재고(바코드 단위)
  = baseline(압축·스냅샷 업로드)
  − VF 출고(구글시트 동기화, 실적만)
  + 입고 업로드
  (+ 조정 전표가 있는 경우만 가산, 선택)
```

- **공식·로직은 정상**으로 본다.
- 문제는 “계산 오류”가 아니라 **전산 수량 vs 창고 실물(WMS) 차이**를 사람이 빠르게 보는 수단이 없다는 점이다.

### 1.2 업무 규칙 (고정)

| 규칙 | 설명 |
|------|------|
| **바코드 = 재고 단위** | 같은 제품명이어도 바코드가 다르면 **별도 SKU**. 출고도 바코드별로 잡힌다. |
| 상품명 합산 금지 | 리포트에서 “같은 이름끼리 합쳐 일치”로 문제를 지우지 않는다. |
| 스냅샷 유지 | 일상 운영은 baseline 재업로드로 맞추지 않는 것을 목표로 하되, **차이 확인 기능**은 업로드와 독립. |

### 1.3 목표

1. 차이나는 **바코드 목록**을 한 화면에서 확인한다.
2. 각 행에 **원인 분류(추정)** 를 붙인다 (입출고 0 감소 / 입고 후 잔차 등).
3. **CSV/인쇄용 리포트**로 제출·공유할 수 있다.
4. (선택) 알림 배지로 “미확인 차이 N건”을 탭에 표시한다.

**비목표 (이번 설계 범위 밖)**

- 공식 변경, 상품명 별칭으로 출고 강제 합치기
- WMS API 실시간 연동 (파일 업로드 대조로 시작)
- 자동으로 baseline 덮어쓰기

---

## 2. 제품 방향: 탭 + 리포트

권장: **`/inventory/enhanced` 안 5번째 탭**으로 배치하고, 동일 데이터로 **CSV 다운로드 · 요약 카드 인쇄**를 제공한다.

```
/inventory/enhanced
├── [재고 현황]     ← 기존 (전산 현재고 목록)
├── [3개월 분석]    ← 기존
├── [입고 가능]     ← 기존
├── [설정]          ← 기존
└── [차이 확인] NEW ← Variance / Reconcile 탭
```

| 채널 | 용도 |
|------|------|
| **탭 UI** | 일상 점검, 필터, 원인 드릴다운 |
| **CSV 리포트** | 주간 보고, 창고·관리 공유 |
| **배지/요약** | “불일치 N / |Δ| 합” 한눈에 |

외부 전용 메뉴(`/inventory/variance`)는 1차에서는 만들지 않는다. 탭 URL만 지원:

- `/inventory/enhanced?tab=variance` (또는 내부 state `activeTab === 'variance'`)

---

## 3. 정보 구조 (IA)

### 3.1 화면 구역

```
┌─────────────────────────────────────────────────────────────┐
│ A. 페이지 헤더: 제목 · 기준일 · WMS 대조일 · 새로고침        │
├─────────────────────────────────────────────────────────────┤
│ B. KPI 4카드: 대조 SKU수 · 일치 · 불일치 · |Δ|합 / 순Δ     │
├─────────────────────────────────────────────────────────────┤
│ C. 툴바: WMS 파일 업로드 · dry-run 대조 · CSV · 원인 필터  │
├─────────────────────────────────────────────────────────────┤
│ D. 원인별 칩 필터 (전체 / 입출고0감소 / 잔차 / 전산만 / …) │
├─────────────────────────────────────────────────────────────┤
│ E. 불일치 테이블 (바코드 단위, 기본 불일치만)               │
├─────────────────────────────────────────────────────────────┤
│ F. 행 클릭 → 우측 Drawer 또는 하단 패널: 구성 분해          │
│    base / 입고 / 출고 / 전산 / WMS / Δ / 일자별 이력        │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 핵심 엔티티 (바코드 1행)

| 필드 | 설명 |
|------|------|
| `barcode` | 재고 단위 (필수 키) |
| `productName` | 표시용 (합산 키 아님) |
| `baseQty` | baseline 수량 |
| `receiptQty` | as_of 이후 입고 합 |
| `outboundQty` | as_of 이후 실출고 합 |
| `ledgerQty` | 전산 현재고 `max(0, base+rcv-out[+adj])` |
| `wmsQty` | WMS 파일 수량 (**기본: 전 행 합산**, LPN 제거는 옵션) |
| `delta` | `wmsQty - ledgerQty` |
| `causeCode` | 원인 코드 (아래 4절) |
| `causeLabel` | 한글 라벨 |
| `causeHint` | 1~2문장 설명 |

### 3.3 원인 코드 (바코드 단위, 추정 규칙)

우선순위 위에서 아래로 첫 매칭.

| code | 라벨 | 판정 조건 (요약) |
|------|------|------------------|
| `NO_MOVEMENT_WMS_LOWER` | 입출고 기록 없이 창고만 감소 | `out=0, rcv=0, base>0, wms < ledger` |
| `NO_MOVEMENT_WMS_HIGHER` | 입출고 기록 없이 창고만 증가 | `out=0, rcv=0, wms > ledger` |
| `AFTER_RECEIPT_GAP` | 입고 반영 후 잔차 | `rcv>0, out=0, wms ≠ ledger` |
| `AFTER_OUTBOUND_GAP` | 출고 반영 후 잔차 | `out>0, \|delta\|≥1` (위 코드 미해당) |
| `LEDGER_ONLY` | 전산에만 있음 (WMS 0·없음) | `ledger>0, wms=0` |
| `WMS_ONLY` | WMS에만 있음 (baseline 밖 등) | `ledger=0, wms>0` |
| `OTHER` | 기타 잔차 | 그 외 |

**설명 문구 가이드 (UI 고정 카피)**

- `NO_MOVEMENT_WMS_LOWER`:  
  “기준일 이후 이 바코드의 시트 출고·입고 업로드가 없습니다. 전산은 기본 재고 그대로인데 창고 수량이 더 적습니다. (폐기·실사·시트 미반영 이동 등 확인)”
- `AFTER_RECEIPT_GAP`:  
  “입고는 전산에 반영됐지만 최종 수량이 창고와 1박스 이상 다릅니다.”
- `LEDGER_ONLY`:  
  “전산에는 재고가 있으나 이번 WMS 파일에 수량이 없습니다.”

> 동일 제품명 다른 바코드는 **정상 운영**이므로 원인 코드에 “바코드 중복/오류”를 넣지 않는다.

---

## 4. UI 디자인 (Toss / DESIGN-LANGUAGE)

### 4.1 원칙

- 액센트 `#721FE5` — **선택 탭·주요 CTA** 에만
- 경고/불일치는 **작은 배지·도트** (`#C85A54` 긴급, `#F59E0B` 주의)
- 일치는 녹색 도트 `#6B9B7A`
- 배경 페이지 `#FAFAFA`, 카드 `#FFFFFF`
- 숫자 강조: 수량 15~18px bold, 단위·라벨 10~12px secondary

### 4.2 탭 네비 (기존 enhanced 내부 nav 확장)

기존:

```
재고 현황 | 3개월 분석 | 입고 가능 수량 | 설정
```

추가:

```
재고 현황 | 3개월 분석 | 입고 가능 수량 | 차이 확인 | 설정
```

- 라벨: **차이 확인**
- description: `전산 vs 창고`
- 불일치 > 0 이면 라벨 옆 **빨간 도트 6px** 또는 숫자 배지 `N` (텍스트 11px)

탭 키: `variance`  
`ActiveTab = 'inventory' | 'analysis' | 'settings' | 'inbound' | 'variance'`

### 4.3 KPI 카드 (4열, Z-Layout)

| 카드 | 강조 | 내용 |
|------|------|------|
| 1 대조 대상 | 중립 그레이 | WMS 바코드 수 / 전산 바코드 수 |
| 2 일치 | 그린 틴트 | `matchCount` 종 |
| 3 불일치 | 코랄/경고 틴트 (얇은 보더) | `mismatchCount` 종 · 클릭 시 필터=불일치 |
| 4 수량 갭 | 앰버 | `absDeltaSum` 박스 · 보조 `netDelta` |

불일치 카드만 `border` 를 살짝 강조. 넓은 빨간 배경 금지.

### 4.4 툴바

```
[ WMS 파일 선택 (xlsx/zip) ]  [ 대조 실행 ]  [ CSV 다운로드 ]
일자: [ WMS 기준일 date ]   LPN 중복 제거 ☐ (기본 끔 · 여러 행=정상)
검색: [ 바코드 / 상품명 ]
```

- **대조 실행**: 서버 dry-run 비교 (DB 스냅샷 덮어쓰기 없음)
- 1차: 결과는 **세션/응답 즉시 표시** (저장 선택)
- 2차(옵션): “이 결과 저장” → 리포트 스냅샷 테이블

### 4.5 필터 칩

```
[ 전체 ] [ 불일치만 ● ] [ 입출고0 감소 ] [ 입고 후 잔차 ] [ 전산만 ] [ WMS만 ]
```

- 선택 칩: 배경 `#F0E8FF`, 글자 brand
- 기본값: **불일치만**

### 4.6 테이블 컬럼

| 컬럼 | 정렬 | 비고 |
|------|------|------|
| 바코드 | | mono font |
| 상품명 | | truncate + title |
| 기본 | right | baseQty |
| 입고 | right | receiptQty |
| 출고 | right | outboundQty |
| 전산 | right | **bold** ledgerQty |
| 창고(WMS) | right | bold wmsQty |
| Δ | right | 음수 코랄 / 양수 그린 / 0 그레이 |
| 원인 | | Badge + 짧은 라벨 |
| | | 행 클릭 → 상세 |

모바일: 바코드·전산·WMS·Δ·원인만 sticky 요약.

### 4.7 상세 패널 (Drawer)

```
바코드 R015858070008
클래식 수납정리함 …

┌ 구성 분해 ─────────────────────┐
│ 기본 재고 (as_of)     26        │
│ + 입고                 0        │
│ − 출고                 0        │
│ = 전산 현재고         26        │
│ 창고 WMS              22        │
│ Δ                     −4        │
└─────────────────────────────────┘

원인: 입출고 기록 없이 창고만 감소
설명: …

일자별 출고 (기준일 이후)
  (없음)

일자별 입고
  (없음)

[ CSV 행 복사 ]  [ 닫기 ]
```

### 4.8 빈 상태 / 에러

| 상태 | UI |
|------|----|
| WMS 미업로드 | 중앙 일러스트 대신 짧은 안내 + “WMS zip/xlsx 업로드 후 대조” CTA |
| 전원 일치 | 그린 체크 + “불일치 0건” |
| 파싱 실패 | 토스트 + errorId |

### 4.9 와이어 (텍스트)

```
┌─ 차이 확인 ──────────────────────────────────────────┐
│ 기준 스냅샷 2026-07-14 · WMS 2026-07-20 09:55        │
│                                                        │
│ [795 대조] [789 일치] [6 불일치] [|Δ| 11]              │
│                                                        │
│ [파일] [대조 실행] [CSV]   🔍 ________  ☑ LPN제거     │
│ (불일치만) (입출고0) (입고후) …                         │
│                                                        │
│ 바코드          상품   기본 입 출 전산 WMS  Δ  원인   │
│ R015858…       수납…  26  0  0  26  22  -4  입출고0  │
│ R000695…       슬림…   4  … …   3   0  -3  전산만   │
│ …                                                      │
└────────────────────────────────────────────────────────┘
```

---

## 5. API 설계

### 5.1 비교(미리보기) — 필수

```
POST /api/inventory/variance-check
Content-Type: multipart/form-data

files | file | xlsx : WMS 파일 (xlsx 또는 zip)
asOfDate (optional): WMS 스냅샷 일자 YYYY-MM-DD (표시·리포트용)
dedupeLpn (default false): 1|0  — 페이지별 여러 행은 중복이 아님, 전부 합산
```

**응답**

```json
{
  "success": true,
  "baselineAsOf": "2026-07-14",
  "wmsAsOf": "2026-07-20",
  "formula": "baseline + receipts - outbound",
  "parseStats": {
    "files": 1,
    "rows": 1201,
    "rowsUsed": 1197,
    "rowsLpnSkipped": 4,
    "barcodes": 795
  },
  "summary": {
    "compared": 800,
    "matchCount": 794,
    "mismatchCount": 6,
    "absDeltaSum": 11,
    "netDeltaSum": -11
  },
  "items": [
    {
      "barcode": "R015858070008",
      "productName": "…",
      "baseQty": 26,
      "receiptQty": 0,
      "outboundQty": 0,
      "ledgerQty": 26,
      "wmsQty": 22,
      "delta": -4,
      "causeCode": "NO_MOVEMENT_WMS_LOWER",
      "causeLabel": "입출고 기록 없이 창고만 감소",
      "causeHint": "…"
    }
  ]
}
```

- 기본 응답: **불일치 행만** (`includeMatches=1` 이면 전체).
- **baseline 덮어쓰기 없음.** DB 변경 없음 (순수 조회성 POST).

구현 참고: 기존 `inventory_reconcile.parse_wms_stock_quantity` + 현재고 집계 재사용.  
`wms-reconcile` 은 조정 전표 저장용(선택 기능)과 분리 — 1차 탭은 **check only**.

### 5.2 CSV 다운로드

```
POST /api/inventory/variance-check/export.csv
(동일 multipart 또는 직전 결과 id — 1차는 동일 파일 재업로드 + Accept/CSV)
```

또는 프론트에서 `items` 를 클라이언트 CSV 생성 (1차 권장, 서버 부하↓).

### 5.3 상세 이력 (행 클릭)

기존 진단 API 확장 또는:

```
GET /api/inventory/stock-diagnostics?barcode=R015858070008
```

일자별 출고·입고 반환 (이미 diagnostics에 daily 구조 존재).

### 5.4 (2차) 리포트 스냅샷 저장

```
POST /api/inventory/variance-reports   // 메타 + items JSON 저장
GET  /api/inventory/variance-reports
GET  /api/inventory/variance-reports/:id
```

주간 제출·감사 추적용. 1차 미구현 가능.

---

## 6. 프론트 구현 포인트 (기존 코드 정합)

| 파일 | 변경 |
|------|------|
| `enhanced-inventory-page.tsx` | `ActiveTab` 에 `variance` 추가, tabs 배열·렌더 분기 |
| `inventory/variance-check-tab.tsx` **NEW** | KPI·업로드·테이블·Drawer |
| `types/enhanced-inventory.ts` 또는 전용 타입 | VarianceItem, VarianceResponse |
| API client | `POST /api/inventory/variance-check` |

기존 탭 UI 패턴 유지:

- `border-b-2` + active `border-blue-500` / brand 정렬 시 `border-[#721FE5] text-[#721FE5]`
- KPI `Card` + `grid-cols-2 md:grid-cols-4`

### 6.1 상태

```ts
type VarianceState = {
  file: File | null;
  wmsDate: string;
  dedupeLpn: boolean;
  loading: boolean;
  result: VarianceResponse | null;
  filterCause: CauseCode | 'ALL' | 'MISMATCH';
  search: string;
  selectedBarcode: string | null;
};
```

### 6.2 접근성

- 테이블 `scope="col"`
- Δ 색만으로 구분하지 말고 `title`/`aria-label` 에 “전산 대비 창고 N박스 적음”
- 키보드: 행 Enter → Drawer

---

## 7. 리포트 제출 포맷 (CSV)

파일명: `inventory-variance_{wmsAsOf}_{createdAt}.csv`

```csv
barcode,product_name,base_qty,receipt_qty,outbound_qty,ledger_qty,wms_qty,delta,cause_code,cause_label,baseline_as_of,wms_as_of
R015858070008,...,26,0,0,26,22,-4,NO_MOVEMENT_WMS_LOWER,입출고 기록 없이 창고만 감소,2026-07-14,2026-07-20
```

상단 메타(선택): 별도 `*_summary.txt` 또는 CSV 첫 주석 행 비권장 → **화면 요약 + CSV 본문** 분리.

주간 보고 문구 템플릿:

```
[전산 재고 차이 리포트]
- 전산 기준일(baseline): {baselineAsOf}
- 창고 파일 일자: {wmsAsOf}
- 공식: baseline + 입고 − 출고 (바코드 단위)
- 일치: {matchCount} / 불일치: {mismatchCount}
- 절대 수량 갭 |Δ| 합: {absDeltaSum} 박스
- 상세: 첨부 CSV
```

---

## 8. 사용자 시나리오

### S1. 주간 점검

1. 재고 현황 → **차이 확인** 탭
2. 쿠팡 WMS “페이지별재고리스트” zip 선택
3. **대조 실행**
4. 불일치 6건 확인 → 원인 필터로 입출고0 만 보기
5. CSV 다운로드 → 팀에 공유

### S2. 단일 바코드 원인 확인

1. 테이블에서 행 클릭
2. Drawer에서 base/입고/출고 분해 + 일자별 이력
3. “시트에 출고가 정말 없는지” 현장 확인

### S3. 전원 일치

1. 대조 후 불일치 0
2. 그린 빈 상태 + CSV는 헤더만 또는 summary only

---

## 9. 구현 단계

| Phase | 내용 | 우선 |
|-------|------|------|
| **P0** | `POST variance-check` API + 원인 코드 엔진 | 필수 |
| **P0** | enhanced 탭 `차이 확인` UI (업로드·테이블·KPI) | 필수 |
| **P0** | 클라이언트 CSV | 필수 |
| **P1** | 행 Drawer + diagnostics 연동 | 권장 |
| **P1** | 탭 배지(불일치 N) — 마지막 결과 localStorage | 권장 |
| **P2** | 리포트 스냅샷 저장·이력 목록 | 선택 |
| **P2** | 조정 전표 연동 버튼(별도 권한) | 선택 |
| **P2** | 스케줄 배치 + 메일/슬랙 알림 | 선택 |

**P0 예상 작업량**: BE 0.5~1일 · FE 1~1.5일 · QA 0.5일

---

## 10. 테스트 계획

| 케이스 | 기대 |
|--------|------|
| 공식 유닛 | variance-check 의 ledger = unified 와 동일 바코드 |
| LPN 중복 zip | raw와 dedupe 결과 상이 시 stats.rowsLpnSkipped > 0 |
| 이중 바코드 동일 상품명 | **두 행 유지**, 합산 행 없음 |
| 입출고 0 + wms < base | cause = `NO_MOVEMENT_WMS_LOWER` |
| 입고만 있고 Δ=−1 | cause = `AFTER_RECEIPT_GAP` |
| 파일 없음 | 400 + 메시지 |
| baseline 없음 | 400 “스냅샷 필요” |

---

## 11. 카피·용어 통일

| 쓰지 말 것 | 쓸 것 |
|------------|--------|
| 재고 버그 / 공식 오류 | 전산·창고 **수량 차이** |
| 바코드 중복 오류 | (해당 없음) 바코드별 **정상 분리** |
| 입출고 0 = 재고 없음 | 입출고 0 = **기록 없음** (재고는 baseline 유지) |
| 상품명 그룹 불일치 | 사용하지 않음 |

---

## 12. 의사결정 로그

| 결정 | 내용 |
|------|------|
| D1 | 로직/공식 유지, UI는 차이 **가시화** |
| D2 | 바코드 단위 고수, 상품명 merge 금지 |
| D3 | 1차 진입점 = enhanced **내부 탭** |
| D4 | 1차 API는 조회 전용 (baseline 불변) |
| D5 | WMS 입력은 파일 업로드 (zip/xlsx) |

---

## 13. 구현 착수 시 체크리스트

- [x] `ActiveTab` + tabs 배열에 `variance` 추가
- [x] `VarianceCheckTab` 컴포넌트 스캐폴드
- [x] `POST /api/inventory/variance-check` + 원인 분류 함수
- [x] LPN 중복 제거 옵션 연결
- [x] CSV export
- [x] Drawer + diagnostics
- [x] 단위/수동 테스트 (원인 분류 + zip 실대조)

---

## 14. 부록 — 원인 코드 UI 배지 색

| code | Badge |
|------|--------|
| `NO_MOVEMENT_WMS_LOWER` | 앰버 텍스트 |
| `AFTER_RECEIPT_GAP` | 블루 텍스트 |
| `LEDGER_ONLY` | 코랄 텍스트 |
| `WMS_ONLY` | 바이올렛 틴트 |
| `OTHER` | 그레이 |

배지는 **작은 pill** (text-xs, px-2 py-0.5), 배경 연한 틴트만.

---

**문서 끝.** 구현 승인 시 P0부터 API → 탭 UI 순으로 진행한다.
