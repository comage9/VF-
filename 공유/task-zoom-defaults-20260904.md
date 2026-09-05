# 구현 지시서: 동별 기본 배율 (A120%·B220%·C130%·D220%)

> 아래 변경을 **정확히 그대로** 적용하라. 각 수정의 앵커를 찾아 주어진 코드로 교체한다.
> 대상: `frontend/client/src/pages/product-display.tsx`

## 배경 (확정)

동 전환 시 각동 기본 배율을 자동 적용한다: A동 120%·B동 220%·C동 130%·D동 220%.
사용자가 줌 버튼으로 조정하면 그 값이 유지되고, 동을 다시 전환하면 기본 배율이 재적용된다.

## 수정 1 — 기본 배율 테이블 + 동 전환 적용

앵커(정확 일치):
```
  const [zoomFactor, setZoomFactor] = useState(1);
```
교체:
```
  const [zoomFactor, setZoomFactor] = useState(1);
  /** 동별 기본 배율 (2026-09-04): A120%·B220%·C130%·D220% — 동 전환 시 적용 */
  const DONG_DEFAULT_ZOOM: Record<string, number> = { A: 1.2, B: 2.2, C: 1.3, D: 2.2 };
  useEffect(() => {
    const def = DONG_DEFAULT_ZOOM[dong];
    if (def) setZoomFactor(def);
  }, [dong]);
```

## 수정 2 — 리셋 버튼을 동 기본 배율로

앵커(정확 일치):
```
  const zoomReset = () => setZoomFactor(1);
```
교체:
```
  const zoomReset = () => setZoomFactor(DONG_DEFAULT_ZOOM[dong] ?? 1);
```

## 수정 3 — 리셋 버튼 라벨 정정

앵커(정확 일치):
```
title="원래 크기">100%</button>
```
교체:
```
title="기본 배율">기본</button>
```

## 금지 사항

- zoomIn/zoomOut 범위(min 0.3·max 3) **수정 금지**
- 미니맵·출고 비율 테이블 등 다른 뷰 **수정 금지**
- 그 외 모든 변경 금지

## 검증 (마지막에 반드시 실행)

1. `frontend/client`에서 `npx tsc --noEmit 2>&1 | grep product-display | grep -v TS6133` → 신규 오류 0건
2. `npm run build` 통과
3. `grep -c "DONG_DEFAULT_ZOOM" frontend/client/src/pages/product-display.tsx` → 3 이상
4. 변경 요약 출력
