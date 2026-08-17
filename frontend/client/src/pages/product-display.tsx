/**
 * 제품 배치도 (A~E동)
 * - A동 좌→우: 6·5·4·3·2·1 (우측=1번)
 * - 밀착 2-3·4-5 / 통로 1|2·3|4·5|6
 * - L1-L6: 1칸 1품목 (지그재그, 동일분류 묶음)
 * - L7: 8칸, 바퀴 슬림 서랍장만 1칸에 2품목씩
 * - 호버 툴팁: 분류(대분류/중분류) + 상세 제품명 + 현재고
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Download, RotateCcw, Save, Search } from "lucide-react";
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
import { B_PNUM_INFO, B_RANK_PLACEMENT } from "@/pages/product-display-b-data";
import { C_PNUM_INFO, C_RANK_PLACEMENT } from "@/pages/product-display-c-data";
import { D_PNUM_INFO, D_RANK_PLACEMENT } from "@/pages/product-display-d-data";
import { aShiftInsert, extractDansu, groupShiftInsert, reorderInZone } from "@/pages/product-display-utils";

const STORAGE_KEY = "vf_product_display_v1";
/** 배치 데이터 스키마 버전 — v14(A동 전용)는 v15(전 동)로 대체됨: 옛 데이터 무시 */
const SAVED_VERSION = "rank-a-v15";
/** 동적 레이아웃(칸 좌표) 저장 키 */
const LAYOUT_KEY = "vf_product_display_layout_v1";
const LAYOUT_VERSION = "layout-v1";
/** 임시 보관함(staging) 저장 키 — data와 완전 분리 (사용자 의도적 보관 버퍼) */
const STAGING_KEY = "vf_product_display_staging_v1";
const STAGING_VERSION = "staging-v1";

/** 드래그 소스: A동=칸(zoneId), B/C/D=칸 내 품목 인덱스, staging=임시 보관함 */
type DragSource = {
  kind: "zone" | "overflow" | "cell" | "staging";
  zoneId: string;
  itemIdx: number; // 다품목 칸 내 인덱스 (A동은 0)
  pnum: string;
};

/** A동 shift로 밀려나 배치를 못 하는 품목 (우측 패널 표시 → 사용자 결정) */
type OverflowItem = {
  pnum: string;
  name: string;
  dansu: string;
  fromZone: string;
};

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
const B_BUILT = buildBlockLayout("B", B_BLOCKS);

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

const D_BUILT = buildDDongLayout("D");

const C_BUILT = buildCDongLayout("C");

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
    width: D_BUILT.width,
    height: D_BUILT.height,
    zones: D_BUILT.zones,
    lineLabels: D_BUILT.lineLabels,
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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 스키마 버전이 현재와 다르면(옛 데이터) 무시 → 기본값(전 동) 사용
      if (parsed && parsed.__v === SAVED_VERSION && parsed.data && typeof parsed.data === "object") {
        return parsed.data as PlacementMap;
      }
    }
  } catch {
    /* 손상 시 기본값 */
  }
  return defaultAPlacement();
}

/** 임시 보관함 로드 — 손상/버전 불일치 시 빈 배열 */
function loadStaging(): string[] {
  try {
    const raw = localStorage.getItem(STAGING_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.__v === STAGING_VERSION && Array.isArray(parsed.items)) {
        return parsed.items.filter((x: unknown) => typeof x === "string" && x.trim() !== "");
      }
    }
  } catch {
    /* 손상 시 빈 배열 */
  }
  return [];
}

