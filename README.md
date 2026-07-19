# VF-new — 보노하우스 생산·물류 관리 시스템

보노하우스 VF 공장의 **생산 계획, 출고, 전산 재고, 입고, 출차(departure), 제품 마스터, 바코드 스캐너**를 통합 관리하는 웹 시스템입니다.

| 항목 | 내용 |
|------|------|
| **도메인** | 제조·물류 운영 (보노하우스 VF) |
| **백엔드** | Django + Django REST Framework (`sales_api`, `departure`, `truck_freight`) |
| **프론트** | React 18 + TypeScript + **Vite 8** + shadcn/ui + Tailwind CSS |
| **디자인** | Toss/TDS 계열 · Accent `#721FE5` · Pretendard/Inter |
| **AI** | OpenRouter **무료·경량 모델만** (`*:free` / `openrouter/free`) |
| **기본 포트** | API **5176** · UI **5174** |

> 에이전트·개발 규칙 요약: [`CLAUDE.md`](CLAUDE.md)  
> 디렉터리 상세: [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md)  
> VF 발주서 컬럼: [`docs/VF_ORDER_XLSX_MAPPING.md`](docs/VF_ORDER_XLSX_MAPPING.md)  
> 출고 대시보드: [`docs/OUTBOUND_DASHBOARD_README.md`](docs/OUTBOUND_DASHBOARD_README.md)  
> 시간별 출고 예측 수정 계획: [`docs/DELIVERY_PREDICTION_FIX_PLAN.md`](docs/DELIVERY_PREDICTION_FIX_PLAN.md)

---

## 1. 프로젝트 구성

```
VF-new/
├── backend/                    # Django
│   ├── config/                 # settings, root URLs, WSGI/ASGI
│   ├── sales_api/              # 핵심 비즈니스 API
│   │   ├── models.py           # MasterSpec, Outbound, Inventory*, ProductionLog …
│   │   ├── views.py            # REST 엔드포인트 (대용량)
│   │   ├── inventory_stock.py  # 전산 현재고 공식 (단일 진실 공급원)
│   │   ├── urls.py
│   │   ├── management/commands/  # sync_vf_items, update_outbound_status …
│   │   └── migrations/
│   ├── departure/              # 출차 대시보드·바코드 스캐너 서빙·세션 저장
│   │   ├── templates/departure/dashboard.html
│   │   └── data/               # 출차 JSON, 스캐너 세션 barcode_YYYY-MM-DD.json
│   ├── truck_freight/          # 트럭 운임
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   └── client/                 # React SPA (실제 운영 UI)
│       ├── public/
│       │   └── barcode_scanner.html   # 입고 스캐너 (정적 + Django 서빙)
│       └── src/
│           ├── pages/          # production-plan, product-master, delivery …
│           ├── components/     # inventory/, master/, outbound-*, ui/
│           ├── hooks/
│           └── lib/
├── docs/                       # 스펙·운영 문서
├── tests/e2e/                  # Playwright 등
├── CLAUDE.md                   # 개발·API 규칙
├── DESIGN-LANGUAGE.md
└── README.md                   # 본 문서
```

### 1.1 백엔드 앱 역할

| 앱 | 역할 |
|----|------|
| **sales_api** | 출고·입고·재고·생산로그·마스터·FC입고·AI·통계 API |
| **departure** | 출차 대시보드, 바코드 스캐너 HTML/SSE, 스캐너 작업 세션 JSON |
| **truck_freight** | 트럭 운임 관리 |

### 1.2 프론트 주요 페이지

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/delivery` | DeliveryOverview | 출고 현황 대시보드 |
| `/outbound` | OutboundTabs | 출고 수량·추이 분석 |
| `/inventory/enhanced` | Enhanced Inventory | 전산 재고, 입고, 분석, **현재고→VF 지정** |
| `/production` | ProductionPlan | 생산 계획·텍스트/파일 업로드 |
| `/production-app` | ProductionApp | 모바일 생산 (PIN) |
| `/master` | ProductMaster | 제품 마스터·VF·로케이션·출고 리포트 |
| `/scanner` 등 | barcode_scanner | 입고 바코드 스캔·로케이션 |
| departure iframe | 출차 대시보드 | 호차·PDF·봉인 등 |

---

## 2. 핵심 데이터 모델

| 모델 | 설명 |
|------|------|
| **MasterSpec** | 제품 마스터 (이름, SKU, 바코드, 대·중분류, 단가, VF/단종/3개월미출고) |
| **BarcodeMaster** | 바코드 SoT — **로케이션**, 임계재고, lifecycle |
| **OutboundRecord** | 일별 출고 실적 |
| **InventoryBaselineUpload / Item** | 재고 **기준 스냅샷** (as_of 클로징 잔여) |
| **InventoryReceiptItem** | 입고 이력 (전산 가산) |
| **ProductionLog** | 일·기계별 생산 실적/계획 행 |
| **MachinePlan / MachineUser** | AI 추천 계획, PIN 인증 기계 사용자 |
| **InboundOrderLine** | 입고 발주(확정·입고가능 수량) |
| **FCInboundRecord** | FC 입고·단가 연동 |

### 2.1 전산 현재고 공식 (필수)

단일 구현: `backend/sales_api/inventory_stock.py`

```
현재고 = 기준스냅샷(as_of 잔여)
       + 입고(receipt_date  > as_of)
       − 출고(outbound_date > as_of)
