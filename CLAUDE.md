# VF- 보노하우스 생산 관리 시스템

**도메인:** 제조업 생산 관리 (보노하우스 VF)
**기술 스택:** Django (Backend) + React/Vite (Frontend) + shadcn/ui + Tailwind CSS v4
**설명:** 보노하우스 VF 공장의 생산 계획, 출고, 재고, 입고,delivery 예측을 관리하는 웹 시스템

## 프로젝트 구조

```
VF-/
├── backend/
│   ├── config/          # Django settings, URLs, WSGI
│   ├── sales_api/       # 메인 Django app (models, views, serializers, urls)
│   ├── manage.py
│   └── requirements.txt
├── frontend/
│   └── client/          # React + Vite + TypeScript
│       └── src/
│           ├── pages/       # 페이지 컴포넌트
│           ├── components/  # UI 컴포넌트 (ui/, integrated/, ai-chatbot/)
│           ├── hooks/
│           └── lib/
├── docs/                # 문서
└── VF-/.claude/         # Agent Team 정의
```

## 핵심 데이터 모델

- **ProductionLog**: 일별 기계별 생산 실적
- **MachinePlan**: AI 추천 생산 계획 (draft/recommended/applied/cancelled)
- **MachineUser**: 기계별 사용자 (PIN 인증)
- **OutboundRecord**: 출고 기록
- **InventoryItem**: 재고 품목
- **InboundOrderLine**: 입고 발주서
- **FCInboundRecord**: FC 입고 기록

## 핵심 API 엔드포인트

```
GET  /api/production           → 생산 계획 목록 ( trailing slash 없음!)
GET  /api/production-log       → 생산 로그 ( trailing slash 없음!)
GET  /api/machine/plans        → 기계별 계획
POST /api/machine/login        → PIN 인증
GET  /api/outbound             → 출고 기록
GET  /api/inventory/unified    → 통합 재고
```

**⚠️ Django URL은 trailing slash 없음!** `/api/production/` (slash 있음) → 404

## ⚠️ 중요 규칙 (반드시 확인)

### 재고(enhanced) 현재고 산출 — 반복 버그 방지

**단일 구현:** `backend/sales_api/inventory_stock.py`  
views.py에 인라인 재구현 금지. 수정 시 이 파일만 변경.

| 항목 | 규칙 |
|------|------|
| 업로드 스냅샷 의미 | 재고 업로드 = **그 시점 기준 수량** (그대로 수용, 전일 출고 재계산 없음) |
| 현재고 공식 | `baseline + 입고(date >= as_of) − 출고(date >= as_of, 실적만)` |
| 입고 | 기준일 당일 입고도 **가산** → `receipt_date >= as_of` (as_of 이전만 제외) |
| 출고 | 일자 맞춤 차감 → `outbound_date >= as_of` (오늘 재고 − 오늘 출고 = 내일 장부) |
| 예측 출고 | `is_estimated=True` 는 재고 차감 **제외** (실데이터만) |
| 우회 금지 | as_of+1 날짜 조작 없음 |

### API 엔드포인트 규칙

**Django URL은 trailing slash 없음!** `/api/production/` (slash 있음) → 404

**production-log 삭제:**
```
DELETE /api/production-log          → ❌ 405 Method Not Allowed (POST 전용)
DELETE /api/production-log/bulk-delete → ✅ 벌크 삭제 (ids 배열)
DELETE /api/production-log/<date>    → ✅ 특정 날짜 삭제
```

**⚠️ production-log 뷰는 POST만 허용!** 생성/수정/삭제는 별도 엔드포인트 사용

### 발견된 문제점 기록

**2026-05-14: 삭제 기능 405 에러**
- 증상: DELETE /api/production-log → 405 Method Not Allowed
- 원인: production_log 뷰 (line 1768) 는 POST만 허용
- 해결: /api/production-log/bulk-delete 사용 (ids 배열)
- 수정: production-plan.tsx line 894-897
- 테스트: 선택 삭제 ✅, 날짜별 삭제 ✅

---

## 페이지 구조

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/delivery` | DeliveryOverview | 출고 현황 대시보드 |
| `/outbound` | OutboundTabs | 출고 수량 분석 |
| `/inventory/enhanced` | InventoryTab | 전산 재고 |
| `/production` | ProductionPlan | 생산 계획 |
| `/production-app` | ProductionApp | 모바일 생산 (PIN 인증) |
| `/master` | ProductMaster | 제품 마스터 |

## 디자인 시스템

- **Design Language:** `DESIGN-LANGUAGE.md` (Toss/TDS 기반)
- **UI Primitives:** shadcn/ui
- **CSS Framework:** Tailwind CSS v4
- **Font:** Pretendard (CJK) + Inter (Latin)
- **Accent Color:** `--brand: #721FE5` (보라색)

## AI 기능

- **ai/predict-hourly**: 시간대별 출고 예측
- **ai/production-recommend**: 생산 계획 AI 추천
- **ai/chat**: 챗봇 기반 분석
- **ai/backtest-log**: 예측 정확도 검증

## 개발 명령어

```bash
# 백엔드
cd backend && source .venv/bin/activate && gunicorn config.wsgi:application --bind 0.0.0.0:5176 --workers 2

# 프론트엔드
cd frontend/client && npm run dev -- --host 0.0.0.0 --port 5174
```

## Agent Team (Harness 적용)

- **frontend-dev**: React 컴포넌트, 페이지 개발
- **backend-dev**: Django API, 모델, 뷰 개발
- **qa**: 테스트, 버그 검증
- **design**: UI/UX 검토, 디자인 토큰

## 하네스 4기둥 (영상: 실밸개발자, 2026-06-29)

