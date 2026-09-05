(globalThis as any).localStorage = { getItem: () => null, setItem: () => {} };
const LINE_CONFIG_KEY = "vf_pd_line_config_v1";
const LINE_CONFIG_VERSION = "line-config-v1";
type CSSProperties = Record<string, string | number | undefined>;
const A_RANK_PLACEMENT: Record<string,string> = {};
const B_RANK_PLACEMENT: Record<string,string> = {};
const C_RANK_PLACEMENT: Record<string,string> = {};
const D_RANK_PLACEMENT: Record<string,string> = {};
type DongKey = "ALL" | "A" | "B" | "C" | "D" | "E";

type ZoneDef = {
  id: string;
  num: string;
  line: number;
  showNumAsProduct: boolean;
  style: CSSProperties;
  locNo?: number | null;
};

type LineLabel = {
  text: string;
  style: CSSProperties;
};

type DongLayout = {
  key: DongKey;
  label: string;
  height: number;
  width: number;
  zones: ZoneDef[];
  lineLabels: LineLabel[];
};

type PlacementMap = Record<string, string>;

const SLOT = {
  w: 48,
  h: 34,
  gapY: 4,
  padL: 28,
  padT: 48,
  padR: 20,
  padB: 20,
  // 통로 넓힘 (L7 8칸 tight 배치 맞춤)
    lineGap: 42,
    tightGap: 6,
  rowIdxW: 22,
  rowIdxGap: 6,
  bottomLineGap: 20,
  bottomLabelH: 18,
};

const A_SLOTS_PER_LINE = 19;
const A_BOTTOM_LINE_ID = 7;
const A_BOTTOM_SLOTS = 8;
const TIGHT_PAIRS: [number, number][] = [
  [2, 3],
  [4, 5],
];

type LineSpec = {
  line: number;
  count: number;
  badge?: string;
  bottomIsStart?: boolean;
  /** 화면에서 숨길 슬롯 번호 (배치 데이터는 유지 — 다시 표시하면 복원) */
  hiddenSlots?: number[];
};

function isTightPair(a: number, b: number): boolean {
  return TIGHT_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a)
  );
}

/** 라인별 칸 구성 오버라이드 — 기본 LineSpec 상수 위에 병합해 실효 구성 생성.
 *  count: 칸 수 변경 (증가=빈 칸 추가, 감소=화면에서만 제거 — 배치 데이터는 보존 → 다시 늘리면 복원)
 *  hiddenSlots: 화면에서 숨길 슬롯 번호 (입구 자리 등 — 배치 데이터는 유지)
 *  badge: 라인 라벨 텍스트 교체 */
type LineOverride = {
  count?: number;
  hiddenSlots?: number[];
  badge?: string;
};

/** 동별 라인 오버라이드 모음. 키: 동은 "A"~"D", 라인은 문자열 숫자 ("1"~"7", JSON 키 규칙). */
type LineConfigMap = Partial<Record<"A" | "B" | "C" | "D", Record<string, LineOverride>>>;

/** 기본 라인 구성 + 오버라이드 병합 → 실효 구성. 오버라이드 없으면 입력과 동일한 값 (레그레션 없음). */
function applyLineOverrides(lines: LineSpec[], overrides: Record<string, LineOverride> | undefined): LineSpec[] {
  if (!overrides) return lines;
  return lines.map((spec) => {
    const ov = overrides[String(spec.line)];
    if (!ov) return spec;
    const merged: LineSpec = { ...spec };
    if (typeof ov.count === "number" && Number.isFinite(ov.count)) {
      merged.count = Math.max(1, Math.floor(ov.count));
    }
    if (ov.badge !== undefined) merged.badge = ov.badge;
    if (Array.isArray(ov.hiddenSlots) && ov.hiddenSlots.length > 0) {
      merged.hiddenSlots = [...ov.hiddenSlots];
    }
    return merged;
  });
}

/** 통로 중심 뱀 모양 로케이션 번호 공식 — A동 L1~L6 지그재그 (빌더·툴팁 단일 구현).
 *  3개 통로 쌍: (1|2)=1~38, (3|4)=39~76, (5|6)=77~114.
 *  pair 0은 slot 19(상단)에서 시작, pair 1·2는 slot 1에서 시작.
 *  slot > 19 확장 칸: pair 0은 114 뒤로 뱀 패턴 교대 연속 (충돌 없음),
 *  pair 1·2는 증가 방향이 곧 전진이라 공식 그대로 확장됨. */