```

- 스냅샷 의미: **기준일 출고가 반영된 뒤 남은 재고** (클로징).
- 기준일 **당일** 입·출고를 다시 가감하면 이중 계산 → `>=` 금지, **`>` 만 사용**.
- 화면의 **현재고**는 위 결과. 스냅샷 수량은 계산 출발점이며 UI에서는 숨길 수 있음.

### 2.2 VF 품목 (`is_vf_item`)

| 경로 | 설명 |
|------|------|
| CSV 동기화 | `manage.py sync_vf_items <csv>` (쿠팡 VF 목록) |
| 현재고 기준 | Enhanced **「현재고→VF 지정」** → `POST /api/master/specs/sync-vf-from-stock` |
| 수동 | 마스터 편집 / 일괄 / 양식 `is_vf_item` 열 |

현재고>0 바코드 → VF 설정, 재고 없는 바코드 마스터 → VF 해제 (1차 단순 규칙).

### 2.3 로케이션

- **저장 SoT:** `BarcodeMaster.location`
- 마스터 목록: 바코드 조인으로 표시·수정 시 BM upsert
- 스캐너: 수동 입력 시 세션 JSON + **`POST /api/inventory/barcode-location`** 영구 저장
- 대분류 공란 시 스캐너 **대분류 필수 질문** 모달

---

## 3. 주요 API (trailing slash 없음)

```
GET  /api/inventory/unified
POST /api/inventory/baseline-upload
POST /api/inventory/receipts-upload
POST /api/inventory/barcode-location
GET  /api/inventory/barcode-master?limit=5000

GET  /api/master/specs
PUT  /api/master/specs/<id>
PATCH /api/master/specs/bulk-update
GET  /api/master/specs/export.xlsx
POST /api/master/specs/import-bulk
GET  /api/master/specs/current-stock?barcode=
POST /api/master/specs/sync-vf-from-stock
POST /api/master/specs/register-from-scan
GET  /api/master/category-lg-options

GET  /api/outbound/stats?barcode=&product=&startDate=&endDate=
POST /api/upload-production-text
POST /api/upload-production-file
GET  /api/production-log
```

**주의:** `/api/production/` 처럼 trailing slash → **404**.  
production-log 삭제는 bulk-delete / 날짜 단위 엔드포인트 사용.

---

## 4. 개발 실행

### Windows (배치)

```bat
start_backend.bat
start_frontend.bat
rem 또는
start_all.bat
```

### 수동

```bash
# 백엔드
cd backend
# venv 활성화 후
python manage.py runserver 0.0.0.0:5176
# 또는 gunicorn config.wsgi:application --bind 0.0.0.0:5176 --workers 2

