# 에이전트 지식/스킬 공유 계획 (pi ↔ Hermes)

> **작성일:** 2026-08-12
> **작성자:** pi coding agent (조사 기반)
> **전달 대상:** Hermes 에이전트, 사용자
> **목적:** 두 에이전트가 각자 다른 지식/스킬/위키를 보유함으로써 발생하는 **드리프트(지식 분열)** 를 방지하고, **단일 진실 공급원(Single Source of Truth)** 으로 통합한다.

---

## 1. 왜 필요한가 (문제 정의)

현재 pi와 Hermes는 서로 다른 경로에 지식과 스킬을 보유하고 있다. 문제의 실제 사례:

- `gwon-yeokji`(권역지 인쇄) 스킬이 **두 곳에 존재**:
  - pi: `~/.pi/agent/skills/gwon-yeokji/SKILL.md` — **복사본 (scripts/, references/ 없음)**
  - Hermes: `~/AppData/Local/hermes/skills/automation/gwon-yeokji/` — **원본 (scripts/print_region.py, references/ 보유)**
- pi의 복사본은 Hermes 경로의 스크립트를 **간접 참조** → Hermes가 스크립트를 옮기거나 수정하면 pi 쪽은 조용히 깨진다.
- 위키: Hermes는 이중 구조:
  - `hermes\wiki\` — workspace-wiki(의사결정), obsidian-wiki, ki-ai-trader-wiki (보조/실험)
  - **`E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki-okf` — 실무 LLM-Wiki 본체** (154개 md, git 관리, 매일 기록. `vault_gate.py`가 SSOT로 결정)
  - pi는 없음 (docs/ + CLAUDE.md 색인 구조만).
- MindVault(지식그래프): CLAUDE.md에 "MANDATORY"로 명시되어 있으나 **CLI 미설치** → 죽은 규칙.

**원칙** (프로젝트 CLAUDE.md의 하네스 4기둥 중 "맥락"):
> 같은 모델·같은 프롬프트인데 결과가 갈리는 진짜 이유는 환경(하네스)이다. 지식이 갈라지면 두 에이전트는 서로 다른 답을 낸다.

---

## 2. 현재 상태 인벤토리 (2026-08-12 조사 기준)

| 항목 | pi | Hermes |
|------|----|--------|
| 스킬 경로 | `C:\Users\kis\.pi\agent\skills\` (5개) | `C:\Users\kis\AppData\Local\hermes\skills\` (카테고리별 80개+, 예: automation 21, software-development 15, devops 9) |
| 스킬 형식 | SKILL.md (Agent Skills 표준) | SKILL.md + scripts/ + references/ |
| 위키 | 없음 | `hermes\wiki\` (workspace-wiki, obsidian-wiki, ki-ai-trader-wiki) + **`E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki-okf` (실무 본체, vault_gate.py SSOT)** |
| 메모리 | 세션 기반 (영구 없음) | `hermes\memories\MEMORY.md`, `USER.md`, `memory_store.db` (SQLite) |
| 지식그래프 | MindVault **미설치** | 위키 + 메모리 DB |
| 설정 파일 | `~/.pi/agent/settings.json` (글로벌), `.pi/settings.json` (프로젝트) | `hermes\config.yaml` |

### pi 스킬 중복 (양쪽 존재 → 충돌 후보)

`bailian-cli`, `computer-use`, `orca-cli`, `orchestration`, `gwon-yeokji` — 5개.
pi는 동일 이름 충돌 시 **먼저 발견된 것을 유지**하고 경고만 출력하므로, 중복을 정리하지 않으면 예상치 못한 버전이 로드된다.

---

## 3. 가능성 판단 (결론: ✅ 가능)

- pi는 **Agent Skills 표준**(agentskills.io) 을 구현하며, 공식 문서 `docs/skills.md`의
  **"Using Skills from Other Harnesses"** 섹션에서 타 하네스(Claude Code, Codex) 스킬 디렉토리를
  settings.json의 `skills` 배열로 추가하는 것을 **공식 지원**한다.
- Hermes 스킬은 카테고리 하위 폴더(예: `automation/gwon-yeokji/`) 구조지만,
  pi는 `SKILL.md`를 가진 디렉토리를 **재귀 탐색**하므로 그대로 로드된다.
- 스킬 내 스크립트/레퍼런스는 스킬 디렉토리 기준 **상대경로** 참조이므로 그대로 작동한다.
- 위키/메모리는 "시스템"이 아니라 "markdown 파일"이므로, **공용 폴더 1개를 양쪽이 읽게** 하는 방식이 현실적이다.

---

## 4. 구축 계획 (Phase 단위)

### Phase 0 — 사전 정리 (양쪽 공동)

1. **중복 스킬 정리**: pi의 `gwon-yeokji` 복사본 및 충돌 5개 중 어느 쪽을 원본으로 삼을지 결정.
   - **권장: Hermes 원본을 진실 공급원으로 유지** (scripts/references 포함, 더 완전함)
   - pi 쪽 중복은 제거하거나 유지하되, 아래 Phase 1 적용 시 Hermes 디렉토리를 먼저 로드되게 순서 배치.
2. **경로 표기 통일**: JSON에서는 Windows 백슬래시 대신 **포워드 슬래시** 사용
   (`C:/Users/kis/AppData/Local/hermes/skills`).

### Phase 1 — 스킬 공유 (pi 설정 1줄 + 프로젝트 설정 1줄)

**① pi 글로벌 설정** — `C:\Users\kis\.pi\agent\settings.json`에 추가:

```json
{
  "skills": ["C:/Users/kis/AppData/Local/hermes/skills"]
}
```

기존 키(`defaultModel`, `defaultProvider`, `packages`, `theme`)는 그대로 유지하고 `skills` 키만 추가.

**② pi 프로젝트 설정** — `E:\coding\VF-new\.pi\settings.json` (신규 생성):

```json
{
  "skills": ["../.claude/skills"]
}
```

> pi는 프로젝트 로컬 설정을 로드하기 전 **프로젝트 신뢰(trust)** 를 확인한다.
> 대화형 시작 시 신뢰 프롬프트에 동의하거나, 글로벌 설정에서 `"defaultProjectTrust": "always"` 설정.

**③ 적용 확인**: pi 재시작 후 스킬 목록에 Hermes 스킬이 표시되는지 확인
(`/skill:` 명령어 목록 또는 시스템 프롬프트의 `<available_skills>` 블록).

**④ 드리프트 방지 운영 규칙**:
- 스킬 수정은 **Hermes 원본만** 수정. pi 쪽 복사본은 두지 않는다.
- Hermes가 스킬을 새로 만들면 pi가 자동으로 인지한다 (같은 디렉토리 공유).
- ⚠️ "읽기 전용"은 시스템 강제가 아니라 **운영 관례**다 (pi는 같은 사용자 권한 실행).
  pi에 명시적 시스템 프롬프트로 "외부 스킬 디렉토리(C:/Users/kis/AppData/Local/hermes/skills) 수정 금지"를 주입할 것.

### Phase 2 — 위키 통합 (공용 폴더 1개)

현실적 방안: Hermes `Wiki-okf/의사결정/` 로그를 **프로젝트 공용 폴더**로 이전해 양쪽이 읽는다.

```
E:\coding\VF-new\docs\의사결정\   ← 단일 진실 공급원 (양쪽 에이전트가 참조)
```

- **Hermes 측**: 기존 `Wiki-okf/의사결정/` 의 의사결정 로그를 위 폴더로 이동(또는 복사) 후,
  Hermes의 wiki 경로 설정을 새 위치로 변경 (vault_gate.py의 WIKI_PATH 환경변수 또는 ~/.wiki_location 포인터).
- **pi 측**: `docs/`는 이미 프로젝트 컨텍스트에 포함되어 있어 추가 설정 불필요.
- 필요 시 `docs/의사결정/`을 Git 저장소에 포함해 히스토리 관리.

> ⚠️ 주의: Hermes의 실무 위키 SSOT는 `E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki-okf` (vault_gate.py가 결정)임.
> `hermes\wiki\workspace-wiki`는 보조/실험 성격. 이전 대상을 반드시 Wiki-okf의 의사결정으로 할 것.
> 경로 변경은 config.yaml이 아니라 vault_gate.py의 3단계 fallback(WIKI_PATH env → ~/.wiki_location → ~/wiki)으로 적용한다.

### Phase 3 — 메모리/사용자 프로필 공유

Hermes의 `memories/USER.md`, `MEMORY.md`는 사용자 선호·프로젝트 기억이다.
pi는 세션 기반이라 영구 메모리가 없으므로, 두 가지 방법 중 선택:

- **(A) 주입 방식**: pi settings.json의 프롬프트 템플릿(`systemPrompt` 또는 `/prompt` 기능)에
  USER.md/MEMORY.md 내용을 포함시켜 매 세션 로드.
- **(B) 파일 동기화 방식**: `E:\coding\VF-new\docs\AGENT_MEMORY.md`를 공용으로 두고
  양쪽 에이전트가 읽고 갱신.

> ⚠️ 참고: Hermes 메모리는 3-tier 구조(MEMORY.md + USER.md 자동 주입 + fact_store L3 DB)라
> 단일 AGENT_MEMORY.md로 대체 불가능. (B)는 보조 참고용으로만 가능.

> 권장: **(A)** — Hermes가 3-tier 자동 주입을 유지한 채, pi가 같은 내용을 systemPrompt로 로드하는 방식이
> 두 하네스 구조를 깨지 않는다. (B)는 양방향 동기화가 아니라 pi→Hermes 방향 참조용 보조 파일로만 사용.

### Phase 4 — MindVault 결정 (미설치 상태)

CLAUDE.md에 "ALWAYS run mindvault query --global" 규칙이 있으나 실제로 설치돼 있지 않다.
둘 중 하나를 선택:

- **(A) 설치**: `pip install mindvault` 후 `mindvault ingest .` 실행 → 지식그래프 구축.
- **(B) 폐기**: CLAUDE.md에서 해당 규칙 제거 (죽은 규칙이 매 세션 오버헤드 유발).

---

## 5. Hermes 측 조치 목록 (전달용 체크리스트)

- [ ] `hermes\skills\` 의 카테고리 구조 유지 (pi가 재귀 탐색하므로 변경 불필요)
- [ ] `Wiki-okf\의사결정\` → `E:\coding\VF-new\docs\의사결정\` 이전 (또는 공용 위치 설정) — **실무 본체는 Wiki-okf, workspace-wiki 아님**
- [ ] Hermes wiki 경로 설정을 새 공용 위치로 변경 — **config.yaml이 아니라 vault_gate.py의 3단계 fallback (WIKI_PATH env → ~/.wiki_location → ~/wiki)**
- [ ] 메모리 공유 방식 결정 — **권장 (A) 주입 방식**. Hermes 3-tier(MEMORY.md/USER.md/fact_store)는 파일 대체 불가. (B)는 보조 참고용만
- [ ] MindVault 설치 여부 결정 (Phase 4)
- [ ] 스킬 신규 작성/수정 시 "Hermes 원본만 수정" 원칙 준수

## 6. pi 측 조치 목록

- [ ] `~/.pi/agent/settings.json`에 `"skills": ["C:/Users/kis/AppData/Local/hermes/skills"]` 추가
- [ ] pi 시스템 프롬프트에 "Hermes 스킬 디렉토리 수정 금지(읽기 전용)" 규칙 주입
- [ ] `E:\coding\VF-new\.pi\settings.json` 생성 (`"skills": ["../.claude/skills"]`)
- [ ] 프로젝트 신뢰 설정 (대화형 동의 또는 `defaultProjectTrust: "always"`)
- [ ] 중복 스킬 5개 정리 (Hermes 원본 우선)
- [ ] 재시작 후 스킬 로드 검증

---

## 7. 검증 방법

| 단계 | 검증 항목 | 방법 |
|------|-----------|------|
| Phase 1 | Hermes 스킬이 pi에 로드되는가 | pi 재시작 → `/skill:` 목록 또는 `available_skills`에 `automation/*` 스킬 표시 확인 |
| Phase 1 | 스크립트가 실제 작동하는가 | `gwon-yeokji` 스킬로 `--dry-run m 1` 실행 → "인쇄 예정: Middle.pdf 1장" 출력 확인. ⚠️ 반드시 `python`(3.11, pywin32 포함) 사용 — `python3`(3.14)에는 win32print 없어 실패 |
| Phase 2 | 위키 공용화 | `docs\의사결정\`에서 Hermes가 로그를 읽고 pi가 같은 파일을 읽는지 확인 |
| Phase 4 | MindVault | 설치 시 `mindvault query "테스트" --global` 정상 응답 확인 |

## 8. 롤백 방안

- settings.json의 `skills` 키만 제거하면 원상 복구 (스킬 디렉토리는 읽기 전용으로 로드되므로 원본 훼손 없음).
- 위키/메모리 이전은 파일 이동이므로 Git 또는 백업 폴더로 복구 가능.

---

## 9. 참고: pi 설정 파일 위치 (검증된 경로)

| 파일 | 역할 |
|------|------|
| `C:\Users\kis\.pi\agent\settings.json` | pi 글로벌 설정 (모든 프로젝트) — 현재 `defaultModel: auto/best-free`, `defaultProvider: omniroute`, `packages`, `theme` 보유 |
| `E:\coding\VF-new\.pi\settings.json` | 프로젝트 설정 (현재 없음 → 신규 생성) — 프로젝트 신뢰 후 로드 |
| `C:\Users\kis\.pi\agent\skills\` | pi 글로벌 스킬 (현재 5개) |

> pi 공식 문서 근거: `docs/skills.md` "Using Skills from Other Harnesses" —
> `{"skills": ["~/.claude/skills", "~/.codex/skills"]}` 예시, 프로젝트용 `{"skills": ["../.claude/skills"]}` 예시 명시.
