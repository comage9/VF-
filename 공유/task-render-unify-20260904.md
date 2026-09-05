# 구현 지시서: 배치도 렌더·데이터 통일 (작업계획 P1+P2 전항목)

> 아래 변경을 순서대로 적용하라. 각 항목의 앵커/대상을 찾아 주어진 설계대로 구현한다.
> 대상: `frontend/client/src/pages/product-display.tsx`
> 참고: `공유/작업계획-배치도-렌더-통일-20260904.md` (작업계획), `공유/배치도-로케이션-종합-재수립-작업계획서-20260904.md` (종합 계획)

## 공통 규칙

- 좌표 계산 상수: 열 피치 52px(48+4), 행 피치 38px(34+4), 열 원점 28(padL), 최하단 행 센터 825
- 제품 배치 데이터(placement map)는 **건드리지 않는다** — 표시만 수정
- 각 항목 적용 후 tsc로 문법 확인하고 다음 항목 진행

## 항목 1 — A동 X열 9열 고정 (작업계획 P1-d)

`buildGridCoordSystem` 함수 내에서 A동일 때 열 대표값을 점유 클러스터가 아닌 **고정 9열**로 교체:

- 함수 초반 `const gc = computeGridCoords(zones); if (!gc) return null;` 직후에 추가:
```ts
  // A동: X열 9열 고정 (52px 피치, 2026-09-04) — 점유 열 클러스터 폐기 (재빌드 시 열 붕괴 방지)
  const colReps = dong === "A" ? [28, 80, 132, 184, 236, 288, 340, 392, 444] : gc.cols;
```
- 함수 내 `gc.cols` 참조 2곳(colReps 반환 + coordOf x 계산)을 `colReps`로 교체
- 반환 객체의 `colReps: gc.cols` → `colReps`

## 항목 2 — 좌표 기준 오버레이 (작업계획 P1-a, gridLabels A동)

`gridLabels` useMemo 내부(A동 좌표 라벨 섹션)에 다음 오버레이를 추가한다.
기존 행/열 축 라벨은 유지하고, **A_COORD_NOS 전체 키**를 순회하며 각 좌표의 번호를 그리드 픽셀에 렌더한다:

```ts
      // 좌표 기준 오버레이 (2026-09-04): A_COORD_NOS 전체 키를 그리드 픽셀에 직접 렌더 — 존 위치·유무 무관
      A_COORD_NOS.forEach((nos, coord) => {
        const cMatch = /^(\d+)-(\d+)$/.exec(coord);
        if (!cMatch) return;
        const cxi = Number(cMatch[1]);
        const ryi = Number(cMatch[2]);
        const colPx = colReps[cxi - 1];
        const rowPx = rowRepsDesc[ryi - 1];
        if (colPx == null || rowPx == null) return;
        labels.push({
          text: fmtLocNos(nos),
          style: {
            left: colPx - SLOT.w / 2 + 2,
            top: rowPx - SLOT.h / 2 + 3,
            width: SLOT.w - 4,
            textAlign: "left",
            fontSize: 8,
            fontWeight: 700,
            color: "#d97706",
            fontFamily: "ui-monospace, monospace",
          },
        });
      });
```

- `rowRepsDesc`는 A동 연속 행(통로 포함, 아래=1)을 사용 — `buildGridCoordSystem`의 것 또는 gridLabels 내 기존 계산 재사용
- `colReps`는 항목 1의 고정 9열
- 이 오버레이가 존 저장값 기반 렌더를 **대체**한다: 기존 ZoneCell 측면 칩(단일 품목) 제거, gridLabels locNos 라벨(위/내부) 제거

## 항목 3 — ZoneCell 측면 칩 제거 (오버레이로 대체)

`ZoneCell` 컴포넌트 내부의 단일 품목 번호 칩 블록 전체 삭제:
- 앵커: `{/* 로케이션 번호 — 단일 품목 칸 (좌표 귀속 번호, 2026-09-04): 사이드는 가까운 통로 방향 */}` 직후의 조건부 `<span>` 블록
- ZoneCell의 `locNos` prop은 다품목 구획 표시용으로 유지
- `chipSide` prop도 제거 (오버레이로 대체)

부모 렌더에서도 `locNos={dongLocNos[z.id]}`와 `chipSide={...}` 전달 제거

## 항목 4 — MiniZoneCell(총괄 미니맵) 정리 (작업계획 P1-b·c)

- 칩 조건: `isA && locNos && locNos.length > 0` (z.locNo 폴백 제거 — 스테일 80 등 차단)
- 칩 위치: 좌/우 -18px → **칸 내부 상단 중앙** (`top: 1, left: 2, width: 계산`) — 단독 뷰 오버레이와 동일 배치
- miniNos 소스: `coordNosByZone` 유지 (좌표 귀속 ✓)

## 항목 5 — locNoOf 패널(로케이션 리스트) 좌표 귀속 (작업계획 P2-g 연계)

로케이션 리스트의 `locNoOf`가 저장값이 아닌 **좌표 귀속 번호**를 표시하도록 교체:
- `mdyn` 소스를 `coordNosByZone` 기반으로 교체 (부모에서 전달 — Record<string, number[]> 동일 형태)
- 패널이 총괄(전 동)이면 coordNosByZone 전체, 동별이면 해당 동 필터

## 항목 6 — 엑셀 export 위치번호 열 좌표 귀속 확인

엑셀 export의 `no` 열이 이미 좌표 귀속(A_COORD_NOS)인지 확인 — 6c1de6a에서 적용됨. 미적용이면 수정.

## 항목 7 — 인쇄 좌표 라벨 확인

인쇄 렌더의 좌표 라벨이 좌표 귀속인지 확인 — 미적용이면 수정.

## 금지 사항

- 제품 배치 데이터(placement map) **수정 금지**
- 좌표 계산 상수(52/38/28/825) **변경 금지**
- B/C/D 표시 로직 **수정 금지**
- mirrorLocNos/syncLocNosAfterDataChange **유지** (다른 뷰 호환)

## 검증 (전 항목 완료 후)

1. `npx tsc --noEmit` → product-display 신규 오류 0건 (TS6133 제외)
2. `npm run build` 통과
3. 변경 요약 출력
