---
title: Wiki Phase3 검증 및 Phase4 지시서
created: 2026-08-02
updated: 2026-08-02
type: 의사결정
status: Phase3검증완료-Phase4대기
tags: [wiki, phase4, ingest, output]
신뢰도: EXTRACTED
---

# Wiki Phase 3 검증 + Phase 4 지시서

> **검증 시각:** 2026-08-02 (실측)  
> **SSOT:** `E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki-okf`  
> **실행:** `"Phase 4 진행"` 지시 후에만. 이 문서는 지시서.

---

## 1. Phase 3 검증 판정: ✅ 합격

| 항목 | 실측 |
|------|------|
| `~/.wiki_location` | Wiki-okf |
| `AppData\Local\hermes\.wiki_location` | Wiki-okf ✅ 보강됨 |
| okf md / obsidian md | **156 / 156** |
| only_okf / only_obs | **0 / 0** |
| `Wiki/README.md` 리다이렉트 | 유지 |
| log Phase 3 entry (20:45) | 존재 |
| okf 축소·덮어쓰기 | 없음 |

블로커 없음 → **Phase 4 진입 가능.**

---

## 2. Phase 4 목표

워크플로우 **실동작 1회씩** 증명:
1. `/ingest` 샘플 (Source → Wiki 페이지 1 + index + log)  
2. `/output` 샘플 (Wiki → Output 날짜 폴더 1)  
3. Daily Maintenance 수동 1회  

템플릿 위치 (이미 존재):
- `Output/템플릿/01-ingest-템플릿.md`
- `Output/템플릿/02-update-템플릿.md`
- `Output/템플릿/03-output-템플릿.md`

스킬: `wiki-workflow` + `llm-wiki` (배향 후 진행)

---

## 3. 금지

- SSOT 외 경로에 쓰기  
- 기존 물류/운영 문서 대량 수정·삭제  
- Telegram 장세션에서 실행 (CLI 또는 `/reset` 직후)  
- 바이너리 Git 커밋  
- firecrawl 없으면 웹 대량 수집 억지 (로컬 텍스트로 샘플)  
- Phase 5 lint 전체 스캔까지 한 번에 확장 금지

---

## 4. 작업 목록

### 4.0 배향 (필수, 5분)
```
1) read SCHEMA.md
2) read index.md 헤더 + 물류/의사결정 섹션 일부
3) log.md 최근 30줄
4) skill_view wiki-workflow, llm-wiki (필요 시)
```

### 4.1 샘플 Source 준비
| 항목 | 내용 |
|------|------|
| 경로 | `Sources/텍스트/wiki-smoke/2026-08-02-phase4-smoke.txt` |
| 내용 | 짧은 사실 5~10줄 (예: Wiki SSOT 경로, Phase 1~3 완료 사실, OpenCodex 경유 모델명) |
| 규칙 | **가공 사실이 아닌 이미 확정된 사실만** (EXTRACTED) |

### 4.2 `/ingest` 샘플
템플릿 `01-ingest` 준수.

| 산출 | 경로/규칙 |
|------|-----------|
| Wiki 페이지 | `의사결정/Wiki-Phase4-워크플로우-스모크-20260802.md` (1페이지) |
| frontmatter | SCHEMA 템플릿: title, created, updated, type, status, 신뢰도, tags, sources |
| sources | `Sources/텍스트/wiki-smoke/2026-08-02-phase4-smoke.txt` |
| wikilinks | 최소 2 (`[[LLM-Wiki-시스템-구축-계획서-20260802]]` 등 기존 문서) |
| index.md | 해당 섹션에 1줄 추가, 헤더 Total+1, Last updated 오늘 |
| log.md | `ingest \| Wiki-Phase4-워크플로우-스모크` |

**검증**
- [ ] 페이지 파일 존재  
- [ ] index에 링크 있고, 대상 파일 존재 (broken 0)  
- [ ] log entry 존재  

### 4.3 `/output` 샘플
템플릿 `03-output` 준수.

| 산출 | 경로 |
|------|------|
| 결과물 | `Output/2026-08-02/wiki-ssot-한줄요약.md` |
| 내용 | SSOT 경로 + Phase 1~3 상태 + Phase4 스모크 페이지 링크 (10줄 이내) |
| 근거 | index/SCHEMA/스모크 페이지 **읽기만** (새 사실 창작 금지) |
| log | `output \| wiki-ssot-한줄요약` |

**검증**
- [ ] Output 날짜 폴더 + 파일 존재  
- [ ] Git에 넣을 바이너리 없음  

### 4.4 Daily Maintenance 수동 1회
wiki-workflow Daily Maintenance 절차:

1. 오늘(`2026-08-02`) 생성/수정 md 목록 (`git status` + mtime)  
2. log.md 오늘 섹션에 Maintenance 요약 1블록  
3. index.md 헤더 날짜·Total = disk 실측 재확인  
4. **대규모 번호 재정렬 patch 금지** — 헤더·신규 1줄만  

**검증**
```
disk md count == 헤더 정책과 모순 없음
broken index links == 0
신규 스모크 페이지 index 등재
```

### 4.5 (선택) git
- add: 텍스트 md만  
- commit 메시지 예: `Wiki Phase4: ingest/output smoke + daily maintenance`  
- **push는 사용자 승인 후**

---

## 5. Definition of Done (Phase 4)

- [ ] Source 샘플 1  
- [ ] Wiki 스모크 페이지 1 + index + log  
- [ ] Output 샘플 1  
- [ ] Daily Maintenance 기록  
- [ ] broken links 0  
- [ ] SSOT=okf 유지, obsidian 동기 필수는 아님(스모크는 okf만 써도 됨)  
- [ ] 사용자 보고 형식 아래 준수  

### 보고 형식
```
Phase 4 완료
- ingest: <경로>
- output: <경로>
- index total: N (disk M)
- broken: 0
- log entries: 시각
- git: commit 여부 / hash
```

---

## 6. Phase 5 예고 (범위 밖)

lint(고아/깨진링크/태그), Graph, 온보딩 MEMORY 1줄 — Phase 4 DoD 후 별도 지시.

---

## 7. 함정 리마인드
- Windows 경로: `E:/...` 또는 `E:\...` (`/e/...` 금지)  
- index 대규모 patch 연쇄 손상 금지  
- cron/execute_code 이슈 없음(수동 CLI 기준)  
- 압축/장세션: Telegram이면 짧은 세션만  

---

## 변경 이력
| 시각 | 내용 |
|------|------|
| 2026-08-02 | Phase3 실측 합격. Phase4 지시서 작성. |
