# 구현 지시서: 총괄 auto-fit JSX 구조 복구 — 태그를 IIFE 내부로 이동

> 아래 편집을 **정확히 그대로** 적용하라. 앵커(정확 일치)를 찾아 주어진 텍스트로 교체한다.
> 대상: `frontend/client/src/pages/product-display.tsx`
> 배경: 이전 지시서가 래퍼 div 2개를 IIFE 바깥에서 열고 안쪽에서 닫게 해 JSX 오류 5건·빌드 실패. 태그는 식 경계를 넘을 수 없으므로 **열림·닫힘을 모두 IIFE fragment 내부로 이동**한다.

## Edit 1 — IIFE 바깥의 래퍼 div 2줄 제거

앵커(정확 일치, 3줄):
```
            <DndContext sensors={sensors} autoScroll={false} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div style={ovNatural.w > 0 ? { width: Math.round(ovNatural.w * ovFit), height: Math.round(ovNatural.h * ovFit), flexShrink: 0 } : undefined}>
            <div ref={ovInnerRef} style={{ transform: `scale(${ovFit})`, transformOrigin: "top left", width: "max-content" }}>
```
교체(1줄로 축소):
```
            <DndContext sensors={sensors} autoScroll={false} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
```

## Edit 2 — IIFE return 내부에 래퍼 재배치 (정확히 균형 잡힌 구조)

앵커(정확 일치, 전체 블록):
```
              return (
                <>
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
                </>
              );
```
교체:
```
              return (
                <>
                  <div style={ovNatural.w > 0 ? { width: Math.round(ovNatural.w * ovFit), height: Math.round(ovNatural.h * ovFit), flexShrink: 0 } : undefined}>
                  <div ref={ovInnerRef} style={{ transform: `scale(${ovFit})`, transformOrigin: "top left", width: "max-content" }}>
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
                </>
              );
```
(차이: fragment 최상단에 래퍼 div 2개의 **열림**이 추가되고, 기존 닫힘 순서 그대로 — 모든 태그가 fragment 내부에서 열리고 닫힌다)

## 금지 사항

- 그 외 모든 변경 금지 (useEffect·ovFit 상태·카드 열 구조 유지)

## 검증 (마지막에 반드시 실행)

1. `frontend/client`에서 `npx tsc --noEmit 2>&1 | grep product-display | grep -v TS6133` → 신규 오류 0건
2. `npm run build` 통과
3. 변경 요약 출력
