/**
 * 제품배치도 드래그앤드롭 유틸 (2026-08-17, 위치 고정 개편 2026-08-19)
 * - extractDansu: 제품명에서 단수(N단) 파싱
 * - aChainInsert: A동 체인 시프트 — 점유 칸에 넣으면 기존 제품이 다음 칸으로 밀려남
 * - reorderInZone: 다품목 칸(B/C/D) 내부 품목 순서 재정렬
 */

/** 제품명에서 단수 추출: '모던플러스 ... 5단 화이트' → '5단'. 없으면 ''. */
export function extractDansu(name: string | undefined | null): string {
  if (!name) return "";
  const m = name.match(/(\d{1,2})\s*단/);
  if (!m) return "";
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n) || n < 1 || n > 99) return "";
  return `${n}단`;
}

/** A동 zone 시퀀스 (물리 순서): buildADongLayout이 생성한 zones 배열 기준 id 목록. */
export type ZoneSeq = string[];

/**
 * A동 체인 시프트(밀어내기) — 점유 칸 드롭 동작 (2026-08-19 체인 시프트)
 *
 * 사용자 요구: "3-1의 200번을 1-13으로 드래그하면, 1-13의 기존 제품은
 * 옆(다음 위치)으로 밀려나게 해줘"
 *
 * item을 dstZone에 넣고, dstZone의 기존 품목은 aSeq 물리 순서상 다음 칸으로 밀려남.
 *   - 빈 칸 발견 → 밀려난 품목 배치, 종료
 *   - 점유 칸 → 밀려난 품목과 그 칸의 제품 교환 후 계속 (끝까지 반복)
 *   - seq 끝 도달 → 마지막 밀려난 품목은 overflow로 반환 (호출부가 임시보관함 처리)
 *
 * 1칸 1품목 규칙(A동)에 따라 값은 전체가 아닌 선두 품목만 취급.
 * dstZone이 seq에 없으면(사용자 추가 칸 등) 시프트 없이 dst 기존 품목 전체가 overflow.
 *
 * src 칸 제거는 호출부가 먼저 처리 — 체인은 src 칸을 빈 칸으로 보고
 * 거기에 밀려난 품목을 배치할 수 있음 (뒤쪽 칸으로 드래그 시 src가 종점 역할).
 */
export function aChainInsert(
  seq: ZoneSeq,
  data: Record<string, string>,
  dstZone: string,
  item: string
): { next: Record<string, string>; overflow: string[] } {
  const next: Record<string, string> = { ...data };
  const split = (v: string) =>
    v.split(",").map((s) => s.trim()).filter(Boolean);

  const dstIdx = seq.indexOf(dstZone);
  // seq에 없는 칸(사용자 추가 칸 등): 현재 모델 유지 — dst 기존 품목만 밀려남(overflow).
  if (dstIdx === -1) {
    const displaced = split(next[dstZone] || "");
    if (!displaced.length) {
      next[dstZone] = item;
      return { next, overflow: [] };
    }
    next[dstZone] = item; // 선두 품목 배치, 나머지는 밀려남
    return { next, overflow: displaced };
  }

  // dst 기존 품목 = 첫 밀려남 대상. 빈 칸이면 체인 없이 바로 배치.
  const dstItems = split(next[dstZone] || "");
  next[dstZone] = item;
  if (!dstItems.length) return { next, overflow: [] };

  let displaced = dstItems[0];
  for (let i = dstIdx + 1; i < seq.length; i++) {
    const z = seq[i];
    const items = split(next[z] || "");
    if (!items.length) {
      next[z] = displaced; // 빈 칸 발견 → 밀려난 품목 배치, 종료
      return { next, overflow: [] };
    }
    next[z] = displaced; // 점유 칸 → 교환 후 계속
    displaced = items[0];
  }
  // seq 끝까지 점유 → 마지막 밀려난 품목만 overflow (호출부가 임시보관함으로).
  return { next, overflow: [displaced] };
}

/**
 * 다품목 칸(B/C/D) 내부 순서 재정렬: zone 안의 품목 배열에서
 * fromIdx 품목을 toIdx 위치로 insert 이동 (이후 품목들은 한 칸씩 뒤로).
 */
export function reorderInZone(
  zoneVal: string,
  fromIdx: number,
  toIdx: number
): string {
  const items = zoneVal.split(",").map((s) => s.trim()).filter(Boolean);
  if (fromIdx < 0 || fromIdx >= items.length || toIdx < 0 || toIdx > items.length) {
    return zoneVal;
  }
  if (fromIdx === toIdx) return zoneVal;
  const [moved] = items.splice(fromIdx, 1);
  items.splice(toIdx, 0, moved);
  return items.join(",");
}

/** A동 zone을 1품목 칸만 허용 (다품목 A-X는 별도 처리 — A-X1/2는 2품목이지만 칸 단위로 취급). */
export function isAZone(id: string): boolean {
  return id.startsWith("A-");
}