# 프론트
cd frontend/client
npm run dev -- --host 0.0.0.0 --port 5174
```

백엔드 **코드 변경 후** gunicorn 등 워커 사용 시 **프로세스 재시작** 필요.  
Vite 개발 서버는 프론트 핫리로드.

---

## 5. 기능 모듈 요약

### 5.1 제품 마스터 (`/master`)

- 탭: 출고 진행 / 3개월 미출고 / 단종
- VF 배지, 로케이션 컬럼, 헤더 정렬, KPI 카드 필터
- 품목명 클릭: **출고 리포트 팝업** (일별 출고 차트·라벨·추세선, 전산 현재고, 마지막 입·출고일, 로케이션 2줄)
- 양식 다운로드/업로드, 일괄 수정 (로케이션·VF 설정/해제 포함)
- 신규 시 **대분류 필수**

### 5.2 Enhanced 재고 (`/inventory/enhanced`)

- 전산 재고 테이블, 상태 필터, 입고 가능, 3개월 분석
- 품목명 클릭: 마스터와 **동일 출고·현재고 팝업**
- **현재고→VF 지정** 버튼

### 5.3 바코드 스캐너

- VF 발주 xlsx / 미입고 CSV 업로드
- 로케이션: 마스터 조회 → 없으면 수동 입력 → **BM 영구 저장**
- 대분류 미설정 시 질문 모달

### 5.4 생산 계획 (`/production`)

- 파일 업로드 + **텍스트 붙여넣기**
- 헤더 한글/영문 별칭, 헤더 없어도 템플릿 열 순서로 인식  
  (`date, machineNumber, moldNumber, productName, …`)

### 5.5 출고·출차

- 출고 대시보드 추이/피벗/YoY (`/outbound`)
- 출고 현황·시간별 예측 (`/delivery` + `public/js/dashboard.js`)
- 출차: 호차, PDF, 봉인, **차량 순서 다형식 붙여넣기**, 최근 접안일/접안 횟수 (`departure`)

### 5.6 AI (OpenRouter)

- **유료 모델 사용 금지.** 허용 ID: `openrouter/free` 또는 `*:free` 접미사만.
- **속도 우선:** 기본 `meta-llama/llama-3.2-3b-instruct:free`, 70B/405B/ultra 급 자동 재시도 후보에서 제외.
- 설정: `backend/.env` · `OPENROUTER_*` · `backend/sales_api/openrouter_service.py`
- 출고 AI 분석 (`POST /api/outbound/ai-analysis`): 타임아웃 상한·로컬 집계 폴백 (Vite `ECONNRESET` 완화)

---

## 6. 수정·변경 이력 (상세)

이 섹션은 **실제 반영된 코드·운영 작업**을 일자·주제별로 기록합니다.  
관련 커밋: `b0d802e`, `627c5b0`, `cb2a079` 등 (`main` / `origin/main`).

---

### 6.1 2026-07-17 ~ 2026-07-18 — Delivery 시간별·일별 출고 예측 전면 수정

**증상**

1. 시간별 예측(특히 **23:00 마감**)이 실제와 크게 어긋남 / 과소 예측  
2. 「내일 예측」 테이블의 일·월(요일·월초중말) 값이 비현실  
3. **7/19가 “(오늘)”로 표기**되는 날짜 라벨 버그  

**근본 원인**

| 원인 | 설명 |
|------|------|
| `total` 필드 오염 | 최근 일부 일자 `total` ≈ `hour_23` × **9배** (예: hour_23=680, total=6093). 예측이 `total`을 최종값으로 쓰면 전부 왜곡 |
| 날짜 라벨 | API 기본 `start_date`=**내일**인데 UI가 `meta.start_date === pred.date` 이면 무조건 `(오늘)` 표시 |
| 90일 산술평균 | 이상치에 끌려 일별 예측 총량이 현실(중앙값 ~600대)과 괴리 |
| `MAX_INCREMENT=100` | 시간당 증가 캡 때문에 23시가 목표 최종값에 못 미침 |
| 오전 가속도 과가중 | 이른 시간 저속 출고를 하루 끝까지 연장 → 마감 과소 |

**조치 (서버)** — `backend/sales_api/views.py`

- **일 마감 SoT = `hour_23`** (`_delivery_day_final`). `total`은 hour와 일치할 때만 보조 사용.  
- `POST /api/ai/predict-hourly`  
  - 완료비율(`hour_h / hour_23`) + 잔여 증가 중앙값 블렌드  
  - 동일 요일 `hour_23` 중앙값 **앵커** (하한 약 92% · 상한 약 130%)  
- `GET /api/delivery/daily-prediction`  
  - 동일 요일 중앙값 블렌드 (55% same-dow + 25% 최근28일 중앙 + 20% 강건 중앙)  
  - 월초/중/말·요일 계수는 **중앙값 기반 약보정**  
  - `meta.server_today`, `base_median`, `dow_medians` 등 응답 보강  
- 누적 시간 비율: `_get_weekday_hourly_cumulative_ratios` (`hour_23` 기준)

**조치 (클라이언트)** — `frontend/client/public/js/dashboard.js`

- 로컬 날짜 `formatLocalYmd` / `addLocalDays` (`toISOString` UTC 밀림 금지)  
- 라벨: 실제 오늘/내일/모레와 비교 (`(오늘)` `(내일)` `(모레)`)  
- `getDayFinalQty` / `getSameDowHour23Median`  
- `calculateSimplePrediction`: **23시 = 목표 최종값 강제**, 시간당 100 캡 제거  
- 오전(12시 전) 가속도 가중 **15%** (앵커/AI 비중 상향)  
- 7일 기준선: 평균 → **hour_23 중앙값**

**계획 문서:** [`docs/DELIVERY_PREDICTION_FIX_PLAN.md`](docs/DELIVERY_PREDICTION_FIX_PLAN.md)  
**커밋:** `b0d802e`, `627c5b0`

**검증 예 (2026-07-18 토, 8시 누적 105)**

- 동일 토요일 hour_23 중앙 ≈ 640, 유사 페이스 과거 마감 606~633  
- 서버 마감 예측 ≈ 630대 — 페이스 기준으로 타당 (최근 주간 680 대비 보수적일 수 있음)

---

### 6.2 2026-07 — 출차(departure) 차량 순서 · 접안 통계

#### 차량 순서 다형식 파싱·적용

- **정책:** 칸 위치가 아니라 **패턴 추출** (호차·번호판·전화·HUB·톤·시간·기사)  
- 서버: `departure/services/vehicle_order.py` — `parse_order_line` / `parse_order_text` / `reorder_from_input`  
- 클라이언트: `departure/templates/departure/dashboard.html` — 서버와 동일 정책, 적용은 **서버 권위**  
- API: `POST /departure/api/vehicle-order`  
- 지원 예:

```
1호    VF67(유원)    부천1HUB    충북80아3912    김창기    010-7774-8114    5    20:00
[부천1HUB][2호] 경기82바8956 010-4003-0297
3호 광주90바1703 김경옥 11T 23:50
1호,부천1HUB,충북80아3912,김창기,010-7774-8114,5,20:00
```

- 줄 순서 무관 → **호차 번호순** 정렬 후 DB 반영  
- 테스트: `departure/tests/test_vehicle_order_parse.py`

#### 최근 접안일 · 접안 횟수 DB 미갱신 수정

| 문제 | 원인 | 해결 |
|------|------|------|
| 접안일/횟수가 2026-07-08 등에 고착 | `enrich_ls_data`가 오래된 `vehicle_db_merged.json`의 `dates`만 참조 | **SoT = `departure_records` DB 이력** + JSON 보완 |
| DB `last_seen`/`total_orders` 미저장 | enrich 결과 미반영 | enrich 시 DB 업데이트 + 마스터 `dates` 동기화 |
| PDF 스캔 추가 시 0회 | 신규 생성 시 통계 미계산 | `add_vehicle_from_pdf`에서 `_compute_dock_stats` |

- 관련: `departure/views.py` (`enrich_ls_data`, `touch_vehicle_master_dates`), `vehicle_order.py`

---

### 6.3 2026-07 — AI / 프론트 인프라

#### OpenRouter 무료·빠른 모델만

- `openrouter_service.py`: `is_allowed_free_model_id`, `is_fast_free_model_id`, `enforce_free_model_id`  
- 유료 ID 선택 시 거부 / 자동 치환  
- 기본 모델: `meta-llama/llama-3.2-3b-instruct:free`  
- 재시도: 소형 free만 (3B → MoE → nano → 20B → `openrouter/free`)  
- 분석 API max_tokens 축소, 타임아웃 상한 (대략 20~30s)

#### Vite 8 업그레이드

| 항목 | 이전 | 이후 |
|------|------|------|
| vite | 4.x | **8.1.x** (Rolldown) |
| @vitejs/plugin-react | 4.x | **6.x** |
| manualChunks | 객체 | **함수** (Rolldown 요구) |
| 프록시 | localhost | **127.0.0.1:5176** (Windows `::1` 이슈) |

- `frontend/client/package.json`, `vite.config.ts`  
- `npm install` 시 peer 충돌 시 `--legacy-peer-deps` 참고

#### 출고 AI 분석 프록시 오류 (`ECONNRESET`)

- 원인: 긴 OpenRouter 대기 + runserver 중복 등으로 Vite 프록시 연결 리셋  
- 대응: 타임아웃 캡, AI 무응답 시 **DB 집계 로컬 폴백**, 프론트 55s abort + 안내 문구

---

### 6.4 2026-07 — 재고·마스터·기타 (동일 기간 누적)

#### 재고·금액

| 항목 | 내용 |
|------|------|
| 스냅샷 이중 계산 방지 | as_of 당일 입출고 재가감 금지 (`>` only), `inventory_stock.py`, 커밋 `cb2a079` |
| 현재고 리포트 | `GET /api/master/specs/current-stock` |
| UI | 스냅샷 수량 비표시, 로케이션 2줄 등 |

#### 마스터·VF·로케이션

| 항목 | 내용 |
|------|------|
| 로케이션 SoT | `BarcodeMaster.location` 조인·일괄·스캐너 영구 저장 |
| VF | 현재고→VF 지정, bulk, 양식 `is_vf_item` |
| 출고 리포트 팝업 | 마스터·Enhanced 공통 Recharts |

#### 생산 계획 붙여넣기

- 헤더 유무 모두 인식, 기계/금형 별칭, 서버 재시작 안내

---

### 6.5 백업·저장소

| 작업 | 위치/내용 |
|------|-----------|
| Git push | `origin/main` (`b0d802e`, `627c5b0` 등) |
| USB/외장 백업 | **`G:\VF-new-backup-2026-07-18\`** (폴더 ~479 MB) · **`G:\VF-new-backup-2026-07-18.zip`** (~301 MB) |
| 제외 | `node_modules`, `.venv`, `dist`, `.git` |
| G:\ 정리 | 구 hermes 백업·구 ki-ai 백업·빈 workspace-bak 등 삭제 (여유 공간 확보), **VF-new 최신 백업 유지** |

---

### 6.6 이전 주요 이력 (요약)

| 시기 | 내용 |
|------|------|
| 2026-06 | 하네스 4기둥·CLAUDE 컨텍스트, production-log 업로드 unit 컬럼 수정, 출차 통합·VehicleOrderService 단일 진입점 |
| 2026-05 | production-log 삭제 405 → bulk-delete, 입고 가능 수량 탭 |
| 2026-04 | 생산 계획·Enhanced 재고·AI 파서 등 기반 구축 |

---

## 7. 운영 시 자주 하는 작업

| 작업 | 방법 |
|------|------|
| 재고 스냅샷 업로드 | Enhanced → 기준 재고 파일 |
| 당일 입고 반영 | receipts 업로드 (as_of 다음날부터 현재고 가산) |
| VF 재정렬 | Enhanced → 현재고→VF 지정 |
| 마스터 일괄 수정 | 양식 다운로드 → 수정 → 양식 업로드 |
| 스캐너 로케이션 | 수동 입력 적용 (BM 저장 확인) |
| 생산 일지 반영 | 파일 또는 텍스트 붙여넣기 (**헤더 권장**, 없어도 동작) |

---

## 8. 테스트·품질

```bash
# 백엔드 (예)
cd backend && python manage.py test sales_api.tests

