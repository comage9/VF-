/**
 * 제품 배치도 (A~E동)
 * - A동 좌→우: 6·5·4·3·2·1 (우측=1번)
 * - 밀착 2-3·4-5 / 통로 1|2·3|4·5|6
 * - L1-L6: 1칸 1품목 (지그재그, 동일분류 묶음)
 * - L7: 8칸, 바퀴 슬림 서랍장만 1칸에 2품목씩
 * - 호버 툴팁: 분류(대분류/중분류) + 상세 제품명 + 현재고
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Download, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  A_PLACED_COUNT,
  A_RANK_PLACEMENT,
  A_SLOT_CONFLICTS,
  A_TOTAL_PRODUCTS,
  A_UNPLACED,
  A_ZONE_BARCODE,
  A_ZONE_MASTER_NAME,
  A_ZONE_CATEGORY_LG,
  A_ZONE_CATEGORY_MD,
  A_ZONE_STOCK,
} from "@/pages/product-display-a-data";

const STORAGE_KEY = "vf_product_display_v1";

type DongKey = "ALL" | "A" | "B" | "C" | "D" | "E";

type ZoneDef = {
  id: string;
  num: string;
  line: number;
  showNumAsProduct: boolean;
  style: CSSProperties;
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
};

function isTightPair(a: number, b: number): boolean {
  return TIGHT_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a)
  );
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
      ? `${lineSpec.line}번\n${lineSpec.badge}`
      : `${lineSpec.line}번`;

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
      const placeFromTop = bottomIsStart ? lineSpec.count - 1 - i : i;
      zones.push({
        id: `${dong}-L${lineSpec.line}-${numVal}`,
        num: "",
        line: lineSpec.line,
        showNumAsProduct: false,
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
        text: "7번 슬림바퀴(7-1-1,7-1-2...)",
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

const A_BUILT = buildADongLayout("A", A_LINES);

/** B동: 이미지 기준 블록 구성 */
const B_BLOCKS: BlockSpec[] = [
  { name: "B상단", x: 70, y: 60, cols: 8, rows: 1, horizontal: true },
  { name: "B우측", x: 520, y: 60, cols: 1, rows: 5, horizontal: false },
  { name: "B중앙1", x: 70, y: 140, cols: 6, rows: 1, horizontal: true },
  { name: "B중앙2", x: 70, y: 200, cols: 8, rows: 1, horizontal: true },
  { name: "B좌측", x: 4, y: 60, cols: 1, rows: 4, horizontal: false },
  { name: "B하단1", x: 4, y: 260, cols: 4, rows: 1, horizontal: true },
  { name: "B하단2", x: 260, y: 260, cols: 7, rows: 1, horizontal: true },
];
const B_BUILT = buildBlockLayout("B", B_BLOCKS);

/** C동: 엑셀(통합 문서2) 기준 — 세로 16라인, 중앙 8칸 + 우측 8칸 블록 */
const C_LINE_COUNT = 16;
const C_CENTER_COLS = 8;
const C_RIGHT_COLS = 8;
// 라인별 배치 (중앙/우측 칸 번호). 1~10은 빈 라인
const C_CELLS: Record<number, { center: number[]; right: number[] }> = {
  11: { center: [], right: [1] },
  12: { center: [1, 2, 3, 4, 5, 6, 7, 8], right: [1, 2, 3, 4, 5, 6, 7, 8] },
  13: { center: [1, 2, 3, 4, 5, 6, 7, 8], right: [] },
  14: { center: [2], right: [] },
  15: { center: [1, 2, 3, 4, 5, 6, 7, 8], right: [1, 2, 3, 4, 5, 6, 7, 8] },
  16: { center: [1, 2, 3, 4, 5, 6, 7, 8], right: [1, 2, 3, 4, 5, 6, 7, 8] },
};

