# 제품배치도 중복 배치 방지 (2026-08-28)

> 사용자 지시: B동에 배치된 슬림형 서랍장이 C동에 이중 배치됨. 한 제품은 한 동·한 칸에만 배치되어야 함.

## 근본 원인

| # | 원인 | 위치 |
|---|---|---|
| 1 | 정적 기본 데이터 중복 — `C_RANK_PLACEMENT`의 C-R23-* 슬롯 15건이 C-R5~R12-C1과 제품번호 중복 | `product-display-c-data.ts` |
| 2 | 재배치 루프 버그 — `executePlacement()` B/C/D동 배치 시 인덱스 추적 → 큐 방식이 아니면 중복·잔존 가능 | `product-display.tsx` |
| 3 | 런타임 방어 부재 — 서버 로드/복원/저장 전 경로에 전역 중복제거 없음 | `product-display.tsx` |
| 4 | 백엔드 무검증 저장 — 오염된 payload가 스냅샷에 그대로 저장 | `sales_api/views.py` |

실측: 서버 스냅샷 v204 기준 크로스동 중복 37건(슬림형 서랍장 420~484가 B동+C동 동시 존재) + 같은 칸 내 중복 12건.

## 수정 내용

### 프론트엔드 (`product-display.tsx`, `product-display-c-data.ts`)
1. `sanitizePlacementMap(map)` 전역 헬퍼 추가 — **동 우선순위 A→B→C→D→E**, 먼저 나온 동에 배치 유지·나중 동에서 제거. 같은 칸 내 중복은 첫 발생만 유지.
2. 적용 지점: `loadPlacement()`(로컬 로드), `parsePdPayload()`(서버 파싱), `applyServerPayload()`(서버 복원), `pdSaveToServer()` 직전(저장 전)
3. `executePlacement()` B/C/D동 루프 → 큐(`itemQueue.shift()`) 방식으로 변경 — 각 제품이 정확히 한 번만 배치
4. `C_RANK_PLACEMENT`의 C-R23-* 중복 슬롯 비움

### 백엔드 (`sales_api/views.py`)
1. `_pd_sanitize_payload()` — 저장 시점 중복 제거(동 우선순위 동일 규칙), `_pd_save_snapshot` 진입 전 적용(복원 경로 포함)
2. 일회성 스크럽: `backend/scripts/_pd_restore_rescrub.py` — 원본 백업에서 v204 복원 후 재스크럽

## 검증
- 서버 스냅샷: 크로스동 중복 37 → **0**
- 슬림형 서랍장(420~484): B동 30개 잔존(정본 유지), C동 잔존 2개(424, 444 — 원래 B동에 없던 제품)
- tsc 신규 에러 0, 빌드 성공, :5174 배포
- 커밋 `ae2687a` push 완료

## 교훈 (주의)
- **스크럽 방향은 사용자 정본 기준** — JSON 키 순서 기준 중복 제거는 틀림. 최초 스크럽이 C동(키 순서상 먼저)을 남기고 B동 정본을 지워 원본 백업에서 재복구함. 동 우선순위 규칙 필수.