function calcZigzagLocNo(line: number, slot: number): number | null {
  if (!Number.isFinite(line) || !Number.isFinite(slot) || line < 1 || line > 6 || slot < 1) return null;
  const numVal = Math.floor(slot);
  const pair = Math.floor((line - 1) / 2); // (1|2)=0, (3|4)=1, (5|6)=2
  const isOddLine = line % 2 === 1;
  // pair 0 확장 슬롯(20~): 114 뒤로 교대 뱀 패턴 계속 — k=1→115,116 / k=2→117,118 …
  if (pair === 0 && numVal > 19) {
    const k = numVal - 19;
    const base = 114 + 2 * (k - 1);
    const oddFirst = k % 2 === 1; // slot 19 패턴(L1 먼저) 미러 후 교대
    return ((isOddLine && oddFirst) || (!isOddLine && !oddFirst)) ? base + 1 : base + 2;
  }
  // L1|L2: slot 19에서 시작. L3|L4·L5|L6: slot 1에서 낮은 번호 시작
  const offset = pair === 0 ? 19 - numVal : numVal - 1;
  const oddFirst = offset % 2 === 0;
  return ((isOddLine && oddFirst) || (!isOddLine && !oddFirst))
    ? pair * 38 + offset * 2 + 1
    : pair * 38 + offset * 2 + 2;
}

/**
 * A동 zone 물리 순서 정렬 키.
 * 순서: L1-1 → L1-19 → L2-1 → … → L6-19 → L7-1-1 → L7-1-2 → … → L7-8-2 → X1 → X2,
 * 사용자 추가 칸(A-NEW-* 등)은 맨 뒤.
 * - A-L(\d)-(\d)-(\d) (L7): [0, line, col*2 + (row-1)]  — A-L7-1-1=[0,7,0], A-L7-1-2=[0,7,1], A-L7-2-1=[0,7,2]…
 * - A-L(\d)-(\d) (L1~L6)  : [0, line, cell]
 * - A-X1=[1,0,0], A-X2=[1,1,0] / 그 외 = [2,0,0]
 * buildADongLayout은 라인 내림차순(L6→L1)으로 zones를 생성하므로, shift에는 이 키로 정렬한
 * 물리 순서를 사용해야 "앞으로 당김" 방향이 L1→L2→…→L6→L7→X 가 된다.
 */
function aZoneSortKey(id: string): [number, number, number] {
  const m = id.match(/^A-L(\d+)-(\d+)-(\d+)$/); // L7: A-L7-1-1 형식
  if (m) return [0, +m[1], +m[2] * 2 + (+m[3] - 1)];
  const m2 = id.match(/^A-L(\d+)-(\d+)$/); // L1~L6: A-L1-1 형식
  if (m2) return [0, +m2[1], +m2[2]];
  if (id === "A-X1") return [1, 0, 0];
  if (id === "A-X2") return [1, 1, 0];
  return [2, 0, 0];
}

/** A동 zone 물리 순서 comparator (aSeq 정렬 · zoneOrderA와 동일 로직 — 중복 정의 단일화). */
function cmpZoneOrderA(a: string, b: string): number {
  const [t1, l1, n1] = aZoneSortKey(a);
  const [t2, l2, n2] = aZoneSortKey(b);
  return t1 - t2 || l1 - l2 || n1 - n2;
}

