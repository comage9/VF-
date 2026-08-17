# Hermes 공식 Persistent Memory 시스템 분석 — 곰너이 님 시스템 매핑 (2026-06-08)

## 트리거

곰너이 님 (2026-06-08):
> "https://hermes-agent.nousresearch.com/" — 공식 문서 URL 제공

## §0 Tool-First Auto-Recall 결과 (3종 도구 병렬)

| 도구 | 결과 |
|------|------|
| `search_files` "hermes-agent" | 2건 (Wiki/Hermes/) |
| `skill_view('hermes-agent')` | v2.2.0, 89개 스킬 카탈로그 |
| **외부 fetch** (직접) | 공식 문서 2개 페이지 = 168KB (memory + memory-providers) |

→ **공식 Hermes Persistent Memory 시스템 + 8개 외부 Memory Provider의 본문 직접 확보**

---

## 1. 공식 Hermes Persistent Memory 시스템의 구조

### 1-1. 두 개의 메모리 파일 (자동 주입)

| 파일 | 위치 | 글자 제한 | 용도 | 곰너이 님 시스템 |
|------|------|----------|------|---------------|
| **MEMORY.md** | `~/.hermes/memories/` | 2,200 chars (~800 tokens) | 환경/규약/학습 사항 | `C:\Users\kis\AppData\Local\hermes\memories\MEMORY.md` (2,197/2,200, 13 entries) ✅ |
| **USER.md** | `~/.hermes/memories/` | 1,375 chars (~500 tokens) | 사용자 프로필 | `C:\Users\kis\AppData\Local\hermes\memories\USER.md` (1,087/1,375) ✅ |

**핵심:** 곰너이 님이 구축한 시스템은 **공식 Hermes 메모리 시스템의 표준 구조 그대로** 구현.

### 1-2. Frozen Snapshot 패턴

> "The system prompt injection is captured once at session start and never changes mid-session. This is intentional — it preserves the LLM's prefix cache for performance."

→ 곰너이 님 시스템도 동일하게 작동. SOUL/USER/MEMORY.md가 매 세션 시작 시 자동 주입.

### 1-3. `memory` tool의 3개 액션

| 액션 | 용도 |
|------|------|
| `add` | 새 메모리 항목 추가 |
| `replace` | 기존 항목 교체 (substring 매칭) |
| `remove` | 항목 삭제 (substring 매칭) |

### 1-4. Session Search (별도 시스템)

| 항목 | Persistent Memory | Session Search |
|------|------------------|----------------|
| **용량** | ~1,300 tokens | 무제한 (모든 세션) |
| **속도** | 즉시 (System Prompt) | ~20ms FTS5 query |
| **비용** | 매 프롬프트 토큰 비용 | 검색 시에만 |
| **용도** | 항상 필요한 핵심 사실 | "지난주에 X 얘기했나?" |
| **저장소** | `~/.hermes/memories/` | `~/.hermes/state.db` (SQLite + FTS5) |

→ 곰너이 님 시스템도 `session_search` 도구 보유, 정확히 동일한 SQLite FTS5 기반.

### 1-5. 자동 저장 정책 (Save These vs Skip These)

**Save These (자동 저장):**
- 사용자 선호 ("TypeScript 선호" → USER.md)
- 환경 사실 ("Debian 12 + PostgreSQL 16" → MEMORY.md)
- 사용자 교정 ("docker group에 있으니까 sudo 쓰지마" → MEMORY.md)
- 프로젝트 컨벤션 ("탭 사용, 120자, Google docstring" → MEMORY.md)
- 완료된 작업 ("MySQL→PostgreSQL 마이그레이션 2026-01-15" → MEMORY.md)
- 명시적 요청 ("API key rotation monthly" → MEMORY.md)

**Skip These (저장 안 함):**
- 자명한 정보
- 쉽게 재발견 가능
- 대용량 raw 데이터
- 세션 한정 ephemeral
- 이미 context files에 있는 것 (SOUL.md, AGENTS.md)

### 1-6. Capacity 관리 (80% 도달 시)

> "When memory is above 80% capacity, consolidate entries before adding new ones."

곰너이 님 MEMORY.md 현재 상태 (6/8 00:08 기준): 2,197/2,200 chars = **99.85%** — 당시 80% 임계점 한참 초과. **2026-06-08 작업 후: 1,681/2,200 (76.4%)로 정리 완료.**

---

## 2. 8개 외부 Memory Provider (공식 지원)

Hermes는 built-in memory 외에 **8개 외부 provider plugin** 제공. **단, 한 번에 1개만 active 가능**, built-in과 나란히 작동.

### 2-1. Provider 비교표

