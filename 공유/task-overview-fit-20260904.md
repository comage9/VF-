# 구현 지시서: 총괄 뷰 auto-fit — 120개 라벨 스크롤 없이 전부 표시

> 아래 편집을 **정확히 그대로** 적용하라. 앵커(정확 일치)를 찾아 주어진 코드로 교체/삽입한다.
> 대상: `frontend/client/src/pages/product-display.tsx`
> 배경: 총괄 뷰 실측(뷰포트 1440×900) — 오버레이 120개 중 38개가 화면 밖(y918~1070), scrollHeight 3669px. 원인: 카드 열 flex-wrap 세로 누적 + A동 카드 스케일 1 고정. 해법: 총괄은 DONG_DEFAULT_ZOOM 미적용 + 카드 영역을 뷰포트에 맞춘 auto-fit scale 적용 + 우측 패널 자체 스크롤.

## Edit 1 — 총괄에서 동별 기본 배율 미적용

앵커(정확 일치):
```
  useEffect(() => {
    const def = DONG_DEFAULT_ZOOM[dong];
    if (def) setZoomFactor(def);
  }, [dong]);
```
교체:
```
  useEffect(() => {
    const def = DONG_DEFAULT_ZOOM[dong];
    if (def) setZoomFactor(def);
    else setZoomFactor(1); // 총괄(ALL): 동별 기본 배율 미적용 — 총괄은 자체 auto-fit 사용
  }, [dong]);
```

## Edit 2 — 총괄 auto-fit 상태·측정 로직 추가

앵커(정확 일치):
```
  const zoomIn = () => setZoomFactor((z) => Math.min(3, Number((z + 0.1).toFixed(2))));
```
교체(바로 앞에 삽입 — zoomIn 줄은 유지):
```
  // 총괄 뷰 auto-fit (2026-09-04): 모든 동 카드를 뷰포트에 맞춰 축소 — 스크롤 없이 120개 라벨 전부 표시
  const ovInnerRef = useRef<HTMLDivElement | null>(null);
  const [ovFit, setOvFit] = useState(1);
  const [ovNatural, setOvNatural] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (dong !== "ALL") return;
    const compute = () => {
      const el = ovInnerRef.current;
      if (!el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      setOvNatural({ w, h });
      const availH = Math.max(320, window.innerHeight - 240);
      const availW = Math.max(360, window.innerWidth - 380);
      setOvFit(Math.min(1, Number((availH / h).toFixed(3)), Number((availW / w).toFixed(3))));
    };
    const t = window.setTimeout(compute, 80);
    window.addEventListener("resize", compute);
    return () => { window.clearTimeout(t); window.removeEventListener("resize", compute); };
  }, [dong]);
  const zoomIn = () => setZoomFactor((z) => Math.min(3, Number((z + 0.1).toFixed(2))));
```

## Edit 3 — 총괄 컨테이너 재구성 (래핑 제거 + 스케일 래퍼)

앵커(정확 일치, 3줄):
```
        {!mobileView && (dong === "ALL" ? (
          <div className="flex flex-wrap gap-3 items-start">
            <DndContext sensors={sensors} autoScroll={false} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
```
교체:
```
        {!mobileView && (dong === "ALL" ? (
          <div className="flex gap-3 items-start">
            <DndContext sensors={sensors} autoScroll={false} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div style={ovNatural.w > 0 ? { width: Math.round(ovNatural.w * ovFit), height: Math.round(ovNatural.h * ovFit), flexShrink: 0 } : undefined}>
            <div ref={ovInnerRef} style={{ transform: `scale(${ovFit})`, transformOrigin: "top left", width: "max-content" }}>
```

## Edit 4 — 카드 열을 하나의 행으로 묶고 패널 자체 스크롤

앵커(정확 일치, 12줄):
```
                  {/* 좌측 컬럼: A동(원본) + D동(작게) */}
                  <div className="flex flex-col gap-3 w-fit">
                    {renderCard("A", 1)}
                    {renderCard("D", 0.3)}
                  </div>
                  {/* 우측 컬럼: B동(0.9906) + C동(0.558) — 가로 634 통일, 하단=A동 하단 */}
                  <div className="flex flex-col gap-3 w-fit">
                    {renderCard("B", 0.9906)}
                    {renderCard("C", 0.558)}
                    {renderCard("E", 1, 634, 140)}
                  </div>
                  {renderRightPanel(placedRows)}
```
교체:
```
                  <div className="flex gap-3 w-fit">
                  {/* 좌측 컬럼: A동(원본) + D동(작게) */}
                  <div className="flex flex-col gap-3 w-fit">
                    {renderCard("A", 1)}
                    {renderCard("D", 0.3)}
                  </div>
                  {/* 우측 컬럼: B동(0.9906) + C동(0.558) — 가로 634 통일, 하단=A동 하단 */}
                  <div className="flex flex-col gap-3 w-fit">
                    {renderCard("B", 0.9906)}
                    {renderCard("C", 0.558)}
                    {renderCard("E", 1, 634, 140)}
                  </div>
                  </div>
                  </div>
                  </div>
                  <div className="shrink-0 overflow-auto" style={{ maxHeight: "calc(100vh - 240px)" }}>
                  {renderRightPanel(placedRows)}
                  </div>
```
(마지막 3개 `</div>`는 카드 행 래퍼·측정 div·크기 래퍼를 닫는다 — 패널은 스케일 밖으로 분리되어 자체 스크롤)

## 금지 사항

- 단독 뷰(동별) 렌더·zoomIn/zoomOut 범위 **수정 금지**
- 좌표 오버레이(총괄 ovl- 블록 포함)·A_COORD_NOS **수정 금지**
- DONG_DEFAULT_ZOOM 값 자체(A1.2/B2.2/C1.3/D2.2) **변경 금지**
- 그 외 모든 변경 금지

## 검증 (마지막에 반드시 실행)

1. `frontend/client`에서 `npx tsc --noEmit 2>&1 | grep product-display | grep -v TS6133` → 신규 오류 0건
2. `npm run build` 통과
3. `grep -c "ovFit" frontend/client/src/pages/product-display.tsx` → 5 이상
4. 변경 요약 출력
