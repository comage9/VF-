# VF-go 이관 대기: VF-new 출차(departure) 모듈 변경사항 (2026-08-07)

> **작성일:** 2026-08-07
> **대상:** VF-go V시리즈(departure/LS) 작업 에이전트
> **목적:** VF-new에서 2026-08-07 실사용 중 발견된 API/로직 변경사항을 VF-go 이관 시 반영하도록 기록

---

## 현재 VF-go 상태

- **departure 모듈: 미구현** — INDEX.md `V | departure/LS — Python 병행 권장` 후보 상태
- VF-new의 출차 관리 전체(차량 정보, 권역 입력, LS 인쇄, KPP EDI, 봉인씰)가 Go로 이관되어야 함

---

## ⚠️ 이관 시 반드시 반영해야 할 변경사항 (2026-08-07)

### 1. 권역/파레트 저장 = `/api/vehicle-extras` (NOT `/api/ls-data`)

**VF-new 현재 동작:**
- `GET/POST /departure/api/vehicle-extras` → `vehicle_extras_{date}.json`
- `GET/POST /departure/api/ls-data` → 차량 정보(plate, driver, ton 등)만. **regions 필드 무시**

**Go 이관 시:**
- `/api/vehicle-extras` GET/POST 라우트 필수 구현
- payload: `{date, extras: {호차번호: {plt, regions: {EAST, WEST, MIDDLE, GMH, DGU, GWJ, TW_YAMATO}, departTime, pltTime}}}`
- POST는 **전체 extras 덮어쓰기** — 부분 POST 시 다른 호차 데이터 소실
  - Go 구현 시 부분 갱신을 지원하거나(merge), 덮어쓰기 방식을 문서에 명확히 기록할 것

### 2. departTime / pltTime 필수 필드

**VF-new 현재 동작:**
- 프론트 JS: 권역 입력 시 `new Date()` → `departTime`, 파레트 입력 시 → `pltTime` (HH:MM)
- API POST 시 시간 미포함 → 출차시간/출고시간 빈칸

**Go 이관 시:**
- `vehicle_extras` 스키마에 `departTime`, `pltTime` 필드 포함
- 클라이언트가 시간을 안 보내면 서버에서 `time.Now()`로 자동 채우는 것을 권장 (VF-new는 안 함 → 에이전트가 수동으로 넣어야 함)

### 3. KPP EDI 인쇄 = Chrome CDP 의존

**VF-new 현재 동작:**
- `/departure/api/print-kpp/{hoche}?plt={N}&date={DATE}`
- 내부적으로 `kpp_session.py` → Chrome CDP :9222 → WPPS PBM140MW SpreadJS 조작
- 등록(register) + EDI 전표 인쇄(GDI, Canon G2010)

**Go 이관 시:**
- CDP 자동화는 Go에서 직접 구현 불가 → **Python 마이크로서비스 유지 권장** (INDEX.md "Python 병행 권장"과 일치)
- Go API → Python subprocess 호출 또는 HTTP 프록시 패턴
- 차량번호 규칙: KPP는 숫자만 6자리 ("경기89바1454" → "891454")

### 4. LS PDF 인쇄 + 봉인씰 합성

**VF-new 현재 동작:**
- `/departure/api/print/{hoche}?plt={N}&date={DATE}&seal_leftWing=X&seal_rightWing=Y&seal_backDoor=Z`
- `vehicle_order_service.get_pdf_path(plate, date)` → PDF 경로 조회
- 봉인씰 값 있으면 `.sealed.pdf` 합성본 생성 → 인쇄
- 봉인씰 없으면 원본 PDF 인쇄 + 경고 토스트
- 봉인씰 입력 없이도 출력 차단 안 됨 (2026-08-07 확인)

**Go 이관 시:**
- PDF 합성은 PyMuPDF 사용 → Go에서 직접 불가, Python 의존
- `get_pdf_path` 로직: 차량번호 본문 매칭 → `{plate}.pdf`, fallback `{hoche}_slip.pdf` (본문 검증 필수)

### 5. 봉인씰 별도 저장 API

**VF-new 현재 동작:**
- `vehicle_order_service.save_seals(plate, date, payload)` / `get_seals(plate, date)`
- 봉인씰은 DB(OutboundRecord 또는 VehicleOrder)에 plate+date 기준 별도 저장

**Go 이관 시:**
- 봉인씰 CRUD API 별도 구현
- plate + date 복합키로 조회/저장

---

## VF-new API 라우트 맵 (departure 전체 — 2026-08-07 기준)

| 라우트 | 메서드 | 용도 | 비고 |
|:-------|:------:|:-----|:-----|
| `/departure/api/ls-data` | GET | 차량 정보 조회 | plate, driver, ton, seals |
| `/departure/api/ls-data` | POST | 차량 정보 저장 | ⚠️ regions 무시됨 |
| `/departure/api/vehicle-extras` | GET | 권역/파레트/시간 조회 | `vehicle_extras_{date}.json` |
| `/departure/api/vehicle-extras` | POST | 권역/파레트/시간 저장 | 전체 덮어쓰기 |
| `/departure/api/print/{hoche}` | GET | LS PDF 인쇄 | 봉인씰 합성 포함 |
| `/departure/api/print-kpp/{hoche}` | GET | KPP 등록+EDI 인쇄 | CDP 9222 필요 |
| `/departure/api/kpp-check/{hoche}` | GET | KPP 등록 여부 확인 | 읽기 전용 |
| `/departure/api/ls-sync` | GET/POST | LS 데이터 동기화 | DB 기반 |
| `/departure/api/kpp-session` | GET | CDP/WPPS 세션 상태 | |

---

## VF-go 작업 에이전트 권고사항

1. **V시리즈(departure) 시작 전 본 문서 확인 필수**
2. **Python 병행 권장** — KPP CDP, LS PDF 합성은 Python 그대로 유지, Go는 라우팅/DB만 담당
3. **vehicle_extras POST 동작을 Go에서 변경 고려** — 부분 갱신(merge) 지원 시 덮어쓰기 문제 해결
4. **departTime/pltTime 자동 생성** — Go에서 `time.Now()`로 서버 채우면 API 호출자가 신경 안 써도 됨

---

## 관련 문서
- VF-new Wiki Runbook: `Wiki-okf/의사결정/VF-출차관리-권역별-수량-음성합산-입력-20260803.md`
- VF-go INDEX: `E:\coding\VF-go\docs\handoff-tasks\INDEX.md` (V 시리즈 후보)
- VF-go REMAINING_SCOPE: `E:\coding\VF-go\docs\handoff-tasks\REMAINING_SCOPE.md`
- 스킬: `vf-go-migration`, `django-go-api-migration`
