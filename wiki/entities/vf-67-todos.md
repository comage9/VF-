# VF-67 미완료 작업

> Obsidian 세션로그에서 추출한 미완료 작업 목록

---

## 🔴 미해결

### 1. AI thinking 필터링
- **문제:** 영어 thinking이 응답에 포함됨
- **원인:** AI 모델이 프롬프트 무시하고 사고 과정을 응답에 포함
- **시도:** 프롬프트 강화 → 실패, 프론트엔드 필터링 → 실패
- **해결책:** 백엔드 후처리 또는 thinking 없는 모델로 교체
- **Source:** 2026-04-12 세션로그

### 2. 에이전트 위임 체계
- **문제:** 다중 작업 시 응답 지연/없음
- **목표:** 각 AI 에이전트에게 작업 위임, OpenRouter 무료 AI 우선 → 실패 시 고성능 AI
- **Source:** 2026-04-12 세션로그

### 3. Obsidian MCP 플러그인
- **상태:** 미완료
- **필요:** Obsidian 앱에서 GitHub repo clone
- **Repository:** https://github.com/comage9/obsidian-vault
- **Source:** 2026-04-12 세션로그

---

## ⏳ 대기 중

### 4. Windows 서버 sort_order migration
- **상태:** Windows 서버에서 `git pull` + `migrate` 필요
- **Source:** 2026-04-13 세션

### 5. 자정 자동 이동 코드 검토
- **API:** `POST /api/production/move-incomplete`
- **Source:** 2026-04-13 결정사항

### 6. Obsidian Git 플러그인 자동 동기화 (Windows)
- **상태:** 설정 필요
- **Source:** 2026-04-13 결정사항

---

## ✅ 최근 완료 (참고)

| 작업 | 완료일 |
|------|--------|
| DnD 버그 수정 (IIFE 제거) | 2026-04-13 |
| MEMORY.md ↔ Obsidian 동기화 | 2026-04-13 |
| Claude Code Z.AI API 설정 | 2026-04-13 |
| 백엔드 sort_order 검증 (로컬) | 2026-04-13 |
| comage 인프라 구축 (RULES/wiki) | 2026-04-13 |
| 재고 확인 탭 추가 | 2026-04-12 |
| 모바일 스크롤 수정 | 2026-04-12 |
| Windows bat 경로 수정 | 2026-04-12 |

---
*Source: Obsidian 01-VF-프로젝트/세션로그/ (2026-04-13 Ingest)*
