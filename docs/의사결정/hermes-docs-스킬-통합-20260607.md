---
title: "Hermes Agent 문서 스킬 통합"
date: 2026-06-07
category: 의사결정
---

# Hermes Agent 문서 스킬 통합

## 배경
곰너이 님 요청으로 Hermes Agent 공식 문서(hermes-agent.nousresearch.com/docs) 75개 페이지를 스킬화하는 `hermes-docs-reference` 스킬을 생성했으나, 이미 `hermes-agent` 스킬(v2.1.0)이 존재함을 발견.

## 웹 검증
GitHub 리포지토리 전수 조사 결과, **Hermes 자체 사용법을 다루는 공식 번들 스킬은 `hermes-agent`가 유일**함 (총 72개 번들 스킬 중). 추가로 `hermes-agent-skill-authoring`(SKILL.md 작성법)만 관련 있음.

## 결정
**통합(merge)**: `hermes-docs-reference`의 내용을 기존 `hermes-agent` 스킬에 패치 추가 후, `hermes-docs-reference`는 삭제.

## 변경 사항
- `hermes-agent` v2.1.0 → **v2.2.0**
- 추가된 섹션:
  1. **Additional Features Reference** — Browser Automation, Code Execution, Vision, Plugins, LSP, Goals 등 23개 기능
  2. **Learning Path** — 초급/중급/고급 학습 로드맵
  3. **Messaging Platforms Reference** — 24개 플랫폼별 설정 표
  4. **Guides & Tutorials** — 15개 공식 가이드 목록
  5. **Security Summary** — 보안 관련 6개 설정 한눈에
  6. **Changelog** — 변경 이력
- `related_skills`에 `hermes-docs-reference` 추가
- `hermes-docs-reference` 스킬 삭제 (absorbed_into=hermes-agent)

## 파일
- 통합된 스킬: `~/.hermes/skills/autonomous-ai-agents/hermes-agent/SKILL.md`
- Wiki 기록: 본 문서
