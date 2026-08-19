/**
 * 제품배치도 드래그앤드롭 유틸 (2026-08-17)
 * - extractDansu: 제품명에서 단수(N단) 파싱
 * - aShiftInsert: A동 1칸 1품목 insert(수기 pull 모델과 동일 방향) + overflow 반환
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
 * A동 insert 이동 (1칸 1품목 — pull 모델, 수기 applyPlacementEdit와 동일 방향)
 *
 * 2026-08-19 변경: 기존 push 모델(대상~끝 한 칸씩 뒤로 밀고 끝값 overflow)이
 * 수기 입력의 pull 모델(빈칸을 뒤에서 당겨 맨 끝만 빈칸)과 결과가 달라 혼선을 줌.
 * → 드래그도 pull로 통일: src 구멍을 뒤에서 채워 앞으로 당기고,
 *   당김 구간 맨 앞(이동 방향 첫 칸)에 이동품목 삽입. 구멍·끝 overflow 없음.
 *
 * 예: seq=[z1,z2,z3,z4], data={z1:210,z2:214,z3:203,z4:225}, 210(z1)→z3
 *  → data'={z1:214, z2:203, z3:210, z4:225}, overflow=[] (빈칸 없음)
 *
 * overflow는 pull 모델에서 발생하지 않지만 반환 시그니처는 유지 (안전망 — 호출부 호환).
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

  // BUG-FIX(2026-08-17): {} 시작 → A동 키만 반환되어 B/C/D동 배치 소실. 전체 복사 후 변경.
  const next: Record<string, string> = { ...data };
  // 빈칸(undefined) 전파 방지: 값이 없으면 키를 제거해 빈칸 유지 (잔존+overflow 중복 방지)
  const put = (id: string, v: string | undefined) => {
    if (v === undefined) delete next[id];
    else next[id] = v;
  };

  // pull 당김: src 구멍을 [src..dst] 구간 이동으로 메우고, 이동품목은 dst에 삽입.
  // 수기(applyPlacementEdit)의 '빈칸을 뒤에서 당김'과 같은 방향의 pull 모델로 통일.
  // - 앞으로 이동(src<dst): src~dst-1 칸이 뒤(src+1~dst)에서 한 칸씩 앞으로 당겨짐, dst=item
  // - 뒤로 이동(src>dst): dst+1~src 칸이 앞(dst~src-1)에서 한 칸씩 뒤로 당겨짐, dst=item
  // 어느 방향이든 src 구멍·중간 구멍·끝 overflow 없음.
  if (srcIdx < dstIdx) {
    for (let i = srcIdx; i < dstIdx; i++) put(seq[i], data[seq[i + 1]]);
  } else {
    for (let i = srcIdx; i > dstIdx; i--) put(seq[i], data[seq[i - 1]]);
  }
  next[seq[dstIdx]] = item;

  return { next, overflow: [] };
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