function buildADongLayout(
  dong: DongKey = "A",
  vertLines: LineSpec[] = A_LINES,
  slot = SLOT
): { zones: ZoneDef[]; lineLabels: LineLabel[]; width: number; height: number } {
  const zones: ZoneDef[] = [];
  const lineLabels: LineLabel[] = [];
  const maxCount = Math.max(1, ...vertLines.map((l) => l.count));
  const ordered = [...vertLines].sort((a, b) => b.line - a.line);

  const colLefts: number[] = [];
  let x = slot.padL;
  ordered.forEach((lineSpec, i) => {
    colLefts.push(x);
    if (i < ordered.length - 1) {
      const next = ordered[i + 1];
      // 5번·6번 사이 통로는 칸 2개 수용 폭으로 넓힘 (다른 라인 영향 없음)
      const isAisle56 = (lineSpec.line === 6 && next.line === 5) || (lineSpec.line === 5 && next.line === 6);
      const gap = isAisle56
        ? slot.w * 2 + slot.tightGap + slot.gapY // 2칸 + 여유
        : isTightPair(lineSpec.line, next.line)
          ? slot.tightGap
          : slot.lineGap;
      x += slot.w + gap;
    }
  });

  const lineLeftOf = (lineNo: number) => {
    const idx = ordered.findIndex((l) => l.line === lineNo);
    return idx >= 0 ? colLefts[idx] : slot.padL;
  };

  ordered.forEach((lineSpec) => {
    const colLeft = lineLeftOf(lineSpec.line);
    const bottomIsStart = lineSpec.bottomIsStart !== false;
    const header = lineSpec.badge
      ? `L${lineSpec.line}\n${lineSpec.badge}`
      : `L${lineSpec.line}`;

    lineLabels.push({
      text: header,
      style: {
        left: colLeft - 4,
        top: lineSpec.badge ? 2 : 10,
        width: slot.w + 8,
        textAlign: "center",
        whiteSpace: "pre-line",
        lineHeight: 1.15,
        fontSize: lineSpec.badge ? 10 : undefined,
      },
    });

    for (let i = 0; i < lineSpec.count; i++) {
      const numVal = i + 1;
      // 숨김 슬롯(입구 자리 등)은 화면에서만 제외 — 배치 데이터는 보존
      if (lineSpec.hiddenSlots?.includes(numVal)) continue;
      const placeFromTop = bottomIsStart ? lineSpec.count - 1 - i : i;
      // 통로 중심 뱀 모양 로케이션 번호 (getZigzagLocNo와 단일 공식 — calcZigzagLocNo)
      const locNo = calcZigzagLocNo(lineSpec.line, numVal) ?? undefined;
      zones.push({
        id: `${dong}-L${lineSpec.line}-${numVal}`,
        num: "",
        line: lineSpec.line,
        showNumAsProduct: false,
        locNo,
        style: {
          left: colLeft,
          top: slot.padT + placeFromTop * (slot.h + slot.gapY),
          width: slot.w,
          height: slot.h,
        },
      });
    }
  });

  const line1Count = ordered.find((l) => l.line === 1)?.count ?? A_SLOTS_PER_LINE;
  const rowIdxLeft = lineLeftOf(1) + slot.w + slot.rowIdxGap;
  for (let cell = 1; cell <= line1Count; cell++) {
    const placeFromTop = line1Count - cell;
    lineLabels.push({
      text: String(cell),
      style: {
        left: rowIdxLeft,
        top: slot.padT + placeFromTop * (slot.h + slot.gapY),
        width: slot.rowIdxW,
        height: slot.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        textAlign: "left",
      },
    });
  }

  // L7: 8칸 × 2슬롯 = 16 zone (A-L7-N-1 좌, A-L7-N-2 우), 라인2 끝과 맞춤
      const vertBottom =
        slot.padT + maxCount * slot.h + Math.max(0, maxCount - 1) * slot.gapY;
      const bottomTop = vertBottom + slot.bottomLineGap + slot.bottomLabelH;
      const bottomStartLeft = slot.padL;
      // L2 끝 = lineLeftOf(2) + slot.w. L7 8칸 끝을 이와 맞춤.
      const l2Right = lineLeftOf(2) + slot.w;
      const l7TotalWidth = l2Right - bottomStartLeft;
      const l7Step = l7TotalWidth / A_BOTTOM_SLOTS; // 8칸이 L2 영역까지 꽉 참
      const l7SlotW = Math.floor(l7Step) - 1; // 칸 간 1px gap
      const l7SlotH = slot.h; // 각 슬롯 높이 (칸 = 2슬롯)

      lineLabels.push({
        text: "7번 라인 (슬림서랍장·칵투스, 7-1-1부터)",
        style: {
          left: bottomStartLeft,
          top: vertBottom + slot.bottomLineGap - 2,
          width: l7TotalWidth,
          textAlign: "left",
          fontSize: 11,
          fontWeight: 700,
          color: "#b45309",
        },
      });

      for (let i = 0; i < A_BOTTOM_SLOTS; i++) {
        const isLast = i === A_BOTTOM_SLOTS - 1;
        const cellLeft = Math.round(bottomStartLeft + i * l7Step);
        const halfW = Math.floor(l7SlotW / 2);
        // 좌 슬롯 (7-N-1) — 외곽 테두리(좌/상/하)로 한 칸 묶음 표현
        zones.push({
          id: `A-L7-${i + 1}-1`,
          num: "",
          line: A_BOTTOM_LINE_ID,
          showNumAsProduct: false,
          style: {
            left: cellLeft,
            top: bottomTop,
            width: halfW,
            height: l7SlotH * 2,
            borderLeft: "2px solid #334155",
            borderTop: "2px solid #334155",
            borderBottom: "2px solid #334155",
            borderRight: "1px dashed #cbd5e1",
          },
        });
        // 우 슬롯 (7-N-2) — 외곽 테두리(우/상/하)로 한 칸 묶음 표현
        zones.push({
          id: `A-L7-${i + 1}-2`,
          num: "",
          line: A_BOTTOM_LINE_ID,
          showNumAsProduct: false,
          style: {
            left: cellLeft + halfW,
            top: bottomTop,
            width: l7SlotW - halfW,
            height: l7SlotH * 2,
            borderRight: isLast ? "2px solid #334155" : "2px solid #334155",
            borderTop: "2px solid #334155",
            borderBottom: "2px solid #334155",
            borderLeft: "1px dashed #cbd5e1",
          },
        });
      }

  // 5번·6번 라인 사이 통로에 2칸 추가 (다른 라인 영향 없음)
      const col5Left = lineLeftOf(5);
      const col6Left = lineLeftOf(6);
      const aisleLeft = col6Left + slot.w; // 6번 라인 오른쪽 끝
      const aisleCenter = (aisleLeft + col5Left) / 2;
      // 통로 위 2칸을 19번(=상단) 라인 높이에 배치, 나란히
      const rowY = slot.padT;
      // 좌측 칸 (6번 라인 쪽)
      zones.push({
        id: `${dong}-X1`,
        num: "",
        line: 8,
        showNumAsProduct: false,
        style: {
          left: Math.round(aisleCenter - slot.w / 2 - (slot.w + slot.tightGap) / 2),
          top: rowY,
          width: slot.w,
          height: slot.h,
        },
      });
      // 우측 칸 (5번 라인 쪽)
      zones.push({
        id: `${dong}-X2`,
        num: "",
        line: 8,
        showNumAsProduct: false,
        style: {
          left: Math.round(aisleCenter - slot.w / 2 + (slot.w + slot.tightGap) / 2),
          top: rowY,
          width: slot.w,
          height: slot.h,
        },
      });

  const lastLeft = colLefts[colLefts.length - 1] ?? slot.padL;
  const width = Math.max(
      lastLeft + slot.w + slot.rowIdxGap + slot.rowIdxW + slot.padR,
      bottomStartLeft + A_BOTTOM_SLOTS * (slot.w + slot.tightGap) + slot.padR
    );
  const height = bottomTop + slot.h + slot.padB;

  return { zones, lineLabels, width, height };
}