function buildCDongLayout(
  dong: DongKey = "C",
  slot = SLOT
): { zones: ZoneDef[]; lineLabels: LineLabel[]; width: number; height: number } {
  const zones: ZoneDef[] = [];
  const lineLabels: LineLabel[] = [];
  const gap = 4;
  const aisle = 42;

  const centerLeft = slot.padL;
  const rightLeft = centerLeft + C_CENTER_COLS * (slot.w + gap) + aisle;

  const yOf = (line: number) =>
    slot.padT + (C_LINE_COUNT - line) * (slot.h + slot.gapY);

  // 라인 번호 라벨 (좌측 인덱스)
  for (let line = 1; line <= C_LINE_COUNT; line++) {
    lineLabels.push({
      text: String(line),
      style: {
        left: 2,
        top: yOf(line) + slot.h / 2 - 6,
        width: slot.rowIdxW - 6,
        textAlign: "right",
        fontSize: 10,
        color: "#94a3b8",
      },
    });
  }
  // 중앙/우측 블록 헤더
  lineLabels.push(
    {
      text: "중앙",
      style: {
        left: centerLeft,
        top: slot.padT - 18,
        width: C_CENTER_COLS * (slot.w + gap),
        textAlign: "center",
        fontSize: 10,
        fontWeight: 700,
        color: "#475569",
      },
    },
    {
      text: "우측",
      style: {
        left: rightLeft,
        top: slot.padT - 18,
        width: C_RIGHT_COLS * (slot.w + gap),
        textAlign: "center",
        fontSize: 10,
        fontWeight: 700,
        color: "#475569",
      },
    }
  );

  for (const line of Object.keys(C_CELLS).map(Number).sort((a, b) => b - a)) {
    const cell = C_CELLS[line];
    for (const idx of cell.center) {
      zones.push({
        id: `${dong}-L${line}-C${idx}`,
        num: "",
        line,
        showNumAsProduct: false,
        style: {
          left: centerLeft + (idx - 1) * (slot.w + gap),
          top: yOf(line),
          width: slot.w,
          height: slot.h,
        },
      });
    }
    for (const idx of cell.right) {
      zones.push({
        id: `${dong}-L${line}-R${idx}`,
        num: "",
        line,
        showNumAsProduct: false,
        style: {
          left: rightLeft + (idx - 1) * (slot.w + gap),
          top: yOf(line),
          width: slot.w,
          height: slot.h,
        },
      });
    }
  }

  const width = rightLeft + C_RIGHT_COLS * (slot.w + gap) + slot.padR;
  const height = yOf(1) + slot.h + slot.padB;
  return { zones, lineLabels, width, height };
}

const C_BUILT = buildCDongLayout("C");

function defaultAPlacement(): PlacementMap {
  return { ...A_RANK_PLACEMENT };
}

const DONG_LAYOUTS: DongLayout[] = [
  {
    key: "A",
    label: "A동",
    width: A_BUILT.width,
    height: A_BUILT.height,
    zones: A_BUILT.zones,
    lineLabels: A_BUILT.lineLabels,
  },
  {
    key: "B",
    label: "B동",
    width: B_BUILT.width,
    height: B_BUILT.height,
    zones: B_BUILT.zones,
    lineLabels: B_BUILT.lineLabels,
  },
  {
    key: "C",
    label: "C동",
    width: C_BUILT.width,
    height: C_BUILT.height,
    zones: C_BUILT.zones,
    lineLabels: C_BUILT.lineLabels,
  },
  {
    key: "D",
    label: "D동",
    width: 360,
    height: 280,
    zones: [],
    lineLabels: [{ text: "라인 배치 대기", style: { left: 16, top: 12, width: 160 } }],
  },
  {
    key: "E",
    label: "E동",
    width: 360,
    height: 280,
    zones: [],
    lineLabels: [{ text: "라인 배치 대기", style: { left: 16, top: 12, width: 160 } }],
  },
];

function loadPlacement(): PlacementMap {
  return defaultAPlacement();
}