/**
 * 그룹 이동 (수정 모드): 선택된 zone들을 시퀀스에서 한 칸 위/아래로 이동.
 * - 선택은 연속 범위(lo~hi)로 정규화 (사각형 선택 결과)
 * - dir=1: 위로 — 그룹 [lo..hi] → [lo-1..hi-1], lo-1 값은 hi로 (순환)
 * - dir=-1: 아래로 — 그룹 [lo..hi] → [lo+1..hi+1], hi+1 값은 lo로 (순환)
 */
export function groupShiftInsert(
  seq: ZoneSeq,
  data: Record<string, string>,
  selectedZones: string[],
  dir: 1 | -1
): { next: Record<string, string>; overflow: string[] } {
  const idxs = selectedZones
    .map((z) => seq.indexOf(z))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (idxs.length === 0) return { next: { ...data }, overflow: [] };
  const lo = idxs[0];
  const hi = idxs[idxs.length - 1];
  // BUG-FIX(2026-08-17): {} 시작 → A동 키만 반환되어 B/C/D동 배치 소실. 전체 복사 후 변경.
  const next: Record<string, string> = { ...data };
  // 빈칸(undefined) 전파 방지: 값이 없으면 키를 제거해 빈칸 유지
  const put = (id: string, v: string | undefined) => {
    if (v === undefined) delete next[id];
    else next[id] = v;
  };

  if (dir === 1) {
    if (lo - 1 < 0) return { next: { ...data }, overflow: [] };
    for (let i = 0; i < seq.length; i++) {
      const id = seq[i];
      if (i === lo - 1) put(id, data[seq[lo]]); // 그룹 첫 값 → 위 칸
      else if (i > lo - 1 && i < hi) put(id, data[seq[i + 1]]); // 그룹 값 1칸 위로
      else if (i === hi) put(id, data[seq[lo - 1]]); // 위 칸 값 → 그룹 끝
      else put(id, data[id]);
    }
  } else {
    if (hi + 1 >= seq.length) return { next: { ...data }, overflow: [] };
    for (let i = 0; i < seq.length; i++) {
      const id = seq[i];
      if (i === lo) put(id, data[seq[hi + 1]]); // 아래 칸 값 → 그룹 첫
      else if (i > lo && i <= hi) put(id, data[seq[i - 1]]); // 그룹 값 1칸 아래로
      else if (i === hi + 1) put(id, data[seq[hi]]); // 그룹 마지막 → 아래 칸
      else put(id, data[id]);
    }
  }
  return { next, overflow: [] };
}

/**
 * 배치 좌표맵 생성 (2026-09-03 좌표 규칙).
 * 각 존에 (X,Y) 좌표 부여. X=left 좌->우 1based, Y=아래(top큼) 1 -> 위로 1씩.
 * 반환: Map<zoneId, {x:number,y:number}>
 */
export function buildGridCoordMap(zones: any[]): Map<string, { x: number; y: number }> {
  if (!zones || zones.length === 0) return new Map();
  const SLOT_H = 34, GAP_Y = 4, PX = SLOT_H + GAP_Y; // 38
  const cxs: {zid:string, x:number}[] = [];
  const ys: number[] = []; // each 존의 center-top
  for (const z of zones) {
    const cx = Number(z?.style?.left ?? 0) + (Number(z?.style?.width ?? 48) / 2);
    cxs.push({ zid: z.id, x: cx });
    ys.push(Number(z?.style?.top ?? 0) + (Number(z?.style?.height ?? 34) / 2));
  }
  // X: cx 고유값 오름차순 클러스터(8px 오차 허용)로 1..N 부여
  const xReps: number[] = [];
  for (const c of [...new Set(cxs.map(o=>o.x))].sort((a,b)=>a-b)) {
    const last = xReps[xReps.length-1];
    if (last === undefined || c - last > 8) xReps.push(c);
  }
  const xOf = (cx:number) => xReps.reduce((bi,v,i)=> Math.abs(v-cx)<Math.abs(xReps[bi]-cx)? i:bi, 0) + 1;
  // Y: 가장 큰 top(아래) = 1, 위로 PX마다 +1
  const minTop = Math.min(...ys); const maxTop = Math.max(...ys);
  const yRepsDesc: number[] = [];
  for (let t=maxTop; t>=minTop; t-=PX) { yRepsDesc.push(t); } // 전체 38px 그리드 행(빈 줄 포함) — 점유 여부 무관 Y부여
  const yOf = (top:number) => {
    let bi=0,bd=1e9; yRepsDesc.forEach((r,i)=>{const dd=Math.abs(top-r);if(dd<bd){bd=dd;bi=i;}}); return bi+1;
  };
  const m = new Map<string,{x:number,y:number}>();
  for (const o of cxs) m.set(o.zid, { x: xOf(o.x), y: yOf(ys[cxs.findIndex(c=>c.zid===o.zid)]) });
  return m;
}

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
