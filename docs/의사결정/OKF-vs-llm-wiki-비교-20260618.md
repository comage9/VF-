# OKF v0.1 vs llm-wiki 비교 분석 (2026-06-18)

## 트리거
곰너이 님 2026-06-18 — Google OKF v0.1 적용 결정에 따른 현재 `research/llm-wiki` 스킬과의 호환성 분석.

---

## 한눈에 비교

| 항목 | OKF v0.1 (Google) | llm-wiki 2.3.0 (Hermes) | 호환 |
|------|------------------|------------------------|:----:|
| **저장소** | 마크다운 디렉토리 | 동일 | ✅ |
| **프론트매터** | YAML (type만 필수) | YAML (frontmatter 검증) | ✅ |
| **인덱스** | `index.md` (디렉토리별) | `Wiki/index.md` (전체) | ✅ |
| **로그** | `log.md` (append-only) | 동일 | ✅ |
| **type** | 자유 (consumer 관용) | 5종 강제 (entity/concept/comparison/query/summary) | ⚠️ |
| **링크** | `/path/file.md` 표준 | `[wikilinks](wikilinks.md)` 옵시디언 | ❌ |
| **오류 관용** | 강함 (soft guidance) | 약함 (lint 강제) | ❌ |
| **벤더** | 중립 | Hermes 전용 | ⚠️ |
| **spec 진화** | v0.1 → 진행 중 | 2.3.0 안정 | ⚠️ |

---

## OKF v0.1 명세 핵심 (재확인)

| 원칙 | 정의 |
|------|------|
| `type` | 유일한 필수 frontmatter 필드. 그 외 옵션 |
| `index.md` | 예약 파일명. 디렉토리 카탈로그 |
| `log.md` | 예약 파일명. append-only 변경 이력 |
| link | 번들 상대 경로 `/services/inventory.md` 권장 |
| 관용 | 알 수 없는 타입·깨진 링크·누락 필드는 consumer가 견딤 |
| spec §10 | validate.sh가 hard requirements만 강제 (frontmatter parse, type 비어있지 않음, index/log §6/§7 준수) |

## llm-wiki 2.3.0 핵심

| 원칙 | 정의 |
|------|------|
| `type` | entity / concept / comparison / query / summary 5종 강제 |
| `index.md` | 전체 Wiki 카탈로그 |
| `log.md` | append-only timeline |
| link | `[wikilinks](wikilinks.md)` 옵시디언 호환 |
| lint | strict (`scripts/lint.py` ERROR 시 exit 1) |
| Taxonomy | SCHEMA.md에 tag taxonomy 정의 필수 |
| Obsidian | `.obsidian/` 호환 |

---

## 충돌 지점 4개 + 해결

### 충돌 1: type 자유도
- **OKF**: 자유. `type: Service`, `type: CustomConcept` 등 무엇이든 OK
- **llm-wiki**: 5종 강제. 그 외 type은 lint ERROR
- **해결**: llm-wiki SKILL.md에 type 추가 (Service, Resource, Tool 등) — 사용자 승인 시

### 충돌 2: link 정책
- **OKF**: `/path/file.md` 표준 마크다운 링크
- **llm-wiki**: `[wikilinks](wikilinks.md)` 옵시디언 호환
- **해결**: **두 형식 모두 허용**. lint가 자동 인식 + 정규화. 사용자 "옵시디언 유지" 시 1순위 = wikilinks

### 충돌 3: 오류 관용
- **OKF**: soft guidance. 깨진 링크도 consumer가 견딤
- **llm-wiki**: strict lint. ERROR 시 exit 1
- **해결**: **현재 llm-wiki strict 유지**. OKF partial 도입 시에도 strict 유지 (사용자 검증 워크플로우 보존)

