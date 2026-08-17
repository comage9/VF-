# Hermes Persistent Memory 통합 가이드 — 다른 에이전트용 (2026-06-08)

> **목적:** 다른 Hermes Agent(Windows/Linux/Telegram/Discord)가 이 문서 하나로 즉시 동일한 Persistent Memory 시스템을 적용할 수 있도록 함
> **버전:** 1.0 (2026-06-08 15:00 KST)
> **작성:** Hermes (minimax-m3 → deepseek-v4-flash, 6/8 모델 교체)
> **GitHub raw URL:** https://raw.githubusercontent.com/comage9/obsidian-vault/master/obsidian/06-Wiki-시스템/Wiki/의사결정/Hermes-Persistent-Memory-통합-가이드-20260608.md

---

## 📋 이 문서가 해결하는 문제

**"장기 기억 보유 Hermes"를 구축하는 표준 방법.** 곰너이 님 시스템이 built-in memory 표준을 따르고 있으나, **8개 외부 Memory Provider + 자동 6단계 동작 + Memory consolidation cron**이 미구현 상태. 이 가이드로 즉시 활성화 가능.

---

## 🎯 적용 규칙 — 모든 에이전트 공통

### §1. Built-in Memory (무조건 활성)

**모든 Hermes 인스턴스에 자동 적용됨:**
- `~/.hermes/memories/MEMORY.md` (2,200 chars, ~800 tokens)
- `~/.hermes/memories/USER.md` (1,375 chars, ~500 tokens)
- 매 세션 시작 시 frozen snapshot으로 System Prompt에 자동 주입
- SQLite FTS5 session_search (`~/.hermes/state.db`)

**곰너이 님 시스템 매핑:**
- Windows: `C:\Users\kis\AppData\Local\hermes\memories\`
- Linux: `~/.hermes/memories/`

### §2. Memory Capacity 관리 (공식 권장)

| 상태 | 동작 |
|------|------|
| **< 80%** | 정상 (free 공간 충분) |
| **80-95%** | 새 entry 추가 전 consolidation 검토 |
| **95%+** | 즉시 consolidation 필수 |
| **100%** | add 실패 (replace/remove 먼저) |

**공식 인용:** "When memory is above 80% capacity, consolidate entries before adding new ones."

### §3. Memory Tool 자동 사용 정책

- `add` / `replace` / `remove` 3개 액션 자동 사용
- `old_text` substring 매칭 활용 (전체 entry 불필요)
- **Save These 자동:** 환경/교정/컨벤션/완료작업/명시요청
- **Skip These:** 자명/쉽게재발견/대용량raw/ephemeral/이미_context에_있음

---

## 🛠️ §4. 8개 External Memory Provider 활성화 (선택, 활성 완료: Holographic)

### 4-1. Provider 비교표

| Provider | 핵심 | 비용 | Best for | 난이도 |
|----------|------|------|----------|--------|
| **Holographic** | Local SQLite + FTS5 + trust scoring + HRR | 무료, 외부 의존 X | 로컬 전용 | 쉬움 |
| OpenViking | Filesystem-style KM hierarchy (ByteDance) | 무료 (AGPL-3.0) | Self-hosted | 중간 |
| ByteRover | CLI 기반, local-first + cloud sync | npm install | 개발자 portable | 쉬움 |
| Honcho | Cross-session user modeling, dialectic | Cloud/자체 | Multi-agent | 어려움 |
| Mem0 | Production-ready, 26% LLM-judge 향상 | Cloud | 범용 production | 중간 |
| Hindsight | Knowledge graph + cross-memory synthesis | Cloud/자체 | KG 기반 | 어려움 |
| RetainDB | Vector+BM25+Reranking, 7 memory types | $20/month | RetainDB 사용자 | 중간 |
| Supermemory | Semantic recall + user profiling | Cloud | Semantic profiling | 중간 |

### 4-2. ✅ Windows Holographic 활성화 완료 (2026-06-08)

> 아래 절차는 Windows Hermes에서 이미 완료. Linux/Telegram에서 동일하게 실행하면 적용됩니다.

```bash
# 1. 설치
pip install holographic

# 2. Setup wizard 실행
hermes memory setup
# → "holographic" 선택

# 3. 상태 확인
hermes memory status
# → "holographic active" 확인

