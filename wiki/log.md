# Wiki Log — 작업 기록

> Append-only 작업 로그입니다. 각 항목은 `## [날짜] 유형 | 제목` 형식으로 작성됩니다.
> 파싱: `grep "^## \[" wiki/log.md | tail -5` 로 최근 5개 항목 확인 가능

---

## [2026-04-13] setup | RULES/ 7대 코어 파일 생성
- identity.md, code.md, security.md, workflow.md, response.md, session.md, priority.md
- 하네스 엔지니어링 CIVC 원칙 기반

## [2026-04-13] setup | Wiki 디렉토리 구조 생성
- wiki/index.md, wiki/log.md 생성
- wiki/entities/, wiki/concepts/ 디렉토리 생성

## [2026-04-13] fix | 프론트엔드 DnD 버그 수정
- **관련 파일:** production-plan.tsx, views.py
- **원인:** IIFE 패턴 → esbuild 파싱 에러, duplicate style 속성
- **해결:** useCallback 분리, useMemo로 style 통합
- **검증:** npm run build 성공, curl API 정상 응답
- **학습:** IIFE 패턴 사용 금지 → RULES/code.md에 반영

## [2026-04-13] fix | Claude Code Z.AI API 설정
- 기존: OpenRouter qwen/qwen3.6-plus:free (접근 불가)
- 변경: Z.AI API (GLM-4.7) — 정상 작동 확인
- **학습:** 모델 접근 불가 시 자동 전환 필요

## [2026-04-13] sync | MEMORY.md ↔ Obsidian 동기화
- 금형 번호 14개 제품군 전체 업데이트
- 슬림, 모던+ 상세 매핑 추가 (기존에 누락되어 있었음)

## [2026-04-13] setup | CIVC 자동화 스크립트 + LoopDetection
- scripts/verify.sh: 프론트엔드 빌드 + 백엔드 migration + API 응답 자동 검증
- scripts/loop-detect.sh: 동일 파일 반복 수정 탐지 (임계값 3회)
- templates/claude-code-task.md: 작업 위임 템플릿 (추론 샌드위치 포함)
- HEARTBEAT.md: 주기적 체크 항목 추가
- AGENTS.md: wiki 구조 참조 추가

## [2026-04-13] setup | MEMORY.md 경량화 + 교차 참조
- MEMORY.md: 5,377B → 1,822B (66% 축소, 상세는 wiki로 리다이렉트)
- wiki/cross-reference.md: Obsidian ↔ wiki 전체 매핑
- Obsidian mindvault-out 발견: 39 노드, 31 엣지 세만틱 그래프 존재

## [2026-04-13] ingest | VF-67 지식 전체 Ingest
- Obsidian 세션로그 8개 파일 읽고 wiki에 반영
- API 엔드포인트: 재고/출고/AI 분석 API 추가
- 미완료 작업: 3개 미해결 + 3개 대기중 추출 (entities/vf-67-todos.md)
- 에러로그: 4개 에러 패턴 기록

## [2026-04-13] setup | Day 8 — Wiki Lint 스크립트
- scripts/wiki-lint.sh: 고아 페이지/교차 참조/RULES 무결성/2회 규칙 자동 검사
- 실행 결과: 모두 정상 ✅

## [2026-04-13] rename | 프로젝트 명명 분리
- "VF 보노하우스 프로젝트" → "VF-67 (밴드플렉스 67번 센터 웹 서비스)"
- 전체 시스템: comage
- 코딩 프로젝트: VF-67
- RULES/ 7개 파일, wiki/entities/ 7개, wiki/concepts/ 3개 생성 완료
- **결과:** migration 17개 전부 적용 완료, API에 sort_order 포함 확인
- **로컬:** 정상 작동 ✅
- **Windows 서버:** sort_order 컬럼 미반영 (별도 migrate 필요)