# E2E
# tests/e2e/ — Playwright 스펙 참고
```

재고 공식 변경 시 **반드시** `inventory_stock.py`와 단위 테스트/수동 검산( base + rcv − out )을 함께 확인.

---

## 9. 디자인 시드 (Toss)

UI 토큰·패턴은 Toss Seed 계열을 사용합니다. 브랜드 색:

```css
:root {
  --brand: #721FE5;
}
```

상세 규칙은 [`DESIGN-LANGUAGE.md`](DESIGN-LANGUAGE.md) 참고.

---

## 10. 관련 문서 인덱스

| 문서 | 내용 |
|------|------|
| [CLAUDE.md](CLAUDE.md) | API 규칙, 모델, 하네스, 변경 이력 요약 |
| [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | 폴더 구조 |
| [docs/VF_ORDER_XLSX_MAPPING.md](docs/VF_ORDER_XLSX_MAPPING.md) | 발주서·스캐너 컬럼 |
| [docs/OUTBOUND_DASHBOARD_README.md](docs/OUTBOUND_DASHBOARD_README.md) | 출고 대시보드 |
| [docs/DELIVERY_PREDICTION_FIX_PLAN.md](docs/DELIVERY_PREDICTION_FIX_PLAN.md) | Delivery 시간별·일별 예측 수정 계획·원인·검증 |
| [docs/archive/](docs/archive/) | 과거 설치·리뉴얼 문서 |

---

## 부록. 빠른 체크리스트 (최근 이슈)

| 증상 | 확인/조치 |
|------|-----------|
| 23:00 예측이 비정상 | `hour_23` 기준인지, `total` 오염(9배) 여부, Ctrl+F5 |
| 7/19가 오늘로 보임 | 구 캐시 JS — 강력 새로고침; 라벨은 로컬 오늘/내일 비교 |
| 차량 순서 “파싱 불가” | `POST /departure/api/vehicle-order`, 줄에 `N호`+번호판, 서버 재시작 |
| 접안 횟수 0/고정 | enrich 후 DB `last_seen`/`total_orders` 갱신 여부, 마스터 dates 동기화 |
| Vite proxy ECONNRESET | 백엔드 5176 단일 실행, OpenRouter 지연 시 로컬 폴백 응답 |
| AI 과금 우려 | OpenRouter는 `*:free` 만 허용되도록 코드 강제 |

---

## 11. 라이선스·저장소

사내 운영 프로젝트 (보노하우스 VF).  
문의·배포 정책은 저장소 관리자 기준.