# 4. 설정 파일 생성 확인
ls ~/.hermes/holographic.json
```

**Holographic 특징:**
- **로컬 SQLite** (외부 의존 X)
- **Trust scoring** (asymmetric feedback: +0.05 helpful / -0.10 unhelpful)
- **HRR (Holographic Reduced Representations)** for compositional queries
- **Fact store 도구** (`fact_store` tool)
- 곰너이 님의 obsidian+git 자체 호스팅 성향과 가장 부합

### 4-3. Provider 자동 6단계 동작 (활성화 시)

Memory provider 활성화 시 자동으로:
1. System Prompt에 provider context 주입
2. 매 turn마다 relevant memories prefetch (background non-blocking)
3. 매 응답 후 conversation turn sync
4. Session 종료 시 memory 추출
5. Built-in memory writes를 external provider에 mirror
6. Provider-specific 도구 추가 (검색/저장/관리)

---

## 🔄 §5. Memory Consolidation (80% 임계점 회복 절차)

### 5-1. Wiki 분리 대상 식별

다음 조건에 해당하는 항목은 MEMORY.md에서 Wiki로 이동:
- 200 chars 이상 (큰 항목)
- 시간 의존성 낮음 (참고용)
- 다른 에이전트도 참조 가능

**예시:** `Wiki/의사결정/Hermes-Long-Term-Memory-가이드-20260608.md` (4,331 bytes) — 곰너이 님 MEMORY.md에서 분리

### 5-2. MEMORY.md 슬림화 절차

```bash
# 1. 현재 용량 확인
wc -c ~/.hermes/memories/MEMORY.md

# 2. 80% 초과 시 consolidation 실행
# a) 큰 항목 (200+ chars) 식별
grep -E "^[^§].{200,}" ~/.hermes/memories/MEMORY.md

# b) Wiki로 분리
cat > /path/to/wiki/document.md << 'EOF'
# 분리된 항목 제목
저장: YYYY-MM-DD
[본문]
EOF

# c) MEMORY.md에서 해당 항목 제거
# 1줄 요약으로 대체 (예: "4-way memory 표준: Wiki Hermes-Long-Term-Memory-가이드-20260608 참조")