export default function ProductDisplayPage() {
  const [dong, setDong] = useState<DongKey>("ALL");
  const [data, setData] = useState<PlacementMap>(() => loadPlacement());
  const [modalOpen, setModalOpen] = useState(false);
  const [currentZone, setCurrentZone] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  // 출고 이력: barcode → dailyData (최근 90일)
  const [outboundMap, setOutboundMap] = useState<Record<string, { date: string; quantity: number }[]>>({});

  useEffect(() => {
    fetch("/api/outbound/barcode-daily?days=90")
      .then((r) => r.json())
      .then((j) => {
        const m: Record<string, { date: string; quantity: number }[]> = {};
        for (const g of j?.data ?? []) {
          m[g.barcode] = g.dailyData ?? [];
        }
        setOutboundMap(m);
      })
      .catch(() => {
        /* 출고 이력 로드 실패 시 툴팁에서 생략 */
      });
  }, []);

  // 최근 3개월 일평균 4일치 + 최근 1개월 30% 가중 계산
  const calcOutbound4d = (barcode: string): string | null => {
    const daily = outboundMap[barcode];
    if (!daily || daily.length === 0) return null;
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    let sum90 = 0;
    let cnt90 = 0;
    let sum30 = 0;
    let cnt30 = 0;
    for (const d of daily) {
      const t = new Date(d.date + "T00:00:00").getTime();
      const diff = Math.floor((now.getTime() - t) / dayMs);
      if (diff < 0 || diff > 90) continue;
      sum90 += d.quantity;
      cnt90++;
      if (diff <= 30) {
        sum30 += d.quantity;
        cnt30++;
      }
    }
    if (cnt90 === 0) return null;
    const avg90 = sum90 / 90; // 3개월 일평균 (0 포함)
    const avg30 = cnt30 > 0 ? sum30 / 30 : avg90; // 1개월 일평균
    // 가중: 1개월 추세 30% 가중 → (avg90 + avg30*1.3) / 2
    const weighted = (avg90 + avg30 * 1.3) / 2;
    const fourDay = Math.round(weighted * 4);
    return fourDay >= 0 ? String(fourDay) : null;
  };

  const current = useMemo(
    () => DONG_LAYOUTS.find((r) => r.key === dong) ?? DONG_LAYOUTS[0],
    [dong]
  );
  const openAssign = useCallback(
    (zoneId: string) => {
      setCurrentZone(zoneId);
      setInputVal(data[zoneId] || "");
      setModalOpen(true);
    },
    [data]
  );

  const confirmAssign = () => {
    if (!currentZone) return;
    const val = inputVal.trim();
    setData((prev) => {
      const next = { ...prev };
      if (val) next[currentZone] = val;
      else delete next[currentZone];
      return next;
    });
    setModalOpen(false);
  };

  const saveData = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ __v: "rank-a-v14", data })
    );
    setSaveMsg("저장되었습니다.");
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  const resetData = () => {
    if (!window.confirm("A동을 초기 배치로 되돌릴까요?")) return;
    const defaults = defaultAPlacement();
    setData(defaults);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ __v: "rank-a-v14", data: defaults })
    );
    setSaveMsg("초기화했습니다.");
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `product_display_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && modalOpen) {
        e.preventDefault();
        confirmAssign();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, inputVal, currentZone]);

  // 툴팁 생성: 분류(대분류/중분류) + 제품명 + 현재고
  const makeTooltip = (z: ZoneDef): string => {
    const zid = z.id;
    const isL7 = z.line === 7;
    const masterName = A_ZONE_MASTER_NAME[zid] || "";
    const catLg = A_ZONE_CATEGORY_LG[zid] || "";
    const catMd = A_ZONE_CATEGORY_MD[zid] || "";
    const stock = A_ZONE_STOCK[zid];
    // 위치 번호: A-L7-1-2 → 7-1-2, A-L20-1 → 20-1
    const posName = zid.replace(/^A-L/, "");
    const parts: string[] = [posName];
    if (catLg || catMd) {
      parts.push(`분류: ${catLg}${catMd ? " / " + catMd : ""}`);
    }
    if (masterName) {
      parts.push(`제품명: ${masterName}`);
    }
    if (stock !== undefined && stock !== null) {
      parts.push(`현재고: ${stock}`);
    }
    const bc = A_ZONE_BARCODE[zid] || "";
    if (bc) {
      const ob4d = calcOutbound4d(bc);
      if (ob4d !== null) {
        parts.push(`최근 3개월 4일치 예상 출고: ${ob4d}박스 (1개월 +30% 가중)`);
      }
    }
    if (isL7) {
      parts.push("슬림바퀴 슬롯");
    }
    return parts.join("\n");
  };

  return (
    <div className="space-y-4 w-full max-w-none">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground mb-3">
          A동 · 지그재그 배치(1-1=1, 2-1=2) · 동일 분류 묶음 ·
          7번=바퀴 슬림(1칸 2품목) · 호버 시 분류·제품명·재고 표시
        </p>
        <p className="text-base font-bold text-slate-800 mb-3">
          배치 {A_PLACED_COUNT} / {A_TOTAL_PRODUCTS}
          <span className="text-sm font-normal text-muted-foreground ml-2">
            미배치 {A_UNPLACED.length}
          </span>
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            key="ALL"
            type="button"
            onClick={() => setDong("ALL")}
            className={
              "px-4 py-2 rounded-lg text-sm font-semibold transition-colors " +
              (dong === "ALL"
                ? "bg-[#721FE5] text-white"
                : "bg-muted text-foreground hover:bg-muted/80")
            }
          >
            총괄
          </button>
          {DONG_LAYOUTS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setDong(r.key)}
              className={
                "px-4 py-2 rounded-lg text-sm font-semibold transition-colors " +
                (dong === r.key
                  ? "bg-[#721FE5] text-white"
                  : "bg-muted text-foreground hover:bg-muted/80")
              }
            >
              {r.label}
            </button>
          ))}
        </div>

        {dong === "ALL" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {DONG_LAYOUTS.map((dl) => {
              // A/B/C동은 원본 크기, D/E동만 작게(0.3배)
              const scale = dl.key === "D" || dl.key === "E" ? 0.3 : 1;
              const boxW = Math.round(dl.width * scale);
              const boxH = Math.round(dl.height * scale);
              // C동은 B동 아래(우측 열)로
              const colClass = dl.key === "C" ? "md:col-start-2" : "";
              return (
                <div
                  key={dl.key}
                  className={`rounded-xl border bg-slate-50 p-3 shrink-0 cursor-pointer ${colClass}`}
                  onClick={() => setDong(dl.key)}
                >
                  <div className="text-sm font-bold text-slate-800 mb-2 flex items-center justify-between gap-3">
                    <span>{dl.label}</span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {dl.zones.length}칸
                    </span>
                  </div>
                  <div
                    className="relative overflow-hidden"
                    style={{ width: boxW, height: boxH }}
                  >
                    <div
                      className="relative"
                      style={{
                        width: dl.width,
                        height: dl.height,
                        transform: `scale(${scale})`,
                        transformOrigin: "top left",
                      }}
                    >
                      {dl.lineLabels.map((lb, i) => (
                        <div
                          key={`all-ll-${dl.key}-${i}`}
                          className="absolute pointer-events-none text-[10px] font-semibold text-slate-600"
                          style={lb.style}
                        >
                          {lb.text}
                        </div>
                      ))}
                      {dl.zones.map((z) => {
                        const assigned = Boolean(data[z.id]);
                        return (
                          <button
                            key={z.id}
                            type="button"
                            title={makeTooltip(z)}
                            className={
                              "absolute flex items-center justify-center rounded border text-center px-0.5 " +
                              (assigned
                                ? "border-blue-700 bg-blue-50"
                                : "border-slate-500 bg-white")
                            }
                            style={z.style}
                          >
                            {assigned ? (
                              <span className="font-semibold text-[10px] leading-tight tabular-nums text-blue-900">
                                {data[z.id]}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
        <div className="w-full overflow-auto pb-2" style={{ maxHeight: "calc(100vh - 240px)" }}>
          <div
            className="relative rounded-xl border bg-slate-50 shrink-0"
            style={{
              height: current.height,
              width: current.width,
              minWidth: current.width,
              minHeight: current.height,
            }}
          >
            {current.lineLabels.map((lb, i) => (
              <div
                key={`ll-${i}`}
                className={
                  "absolute pointer-events-none " +
                  (lb.style.height
                    ? "text-[10px] font-bold text-slate-500 leading-none"
                    : "text-[11px] font-semibold text-slate-700")
                }
                style={lb.style}
              >
                {lb.text}
              </div>
            ))}

            {current.zones.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                {current.label} 라인 배치 대기
              </div>
            ) : null}

            {current.zones.map((z) => {
              const assigned = Boolean(data[z.id]);
              const isL7 = z.line === 7;
              const display = assigned ? data[z.id] : "";
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => openAssign(z.id)}
                  title={makeTooltip(z)}
                  className={
                    "absolute flex items-center justify-center rounded border text-center px-0.5 transition-colors " +
                    (assigned
                      ? isL7
                        ? "border-orange-600 bg-orange-50"
                        : "border-blue-700 bg-blue-50"
                      : "border-slate-500 bg-white hover:bg-sky-50 hover:border-blue-500")
                  }
                  style={z.style}
                >
                  {assigned ? (
                    <span
                      className={
                        "font-semibold text-[10px] leading-tight tabular-nums " +
                        (isL7 ? "text-orange-900" : "text-blue-900")
                      }
                    >
                      {display}
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-300 leading-none">·</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" className="bg-green-600 hover:bg-green-700" onClick={saveData}>
            <Save className="w-4 h-4 mr-1.5" />
            저장
          </Button>
          <Button type="button" variant="destructive" onClick={resetData}>
            <RotateCcw className="w-4 h-4 mr-1.5" />
            초기화
          </Button>
          <Button type="button" variant="secondary" onClick={exportJSON}>
            <Download className="w-4 h-4 mr-1.5" />
            JSON 내보내기
          </Button>
          {saveMsg ? (
            <span className="text-sm text-green-700 font-medium">{saveMsg}</span>
          ) : null}
        </div>
      </div>

      {dong === "A" ? (
        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold">
            미배치 ({A_UNPLACED.length}건) — 순위·분류 · B/C동 참고
          </h3>
          <div className="overflow-auto max-h-80 border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr className="text-left">
                  <th className="p-2">순위</th>
                  <th className="p-2">제품번호</th>
                  <th className="p-2">1개월박스</th>
                  <th className="p-2">분류</th>
                  <th className="p-2">제품명</th>
                  <th className="p-2">로케이션</th>
                  <th className="p-2">현재고</th>
                </tr>
              </thead>
              <tbody>
                {A_UNPLACED.map((u) => (
                  <tr key={`${u.rank}-${u.barcode}-${u.pnum}`} className="border-t">
                    <td className="p-2 tabular-nums">{u.rank}</td>
                    <td className="p-2 font-semibold tabular-nums">{u.pnum}</td>
                    <td className="p-2 tabular-nums">{u.boxes}</td>
                    <td className="p-2">{u.category_lg || u.cat}</td>
                    <td className="p-2 max-w-[280px] truncate" title={u.master_name || u.name}>
                      {u.master_name || u.name}
                    </td>
                    <td className="p-2 font-mono text-[10px]">{u.loc}</td>
                    <td className="p-2 tabular-nums">{u.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {A_SLOT_CONFLICTS.length > 0 ? (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 space-y-1">
              {A_SLOT_CONFLICTS.map((c) => (
                <div key={c.slot}>
                  slot {c.slot} → {c.zone}: {c.note}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {currentZone ? `${currentZone} 제품 배정` : "제품 배정"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="prod-assign">제품 번호 또는 이름</Label>
            <Input
              id="prod-assign"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="예: 663 / 모던 3단 화이트"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">비우고 확인하면 배정이 해제됩니다.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button type="button" onClick={confirmAssign}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}