### 충돌 4: spec 진화 속도
- **OKF**: v0.1 초기 단계. SPEC 자주 바뀔 수 있음
- **llm-wiki**: 2.3.0 안정. 곰너이 님이 직접 관리
- **해결**: OKF v0.1 spec watch (GoogleCloudPlatform/knowledge-catalog). 마이너 변경은 자동 반영, 메이저 변경은 사용자 승인

---

## 점진 도입 계획

| 순서 | 적용 범위 | 변경 파일 | 위험도 |
|------|----------|----------|--------|
| **3-1** | link 정책 (옵시디언 + OKF 둘 다 허용) | `llm-wiki/SKILL.md` | 🟢 낮음 |
| **3-2** | type 추가 (5종 + Service, Resource, Tool) | `llm-wiki/SKILL.md` SCHEMA.md | 🟡 중간 |
| **3-3** | frontmatter `okf_version: "0.1"` 추가 (호환 표시) | 자동 | 🟢 낮음 |
| **3-4** | validate.sh OKF §10 호환 추가 | `scripts/` | 🟡 중간 |
| **3-5** | (선택) 전면 마이그레이션 — `[wikilinks](wikilinks.md)` → 표준 링크 일괄 변환 | 다수 | 🔴 높음 |

**3-1만 즉시 적용. 3-2~3-5는 사용자 별도 지시 시.**

---

## 즉시 적용 (3-1) — link 정책 보강

llm-wiki SKILL.md Link 섹션에 추가:

```markdown
## Link 정책 (OKF v0.1 호환, 2026-06-18)

허용 형식 2가지:

### 1순위: `[wikilinks](wikilinks.md)` (옵시디언 호환)
- 기존 워크플로우 보존
- 옵시디언 그래프 뷰 자동 인식
- 예: `[카르파티-LLM-Wiki-패턴](카르파티-LLM-Wiki-패턴.md)`

### 2순위: 표준 마크다운 링크 (OKF 권장)
- 새 문서 작성 시 권장
- 번들 상대 경로로 이동 안정성
- 예: `[카르파티 패턴](../concepts/karpathy-llm-wiki.md)`

lint 동작:
- 두 형식 모두 인식 (ERROR 아님)
- 깨진 링크는 그대로 (OKF 관용 정책)
- 사용자 "옵시디언 유지" = 1순위 고정
- 결정고정(§7) 우선. 사용자 선택 = 그대로 실행
```

---

## 전면 마이그레이션 보류 이유

| # | 이유 | 영향 |
|---|------|------|
| 1 | 옵시디언 사용자 워크플로우 깨짐 | `[wikilinks](wikilinks.md)` 링크 일괄 깨짐 |
| 2 | lint 정책 약화 위험 | OKF 관용 vs Hermes strict 충돌 |
| 3 | SPEC v0.1 초기 불안정 | 빠른 변경 시 마이그레이션 비용 반복 |
| 4 | 도메인 특수성 | KPP/LS/Supplier 강제 규칙은 별도 정의 필요 |
| 5 | llm-wiki 2.3.0 이미 안정 | 검증된 도구를 바꾸는 비용 |

→ **3-1(link 정책)만 적용. 전면 마이그레이션은 곰너이 별도 지시 시.**

---

## 결정 사항 (2026-06-18)

1. ✅ 3-1 (link 정책 보강) 즉시 적용
2. ⏸ 3-2~3-4 (type 추가, validate, okf_version) 사용자 지시 대기
3. ⏸ 3-5 (전면 마이그레이션) 명시적 요청 시에만

---

## 참조

- OKF 공식 spec: <https://github.com/GoogleCloudPlatform/knowledge-catalog> (okf/SPEC.md)
- OKF v0.1: <https://github.com/eli-l/okf-builder> (Agent Skills 호환 빌더)
- llm-wiki 스킬: `research/llm-wiki/SKILL.md` v2.3.0
- 영상 3번: <https://youtu.be/61t7ozqxfpw>
- 충돌 방지 SSOT: `Wiki/의사결정/규칙-충돌-방지-매트릭스-20260618.md`