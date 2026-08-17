---
title: Wiki Phase 5 Lint 리포트
created: 2026-08-02
updated: 2026-08-02
type: 의사결정
status: 완료
신뢰도: EXTRACTED
okf_version: 0.1
tags: [wiki, decision]
sources: []
---

# Wiki Phase 5 Lint 리포트 (2026-08-02)

## 요약

| 항목 | 값 | 판정 |
|------|-----|------|
| Total .md | 160 | — |
| Broken links | 41 | ⚠️ 레거시 (미수정) |
| Orphans | 4 | ✅ 경미 |
| Index missing | 4 → 0 | ✅ 수정 완료 |
| Wiki 용량 | 0.81 MB | ✅ |
| Git pack | 3.98 MiB | ✅ (임계 50 MiB) |

## Broken Links (41건)

대부분 **레거시 underscore 스타일** wikilink (파일 미존재):
- `[[KPP_로그인_사양.md]]`, `[[LS_주문_자동화.md]]` 등 — 구 KI Trader 시절 잔존
- 경로형 wikilink (`[[문제-해결/ki-ai-trader-...]]`) — 파일 존재하나 Obsidian 미해석

**조치:** 대량 수정 금지 원칙에 따라 미수정. Phase 5 이후 개별 문서 갱신 시 점진 해결.

## Orphans (4건)

| 파일 | 사유 |
|------|------|
| Output/2026-08-02/wiki-ssot-한줄요약.md | Phase 4 output (정상) |
| 의사결정/Wiki-Phase1-2-검증-및-Phase3-지시서-20260802.md | 지시서 (정상) |
| 의사결정/Wiki-Phase3-검증-및-Phase4-지시서-20260802.md | 지시서 (정상) |
| 의사결정/Wiki-Phase4-검증-및-Phase5-지시서-20260802.md | 지시서 (정상) |

**조치:** 삭제 금지. 모두 정상 문서.

## Index Missing → 수정 완료

4건 index.md 추가 (의사결정 섹션). 헤더 156→160 갱신.

## 태그 샘플

대부분 구 문서에 frontmatter tags 없음. Phase 2 SCHEMA 개정 이후 신규 문서만 tags 보유.
점진 적용 원칙 (기존 문서 대량 수정 금지).

## 용량

- Wiki 디렉터리: 0.81 MB
- Git pack: 3.98 MiB (경고 50 MiB / 위험 100 MiB)
- 바이너리 파일: 0건 ✅

## Hub Top 10 (Table B)

| # | 페이지 | Inbound |
|---|--------|---------|
| 1 | 의사결정/카르파티-LLM-Wiki-패턴-분석-20260608 | 6 |
| 2 | 의사결정/LLM-Wiki-시스템-구축-계획서-20260802 | 4 |
| 3 | 의사결정/하네스-장기기억-분석-20260608 | 4 |
| 4 | 의사결정/AI-에이전트-장기기억-아키텍처-20260608 | 4 |
| 5 | 의사결정/Hermes-공식-Memory-시스템-분석-20260608 | 4 |
| 6 | 의사결정/규칙-충돌-방지-매트릭스-20260618 | 2 |
| 7 | Hermes/하네스-엔지니어링-적용-20260605 | 2 |
| 8 | Hermes/Phase2-교차검증-20260605 | 2 |
| 9 | 의사결정/카파시-OKF-동시적용-로드맵-20260618 | 2 |
| 10 | 의사결정/Hermes-Persistent-Memory-통합-가이드-20260608 | 2 |

## 관련 문서

- [[LLM-Wiki-시스템-구축-계획서-20260802]]
- [[Wiki-Phase4-워크플로우-스모크-20260802]]
