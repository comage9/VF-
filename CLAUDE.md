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
cd backend && source .venv/bin/activate && python manage.py runserver 0.0.0.0:8000

# 프론트엔드
cd frontend/client && npm run dev -- --host 0.0.0.0 --port 5174
```

## Agent Team (Harness 적용)

- **frontend-dev**: React 컴포넌트, 페이지 개발
- **backend-dev**: Django API, 모델, 뷰 개발
- **qa**: 테스트, 버그 검증
- **design**: UI/UX 검토, 디자인 토큰

## MindVault — MANDATORY

**ALWAYS run `mindvault query "<question>" --global` BEFORE answering any codebase question.**
This is not optional. The knowledge graph contains project context, relationships, and decisions
that you cannot derive from reading files alone.

1. Run `mindvault query "<question>" --global` first
2. Read the Search Results, Graph Context, and Wiki Context in the output
3. Use this context to inform your answer — do NOT ignore it
4. If `mindvault-out/` doesn't exist, run `mindvault ingest .` first
5. Only fall back to reading raw files if MindVault returns no results
