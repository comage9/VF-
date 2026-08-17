# Hermes Persistent Memory — Holographic → PostgreSQL 마이그레이션 (2026-06-10)

> **이전 상태 (2026-06-08):** `Holographic` (SQLite, `~/.hermes/memory_store.db`) — 1순위 추천, ✅ 활성
> **현재 상태 (2026-06-10):** `Holographic-Pg` (PostgreSQL, `vf2_db.memory.*`) — **마이그레이션 완료**

저장일: 2026-06-10
상태: ✅ 활성 (Linux)
GitHub raw URL: https://raw.githubusercontent.com/comage9/obsidian-vault/master/obsidian/06-Wiki-시스템/Wiki/의사결정/Hermes-Persistent-Memory-PostgreSQL-마이그레이션-20260610.md

---

## 1. 마이그레이션 사유

### 손상 발생
- **시점**: 2026-06-08 22:48 KST
- **증상**: `~/.hermes/memory_store.db` 첫 4 바이트 = `0x32 0x43 0x53 0x8a` ("2CS\x8a") ≠ SQLite magic `53 51 4c 69` ("SQLi")
- **사유 추정**: Holographic 활성화 후 약 4시간 이내 외부 프로세스가 파일 덮어쓰기. 정확한 원인 미확인.
- **백업 검증**: 6/9 (03:04), 6/10 (03:04) 백업 둘 다 **이미 손상된 상태**로 백업됨 → **복구 가능한 정상본 0건**

### PostgreSQL 결정
- 6/8 Wiki는 **Holographic (SQLite)** 1순위 추천이었으나, 손상 사고로 무한 확장 가능한 **PostgreSQL 백엔드**로 전환 결정
- `vf2_db` (Docker `postgres_hermes`) 이미 VF2 비즈니스용으로 운영 중 → 같은 컨테이너에 `memory` 스키마 격리 추가
- 별도 컨테이너/클러스터 불필요 → 운영 부담 0

---

## 2. 적용된 변경 (2026-06-10)

### 2-1. 손상 DB 처리
| 파일 | 처리 |
|:-----|:-----|
| `/opt/hermes/memory_store.db` (437,865 B, 손상) | `memory_store.db.corrupted-20260610` 으로 백업 후 **삭제** |
| `/tmp/backup_0609/hermes/memory_store.db` (6/9 백업) | 6/9 시점 이미 손상 → 무시 |

### 2-2. PostgreSQL 스키마 (vf2_db)
| 객체 | 내용 |
|:-----|:-----|
| Schema | `memory` (격리, VF2 비즈니스 테이블과 분리) |
| Tables | `facts` / `entities` / `fact_entities` / `memory_banks` (4개) |
| Indexes | 10개 (GIN tsvector, trust_score DESC, entities name 등) |
| Triggers | `updated_at` 자동 갱신 (`memory.touch_updated_at`) |
| FTS | `tsvector GENERATED ALWAYS AS to_tsvector('simple', content \|\| ' ' \|\| tags)` + GIN |
| HRR 벡터 | `BYTEA` (SQLite BLOB 대체) |
| 스키마 파일 | `/opt/hermes/skills/hermes-persistent-memory-postgresql/references/postgresql-ddl.sql` (재사용 가능) |

### 2-3. 의존성
| 패키지 | 버전 | 설치 명령 |
|:-------|:-----|:---------|
| `psycopg2-binary` | 2.9.12 | `uv pip install --python /opt/hermes/hermes-agent/venv/bin/python psycopg2-binary` |

### 2-4. 새 Provider: `holographic-pg`
| 파일 | LOC | 위치 |
|:-----|:---:|:-----|
| `plugin.yaml` | 8 | `/opt/hermes/hermes-agent/plugins/memory/holographic_pg/plugin.yaml` |
| `__init__.py` | ~350 | `/opt/hermes/hermes-agent/plugins/memory/holographic_pg/__init__.py` (`HolographicPgMemoryProvider`) |
| `store_pg.py` | ~580 | `/opt/hermes/hermes-agent/plugins/memory/holographic_pg/store_pg.py` (`MemoryStore` + psycopg2) |

**호환성**: 기존 `holographic` (SQLite)의 모든 public API (add_fact / search_facts / update_fact / remove_fact / list_facts / record_feedback / probe_entity / related_entities / fact_count / stats) 1:1 변환. `fact_store` / `fact_feedback` tool schema 동일. **호출 코드 변경 0건**.