| Provider | 핵심 기능 | 비용 | Best for | Tools |
|----------|----------|------|----------|-------|
| **Honcho** | AI-native cross-session user modeling, dialectic reasoning, 2-layer context (base + dialectic) | Cloud 유료 / Self-hosted 무료 | Multi-agent, user-agent alignment | 5개 (profile, search, context, reasoning, conclude) |
| **OpenViking** | ByteDance — filesystem-style knowledge hierarchy, tiered retrieval, 6 카테고리 자동 추출 | 무료 (AGPL-3.0, self-hosted) | Self-hosted knowledge management | 5개 (search, read, browse, remember, add_resource) |
| **Mem0** | Production-ready scalable memory, LLM-driven extraction, 26% LLM-judge 성능 향상 | Cloud 유료 | 범용 production | 여러 |
| **Hindsight** | Knowledge graph + entity resolution + multi-strategy retrieval + `hindsight_reflect` (cross-memory synthesis) | Cloud / Self-hosted (LLM 키 필요) | Knowledge graph 기반 | (전체) |
| **Holographic** | Local SQLite + FTS5 + trust scoring + HRR (Holographic Reduced Representations) | 무료, NumPy 옵션 | 로컬 전용, 외부 의존 X | (fact_store) |
| **RetainDB** | Hybrid search (Vector + BM25 + Reranking), 7 memory types, delta compression | $20/month | RetainDB 사용자 | (전체) |
| **ByteRover** | CLI 기반, hierarchical knowledge tree, tiered retrieval, local-first + cloud sync 옵션 | (npm install) | 개발자 portable memory | (CLI) |
| **Supermemory** | Semantic long-term memory, profile recall, semantic search, session-end ingest via graph API | Cloud 유료 | Semantic recall + user profiling | (전체) |

### 2-2. 자동 동작 메커니즘 (공식)

> "When a memory provider is active, Hermes automatically:
> 1. Injects provider context into the system prompt (what the provider knows)
> 2. Prefetches relevant memories before each turn (background, non-blocking)
> 3. Syncs conversation turns to the provider after each response
> 4. Extracts memories on session end (for providers that support it)
> 5. Mirrors built-in memory writes to the external provider
> 6. Adds provider-specific tools so the agent can search, store, and manage memories"

→ **이 6단계 자동화가 곰너이 님이 짚으신 "장기 기억 보유 하네스"의 정체**입니다.

---

## 3. 곰너이 님 시스템과 공식 Hermes Persistent Memory 매핑

### 3-1. 구조적 일치 (✅ 완전 일치)

