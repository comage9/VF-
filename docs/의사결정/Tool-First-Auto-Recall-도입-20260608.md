# Tool-First Auto-Recall 도입 보고서 (2026-06-08 곰너이 확정)

## 트리거

곰너이 님 (2026-06-08):
> "이전에도 답변은 뭘 하든 항상 확인한다고 했는데, 확인이 안 된다는 게 문제지."
> "어떤 지시사항에 대해서 자꾸 혼자 판단하고 기존에 했던 일인데도 매번 처음 하는 것처럼 처리하는 문제가 있다."
> "이미 경험했던 상황이라면 스킬화되어 있는 것을 그대로 사용하거나 기존 스킬을 로드하면 되는데, 그걸 하지 않고 매번 처음 대하듯 행동하니까 문제가 되는 거지."
> "위키 LLM 시스템이 구축되어 있어서 이걸 검색만 해도 했던 일을 반복하는 비효율을 줄일 수 있단 말이야."

## 문제의 정체

곰너이 님이 구축한 위키 시스템은 카르파티의 "LLM Wiki" 패턴을 거의 그대로 구현하고 있음에도 불구하고, **자동 recall(메모리 자발적 검색)이 빠져 있어서** 매번 처음 대하듯 행동하는 문제가 발생 중.

이것은 **표준 long-term memory 시스템(mem0, Letta, MemGPT)이 모두 기본 제공하는 기능**이며, 곰너이 님 시스템에 자동 recall 메커니즘을 도입하면 즉시 해결 가능한 문제.

## 해결: Tool-First Auto-Recall (2026-06-08 곰너이 확정)

### 핵심 절차

**사용자 지시 수신 즉시, 어떤 답변/실행/판단보다도 먼저** 아래 3개 도구를 **무조건, 병렬로** 호출.

```
병렬 호출 (같은 응답에서 한꺼번에):
1) search_files(pattern=<키워드>, path="E:\\hermes-backup\\obsidian\\06-Wiki-시스템\\Wiki", target='files')
   → Linux: path="/media/comage/data1/hermes-backup/obsidian/06-Wiki-시스템/Wiki"
2) skills_list()  → 전체 스킬 카탈로그 조회
3) session_search(query=<키워드>, limit=3, sort='newest')
```

### 결과 처리

| 결과 | 다음 동작 |
|------|----------|
| Wiki에 매치 있음 | 해당 파일 `read_file` → 답변에 **인용** |
| 스킬에 매치 있음 | `skill_view(name)` → 절차 따르기 |
| session에 매치 있음 | `session_id` + `around_message_id` → 컨텍스트 복원 |
| **모두 0건** | **"이전에 다뤄본 적 없음. 처음 진행하겠습니다"** 명시 |
| **0건인데 "확인했습니다" 보고** | **거짓말. 절대 금지** |

## 적용 결과 (2026-06-08)

### 1. SOUL.md 강화 ✅
- 32줄 → 86줄로 확장
- **§2 (0번보다 먼저 실행): Tool-First Auto-Recall 신설**
- 절대 금지 9-10번 추가 (자동 recall 건너뛰기 금지, "확인했다" 답변 시 도구 호출 이력 없이 보고 금지)
- §6: 3중 완료 의무 (Wiki + README + Git push)
- 카르파티 LLM Wiki 3-Layer/3-Operation/2-Special-File 명시
- 다른 에이전트 공유 규약 추가

### 2. mandatory-verification 스킬 강화 ✅
- §0 (5단계보다 먼저 실행): Tool-First Auto-Recall 섹션 신설
- §결과 처리 규칙 표
- §위반 사례 / 성공 사례 명시
- 2026-06-08 각서 2 추가 ("확인이 안 된다는 게 문제")

### 3. Wiki/운영원칙/에이전트-온보딩-가이드.md 강화 ✅
- §1-1: §0 Tool-First Auto-Recall 명시 + 5-Step 의무
- §1-1-1: 3중 완료 의무
- §6: 모든 에이전트 (CLI/Telegram/Linux/Discord) 공통 규약 6개
- 각 에이전트별 설정 YAML 예시 (auto_recall 블록)
- §7: 2026-06-08 신규 문서 3건 등록
- §8: 2026-06-08 버전 이력 추가

## 곰너이 님이 요구한 3가지 작업 방향 매핑

| 요구사항 | 적용 위치 | 상태 |
|---------|----------|------|
| **1. 위키 업데이트 + Git 업로드** | Wiki/의사결정/* 3건 + Wiki/운영원칙/* 1건 + SOUL.md + mandatory-verification 스킬 | ✅ 완료 (커밋/푸시 진행) |
| **2. 운영 원칙 수립** (작업 시작 전 스킬/Wiki 검색) | SOUL.md §2 + mandatory-verification §0 + 에이전트-온보딩-가이드 §1-1 | ✅ 완료 |
| **3. 문서 제공** (다운로드 가능한 형태) | 본 문서 + 통합 문서 (곰너이_지시_통합_처리_보고서.md) | ✅ 완료 |

## 다른 에이전트 전이 방법

### 즉시 적용 (config.yaml/channel_prompts 수정)

```yaml
# 공통 — 모든 에이전트
system_prompts:
  - "§0 Tool-First Auto-Recall: 답변 전 search_files + skills_list + session_search 병렬 호출 강제"
  - "5-Step 의무: 위키검색→스킬로드→메모리참조→Git검증→저장"
  - "3중 완료: Wiki + README + Git push"
  - "절대 금지 A~F + 절대 금지 §0: Tool-First Auto-Recall 건너뛰기 = 거짓말"
```

### 검증 방법 (다른 에이전트에서)

1. 임의의 작업 지시 → 자동 recall 3종 호출 여부 확인
2. 결과 0건일 때 "이전 없음" 명시 여부 확인
3. Wiki/Skill 매치 시 본문 인용 여부 확인
4. 3중 완료 (Wiki + README + Git push) 수행 여부 확인

## 관련 문서 (Git push 완료 후 다운로드 가능)

1. `Wiki/의사결정/카르파티-LLM-Wiki-패턴-분석-20260608.md` (13,538 bytes)
2. `Wiki/의사결정/AI-에이전트-장기기억-아키텍처-20260608.md` (10,638 bytes)
3. `Wiki/의사결정/Tool-First-Auto-Recall-도입-20260608.md` (본 문서)
4. `Wiki/운영원칙/에이전트-온보딩-가이드.md` (강화됨, +~150 lines)
5. `C:\Users\kis\AppData\Local\hermes\SOUL.md` (강화됨, 32→86 lines)
6. `C:\Users\kis\AppData\Local\hermes\skills\dogfood\mandatory-verification\SKILL.md` (강화됨, +§0 섹션)

## 다음 단계 (곰너이 님 검토 대기)

- [ ] 곰너이 님 검토 후 다른 디바이스(Linux 노트북, Telegram bot)에 수동 적용
- [ ] qmd (hybrid BM25/vector + LLM re-ranking) 도입 검토
- [ ] index.md 수동 작성 (현재 Wiki 카탈로그화)
- [ ] log.md 자동 생성 (cron으로 session_search dump)

---

저장: 2026-06-08 11:55 KST
작성: Hermes (minimax-m3)
상태: 도입 완료, Git push 진행 중
이전 보고 정정: "WikiLLM 단일 시스템 없음" → 카르파티 LLM Wiki 패턴 + 곰너이 님 시스템 매핑으로 정정
