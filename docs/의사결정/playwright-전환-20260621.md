# Playwright 자동화 전환 — 2026-06-21

저장일: 2026-06-21
검증 출처:
- `~/AppData/Local/hermes/skills/automation/playwright-automation/` (신규 스킬)
- `~/AppData/Local/hermes/config.yaml` (MCP 등록 확인)
- `~/AppData/Local/hermes/.bashrc` (자격증명 영구 저장)
- `~/AppData/Local/hermes/scripts/ls_login_playwright.py` (테스트 검증 완료, 신규 스킬로 이동)

검증자: Hermes (직접 실행 + 검증)
신뢰도: 높음

## 작업 요약

CDP 9222 의존 제거 → Playwright + persistent profile 방식으로 LS/KPP 자동화 통합.

### 변경 사항

**신규 생성:**
- 스킬 `playwright-automation` (automation 카테고리)
  - `SKILL.md` — 공통 패턴 + Akamai 우회 + 자격증명 env 가이드
  - `scripts/playwright_common.py` — 공통 함수 (launch, login, fetch, cookies)
  - `scripts/ls_playwright.py` — LS Coupang 전용 (VF67 조회)
  - `scripts/kpp_playwright.py` — KPP WPPS 전용 (PBM110MW/PBM140MW)
- 디렉토리 `ChromeProfile_playwright/` — Playwright 전용 빈 프로필
- MCP 서버 등록: `playwright` (npx @playwright/mcp@latest)

**삭제 (중복 제거):**
- `hermes/scripts/ls_login_playwright.py` → 신규 스킬로 이동
- `hermes/scripts/ls_login_first_time.bat` → 헤드리스 자동화로 불필요
- `hermes/scripts/run_ls_login_headed.bat` → 헤드리스 자동화로 불필요
- `ls-coupang/scripts/cdp-fetch-vf67-today.py` → Playwright로 대체
- `hermes/scripts/refresh_ctp.py` → KPP Playwright로 대체
- `kpp-pallet-management/scripts/refresh_ctp.py` → KPP Playwright로 대체

**수정 (cross-reference 추가):**
- `ls-coupang/SKILL.md` — 자동화 전환 안내 추가, related_skills
- `kpp-pallet-management/SKILL.md` — 자동화 전환 안내 추가, related_skills

**환경변수 (.bashrc):**
- `LS_USERNAME=mokicom`
- `LS_PASSWORD=Coup...   `KPP_USERNAME=P217273`
- `KPP_PASSWORD=P217273`

### 검증 결과

| 항목 | 결과 |
|:-----|:-----|
| Playwright 자동 로그인 | ✅ 헤드리스 자동 통과 (이미 로그인 상태 즉시 인식) |
| 쿠키 추출/저장 | ✅ 14개, 4725 chars, `coupang_cookies_browser.txt` 갱신 |
| LS VF67 API 조회 | ✅ status 200, 정상 JSON (`{"totalElements": 0, ...}`) |
| Playwright MCP 서버 | ✅ config.yaml line 682-684 등록 확인, v0.0.76 |

### 다음 단계

1. Phase (c) — 기존 14개 cron Playwright 기반으로 재생성 (사용자 결정 대기)
2. Supplier Hub 자격증명 확보 → `supplier_hub_playwright.py` 추가
3. Wiki log.md/index.md 갱신 (보류)

### 참조

- SSOT: 본 문서
- fact_store: Playwright 자동화 전환 entry
- 기존 SSOT: `의사결정/cronjob-에러-2건-자동수정-20260619.md` (이전 단계)