type BlockSpec = {
  name: string;
  x: number;
  y: number;
  cols: number; // 가로 칸 수
  rows: number; // 세로 칸 수
  horizontal: boolean; // true=가로 나열, false=세로 나열
  startIdx?: number; // 시작 번호 (기본 1)
  /** 화면에서 숨길 칸 번호 (zone 번호 기준 — 배치 데이터는 유지) */
  hiddenSlots?: number[];
};

/**
 * 블록형 배치 (B동·C동 등): 각 블록을 (x,y)에 cols×rows 칸으로 배치
 * - horizontal=true → 블록 내 번호를 가로로 1,2,3... 매김
 * - horizontal=false → 세로로 1,2,3... 매김
 */
function buildBlockLayout(
  dong: DongKey,
  blocks: BlockSpec[],
  slot = SLOT
): { zones: ZoneDef[]; lineLabels: LineLabel[]; width: number; height: number } {
  const zones: ZoneDef[] = [];
  const lineLabels: LineLabel[] = [];
  let maxX = 0;
  let maxY = 0;

  blocks.forEach((b, bi) => {
    const startIdx = b.startIdx ?? 1;
    const total = b.cols * b.rows;
    const gap = 4;

    lineLabels.push({
      text: b.name,
      style: {
        left: b.x,
        top: b.y - 16,
        width: Math.max(b.cols * (slot.w + gap), 48),
        textAlign: "left",
        fontSize: 10,
        fontWeight: 700,
        color: "#475569",
      },
    });

    for (let i = 0; i < total; i++) {
      const idx = startIdx + i;
      // 숨김 칸은 화면에서만 제외 — 배치 데이터는 보존
      if (b.hiddenSlots?.includes(idx)) continue;
      let left: number;
      let top: number;
      if (b.horizontal) {
        const col = i % b.cols;
        const row = Math.floor(i / b.cols);
        left = b.x + col * (slot.w + gap);
        top = b.y + row * (slot.h + gap);
      } else {
        const col = Math.floor(i / b.rows);
        const row = i % b.rows;
        left = b.x + col * (slot.w + gap);
        top = b.y + row * (slot.h + gap);
      }
      maxX = Math.max(maxX, left + slot.w);
      maxY = Math.max(maxY, top + slot.h);
      zones.push({
        id: `${dong}-${b.name}-${idx}`,
        num: "",
        line: bi + 1,
        showNumAsProduct: false,
        style: {
          left,
          top,
          width: slot.w,
          height: slot.h,
        },
      });
    }
  });

  return {
    zones,
    lineLabels,
    width: maxX + slot.padR,
    height: maxY + slot.padB,
  };
}