export default function ProductDisplayPage() {
  const [dong, setDong] = useState<DongKey>("ALL");
  const [data, setData] = useState<PlacementMap>(() => loadPlacement());
  const [modalOpen, setModalOpen] = useState(false);
  const [currentZone, setCurrentZone] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  // 총괄 우측 패널: 배치/미배치 대분류별 목록 + 선택 상세
  const [panelTab, setPanelTab] = useState<"placed" | "unplaced" | "overflow">("placed");
  const [selPnum, setSelPnum] = useState<string | null>(null);
  const [selZone, setSelZone] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  // 검색 결과로 이동한 슬롯 (깜박임 표시)
  const [flashZone, setFlashZone] = useState<string | null>(null);
  // 출고 이력: barcode → dailyData (최근 90일)
  const [outboundMap, setOutboundMap] = useState<Record<string, { date: string; quantity: number }[]>>({});
  // 드래그앤드롭: 현재 드래그 소스 / 밀려난 품목(자리이탈) / 분류·단수 필터
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [overflow, setOverflow] = useState<OverflowItem[]>([]);
  // 임시 보관함: 사용자 의도적 보관 버퍼 (unique 배열, 동 무관 전역) — 별도 키로 영속
  const [staging, setStaging] = useState<string[]>(() => loadStaging());
  const [filterCat, setFilterCat] = useState("");
  const [filterDansu, setFilterDansu] = useState("");
  // 수정 모드: 그리드 편집 (개별/영역 선택 → 그룹 위/아래 이동)
  const [editMode, setEditMode] = useState(false);
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  // 그리드 여유 공간 (확장 버튼으로 필요할 때만 증가, 기본 0 = 현재 그리드만 표시)
  const [gridPad, setGridPad] = useState({ t: 0, r: 0, b: 0, l: 0 });
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [selRect, setSelRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const selStartRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  // 동적 레이아웃: 칸(슬롯) 좌표 이동 반영 (초기값 = localStorage 저장분 or DONG_LAYOUTS)
  const [layoutState, setLayoutState] = useState(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.__v === LAYOUT_VERSION && Array.isArray(parsed.layout) && parsed.layout.length === DONG_LAYOUTS.length) {
          return parsed.layout as typeof DONG_LAYOUTS;
        }
      }
    } catch {
      /* 손상 시 기본값 */
    }
    return DONG_LAYOUTS.map((d) => ({ ...d, zones: d.zones.map((z) => ({ ...z, style: { ...z.style } })) }));
  });
  // 레이아웃(칸 좌표) 자동 저장
  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ __v: LAYOUT_VERSION, layout: layoutState }));
    } catch {
      /* 용량/오류 무시 */
    }
  }, [layoutState]);
  // 임시 보관함 자동 저장 (data와 분리 — persistLocal이 덮어쓰지 않음)
  useEffect(() => {
    try {
      localStorage.setItem(STAGING_KEY, JSON.stringify({ __v: STAGING_VERSION, items: staging }));
    } catch {
      /* 용량/오류 무시 */
    }
  }, [staging]);
  // 이동 가능 위치 하이라이트: 선택 칸이 존재할 때 다른 칸들에 표시
  const canMoveTo = editMode && selectedZones.length > 0;

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

  // 제품번호 → 로케이션 문자열 (A동 규칙: 320-A1-1-N / 2XXX → 320-A1-2-XX)
  const pnumToLoc = (pn: string): string => {
    const n = parseInt(pn, 10);
    if (Number.isNaN(n)) return "";
    if (n >= 2000) return `320-A1-2-${String(n).slice(1)}`;
    return `320-A1-1-${n}`;
  };

  // 전체 배치된 제품번호 집합 (A동 순위 + B동 + 사용자 배정) — 통합 기준
  const placedPnums = useMemo(() => {
    const s = new Set<string>();
    for (const [, val] of Object.entries(data)) {
      for (const pn of (val || "").split(",").map((x) => x.trim()).filter(Boolean)) {
        s.add(pn);
      }
    }
    return s;
  }, [data]);

  // 통합 미배치: A_UNPLACED에서 어떤 동에든 배치된 제품 제외
  const unplaced = useMemo(
    () => A_UNPLACED.filter((u) => !placedPnums.has(u.pnum)),
    [placedPnums]
  );

  // 검색: 제품명 / 로케이션 / 제품번호 / 바코드
  const searchResults = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    type Hit = {
      pnum: string;
      name: string;
      loc: string;
      zone: string | null;
      dong: DongKey | null;
      placed: boolean;
    };
    const hits: Hit[] = [];
    const seen = new Set<string>();
    const hitOf = (h: Hit) => {
      const key = `${h.placed ? "P" : "U"}-${h.pnum}-${h.zone ?? h.loc}`;
      if (seen.has(key)) return;
      seen.add(key);
      hits.push(h);
    };
    const match = (text: string | undefined) =>
      text ? text.toLowerCase().includes(q) : false;

    // 1) 배치된 제품 (data)
    for (const [zid, val] of Object.entries(data)) {
      for (const pn of (val || "").split(",").map((s) => s.trim()).filter(Boolean)) {
        const binfo = B_PNUM_INFO[pn] || C_PNUM_INFO[pn] || D_PNUM_INFO[pn];
        const name = binfo?.name || A_ZONE_MASTER_NAME[zid] || "";
        const barcode = binfo?.barcode || A_ZONE_BARCODE[zid] || "";
        const loc = pnumToLoc(pn);
        const dong: DongKey = zid.startsWith("B-") ? "B" : zid.startsWith("C-") ? "C" : "A";
        if (match(pn) || match(name) || match(loc) || match(zid) || match(barcode)) {
          hitOf({ pnum: pn, name, loc: loc || zid, zone: zid, dong, placed: true });
        }
      }
    }
    // 2) 미배치 제품 (통합 미배치)
    for (const u of unplaced) {
      const name = u.master_name || u.name || "";
      if (match(u.pnum) || match(name) || match(u.loc) || match(u.barcode)) {
        hitOf({ pnum: u.pnum, name, loc: u.loc, zone: null, dong: null, placed: false });
      }
    }
    return hits.slice(0, 40);
  }, [searchQ, data, unplaced]);

  const gotoSearchHit = (h: (typeof searchResults)[number]) => {
    if (h.placed && h.zone && h.dong) {
      setDong(h.dong);
      setSelPnum(h.pnum);
      setSelZone(h.zone);
      // 깜박임: 먼저 제거 후 재트리거
      setFlashZone(null);
      requestAnimationFrame(() => setFlashZone(h.zone));
      window.setTimeout(() => setFlashZone(null), 8000);
    } else {
      // 미배치 → 총괄 탭 + 미배치 패널 + 선택 상세
      setDong("ALL");
      setPanelTab("unplaced");
      setSelPnum(h.pnum);
      setSelZone(h.loc);
    }
    setSearchQ("");
  };

  const current = useMemo(
    () => layoutState.find((r) => r.key === dong) ?? layoutState[0],
    [dong, layoutState]
  );

  // A동 zone 시퀀스 (물리 순서) — shift 기준
  const aSeq = useMemo(
    () => DONG_LAYOUTS.find((r) => r.key === "A")?.zones.map((z) => z.id) ?? [],
    []
  );

  // 현재 동 배치 품목 정보 (필터/드래그 공용)
  const zoneItems = useMemo(() => {
    const out: Record<string, { pnum: string; name: string; lg: string; dansu: string; idx: number }[]> = {};
    for (const z of current.zones) {
      const val = data[z.id];
      if (!val) continue;
      const pnums = val.split(",").map((s) => s.trim()).filter(Boolean);
      const arr: { pnum: string; name: string; lg: string; dansu: string; idx: number }[] = [];
      pnums.forEach((pn, idx) => {
        const binfo = B_PNUM_INFO[pn] || C_PNUM_INFO[pn] || D_PNUM_INFO[pn];
        const name = binfo?.name || A_ZONE_MASTER_NAME[z.id] || "";
        const lg = binfo?.lg || A_ZONE_CATEGORY_LG[z.id] || "";
        arr.push({ pnum: pn, name, lg, dansu: extractDansu(name), idx });
      });
      out[z.id] = arr;
    }
    return out;
  }, [current.zones, data]);

  // 분류 옵션 (현재 동 배치 품목)
  const filterCats = useMemo(() => {
    const s = new Set<string>();
    for (const arr of Object.values(zoneItems)) {
      for (const it of arr) if (it.lg) s.add(it.lg);
    }
    return Array.from(s).sort();
  }, [zoneItems]);

  // 선택 분류 내 단수 옵션 (숫자 오름차순)
  const filterDansus = useMemo(() => {
    if (!filterCat) return [];
    const s = new Set<string>();
    for (const arr of Object.values(zoneItems)) {
      for (const it of arr) {
        if (it.lg === filterCat && it.dansu) s.add(it.dansu);
      }
    }
    return Array.from(s).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [zoneItems, filterCat]);

  // 필터 매칭 zone (하이라이트용)
  const filterMatchedZones = useMemo(() => {
    if (!filterCat && !filterDansu) return new Set<string>();
    const s = new Set<string>();
    for (const [zid, arr] of Object.entries(zoneItems)) {
      for (const it of arr) {
        if (filterCat && it.lg !== filterCat) continue;
        if (filterDansu && it.dansu !== filterDansu) continue;
        s.add(zid);
      }
    }
    return s;
  }, [zoneItems, filterCat, filterDansu]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (e: DragStartEvent) => {
    const src = e.active.data.current as DragSource | undefined;
    if (src) setDragSource(src);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const src = e.active.data.current as DragSource | undefined;
    if (!src) return;
    const overId = (e.over?.id as string) || "";
    // ── 보관함 드롭존: zone/overflow 소스 → staging으로 이동 ──
    if (overId === "drop-staging" && (src.kind === "zone" || src.kind === "overflow")) {
      setData((prev) => {
        const next = { ...prev };
        const val = next[src.zoneId];
        if (val) {
          const items = val.split(",").map((s) => s.trim()).filter(Boolean);
          if (items.length <= 1) delete next[src.zoneId];
          else next[src.zoneId] = items.filter((x) => x !== src.pnum).join(",");
        }
        setStaging((s) => (s.includes(src.pnum) ? s : [...s, src.pnum]));
        persistLocal(next);
        return next;
      });
      setDragSource(null);
      setSaveMsg("보관함에 넣음");
      window.setTimeout(() => setSaveMsg(""), 1500);
      return;
    }
    // ── staging 소스 → 칸 드롭: 빈 칸=배치, 점유 칸=스왑(칸 제품은 자동 보관) ──
    if (src.kind === "staging") {
      const dst = e.over?.data.current as { zoneId: string; itemIdx?: number } | undefined;
      if (!dst || !dst.zoneId) {
        setDragSource(null);
        return;
      }
      setData((prev) => {
        const next = { ...prev };
        const cur = next[dst.zoneId];
        if (cur) {
          const curPns = cur.split(",").map((s) => s.trim()).filter(Boolean).filter((x) => x !== src.pnum);
          // 칸 제품 → staging (스왑)
          setStaging((s) => Array.from(new Set([...s.filter((x) => x !== src.pnum), ...curPns])));
          const isA = dst.zoneId.startsWith("A-");
          if (isA) {
            // A동 1칸 1품목: 교체
            next[dst.zoneId] = src.pnum;
          } else {
            next[dst.zoneId] = curPns.includes(src.pnum) ? curPns.join(",") : [...curPns, src.pnum].join(",");
          }
        } else {
          next[dst.zoneId] = src.pnum;
          setStaging((s) => s.filter((x) => x !== src.pnum));
        }
        persistLocal(next);
        return next;
      });
      setDragSource(null);
      setSaveMsg("보관함에서 배치");
      window.setTimeout(() => setSaveMsg(""), 1500);
      return;
    }
    // 수정 모드 칸(슬롯) 이동: 드래그로 자유 좌표 배치 또는 다른 칸과 교환
    if (src.kind === "cell") {
      if (overId.startsWith("drop-")) {
        // 다른 칸 위에 놓음 → 두 칸 좌표 교환 (swap)
        const dstZoneId = overId.slice(5);
        if (dstZoneId !== src.zoneId) {
          moveSlotTo(src.zoneId, dstZoneId);
          setSaveMsg("칸 위치 교환");
          window.setTimeout(() => setSaveMsg(""), 1500);
        }
      } else {
        // 빈 공간에 놓음 → 드래그 최종 위치로 자유 배치
        const translated = e.active.rect.current.translated;
        const cont = gridRef.current?.getBoundingClientRect();
        if (translated && cont) {
          moveCellTo(
            src.zoneId,
            translated.left - cont.left,
            translated.top - cont.top
          );
          setSaveMsg("칸 이동");
          window.setTimeout(() => setSaveMsg(""), 1500);
        }
      }
      setDragSource(null);
      return;
    }
    const dst = e.over?.data.current as { zoneId: string; itemIdx?: number } | undefined;
    if (!src || !dst || !dst.zoneId) {
      setDragSource(null);
      return;
    }
    setData((prev) => {
      const next = { ...prev };
      let changed = false;

      if (src.kind === "overflow") {
        // 밀려난 품목 → 대상 칸에 추가 (B/C/D/A 칸 공통: 칸 값 뒤에 덧붙임)
        const dstVal = next[dst.zoneId] || "";
        const items = dstVal.split(",").map((s) => s.trim()).filter(Boolean);
        if (!items.includes(src.pnum)) {
          items.push(src.pnum);
          next[dst.zoneId] = items.join(",");
          changed = true;
        }
        if (changed) {
          setOverflow((ov) => ov.filter((o) => o.pnum !== src.pnum));
          persistLocal(next);
        }
        return next;
      }

      const srcVal = next[src.zoneId];
      if (!srcVal) return prev;
      const srcItems = srcVal.split(",").map((s) => s.trim()).filter(Boolean);
      const srcItem = srcItems[src.itemIdx];
      if (!srcItem || srcItem !== src.pnum) return prev;

      const isA = src.zoneId.startsWith("A-") && dst.zoneId.startsWith("A-");
      if (isA) {
        // A동: 칸 단위 insert (1칸 1품목, A-X는 다품목이지만 칸 단위)
        const { next: n2, overflow: ov } = aShiftInsert(aSeq, prev, src.zoneId, dst.zoneId);
        if (n2 !== prev) {
          if (ov.length) {
            setOverflow((o) => {
              const names = ov.map((pn) => {
                const m = A_ZONE_MASTER_NAME[src.zoneId] || "";
                return { pnum: pn, name: m, dansu: extractDansu(m), fromZone: dst.zoneId };
              });
              return [...o, ...names];
            });
          }
          persistLocal(n2);
          return n2;
        }
        return prev;
      }
        // B/C/D 또는 A↔다른동: 칸 내부 재정렬 or 대상 칸 추가
        if (src.zoneId === dst.zoneId) {
          // 같은 칸 내부 순서 변경
          const toIdx = (dst.itemIdx ?? src.itemIdx);
          const reordered = reorderInZone(srcVal, src.itemIdx, toIdx);
          if (reordered !== srcVal) {
            next[src.zoneId] = reordered;
            changed = true;
          }
        } else {
          // 다른 칸으로: 소스에서 제거 + 대상에 추가
          const filtered = srcItems.filter((_, i) => i !== src.itemIdx);
          const dstVal = next[dst.zoneId] || "";
          const dstItems = dstVal.split(",").map((s) => s.trim()).filter(Boolean);
          dstItems.push(srcItem);
          if (filtered.length) next[src.zoneId] = filtered.join(",");
          else delete next[src.zoneId];
          next[dst.zoneId] = dstItems.join(",");
          changed = true;
        }
      if (changed) persistLocal(next);
      return next;
    });
    setDragSource(null);
  };

  // ---- 수정 모드: 그룹 이동 + 영역 선택 ----
  const curSeq = useMemo(() => current.zones.map((z) => z.id), [current]);

  const groupMove = (dir: 1 | -1) => {
    if (!selectedZones.length || !editMode) return;
    const { next: n2, overflow: ov } = groupShiftInsert(curSeq, data, selectedZones, dir);
    if (n2 !== data) {
      setData(n2);
      if (ov.length) {
        setOverflow((o) => {
          const names = ov.map((pn) => {
            const m = A_ZONE_MASTER_NAME[selectedZones[0]] || "";
            return { pnum: pn, name: m, dansu: extractDansu(m), fromZone: selectedZones[0] };
          });
          return [...o, ...names];
        });
      }
      persistLocal(n2);
    }
  };

  const handleSelDown = (e: React.PointerEvent) => {
    if (!editMode) return;
    // 셀(button)에서 시작하면 셀 클릭 처리로 위임
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    selStartRef.current = { x: e.clientX, y: e.clientY, cx: rect.left, cy: rect.top };
    setSelRect({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY });
  };

  const handleSelMove = (e: React.PointerEvent) => {
    if (!selStartRef.current) return;
    setSelRect((r) => (r ? { ...r, x2: e.clientX, y2: e.clientY } : r));
  };

  const handleSelUp = () => {
    const s = selStartRef.current;
    if (!s || !selRect) {
      selStartRef.current = null;
      setSelRect(null);
      return;
    }
    const x1 = Math.min(selRect.x1, selRect.x2);
    const y1 = Math.min(selRect.y1, selRect.y2);
    const x2 = Math.max(selRect.x1, selRect.x2);
    const y2 = Math.max(selRect.y1, selRect.y2);
    const hits: string[] = [];
    document.querySelectorAll<HTMLElement>("[data-zone-id]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1) {
        hits.push(el.dataset.zoneId as string);
      }
    });
    setSelectedZones(hits);
    selStartRef.current = null;
    setSelRect(null);
  };

  // 슬롯(칸) 좌표 이동: 선택 칸과 목적지 칸의 좌표를 교환 (그리드에서 칸 자체가 이동)
  const moveSlotTo = (srcId: string, dstId: string) => {
    if (srcId === dstId) return;
    setLayoutState((prev) =>
      prev.map((d) => {
        if (d.key !== dong) return d;
        const srcIdx = d.zones.findIndex((z) => z.id === srcId);
        const dstIdx = d.zones.findIndex((z) => z.id === dstId);
        if (srcIdx < 0 || dstIdx < 0) return d;
        const zones = d.zones.map((z) => ({ ...z, style: { ...z.style } }));
        const sStyle = zones[srcIdx].style;
        const dStyle = zones[dstIdx].style;
        zones[srcIdx] = { ...zones[srcIdx], style: { ...dStyle } };
        zones[dstIdx] = { ...zones[dstIdx], style: { ...sStyle } };
        return { ...d, zones };
      })
    );
  };

  // 칸(슬롯)을 빈 공간의 자유 좌표로 이동 (드래그 배치)
  const moveCellTo = (zid: string, left: number, top: number) => {
    setLayoutState((prev) =>
      prev.map((d) => {
        if (d.key !== dong) return d;
        const zones = d.zones.map((z) =>
          z.id === zid
            ? { ...z, style: { ...z.style, left: Math.round(left), top: Math.round(top) } }
            : z
        );
        return { ...d, zones };
      })
    );
  };

  // 새 빈 칸 추가: 그리드 오른쪽 끝에 생성 (이후 드래그로 원하는 위치에 배치)
  const addCell = () => {
    setLayoutState((prev) =>
      prev.map((d) => {
        if (d.key !== dong) return d;
        const maxLeft = Math.max(...d.zones.map((z) => Number(z.style.left ?? 0)), 0);
        const maxTop = Math.max(...d.zones.map((z) => Number(z.style.top ?? 0)), 0);
        const id = `${d.key}-NEW-${Date.now().toString().slice(-5)}`;
        const zone: ZoneDef = {
          id,
          num: "＋",
          line: -1,
          showNumAsProduct: false,
          style: {
            left: maxLeft + SLOT.w + SLOT.lineGap,
            top: Math.round(maxTop / 2),
            width: SLOT.w,
            height: SLOT.h,
          },
        };
        return { ...d, zones: [...d.zones, zone] };
      })
    );
    setSaveMsg("빈 칸 추가됨 — 드래그로 위치 이동");
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  // 그리드 여유 공간 확장 (상/하/좌/우 필요할 때만)
  const expandGrid = (dir: "t" | "r" | "b" | "l") => {
    setGridPad((p) => ({ ...p, [dir]: p[dir] + 40 }));
  };

  // ═══ 임시 보관함 (Staging) ═══
  // 선택 칸의 제품을 보관함으로 이동 (data에서 제거, staging에 unique 추가)
  const stageSelected = () => {
    const zones = selectedZones;
    if (!zones.length) return;
    setData((prev) => {
      const next = { ...prev };
      const toStage: string[] = [];
      for (const zid of zones) {
        const val = next[zid];
        if (!val) continue;
        for (const pn of val.split(",").map((s) => s.trim()).filter(Boolean)) {
          if (!toStage.includes(pn)) toStage.push(pn);
        }
        delete next[zid];
      }
      if (toStage.length) {
        setStaging((s) => Array.from(new Set([...s, ...toStage])));
      }
      persistLocal(next);
      return next;
    });
    setSelectedZones([]);
    setSaveMsg("보관함에 넣음");
    window.setTimeout(() => setSaveMsg(""), 1500);
  };

  // 보관함 비우기 (배치 data는 유지 — staging만 제거)
  const clearStaging = () => {
    setStaging([]);
    setSaveMsg("보관함 비움");
    window.setTimeout(() => setSaveMsg(""), 1500);
  };

  // 보관함 항목 제거 (미배치로 반환)
  const stagingToUnplaced = (pn: string) => {
    setStaging((s) => s.filter((x) => x !== pn));
  };

  // 보관함 드롭존 (B/C/D 품목 드래그 → 보관함)
  const { setNodeRef: stagingDropRef, isOver: stagingIsOver } = useDroppable({
    id: "drop-staging",
    data: { kind: "staging" },
  });

  // 라인(열) 단위 좌표 교환: 선택 그룹 라인 ↔ 목적지 칸의 라인 (칸 수 동일할 때)
  const moveGroupTo = (groupIds: string[], dstId: string) => {
    const lineOf = (id: string) => id.match(/L(\d+)/)?.[1] ?? "";
    const gLines = new Set(groupIds.map(lineOf));
    const dstLine = lineOf(dstId);
    if (gLines.size !== 1 || !dstLine || gLines.has(dstLine)) return; // 같은 라인 or 비라인 그룹은 무시
    const srcLine = [...gLines][0];
    setLayoutState((prev) =>
      prev.map((d) => {
        if (d.key !== dong) return d;
        const srcZones = d.zones.filter((z) => lineOf(z.id) === srcLine);
        const dstZones = d.zones.filter((z) => lineOf(z.id) === dstLine);
        if (srcZones.length === 0 || srcZones.length !== dstZones.length) return d; // 칸 수 불일치 → 이동 불가
        const zones = d.zones.map((z) => ({ ...z, style: { ...z.style } }));
        for (let i = 0; i < srcZones.length; i++) {
          const sIdx = zones.findIndex((z) => z.id === srcZones[i].id);
          const dIdx = zones.findIndex((z) => z.id === dstZones[i].id);
          if (sIdx < 0 || dIdx < 0) continue;
          const sStyle = zones[sIdx].style;
          zones[sIdx] = { ...zones[sIdx], style: { ...zones[dIdx].style } };
          zones[dIdx] = { ...zones[dIdx], style: { ...sStyle } };
        }
        return { ...d, zones };
      })
    );
  };

  // 새 라인 추가 (A동 등 라인 구조 동): 최대 라인 번호 +1, 오른쪽에 빈 슬롯 count개 생성
  const addLine = () => {
    setLayoutState((prev) =>
      prev.map((d) => {
        if (d.key !== dong) return d;
        // id 기준 라인 번호 (X1/X2 등 특수 칸 제외 — 실제 슬롯 라인만)
        const lineNos = [
          ...new Set(
            d.zones
              .map((z) => z.id.match(/L(\d+)/)?.[1])
              .filter((n): n is string => !!n)
              .map(Number)
              .filter((n) => n >= 1)
          ),
        ];
        if (lineNos.length === 0) return d; // 라인 구조 없는 동은 미지원
        const newLine = Math.max(...lineNos) + 1;
        const refZones = d.zones.filter((z) => z.line === Math.max(...lineNos) && /L\d+/.test(z.id));
        const count = refZones.length || 19;
        const maxLeft = Math.max(...d.zones.map((z) => Number(z.style.left ?? 0)));
        const colLeft = maxLeft + SLOT.w + SLOT.lineGap;
        const newZones = Array.from({ length: count }, (_, i) => ({
          id: `${d.key}-L${newLine}-${i + 1}`,
          num: `${newLine}-${i + 1}`,
          line: newLine,
          showNumAsProduct: false,
          style: {
            left: colLeft,
            top: SLOT.padT + (count - 1 - i) * (SLOT.h + SLOT.gapY),
            width: SLOT.w,
            height: SLOT.h,
          } as CSSProperties,
        }));
        const newLabel: LineLabel = {
          text: `${newLine}번`,
          style: { left: colLeft - 4, top: 10, width: SLOT.w + 8, textAlign: "center" },
        };
        return {
          ...d,
          zones: [...d.zones, ...newZones],
          lineLabels: [...d.lineLabels, newLabel],
          width: colLeft + SLOT.w + SLOT.padR,
        };
      })
    );
  };

  // 수정 모드 셀 클릭: 선택 없음 → 선택 / 선택 칸 → 해제 / 다른 칸(1개 선택 시) → 슬롯 좌표 이동
  const handleCellClick = (zid: string) => {
    if (!editMode) return;
    if (selectedZones.length === 0) {
      setSelectedZones([zid]);
    } else if (selectedZones.includes(zid)) {
      setSelectedZones([]);
    } else if (selectedZones.length === 1) {
      moveSlotTo(selectedZones[0], zid);
      setSelectedZones([]);
    } else {
      // 다중 선택(라인 그룹): 목적지 라인과 좌표 교환
      moveGroupTo(selectedZones, zid);
      setSelectedZones([]);
    }
  };

  const persistLocal = (d: PlacementMap) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ __v: "rank-a-v15", data: d }));
  };
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
      JSON.stringify({ __v: "rank-a-v15", data })
    );
    setSaveMsg("저장되었습니다.");
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  const resetData = () => {
    if (!window.confirm("A동을 초기 배치로 되돌릴까요? (B/C/D동 배치는 유지됩니다)")) return;
    const defaults = defaultAPlacement();
    // A동만 기본값으로, B/C/D동은 현재 사용자 배치 유지
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(defaults)) {
      if (k.startsWith("A-")) next[k] = v;
    }
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith("A-")) next[k] = v;
    }
    setData(next);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ __v: "rank-a-v15", data: next })
    );
    setSaveMsg("A동만 초기화했습니다.");
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

  // 툴팁 생성: A동=zone 기반(분류+제품명+현재고+출고), B동=pnum 기반(3품목 모두 표시)
  const makeTooltip = (z: ZoneDef): string => {
    const zid = z.id;
    const isL7 = z.line === 7;
    const posName = zid.replace(/^(A-L|B-)/, "");
    const parts: string[] = [posName];

    const assigned = data[zid] || "";
    const pnums = assigned ? assigned.split(",").map((s) => s.trim()).filter(Boolean) : [];

    if (zid.startsWith("B-") || zid.startsWith("C-") || zid.startsWith("D-")) {
      // B/C/D동: 한 칸 다품목 → 각 품목 정보 나열
      if (pnums.length === 0) {
        return parts.join("\n");
      }
      for (const pn of pnums) {
        const info = B_PNUM_INFO[pn] || C_PNUM_INFO[pn] || D_PNUM_INFO[pn];
        if (info) {
          const sub = [`${pn}: ${info.name}`];
          if (info.lg || info.md) sub.push(`분류: ${info.lg}${info.md ? " / " + info.md : ""}`);
          if (info.stock !== null && info.stock !== undefined) sub.push(`재고: ${info.stock}`);
          if (info.barcode) {
            const ob4d = calcOutbound4d(info.barcode);
            if (ob4d !== null) sub.push(`출고 4일치: ${ob4d}박스`);
          }
          parts.push(sub.join("\n"));
        } else {
          parts.push(`${pn}: (정보 없음)`);
        }
      }
      return parts.join("\n\n");
    }

    // A동: 기존 zone 기반
    const masterName = A_ZONE_MASTER_NAME[zid] || "";
    const catLg = A_ZONE_CATEGORY_LG[zid] || "";
    const catMd = A_ZONE_CATEGORY_MD[zid] || "";
    const stock = A_ZONE_STOCK[zid];
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
      parts.push("7번 라인 (슬림서랍장·칵투스)");
    }
    return parts.join("\n");
  };

  return (
    <div className="space-y-4 w-full max-w-none">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground mb-3">
          A동 · 지그재그 배치(1-1=1, 2-1=2) · 동일 분류 묶음 ·
          7번=슬림서랍장 위주+칵투스(1칸 1품목) · A-X1/2=2품목 · 호버 시 분류·제품명·재고 표시
        </p>
        <p className="text-base font-bold text-slate-800 mb-3">
          배치 {placedPnums.size} / {A_TOTAL_PRODUCTS}
          <span className="text-sm font-bold text-red-600 ml-2">
            미배치 {unplaced.length}
          </span>
        </p>

        {/* 제품 위치 검색: 제품명 / 로케이션 / 제품번호 / 바코드 */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="제품명 · 로케이션(320-A1-1-111) · 제품번호 · 바코드 검색"
            className="pl-8"
          />
          {searchQ.trim() && (
            <div className="absolute z-20 mt-1 w-full max-h-80 overflow-auto rounded-md border bg-white shadow-lg">
              {searchResults.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">검색 결과 없음</div>
              ) : (
                searchResults.map((h, i) => (
                  <button
                    key={`${h.placed ? "P" : "U"}-${h.pnum}-${h.zone ?? h.loc}-${i}`}
                    type="button"
                    onClick={() => gotoSearchHit(h)}
                    className="w-full text-left px-3 py-1.5 text-[11px] border-b last:border-b-0 hover:bg-sky-50 flex items-center justify-between gap-2"
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="font-semibold tabular-nums">{h.pnum} · {h.name || "-"}</span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        {h.placed ? `위치 ${h.dong}동 ${h.zone}` : `미배치 · 로케이션 ${h.loc}`}
                      </span>
                    </span>
                    <span
                      className={
                        "shrink-0 text-[10px] px-1.5 py-0.5 rounded " +
                        (h.placed
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800")
                      }
                    >
                      {h.placed ? "배치" : "미배치"}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

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

        {/* 분류·단수 필터 (드래그 재배치용) — E동/총괄 제외 */}
        {dong !== "ALL" && dong !== "E" && (
          <div className="flex flex-wrap items-center gap-2 mb-3 rounded-lg border bg-slate-50 px-3 py-2">
            <span className="text-[11px] font-bold text-slate-600">필터</span>
            <select
              value={filterCat}
              onChange={(e) => {
                setFilterCat(e.target.value);
                setFilterDansu("");
              }}
              className="h-7 rounded border bg-white px-2 text-xs"
            >
              <option value="">전체 분류</option>
              {filterCats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {filterCat && (
              <select
                value={filterDansu}
                onChange={(e) => setFilterDansu(e.target.value)}
                className="h-7 rounded border bg-white px-2 text-xs"
              >
                <option value="">전체 단수</option>
                {filterDansus.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
            {(filterCat || filterDansu) && (
              <button
                type="button"
                onClick={() => {
                  setFilterCat("");
                  setFilterDansu("");
                }}
                className="h-7 rounded bg-muted px-2 text-xs font-semibold hover:bg-muted/70"
              >
                초기화
              </button>
            )}
            {filterMatchedZones.size > 0 && (
              <span className="text-[11px] text-emerald-700 font-semibold">
                {filterMatchedZones.size}칸 매칭 — 초록 테두리 칸을 드래그해 이동하세요
              </span>
            )}
          </div>
        )}

        {dong === "ALL" ? (
          <div className="flex flex-wrap gap-3 items-start">
            {(() => {
              const renderCard = (
                k: DongKey,
                scale: number,
                wOverride?: number,
                hOverride?: number
              ) => {
                const dl = DONG_LAYOUTS.find((r) => r.key === k)!;
                const boxW = wOverride ?? Math.round(dl.width * scale);
                const boxH = hOverride ?? Math.round(dl.height * scale);
                return (
                  <div
                    key={k}
                    className="rounded-xl border bg-slate-50 p-3 shrink-0 cursor-pointer w-fit"
                    onClick={() => setDong(k)}
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
                          <div key={`all-ll-${k}-${i}`} className="absolute pointer-events-none text-[10px] font-semibold text-slate-600" style={lb.style}>
                            {lb.text}
                          </div>
                        ))}
                        {dl.zones.map((z) => {
                          const assigned = Boolean(data[z.id]);
                          const display = assigned ? data[z.id] : "";
                          const items = display ? display.split(",").map((s) => s.trim()).filter(Boolean) : [];
                          return (
                            <button
                              key={z.id}
                              type="button"
                              title={makeTooltip(z)}
                              className={
                                "absolute flex items-center justify-center rounded border text-center px-0.5 " +
                                (assigned ? "border-blue-700 bg-blue-50" : "border-slate-500 bg-white") +
                                (flashZone === z.id ? " vf-zone-flash" : "")
                              }
                              style={z.style}
                            >
                              {assigned ? (
                                <span
                                  className={
                                    "font-semibold text-[10px] leading-tight tabular-nums text-blue-900" +
                                    (items.length > 1 ? " flex flex-col items-center text-[8px] leading-[1.15]" : "")
                                  }
                                >
                                  {items.length > 1
                                    ? items.map((it, i) => <span key={i}>{it}</span>)
                                    : display}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              };
              return (
                <>
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
                  {/* 제일 우측: 배치/미배치 대분류별 목록 + 상세 */}
                  <div className="rounded-xl border bg-card p-3 shrink-0 w-[340px] flex flex-col gap-2">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => { setPanelTab("placed"); setSelPnum(null); setSelZone(null); }}
                        className={
                          "flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors " +
                          (panelTab === "placed" ? "bg-[#721FE5] text-white" : "bg-muted text-foreground hover:bg-muted/80")
                        }
                      >
                        배치 내역
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPanelTab("unplaced"); setSelPnum(null); setSelZone(null); }}
                        className={
                          "flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors " +
                          (panelTab === "unplaced"
                            ? "bg-red-600 text-white"
                            : "bg-red-50 text-red-700 hover:bg-red-100")
                        }
                      >
                        미배치 내역 ({unplaced.length})
                      </button>
                      {overflow.length > 0 && (
                        <button
                          type="button"
                          onClick={() => { setPanelTab("overflow"); setSelPnum(null); setSelZone(null); }}
                          className={
                            "flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors " +
                            (panelTab === "overflow"
                              ? "bg-amber-500 text-white"
                              : "bg-amber-50 text-amber-700 hover:bg-amber-100")
                          }
                        >
                          자리이탈 ({overflow.length})
                        </button>
                      )}
                    </div>
                    {panelTab === "placed" ? (
                      <div className="overflow-auto max-h-[560px] space-y-1 pr-1">
                        {(() => {
                          // 배치된 제품: data에서 zone → pnum 수집 → 대분류 그룹
                          const groups: Record<string, { pnum: string; name: string; stock: number | null; lg: string; md: string; zone: string }[]> = {};
                          for (const [zid, val] of Object.entries(data)) {
                            const pnums = val.split(",").map((s) => s.trim()).filter(Boolean);
                            for (const pn of pnums) {
                              const info = B_PNUM_INFO[pn] || C_PNUM_INFO[pn] || D_PNUM_INFO[pn];
                              const lg = info ? info.lg : (A_ZONE_CATEGORY_LG[zid] || "기타");
                              const md = info ? info.md : (A_ZONE_CATEGORY_MD[zid] || "");
                              const name = info ? info.name : (A_ZONE_MASTER_NAME[zid] || "");
                              const stock = info ? info.stock : (A_ZONE_STOCK[zid] ?? null);
                              if (!groups[lg]) groups[lg] = [];
                              groups[lg].push({ pnum: pn, name, stock, lg, md, zone: zid });
                            }
                          }
                          const keys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
                          return keys.map((lg) => (
                            <div key={lg} className="border rounded-md overflow-hidden">
                              <div className="bg-muted px-2 py-1 text-[11px] font-bold flex justify-between">
                                <span>{lg}</span>
                                <span className="text-muted-foreground">{groups[lg].length}품목</span>
                              </div>
                              <div className="max-h-40 overflow-auto">
                                {groups[lg].map((g) => (
                                  <button
                                    key={`${g.zone}-${g.pnum}`}
                                    type="button"
                                    onClick={() => { setSelPnum(g.pnum); setSelZone(g.zone); }}
                                    className={
                                      "w-full text-left px-2 py-1 text-[11px] border-t first:border-t-0 hover:bg-sky-50 flex justify-between gap-1 " +
                                      (selPnum === g.pnum && selZone === g.zone ? "bg-sky-100" : "")
                                    }
                                  >
                                    <span className="font-semibold tabular-nums">{g.pnum}</span>
                                    <span className="truncate text-muted-foreground">{g.name || "-"}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : panelTab === "unplaced" ? (
                      <div className="overflow-auto max-h-[560px] space-y-1 pr-1">
                        {(() => {
                          // 미배치: 통합 기준 — A_UNPLACED에서 A/B동+사용자 배정 제외 후 대분류 그룹
                          const groups: Record<string, typeof unplaced> = {};
                          for (const u of unplaced) {
                            const lg = u.category_lg || u.cat || "기타";
                            if (!groups[lg]) groups[lg] = [];
                            groups[lg].push(u);
                          }
                          const keys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
                          return keys.length === 0 ? (
                            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-3 text-center">
                              미배치 제품이 없습니다 🎉
                            </div>
                          ) : keys.map((lg) => (
                            <div key={lg} className="border rounded-md overflow-hidden">
                              <div className="bg-muted px-2 py-1 text-[11px] font-bold flex justify-between">
                                <span>{lg}</span>
                                <span className="text-muted-foreground">{groups[lg].length}품목</span>
                              </div>
                              <div className="max-h-40 overflow-auto">
                                {groups[lg].map((u) => (
                                  <button
                                    key={`${u.barcode}-${u.pnum}`}
                                    type="button"
                                    onClick={() => { setSelPnum(u.pnum); setSelZone(u.loc); }}
                                    className={
                                      "w-full text-left px-2 py-1 text-[11px] border-t first:border-t-0 hover:bg-sky-50 flex justify-between gap-1 " +
                                      (selPnum === u.pnum && selZone === u.loc ? "bg-sky-100" : "")
                                    }
                                  >
                                    <span className="font-semibold tabular-nums">{u.pnum}</span>
                                    <span className="truncate text-muted-foreground">{u.master_name || u.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    ) : (
                      <div className="overflow-auto max-h-[560px] space-y-1 pr-1">
                        {overflow.length === 0 ? (
                          <div className="text-xs text-muted-foreground px-2 py-3 text-center">
                            자리이탈 품목 없음
                          </div>
                        ) : (
                          <>
                            <p className="text-[10px] text-amber-800 bg-amber-50 rounded px-2 py-1 leading-snug">
                              드래그 이동으로 밀려나 배치를 못 하는 품목입니다.
                              <br />① <b>미배치로</b> 보내거나 ② 번호를 <b>드래그</b>해 다른 동 칸에 재배치하세요.
                            </p>
                            {overflow.map((o, oi) => (
                              <div
                                key={`${o.pnum}-${o.fromZone}-${oi}`}
                                className="border rounded-md px-2 py-1.5 flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0">
                                  <div className="text-[11px] font-bold tabular-nums text-amber-900">
                                    <DragChip
                                      zoneId={o.fromZone || "overflow"}
                                      itemIdx={0}
                                      pnum={o.pnum}
                                      text={o.pnum}
                                      kind="overflow"
                                    />
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {o.name} {o.dansu}
                                  </div>
                                  <div className="text-[9px] text-muted-foreground">
                                    이전 위치: {o.fromZone}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOverflow((ov) => ov.filter((x) => x !== o))
                                  }
                                  className="shrink-0 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded hover:bg-amber-200"
                                  title="미배치 상태로 보내기 (이 탭에서 제거)"
                                >
                                  미배치로
                                </button>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                    {selPnum ? (
                      <div className="border rounded-md bg-slate-50 p-2 text-[11px] space-y-1">
                        {panelTab === "placed" && selZone && data[selZone] ? (
                          (() => {
                            const info = B_PNUM_INFO[selPnum] || C_PNUM_INFO[selPnum] || D_PNUM_INFO[selPnum];
                            return (
                              <>
                                <div className="font-bold text-sm text-blue-900">{selPnum}번</div>
                                <div>{info ? info.name : (A_ZONE_MASTER_NAME[selZone] || "-")}</div>
                                <div>분류: {info ? `${info.lg}${info.md ? " / " + info.md : ""}` : (A_ZONE_CATEGORY_LG[selZone] || "-")}</div>
                                <div>재고: {info ? (info.stock ?? "-") : (A_ZONE_STOCK[selZone] ?? "-")}</div>
                                {info?.barcode ? (() => { const ob = calcOutbound4d(info.barcode); return ob !== null ? <div>출고 4일치: {ob}박스</div> : null; })() : null}
                                <div className="text-muted-foreground">위치: {selZone}</div>
                              </>
                            );
                          })()
                        ) : (
                          (() => {
                            const u = unplaced.find((x) => x.pnum === selPnum && x.loc === selZone);
                            if (!u) return null;
                            return (
                              <>
                                <div className="font-bold text-sm text-blue-900">{u.pnum}번</div>
                                <div>{u.master_name || u.name}</div>
                                <div>분류: {u.category_lg || u.cat}{u.category_md ? " / " + u.category_md : ""}</div>
                                <div>1개월 출고: {u.boxes}박스</div>
                                <div>현재고: {u.stock ?? "-"}</div>
                                <div className="text-muted-foreground">로케이션: {u.loc}</div>
                              </>
                            );
                          })()
                        )}
                      </div>
                    ) : null}
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
        <div className="w-full overflow-auto pb-2" style={{ maxHeight: "calc(100vh - 240px)" }}>
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div
            ref={gridRef}
            className="relative rounded-xl border bg-slate-50 shrink-0"
            style={{
              height: current.height + gridPad.t + gridPad.b,
              width: current.width + gridPad.l + gridPad.r,
              minWidth: current.width + gridPad.l + gridPad.r,
              minHeight: current.height + gridPad.t + gridPad.b,
            }}
            onPointerDown={handleSelDown}
            onPointerMove={handleSelMove}
            onPointerUp={handleSelUp}
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

            {current.zones.map((z) => (
              <ZoneCell
                key={z.id}
                z={z}
                value={data[z.id]}
                isL7={z.line === 7}
                matched={filterMatchedZones.has(z.id)}
                flash={flashZone === z.id}
                sel={selZone === z.id}
                editMode={editMode}
                selected={selectedZones.includes(z.id)}
                moveTarget={canMoveTo && !selectedZones.includes(z.id)}
                onOpen={() => openAssign(z.id)}
                onToggleSelect={() => handleCellClick(z.id)}
                tip={makeTooltip(z)}
              />
            ))}
            {editMode && selRect && selStartRef.current ? (
              <div
                className="pointer-events-none absolute z-50"
                style={{
                  left: Math.min(selRect.x1, selRect.x2) - selStartRef.current.cx,
                  top: Math.min(selRect.y1, selRect.y2) - selStartRef.current.cy,
                  width: Math.abs(selRect.x2 - selRect.x1),
                  height: Math.abs(selRect.y2 - selRect.y1),
                  border: "1.5px dashed #721FE5",
                  background: "rgba(114,31,229,0.12)",
                }}
              />
            ) : null}
            <DragOverlay>
              {dragSource ? (
                <div className="rounded border border-blue-600 bg-blue-50 px-2 py-1 text-[11px] font-bold text-blue-900 shadow-md">
                  {dragSource.pnum}
                  {dragSource.kind === "overflow" ? " (자리이탈)" : ""}
                </div>
              ) : null}
            </DragOverlay>
          </div>
          {editMode && (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50/70 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900">📦 임시 보관함 ({staging.length})</span>
                {staging.length > 0 && (
                  <button
                    type="button"
                    onClick={clearStaging}
                    className="text-[10px] text-amber-700 hover:text-red-600"
                    title="보관함 비우기 (배치는 유지)"
                  >
                    비우기
                  </button>
                )}
              </div>
              <div
                ref={stagingDropRef}
                className={
                  "mt-1 min-h-9 rounded border-2 border-dashed p-1 flex flex-wrap gap-1 items-center " +
                  (stagingIsOver ? "border-amber-500 bg-amber-100" : "border-amber-300")
                }
              >
                {staging.length === 0 ? (
                  <span className="text-[10px] text-amber-500">
                    빈 칸 — 품목을 여기에 놓거나, 칸 선택 후 "보관함에 넣기"
                  </span>
                ) : (
                  staging.map((pn) => <StagingChip key={pn} pnum={pn} onRemove={stagingToUnplaced} />)
                )}
              </div>
            </div>
          )}
          </DndContext>
        </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={editMode ? "default" : "secondary"}
            onClick={() => {
              setEditMode((v) => !v);
              setSelectedZones([]);
            }}
          >
            {editMode ? "✓ 수정 중" : "수정"}
          </Button>
          {editMode && selectedZones.length > 0 ? (
            <>
              <span className="text-xs font-bold text-purple-700">
                {selectedZones.length}칸 선택
              </span>
              <Button type="button" className="bg-sky-600 hover:bg-sky-700" onClick={() => groupMove(1)}>
                ↑ 위로 이동
              </Button>
              <Button type="button" className="bg-sky-600 hover:bg-sky-700" onClick={() => groupMove(-1)}>
                ↓ 아래로 이동
              </Button>
              <Button type="button" variant="outline" onClick={() => setSelectedZones([])}>
                선택 해제
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={stageSelected}
                title="선택 칸의 제품을 임시 보관함으로 이동"
                className="border-amber-400 text-amber-800 hover:bg-amber-50"
              >
                📦 보관함에 넣기
              </Button>
            </>
          ) : null}
          {editMode && (
            <Button type="button" variant="outline" onClick={addLine} title="현재 동 오른쪽에 새 빈 라인(슬롯 19칸) 추가">
              + 라인 추가
            </Button>
          )}
          {editMode && (
            <Button type="button" variant="outline" onClick={addCell} title="그리드 오른쪽에 새 빈 칸 추가 — 드래그로 원하는 위치에 배치">
              + 칸 추가
            </Button>
          )}
          {editMode && (
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              여유:
              <button type="button" className="px-1.5 py-0.5 rounded border hover:bg-slate-100" title="위쪽 여유 +40px" onClick={() => expandGrid("t")}>⬆</button>
              <button type="button" className="px-1.5 py-0.5 rounded border hover:bg-slate-100" title="아래쪽 여유 +40px" onClick={() => expandGrid("b")}>⬇</button>
              <button type="button" className="px-1.5 py-0.5 rounded border hover:bg-slate-100" title="왼쪽 여유 +40px" onClick={() => expandGrid("l")}>⬅</button>
              <button type="button" className="px-1.5 py-0.5 rounded border hover:bg-slate-100" title="오른쪽 여유 +40px" onClick={() => expandGrid("r")}>➡</button>
            </span>
          )}
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
          <h3 className="text-sm font-semibold text-red-600">
            미배치 ({unplaced.length}건) — 순위·분류 · A/B/C동 배치 제외
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
                {unplaced.map((u) => (
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
/* ===== 드래그앤드롭 셀 컴포넌트 (2026-08-17) — 편집 모드 확장 예정 ===== */
function StagingChip({ pnum, onRemove }: { pnum: string; onRemove: (pn: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `stg-${pnum}`,
    data: { kind: "staging", zoneId: "STAGING", itemIdx: 0, pnum } as DragSource,
  });
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={
        "inline-flex items-center gap-1 rounded bg-amber-200 text-amber-900 text-[11px] px-1.5 py-0.5 cursor-grab active:cursor-grabbing select-none " +
        (isDragging ? "opacity-40" : "")
      }
      title="드래그하여 칸에 배치 (점유 칸이면 교환)"
    >
      {pnum}
      <button
        type="button"
        className="text-[10px] text-amber-700 hover:text-red-600"
        onClick={(ev) => {
          ev.stopPropagation();
          onRemove(pnum);
        }}
        title="보관함에서 제거"
      >
        ×
      </button>
    </span>
  );
}

function DragChip({
  zoneId,
  itemIdx,
  pnum,
  text,
  kind = "zone",
}: {
  zoneId: string;
  itemIdx: number;
  pnum: string;
  text: string;
  kind?: "zone" | "overflow";
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-${kind === "overflow" ? "ov" : zoneId}-${itemIdx}-${pnum}`,
    data: { kind, zoneId, itemIdx, pnum } as DragSource,
  });
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={
        "cursor-grab active:cursor-grabbing select-none " +
        (isDragging ? "opacity-40" : "")
      }
      title="드래그하여 이동 (놓으면 밀려남)"
    >
      {text}
    </span>
  );
}

function ZoneCell({
  z,
  value,
  isL7,
  matched,
  flash,
  sel,
  editMode,
  selected,
  moveTarget,
  onOpen,
  onToggleSelect,
  tip,
}: {
  z: ZoneDef;
  value: string;
  isL7: boolean;
  matched: boolean;
  flash: boolean;
  sel: boolean;
  editMode: boolean;
  selected: boolean;
  moveTarget: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
  tip: string;
}) {
  const assigned = Boolean(value);
  const items = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const isA = z.id.startsWith("A-");
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `drop-${z.id}`,
    data: { zoneId: z.id } as { zoneId: string; itemIdx?: number },
  });
  const aDrag = useDraggable({
    id: `adrag-${z.id}`,
    // 수정 모드에서는 제품 드래그 비활성 → 칸(슬롯) 드래그(cellDrag)가 담당
    disabled: !assigned || !isA || editMode,
    data: { kind: "zone", zoneId: z.id, itemIdx: 0, pnum: items[0] || "" } as DragSource,
  });
  // 수정 모드 칸(슬롯) 자유 이동 드래그
  const cellDrag = useDraggable({
    id: `cell-${z.id}`,
    disabled: !editMode,
    data: { kind: "cell", zoneId: z.id } as DragSource,
  });
  const nodeRef = (node: HTMLButtonElement | null) => {
    dropRef(node);
    if (isA) aDrag.setNodeRef(node);
    if (editMode) cellDrag.setNodeRef(node);
  };
  return (
    <button
      ref={nodeRef}
      type="button"
      data-zone-id={z.id}
      onClick={editMode ? onToggleSelect : onOpen}
      title={moveTarget ? `${tip} — 클릭하면 선택 칸이 이 위치로 이동` : tip}
      {...(isA ? aDrag.listeners : {})}
      {...(isA ? aDrag.attributes : {})}
      {...(editMode ? cellDrag.listeners : {})}
      {...(editMode ? cellDrag.attributes : {})}
      className={
        "absolute flex items-center justify-center rounded border text-center px-0.5 transition-colors " +
        (assigned
          ? isL7
            ? "border-orange-600 bg-orange-50"
            : "border-blue-700 bg-blue-50"
          : "border-slate-500 bg-white hover:bg-sky-50 hover:border-blue-500") +
        (sel ? " ring-2 ring-amber-400 ring-offset-1" : "") +
        (flash ? " vf-zone-flash" : "") +
        (matched ? " ring-2 ring-emerald-500 ring-offset-1" : "") +
        (isOver ? " ring-2 ring-blue-500 ring-offset-1 scale-[1.03]" : "") +
        (selected ? " ring-2 ring-purple-600 ring-offset-2 bg-purple-50" : "") +
        (moveTarget ? " border-dashed border-2 border-emerald-400 hover:bg-emerald-50" : "") +
        (editMode ? " cursor-pointer" : "")
      }
      style={z.style}
    >
      {assigned ? (
        <span
          className={
            "font-semibold text-[10px] leading-tight tabular-nums " +
            (isL7 ? "text-orange-900" : "text-blue-900") +
            (items.length > 1 ? " flex flex-col items-center text-[8px] leading-[1.15]" : "")
          }
        >
          {items.length > 1 && !isA
            ? items.map((it, i) => (
                <DragChip key={`${z.id}-${i}`} zoneId={z.id} itemIdx={i} pnum={it} text={it} />
              ))
            : isA && items[0]
              ? (
                <DragChip zoneId={z.id} itemIdx={0} pnum={items[0]} text={items[0]} />
              )
              : displayOnly(items[0])}
        </span>
      ) : (
        <span className="text-[9px] text-slate-300 leading-none">·</span>
      )}
    </button>
  );
}

function displayOnly(t: string | undefined): string {
  return t ?? "";
}
