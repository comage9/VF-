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
> 진행/수정 계획: [`PROGRESS_AND_PLANS.md`](PROGRESS_AND_PLANS.md)  
> 디렉터리 상세: [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md)  
> VF 발주서 컬럼: [`docs/VF_ORDER_XLSX_MAPPING.md`](docs/VF_ORDER_XLSX_MAPPING.md)  
> 출고 대시보드: [`docs/OUTBOUND_DASHBOARD_README.md`](docs/OUTBOUND_DASHBOARD_README.md)  
> 시간별 출고 예측 수정 계획: [`docs/DELIVERY_PREDICTION_FIX_PLAN.md`](docs/DELIVERY_PREDICTION_FIX_PLAN.md)  
> 출차 날짜·새로고침: [`docs/DEPARTURE_DATE_REFRESH_ISSUE.md`](docs/DEPARTURE_DATE_REFRESH_ISSUE.md) · 이전/오늘: [`docs/DEPARTURE_PREV_TODAY_ISSUE.md`](docs/DEPARTURE_PREV_TODAY_ISSUE.md)  
> 입고 가능(발주 없을 때 재고 추천): [`docs/INBOUND_STOCK_BASED_RECOMMEND_PLAN.md`](docs/INBOUND_STOCK_BASED_RECOMMEND_PLAN.md)

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

### 1.2 프론트·페이지 구성 (경로별)

대시보드 메뉴(`dashboard.tsx`) 및 SPA 라우트 기준.

