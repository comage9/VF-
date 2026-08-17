---
title: Wiki Phase1-2 검증 보고 및 Phase3 지시서
created: 2026-08-02
updated: 2026-08-02
type: 의사결정
status: Phase1-2검증완료-Phase3대기
tags: [wiki, phase3, verification]
신뢰도: EXTRACTED
sources:
  - 실측:2026-08-02 20:03
  - 계획서:의사결정/LLM-Wiki-시스템-구축-계획서-20260802.md
---

# Wiki Phase 1–2 검증 보고 + Phase 3 지시서

> **검증 시각:** 2026-08-02 20:03  
> **검증자:** CLI Hermes (실측 전용, 수정 없음)  
> **SSOT:** `E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki-okf`

---

## 1. 종합 판정

| Phase | 판정 | 비고 |
|:-----:|:----:|------|
| **1** | ✅ 합격 (경미 보완 1건) | 포인터·ENV·리다이렉트·vault_gate OK |
| **2** | ✅ 합격 | SCHEMA/index/log/Sources 실측 일치 |
| **3 진입** | ✅ **가능** | 아래 지시서대로 진행 |

**블로커 없음.** Phase 3 진행 가능.

---

## 2. Phase 1 실측

| # | 항목 | 기대 | 실측 | 판정 |
|---|------|------|------|:----:|
| 1.2 | Hermes `.env` `WIKI_PATH` | SSOT | `WIKI_PATH=E:\hermes-backup\obsidian\06-Wiki-시스템\Wiki-okf` | ✅ |
| 1.3 | `C:\Users\kis\.wiki_location` | SSOT 1줄 | 동일 경로 | ✅ |
| 1.3b | `AppData\Local\hermes\.wiki_location` | (옵션) | **없음** | ⚠️ 경미 |
| 1.4 | `Wiki/README.md` 리다이렉트 | SSOT 안내 | 존재, 문구 정확 | ✅ |
| 1.5 | `vault_gate.py` | Syntax OK + 경로 출력 | first=`"""`, rc=0, `Wiki vault: E:\...\Wiki-okf` | ✅ |
| — | 현재 셸 `os.environ WIKI_PATH` | 로드됨 | **None** (프로세스 미재시작) | ⚠️ 참고 |

### Phase 1 보완 (필수 아님 · Phase 3 전/중 처리 권장)
1. **`C:\Users\kis\AppData\Local\hermes\.wiki_location`** 에 동일 SSOT 경로 1줄 복사 (이중 안전).  
2. **Gateway/Hermes 재시작** 1회 → 런타임이 `WIKI_PATH` 를 확실히 로드.  
3. (선택) 사용자 시스템 환경변수 `WIKI_PATH` 등록 — 새 터미널 기본값.

---

## 3. Phase 2 실측

| # | 항목 | 실측 | 판정 |
|---|------|------|:----:|
| 2.1 SCHEMA Domain | `보노하우스 VF 생산관리 + 물류...` / KI는 하위 | ✅ |
| 2.1 태그 | 7그룹 (시스템/생산/물류/트레이딩/지식/품질/상태) | ✅ |
| 2.1 신뢰도 필드 | `EXTRACTED \| INFERRED` frontmatter | ✅ |
| 2.2–2.3 index | 헤더 **전체 페이지: 155**, 갱신 2026-08-02 | ✅ |
| disk md 총수 | **155** | ✅ |
| index md 링크 수 | **149** | ✅ |
| broken index links | **0** | ✅ |
| content not in index | **0** | ✅ |
| 분류 | content 146 + system 3 + infra 6 = 155 | ✅ (라벨 차이는 무해) |
| 2.4 log | Phase1 20:15 / Phase2 20:30 entry 존재 | ✅ |
| 2.5 Sources/텍스트 | 디렉터리 존재 (빈 폴더 OK) | ✅ |
| Output/템플릿 | `01-ingest` `02-update` `03-output` 3종 | ✅ |

### Phase 2 숫자 해석
에이전트 보고 `disk 155 = index 149 + system 3 + infra 3` 와 실측 `infra 6` 은 **집계 기준 차이**(README 등 infra md 포함 여부)일 뿐,  
**missing 0 / broken 0** 이 핵심이며 **합격**.

### Phase 2 권장 보완 (비블로커)
- index 헤더 155 vs content 링크 149: 헤더에 system/infra 포함 정책이면 SCHEMA에 한 줄 명시하면 이후 혼선 감소.  
- 기존 페이지 frontmatter 일괄 강제 변환은 **하지 말 것** (INV / 계획서 비범위).

---

## 4. Phase 3 사전 스냅샷 (이중 트리)

