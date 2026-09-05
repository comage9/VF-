# 정밀 편집 지시서: locNos 미러링 (기계적 적용용)

> 아래 변경을 **정확히 그대로** 적용하라. 분석·재설계 금지 — 주어진 앵커 텍스트를 찾아 주어진 코드로 교체/삽입만 한다.

## Edit A — `frontend/client/src/pages/product-display-utils.ts` 파일 끝에 추가

```ts
/** 다품목 칸: 제품 목록 변화를 locNos 배열에 미러링 (2026-09-04, 실버그 수정) */
export function mirrorLocNos(
  oldItems: string[],
  newItems: string[],
  locNos: number[] | undefined
): number[] | undefined {
  if (!locNos || locNos.length === 0) return undefined;
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
  if (sameSet(oldItems, newItems)) {
    return newItems.map((pn) => {
      const oi = oldItems.indexOf(pn);
      return oi >= 0 && oi < locNos.length ? locNos[oi] : locNos[locNos.length - 1];
    });
  }
  if (newItems.length === oldItems.length - 1) {
    let ri = -1;
    for (let i = 0; i < oldItems.length; i++) {
      if (oldItems[i] !== newItems[i]) { ri = i; break; }
    }
    if (ri === -1) ri = oldItems.length - 1;
    const out = locNos.slice();
    out.splice(Math.min(ri, out.length - 1), 1);
    return out;
  }
  if (newItems.length === oldItems.length + 1) {
    let ai = -1;
    for (let i = 0; i < newItems.length; i++) {
      if (oldItems[i] !== newItems[i]) { ai = i; break; }
    }
    if (ai === -1) ai = newItems.length - 1;
    const out = locNos.slice();
    const maxv = Math.max(...out);
    out.splice(Math.min(ai, out.length), 0, maxv + 1);
    return out;
  }
  let maxv = Math.max(...locNos);
  const out = locNos.slice(0, newItems.length);
  while (out.length < newItems.length) out.push(++maxv);
  return out;
}

/** setData 경로에서 변경된 칸들의 locNos를 data 변경에 미러링 (2026-09-04) */
export function syncLocNosAfterDataChange(
  layoutState: any[],
  prev: Record<string, string>,
  next: Record<string, string>,
  zoneIds: string[]
): any[] {
  const ids = zoneIds.filter((id, i) => zoneIds.indexOf(id) === i);
  if (!ids.length) return layoutState;
  return layoutState.map((d) => ({
    ...d,
    zones: (d.zones || []).map((z: any) => {
      if (!ids.includes(z.id)) return z;
      const oldItems = (prev[z.id] || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      const newItems = (next[z.id] || "").split(",").map((s: string) => s.trim()).filter(Boolean);
      if (oldItems.join(",") === newItems.join(",")) return z;
      const mirrored = mirrorLocNos(oldItems, newItems, z.locNos);
      if (mirrored === undefined) return z.locNos === undefined ? z : { ...z, locNos: undefined };
      if (JSON.stringify(mirrored) === JSON.stringify(z.locNos)) return z;
      return { ...z, locNos: mirrored };
    }),
  }));
}
```

## Edit B — `frontend/client/src/pages/product-display.tsx` 상단 import

`product-display-utils`에서 import하는 문장을 찾아 `mirrorLocNos, syncLocNosAfterDataChange` 두 심볼을 추가한다.

## Edit C1 — 보관함 드롭 (제거)

앵커(정확 일치):
```
        setStaging((s) => (s.includes(src.pnum) ? s : [...s, src.pnum]));
        persistLocal(next);
```
→ 두 줄 사이에 다음 줄 삽입:
```
        setLayoutState((prevL) => syncLocNosAfterDataChange(prevL, prev, next, Object.keys(next).filter((k) => next[k] !== prev[k])));
```

## Edit C2 — staging→칸 (추가)

앵커:
```
        removeCrossDongDupes(next, [src.pnum], dst.zoneId);
        persistLocal(next);
        return next;
      });
      setDragSource(null);
      setSaveMsg("보관함에서 배치");
```
→ `persistLocal(next);` 앞 줄에 삽입:
```
        setLayoutState((prevL) => syncLocNosAfterDataChange(prevL, prev, next, Object.keys(next).filter((k) => next[k] !== prev[k])));
```

## Edit C3 — 칸→보관함 비우기

앵커:
```
            delete next[src.zoneId];
            persistLocal(next);
            return next;
          }
          return prev;
```
→ `persistLocal(next);` 앞 줄에 삽입:
```
            setLayoutState((prevL) => syncLocNosAfterDataChange(prevL, prev, next, Object.keys(next).filter((k) => next[k] !== prev[k])));
```

## Edit C4 — 밀려난 품목(overflow) → 칸 추가

앵커:
```
          removeCrossDongDupes(next, [src.pnum], dst.zoneId);
          persistLocal(next);
        }
        return next;
```
→ `persistLocal(next);` 앞 줄에 삽입:
```
          setLayoutState((prevL) => syncLocNosAfterDataChange(prevL, prev, next, Object.keys(next).filter((k) => next[k] !== prev[k])));
```

## Edit C5 — A동 체인 시프트

앵커:
```
          pushOverflow(ov);
          persistLocal(n2);
          return n2;
```
→ `persistLocal(n2);` 앞 줄에 삽입:
```
          setLayoutState((prevL) => syncLocNosAfterDataChange(prevL, prev, n2, Object.keys(n2).filter((k) => n2[k] !== prev[k])));
```

## Edit C6 — 칸 내 재정렬 / 칸 간 이동 공통 종료

앵커:
```
      if (changed) persistLocal(next);
      return next;
```
→ `if (changed) persistLocal(next);` 앞 줄에 삽입:
```
      setLayoutState((prevL) => syncLocNosAfterDataChange(prevL, prev, next, Object.keys(next).filter((k) => next[k] !== prev[k])));
```

## Edit C7 — commitInlineEdit (수기 편집)

앵커:
```
      return next;
    });
    editingZoneRef.current = null;
```
→ `return next;` 앞 줄에 삽입:
```
      setLayoutState((prevL) => syncLocNosAfterDataChange(prevL, prev, next, Object.keys(next).filter((k) => next[k] !== prev[k])));
```

## Edit C8 — 자리이탈 이동 (applyPlacementEdit)

앵커(정확 일치 한 줄):
```
    setData((prev) => applyPlacementEdit(prev, zid, [movePnum], movePnum));
```
→ 아래 블록으로 교체:
```
    setData((prev) => {
      const next = applyPlacementEdit(prev, zid, [movePnum], movePnum);
      setLayoutState((prevL) => syncLocNosAfterDataChange(prevL, prev, next, Object.keys(next).filter((k) => next[k] !== prev[k])));
      return next;
    });
```

## 금지 사항

- 엑셀 업로드(applyExcelUpload)·자동 재배치 경로는 locNos를 자체 관리하므로 **수정 금지**
- 휴지통 드롭(칸 자체 삭제) 경로는 zone이 사라지므로 **수정 금지**
- 좌표 관련 코드(gridLabels, buildGridCoordSystem, coordOf 등) **수정 금지**
- 표시 코드(`locNos[i]` 소비부) **수정 금지**

## 검증 (마지막에 반드시 실행)

1. `frontend/client`에서 `npx tsc --noEmit 2>&1 | grep product-display` → TS6133(미사용) 외 신규 오류 0건
2. `npm run build` 통과
3. `grep -c "syncLocNosAfterDataChange(prevL" frontend/client/src/pages/product-display.tsx` → 8 이상
4. 변경 요약 출력
