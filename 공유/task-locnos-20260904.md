# 작업 지시: 다품목 칸 locNos ↔ 제품순서 동기화 (P0 실버그 수정)

- 작성: 2026-09-04, OpenClaw → opencode 실행용 작업 지시서
- 대상 파일: `frontend/client/src/pages/product-display.tsx`, `frontend/client/src/pages/product-display-utils.ts`
- 참고: `공유/배치도-좌표-문제-종합분석-v2-20260903.md` §4 문제③-(c)

## 배경 (버그 정의)

다품목 칸은 배치 데이터(`data` state, zoneId → "pn1,pn2,pn3")와 칸의 위치번호 배열(`layoutState`의 zone.locNos)이 **인덱스 1:1 규약**(items[i] ↔ locNos[i])으로 표시된다.
그런데 제품 입출·체인시프트·재정렬·수기편집 경로가 `data`만 갱신하고 `zone.locNos`를 함께 갱신하지 않아:

- 예: locNos [114,115,116] 3품목 → 1개 이탈 시 남은 2개가 114·115를 잘못 표시 (실버그)

## 구현 요구사항

### 1) 공용 헬퍼 추가 (`product-display-utils.ts` 끝에 추가)

```ts
/** 다품목 칸: 제품 목록 변화를 locNos 배열에 미러링 (2026-09-04, 실버그 수정)
 *  - 제품 제거 → 같은 인덱스의 번호 제거
 *  - 제품 추가 → 기존 최댓값 +1 번호를 같은 인덱스에 삽입
 *  - 제약: zone에 locNos 배열이 없으면(undefined) undefined 반환(동기화 불필요)
 */
export function mirrorLocNos(
  oldItems: string[],
  newItems: string[],
  locNos: number[] | undefined
): number[] | undefined
```

동작 규격:
- `locNos`가 undefined/빈 배열이면 그대로 `undefined` 반환 (번호 없는 칸은 손대지 않음)
- 단일 제거: oldItems에는 있고 newItems에는 없는 pnum의 인덱스 i를 찾아 locNos에서 i번째 제거
- 단일 추가: newItems에는 있고 oldItems에는 없는 pnum의 인덱스 i를 찾아 locNos의 i번째에 `Math.max(...locNos) + 1` 삽입
- 재정렬(같은 집합, 순서만 변경): oldItems→newItems 순서에 맞춰 locNos를 같은 순서로 재배열
- 복합 변경(2개 이상 동시 변경): 길이만 맞추는 안전 폴백 — 부족하면 max+1로 채우고, 초과하면 뒤에서 잘라서 newItems 길이에 맞춤
- 어떤 경우에도 반환 배열 길이 === newItems 길이 (원래 locNos가 undefined인 경우 제외)
- 입력이 비정상(계산 불가)이면 안전하게 기존 locNos 길이에 맞춰 절단/보완

### 2) product-display.tsx의 모든 "칸 제품 목록 변경" 경로에 적용

`setData(...)` 안에서 특정 zoneId의 아이템 목록(`next[zoneId]`)을 바꾸는 곳을 전부 찾아(최소 5곳: 보관함 드롭 제거, staging→칸 추가, 칸→보관함 비우기, 체인시프트, 수기편집 commitInlineEdit, 칸 내 재정렬 reorderInZone 호출부, 크로스동 중복 제거 removeCrossDongDupes 호출부) 각 경로에서:

- 변경 전 아이템 목록과 변경 후 목록을 확보한 뒤 `mirrorLocNos`로 새 locNos를 계산
- 같은 핸들러 안에서 `setLayoutState(prev => prev.map(d => d.key !== dong ? d : { ...d, zones: d.zones.map(z => z.id === zoneId ? { ...z, locNos: 새로운배열 } : z) }))` 로 zone 갱신
- 여러 칸이 동시에 변하는 경로(체인시프트 등)는 변경된 모든 칸에 대해 미러링 적용
- 수기편집(commitInlineEdit)은 사용자가 목록 전체를 새로 입력하는 것이므로: 이전 목록 대비 신규/삭제를 mirrorLocNos 복합 규칙으로 처리

주의:
- **좌표 관련 코드(gridLabels, buildGridCoordSystem, coordOf 등)는 절대 수정 금지** — 방금 확정·커밋된 영역
- 파일이 CRLF이므로 기존 줄바꿈 스타일 유지
- locNo(단일 숫자) 필드는 1품목 칸용이므로 변경 금지 (locNos 배열만 다룸)
- 표시 코드(`locNos[i]` 소비부)는 수정 금지 — 데이터 정합만 맞춘다

### 3) 검증 (반드시 수행하고 결과를 출력)

1. `frontend/client`에서 `npx tsc --noEmit` 실행 → product-display*.tsx|ts 파일의 **신규 오류 0건** 확인 (기존 noUnusedLocals 경고는 무관)
2. `npm run build` 통과 확인
3. 변경 요약(수정한 함수 목록 + 각 경로 1줄 설명)을 마지막에 출력