const A_LINES: LineSpec[] = [
  { line: 1, count: A_SLOTS_PER_LINE },
  { line: 2, count: A_SLOTS_PER_LINE },
  { line: 3, count: A_SLOTS_PER_LINE },
  { line: 4, count: A_SLOTS_PER_LINE },
  { line: 5, count: A_SLOTS_PER_LINE, badge: "확장" },
  { line: 6, count: A_SLOTS_PER_LINE, badge: "확장" },
];

/** B동: 엑셀 b동.xlsx 도면 그대로 (2026-08-16) */
// 도면: B좌측=왼쪽 세로(B상단 옆~B하단 위), B중앙1-9=B우측 옆 통로, B통로 없음
const B_BLOCKS: BlockSpec[] = [
  { name: "B상단", x: 70, y: 60, cols: 8, rows: 1, horizontal: true },
  { name: "B우측", x: 520, y: 60, cols: 1, rows: 5, horizontal: false },
  { name: "B중앙1", x: 70, y: 140, cols: 8, rows: 1, horizontal: true },
  // B-B중앙1-9: B우측 옆 통로 중앙 (도면 N8)
  { name: "B중앙1", x: 477, y: 98, cols: 1, rows: 1, horizontal: true, startIdx: 9 },
  { name: "B중앙2", x: 70, y: 200, cols: 8, rows: 1, horizontal: true },
  // B좌측: 왼쪽 세로 7칸 (B상단 옆 y:60에서 시작)
  { name: "B좌측", x: 4, y: 60, cols: 1, rows: 7, horizontal: false },
  { name: "B하단1", x: 4, y: 340, cols: 4, rows: 1, horizontal: true },
  { name: "B하단2", x: 260, y: 340, cols: 7, rows: 1, horizontal: true },
];

/** localStorage의 라인 구성 오버라이드 읽기 — 손상/타버전 시 기본 구성(오버라이드 없음) */
function loadLineConfigMap(): LineConfigMap {
  try {
    const raw = localStorage.getItem(LINE_CONFIG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && parsed.__v === LINE_CONFIG_VERSION && parsed.data && typeof parsed.data === "object") {
      return parsed.data as LineConfigMap;
    }
  } catch {
    /* 손상 시 기본값 */
  }
  return {};
}

const INITIAL_LINE_CONFIG: LineConfigMap = loadLineConfigMap();

/** C/D동 빌더의 셀 → 라인 번호 (오버라이드 키 = 같은 라인 셀 묶음): 1열은 행, 3열은 열 */
function cDongLineOf(row: number, col: number): number {
  return col === 3 ? col : row;
}
/** C/D동 빌더의 셀 → 슬롯 번호: 1열은 위에서 아래, 3열은 왼쪽에서 오른쪽 증가 */
function cDongSlotOf(idx: number, col: number): number {
  return col === 3 ? idx + 1 : 16 - idx;
}

/** D동 셀 + 오버라이드 → 존 생성 (기존 좌표 규칙 유지, 칸 수 증감만 적용) */
function buildCDongZones(dong: DongKey, overrides: Record<string, LineOverride> | undefined, slot = SLOT) {
  const zones: ZoneDef[] = [];
  const gap = 4;
  const xOf = (col: number) => slot.padL + (col - 1) * (slot.w + gap);
  const yOf = (row: number) => slot.padT + (row - 3) * (slot.h + slot.gapY);
  C_CELLS_RAW.forEach(([row, col], idx) => {
    const ov = overrides?.[String(cDongLineOf(row, col))];
    if (ov) {
      const slotNo = cDongSlotOf(idx, col);
      if (Array.isArray(ov.hiddenSlots) && ov.hiddenSlots.includes(slotNo)) return;
      if (typeof ov.count === "number" && Number.isFinite(ov.count) && slotNo > Math.max(1, Math.floor(ov.count))) return;
    }
    zones.push({
      id: `${dong}-R${row}-C${col}`,
      num: "",
      line: 0,
      showNumAsProduct: false,
      style: { left: xOf(col), top: yOf(row), width: slot.w, height: slot.h },
    });
  });
  return zones;
}

