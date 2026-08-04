# VF-new 프로젝트 구조 (정리 후)

> 전체 개요·페이지·재고 공식·변경 이력: 루트 [`README.md`](../README.md)  
> 에이전트 필수 규칙(재고·API): [`CLAUDE.md`](../CLAUDE.md)

## 앱 코어

```
backend/                 Django (port 5176)
  config/                settings, root URLs
  departure/             출차 대시보드 + LS/KPP 인쇄 + scanner API
  sales_api/             재고·출고·입고·생산·바코드 마스터·AI
    inventory_stock.py   ★ 전산 현재고 단일 공식 (2026-07-22: 출고 >= as_of)
  truck_freight/         용차 운임
  kpp_session.py         KPP WPPS CDP 세션 (등록·인쇄, 삭제 없음)
frontend/client/         React+Vite (port 5174)
  public/barcode_scanner.html   입고 스캐너 (발주서 xlsx)
  src/pages/             delivery, outbound, inventory, production, master, …
  src/components/        inventory/, master/, outbound-*, ui/
```

## 페이지 경로 (요약)

| 경로 | 모듈 |
|------|------|
| `/delivery` | 출고 현황·시간별 예측 |
| `/outbound` | 출고 분석 |
| `/inventory/enhanced` | 전산 재고 (unified API) |
| `/production` · `/production-app` | 생산 계획 · 모바일 PIN |
| `/master` | 제품 마스터 |
| `/barcode` · `/scanner` | 바코드 생성 · 입고 스캔 |
| `/departure` | 출차·LS·KPP |
| `/truck-freight` | 트럭 운임 |

## 문서

| 위치 | 용도 |
|------|------|
| `README.md` | **프로젝트 본문** (구성·페이지·재고 공식·이력) |
| `CLAUDE.md`, `DESIGN-LANGUAGE.md` | AI/디자인 규칙 (루트 유지) |
| `docs/` | 기능 스펙·구현 노트 |
| `docs/archive/` | 과거 계획/리포트/Windows 가이드 |
| `docs/VF_ORDER_XLSX_MAPPING.md` | 발주서 컬럼 공통 스펙 |
| `docs/OUTBOUND_DASHBOARD_README.md` | 출고 대시보드·시트 동기화 |
| `docs/PROJECT_STRUCTURE.md` | 이 문서 (폴더 지도) |

## 디자인 시드 (루트 유지)

`components/`, `css/`, `tokens/`, `icons/`, `utils/` — Toss Seed.  
`.claude/skills` 가 루트 경로를 참조하므로 **이동하지 않음**.

## 도구/부가

판정 기준·재설치: [`docs/TOOL_FOLDERS.md`](TOOL_FOLDERS.md)

| 유지 | 비고 |
|------|------|
| `.claude/skills/playwright-cli/` | 에이전트 스킬 문서 |
| `frontend` playwright 패키지 | E2E (`@playwright/test`) |
| `tests/e2e/` | VF Playwright 스펙 |

| 제거됨 (2026-07-10 3차) | 이유 |
|--------------------------|------|
| `playwright-cli/` | 외부 클론 (자체 `.git`) → `npm i -g @playwright/cli` |
| `opencode-telegram-bot/` | 별도 봇 레포 |
| `.playwright*` 세션 | 스냅샷/로그 캐시 |
| `antigravity-*` / `.codegraph` | 에이전트·그래프 캐시 |

## 레거시 제거됨 (2026-07 클린업)

- `departure-dashboard/` → Django `backend/departure` 로 통합
- backend `upload_*.json`, sqlite bak, yt_*, graphify-out 등 임시 산출물
- 미사용 `inventory-tab-backup.tsx`, `tmp_outbound_tabs.tsx`
- 도구 폴더 3차 정리 (위 표)