# 3. 검증
wc -c ~/.hermes/memories/MEMORY.md
# 목표: < 1,760 bytes (80% of 2,200)
```

### 5-3. 곰너이 님 시스템 사례 (2026-06-08)

| 항목 | 이전 | 이후 | 감소 |
|------|------|------|------|
| **MEMORY.md 크기** | 3,224 bytes (146.5%) | 2,058 bytes (93.55%) | -36.2% |
| **13개 항목** | 그대로 | 12개 항목 (1개 Wiki로 이동) | -7.7% |
| **공식 80% 권장** | ❌ 초과 | ⚠️ 권장 범위 (consolidation OK) | 회복 |

---

## 📁 §6. 적용된 파일 (2026-06-08)

| 파일 | 변경 |
|------|------|
| `skills/autonomous-ai-agents/hermes-agent/SKILL.md` | **v2.2.0 → v2.3.0** — Persistent Memory 섹션 9개 subsection 신설 (62,577 bytes) |
| `memories/MEMORY.md` | **3,224 → 2,058 bytes** (consolidation, 4-way memory 항목 Wiki로 이동) |
| `Wiki/의사결정/Hermes-공식-Memory-시스템-분석-20260608.md` | 신규 (13,117 bytes) |
| `Wiki/의사결정/Hermes-Long-Term-Memory-가이드-20260608.md` | 신규 (4,331 bytes) |
| `Wiki/의사결정/Hermes-Persistent-Memory-통합-가이드-20260608.md` | 본 문서 (5,500 bytes) |

---

## 🔍 §7. 다른 에이전트 검증 절차 (적용 후)

### 1단계: Built-in Memory 자동 주입 확인

```bash
# 새 세션 시작 후, System Prompt 헤더 확인
# 예상 출력: "MEMORY (your personal notes) [X% — N/2,200 chars]"
# 예상 출력: "USER PROFILE [X% — N/1,375 chars]"
```

### 2단계: Memory Tool 사용 가능 확인

```bash
hermes memory status
# 예상 출력: built-in memory active (always)
```

### 3단계: External Provider 활성화 (선택)

```bash
hermes memory setup
# → "holographic" 선택
hermes memory status
# → "holographic active + built-in active"
```

### 4단계: Session Search 작동 확인

```bash
# In-session:
session_search(query="PBM110MW", limit=3)
# → 3건의 과거 세션 결과 (FTS5 ~20ms)
```

### 5단계: MEMORY.md 용량 모니터링

```bash
wc -c ~/.hermes/memories/MEMORY.md
# 목표: < 1,760 bytes (80%)
# 1,760~2,090 bytes: consolidation 권장
# 2,090+ bytes: 즉시 consolidation 필요
```

---

## ⚠️ §8. Pitfalls (적용 시 주의)

1. **8개 provider 동시 사용 불가** — 한 번에 1개만 active. 다른 provider는 동시에 install 가능하지만 active 전환 필요.
2. **Cloud provider = 비용 발생** — Honcho/Mem0/RetainDB/Supermemory는 API 키 + 비용. 무료 옵션(Holographic/OpenViking/ByteRover) 우선 검토.
3. **Provider 변경 시 built-in은 유지** — built-in memory는 external provider 활성화와 무관하게 항상 작동.
4. **MEMORY.md 80% 초과 시 add 실패** — 먼저 replace/remove로 정리 후 진행.
5. **MEMORY.md 변경 = 다음 세션부터 반영** — frozen snapshot이므로 현재 세션에는 적용 안 됨.
6. **Cross-device 동기화 시 충돌 가능** — `cross-device-hermes` 스킬의 Syncthing으로 동기화 시 MEMORY.md 변경 충돌 주의. 시점 기반 last-write-wins 또는 수동 통합 필요.

---

## 📚 §9. 관련 문서 (Git 추적)

1. `Wiki/의사결정/Hermes-공식-Memory-시스템-분석-20260608.md` (13,117 bytes) — 공식 Hermes Persistent Memory + 8개 Provider 분석
2. `Wiki/의사결정/Hermes-Long-Term-Memory-가이드-20260608.md` (4,331 bytes) — 4-way memory 표준 일치 + 3가지 작업 방향
3. `Wiki/의사결정/카르파티-LLM-Wiki-패턴-분석-20260608.md` (13,538 bytes) — 카르파티 LLM Wiki 패턴
4. `Wiki/의사결정/AI-에이전트-장기기억-아키텍처-20260608.md` (10,638 bytes) — 표준 long-term memory 시스템 비교
5. `Wiki/의사결정/하네스-장기기억-분석-20260608.md` (13,867 bytes) — 표준 Auto-Harness의 4 pillars
6. `skills/autonomous-ai-agents/hermes-agent/SKILL.md` (v2.3.0, 62,577 bytes) — Persistent Memory 섹션
7. `skills/devops/cross-device-hermes/SKILL.md` (v1.2.0) — Cross-device memory sync
8. `skills/devops/self-learning-cron/SKILL.md` — Self-learning cron (memory consolidation 자동화 가능)

---

## ✅ §10. 다음 단계

- [x] **Holographic 도입** (`pip install holographic` + `hermes config set memory.provider holographic`) — ✅ Windows 활성 완료 (2026-06-08)
- [ ] OpenViking 검토 (카르파티 LLM Wiki와 통합)
- [ ] index.md 수동 작성 (Wiki 카탈로그) — ✅ 완료
- [x] **log.md 자동 생성** (cron) — ✅ 완료
- [x] **Cross-device memory sync 절차 강화** — ✅ 온보딩 가이드 갱신
- [ ] Linux/Telegram Hermes에 Holographic 동일 설정
- [x] **Sources 폴더 신설** (2026-06-08) — 원본자료 아카이브, 바이너리 Git 차단
- [x] **Output 폴더 신설** (2026-06-08) — AI 결과물 날짜별 보관
- [x] **용량 검증 cron** (2026-06-08) — 매일 12시, 50/100MiB 임계

---

## 관련 문서
- [AI-에이전트-장기기억-아키텍처-20260608.md](./AI-에이전트-장기기억-아키텍처-20260608.md) — LTM 표준 분류
- [카르파티-LLM-Wiki-패턴-분석-20260608.md](./카르파티-LLM-Wiki-패턴-분석-20260608.md) — 3-Layer 패턴
- [Hermes-공식-Memory-시스템-분석-20260608.md](./Hermes-공식-Memory-시스템-분석-20260608.md) — 8개 External Provider
- [하네스-장기기억-분석-20260608.md](./하네스-장기기억-분석-20260608.md) — Harness 시스템 메모리
- 긴밀 통합: `hermes-agent` SKILL.md §Persistent Memory (v2.3.0)

---

저장: 2026-06-08 15:00 KST
최종 작성자: Hermes (minimax-m3 → deepseek-v4-flash)
검토 대기: 곰너이 님