| 트리 | md 수 | 비고 |
|------|------:|------|
| Wiki-okf (SSOT) | 155 | 앞서감 |
| Wiki-obsidian | 145 | okf 부분집합 |
| **only_obsidian** | **0** | obsidian에만 있는 파일 없음 |
| **only_okf** | **10** | okf에만 있음 (아래) |

**only_okf 10건 (obsidian 미러에 없음):**
1. `물류/14시-차량-배차-완료-기준-확립-20260619.md`
2. `물류/VF-departure-DB-갱신-완료-20260619.md`
3. `운영원칙/VF2-생산계획-컬럼-체계-2026-06-23.md`
4. `운영원칙/VF2-제품-명칭-체계-2026-06-23.md`
5. `의사결정/14-00-차량-배차-워크플로우-SSOT-20260619.md`
6. `의사결정/LLM-Wiki-시스템-구축-계획서-20260802.md`
7. `의사결정/Phase-3-5-전면마이그레이션-완료-20260619.md`
8. `의사결정/Wiki-폴더-2개-구성-20260619.md`
9. `의사결정/cronjob-에러-2건-자동수정-20260619.md`
10. `의사결정/playwright-전환-20260621.md`

→ Phase 3는 **충돌 병합이 아니라, okf → obsidian 단방향 동기(선택) + 빈 Wiki 정리** 가 본체.

---

## 5. Phase 3 지시서 (실행 에이전트용)

### 목표
쓰기 SSOT = **Wiki-okf 만**. Wiki-obsidian은 미러. 빈 `Wiki/` 는 리다이렉트 유지.

### 금지
- Wiki-okf 콘텐츠 삭제/비우기  
- obsidian → okf 로 덮어쓰기 (only_obs=0 이라 불필요)  
- `git reset --hard` / 무분별 checkout  
- 바이너리 대량 커밋  
- Telegram 장세션에서 대량 작업

### 작업 목록

| ID | 작업 | 방법 | 검증 |
|:--:|------|------|------|
| **3.0** | Phase1 경미 보완 | `hermes/.wiki_location` 생성 + (가능 시) gateway 재시작 안내 | 파일 존재, vault_gate |
| **3.1** | diff 기록 | only_okf 10 / only_obs 0 표를 log.md에 남김 | log tail |
| **3.2** | (권장) okf→obsidian 복사 | only_okf 10파일을 **동일 상대경로**로 `Wiki-obsidian/`에 복사 (덮어쓰기 없음, 신규만) | obsidian에도 10파일 존재 |
| **3.3** | 해시 스팟체크 | 복사 후 3파일 sha256 okf==obsidian | 일치 |
| **3.4** | 빈 `Wiki/` | README 리다이렉트 유지. SCHEMA/자기사고 삭제 **하지 말 것**(또는 사용자 승인 시에만). junction은 **이번 Phase 생략** | README 존재 |
| **3.5** | Obsidian 가이드 1페이지 | `의사결정/Wiki-SSOT-경로-안내-20260802.md` 짧은 문서: vault를 okf로 열 것 | 파일 존재 |
| **3.6** | log.md append | Phase 3 완료 entry | tail |
| **3.7** | (선택) git | md만 add/commit. push는 사용자 확인 후 | status clean or commit hash |

### 3.2 복사 명령 예시 (실행 에이전트)
```bash
SSOT="E:/hermes-backup/obsidian/06-Wiki-시스템/Wiki-okf"
OBS="E:/hermes-backup/obsidian/06-Wiki-시스템/Wiki-obsidian"
# only_okf 목록 각각:
# mkdir -p "$(dirname "$OBS/$rel")" && cp -n "$SSOT/$rel" "$OBS/$rel"
```
`-n` (no-clobber) 필수.

### 완료 정의 (Definition of Done)
- [ ] only_okf 10건이 obsidian에도 존재 **또는** “미러 동기 생략, okf-only 유지”를 log에 명시(사용자 선택 시)
- [ ] only_obsidian 여전히 0
- [ ] Wiki-okf md 수 감소 없음
- [ ] `Wiki/README.md` 리다이렉트 유지
- [ ] log.md Phase 3 entry
- [ ] broken index links 여전히 0

### 보고 형식 (실행 후 사용자에게)
```
Phase 3 완료
- 3.0 hermes .wiki_location: OK/SKIP
- 3.2 복사 N/10
- only_obs / only_okf 재실측
- log entry 시각
- git: commit 여부
```

---

## 6. Phase 4 예고 (이번 지시 범위 밖)

Phase 3 DoD 통과 후:
1. 샘플 `/ingest` 1건  
2. 샘플 `/output` 1건  
3. Daily Maintenance 수동 1회  
템플릿 3종은 이미 존재 (`Output/템플릿/`).

---

## 7. 변경 이력
| 시각 | 내용 |
|------|------|
| 2026-08-02 20:03 | Phase1–2 실측 검증. 합격. Phase3 지시서 작성. |
