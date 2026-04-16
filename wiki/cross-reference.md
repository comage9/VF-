# Obsidian ↔ Wiki 교차 참조 맵

> 이 파일은 Obsidian Raw Sources와 wiki 페이지 간의 관계를 정의합니다.
> wiki 페이지는 Obsidian 원본을 기반으로 생성되었으며, 원본은 불변입니다.

---

## 02-금형정보/ → wiki/entities/

| Obsidian (Raw Source) | wiki 페이지 | 관계 |
|----------------------|------------|------|
| 02-금형정보/금형번호-기준.md | entities/금형.md | 원본 → 컴파일 |
| 02-금형정보/박스당-수량-기준.md | entities/제품.md (박스당 수량 섹션) | 원본 → 컴파일 |
| 02-금형정보/색상-생산단위-기준.md | entities/제품.md (색상 코드 섹션) | 원본 → 컴파일 |

## 01-VF-프로젝트/세션로그/ → wiki/concepts/에러로그.md

| Obsidian (Raw Source) | wiki 페이지 | 관계 |
|----------------------|------------|------|
| 2026-04-07_DnD-수정-GLM한도.md | concepts/에러로그.md (IIFE 에러) | 원본 → 학습 추출 |
| 2026-04-08_Hermes-agent-설치.md | entities/openclaw.md | 원본 → 참조 |
| 2026-04-09_AI-API-URL-버그.md | concepts/에러로그.md | 원본 → 학습 추출 |
| 2026-04-11_포트변경-로그인플로우.md | entities/vf-project.md | 원본 → 참조 |
| 2026-04-12_ObsidianVault-재고탭-OLLAMA제거.md | entities/openclaw.md | 원본 → 참조 |
| 2026-04-13_결정사항-서버재시작-이전계획ended.md | wiki/log.md | 원본 → 작업 기록 |

## mindvault-out/ → wiki/

| Obsidian (Mindvault) | wiki 페이지 | 관계 |
|----------------------|------------|------|
| mindvault-out/wiki/INDEX.md | wiki/index.md | 기존 그래프 → 새 목차 |
| mindvault-out/wiki/api-backend-apis.md | entities/api-endpoints.md | 기존 컴파일 → 새 컴파일 |

---

## 동기화 규칙
1. **Obsidian이 Source of Truth:** 데이터 충돌 시 Obsidian 기준
2. **단방향 컴파일:** Obsidian → wiki (wiki가 Obsidian을 수정하지 않음)
3. **양방향 참조:** wiki 페이지는 항상 원본 Obsidian 경로를 명시
4. **Ingest 시 업데이트:** Obsidian에 새 파일 추가 시 wiki 엔티티 생성 + index.md 업데이트

---
*생성: 2026-04-13*
