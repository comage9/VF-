---
name: vf-context
description: VF 보노하우스 프로젝트 컨텍스트. Django 백엔드, React 프론트엔드, Toss Design Language. 프로젝트 정보, API 규칙, 디렉토리 구조.
---

# VF 보노하우스 프로젝트 컨텍스트

## 프로젝트 위치
`/home/comage/coding/VF-/`

## 구조
```
VF-/
├── backend/
│   ├── sales_api/views.py     # 모든 API views (여기가 핵심)
│   ├── sales_api/models.py    # Django models
│   ├── sales_api/urls.py      # URL 라우팅
│   └── config/                # Django settings
├── frontend/client/
│   ├── src/pages/             # React 페이지 컴포넌트
│   ├── src/components/        # UI 컴포넌트 (ui/, integrated/)
│   └── src/hooks/             # 커스텀 훅
├── .claude/skills/            # Claude Code 스킬
└── CLAUDE.md                  # 프로젝트 기본 정보
```

## API 규칙 (매우 중요)
- Django URL은 **trailing slash 없음**
- ✅ `/api/production` | ❌ `/api/production/`
- 응답 구조: `{"success": true/false, ...}`
- `DELETE /api/production-log` — IDs 배열 필수

## Backend 수정 시
- 파일: `backend/sales_api/views.py`
- Django: `cd backend && source .venv/bin/activate`
- migration 불필요 (model 변경 없을 때)
- 빌드: Django는 불필요, 바로 테스트 가능

## Frontend 수정 시
- 파일: `frontend/client/src/pages/*.tsx`
- 빌드: `cd frontend/client && npm run build` (성공 필수)
- `npm run dev`가 실행 중이면 http://localhost:5174 에서 바로 확인

## 디자인 규칙
- Brand: `#721FE5` (active states만)
- Background: `#FAFAFA`
- Grayscale inactive
- 그라디언트 금지 (배경/헤더)
- dark mode: `--primary: #9B5FFF`

## 서버 상태
- Backend: `http://localhost:8000` (실행 중)
- Frontend: `http://localhost:5174` (실행 중)

## 최근 코드 개선 (2026-04-08)
- Phase 1: DELETE 전체 삭제 위험 방지 + pagination
- Phase 2: any 타입 제거
- Phase 3: alert() → toast
- Phase 4: SortableRow React.memo
- Phase 5: DRF Serializer
