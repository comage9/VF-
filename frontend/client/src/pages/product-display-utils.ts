/**
 * 제품배치도 드래그앤드롭 유틸 (2026-08-17)
 * - extractDansu: 제품명에서 단수(N단) 파싱
 * - aShiftInsert: A동 1칸 1품목 insert(밀림) + overflow 반환
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
 * A동 insert 이동 (1칸 1품목 — 칸 단위 shift)
 *
 * 사용자 규칙: 이동품목이 대상 칸에 들어가고, 대상 칸부터 끝까지 한 칸씩 뒤로.
 * 끝에서 밀려난 품목은 overflow로 반환 (우측 패널에서 미배치/재배치 결정).
 *
 * 예: seq=[z1,z2,z3,z4], data={z1:210,z2:214,z3:203,z4:225}, 210(z1)→z3
 *  → data'={z1:undefined(빈), z2:214, z3:210, z4:203}, overflow=[225]
 */
export function aShiftInsert(
  seq: ZoneSeq,
  data: Record<string, string>,
  srcZone: string,
  dstZone: string
): { next: Record<string, string>; overflow: string[] } {
  const srcIdx = seq.indexOf(srcZone);
  const dstIdx = seq.indexOf(dstZone);
  if (srcIdx === -1 || dstIdx === -1 || srcIdx === dstIdx) {
    return { next: { ...data }, overflow: [] };
  }
  const item = data[srcZone];
  if (!item) return { next: { ...data }, overflow: [] };

  // src를 제거한 축약 시퀀스에서 대상 위치를 다시 계산 (src가 dst보다 앞이면 당겨짐)
  const shrunk = seq.filter((_, i) => i !== srcIdx);
  const d2 = shrunk.indexOf(dstZone);

  const next: Record<string, string> = {};
  for (let i = 0; i < shrunk.length; i++) {
    const id = shrunk[i];
    if (i < d2) {
      // 대상 앞: 원본 유지 (src 제거 후 위치 보정됨)
      const v = data[id];
      if (v !== undefined) next[id] = v;
    } else if (i === d2) {
      // 대상: 이동품목 삽입
      next[id] = item;
    } else {
      // 대상 이후: 한 칸씩 뒤로 (축약 시퀀스 기준 i-1의 원본)
      const v = data[shrunk[i - 1]];
      if (v !== undefined) next[id] = v;
    }
  }

  // 시퀀스 끝에서 밀려난 품목 (src가 끝이 아니면 원본 끝값이 overflow)
  const overflow: string[] = [];
  const seqLast = seq[seq.length - 1];
  if (seqLast !== srcZone) {
    const lv = data[seqLast];
    if (lv) overflow.push(...lv.split(",").map((s) => s.trim()).filter(Boolean));
  }
  return { next, overflow };
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
  const next: Record<string, string> = {};

  if (dir === 1) {
    if (lo - 1 < 0) return { next: { ...data }, overflow: [] };
    for (let i = 0; i < seq.length; i++) {
      const id = seq[i];
      if (i === lo - 1) next[id] = data[seq[lo]]; // 그룹 첫 값 → 위 칸
      else if (i > lo - 1 && i < hi) next[id] = data[seq[i + 1]]; // 그룹 값 1칸 위로
      else if (i === hi) next[id] = data[seq[lo - 1]]; // 위 칸 값 → 그룹 끝
      else next[id] = data[id];
    }
  } else {
    if (hi + 1 >= seq.length) return { next: { ...data }, overflow: [] };
    for (let i = 0; i < seq.length; i++) {
      const id = seq[i];
      if (i === lo) next[id] = data[seq[hi + 1]]; // 아래 칸 값 → 그룹 첫
      else if (i > lo && i <= hi) next[id] = data[seq[i - 1]]; // 그룹 값 1칸 아래로
      else if (i === hi + 1) next[id] = data[seq[hi]]; // 그룹 마지막 → 아래 칸
      else next[id] = data[id];
    }
  }
  return { next, overflow: [] };
}
