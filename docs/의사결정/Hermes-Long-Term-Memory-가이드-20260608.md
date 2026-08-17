# Hermes Long-Term Memory 표준 통합 가이드 (2026-06-08)

> 곰너이 님이 MEMORY.md에서 분리한 항목 모음. v2.3.0+ `hermes-agent` 스킬의 Persistent Memory 섹션이 표준 전체를 다루므로, MEMORY.md는 운영 핵심만 유지.

## 1. 4-way Memory 표준 일치 (2026-06-08)

**카르파티 LLM Wiki + mem0/Letta + 공식 Hermes Persistent Memory + 곰너이 님 시스템 = 같은 표준 구현.**

- **카르파티 LLM Wiki**: 3-Layer (Raw Sources / Wiki / Schema), 3-Operation (Ingest/Query/Lint), 2-Special-File (index.md/log.md)
- **mem0/Letta/MemGPT/VikingMem**: 3-tier (Semantic/Episodic/Procedural) + "Read-Before-Reasoning" 자동 recall
- **공식 Hermes Persistent Memory**: MEMORY.md (2,200) + USER.md (1,375) + 8개 External Provider
- **곰너이 님 시스템**: 1,681/2,200 (76.4%) + 1,087/1,375 정확히 일치 (6/8 정리 완료), frozen snapshot, SQLite FTS5 session_search

**차이점 (곰너이 님 시스템이 미보유):**
- 8개 외부 Memory Provider (Holographic 1순위 추천 — 로컬/무료)
- 공식 Provider 자동 6단계 동작
- Memory consolidation cron

**상세 분석:** `Wiki/의사결정/Hermes-공식-Memory-시스템-분석-20260608.md` (13,117 bytes)

## 2. 3가지 작업 방향 (2026-06-08 곰너이 확정)

### 방향 ①: Wiki + Git 공유

- 새 작업/절차/Pitfalls는 **무조건 E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki\** 에 저장
- 접두사 규칙: 윈도우- (전용), 리눅스- (전용), 無 (공용)
- 3중 완료 의무: Wiki + README + Git push

### 방향 ②: §0 Tool-First Auto-Recall (2026-06-08 곰너이 확정)

**사용자 지시 수신 시, 답변/실행 어떤 것이든 작성하기 전에 3종 도구 무조건 병렬 호출:**
- `search_files(pattern=<키워드>, path=WIKI_PATH)`
- `skills_list()` 
- `session_search(query=<키워드>, limit=3, sort='newest')`

**0건인데 "확인했습니다" 보고 = 거짓말.** 절대 금지.

### 방향 ③: 다운로드 가능 문서

다른 에이전트(Windows/Linux/Telegram/Discord)가 **즉시 다운로드해서 동일하게 적용**할 수 있는 형태로 작성:
- YAML 형식 설정 블록
- Git raw URL 명시
- 검증 절차 (1~4단계 self-check)
- 크로스-레퍼런스 검증
- Git push 완료 후 보고

## 3. 곰너이 님 핵심 인용 (잊지 말 것)

> "이전에도 답변은 뭘 하든 항상 확인한다고 했는데, **확인이 안 된다는 게 문제**지."

> "어떤 지시사항에 대해서 자꾸 **혼자 판단**하고 기존에 했던 일인데도 **매번 처음 하는 것처럼 처리**하는 문제가 있다."

> "이미 경험했던 상황이라면 **스킬화되어 있는 것을 그대로 사용**하거나 기존 스킬을 로드하면 되는데, 그걸 하지 않고 매번 처음 대하듯 행동하니까 문제가 되는 거지."

> "**위키 LLM 시스템이 구축되어 있어서 이걸 검색만 해도 했던 일을 반복하는 비효율을 줄일 수 있단 말이야.** 그게 잘 안돼서 여러 가지 운영 원칙과 Soul MD 같은 다른 사항들도 줄줄이 만들어 놨는데, **전혀 활용이 안 되고 있다는 건가?**"

> "하네스 자체도 **장기 기억 보관 방법**이 있는 걸로 알고 있거든."

→ **§0 Tool-First Auto-Recall이 직접 해결. 단순 약속이 아니라 도구 호출 강제.**

## 4. 적용된 파일 (2026-06-08)

- `C:\Users\kis\AppData\Local\hermes\skills\autonomous-ai-agents\hermes-agent\SKILL.md` (v2.3.0, 62,577 bytes, 1356 lines) — Persistent Memory 섹션 9개 subsection 신설
- `C:\Users\kis\AppData\Local\hermes\SOUL.md` — §0 Tool-First Auto-Recall 박제
- `C:\Users\kis\AppData\Local\hermes\skills\dogfood\mandatory-verification\SKILL.md` — §0 섹션 + 2026-06-08 각서 2
- `E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki\운영원칙\에이전트-온보딩-가이드.md` — §0 + 3중 완료 의무

## 5. 후속 작업 후보 (검토 대기)

- Holographic 도입 (로컬/무료, 1순위 추천, ⚠️ 곰너이 님 결정 대기)
- OpenViking 도입 (카르파티 LLM Wiki와 통합)
- MEMORY.md 80% 임계점 회복 (완료: 76.4% ✅)
- index.md 수동 작성 (Wiki 카탈로그)
- log.md 자동 생성 (cron)

---

## 관련 문서
- [카르파티-LLM-Wiki-패턴-분석-20260608.md](./카르파티-LLM-Wiki-패턴-분석-20260608.md) — 3-Layer/3-Operation 표준
- [Hermes-공식-Memory-시스템-분석-20260608.md](./Hermes-공식-Memory-시스템-분석-20260608.md) — 8개 External Provider 상세
- [Hermes-Persistent-Memory-통합-가이드-20260608.md](./Hermes-Persistent-Memory-통합-가이드-20260608.md) — 다른 에이전트 적용 가이드

---

저장: 2026-06-08 14:55 KST
작성: Hermes (minimax-m3)
상태: §0 Auto-Recall 3종 발동, hermes-agent v2.3.0 강화 완료, MEMORY.md consolidation 진행