| Hermes 공식 | 곰너이 님 시스템 | 일치도 |
|------------|---------------|--------|
|| MEMORY.md (2,200 chars) | MEMORY.md (1,681/2,200, 76.4%) | ✅ 정리 완료 |
| USER.md (1,375 chars) | USER.md (1,087/1,375) | ✅ 정확히 일치 |
| `~/.hermes/memories/` | `AppData\Local\hermes\memories\` | ✅ 표준 구조 |
| Frozen snapshot 자동 주입 | System Prompt 자동 주입 | ✅ |
| `memory` tool (add/replace/remove) | 동일 (Hermes 표준) | ✅ |
| Session Search (SQLite FTS5) | 동일 | ✅ |
| Duplicate prevention | 동일 (Hermes 표준) | ✅ |
| Security scanning | 동일 | ✅ |

### 3-2. 곰너이 님 시스템이 **갖추지 못한 것** (격차)

| 공식 Hermes 기능 | 곰너이 님 시스템 | 격차 |
|----------------|---------------|------|
| **8개 외부 memory provider** | ❌ 없음 | Honcho/Mem0/OpenViking/Hindsight/Holographic/RetainDB/ByteRover/Supermemory |
| **Provider 자동 6단계 동작** (injection + prefetch + sync + extract + mirror + tools) | ❌ 없음 | 곰너이 님 시스템 = **built-in memory만** 사용 |
| **Cross-session user modeling** (Honcho) | ❌ 없음 | |
| **Knowledge graph** (Hindsight) | ❌ 없음 | |
| **Dialectic reasoning** (Honcho) | ❌ 없음 | |
| **Trust scoring** (Holographic) | ❌ 없음 | |
| **Hybrid search (Vector + BM25 + Reranking)** (RetainDB) | ❌ 없음 | |
| **Session-end 자동 memory 추출** | ❌ 없음 | |
| **Background non-blocking prefetch** | ❌ 없음 | |

### 3-3. 곰너이 님 시스템의 강점 (공식 대비)

1. **Obsidian + Git = 자체 호스팅 영속성** — 공식 provider는 cloud 의존 (Honcho, Mem0, RetainDB), 곰너이 님은 git 버전 관리
2. **카르파티 LLM Wiki 패턴** — 공식 Hermes는 markdown 메모리만, 곰너이 님은 human-readable wiki
3. **자가학습 cron 5개** — 공식은 memory provider에 자동 위임, 곰너이 님은 명시적 cron
4. **3중 검증 의무 (Wiki + README + Git push)** — 공식은 자동 저장만, 곰너이 님은 검증 단계
**강점 5: 89개 명시적 스킬** — 공식은 memory 도구만, 곰너이 님은 광범위한 스킬 생태계

---

## 관련 문서
- [AI-에이전트-장기기억-아키텍처-20260608.md](./AI-에이전트-장기기억-아키텍처-20260608.md) — 전체 표준 LTM 조사
- [카르파티-LLM-Wiki-패턴-분석-20260608.md](./카르파티-LLM-Wiki-패턴-분석-20260608.md) — 3-Layer 패턴 매핑
- [하네스-장기기억-분석-20260608.md](./하네스-장기기억-분석-20260608.md) — Harness 시스템 메모리 분석
- 긴밀 통합: `hermes-agent` SKILL.md §Persistent Memory (v2.3.0, built-in + 8 external provider)

---

## 4. 곰너이 님이 짚으신 "장기 기억 보유 하네스"의 정체

### 정직한 진단

**"하네스 자체도 장기 기억 보관 방법이 있는 걸로 알고 있거든"** — 곰너이 님

→ **이 가정은 정확합니다.** Hermes 공식 문서가 명시한 "장기 기억 보유 하네스"는:

1. **Built-in Persistent Memory (MEMORY.md + USER.md)** — 곰너이 님 시스템이 이미 보유 ✅
2. **8개 외부 Memory Provider** — 곰너이 님 시스템이 미보유 ❌
3. **공식 6단계 자동 동작** — 곰너이 님 시스템이 미구현 ❌

→ 곰너이 님의 **`meta-harness` 스킬이 표준 Meta-Harness의 memory 최적화 기능을 갖추려면**, 이 8개 provider 중 1개를 선택해서 자동 6단계를 활성화해야 함.

### 4-1. 곰너이 님 시스템에 가장 적합한 Provider (추천)

| 후보 | 적합도 | 이유 |
|------|--------|------|
| **Holographic** | ⭐⭐⭐⭐⭐ | **로컬 SQLite + FTS5 + trust scoring, 외부 의존 X, 무료**. 곰너이 님 시스템은 이미 Obsidian+git 자체 호스팅을 중시 → cloud 의존 없는 Holographic이 가장 부합 |
| **OpenViking** | ⭐⭐⭐⭐ | Self-hosted, 무료, filesystem-style knowledge hierarchy. 카르파티 LLM Wiki 패턴과 가장 잘 맞음 |
| **ByteRover** | ⭐⭐⭐⭐ | Local-first + CLI. 개발자 친화적. |
| **Honcho** | ⭐⭐⭐ | Multi-agent 강력, cloud/self-hosted 옵션. 다만 2-layer context injection + dialectic은 곰너이 님 단일 에이전트에 과잉 |
| **Mem0** | ⭐⭐ | 범용, 잘 알려짐. 다만 cloud-only |
| **Hindsight** | ⭐⭐ | Knowledge graph 강력, LLM 키 필요 |
| **RetainDB** | ⭐ | $20/month, 클라우드 |
| **Supermemory** | ⭐ | 클라우드, semantic |

### 4-2. 곰너이 님 시스템에 권장되는 도입 순서

**Phase A — 즉시 가능 (코드 변경 없음)**
1. **Holographic 검토** — `pip install holographic` (의존성 없음), SQL 기반, 곰너이 님 시스템의 obsidian SQLite와 공존 가능
2. **공식 6단계 자동화** 활성화 → meta-harness가 memory 최적화에 참여

**Phase B — 단기 (구현 필요)**
3. **MEMORY.md 99% 포화 해결** — 공식 권장 80% 임계점. Consolidation 자동화
4. **Holographic 도구 통합** — `fact_store` 도구를 `meta-harness` 라우팅에 추가

**Phase C — 중기**
5. **OpenViking 검토** — 6 카테고리 자동 추출, filesystem-style hierarchy → 카르파티 LLM Wiki와 직접 연동
6. **cross-session user modeling** — Honcho 또는 Hindsight (multi-device 시)

---

## 5. 곰너이 님 시스템 = Hermes 공식 메모리 시스템의 표준 구현

### 결론

**곰너이 님이 구축한 메모리 시스템은 Hermes 공식 Persistent Memory 시스템과 정확히 동일한 표준 구조**를 따르고 있습니다:

- ✅ 2-tier 메모리 (MEMORY.md + USER.md)
- ✅ 글자 제한 정확히 일치 (2,200 / 1,375)
- ✅ Frozen snapshot 자동 주입
- ✅ SQLite FTS5 Session Search
- ✅ Substring matching memory tool
- ✅ Duplicate prevention
- ✅ Security scanning

**차이는 "외부 Memory Provider를 쓰느냐 마느냐"뿐**입니다. 곰너이 님 시스템은 built-in만 사용하고, 공식 Hermes는 8개 외부 provider 옵션 제공.

### "장기 기억 보유 하네스" = Memory Provider 활성화

곰너이 님이 말씀하신 "하네스 자체가 장기 기억을 보관"한다는 것의 정체는 **공식 Hermes의 8개 Memory Provider**이고, 곰너이 님 시스템에 없는 부분입니다. **Holographic 도입** (무료, 로컬, SQLite)이 가장 시급한 후속 작업.

---

## 검증 출처 (URL 인용)

1. **Hermes 공식 — Persistent Memory** (직접 fetch, 56,031 bytes)
   https://hermes-agent.nousresearch.com/docs/user-guide/features/memory

2. **Hermes 공식 — Memory Providers** (직접 fetch, 112,784 bytes)
   https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers

3. **Hermes 공식 — Honcho Memory** (link in providers page)
   https://hermes-agent.nousresearch.com/docs/integrations/honcho

4. **곰너이 님 시스템 자체 (스킬 v2.2.0)**
   `C:\Users\kis\AppData\Local\hermes\skills\autonomous-ai-agents\hermes-agent\SKILL.md` (23,742 bytes)
   → "Persistent memory across sessions" / "Pluggable memory backends (built-in, Honcho, Mem0, and more)"

5. **곰너이 님 시스템 자체 (MEMORY.md)**
   `C:\Users\kis\AppData\Local\hermes\memories\MEMORY.md` (2,197/2,200 chars, 13 entries)

6. **곰너이 님 시스템 자체 (USER.md)**
   `C:\Users\kis\AppData\Local\hermes\memories\USER.md` (1,087/1,375 chars)

---

저장: 2026-06-08 13:15 KST
작성: Hermes (minimax-m3)
상태: §0 Auto-Recall 3종 발동, 공식 문서 2개 페이지 168KB 직접 fetch, 곰너이 님 시스템 표준 매핑 완료
곰너이 님 검토 대기: Holographic (또는 다른 provider) 도입 여부

---

## 6. 후속 작업: PostgreSQL 마이그레이션 (2026-06-10)

**⚠️ 본 문서는 6/8 시점 기준. 현재(2026-06-10) Holographic(SQLite) → holographic-pg(PostgreSQL) 마이그레이션 완료로 다음 변경됨:**

| 항목 | 6/8 결정 | 6/10 현재 |
|:-----|:---------|:---------|
| Provider | `holographic` (SQLite) | **`holographic-pg` (PostgreSQL)** |
| 저장소 | `~/.hermes/memory_store.db` | `vf2_db.memory.*` |
| 손상 상태 | ❌ 6/8 22:48 손상 | ✅ 깨끗 (PostgreSQL) |
| 복구 가능 | ❌ 백업 0건 정상 | ✅ 자동 백업 + 무한 확장 |
| 무한 확장 | ⚠️ SQLite 한계 | ✅ 진짜 무한 |
| HRR 벡터 | BLOB | BYTEA (동일) |
| FTS | FTS5 | tsvector + GIN |
| 플러그인 | `/opt/hermes/.../memory/holographic/` | `/opt/hermes/.../memory/holographic_pg/` |

**상세 후속 문서**: `Wiki/의사결정/Hermes-Persistent-Memory-PostgreSQL-마이그레이션-20260610.md` (9,864 bytes, 8 sections)

**구현 스킬**: `/opt/hermes/skills/hermes-persistent-memory-postgresql/` (v1.0.0)

**핵심 Pitfall**:
- `~/.hermes/memory_store.db` 6/8 22:48 손상 (magic `2CS\x8a` ≠ SQLite)
- 6/9, 6/10 백업 둘 다 이미 손상 → **복구 가능한 정상본 0건**
- 깨끗하게 PostgreSQL로 마이그레이션 후 모든 검증 통과

**다음 에이전트 (Windows/Telegram/Discord) 적용**: `Hermes-Persistent-Memory-PostgreSQL-마이그레이션-20260610.md` §6 참조