/** D동 셀 + 오버라이드 → 존 생성 (기존 좌표 규칙 유지, 칸 수 증감만 적용) */
function buildDDongZones(dong: DongKey, overrides: Record<string, LineOverride> | undefined, slot = SLOT) {
  const zones: ZoneDef[] = [];
  const gap = 4;
  const xOf = (col: number) => slot.padL + (col - 1) * (slot.w + gap);
  const yOf = (row: number) => slot.padT + (row - 3) * (slot.h + slot.gapY);
  D_CELLS_RAW.forEach(([row, col], idx) => {
    const ov = overrides?.[String(row)];
    if (ov) {
      if (Array.isArray(ov.hiddenSlots) && ov.hiddenSlots.includes(idx + 1)) return;
      if (typeof ov.count === "number" && Number.isFinite(ov.count) && idx + 1 > Math.max(1, Math.floor(ov.count))) return;
    }
    zones.push({
      id: `${dong}-R${row}-C${col}`,
      num: "",
      line: 0,
      showNumAsProduct: false,
      style: { left: xOf(col), top: yOf(row), width: slot.w, height: slot.h },
    });
  });
  return zones;
}

/** 전 동 빌트 레이아웃 생성 — 기본 상수 + 라인 오버라이드 병합 (오버라이드 없으면 기존과 동일) */
function buildAllDongLayouts(config: LineConfigMap) {
  const aBuilt = buildADongLayout("A", applyLineOverrides(A_LINES, config.A));
  const bBlocks = applyLineOverrides(
    B_BLOCKS.map((b, i) => ({ line: i + 1, count: b.cols * b.rows })),
    config.B
  );
  const bBuilt = buildBlockLayout(
    "B",
    B_BLOCKS.map((b, i) => ({
      ...b,
      cols: b.horizontal ? bBlocks[i].count : b.cols,
      rows: b.horizontal ? b.rows : bBlocks[i].count,
      hiddenSlots: bBlocks[i].hiddenSlots,
    }))
  );
  const cBuilt = buildCDongLayout("C");
  cBuilt.zones = buildCDongZones("C", config.C);
  const dBuilt = buildDDongLayout("D");
  dBuilt.zones = buildDDongZones("D", config.D);
  return { A: aBuilt, B: bBuilt, C: cBuilt, D: dBuilt };
}

// ※ BUILT_LAYOUTS 상수는 아래에서 초기화 — C/D_CELLS_RAW보다 먼저 평가되면 TDZ 오류

/** C동: 엑셀 "통합 문서2.xlsx" 셀 위치 그대로 재현 — (row, col) 좌표 */
// 셀 위치: [행, 열] (엑셀 R3~R23, A~U열)
const C_CELLS_RAW: [number, number][] = [
  // A열 (1열): R5~R16 (12칸) + R18, R20, R21, R22 (4칸) = 16
  [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1], [18, 1], [20, 1], [21, 1], [22, 1],
  // C열 (3열): R3~R18 (16칸)
  [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], [15, 3], [16, 3], [17, 3], [18, 3],
  // 중앙 D~K (4~11열): R14, R15, R17, R18, R21, R23 + R16 (1) — R15-C5~C11 삭제됨 (2026-08-16)
  [14, 4], [14, 5], [14, 6], [14, 7], [14, 8], [14, 9], [14, 10], [14, 11],
  [15, 4],
  [16, 4],
  [17, 4], [17, 5], [17, 6], [17, 7], [17, 8], [17, 9], [17, 10], [17, 11],
  [18, 4], [18, 5], [18, 6], [18, 7], [18, 8], [18, 9], [18, 10], [18, 11],
  // R20 (신규 2026-08-17): R21 위 추가 라인 8칸 — 와이드 서랍장 출고 상위 배치
  [20, 4], [20, 5], [20, 6], [20, 7], [20, 8], [20, 9], [20, 10], [20, 11],
  [21, 4], [21, 5], [21, 6], [21, 7], [21, 8], [21, 9], [21, 10], [21, 11],
  [23, 4], [23, 5], [23, 6], [23, 7], [23, 8], [23, 9], [23, 10], [23, 11],
  // M열 (13열): R13, R14 (2칸)
  [13, 13], [14, 13],
  // 우측 N~U (14~21열): R14, R17, R18 (각 8) = 24
  [14, 14], [14, 15], [14, 16], [14, 17], [14, 18], [14, 19], [14, 20], [14, 21],
  [17, 14], [17, 15], [17, 16], [17, 17], [17, 18], [17, 19], [17, 20], [17, 21],
  [18, 14], [18, 15], [18, 16], [18, 17], [18, 18], [18, 19], [18, 20], [18, 21],
];

