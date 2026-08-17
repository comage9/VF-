---
title: Wiki Phase4 검증 및 Phase5 지시서
created: 2026-08-02
updated: 2026-08-02
type: 의사결정
status: Phase4검증완료-Phase5대기
tags: [wiki, phase5, lint]
신뢰도: EXTRACTED
---

# Wiki Phase 4 검증 + Phase 5 지시서

> **검증:** 2026-08-02 실측 (수정 없음)  
> **SSOT:** `E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki-okf`

---

## 1. Phase 4 판정: ✅ 합격

| 항목 | 실측 |
|------|------|
| Source | `Sources/텍스트/wiki-smoke/2026-08-02-phase4-smoke.txt` OK |
| ingest | `의사결정/Wiki-Phase4-워크플로우-스모크-20260802.md` OK, frontmatter OK, outbound links ≥2 |
| output | `Output/2026-08-02/wiki-ssot-한줄요약.md` OK |
| index | Phase4 등재 True, **broken 0** |
| index header | 156 |
| disk md | **159** (차분 = system/infra README 등 — 정책상 허용, broken 0이 핵심) |
| log 21:00 | ingest/output/DM 기록 OK |
| git push | 미실시 (지시 준수) |

**블로커 없음 → Phase 5 진입 가능.**

### Phase 4 경미 메모 (비블로커)
- 헤더 156 vs disk 159: SCHEMA에 “헤더=콘텐츠 페이지(또는 전체 md)” 정책 한 줄 명시 권장(Phase 5.1에서 가능).

---

## 2. Phase 5 목표

마무리·품질·온보딩:
1. lint (고아/깨진링크/index 누락/태그 샘플)  
2. (가능 시) Graph 또는 링크 허브 요약  
3. 온보딩/MEMORY용 SSOT 1줄  
4. log + (선택) git commit — **push는 승인 후**

---

## 3. 금지
- 대량 rewrite / frontmatter 전수 강제  
- okf 삭제, obsidian 덮어쓰기 전쟁  
- push 무단  
- Telegram 장세션 대작업  

---

## 4. 작업 목록

### 5.0 배향
SCHEMA / index 헤더 / log 최근 확인.

### 5.1 Lint 리포트 (읽기 위주, 수정은 안전 항목만)
스캔 대상: `entities` 없으므로 **의사결정/운영원칙/물류/Hermes/개념/문제-해결/자기사고** + 루트.

| 검사 | 동작 | 산출 |
|------|------|------|
| broken wikilinks / md links | 존재 여부 | 목록 |
| orphans | inbound 0 페이지 (루트 SCHEMA/index/log 제외) | 목록 top 20 |
| index completeness | disk content vs index | missing/stale |
| frontmatter 샘플 | 최근 10페이지 필수 필드 유무 | 비율 |
| 태그 스프로울 | SCHEMA taxonomy 밖 태그 샘플 | 목록 |
| 용량 | `du -sh` SSOT, git count-objects if repo | 수치 |

**자동 수정 허용 (승인 불필요, 안전한 것만):**
- broken link 오타 1~2건 **명백한 경로 수정**  
- index 헤더 Total/날짜를 disk 정책에 맞게 정합 (SCHEMA에 정책 문구 1줄 추가 가능)

**수정 금지 (목록만):**
- orphan 대량 삭제  
- 태그 전수 rename  

산출 문서:
`의사결정/Wiki-Phase5-lint-리포트-20260802.md`

### 5.2 Graph / 허브 (경량)
옵션 A: `obsidian-graph-view` 또는 기존 graph 스크립트가 경로 맞으면 SSOT로 1회  
옵션 B: index 기준 **상위 링크 허브 10개** 표만 lint 리포트에 포함  

실패 시 B로 충분, Phase 5 실패 아님.

### 5.3 온보딩 고정
짧은 문서 1개:
`운영원칙/Wiki-SSOT-온보딩-20260802.md`

내용 필수:
```
WIKI_PATH = E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki-okf
.wiki_location = 동일
쓰기 = okf only
미러 = Wiki-obsidian (read-oriented)
빈 Wiki/ = redirect only
배향 = SCHEMA → index → log
워크플로 = /ingest /update /output
```

(선택) Hermes MEMORY/fact_store에 위 경로 **1줄** — 사용자 MEMORY 용량 주의, 초과 시 문서만.

### 5.4 log + git
- log.md: Phase 5 완료 entry  
- git add 텍스트만, commit 메시지: `Wiki Phase5: lint report + SSOT onboarding`  
- **push 금지** (사용자 승인 대기)

---

## 5. Definition of Done
- [ ] lint 리포트 문서 존재  
- [ ] broken 재실측 0 또는 남은 broken이 리포트에 전부 나열  
- [ ] 온보딩 문서 존재  
- [ ] log Phase 5 entry  
- [ ] push 안 함  

### 보고 형식
```
Phase 5 완료
- lint: <경로> broken=N orphan≈M
- onboarding: <경로>
- graph: A/B/skip
- git: commit hash or none
- push: 대기
```

---

## 6. 전체 로드맵 잔여
Phase 5 DoD 후 사용자 결정:
- git push  
- compression 보조모델 고정 (Telegram 장애 완화)  
- Daily Maintenance cron 재개 여부  

---

## 변경 이력
| 날짜 | 내용 |
|------|------|
| 2026-08-02 | Phase4 실측 합격. Phase5 지시서 작성. |