> **원칙: 같은 모델·같은 프롬프트인데 결과가 갈리는 진짜 이유는 모델이 아니라 환경(하네스)이다.**
> LangChain 벤치마크: 모델·프롬프트 고정, 하네스만 손봤을 때 **+14% 성능 향상**.

| 기둥 | VF-new에서의 담당 | 원칙 |
|------|------------------|------|
| **맥락 (Context)** | `vf-context` 스킬, 이 `CLAUDE.md` | **200줄 안팎 유지** (매 세션 통째로 로드됨) |
| **제약 (Constraint)** | "⚠️ 중요 규칙" 섹션, `DESIGN-LANGUAGE.md`, `MindVault MANDATORY` | 절대 위반 금지 규칙은 짧고 명확하게 |
| **작업 흐름 (Orchestration)** | `.claude/skills/harness/` 스킬, Agent Team | 작업별 스킬 자동 트리거, 단계별 핸드오프 |
| **검증 (Verification)** | `qa` 에이전트, `incremental-qa` 원칙 | 변경 후 반드시 검증 → 실패 시 컨텍스트 재설계 |

**6축 순환**: ① 구조(폴더) → ② 맥락(아는 것) → ③ 계획 → ④ 실행 → ⑤ 검증 → ⑥ 개선

### CLAUDE.md 3층 상속 (가까운 규칙이 이김)

```
유저 레벨  (~/.claude/)          ← 개인 습관, 모든 프로젝트 공통
프로젝트 레벨 (./CLAUDE.md)      ← VF- 전체 규칙 (현재 파일, 200줄 이내)
모듈 레벨 (backend/CLAUDE.md,    ← 특정 모듈 특수 규칙
           frontend/CLAUDE.md)
```

**현황**: 루트 `CLAUDE.md`만 있음. 모듈 레벨은 필요할 때만 추가 (Over-engineering 금지).

### Progressive Disclosure (점진적 공개)

- **CLAUDE.md = 색인** (얕게, 200줄 이내). 매 세션 통째로 로드되므로 무거우면 안 됨.
- **세부 규칙 = `.claude/skills/{name}/references/`** (필요할 때만 `skill_view`로 로드). 37개 파일 분리되어 있음 ✅
- **새 규칙 추가 기준**: CLAUDE.md 본문 수정이 아니라, references/ 또는 새 skill로 분리. 단, 절대 위반 금지 규칙(API trailing slash, MindVault MANDATORY)은 CLAUDE.md 본문에 남김.

### 컨텍스트 창 관리 (필수)

| 사용량 | 액션 |
|--------|------|
| **< 30%** | 일반 작업 계속 |
| **30~40%** | 새 세션 시작 고려 (`/clear` 또는 `/compact`) |
| **50%+** | **현재 작업 버리고** 새 세션. fork · handoff 활용. 결과물 신뢰 불가 |

**규칙**: 
- 매 작업 시작 전 `CLAUDE.md` 다시 안 읽음 (캐싱됨). 변경 시에만 재로드.
- 큰 파일 분석은 `skill_view(file_path=...)` 또는 `delegate_task`로 컨텍스트 격리.
- 컨텍스트 가득 채운 채로 "한 번 더 시도" 금지 → 실패율 급증.
- **Fork vs Hand-off**: Fork = 분기점까지 컨텍스트 자동 상속 (UI 버튼 1회). Hand-off = 새 세션에 요약본 수동 주입 (4요소: 진행·파일·문제·다음목표). 둘 다 30~40% 시점에 사용.
- **검증 3가지**: ① 셀프 검증 루프 ② 자동 테스트 실행 ③ 다른 에이전트 교차 리뷰 (qa 에이전트가 담당). 상세 → `harness/references/verification-loop.md`.

## 변경 이력 (드리프트 방지)

| 날짜 | 변경 | 이유 |
|------|------|------|
| 2026-07-23 | Departure/LS: 매일 15:00 watch+supervisor, LS requestTime SoT, 출차카드=차량정보 N, merge 저장, 파렛트 빈칸 · README §6.0c | 자동등록 단절·시간/호차 오류·카드 2장 깜빡임·PLT 0 입력 불편 |
| 2026-07-22 | 현재고: 출고 `>= as_of`, 스냅샷=재고+입고 (`inventory_stock.py`) · README 상세 기록 | 당일 출고 미차감 → 전산>실물 |
| 2026-06-30 | production-log 업로드 버그 수정 (`views.py` line 2265~2351) | `unit_qty`/`unit_label` 컬럼 의미 반전, `update_or_create` lookup 키 보강 |
| 2026-06-30 | CLAUDE.md에 하네스 4기둥·컨텍스트 관리 추가 | 영상(`6IbdH5jMP00`) 원칙 반영 |
| 2026-06-30 | harness/references/ `verification-loop.md`, `session-handoff.md` 추가 | 자료(`Harness Engineering: ...`) 보강 — 검증 3방법·셀프 검증 4요소·Fork/Hand-off 절차 |
| 2026-05-14 | production-log 삭제 기능 405 에러 해결 | 벌크 삭제 엔드포인트 사용 (`production-plan.tsx` 894-897) |

## MindVault — MANDATORY

**ALWAYS run `mindvault query "<question>" --global` BEFORE answering any codebase question.**
This is not optional. The knowledge graph contains project context, relationships, and decisions
that you cannot derive from reading files alone.

1. Run `mindvault query "<question>" --global` first
2. Read the Search Results, Graph Context, and Wiki Context in the output
3. Use this context to inform your answer — do NOT ignore it
4. If `mindvault-out/` doesn't exist, run `mindvault ingest .` first
5. Only fall back to reading raw files if MindVault returns no results