/** D동 셀 (엑셀 d동.xlsx 그대로, 2026-08-16) — 상단 8 + 중앙1 8 + 중앙2 8 + 우측1(K) 6 + 우측2(M) 6 + 하단 5 = 41 */
const D_CELLS_RAW: [number, number][] = [
  // D상단 (B4~I4 = 열 2~9, 행 4) = 8
  [4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7], [4, 8], [4, 9],
  // D중앙1 (B7~I7 = 열 2~9, 행 7) = 8
  [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7], [7, 8], [7, 9],
  // D중앙2 (B8~I8 = 열 2~9, 행 8) = 8
  [8, 2], [8, 3], [8, 4], [8, 5], [8, 6], [8, 7], [8, 8], [8, 9],
  // D우측1 (K6~K11 = 열 11, 행 6~11) = 6
  [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11],
  // D우측2 (M6~M11 = 열 13, 행 6~11) = 6
  [6, 13], [7, 13], [8, 13], [9, 13], [10, 13], [11, 13],
  // D하단 (B13~F13 = 열 2~6, 행 13) = 5
  [13, 2], [13, 3], [13, 4], [13, 5], [13, 6],
];

function buildCDongLayout(
  dong: DongKey = "C",
  slot = SLOT
): { zones: ZoneDef[]; lineLabels: LineLabel[]; width: number; height: number } {
  const zones: ZoneDef[] = [];
  const lineLabels: LineLabel[] = [];
  const gap = 4;

  // 엑셀 열 → x (열 간격 일정)
  const xOf = (col: number) => slot.padL + (col - 1) * (slot.w + gap);
  // 엑셀 행 → y (R3가 첫 줄)
  const yOf = (row: number) => slot.padT + (row - 3) * (slot.h + slot.gapY);

  // 셀 생성 (파일 위치 그대로)
  for (const [row, col] of C_CELLS_RAW) {
    zones.push({
      id: `${dong}-R${row}-C${col}`,
      num: "",
      line: 0,
      showNumAsProduct: false,
      style: {
        left: xOf(col),
        top: yOf(row),
        width: slot.w,
        height: slot.h,
      },
    });
  }

  // 컬럼 그룹 헤더 (파일 위치 그대로)
  lineLabels.push(
    {
      text: "A",
      style: { left: xOf(1), top: slot.padT - 18, width: slot.w, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569" },
    },
    {
      text: "C",
      style: { left: xOf(3), top: slot.padT - 18, width: slot.w, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569" },
    },
    {
      text: "중앙",
      style: { left: xOf(4), top: slot.padT - 18, width: 8 * (slot.w + gap), textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569" },
    },
    {
      text: "M",
      style: { left: xOf(13), top: slot.padT - 18, width: slot.w, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569" },
    },
    {
      text: "우측",
      style: { left: xOf(14), top: slot.padT - 18, width: 8 * (slot.w + gap), textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569" },
    }
  );

  const width = xOf(21) + slot.w + slot.padR;
  const height = yOf(23) + slot.h + slot.padB;
  return { zones, lineLabels, width, height };
}

/** D동: 엑셀 d동.xlsx 셀 위치 그대로 (2026-08-16) */
function buildDDongLayout(
  dong: DongKey = "D",
  slot = SLOT
): { zones: ZoneDef[]; lineLabels: LineLabel[]; width: number; height: number } {
  const zones: ZoneDef[] = [];
  const lineLabels: LineLabel[] = [];
  const gap = 4;

  const xOf = (col: number) => slot.padL + (col - 1) * (slot.w + gap);
  const yOf = (row: number) => slot.padT + (row - 3) * (slot.h + slot.gapY);

  for (const [row, col] of D_CELLS_RAW) {
    zones.push({
      id: `${dong}-R${row}-C${col}`,
      num: "",
      line: 0,
      showNumAsProduct: false,
      style: {
        left: xOf(col),
        top: yOf(row),
        width: slot.w,
        height: slot.h,
      },
    });
  }

  // 컬럼 그룹 헤더 (파일 위치 그대로)
  lineLabels.push(
    {
      text: "D상단",
      style: { left: xOf(2), top: slot.padT - 18, width: 8 * (slot.w + gap), textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569" },
    },
    {
      text: "D중앙1",
      style: { left: xOf(2), top: yOf(7) - 18, width: 8 * (slot.w + gap), textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569" },
    },
    {
      text: "D중앙2",
      style: { left: xOf(2), top: yOf(8) - 18, width: 8 * (slot.w + gap), textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569" },
    },
    {
      text: "D우측1",
      style: { left: xOf(11), top: slot.padT - 18, width: slot.w, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569" },
    },
    {
      text: "D우측2",
      style: { left: xOf(13), top: slot.padT - 18, width: slot.w, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569" },
    },
    {
      text: "D하단",
      style: { left: xOf(2), top: yOf(13) - 18, width: 5 * (slot.w + gap), textAlign: "center", fontSize: 10, fontWeight: 700, color: "#475569" },
    }
  );

  const width = xOf(13) + slot.w + slot.padR;
  const height = yOf(13) + slot.h + slot.padB;
  return { zones, lineLabels, width, height };
}

/** 기본 상수 + 저장된 라인 오버라이드 병합 결과 — 오버라이드 없으면 기존 빌트 레이아웃과 동일한 그래프 */
const BUILT_LAYOUTS = buildAllDongLayouts(INITIAL_LINE_CONFIG);

function defaultAPlacement(): PlacementMap {
  const base: PlacementMap = { ...A_RANK_PLACEMENT };
  // B동 배치: 옷걸이/바지걸이/핸들러/로코스/슬림웨건/리빙카트 (한 칸 3품목)
  for (const [id, val] of Object.entries(B_RANK_PLACEMENT)) {
    base[id] = val;
  }
  // C동 배치: 와이드 서랍장 (한 칸 2품목)
  for (const [id, val] of Object.entries(C_RANK_PLACEMENT)) {
    base[id] = val;
  }
  // D동 배치: (대기)
  for (const [id, val] of Object.entries(D_RANK_PLACEMENT)) {
    base[id] = val;
  }
  return base;
}

const DONG_LAYOUTS: DongLayout[] = [
  {
    key: "A",
    label: "A동",
    width: BUILT_LAYOUTS.A.width,
    height: BUILT_LAYOUTS.A.height,
    zones: BUILT_LAYOUTS.A.zones,
    lineLabels: BUILT_LAYOUTS.A.lineLabels,
  },
  {
    key: "B",
    label: "B동",
    width: BUILT_LAYOUTS.B.width,
    height: BUILT_LAYOUTS.B.height,
    zones: BUILT_LAYOUTS.B.zones,
    lineLabels: BUILT_LAYOUTS.B.lineLabels,
  },
  {
    key: "C",
    label: "C동",
    width: BUILT_LAYOUTS.C.width,
    height: BUILT_LAYOUTS.C.height,
    zones: BUILT_LAYOUTS.C.zones,
    lineLabels: BUILT_LAYOUTS.C.lineLabels,
  },
  {
    key: "D",
    label: "D동",
    width: BUILT_LAYOUTS.D.width,
    height: BUILT_LAYOUTS.D.height,
    zones: BUILT_LAYOUTS.D.zones,
    lineLabels: BUILT_LAYOUTS.D.lineLabels,
  },
];

/* ===== 로케이션 번호 (통로 중심 뱀 모양) ===== */
/** A동 L1~L6 지그재그 번호 — 통로 중심 뱀 모양 (단일 공식: calcZigzagLocNo)
 *  3개 통로 쌍: (1|2)=1~38, (3|4)=39~76, (5|6)=77~114
 *  (1|2): slot 19(상단)에서 시작, 홀수라인→짝수라인 교차, 아래로 진행
 *  예: L1-19=1, L2-19=2, L2-18=3, L1-18=4, L1-17=5, L2-17=6, ...
 *  (3|4)·(5|6): slot 1에서 낮은 번호 시작 (2026-08-22 사용자 교정)
 *  예: L3-1=39, L4-1=40, …, L3-19=75, L4-19=76 / L5-1=77, L6-1=78, …, L5-19=113, L6-19=114
 *  slot > 19 (오버라이드 확장 칸)도 NaN/음수 없이 연속 번호로 확장 */
function getZigzagLocNo(zoneId: string): number | null {
  const m = zoneId.match(/^A-L(\d)-(\d+)$/);
  if (!m) return null;
  return calcZigzagLocNo(parseInt(m[1], 10), parseInt(m[2], 10));
}

/** 한 칸에 여러 제품이 있을 때 각 제품의 로케이션 번호 반환
 *  예: zoneId="A-L1-1"에 제품 2개 → [1, 2] */
function getProductLocNos(zoneId: string, itemCount: number): number[] {
  const baseLocNo = getZigzagLocNo(zoneId);
  if (baseLocNo === null) return [];
  return Array.from({ length: itemCount }, (_, i) => baseLocNo + i);
}


export { DONG_LAYOUTS, getZigzagLocNo };