### 2-5. Config 변경
- `memory.provider: holographic` → **`holographic-pg`** (`hermes config set memory.provider holographic-pg`)

---

## 3. 마이그레이션 검증 (전체 통과)

| # | 테스트 | 결과 |
|:--|:-------|:----:|
| 1 | 손상 DB 헤더 `2CS\x8a` ≠ SQLite magic | ✅ |
| 2 | 백업 11개 (5/24~6/10) memory_store.db 추출 | ✅ 모두 손상/부재 |
| 3 | vf2_db `memory` 스키마 4 tables + 10 indexes + 1 trigger | ✅ |
| 4 | psycopg2 2.9.12 venv 설치 | ✅ |
| 5 | Plugin import + `is_available()` | ✅ |
| 6 | `initialize()` + `system_prompt_block()` | ✅ |
| 7 | `fact_store add` (fact_id=2) | ✅ |
| 8 | `fact_store search` (tsvector FTS, 1 hit) | ✅ |
| 9 | `fact_store stats` / `list` / `probe` | ✅ |
| 10 | `fact_store remove` / `feedback` | ✅ |
| 11 | `hermes config set memory.provider holographic-pg` | ✅ |
| 12 | `hermes memory status` → `Provider: holographic-pg` | ✅ |

---

## 4. SQLite vs PostgreSQL — 최종 비교

| 항목 | SQLite (구) | PostgreSQL (신) |
|:-----|:------------|:----------------|
| 파일 | `~/.hermes/memory_store.db` | `vf2_db.memory.*` |
| 백업 | tar.gz 일부 | `pg_dump` 또는 자동 백업 |
| 무한 확장 | ⚠️ 안전 한계 ~1TB | ✅ 진짜 무한 |
| 동시성 | ⚠️ 단일 writer | ✅ MVCC, 다중 writer |
| FTS | FTS5 (내장) | tsvector + GIN (PostgreSQL 내장) |
| HRR 벡터 | BLOB | BYTEA (동일) |
| Trust scoring | ✅ | ✅ (1:1) |
| Entity resolution | ✅ | ✅ (1:1) |
| Compositional query | ✅ HRR | ✅ HRR (residual 기능) |
| Crash 안전성 | ⚠️ WAL 의존 | ✅ MVCC |

---

## 5. 이전 6/8 문서 갱신 필요

| 문서 | 갱신 내용 |
|:-----|:---------|
| `Hermes-공식-Memory-시스템-분석-20260608.md` | §4-2 "Holographic ⭐⭐⭐⭐⭐" → "손상으로 비활성, holographic-pg로 전환" |
| `Hermes-Persistent-Memory-통합-가이드-20260608.md` | §4-2 "Windows Holographic 활성화 완료" → "PostgreSQL 마이그레이션 (2026-06-10) 완료" |
| `Hermes-Long-Term-Memory-가이드-20260608.md` | §5 후속작업 "Holographic 도입 ⚠️" → "✅ PostgreSQL 마이그레이션 완료 (2026-06-10)" |
| `에이전트-온보딩-가이드.md` | §7 "Holographic" → "holographic-pg" |

**주의**: 기존 6/8 문서를 **직접 수정하지 않고** "후속 작업" 섹션 추가 권장. 이전 결정 맥락 보존.

---

## 6. 다른 에이전트 (Windows/Telegram/Discord) 적용 절차

### 1단계: PostgreSQL 도커 컨테이너 확인
```bash
docker ps | grep postgres_hermes  # vf2_db 사용 중이어야 함
# 없으면: docker run -d --name postgres_hermes -p 5432:5432 -e POSTGRES_PASSWORD=*** postgres:16-alpine
```

### 2단계: 스키마 적용
```bash
DBURL=$(grep -E '^DATABASE_URL' /home/comtop/workspace/VF2/backend/.env | cut -d= -f2- | tr -d '"')
psql "$DBURL" -f /opt/hermes/skills/hermes-persistent-memory-postgresql/references/postgresql-ddl.sql
# → CREATE SCHEMA / 4 tables / 10 indexes / 1 trigger
```