| 경로 | 화면 | 설명 |
|------|------|------|
| `/` 또는 `/delivery` | 출고 현황 대시보드 | 오늘 출고·시간대 추이·일별 예측 |
| `/outbound` | 출고 수량 분석 | 기간 출고 추이·피벗·YoY·AI 분석 |
| `/inventory/enhanced` | **전산 재고 (Enhanced)** | 현재고·위험/부족·입고 업로드·VF 지정 |
| `/production` | 생산 계획 | 일·기계별 계획/실적, 파일·텍스트 업로드 |
| `/production-app` | 모바일 생산 | PIN 인증 후 현장 입력 (별도 진입) |
| `/master` | 제품 마스터 | 사양·VF·로케이션·출고 리포트 팝업 · **제품번호(573) 검색·정확일치 최상단** · 전산재고 페이지와 수정 연동 |
| `/barcode` | 바코드 생성 | 송장/제품 바코드, 시간대 출고 전송 |
| `/departure` | 출차 관리 | 호차·LS PDF·**KPP EDI 등록·인쇄**·봉인 |
| `/scanner` | VF 입고 바코드 | 발주 xlsx·스캔·로케이션 저장 |
| `/truck-freight` | 트럭 운송비 | 운임 입력·월별 통계 |
| `/product-display` | **제품 배치도** | 총괄(A~E동 미니) + 동별 상세 · A동 세로 슬롯 라인(1~19)·L7 바퀴슬림 2품목/칸 · **B동 6분류 재진열(137품목)** · **C동 와이드73+에센셜28+모던플러스52+맥스38+슬림형21(212품목)** · **D동 탑백40+초대형21+해피11+슬라이딩스텝3(75품목, 2·2·3·1개/칸)** · 툴팁(...[truncated]

**관련 백엔드 전용 화면**

| URL | 설명 |
|-----|------|
| `/departure/` | Django 템플릿 출차 대시보드 (SPA `/departure`와 연동) |
| `/departure/barcode-scanner/` | 스캐너 HTML (Django 서빙) |

---

## 2. 핵심 데이터 모델

| 모델 | 설명 |
|------|------|
| **MasterSpec** | 제품 마스터 (이름, SKU, 바코드, 대·중분류, 단가, VF/단종/3개월미출고) |
| **BarcodeMaster** | 바코드 SoT — **로케이션**, 임계재고, lifecycle |
| **OutboundRecord** | 일별 출고 **실적** (`is_estimated=False`) / **예측 보정** (`True`) |
| **InventoryBaselineUpload / Item** | 재고 **기준 스냅샷** (as_of = 재고+입고, **출고 미포함**) |
| **InventoryReceiptItem** | 입고 이력 (as_of **다음날부터** 전산 가산) |
| **InventoryStockAdjustment** | WMS 대조·파손 등 조정 전표 |
| **ProductionLog** | 일·기계별 생산 실적/계획 행 |
| **MachinePlan / MachineUser** | AI 추천 계획, PIN 인증 기계 사용자 |
| **InboundOrderLine** | 입고 발주(확정·입고가능 수량) |
| **FCInboundRecord** | FC 입고·단가 연동 |

### 2.1 전산 현재고 공식 (필수 · 2026-07-22 확정)

**단일 구현:** `backend/sales_api/inventory_stock.py`  
`views.py` 등에 인라인 재구현 금지. API: `GET /api/inventory/unified` → `/inventory/enhanced`.

#### 운영 의미

| 용어 | 의미 |
|------|------|
| **스냅샷 (baseline)** | 업로드한 **기준일(as_of) 재고 파일 수량**. **그날 재고 + 입고**가 들어 있는 출발점. **당일 출고는 포함하지 않음**. |
| **출고 실적** | 구글시트 등 → DB `OutboundRecord` (`is_estimated=False`). **당일 출고는 보통 다음날 확인·입력**. |
| **예측 출고** | `is_estimated=True`. 과거 공백 추정용. **현재고 차감에 사용하지 않음**. |

#### 공식

```text
현재고 = 스냅샷(baseline, as_of)
       + 입고 ( receipt_date  >  as_of )     # 당일 입고는 스냅샷에 있음 → 다시 안 더함
       − 실출고 ( outbound_date >= as_of )   # 당일 출고 포함해 반드시 차감
       + 조정 ( adjustment_date > as_of )
```

| 구분 | Django 조건 | 이유 |
|------|-------------|------|
| 입고 | `receipt_date__gt=as_of` | 당일 입고 = 스냅샷에 포함 |
| **출고** | `outbound_date__gte=as_of` | 당일 출고 = 스냅샷에 **없음**, 다음날 입력 |
| 예측 출고 | 제외 | 재고 기준 = **실데이터만** |

#### 예시 (as_of = 2026-07-21)

| 데이터 | 처리 |
|--------|------|
| 7/21 스냅샷 합 7,584 | 출발점 |
| 7/21 실출고 653박스 | **차감** (`>= as_of`) |
| 7/22 출고·입고 | 있으면 각각 차감/가산 |
| 7/20 출고 | 스냅샷에 이미 반영된 전제 → **재차감 안 함** |

```text
7/22 화면 현재고 ≈ 7,584 − 653 = 6,931  (7/21 출고만 있을 때)
```

#### 구버전 버그 (수정 전)

- 잘못된 가정: “스냅샷 = 출고 **후** 클로징 잔고” → 출고를 `outbound_date > as_of` 만 차감  
- as_of=7/21 이고 7/21 출고가 DB에 있어도 **안 뺌** → 전산 > 실물  
- **2026-07-22** 운영 정의로 수정: 스냅샷=재고+입고, 출고 `>= as_of`

#### 출고 시트 동기화와 재고

| 구분 | 역할 |
|------|------|
| `POST /api/outbound/sync` / `manage.py daily_outbound_sync` | 시트 → DB (문서상 매일 **07:00**, 최근 약 2일) |
| 현재고 계산 | DB에 들어온 **실출고**를 위 공식으로 즉시 반영 (시·분 컷오프 없음) |
| Enhanced 페이지 30초 새로고침 | 계산 결과 재조회만 (시트 동기화 아님) |

#### 진단

```bash
cd backend
python manage.py diagnose_inventory_stock
python manage.py diagnose_inventory_stock --barcode Rxxxx
python manage.py test sales_api.tests.test_inventory_stock
```

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

GET  /api/master/specs                 # 기본 compact=1 (목록 경량·빈 키 생략)
GET  /api/master/specs?compact=0       # 전체 필드 (구 호환)
GET  /api/master/specs/<id>            # 단건 전체 (편집 시)
PUT  /api/master/specs/<id>
PATCH /api/master/specs/bulk-update
GET  /api/master/specs/export.xlsx
POST /api/master/specs/import-bulk
GET  /api/master/specs/current-stock?barcode=
POST /api/master/specs/sync-vf-from-stock
POST /api/master/specs/sync-vf-from-outbound
POST /api/master/specs/register-from-scan
GET  /api/master/category-lg-options

GET  /api/outbound
POST /api/outbound/sync
GET  /api/outbound/stats?barcode=&product=&startDate=&endDate=
POST /api/upload-production-text
POST /api/upload-production-file
GET  /api/production-log

# 출차 (Django departure, trailing slash 없음)
GET  /departure/api/print-kpp/<hoche>?plt=&date=   # KPP 등록→EDI 인쇄 (삭제 없음)
GET  /departure/api/kpp-check/<hoche>?date=&plate= # 기존 등록 여부 확인
GET  /departure/api/kpp-session?step=status|login|register
GET  /departure/api/print/<hoche>                  # LS PDF 인쇄
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
- VF 배지, 로케이션 컬럼, 헤더 정렬, KPI 카드 필터 (VF 전용 카드 포함)
- 품목명 클릭: **출고 리포트 팝업** (일별 출고 차트·라벨·추세선, 전산 현재고, 마지막 입·출고일, 로케이션 2줄)
- 양식 다운로드/업로드, 일괄 수정 (로케이션·VF 설정/해제 포함)
- 신규 시 **대분류 필수**
- **목록 로딩 최적화 (2026-07-26)**
  - `GET /api/master/specs?compact=1` (기본): 목록 필드만·빈 키 생략 (`components`/`mold` 제외)
  - 편집 시 `GET /api/master/specs/<id>` 로 전체 필드 로드
  - FE: `staleTime` 5분, 이미지 `loading=lazy`
  - 서버: `GZipMiddleware` — 브라우저 gzip 시 목록 **~1MB → ~74KB**

### 5.2 Enhanced 재고 (`/inventory/enhanced`)

- 전산 재고 테이블, 상태 필터, 입고 가능, 3개월 분석
- **현재고** = §2.1 공식 (`inventory_stock.py` → `/api/inventory/unified`)
- **품목 목록 SoT = 제품 마스터 `is_vf_item`** (스냅샷 행 수 ≠ VF 품목 수)
  - 스냅샷에 없는 VF도 baseStock=0 으로 표시 · 이후 입·출고 반영
  - 응답 `universe=master_vf` · `vfMasterCount` = 마스터 VF 건수
- 기준 재고(스냅샷) 업로드 · 입고 업로드
- 품목명 클릭: 마스터와 **동일 출고·현재고 팝업**
- **현재고→VF 추가** (현재고>0 추가만 · 기존 VF 자동 해제 없음)
- 30초 자동 새로고침 (DB 기준 재계산 결과; 시트 동기화 아님)

**입고 가능 탭** (`inbound-availability-tab.tsx`)

| 모드 | 조건 | 표시 | 엑셀 |
|------|------|------|------|
| 발주 있음 | 업로드 발주 행 존재 | N일 보유 · **입고 가능** `min(gap, 확정)` | `발주서_검토_YYYYMMDD.xlsx` |
| 발주 없음 | 업로드 없음 | N일 보유 · **입고 권장** = gap | `재고기반_입고권장_YYYYMMDD.xlsx` |

**기간 수량 SoT (스캐너와 동일)**

- `src/lib/inboundPeriodMetrics.ts` · `public/js/inbound-period-metrics.js`
- `hold = round(avg×N)`, `gap = max(0,hold−stock)`, `available = min(gap, 확정)` (확정 없으면 gap)
- 일평균: unified `avgDailyOutbound14d/30d/60d` (Enhanced 경로 미사용)

상세: [docs/INBOUND_STOCK_BASED_RECOMMEND_PLAN.md](docs/INBOUND_STOCK_BASED_RECOMMEND_PLAN.md)

### 5.3 바코드 스캐너 (`/scanner`)

- VF 발주 xlsx / 미입고 CSV 업로드
- 로케이션: 마스터 조회 → 없으면 수동 입력 → **BM 영구 저장**
- 대분류 미설정 시 질문 모달
- 정적 HTML: `frontend/client/public/barcode_scanner.html`  
  (대시보드 iframe `?v=` 캐시 버스트 · 로직 변경 시 버전 문자열 갱신)

**기간 선택 (단일):** `10일` · `14일` · `30일` · `전체`

**상단 메트릭 3열 (스캔 후)**

| 열 | 라벨 | 표시 | 글자 크기 |
|----|------|------|-----------|
| 좌 | 전산 재고 수량 | 현재고 `N 개` + 아래 작은 글씨 `(일평균 x.x/14d)` | **36px** 수치 |
| 중 | N일 입고 가능 | 기간 입고가능 수량 (확정 상한 적용) | **36px** 수치 |
| 우 | (라벨 없음) | 상태 문구 + **바로 아래** 기간 필요 재고(보유 목표) | 문구 13px · 수량 **36px** |

**우측 상태 문구 예**

| 조건 | 문구 |
|------|------|
| 전산+확정 &lt; 보유 목표 | `⚠ N개 더 요청` |
| 보유 목표 0 | `✓ N일 필요 없음` |
| 전산+확정 ≥ 보유 목표 | `✓ N일 필요량 충족` |

**계산 공식 (`calcInboundAvailable` — UI 레이아웃 불변, 숫자만)**

| 기호 | 의미 |
|------|------|
| `avg` | 일평균 출고 (기간별 소스, 예: 14d) |
| `hold` | **N일 보유 목표** = `round(avg × N)` (0.5 미만 → 0) |
| `stock` | 전산 현재고 |
| `orderIn` | 업로드 행 **확정/발주 수량** (SoT 상한) |
| `gap` | `max(0, hold − stock)` |
| **화면 입고가능** | `min(gap, orderIn)` — **확정 초과 표시 금지** |
| `extraOrder` | `max(0, hold − stock − orderIn)` → 더 요청 힌트 |
| 우측 큰 숫자 | **`hold`** (선택 기간 필요 재고 수량만) |
| 전체 모드 | 입고가능 = 업로드 수량, 우측 hold 숨김 |

예: 확정 32, 14일 보유목표 47, 전산 0 → gap 47 → **화면 입고가능 32** (확정 상한).

### 5.4 생산 계획 (`/production`, `/production-app`)

- 파일 업로드 + **텍스트 붙여넣기**
- 헤더 한글/영문 별칭, 헤더 없어도 템플릿 열 순서로 인식  
  (`date, machineNumber, moldNumber, productName, …`)
- 모바일: PIN → 기계별 생산 입력

### 5.5 출고·출차·운임

| 경로 | 내용 |
|------|------|
| `/outbound` | 추이/피벗/YoY, 구글시트 동기화 연동 |
| `/delivery` | 시간별·일별 출고 예측 (`public/js/dashboard.js`) |
| `/departure` | **차량 정보**(초기화·추가 배차) = 배차 SoT · 출차카드 수=차량 수 · LS PDF·접안시간 SoT · **📦 KPP** · 봉인 · 파렛트 빈칸 입력 |
| `/truck-freight` | 트럭 운송비 |
| KPP 백엔드 | `backend/kpp_session.py` — Chrome CDP :9222, WPPS PBM140MW |

### 5.6 AI (OpenRouter)

- **유료 모델 사용 금지.** 허용 ID: `openrouter/free` 또는 `*:free` 접미사만.
- **속도 우선:** 기본 `meta-llama/llama-3.2-3b-instruct:free`, 70B/405B/ultra 급 자동 재시도 후보에서 제외.
- 설정: `backend/.env` · `OPENROUTER_*` · `backend/sales_api/openrouter_service.py`
- 출고 AI 분석 (`POST /api/outbound/ai-analysis`): 타임아웃 상한·로컬 집계 폴백 (Vite `ECONNRESET` 완화)

---

## 6. 수정·변경 이력 (상세)

이 섹션은 **실제 반영된 코드·운영 작업**을 일자·주제별로 기록합니다.  
관련 커밋: `b0d802e`, `627c5b0`, `cb2a079` 등 (`main` / `origin/main`).

### 6.0d 2026-07-26 — 제품 마스터 목록 로딩 최적화

| 항목 | 내용 |
|------|------|
| 증상 | `/master` 최초 로드 느림 (~2k 품목 JSON ~1MB) |
| 백엔드 | `compact=1` 기본: 빈 키 생략·목록 필드만 (`_master_spec_compact_dict`) · 단건 GET 전체 |
| 압축 | `django.middleware.gzip.GZipMiddleware` |
| 프론트 | `?compact=1` · staleTime 5분 · lazy 이미지 · 편집 시 detail GET |
| 실측 | compact 비압축 ~826KB · **gzip ~74KB** (full gzip ~79KB) |

### 6.0e 2026-07-26 — 전산 재고 VF 품목 = 제품 마스터 SoT

| 항목 | 내용 |
|------|------|
| 증상 | 마스터 VF ~840 vs Enhanced 등록 품목 804 (스냅샷 행 수) |
| 원인 | `inventory_unified` 가 기준 스냅샷만 순회 · FE location 필수 필터 |
| 수정 | 목록 universe = `MasterSpec.is_vf_item` · 스냅샷 없는 VF는 base=0 |
| API | `universe=master_vf` · `vfMasterCount` |
| 동기화 | `sync-vf-from-stock` **추가만** (재고 0 → VF 해제 제거) |

### 6.0f 2026-07-26 — 출차 LS 호차 슬롯·완료 조건 수정

| 항목 | 내용 |
|------|------|
| 증상 | LS 1·3호만 배차 시 3호(23:50)가 **2호**로 등록 · 이후 2호 배차돼도 LS 재확인 안 함 |
| 원인1 | 접안시간 순 **연속 1·2·3 압축** (`scan` + `reorder_by_dock_time`) |
| 원인2 | `check_day_complete_local`: N==M 이면 완료 (min 3대 미적용) → 다음날 15시까지 sleep |
| 수정 | templateId/시간 **슬롯 매핑** · 빈 호차 유지 · 완료=M·N≥min_vehicles(3) |
| 반영 | 코드는 저장돼 있었으나 **로직 오류**(미반영이 아님). 오늘 DB 1호/3호 재정렬 완료 |
| 테스트 | `departure.tests.test_ls_hoche_slots` |

---

### 6.0c 2026-07-23 — Departure 출차·LS 자동화·차량정보 UX (상세)

당일~익일 작업 범위: **LS 자동 PDF·등록**, **접안시간·호차 LS SoT**, **출차카드 수 = 차량 정보 수**, **부분 저장으로 호차 삭제 방지**, **파렛트 입력 빈칸**, 스캐너 대분류 저장 UI 오표시 보완, **스캐너 기간 입고가능=확정 상한·메트릭 UX(§D)**.

#### A. LS 포털 자동화 (매일 15:00~)

| 항목 | 내용 |
|------|------|
| **목적** | 매일 15:00 이후 LS(VF67_H) 접속 → 배정 차량 PDF 다운로드 → Departure DB 등록 |
| **스크립트** | `backend/ls_automation.py` (`--watch`) |
| **슈퍼바이저** | `backend/ls_watch_supervisor.py` — watch 프로세스가 죽어도 **30초 후 재기동** |
| **기동** | Django `departure/views.py` 로드 시 `LS_AUTO_WATCH=1` 이면 슈퍼바이저 기동 (runserver reloader 시 자식만) |
| **환경변수** | `LS_AUTO_WATCH`, `LS_WATCH_START_HOUR`(15), `LS_WATCH_END_HOUR`(23), `LS_WATCH_INTERVAL`(10분), `LS_ID`/`LS_PASSWORD` |
| **날짜 롤오버** | 프로세스 **종료하지 않음**. 당일 완료 또는 end_hour 이후 → **다음날 15:00까지 대기** 후 재개 |
| **완료 조건** | **M≥min_vehicles(3)** + **N≥3** + PDF 전부 → 당일 LS 재접속 중단 |
| **미완료(2대 등)** | 10분마다 LS 재조회 — **빈 호차·추가 배차 대기** (2대만 등록돼도 완료 아님) |
| **로그** | `backend/departure/data/ls_watch.log` / `ls_supervisor.log` |
| **잠금** | `backend/departure/data/.ls_watch.lock` |

**1회 수동 실행 예**

```bash
cd backend
.venv\Scripts\python.exe -u ls_automation.py --date YYYY-MM-DD --max 20
.venv\Scripts\python.exe -u ls_watch_supervisor.py   # 상시 감시
```

**LS SoT (단일 기준) — 2026-07-26 수정**

| 필드 | 기준 |
|------|------|
| 접안·출차 **시간** | LS `requestTime` / `requestTimeEpoch` → `HH:MM` |
| **호차 슬롯** | **templateId** 우선 (90626→1, 90628→2, 90269→3) · 없으면 접안시간→기본 슬롯(20:00/22:00/23:50) |
| **빈 슬롯 유지** | 1·3호만 배차 시 **2호 비움** (연속 1·2 압축 금지 — 구버그: 23:50이 2호로 들어감) |
| 저장 JSON | `departure/data/ls_orders_{date}.json` |
| 동기화 | `VehicleOrderService.sync_from_ls_orders` + `reorder_by_dock_time`(슬롯 재정렬) |
| 금지 | 가짜 기본 시각으로 빈 시간 채우기 · 접안시간 순 **연속 호차 압축** |

관련 파일:

- `backend/ls_automation.py` — `run_watch`(daily), `_write_orders_json`, `trigger_departure_scan` + LS sync  
- `backend/ls_watch_supervisor.py`  
- `backend/departure/services/vehicle_order.py` — `sync_from_ls_orders`, `reorder_by_dock_time`, `add_vehicle_from_pdf`  
- `backend/departure/downloader_parser.py` — LS epoch로 `info.time` 설정  

#### B. Departure UI — 차량 정보 ↔ 출차카드

| 규칙 | 설명 |
|------|------|
| **기준 UI** | 📋 **차량 정보** 테이블 (`초기화` · `➕ 추가 배차`) |
| **카드 수** | **차량 정보 행 수 = VF67 출차카드 장 수** (2대→2장, 4대→4장). **3대 고정 아님** |
| **빈 플레이스홀더** | 번호판·시간·기사 없는 빈 칸만으로는 카드 미생성 |
| **LS 역할** | 차량 정보 행을 **채움** (시간·PDF·기사 등). 카드 개수의 SoT는 아님 |

**출차카드 2장만 보이던 원인 (수정됨)**

1. 과거: 클라이언트가 **2대만 POST** → `save_ls_data_by_date`가 나머지 호차 **DB 삭제**  
2. 과거: 카드 렌더가 **plate 있는 행만** 그림  
3. 과거: PLT 입력 후 **60분 경과 시 카드 `hidden-by-time` 숨김**  
4. 대응: **merge 저장**(기본 삭제 없음), 의도 삭제만 `?replace=1`, 카드=차량 정보 N, 시간경과 숨김 **비활성**

관련 파일:

- `backend/departure/views.py` — `save_ls_data_by_date(..., replace=False)`, `api_ls_data` POST 후 **DB 전체 재조회 응답**  
- `backend/departure/templates/departure/dashboard.html` — `buildVF67CardSlots`, `renderVF67CardsWithData`, `showAllCards`, `checkElapsedCards`  
- `frontend/client/src/pages/departure-dashboard.tsx` — SPA fragment 로드·캐시 버스트 (`?_v=plt-empty-…`)  

#### C. 파렛트 입력 UX

| 항목 | 이전 | 이후 |
|------|------|------|
| 차량 정보 **파렛트** 칸 | 기본 표시 `0` | **빈칸** (숫자만 바로 입력) |
| 저장값 0 / 미입력 | `0` 표시 | **빈칸** 유지 |
| 출차카드 수량 | 동일하게 `0` 기본 | **빈칸** |
| 저장 로직 | 빈 입력 → `parseInt \|\| 0` 으로 DB `plt=0` | 동일 (표시만 빈칸) |

관련: `dashboard.html` — `renderDataRow` / `renderPlaceholderRow` / `onPalletChange` / `onVF67QtyChange`

#### C2. VF67 출차카드 입력 유지 (2026-07-24)

| 항목 | 내용 |
|------|------|
| Enter/Tab 권역 이동 | EAST→WEST→…→TW_YAMATO (완료) |
| **새로고침 유지** | 수량·권역을 `POST /departure/api/vehicle-extras` → `vehicle_extras_{date}.json` 저장 |
| 페이지 로드 | `loadVehicleExtras` → LS_DATA에 regions/plt 병합 후 렌더 |
| **삭제 시점** | 카드 **초기화** 또는 차량정보 **초기화** 클릭 시에만 extras 비움 (F5로는 삭제 안 함) |
| 주의 | `regions` 는 DepartureRecord DB 컬럼 없음 → **extras 파일**이 권역 SoT |  

#### D. 스캐너 (세션 병행 · 메트릭 UX 2026-07-24)

| 항목 | 내용 |
|------|------|
| 대분류 모달 | 직접 입력·저장 후 **FE만 에러** 보이던 문제 — 200/201/`success` 성공 처리, 이중 제출 방지 |
| 파일 | `frontend/client/public/barcode_scanner.html` · iframe `dashboard.tsx` `?v=period-need-36px` 등 캐시 버스트 |

**D-1. 입고가능 수량 상한 (계산만 · UI 골격 동일)**

| 이전 이슈 | 수정 |
|-----------|------|
| 기간 합·행 수량이 확정(발주)보다 크게 보임 | `available = min(max(0, hold − stock), orderIn)` |
| 요청 범위 | **숫자 계산만** 변경 — 레이아웃·버튼 구성 유지 |

관련: `calcInboundAvailable`, `getUploadedRowQty`, 사이드바 기간 qty 표시.

**D-2. 상단 메트릭 표시 개선**

| 위치 | 이전 | 이후 |
|------|------|------|
| 좌 · 전산 | 수치 위주 | **36px** 수량 + **아래** 일평균 힌트 `(일평균 x.x/14d)` |
| 중 · N일 입고 가능 | 36px 유지 | 동일 · 값은 확정 상한 반영 |
| 우 · 상태 | 문구만 (`✓ 10일 필요량 충족` 등) | 문구 **바로 아래**에 기간 필요 재고(`hold`) **수량만** |
| 우 · 수량 크기 | 22px (중간 크기) | 전산·입고가능과 **동일 36px** |

DOM: `#valExtraOrderHint` (상태) → `#valPeriodNeedQty` (수량).  
함수: `setExtraOrderHint`, `setPeriodNeedQty`, `setCurrentStockDisplay`, `updatePeriodMetricsUI`.

**D-3. 운영 확인**

| 확인 | 방법 |
|------|------|
| 확정 초과 미표시 | 10/14/30 선택 후 입고가능 ≤ 업로드 확정 |
| 우측 hold | 상태 문구 아래 `N 개` (36px) |
| 캐시 | 스캐너 재진입 또는 iframe `?v=` 변경 후 강력 새로고침 |
| 전체 모드 | 우측 기간 필요 수량 숨김 · 가운데=업로드 수량 |

기능 요약은 **§5.3** 참고.

#### E. 차량 정보 N vs LS M (2026-07-24 확정)

| 상황 | 동작 |
|------|------|
| 차량정보 **0대** | LS 배정 전부 **선등록** (A) |
| **M ≤ N** | 매칭 차량 PDF·등록, **빈 칸만 LS 채움**, 기존 입력 유지 |
| **M &lt; N** | 채울 수 있는 만큼 등록 후 **추가 배차 대기** (10분 재조회) |
| **M &gt; N** (N&gt;0) | **자동 추가 안 함** → UI 확인 창 |
| 확인 **예** | 미등록 LS 차량 **추가** + 미입력 필드 LS 채움 + 접안시간 순 호차 (`plt`/봉인/기존 기사 등 **유지**) |
| 확인 **대기** | 추가 없이 다음 주기 재안내 |

API:

- `GET /departure/api/ls-compare?date=`
- `POST /departure/api/ls-apply-merge` `{ date, confirm: true }`
- `POST /departure/api/ls-defer-merge` `{ date }`

#### F. 운영 체크리스트 (출차·LS)

| 증상 | 확인 |
|------|------|
| 15:00 이후 차량 안 뜸 | `ls_watch`/`supervisor` 프로세스, `.env` LS 계정, log, LS에 VF67_H CONFIRMED 배차 여부 |
| 시간·호차 이상 | `ls_orders_{date}.json` requestTime, `sync_from_ls_orders` 로그 |
| 차량 3대인데 카드 2장 | 강력 새로고침·Departure 재진입, 콘솔 `load ls-data count=` / `VF67 cards render` |
| 저장 후 호차 사라짐 | merge 저장 적용 여부, 의도 삭제만 `replace=1` |
| 파렛트에 0만 보임 | 템플릿 캐시 — Departure 재진입 (`departure-page?_v=…`) |
| LS가 더 많은데 안 늘어남 | 확인 창 §E — `ls-compare` / `ls-apply-merge` |
| **7/23 선택인데 카드 비어 보임** | 새로고침 후 날짜가 오늘로 리셋 → §G · [DEPARTURE_DATE_REFRESH_ISSUE.md](docs/DEPARTURE_DATE_REFRESH_ISSUE.md) |
| **이전→오늘 눌러도 어제 카드 잔존** | 빈 날짜 `LS_DATA` 미갱신/폴백 → §G · [DEPARTURE_PREV_TODAY_ISSUE.md](docs/DEPARTURE_PREV_TODAY_ISSUE.md) |
| **외부 PC 인쇄가 로컬로 감** | 인쇄는 `api/print` **서버 PC** 전용 · `DEPARTURE_PRINTER_NAME` |

#### G. 날짜 선택 · 새로고침 · 이전/오늘 전환 (2026-07-24 해결)

상세 문서 (원인·재현·검증 전부):

| 문서 | 주제 |
|------|------|
| [docs/DEPARTURE_DATE_REFRESH_ISSUE.md](docs/DEPARTURE_DATE_REFRESH_ISSUE.md) | 새로고침 후 “입력 내용 소실”처럼 보임 |
| [docs/DEPARTURE_PREV_TODAY_ISSUE.md](docs/DEPARTURE_PREV_TODAY_ISSUE.md) | 이전/오늘 버튼 전환 시 어제 데이터 잔존 |

**G-1. 새로고침 — 데이터 유실 아님, 조회 날짜 리셋**

| 항목 | 내용 |
|------|------|
| 증상 | 7/23 입력 후 F5 → 카드 0개 / 입력 사라진 것처럼 보임 |
| 실제 | `currentDate = getTodayWorkDate()` 로 **오늘** 조회. DB·`vehicle_extras_{date}.json` 은 정상 |
| 해결 | `_restoreSelectedDate` / `_persistSelectedDate` · 우선순위 URL `?date=` → localStorage → 오늘 작업일 |
| 파일 | `dashboard.html` · `updateDateDisplay()` 에서 영속화 |

**G-2. 이전/오늘 — 빈 응답 시 이전 날짜 잔존**

| 항목 | 내용 |
|------|------|
| 증상 | 이전(7/23 카드 3) → 오늘 클릭해도 **7/23 카드 3 유지** |
| 원인 1 | `loadFromServerAndRender`: `if (serverList.length > 0) LS_DATA = …` → **0건이면 미갱신** |
| 원인 2 | `loadDateData`: 필터 0건이면 `filtered = LS_DATA.slice()` 폴백 → **어제 데이터 표시** |
| 해결 | `LS_DATA = serverList` **무조건 교체** · 폴백 **제거** (빈 날짜 = 빈 화면이 정상) |

**G-3. 기대 동작 (수정 후)**

```text
오늘(데이터 없음)  → 카드 0
이전               → 어제 차량·입력 표시
오늘               → 다시 카드 0 (어제 잔존 금지)
F5                 → 마지막 선택 날짜 유지 + 해당일 데이터 복원
```

관련 코드: `backend/departure/templates/departure/dashboard.html`  
(`loadFromServerAndRender`, `loadDateData`, `_restoreSelectedDate`, `goToday` / `shiftDate`)

---

### 6.0 2026-07-22 — 전산 현재고: 기준일 당일 실출고 차감 (핵심)

#### 배경·증상

- Enhanced 재고(`/inventory/enhanced`)가 **실물보다 크게** 보임  
- DB에 **어제(as_of) 실출고**가 있는데도 현재고에 **반영되지 않음**  
- 예: as_of=2026-07-21, 7/21 실출고 653박스, 전산 총량 = 스냅샷 7,584 (미차감)

#### 잘못된 가정 (구 로직)

```text
스냅샷 = as_of 당일 출고까지 끝난 "클로징 잔고"
→ 출고 차감 조건: outbound_date > as_of  (당일 제외)
```

현장 운영과 불일치:

```text
스냅샷 = as_of 당일 재고 + 입고 (출고 없음)
출고 실적 = 보통 다음날 확인·입력
→ 당일 출고를 빼야 다음 날 현재고가 맞음
```

#### 수정 내용

| 파일 | 변경 |
|------|------|
| `sales_api/inventory_stock.py` | 출고 `gte` / 입고 `gt` 분리, 문서·헬퍼 갱신 |
| `sales_api/views.py` | unified·진단 등 하드코딩 `outbound_date__gt` → 룩업 헬퍼 |
| `sales_api/inventory_reconcile.py` | 출고일 갭 탐지 `>= as_of` |
| `management/commands/diagnose_inventory_stock.py` | 동일 |
| `tests/test_inventory_stock.py` | 당일 출고 차감·입고 비재적용 테스트 |
| `CLAUDE.md` | 중요 규칙 표 갱신 |

#### 검증 (실DB)

| 항목 | 수정 전 | 수정 후 |
|------|---------|---------|
| 출고 룩업 | `gt` | `gte` |
| 7/21 출고 차감 | 0 | **653** |
| 총 현재고 | 7,584 | **6,931** |

#### 운영 체크

1. 스냅샷 업로드 시 **as_of = 재고 파일 기준일** (재고+입고 의미)  
2. 출고 시트 동기화 후 Enhanced 새로고침 → 해당 일·이후 실출고 반영 확인  
3. 예측 출고는 재고에 안 들어감 (의도)  
4. gunicorn 사용 시 **백엔드 재시작** 후 확인  

---

### 6.0b 2026-07-21~22 — 출차 KPP EDI (등록·인쇄, 삭제 없음)

| 항목 | 내용 |
|------|------|
| UI | Departure 📦 KPP → `GET /departure/api/print-kpp/<호차>?plt=&date=` |
| 흐름 | 기존 등록 확인 → **있으면 갱신 / 없으면 신규** → EDI PDF → GDI 90° 인쇄 |
| 삭제 | **운영 경로에 fn_delete 없음** (테스트 CLI만 옵션) |
| 세션 | Chrome CDP `:9222`, `backend/kpp_session.py`, `.env` KPP 자격증명 |
| 등록 확인 | `GET /departure/api/kpp-check/<호차>` · CLI `python kpp_session.py --step check1` |

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
| (구) 이중 차감 방지 | as_of 당일 입출고 모두 `>` only — **출고 미차감 부작용** → **6.0에서 출고만 `>=`로 수정** |
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
| 2026-07 | 현재고 출고 `>= as_of`, Departure LS/차량정보 N, 스캐너 입고가능 확정 상한·메트릭 36px (§5.3 · §6.0c D) |
| 2026-06 | 하네스 4기둥·CLAUDE 컨텍스트, production-log 업로드 unit 컬럼 수정, 출차 통합·VehicleOrderService 단일 진입점 |
| 2026-05 | production-log 삭제 405 → bulk-delete, 입고 가능 수량 탭 |
| 2026-04 | 생산 계획·Enhanced 재고·AI 파서 등 기반 구축 |

---

## 7. 운영 시 자주 하는 작업

| 작업 | 방법 |
|------|------|
| 재고 스냅샷 업로드 | Enhanced → 기준 재고 파일 (**as_of = 재고+입고 기준일**, 출고 미포함 의미) |
| 입고 반영 | receipts 업로드 (`receipt_date > as_of` 만 현재고 가산) |
| 출고 반영 | 구글시트 동기화 (`/api/outbound/sync` 또는 `daily_outbound_sync`) → **as_of 당일~ 실출고 자동 차감** |
| 현재고 검산 | `diagnose_inventory_stock` / 스냅샷 − 당일~출고 + 이후입고 |
| VF 재정렬 | Enhanced → 현재고→VF 지정 |
| 마스터 일괄 수정 | 양식 다운로드 → 수정 → 양식 업로드 |
| 스캐너 로케이션 | 수동 입력 적용 (BM 저장 확인) |
| 스캐너 기간 메트릭 | 10/14/30 선택 → 좌 전산·중 입고가능(확정 상한)·우 상태+필요 재고(hold) — §5.3 |
| 생산 일지 반영 | 파일 또는 텍스트 붙여넣기 (**헤더 권장**, 없어도 동작) |
| KPP 전표 | Chrome CDP 로그인 후 Departure 📦 KPP (삭제 없음) |

---

## 8. 테스트·품질

```bash
# 재고 공식 (필수)
cd backend && python manage.py test sales_api.tests.test_inventory_stock

# 백엔드 광범위
python manage.py test sales_api.tests

# 현재고 진단 (read-only)
python manage.py diagnose_inventory_stock

# E2E
# tests/e2e/ — Playwright 스펙 참고
```

재고 공식 변경 시 **반드시** `inventory_stock.py`만 수정하고  
단위 테스트 + 수동 검산(`baseline + rcv − out`, 출고는 **as_of 포함**)을 확인.

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
| [CLAUDE.md](CLAUDE.md) | API 규칙, **재고 현재고 공식**, 하네스, 변경 이력 |
| [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | 폴더 구조 |
| [docs/VF_ORDER_XLSX_MAPPING.md](docs/VF_ORDER_XLSX_MAPPING.md) | 발주서·스캐너 컬럼 |
| [docs/OUTBOUND_DASHBOARD_README.md](docs/OUTBOUND_DASHBOARD_README.md) | 출고 대시보드·일일 시트 동기화 |
| [docs/DELIVERY_PREDICTION_FIX_PLAN.md](docs/DELIVERY_PREDICTION_FIX_PLAN.md) | Delivery 시간별·일별 예측 |
| [docs/DEPARTURE_DATE_REFRESH_ISSUE.md](docs/DEPARTURE_DATE_REFRESH_ISSUE.md) | 출차: 새로고침 시 날짜 리셋(데이터 유실 아님) |
| [docs/DEPARTURE_PREV_TODAY_ISSUE.md](docs/DEPARTURE_PREV_TODAY_ISSUE.md) | 출차: 이전/오늘 버튼·빈 날짜 LS_DATA 잔존 |
| [docs/INBOUND_STOCK_BASED_RECOMMEND_PLAN.md](docs/INBOUND_STOCK_BASED_RECOMMEND_PLAN.md) | 입고 가능: 발주 없을 때 10/14/30 보유·권장 입고 (**구현**) |
| [docs/INVENTORY_VARIANCE_TAB_PLAN.md](docs/INVENTORY_VARIANCE_TAB_PLAN.md) | 재고 차이 탭 계획 |
| [docs/CATEGORY_MASTER_VS_INVENTORY.md](docs/CATEGORY_MASTER_VS_INVENTORY.md) | 분류 마스터 vs 재고 |
| [docs/archive/](docs/archive/) | 과거 설치·리뉴얼 문서 |
| 코드 | `backend/sales_api/inventory_stock.py` · `backend/kpp_session.py` · `backend/ls_automation.py` · `backend/ls_watch_supervisor.py` · `backend/departure/` |

---

## 부록. 빠른 체크리스트 (최근 이슈)

| 증상 | 확인/조치 |
|------|-----------|
| **전산 재고 > 실물, 어제 출고 안 빠진 듯** | as_of 당일 실출고 DB 여부 → `outbound_date >= as_of` 적용 여부(§2.1·§6.0), 백엔드 재시작, 시트 동기화 |
| 출고는 있는데 재고 변화 없음 | 예측(`is_estimated`)인지 / 바코드 공백·불일치 / 스냅샷 as_of보다 **이전** 일자 출고인지 |
| 23:00 예측이 비정상 | `hour_23` 기준인지, `total` 오염(9배) 여부, Ctrl+F5 |
| 날짜 라벨이 오늘로 밀림 | 구 캐시 JS — 강력 새로고침; 로컬 오늘/내일 비교 |
| 차량 순서 “파싱 불가” | `POST /departure/api/vehicle-order`, 줄에 `N호`+번호판, 서버 재시작 |
| 접안 횟수 0/고정 | enrich 후 DB `last_seen`/`total_orders` 갱신 여부 |
| **LS 자동 등록 안 됨** | §6.0c — watch/supervisor·LS 배차 0건·로그·매일 15:00 창 |
| **차량 N대인데 출차카드 M장** | §6.0c B — 카드=차량 정보 수, merge 저장, 숨김 비활성, SPA `?_v=` 갱신 |
| **접안 시간이 13:00 등 고정값** | §6.0c A — LS requestTime SoT, `sync_from_ls_orders` |
| **파렛트에 0이 박혀 입력 불편** | §6.0c C — 빈칸 표시 (0은 저장만) |
| **새로고침 후 카드 비움(데이터 사라진 듯)** | §6.0c G-1 — 날짜 리셋. localStorage/`?date=` · [DATE_REFRESH 문서](docs/DEPARTURE_DATE_REFRESH_ISSUE.md) |
| **오늘 눌러도 어제 출차카드 남음** | §6.0c G-2 — `LS_DATA` 무조건 교체·폴백 제거 · [PREV_TODAY 문서](docs/DEPARTURE_PREV_TODAY_ISSUE.md) |
| KPP “행 없음”/인쇄 실패 | CDP :9222·로그인·PBM140, 기존 등록 확인 후 갱신 경로, iframe PDF URL |
| **LS 인쇄 품질 저하(흐림)** | §6.0d — GDI 비트맵 폐기됨. API `/api/print` → **printto 벡터** 확인. UI 클릭 불필요 |
| Vite proxy ECONNRESET | 백엔드 5176 단일 실행, OpenRouter 지연 시 로컬 폴백 |
| AI 과금 우려 | OpenRouter는 `*:free` 만 허용 |

---

### 2026-08-10 — 전산재고: VF 마스터 비단종 0재고 포함
- `inventory_unified` universe = 업로드 바코드 + 이후 입고 + **VF 마스터(비단종)**
- 재고 0이면 `stockStatus=critical` (긴급). 3개월 미출고/단종은 마스터에서 수동 정리.


### 2026-08-10 — 전산재고 ↔ 제품마스터 수정 UI 연동
- 전산재고 테이블 **우측 수정(연필) 아이콘** → 마스터와 동일 `SpecEditDialog` (`components/master/spec-edit-dialog.tsx`)
- 저장: `PUT /api/master/specs/:id` (마스터 페이지와 동일)
- 선택 일괄: `PATCH /api/master/specs/bulk-update` + 양쪽 캐시 무효화
- 마스터 수정 시 `enhanced-inventory-overview` 도 갱신

### 6.0e 2026-08-10 — VF MCP (Hermes 즉시 실행)
- 경로: `E:/coding/skill/VF/vf-mcp-server`
- Hermes `mcp_servers.vf` — 출차 권역/PLT/인쇄, 재고 조회, 생산 등록을 **REST 1회 tool**로 호출
- 브라우저/Playwright 루프 제거 목적 (지연 단축)
- 상세: Wiki `의사결정/VF-MCP-서버-20260810.md` · skill `vf-ops-mcp`
- **참고 (KPP MCP도 동일 보안 적용)**: mcp>=1.0.0 → <2, venv Py3.13→3.11 (2026-08-10, `의사결정/KPP-MCP-v2-보안-20260810.md`)
- **출력 이력 (PrintLog)**: LS/KPP 출력 시 로그 저장 (2026-08-10) — `GET /departure/api/print-logs`, 대시보드 🖨️ 패널

## 6.0d 출차 LS/KPP 인쇄 방법 (2026-08-09 확정)

### 문제 (수정 전)
- 서버 `_print_pdf_on_server()`가 PDF를 **PyMuPDF 300dpi 비트맵 → win32ui GDI**로 출력
- 벡터(텍스트/선)가 래스터로 변환되어 **인쇄 품질 현격 저하**
- 우회로 UI 버튼 클릭을 쓰면 느리고 팝업 확인 단계가 생김

### 수정 내용
| 항목 | 이전 | 현재 (2026-08-09) |
|------|------|-------------------|
| LS 서버 인쇄 | GDI 비트맵 (품질 저하) | **`ShellExecute("printto")` 벡터 PDF 원본** |
| KPP 서버 인쇄 | GDI 150dpi 비트맵 우선 | **벡터 회전 + printto** (`kpp_session._print_pdf_file`) |
| 코드 LS | `backend/departure/views.py` `_print_pdf_on_server` | 동일 함수, GDI 경로 제거 |
| 코드 KPP | `backend/kpp_session.py` `_print_pdf_file` | GDI 경로 제거, printto 우선 |
| 프린터 | Canon G2010 series 명시 | 동일 (Windows 기본 ZM600 라벨 함정 회피) |
| 에이전트 호출 | UI 클릭 시도 / curl API | **curl/스크립트 1회** (표준) |

### 표준 호출
```bash
# LS (봉인씰 합성 + printto 벡터 인쇄)
curl -s "http://localhost:5176/departure/api/print/{호차}?plt={N}&date={YYYY-MM-DD}&seal_leftWing=...&seal_rightWing=...&seal_backDoor=..."

# KPP (등록+EDI 인쇄) — printto 벡터 (2026-08-09, GDI 150dpi 폐기)
python E:/coding/VF-new/backend/scripts/vf_kpp_print.py <호차> <plt> [날짜]
# 또는
curl -s "http://localhost:5176/departure/api/print-kpp/{호차}?plt={N}&date={YYYY-MM-DD}"
```

### 규칙
- LS/KPP 모두 **API/스크립트 직접 호출**이 표준. 웹 UI 버튼 클릭(Playwright)은 비표준.
- LS/KPP 성공 응답에 `printto` 문구가 있어야 함. GDI/비트맵 경로 재도입 금지.
- KPP 코드: `backend/kpp_session.py` `_print_pdf_file` — 벡터 회전(fitz) + printto.
- 상세 Runbook: Wiki `의사결정/VF-출차관리-권역별-수량-음성합산-입력-20260803.md` §4·§5

---

## 11. 라이선스·저장소

사내 운영 프로젝트 (보노하우스 VF).  
문의·배포 정책은 저장소 관리자 기준.