### 3단계: psycopg2 설치
```bash
uv pip install --python /opt/hermes/hermes-agent/venv/bin/python psycopg2-binary
# 또는 /usr/bin/pip install psycopg2-binary
```

### 4단계: Plugin 확인
```bash
ls /opt/hermes/hermes-agent/plugins/memory/holographic_pg/
# 3개 파일 있어야 함: __init__.py, store_pg.py, plugin.yaml
# 없으면 /opt/hermes/skills/hermes-persistent-memory-postgresql/references/holographic-pg-plugin-source.md 에서 복사
```

### 5단계: Config 변경
```bash
hermes config set memory.provider holographic-pg
hermes memory status
# → Provider: holographic-pg
```

### 6단계: 검증
```bash
cd /opt/hermes/hermes-agent
python3 plugins/memory/holographic_pg/store_pg.py
# → "=== holographic-pg store smoke test === ... OK"
```

---

## 7. 함정 (Pitfalls)

1. **`memory_store.db` 가 손상되면 자동 재생성 안 됨** — `fact_store` 호출 시 `OperationalError: unable to open database file` 발생. **명시적으로 `rm` 후 다음 호출 시 재생성**. holographic init 코드가 자동 처리하나, 안전을 위해 수동 권장.

2. **psycopg2 RealDictCursor는 `[0]` 인덱싱 불가** — `cur.fetchone()['colname']` 또는 `AS alias` 추가. SQLite `sqlite3.Row`와 다름 (둘 다 인덱싱 가능).

3. **`asyncmode=False` 옵션은 psycopg2에 없음** — `psycopg2.connect(dsn)` 으로 호출. `asyncmode`는 psycopg3 전용.

4. **`holographic-pg` plugin 디렉토리 위치** — `/opt/hermes/hermes-agent/plugins/memory/holographic_pg/` (코드). `~/.hermes/plugins/`는 사용자 plugin 디렉토리 (별도).

5. **6/8 Wiki 4개 문서 outdated** — 6/8 시점 = Holographic(SQLite) 활성 결정. 6/10 = PostgreSQL 마이그레이션. **새로 본 문서 (=이 문서)를 우선 참조**.

6. **DSN 마스킹** — `/home/comtop/workspace/VF2/backend/.env` `DATABASE_URL`을 shell inline에서 `***REDACTED***` 처리될 수 있음. 별도 `.sh` 파일 또는 `env -i` 패턴 사용.

7. **`hermes memory status` "NOT installed" 메시지** — `~/.hermes/plugins/` 사용자 디렉토리 미설치 의미. 시스템 plugin 디렉토리 (`/opt/hermes/.../plugins/memory/`)에 있으면 자동 로드됨. config + 디렉토리만 OK면 동작.

---

## 8. 관련 문서 (Git 추적)

1. **본 문서**: `Hermes-Persistent-Memory-PostgreSQL-마이그레이션-20260610.md`
2. **이전 6/8 분석**: `Hermes-공식-Memory-시스템-분석-20260608.md` (13,117 bytes)
3. **이전 6/8 통합 가이드**: `Hermes-Persistent-Memory-통합-가이드-20260608.md` (10,724 bytes)
4. **이전 6/8 LTM 가이드**: `Hermes-Long-Term-Memory-가이드-20260608.md` (4,842 bytes)
5. **에이전트 온보딩**: `에이전트-온보딩-가이드.md` (운영원칙/)
6. **구현 스킬**: `/opt/hermes/skills/hermes-persistent-memory-postgresql/SKILL.md` (1.0.0)
7. **DDL**: `/opt/hermes/skills/hermes-persistent-memory-postgresql/references/postgresql-ddl.sql`
8. **Plugin source**: `/opt/hermes/skills/hermes-persistent-memory-postgresql/references/holographic-pg-plugin-source.md`
9. **마이그레이션 세션**: `/opt/hermes/skills/hermes-persistent-memory-postgresql/references/2026-06-10-migration-session.md` (7,591 bytes)
10. **SQLite→Postgres 매핑**: `/opt/hermes/skills/hermes-persistent-memory-postgresql/references/sqlite-to-postgres-mapping.md`

---

저장: 2026-06-10 11:30 KST
작성: Hermes (minimax-m3, 6/10 모델)
상태: ✅ PostgreSQL 마이그레이션 완료, 모든 검증 통과, 다른 에이전트 적용 절차 §6 참조
