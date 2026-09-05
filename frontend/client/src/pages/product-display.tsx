/**
 * 제품 배치도 (A~E동)
 * - A동 좌→우: 6·5·4·3·2·1 (우측=1번)
 * - 밀착 2-3·4-5 / 통로 1|2·3|4·5|6
 * - L1-L6: 1칸 1품목 (지그재그, 동일분류 묶음)
 * - L7: 8칸, 바퀴 슬림 서랍장만 1칸에 2품목씩
 * - 호버 툴팁: 분류(대분류/중분류) + 상세 제품명 + 현재고
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Download, RotateCcw, Save, Search, Upload } from "lucide-react";
import * as XLSX from "xlsx";
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
  A_ZONE_CAT,
  A_SLOT_CONFLICTS,
  A_TOTAL_PRODUCTS,
  A_UNPLACED,
  A_NO_OUTBOUND_3M,
  A_ZONE_BARCODE,
  A_ZONE_MASTER_NAME,
  A_ZONE_CATEGORY_LG,
  A_ZONE_CATEGORY_MD,
  A_ZONE_STOCK,
} from "@/pages/product-display-a-data";
import { B_PNUM_INFO, B_RANK_PLACEMENT } from "@/pages/product-display-b-data";
import { C_PNUM_INFO, C_RANK_PLACEMENT } from "@/pages/product-display-c-data";
import { D_PNUM_INFO, D_RANK_PLACEMENT } from "@/pages/product-display-d-data";
import { aChainInsert, extractDansu, reorderInZone } from "@/pages/product-display-utils";

const STORAGE_KEY = "vf_product_display_v1";
/** 배치 데이터 스키마 버전 — v14(A동 전용)는 v15(전 동)로 대체됨: 옛 데이터 무시 */
const SAVED_VERSION = "rank-a-v29";
/** 동적 레이아웃(칸 좌표) 저장 키 */
const LAYOUT_KEY = "vf_product_display_layout_v1";
const LAYOUT_VERSION = "layout-v1";
/** 임시 보관함(staging) 저장 키 — data와 완전 분리 (사용자 의도적 보관 버퍼) */
const STAGING_KEY = "vf_product_display_staging_v1";
const STAGING_VERSION = "staging-v3";
/** 라인 구성(라인별 칸 수·숨김 슬롯·라벨) 저장 키 — 기본 LineSpec 상수를 오버라이드 (편집 패널: 수정 모드 "라인 설정") */
const LINE_CONFIG_KEY = "vf_pd_line_config_v1";
const LOC_EXC_KEY = "vf_pd_loc_exceptions_v1";
const MANUAL_LOC_KEY = "vf_pd_manual_loc_nos_v1";
const LINE_CONFIG_VERSION = "line-config-v1";
/** 로컬 마지막 저장 시각 키 — 서버 로드 시 서버판 vs 로컬판 비교 기준 (서버 영속화, 2026-08-23) */
const SAVEDAT_KEY = "vf_pd_savedat_v1";
/** 칵투스 11 + 데크 타일 5 — A동 132칸 재배치 시 진열 제외 (2026-08-18) */
const A_STAGING_DEFAULT: string[] = ["988", "987", "982", "990", "980", "979", "985", "983", "986", "984", "981", "2070", "2074", "2071", "2073", "2072"];

/** 좌표 표기 포맷터 (2026-09-03 확정 규칙): 사용자에게 보이는 좌표는 반드시 "X<값>, Y<값>" (예: "X9, Y21").
 *  하이픈 "9-21"·"9,21"·"(9,21)" 표기 금지. 내부 맵 키는 고유 문자열("9-21") 그대로 유지하고
 *  화면·툴팁·검색·엑셀 등 표시 시점에만 이 유틸로 변환한다. */
const fmtCoord = (x: number | string, y: number | string): string => `X${x}, Y${y}`;
/** 내부 좌표 키("9-21") → 표기용("X9, Y21"). 키 형식(숫자-숫자)이 아니면 원문 그대로 반환. */
const fmtCoordKey = (key: string): string => {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(key);
  return m ? fmtCoord(m[1], m[2]) : key;
};
/** 표기용 좌표("X9, Y21" / "9,21" / "9-21") → 내부 키("9-21"). 업로드 등 역매칭 전 정규화용. */
const normCoordKey = (s: string): string => {
  const m = /^\s*X?\s*(\d+)\s*[,~-]\s*Y?\s*(\d+)\s*$/i.exec(s);
  return m ? `${m[1]}-${m[2]}` : s.trim();
};

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
  locNo?: number | null;
  /** 다품목 칸 제품별 번호 (2026-08-31): 데이터 품목 순서와 align — locNo보다 우선 */
  locNos?: number[];
  gridCoord?: string;
  /** 고정 칸 (2026-08-28): 드래그·라인 이동·좌표 이동 전부 차단 — 건들면 안 되는 칸 표시 */
  fixed?: boolean;
  /**
   * 배치 방향 (2026-08-29): 다품목 칸 분할 방향 결정.
   * - "h" = 가로 배치 (물건이 좌→우로 나열) → 칸을 좌우로 분할 (예: A동 L7/20행)
   * - "v"(기본) = 세로 배치 (파레트가 상하 적재) → 칸을 상하로 분할 (예: A동 L1~L6)
   */
  splitDir?: "h" | "v";
  /** 가로 배치 칸(예: A동 L7): 제품명 세로 나열 표시 (2026-08-29) */
  productNamesVertical?: boolean;
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

/**
 * 저장된 레이아웃(서버 스냅샷·옛 localStorage) 존에 배치 방향 재부여 (2026-08-29).
 * 옛 스냅샷에는 splitDir 필드가 없어 복원 시 전부 세로 분할로 떨어지는 것을 방지:
 * 1) DONG_LAYOUTS 기본 레이아웃에 같은 존 아이디가 있으면 그 방향을 사용
 * 2) 없으면(사용자 추가 칸) 규칙 기반 — A동 L7(가로 배치/20행)=좌우 분할, 그 외=상하 분할
 */
function hydrateZoneSplitDir(layout: DongLayout[]): DongLayout[] {
  const baseDir = new Map<string, "h" | "v">();
  const basePNV = new Map<string, boolean>();
  DONG_LAYOUTS.forEach((d) =>
    d.zones.forEach((z) => {
      if (z.splitDir) baseDir.set(z.id, z.splitDir);
      if (z.productNamesVertical) basePNV.set(z.id, z.productNamesVertical);
    })
  );
  return layout.map((d) => ({
    ...d,
    zones: d.zones.map((z) => ({
      ...z,
      splitDir: z.splitDir ?? baseDir.get(z.id) ?? (/^A-L7-/.test(z.id) ? "h" : "v"),
      productNamesVertical: z.productNamesVertical ?? basePNV.get(z.id) ?? false,
    })),
  }));
}
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

/** 서버 스냅샷 payload 구조 (고정) — 파싱 실패 시 서버판 무시·로컬 유지 (2026-08-23 서버 영속화) */
type PdSnapshotPayload = {
  data: PlacementMap;
  layout: DongLayout[];
  lineConfig: LineConfigMap;
  staging: string[];
  locExceptions?: string[];
  manualLocNos?: Record<string, number>;
  savedAt: string;
};
type PdHistoryItem = { version: number; saved_by: string; created_at: string; size?: number };

/** 서버 스냅샷 payload 파싱 — 유효하지 않으면 null (로컬 유지)
 *  layout 누락 시 코드 기본 레이아웃(DONG_LAYOUTS) 사용 (2026-08-27) */
function parsePdPayload(payloadStr: string | null | undefined): PdSnapshotPayload | null {
  if (!payloadStr || typeof payloadStr !== "string") return null;
  try {
    const p = JSON.parse(payloadStr);
    if (!p || typeof p !== "object") return null;
    if (!p.data || typeof p.data !== "object") return null;
    if (!Array.isArray(p.staging)) return null;
    const lc = (p.lineConfig && typeof p.lineConfig === "object" ? p.lineConfig : {}) as LineConfigMap;
    // L7 마이그레이션 (2026-08-25): 옛 2슬롯 A-L7-N-1/-2 → 통일 칸 A-L7-N 병합
    const d7 = p.data as Record<string, string>;
    for (const [zid, val] of Object.entries(d7)) {
      const m = /^A-L7-(\d+)-[12]$/.exec(zid);
      if (!m || !val) continue;
      const merged = `${d7[`A-L7-${m[1]}`] || ""},${val}`
        .split(",").map((s) => s.trim()).filter(Boolean);
      d7[`A-L7-${m[1]}`] = Array.from(new Set(merged)).join(",");
      delete d7[zid];
    }
    // layout 누락/손상 시 코드 기본 레이아웃 사용 (2026-08-27)
    const layout: DongLayout[] = Array.isArray(p.layout) && p.layout.length > 0
      ? (p.layout as DongLayout[])
      : DONG_LAYOUTS;
    return {
      // 전역 중복 정리 후 반환 (2026-08-28) — 서버판·옛 스냅샷 오염 데이터 교정
      data: sanitizePlacementMap(p.data as PlacementMap),
      layout,
      lineConfig: lc,
      staging: (p.staging as unknown[]).filter((x): x is string => typeof x === "string"),
      locExceptions: Array.isArray(p.locExceptions)
        ? (p.locExceptions as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined,
      manualLocNos: typeof p.manualLocNos === "object" && p.manualLocNos != null && !Array.isArray(p.manualLocNos)
        ? (p.manualLocNos as Record<string, number>)
        : undefined,
      savedAt: typeof p.savedAt === "string" ? p.savedAt : "",
    };
  } catch {
    return null;
  }
}

/** 저장 시각 → "마지막 서버 저장" 헤더 표시용 (오늘=시:분, 다른 날=월/일 시:분) */
function fmtPdSaved(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

/** A동 zone → (line, slot) — L1~L7 모두 "A-L{line}-{slot}" (L7 2026-08-25 통일: 1칸=1 zone) */
function aZoneLineSlot(zid: string): { line: number; slot: number } | null {
  const m = /^A-L(\d+)-(\d+)$/.exec(zid);
  if (m) return { line: +m[1], slot: +m[2] };
  return null;
}

/** 라인 라벨 텍스트 → 라인 번호 추출 (배지 줄바꿈·"7번 라인 (...)"·"5번" 모두 대응) */
function parseLineNoFromLabel(text: string): number | null {
  const t = (text || "").split("\n")[0];
  let m = /^L(\d+)\b/.exec(t);
  if (m) return +m[1];
  m = /^(\d+)번/.exec(t);
  if (m) return +m[1];
  return null;
}

/** 열 번호 → 알파벳 라벨 (1=A, 2=B, ... 27=AA) */
function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 물리 그리드 좌표 (2026-08-28) — 존의 실제 픽셀 위치를 기준으로
 *  행(위→아래 1~N)·열(좌→우 A~)을 클러스터링해 부여.
 *  예: "C12-J" = C동 12행 J열. 사용자가 이 좌표로 칸을 부를 수 있게 함. */
/** 로케이션 번호 표시 포맷 (2026-08-28) — 다품목 칸은 구분 어려우므로 처음→끝 화살표로 요약 */
function fmtLocNos(nos: number[] | undefined | null): string {
  if (!nos || nos.length === 0) return "";
  if (nos.length === 1) return String(nos[0]);
  return `${nos[0]}→${nos[nos.length - 1]}`;
}

/** 물리 그리드 좌표 계산 — 모든 동(A/B/C/D) 공통 (2026-08-28)
 *  각 칸의 중심점을 기준으로 행·열 클러스터링하여 숫자 인덱스(1부터 시작) 부여.
 *  반환: coords(Map<존ID, {row, col}>), rows(행 대표 y), cols(열 대표 x), minLeft, minTop
 */
function computeGridCoords(zones: ZoneDef[]): {
  coords: Map<string, { row: number; col: number }>;
  rows: number[];
  cols: number[];
  minLeft: number;
  minTop: number;
} | null {
  if (zones.length === 0) return null;
  const TOL = 8; // 같은 행/열 판정 허용 오차
  const cy = (z: ZoneDef) => Number(z.style.top ?? 0) + Number(z.style.height ?? SLOT.h) / 2;
  const cx = (z: ZoneDef) => Number(z.style.left ?? 0) + Number(z.style.width ?? SLOT.w) / 2;
  const cluster = (vals: number[]) => {
    const sorted = [...new Set(vals)].sort((a, b) => a - b);
    const reps: number[] = [];
    for (const v of sorted) {
      const last = reps[reps.length - 1];
      if (last === undefined || v - last > TOL) reps.push(v);
      else reps[reps.length - 1] = (last + v) / 2;
    }
    return reps;
  };
  const rowReps = cluster(zones.map(cy));
  const colReps = cluster(zones.map(cx));
  const nearest = (v: number, reps: number[]) => {
    let bi = 0;
    let bd = Infinity;
    reps.forEach((r, i) => {
      const d = Math.abs(v - r);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    return bi;
  };
  const coords = new Map<string, { row: number; col: number }>();
  zones.forEach((z) => {
    coords.set(z.id, { row: nearest(cy(z), rowReps) + 1, col: nearest(cx(z), colReps) + 1 });
  });
  return {
    coords,
    rows: rowReps,
    cols: colReps,
    minLeft: Math.min(...zones.map((z) => Number(z.style.left ?? 0))),
    minTop: Math.min(...zones.map((z) => Number(z.style.top ?? 0))),
  };
}

/** 전 동 공통 물리 좌표 시스템 (2026-09-03) — 화면 gridLabels와 검색·총괄(coordOfAll)이
 *  반드시 같은 값을 내도록 이 단일 구현만 사용한다. 좌표계 규칙(확정 20260903):
 *  - X = 열 중심 클러스터(computeGridCoords, 좌→우) 1..N
 *  - Y = 아래(top 큼)=1 ~ 위=top 작은 순 1씩 증가
 *    · A동: 통로 행 포함 38px 연속 행 (그 layout의 yMin~yMax, 상단 반 칸 오차 허용)
 *    · B/C/D: 점유 행 클러스터를 아래→위 역순 번호
 *  반환: gc(라벨 배치용 원본), rowRepsDesc(아래=1 순 행 대표 y), colReps(좌→우 열 대표 x),
 *        coordOf(존 ID → 내부 키 "X-Y". 표시는 fmtCoordKey가 담당)
 *  주의: product-display-utils의 buildGridCoordMap은 B/C/D도 38px 연속 행으로 계산하고
 *  A동 상단 PX/2 오차 허용이 없어 이 규칙과 값이 어긋난다 → 좌표 값 일치가 최우선이라
 *  직접 호출하지 않고 이 함수로 통일한다. */
function buildGridCoordSystem(
  dong: DongKey,
  zones: ZoneDef[]
): {
  gc: NonNullable<ReturnType<typeof computeGridCoords>>;
  rowRepsDesc: number[];
  colReps: number[];
  coordOf: Map<string, string>;
} | null {
  const gc = computeGridCoords(zones);
  if (!gc) return null;
  // A동: X열 9열 고정 (52px 피치, 2026-09-04) — 점유 열 클러스터 폐기 (재빌드 시 열 붕괴 방지)
  const colReps = dong === "A" ? [28, 80, 132, 184, 236, 288, 340, 392, 444] : gc.cols;
  const PX = SLOT.h + SLOT.gapY; // 세로 한 칸 주기 38px (칸 34 + 간격 4)
  const centerYOf = (z: ZoneDef) => Number(z.style.top ?? 0) + Number(z.style.height ?? SLOT.h) / 2;
  const cys = zones.map(centerYOf);
  const yMax = Math.max(...cys); // 최하단 칸 중심 Y
  const yMin = Math.min(...cys); // 최상단 칸 중심 Y
  // 행 대표 y 목록 — 아래→위 순서, index+1 = Y
  const rowRepsDesc: number[] = [];
  if (dong === "A") {
    // A동: 통로 포함 연속 38px 행 (아래=1). 상단 반 칸 치수 오차 허용으로 부동 오차 흡수
    for (let t = yMax; t >= yMin - PX / 2; t -= PX) rowRepsDesc.push(t);
  } else {
    // B/C/D: 점유 행 클러스터(computeGridCoords)를 아래→위로 역순 번호
    rowRepsDesc.push(...[...gc.rows].sort((a, b) => b - a));
  }
  const nearestIdx = (v: number, reps: number[]) => {
    let bi = 0;
    let bd = Infinity;
    reps.forEach((r, i) => { const d = Math.abs(v - r); if (d < bd) { bd = d; bi = i; } });
    return bi;
  };
  const coordOf = new Map<string, string>();
  zones.forEach((z) => {
    const zcx = Number(z.style.left ?? 0) + Number(z.style.width ?? SLOT.w) / 2;
    const x = nearestIdx(zcx, colReps) + 1;
    const y = nearestIdx(centerYOf(z), rowRepsDesc) + 1;
    coordOf.set(z.id, `${x}-${y}`);
  });
  return { gc, rowRepsDesc, colReps, coordOf };
}

/** 서버 스냅샷 적용 → 4개 로컬 키 동기화 (실패 무시) */
function writeLocalFromPayload(p: PdSnapshotPayload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ __v: SAVED_VERSION, data: p.data }));
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ __v: LAYOUT_VERSION, layout: p.layout }));
    localStorage.setItem(STAGING_KEY, JSON.stringify({ __v: STAGING_VERSION, items: p.staging }));
    localStorage.setItem(LINE_CONFIG_KEY, JSON.stringify({ __v: LINE_CONFIG_VERSION, data: p.lineConfig }));
    if (p.locExceptions) localStorage.setItem(LOC_EXC_KEY, JSON.stringify(p.locExceptions));
    if (p.manualLocNos) localStorage.setItem(MANUAL_LOC_KEY, JSON.stringify(p.manualLocNos));
    if (p.savedAt) localStorage.setItem(SAVEDAT_KEY, p.savedAt);
  } catch {
    /* 저장 실패 무시 */
  }
}

/** (2026-08-31 삭제) 로케이션 번호 자동 배정 공식(calcZigzagLocNo) 제거.
 *  번호는 칸 데이터(zone.locNo)에 사용자가 수기 지정한 값만 사용하며
 *  어떤 코드도 번호를 계산·부여하지 않는다. */

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
  const m2 = id.match(/^A-L(\d+)-(\d+)$/); // L1~L7 (L7 통일): A-L1-1 형식
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
    // L 라인 헤더 제거 (2026-08-28) — 숫자 좌표만 표시

    for (let i = 0; i < lineSpec.count; i++) {
      const numVal = i + 1;
      // 숨김 슬롯(입구 자리 등)은 화면에서만 제외 — 배치 데이터는 보존
      if (lineSpec.hiddenSlots?.includes(numVal)) continue;
      const placeFromTop = bottomIsStart ? lineSpec.count - 1 - i : i;
      // 로케이션 번호는 저장하지 않음 — 배치(data) 기반 동적 계산(computeLocNosAll)이 유일 소스 (2026-09-05)
      zones.push({
        id: `${dong}-L${lineSpec.line}-${numVal}`,
        num: "",
        line: lineSpec.line,
        showNumAsProduct: false,
        splitDir: "v", // 세로 배치 — 파레트 상하 적재 (2026-08-29)
        style: {
          left: colLeft,
          top: slot.padT + placeFromTop * (slot.h + slot.gapY),
          width: slot.w,
          height: slot.h,
        },
      });
    }
  });

  // A동 1~19 슬롯 인덱스 라벨 제거 (2026-08-28) — 통일 좌표 라벨 시스템으로 대체

  // L7: 8칸 (A-L7-N, 2026-08-25 통일 — 일반 칸과 동일 크기), 라인2 끝과 맞춤
      const vertBottom =
        slot.padT + maxCount * slot.h + Math.max(0, maxCount - 1) * slot.gapY;
      const bottomTop = vertBottom + slot.bottomLineGap + slot.bottomLabelH;
      const bottomStartLeft = slot.padL;
      // L2 끝 = lineLeftOf(2) + slot.w. L7 8칸 끝을 이와 맞춤.
      const l2Right = lineLeftOf(2) + slot.w;
      const l7TotalWidth = l2Right - bottomStartLeft;

      // "7번 라인" 라벨 제거 (2026-08-28) — 숫자 좌표만 표시

      for (let i = 0; i < A_BOTTOM_SLOTS; i++) {
        // L7 통일 (2026-08-25): 1칸=1 zone — 일반 칸과 동일 크기·간격 (기존 2슬롯 구조 폐지)
        // 간격은 SLOT.tightGap(6) 사용 — 일반 라인의 tight pair 간격과 동일
        zones.push({
          id: `A-L7-${i + 1}`,
          num: "",
          line: A_BOTTOM_LINE_ID,
          showNumAsProduct: false,
          productNamesVertical: true, // 가로 배치 칸: 제품명 세로 나열 (2026-08-29)
          style: {
            left: Math.round(bottomStartLeft + i * (slot.w + slot.tightGap)),
            top: bottomTop,
            width: slot.w,
            height: slot.h,
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

    // 블록 헤더 제거 (2026-08-28) — 숫자 좌표만 사용

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
        splitDir: b.horizontal ? "h" : "v", // 블록 나열 방향 = 배치 방향 (2026-08-29)
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

/* ═══════════ 로케이션 번호 동적 자동 발행 (2026-09-05, 작업지시-로케이션-동적발행) ═══════════
 * 좌표·칸은 고정, 제품 배치만 유동 → 로케이션 번호는 배치(data)에서 파생되는 **계산값**.
 *  - 동별 카논 좌표 순서로 모든 칸을 순회하며 번호 발행
 *  - 한 칸이 쓰는 번호 개수 = 그 칸의 실제 품목 수 (빈 칸도 자기 번호 1개 보장)
 *  - 어떤 칸의 품목이 늘면 그 뒤(높은 쪽) 번호가 자동으로 순차 밀림 (재계산)
 *  - 동 구간: A동 = 1부터, 이후 동은 앞 동 마지막 번호 + 1부터 (전역 연속)
 *  - 번호는 어디에도 저장하지 않는다 (표시·검색·엑셀·인쇄·미니맵·모바일 공용 계산 결과)
 *  정적 맵(A_LOCNO_MAP/A_LOCNOS_MAP/A_COORD_NOS)은 폐기 — 아래가 유일한 계산 경로. */

/** 좌표 키("X-Y") → (X,Y). 형식이 아니면 null. */
function coordXY(coord: string): { x: number; y: number } | null {
  const m = /^(\d+)-(\d+)$/.exec(coord);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
}

/** A동 좌표 카논 순서 키 (사용자 확정 2026-09-04). 작을수록 먼저 발행, -1 = 번호 미발행 좌표.
 *  ① X9/X7(L1/L2) 열쌍 — 위(Y21)에서 아래(Y3)로 지그재그
 *  ② X6/X4(L3/L4) 열쌍 — 아래(Y3)에서 위(Y21)로 지그재그
 *  ③ X3/X1(L5/L6) 열쌍 — 아래(Y3)에서 위(Y21)로 지그재그
 *  L7(Y1, X1~X8)은 마지막에 좌→우. 통로 열(X2·X5·X8)·Y2 통로 행은 번호 발행 제외. */
function aCanonOrder(coord: string): number {
  const c = coordXY(coord);
  if (!c) return -1;
  const { x, y } = c;
  if (y === 1) return x >= 1 && x <= 8 ? 300000 + x : -1; // L7 하단
  if (y < 3 || y > 21) return -1;
  const inPair = (cols: number[], off: number) => {
    const idx = cols.indexOf(x);
    if (idx < 0) return -1;
    // 열쌍 진행 축: ①은 위(Y21)→아래, ②③은 아래(Y3)→위. 홀수 행은 진행 역순(뱀)
    const step = cols[0] === 9 ? 21 - y : y - 3;
    if (step < 0 || step > 18) return -1;
    const parity = step % 2;
    const pos = idx === 0 ? parity : 1 - parity;
    return off + step * 2 + pos;
  };
  let o = inPair([9, 7], 0);
  if (o >= 0) return o;
  o = inPair([6, 4], 10000);
  if (o >= 0) return o;
  o = inPair([3, 1], 20000);
  if (o >= 0) return o;
  return -1;
}

/** B/C/D동 좌표 카논 순서 키 — 실제 layout 칸(전부 번호 대상), 아래 행부터 위로·같은 행은 좌→우. */
function bcdCanonOrder(coord: string): number {
  const c = coordXY(coord);
  if (!c) return -1;
  return c.y * 1000 + c.x;
}

type LocNosDongRange = { start: number; end: number };
type LocNosAll = {
  /** 존 ID → 로케이션 번호 배열 (번호 미발행 좌표·칸 제외) */
  byZone: Map<string, number[]>;
  /** 동 키 → (좌표 "X-Y" → 로케이션 번호 배열) — 좌표 기준 오버레이용 */
  byCoord: Map<string, Map<string, number[]>>;
  /** 동 키 → 구간 (발행 칸이 없는 동은 미포함) */
  dongRange: Record<string, LocNosDongRange>;
};

/** 전 동 동적 로케이션 번호 계산 (2026-09-05). layout·data가 바뀌면 항상 최신 기준으로 재계산.
 *  manualLocNos: zoneId → 사용자 지정 첫 번호. 해당 칸은 그 값부터 품목 수만큼 연속 발행되고,
 *  이후 칸 번호는 자연스럽게 밀린다. (빈 칸도 manual값 1개, 이후 연속) */
function computeLocNosAll(
  layouts: DongLayout[],
  data: PlacementMap,
  locExceptions: Set<string>,
  manualLocNos: Record<string, number>
): LocNosAll {
  const byZone = new Map<string, number[]>();
  const byCoord = new Map<string, Map<string, number[]>>();
  const dongRange: Record<string, LocNosDongRange> = {};
  const ORDER: DongKey[] = ["A", "B", "C", "D", "E"];
  let cursor = 1;
  for (const key of ORDER) {
    const lay = layouts.find((l) => l.key === key);
    const zones = lay?.zones ?? [];
    const sys = buildGridCoordSystem(key, zones);
    type Cell = { zoneId: string; coord: string; rank: number; count: number };
    const cells: Cell[] = [];
    if (sys) {
      for (const z of zones) {
        const coord = sys.coordOf.get(z.id);
        if (!coord) continue;
        const rank = key === "A" ? aCanonOrder(coord) : bcdCanonOrder(coord);
        if (rank < 0) continue;
        const items = (data[z.id] || "").split(",").map((s) => s.trim()).filter(Boolean);
        // 빈 칸도 자기 자리 번호 1개. 예외칸(locExceptions)은 품목이 있어도 1개만 소진.
        const count = locExceptions.has(z.id) ? 1 : Math.max(1, items.length);
        cells.push({ zoneId: z.id, coord, rank, count });
      }
    }
    cells.sort((a, b) => a.rank - b.rank);
    const coordMap = new Map<string, number[]>();
    let start = cursor;
    let end = cursor - 1;
    for (const c of cells) {
      const manual = manualLocNos[c.zoneId];
      if (manual != null && manual > 0 && manual >= cursor) cursor = manual;
      const nos: number[] = [];
      for (let i = 0; i < c.count; i++) nos.push(cursor++);
      byZone.set(c.zoneId, nos);
      coordMap.set(c.coord, nos);
      end = cursor - 1;
    }
    byCoord.set(key, coordMap);
    if (cells.length) dongRange[key] = { start, end };
  }
  return { byZone, byCoord, dongRange };
}

/** 로케이션 번호는 파생값 — 저장/복원 시 zone.locNo/locNos 필드 제거 (2026-09-05) */
function stripZoneLocNos(layouts: DongLayout[]): DongLayout[] {
  return layouts.map((d) => ({
    ...d,
    zones: d.zones.map((z) => {
      if (z.locNo == null && !z.locNos) return z;
      const c = { ...z };
      delete c.locNo;
      delete c.locNos;
      return c;
    }),
  }));
}

/* ═══════════ A동 존 표준 그리드 재정렬 (2026-09-05, 작업지시-존배치-정렬) ═══════════
 * 문제: layout에 영속된 A동 존(left/top)이 표준 좌표(좌표계 규칙 확정 20260903)를 벗어나
 *       뒤섞여 저장돼 제품이 엉뚱한 좌표·로케이션 번호에 표시됨. (과거 칸 이동 저장 잔재)
 * 표준: 세로 랙 A-L{1..6}-{s} → 라인별 X열(colReps) + top = padT+(19-s)*PX (Y=s+2)
 *       하단 A-L7-{n} → Y=1 행 (top=808, left=padL+(n-1)*(w+gapY))
 * 처리: 표준 존은 항상 표준 그리드 좌표로 재계산하고, 표준 칸 자리를 차지한 커스텀 존
 *       (A-NEW-* 등)은 표준 존이 없는 여분 슬롯으로 재배치해 겹침을 막는다. 제품 배치
 *       data는 절대 변경하지 않는다. (복원/저장 방어 — 이전 커밋들이 표시만 고치고 존 위치를
 *       안 고쳐 반복 재발한 것을 근절: 저장본 자체를 항상 표준 좌표로 강제) */
const A_GRID_COLS = [28, 80, 132, 184, 236, 288, 340, 392, 444];
const A_GRID_LINE_TO_X: Record<number, number> = { 1: 9, 2: 7, 3: 6, 4: 4, 5: 3, 6: 1 };
const A_L7_BOTTOM_TOP = 808; // 서버 v340 저장 레이아웃의 하단 L7 행 top (Y=1)

/** A동 표준 존 id → 표준 그리드 left/top. 비표준(A-NEW-*, A-X1/X2 등)이면 null */
function aCanonicalStyleOf(id: string): { left: number; top: number } | null {
  const PX = SLOT.h + SLOT.gapY; // 38
  const m = /^A-L([1-6])-(\d+)$/.exec(id);
  if (m) {
    const line = Number(m[1]);
    const s = Number(m[2]);
    if (s < 1 || s > A_SLOTS_PER_LINE) return null;
    const x = A_GRID_LINE_TO_X[line];
    return { left: A_GRID_COLS[x - 1], top: SLOT.padT + (A_SLOTS_PER_LINE - s) * PX };
  }
  const m7 = /^A-L7-(\d+)$/.exec(id);
  if (m7) {
    const n = Number(m7[1]);
    if (n < 1 || n > A_BOTTOM_SLOTS) return null;
    return { left: SLOT.padL + (n - 1) * (SLOT.w + SLOT.gapY), top: A_L7_BOTTOM_TOP };
  }
  return null;
}

/** A동 layout 존들을 표준 그리드 좌표로 재정렬 (멱등). data는 건드리지 않음. */
function canonicalizeALayoutZones(layout: DongLayout[]): DongLayout[] {
  const a = layout.find((l) => l.key === "A");
  if (!a) return layout;
  const w = (z: ZoneDef) => Number(z.style.width ?? SLOT.w) || SLOT.w;
  const h = (z: ZoneDef) => Number(z.style.height ?? SLOT.h) || SLOT.h;
  const pos = (z: ZoneDef) => ({
    left: Number(z.style.left ?? 0),
    top: Number(z.style.top ?? 0),
  });
  const overlaps = (z: ZoneDef, left: number, top: number) => {
    const p = pos(z);
    return !(p.left + w(z) <= left || left + SLOT.w <= p.left || p.top + h(z) <= top || top + SLOT.h <= p.top);
  };
  const samePos = (z: ZoneDef, left: number, top: number) => pos(z).left === left && pos(z).top === top;

  const zones = a.zones.map((z) => ({ ...z, style: { ...z.style } }));
  const std: ZoneDef[] = [];
  const cust: ZoneDef[] = [];
  for (const z of zones) {
    if (aCanonicalStyleOf(z.id)) std.push(z);
    else cust.push(z);
  }
  const target = new Map<string, { left: number; top: number }>();
  for (const z of std) {
    const c = aCanonicalStyleOf(z.id);
    if (c) target.set(z.id, c);
  }
  // 표준 대상 자리를 차지한 커스텀 → 재배치 대상, 그 외 커스텀(통로 X1/X2·빈칸 대체)은 유지
  const reloc: ZoneDef[] = [];
  const kept: ZoneDef[] = [];
  for (const c of cust) {
    let blocked = false;
    for (const t of target.values()) {
      if (overlaps(c, t.left, t.top)) { blocked = true; break; }
    }
    (blocked ? reloc : kept).push(c);
  }
  // 여분(표준 존 부재) 슬롯 중 유지 커스텀이 차지하지 않은 자리
  const rackIds: string[] = [];
  for (let ln = 1; ln <= 6; ln++) {
    for (let s = 1; s <= A_SLOTS_PER_LINE; s++) rackIds.push(`A-L${ln}-${s}`);
  }
  for (let n = 1; n <= A_BOTTOM_SLOTS; n++) rackIds.push(`A-L7-${n}`);
  const stdIds = new Set(std.map((z) => z.id));
  const free: { id: string; left: number; top: number }[] = [];
  for (const id of rackIds) {
    if (stdIds.has(id)) continue;
    const c = aCanonicalStyleOf(id);
    if (!c) continue;
    if (kept.some((k) => overlaps(k, c.left, c.top))) continue;
    free.push({ id, ...c });
  }
  free.sort((x, y) => {
    const mx = /^A-L(\d+)-(\d+)$/.exec(x.id)!;
    const my = /^A-L(\d+)-(\d+)$/.exec(y.id)!;
    return Number(mx[1]) - Number(my[1]) || Number(mx[2]) - Number(my[2]);
  });
  reloc.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  const relocDest = new Map<string, { left: number; top: number }>();
  reloc.forEach((z, i) => {
    if (i < free.length) relocDest.set(z.id, { left: free[i].left, top: free[i].top });
  });
  // 실제 배치 계산 후 변화가 없으면 원본 반환 (상태 재렌더·저장 루프 방지)
  let changed = false;
  const out = zones.map((z) => {
    const c = target.get(z.id) ?? relocDest.get(z.id);
    if (c && !samePos(z, c.left, c.top)) {
      changed = true;
      return { ...z, style: { ...z.style, left: c.left, top: c.top } };
    }
    return z;
  });
  if (!changed) return layout;
  return layout.map((l) => (l.key === "A" ? { ...a, zones: out } : l));
}

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

  // 컬럼 그룹 헤더 제거 (2026-08-28) — 숫자 좌표만 표시

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

  // 컬럼 그룹 헤더 제거 (2026-08-28) — 숫자 좌표만 표시

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
  {
    key: "E",
    label: "E동",
    width: 360,
    height: 280,
    zones: [],
    lineLabels: [{ text: "라인 배치 대기", style: { left: 16, top: 12, width: 160 } }],
  },
];

/** 자동 교정 대상 zone — 사용자 확정 배치표 42칸 (loc 1~44, 38/43 빈칸) — 파일 SoT 강제 */
const SOFT_ZONES = ["A-L1-19", "A-L2-19", "A-L2-18", "A-L1-18", "A-L1-17", "A-L2-17", "A-L2-16", "A-L1-16", "A-L1-15", "A-L2-15", "A-L2-14", "A-L1-14", "A-L1-13", "A-L2-13", "A-L2-12", "A-L1-12", "A-L1-11", "A-L2-11", "A-L2-10", "A-L1-10", "A-L1-9", "A-L2-9", "A-L2-8", "A-L1-8", "A-L1-7", "A-L2-7", "A-L2-6", "A-L1-6", "A-L1-5", "A-L2-5", "A-L2-4", "A-L1-4", "A-L1-3", "A-L2-3", "A-L2-2", "A-L1-2", "A-L1-1", "A-L3-19", "A-L4-19", "A-L4-18", "A-L3-18", "A-L4-17"];
/** 확정 빈칸 (배치표에서 비운 자리) */
const EMPTY_ZONES = ["A-L2-1", "A-L3-17"];

/** 배치맵 전역 중복 제거 (2026-08-28) — 한 제품은 전역에서 정확히 한 칸에만 배치 (R1 규칙)
 *  동 우선순위: A→B→C→D→E 순으로 처리해 먼저 나오는 동에 배치 유지, 나중 동에서 제거.
 *  (같은 동 내에서는 삽입 순서 유지 — 안정 정렬)
 *  같은 칸 안 중복: 첫 제품번호만 유지. 빈 칸이 되면 키 제거. 새 맵 반환. */
function sanitizePlacementMap(map: PlacementMap): PlacementMap {
  const DONG_ORDER: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };
  const dongRank = (zid: string) => DONG_ORDER[(zid || "").split("-")[0]] ?? 9;
  const entries = Object.entries(map).sort((a, b) => dongRank(a[0]) - dongRank(b[0]));
  const out: PlacementMap = {};
  const seen = new Set<string>();
  for (const [zid, val] of entries) {
    const items = (val || "").split(",").map((s) => s.trim()).filter(Boolean);
    const kept: string[] = [];
    for (const pn of items) {
      if (seen.has(pn)) continue; // 중복 — 이미 앞선 동·칸에 배치됨
      seen.add(pn);
      kept.push(pn);
    }
    if (kept.length) out[zid] = kept.join(",");
  }
  return out;
}

function loadPlacement(): PlacementMap {
  let data: PlacementMap | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 스키마 버전이 현재와 다르면(옛 데이터) 무시 → 기본값(전 동) 사용
      if (parsed && parsed.__v === SAVED_VERSION && parsed.data && typeof parsed.data === "object") {
        data = parsed.data as PlacementMap;
      }
    }
  } catch {
    /* 손상 시 기본값 */
  }
  if (!data) return sanitizePlacementMap(defaultAPlacement());
  // L7 마이그레이션 (2026-08-25): 옛 2슬롯 A-L7-N-1/-2 → 통일 칸 A-L7-N 병합
  for (const [zid, val] of Object.entries(data)) {
    const m = /^A-L7-(\d+)-[12]$/.exec(zid);
    if (!m || !val) continue;
    const merged = `${data[`A-L7-${m[1]}`] || ""},${val}`
      .split(",").map((s) => s.trim()).filter(Boolean);
    data[`A-L7-${m[1]}`] = Array.from(new Set(merged)).join(",");
    delete data[zid];
  }
  // 참고: v25까지만 파일 SoT 강제 — v26부터는 엑셀 업로드가 localStorage를 갱신하므로
  // SOFT_ZONES 강제 적용을 하지 않음 (2026-08-22 엑셀 왕복 도입).
  // 확정 빈칸(로케이션 38, 43) + 이전 배치 잔존 자리 정리
  let fixed = false;
  const cleared = [...EMPTY_ZONES,
    "A-L2-1", "A-L3-17", "A-L4-16", "A-L3-16",
    "A-L3-14", "A-L3-15", "A-L4-4", "A-L4-5", "A-L4-6", "A-L5-7",
    "A-L4-10", "A-L4-13", "A-L4-8", "A-L4-9", "A-L4-11",
    "A-L4-1", "A-L4-2", "A-L4-7", "A-L4-19", "A-L4-18", "A-L3-18"];
  for (const zid of cleared) {
    if (data[zid] && !SOFT_ZONES.includes(zid)) {
      delete data[zid];
      fixed = true;
    }
  }
  // 재배치로 배치에서 빠진 제품 → 임시보관함 이관 (614,17,285,289,268,173)
  const bumped = ["614", "17", "285", "289", "268", "173"];
  for (const pn of bumped) {
    for (const [zid, v] of Object.entries(data)) {
      if (!v) continue;
      const parts = v.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.includes(pn)) {
        const next = parts.filter((p) => p !== pn).join(",");
        if (next) data[zid] = next;
        else delete data[zid];
        fixed = true;
      }
    }
    try {
      const raw = localStorage.getItem(STAGING_KEY);
      let items: string[] = [];
      if (raw) {
        const p = JSON.parse(raw);
        if (p && Array.isArray(p.items)) items = p.items;
      }
      if (!items.includes(pn)) {
        items.push(pn);
        localStorage.setItem(STAGING_KEY, JSON.stringify({ __v: STAGING_VERSION, items }));
      }
    } catch {
      /* staging 저장 실패 무시 */
    }
  }
  // 전역 중복 정리 (2026-08-28) — 오염된 로컬 데이터도 읽을 때 자동 교정
  const cleaned = sanitizePlacementMap(data);
  const changed = Object.keys(cleaned).length !== Object.keys(data).length
    || JSON.stringify(cleaned) !== JSON.stringify(data);
  if (fixed || changed) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ __v: SAVED_VERSION, data: cleaned }));
    } catch {
      /* 저장 실패 시 무시 */
    }
  }
  return cleaned;
}

/** 임시 보관함 로드 — 손상/버전 불일치 시 칵투스/데크 기본값 */
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
    /* 손상 시 기본값 */
  }
  return [...A_STAGING_DEFAULT];
}

/** 제품 마스터 항목 (pnum → 정보) — 제품목록 기준 */
type MasterInfo = { pnum: string | null; name: string; lg: string; md: string; stock: number | null; barcode: string; loc: string; no3m: boolean };

/** [구형 파일 전용·마스터/검색 경로 사용 금지] 로케이션 → 제품번호 (옛 체계: 끝번호=제품번호).
 *  A안(2026-08-30) 신규 체계에서는 로케이션 끝번호 = 배치표 위치번호(locNo)이므로
 *  마스터 로드·검색에서 이 변환을 쓰면 제품을 연쇄 오독한다. 엑셀 업로드 구형 파일 폴백 전용. */
function legacyLocToPnum(loc: string): string | null {
  const m1 = /^320-A1-1-(\d+)$/.exec(loc.trim());
  if (m1) return String(parseInt(m1[1], 10));
  const m2 = /^320-A1-2-(\d+)$/.exec(loc.trim());
  if (m2) {
    const n = parseInt(m2[1], 10);
    return n < 100 ? String(2000 + n) : "2" + m2[1];
  }
  return null;
}

export default function ProductDisplayPage() {
  const [dong, setDong] = useState<DongKey>("ALL");
  // 모바일 조회 뷰 (2026-08-25): 목록형 읽기 전용 — 그리드 대신 칸 목록으로 제품 확인
  const [mobileView, setMobileView] = useState(false);
  const [data, setData] = useState<PlacementMap>(() => loadPlacement());
  const [modalOpen, setModalOpen] = useState(false);
  const [currentZone, setCurrentZone] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [assignSearch, setAssignSearch] = useState(""); // 제품 배정 다이얼로그 검색어
  const [movePnum, setMovePnum] = useState<string | null>(null); // 자리이탈 품목 이동 모드 (클릭한 칸으로 배치)
  const [saveMsg, setSaveMsg] = useState("");
  // 총괄 우측 패널: 배치/미배치 대분류별 목록 + 선택 상세
  const [panelTab, setPanelTab] = useState<"placed" | "unplaced" | "overflow" | "staging" | "noout3m" | "list" | "server">("placed");
  // 우측 배치/미배치 카드 접기 (2026-09-05): 개별동에서 배치도가 카드와 겹쳐 우측 칸을
  // 가리는 문제 해결 — 접으면 배치도가 전체 폭을 사용. (총괄 뷰는 항상 펼침)
  const [panelOpen, setPanelOpen] = useState(true);
  const [openLg, setOpenLg] = useState<string | null>(null); // 분류 아코디언 (null=전부 접힘)
  const [selPnum, setSelPnum] = useState<string | null>(null);
  const [selZone, setSelZone] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  // 검색 결과로 이동한 슬롯 (깜박임 표시)
  const [flashZone, setFlashZone] = useState<string | null>(null);
  // 출고 이력: barcode → dailyData (최근 90일)
  const [outboundMap, setOutboundMap] = useState<Record<string, { date: string; quantity: number; salesAmount?: number }[]>>({});
  // 제품 마스터: pnum → 정보 (제품목록 기준 — /api/master/specs의 is_vf_item)
  const [masterMap, setMasterMap] = useState<Record<string, MasterInfo>>({});
  // 마스터 전체 행 (중복 제품번호 바코드 구별용 — is_vf_item 필터 없음) (2026-08-22)
  const [masterRows, setMasterRows] = useState<MasterInfo[]>([]);
  // 3개월 미출고 pnum 집합 (masterMap 중복 덮어쓰기 방지용 별도 Set)
  const [no3mPnums, setNo3mPnums] = useState<Set<string>>(new Set());
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
  // 재배치 설정 다이얼로그
  const [placementDialogOpen, setPlacementDialogOpen] = useState(false);
  const [placementMode, setPlacementMode] = useState<"outbound" | "category">("outbound");
  const [placementTopN, setPlacementTopN] = useState(40);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [targetDong, setTargetDong] = useState<string>("A");
  const [onlySelectedCategories, setOnlySelectedCategories] = useState(false);
  const [restItemsPerSlot, setRestItemsPerSlot] = useState<1 | 2 | 3>(2);

  // 실제 존재하는 대분류 목록 (품목 수 포함)
  const availableCategories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const m of Object.values(masterMap)) {
      if (m.lg && !m.no3m) {
        cats.set(m.lg, (cats.get(m.lg) || 0) + 1);
      }
    }
    return Array.from(cats.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({ cat, count }));
  }, [masterMap]);
  // 칸 직접 입력 (수기 편집): 클릭 → 인라인 input → "19,28" 콤마 구분 저장
  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [editLocVal, setEditLocVal] = useState("");
  const editingZoneRef = useRef<string | null>(null); // Enter→blur race-safe 가드 (M1)
  // 그리드 여유 공간 (확장 버튼으로 필요할 때만 증가, 기본 0 = 현재 그리드만 표시)
  const [gridPad, setGridPad] = useState({ t: 0, r: 0, b: 0, l: 0 });
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [selRect, setSelRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const selStartRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const selMovedRef = useRef(false);
  const selSuppressClickRef = useRef(false);
  // 동적 레이아웃: 칸(슬롯) 좌표 이동 반영 (초기값 = localStorage 저장분 or DONG_LAYOUTS)
  const [layoutState, setLayoutState] = useState(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.__v === LAYOUT_VERSION && Array.isArray(parsed.layout) && parsed.layout.length === DONG_LAYOUTS.length) {
          const restored = hydrateZoneSplitDir(parsed.layout as typeof DONG_LAYOUTS);
          // L7 잔재 번호 정리 (2026-09-04): 구 빌더 하드코딩(115~122) 제거 — 모든 칸은 좌표로만 식별
          const cleaned = restored.map((d) => ({
            ...d,
            zones: d.zones.map((z) =>
              /^A-L7-\d+$/.test(z.id) && typeof z.locNo === "number" && z.locNo >= 115 && z.locNo <= 122
                ? { ...z, locNo: undefined }
                : z
            ),
          }));
          // A동 존 표준 그리드 재정렬 (2026-09-05) — 저장본의 뒤섞인 존 좌표를 복원 시 정상화
          return stripZoneLocNos(canonicalizeALayoutZones(cleaned));
        }
      }
    } catch {
      /* 손상 시 기본값 */
    }
    return stripZoneLocNos(canonicalizeALayoutZones(
      DONG_LAYOUTS.map((d) => ({ ...d, zones: d.zones.map((z) => ({ ...z, style: { ...z.style } })) }))
    ));
  });
  // 데이터 자동 저장 (소실 안전망) — 모든 변경 즉시 localStorage 반영
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ __v: SAVED_VERSION, data }));
    } catch {
      /* 용량/오류 무시 */
    }
  }, [data]);

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

  // 로케이션 번호 공유 예외칸 (사용자 지정 — 한 칸 여러 품목이어도 번호 1개만 소진)
  const [locExceptions, setLocExceptions] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(LOC_EXC_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
    } catch {
      return new Set<string>();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LOC_EXC_KEY, JSON.stringify(Array.from(locExceptions)));
    } catch {
      /* 무시 */
    }
  }, [locExceptions]);

  // 수동 로케이션 번호 (사용자 지정 — zoneId → 첫 번호, 이후 품목 수만큼 연속·자동 밀림)
  const [manualLocNos, setManualLocNos] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(MANUAL_LOC_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed != null && !Array.isArray(parsed)) return parsed as Record<string, number>;
      }
    } catch {
      /* 무시 */
    }
    return {};
  });
  useEffect(() => {
    try {
      localStorage.setItem(MANUAL_LOC_KEY, JSON.stringify(manualLocNos));
    } catch {
      /* 무시 */
    }
  }, [manualLocNos]);

  // 라인 구성 오버라이드 (초기값 = localStorage 저장분 — 반영은 레이아웃 재빌드 시)
  // ※ 편집 패널: 수정 모드 우측 "라인 설정" (2026-08-23)
  const [lineConfig, setLineConfig] = useState<LineConfigMap>(INITIAL_LINE_CONFIG);
  useEffect(() => {
    try {
      localStorage.setItem(LINE_CONFIG_KEY, JSON.stringify({ __v: LINE_CONFIG_VERSION, data: lineConfig }));
    } catch {
      /* 용량/오류 무시 */
    }
  }, [lineConfig]);

  // ═══ 서버 영속화 (2026-08-23) — 4개 상태 통합 스냅샷, 2초 디바운스 POST ═══
  const [serverVersion, setServerVersion] = useState<number | null>(null);
  const [serverSyncError, setServerSyncError] = useState(false); // 3회 재시도 실패 → 헤더 경고
  const [serverRetrying, setServerRetrying] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<{ serverVersion: number; serverPayload: PdSnapshotPayload | null } | null>(null);
  const conflictPendingRef = useRef(false); // last-write-wins 전환: 항상 false — 자동 저장 항상 허용
  useEffect(() => { conflictPendingRef.current = false; }, []);
  const [lastServerSave, setLastServerSave] = useState<{ at: string; by: string } | null>(null);
  const [historyList, setHistoryList] = useState<PdHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [lineConfigPanelOpen, setLineConfigPanelOpen] = useState(false);
  // 라인 설정 편집 입력값 (적용 버튼으로 lineConfig에 반영)
  const [lcSelDong, setLcSelDong] = useState<"A" | "B" | "C" | "D">("A");
  const [lcSelLine, setLcSelLine] = useState("1");
  const [lcCount, setLcCount] = useState("");
  const [lcBadge, setLcBadge] = useState("");
  const [lcHidden, setLcHidden] = useState<Set<number>>(new Set());
  const [lcHiddenInput, setLcHiddenInput] = useState("");
  const serverVerRef = useRef<number | null>(null); // forceSave 등 비동기 경로에서 최신 버전 조회용
  const pdSyncTimer = useRef<number | null>(null);
  const serverRestoreRef = useRef(false); // 서버판 적용 시 4개 useEffect → echo 저장 1회 스킵
  const pdEchoGuardRef = useRef(false); // 서버판 적용 직후 디바운스 저장 1회 스킵 (불필요 버전 증가 방지)
  const pdDirtyRef = useRef(false); // 미저장 변경 플래그 (수동 저장 전용 모드)
  const snapshotRef = useRef<PdSnapshotPayload | null>(null); // 즉시 저장(복원·충돌)용 최신 스냅샷 캐시

  /** 최신 4개 상태 → 통합 스냅샷 (저장 직전 시각 갱신) */
  const buildSnapshot = useCallback((): PdSnapshotPayload => {
    const snap: PdSnapshotPayload = {
      data,
      // A동 존 표준 그리드 재정렬 (2026-09-05) + 번호 필드 제거(파생값 — 저장 안 함)
      layout: stripZoneLocNos(canonicalizeALayoutZones(layoutState)),
      lineConfig,
      staging,
      locExceptions: Array.from(locExceptions),
      manualLocNos: Object.keys(manualLocNos).length ? { ...manualLocNos } : undefined,
      savedAt: new Date().toISOString(),
    };
    snapshotRef.current = snap;
    try {
      localStorage.setItem(SAVEDAT_KEY, snap.savedAt);
    } catch {
      /* 무시 */
    }
    return snap;
  }, [data, layoutState, lineConfig, staging, locExceptions, manualLocNos]);

  /** 서버 저장 (낙관적 락) — 409: 충돌 배너 / 네트워크 실패: 재시도·경고 */
  const pdSaveToServer = useCallback(
    async (snap: PdSnapshotPayload, baseVersion: number | null, force: boolean) => {
      // 전역 중복 정리 후 저장 (2026-08-28) — 오염 데이터가 서버에 다시 저장되지 않도록 방어
      const cleanSnap: PdSnapshotPayload = { ...snap, data: sanitizePlacementMap(snap.data) };
      const body: { payload: string; saved_by: string; base_version?: number } = {
        payload: JSON.stringify(cleanSnap),
        saved_by: "browser",
      };
      if (baseVersion != null) body.base_version = baseVersion;
      try {
        const resp = await fetch("/api/product-display", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (resp.status === 409) {
          // last-write-wins: 서버판을 받아온 뒤 내 현재 상태로 강제 덮어쓰기 (충돌 배너 폐지, 2026-08-25)
          setServerSyncError(false);
          void pdSaveToServer(snapshotRef.current || snap, null, true);
          return;
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const j = await resp.json();
        if (typeof j?.version === "number") {
          serverVerRef.current = j.version;
          setServerVersion(j.version);
        }
        setServerSyncError(false);
        setConflictInfo(null);
        setLastServerSave({ at: snap.savedAt, by: "browser" });
      } catch {
        if (!force) {
          // 네트워크 실패 → 3회 재시도 (0.5초 간격)
          for (let i = 0; i < 3; i++) {
            await new Promise((r) => window.setTimeout(r, 500));
            try {
              const resp = await fetch("/api/product-display", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              });
              if (resp.status === 409) {
                // last-write-wins: 재시도 경로에서도 강제 덮어쓰기
                setServerSyncError(false);
                void pdSaveToServer(snapshotRef.current || snap, null, true);
                return;
              }
              if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
              const jj = await resp.json();
              if (typeof jj?.version === "number") {
                serverVerRef.current = jj.version;
                setServerVersion(jj.version);
              }
              setServerSyncError(false);
              setLastServerSave({ at: snap.savedAt, by: "browser" });
              return;
            } catch {
              /* 다음 재시도로 */
            }
          }
        }
        setServerSyncError(true); // ⚠ 서버 미동기(로컬 전용)
      }
    },
    []
  );

  /** 변경 감지 → 서버 자동 저장 (수동 저장 버튼 방식으로 전환: 호출 안 함) */
  const scheduleServerSave = useCallback(() => {
    // 수동 저장 전용: 상태 변경 시 서버 저장하지 않음. 저장 버튼(saveData)에서만 저장.
    if (serverRestoreRef.current) return; // 서버판 적용 중 echo 스킵 유지
    pdDirtyRef.current = true;
  }, []);

  /** 대기 중인 저장을 즉시 실행 (복원 전 자동 저장·수동 재시도·충돌 덮어쓰기) */
  const pdFlushNow = useCallback(
    async (force = false) => {
      if (pdSyncTimer.current != null) {
        window.clearTimeout(pdSyncTimer.current);
        pdSyncTimer.current = null;
      }
      await pdSaveToServer(buildSnapshot(), serverVerRef.current, force);
    },
    [buildSnapshot, pdSaveToServer]
  );

  /** 서버판(스냅샷) → 4개 상태 + 로컬 키 동기화 (에코 저장 스킵 + 버전/시각 반영) */
  const applyServerPayload = useCallback((p: PdSnapshotPayload, version?: number, meta?: { at?: string; by?: string }) => {
    serverRestoreRef.current = true;
    pdEchoGuardRef.current = true;
    // 전역 중복 정리 후 상태 적용 (2026-08-28) — 로컬 저장도 동일 데이터 사용
    const cleanData = sanitizePlacementMap(p.data);
    setData(cleanData);
    // A동 존 표준 그리드 재정렬 (2026-09-05) — 서버판 복원 시 저장본 뒤섞인 좌표 정상화
    const canonLayout = stripZoneLocNos(canonicalizeALayoutZones(hydrateZoneSplitDir(p.layout)));
    setLayoutState(canonLayout);
    setLineConfig(p.lineConfig);
    setStaging(p.staging);
    setLocExceptions(new Set(p.locExceptions || []));
    setManualLocNos(typeof p.manualLocNos === "object" && p.manualLocNos != null ? { ...p.manualLocNos as Record<string, number> } : {});
    writeLocalFromPayload({ ...p, data: cleanData, layout: canonLayout });
    if (typeof version === "number") {
      serverVerRef.current = version;
      setServerVersion(version);
    }
    if (meta?.at) setLastServerSave({ at: meta.at, by: meta.by || "server" });
  }, []);

  // 4개 상태 변경 → 서버 동기 저장 스케줄 (스킵 플래그는 서버판 적용 직후 1회)
  useEffect(() => {
    if (serverRestoreRef.current) {
      serverRestoreRef.current = false;
      return;
    }
    scheduleServerSave();
  }, [data, layoutState, lineConfig, staging, scheduleServerSave]);

  /** 초기 로드·시드 — 서버판이 더 최신이면 복원, 없으면 로컬 상태 시드 업로드 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let latest: { found?: boolean; version?: number; payload?: string; saved_by?: string; created_at?: string } | null = null;
      try {
        const resp = await fetch("/api/product-display/latest");
        if (resp.ok) latest = await resp.json();
      } catch {
        if (!cancelled) setServerSyncError(true);
        return;
      }
      if (cancelled) return;
      if (!latest) return;
      if (latest.found) {
        if (typeof latest.version === "number") {
          serverVerRef.current = latest.version;
          setServerVersion(latest.version);
        }
        if (latest.created_at) setLastServerSave({ at: latest.created_at, by: latest.saved_by || "server" });
        const p = parsePdPayload(latest.payload);
        if (!p) {
          // 파싱 실패 → 서버판 무시·로컬 유지 (경고만)
          setSaveMsg("⚠ 서버 데이터 파싱 실패 — 로컬 유지");
          window.setTimeout(() => setSaveMsg(""), 3000);
          return;
        }
        const localSavedAt = localStorage.getItem(SAVEDAT_KEY) || "";
        // 내용 비교 (타임스탬프 비교 폐기 — 스태일 탭의 조용한 덮어쓰기 방지, 2026-08-23)
        const fp = (x: PdSnapshotPayload) => JSON.stringify([x.data, x.staging, x.lineConfig]);
        let localSnap: PdSnapshotPayload | null = null;
        try { localSnap = buildSnapshot(); } catch { /* 빌드 전 무시 */ }
        const identical = localSnap ? fp(p) === fp(localSnap) : false;
        if (!localSavedAt) {
          // 로컬 저장 이력 없음(첫 방문/캐시 삭제) → 서버판 적용
          applyServerPayload(p, typeof latest.version === "number" ? latest.version : undefined, {
            at: latest.created_at,
            by: latest.saved_by,
          });
          setSaveMsg("✅ 서버 버전 불러옴");
          window.setTimeout(() => setSaveMsg(""), 2000);
          return;
        }
        if (identical) {
          // 내용 동일 → 버전·시각만 반영
          return;
        }
        // 내용 달라도 서버판이 정답 (last-write-wins — 어느 기기에서 접속해도 동일 화면, 2026-08-25)
        applyServerPayload(p, typeof latest.version === "number" ? latest.version : undefined, {
          at: latest.created_at,
          by: latest.saved_by,
        });
        setSaveMsg("✅ 서버 최신 버전 적용됨");
        window.setTimeout(() => setSaveMsg(""), 2000);
        return;
      }
      // found=false → 현재 로컬 상태를 최초 업로드(시드) — 실패 시 재시도/경고 로직 재사용
      void pdSaveToServer(buildSnapshot(), null, false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** (구) 충돌 처리 함수 — last-write-wins 전환으로 미사용, 2026-08-25 제거 대상 */

  /** 히스토리 목록 조회 (서버 버전 탭) */
  const pdLoadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const resp = await fetch("/api/product-display/history");
      if (resp.ok) {
        const j = await resp.json();
        setHistoryList(Array.isArray(j?.history) ? j.history : []);
      }
    } catch {
      /* 조회 실패 시 목록 유지 */
    }
    setHistoryLoading(false);
  }, []);

  /** 서버 버전 복원 — 적용 전 현재 상태를 즉시 저장(되돌리기 가능), 404 → 토스트 */
  const pdRestoreVersion = async (version: number) => {
    if (!window.confirm(`버전 ${version}을(를) 복원할까요? (현재 상태는 먼저 저장됩니다)`)) return;
    await pdFlushNow(true); // 적용 전 현재 상태 즉시 서버 저장
    try {
      const resp = await fetch("/api/product-display/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, saved_by: "restore" }),
      });
      if (resp.status === 404) {
        setSaveMsg("⚠ 삭제된 버전입니다");
        window.setTimeout(() => setSaveMsg(""), 3000);
        void pdLoadHistory();
        return;
      }
      if (!resp.ok) {
        setSaveMsg("⚠ 복원 실패 — 잠시 후 다시 시도하세요");
        window.setTimeout(() => setSaveMsg(""), 3000);
        return;
      }
      const j = await resp.json();
      if (typeof j?.version === "number") {
        serverVerRef.current = j.version;
        setServerVersion(j.version);
      }
      // 복원된 내용 로드
      const resp2 = await fetch("/api/product-display/latest");
      if (!resp2.ok) return;
      const j2 = await resp2.json();
      const p = parsePdPayload(j2?.payload);
      if (!p) {
        setSaveMsg("⚠ 복원 데이터 파싱 실패 — 로컬 유지");
        window.setTimeout(() => setSaveMsg(""), 3000);
        return;
      }
      applyServerPayload(p, typeof j2?.version === "number" ? j2.version : undefined, {
        at: j2?.created_at ?? p.savedAt,
        by: j2?.saved_by || "restore",
      });
      setSaveMsg(`✅ 버전 ${version} 복원 완료 (새 버전 ${j?.version})`);
      window.setTimeout(() => setSaveMsg(""), 3000);
      void pdLoadHistory();
    } catch {
      setSaveMsg("⚠ 복원 실패 — 네트워크 확인");
      window.setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  /** 헤더 "마지막 서버 저장" 표시용 텍스트 */
  const lastServerSaveText = lastServerSave ? `${fmtPdSaved(lastServerSave.at)} (${lastServerSave.by})` : "";

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

  // 제품 마스터 로드 (제품목록 기준 — is_vf_item만)
  useEffect(() => {
    fetch("/api/master/specs")
      .then((r) => r.json())
      .then((j) => {
        const arr = Array.isArray(j) ? j : (j?.data ?? j?.results ?? []);
        const m: Record<string, MasterInfo> = {};
        const no3m = new Set<string>();
        const allRows: MasterInfo[] = [];
        for (const it of arr) {
          const pn = it.product_number != null ? String(it.product_number) : null;
          const entry: MasterInfo = {
            pnum: pn,
            name: it.product_name || "",
            lg: it.category_lg || "",
            md: it.category_md || "",
            stock: it.current_stock ?? null,
            barcode: it.barcode || "",
            loc: it.location || "",
            no3m: Boolean(it.is_no_outbound_3m),
          };
          allRows.push(entry);
          if (!it?.is_vf_item) continue;
          if (pn) {
            if (!m[pn] || entry.no3m || (entry.loc && !m[pn].loc)) m[pn] = entry;
            if (entry.no3m) no3m.add(pn);
          }
        }
        setMasterRows(allRows);
        setMasterMap(m);
        setNo3mPnums(no3m);
      })
      .catch(() => {
        /* 마스터 로드 실패 시 하드코딩 데이터 fallback */
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

  // 최근 30일 출고 박스 합계 (barcode 기준 — 상세/목록 표시용)
  const calcMonthQty = (barcode: string): number => {
    const daily = outboundMap[barcode];
    if (!daily || daily.length === 0) return 0;
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    let total = 0;
    for (const d of daily) {
      const t = new Date(d.date + "T00:00:00").getTime();
      const diff = Math.floor((now.getTime() - t) / dayMs);
      if (diff < 0 || diff > 30) continue;
      total += d.quantity;
    }
    return total;
  };

  // 최근 30일 출고 수량 + 금액 (배치 기준 명시용)
  const calcMonthStat = (barcode: string): { qty: number; amount: number } | null => {
    const daily = outboundMap[barcode];
    if (!daily || daily.length === 0) return null;
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    let qty = 0, amount = 0;
    for (const d of daily) {
      const t = new Date(d.date + "T00:00:00").getTime();
      const diff = Math.floor((now.getTime() - t) / dayMs);
      if (diff < 0 || diff > 30) continue;
      qty += d.quantity || 0;
      amount += d.salesAmount || 0;
    }
    return { qty, amount };
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

  // 통합 미배치: 제품 마스터 기준 — VF 품목 중 배치 안 된 것 (3개월 미출고 제외)
  // 마스터 미로드 시 기존 A_UNPLACED 하드코딩 fallback
  // boxes = 최근 1개월 출고 박스 수 (outboundMap 기반) → 미배치 탭 출고 상위순 정렬에 사용
  const unplaced = useMemo(() => {
    const masterKeys = Object.keys(masterMap);
    if (masterKeys.length > 0) {
      return masterKeys
        .filter((k) => !placedPnums.has(k) && !no3mPnums.has(k) && masterMap[k].name)
        .map((k) => ({
          rank: 0,
          pnum: k,
          boxes: masterMap[k].barcode ? calcMonthQty(masterMap[k].barcode) : 0,
          cat: masterMap[k].lg,
          name: masterMap[k].name,
          loc: masterMap[k].loc,
          barcode: masterMap[k].barcode,
          master_name: masterMap[k].name,
          category_lg: masterMap[k].lg,
          category_md: masterMap[k].md,
          stock: masterMap[k].stock,
        }));
    }
    return A_UNPLACED.filter((u) => !placedPnums.has(u.pnum));
  }, [masterMap, placedPnums, no3mPnums, outboundMap]);

  // 배치된 품목 행 (제품 마스터 기준 정보 — fallback 하드코딩)
  // itemIdx: 칸 값 콤마 리스트 내 인덱스 (배치 내역 행 드래그 시 원본 위치 특정용)
  const placedRows = useMemo(() => {
    const rows: { pnum: string; name: string; lg: string; md: string; stock: number | null; zone: string; qty: number; itemIdx: number }[] = [];
    const seen = new Set<string>();
    for (const [zid, val] of Object.entries(data)) {
      const pns = (val || "").split(",").map((s) => s.trim()).filter(Boolean);
      pns.forEach((pn, idx) => {
        const key = `${zid}-${pn}`;
        if (seen.has(key)) return;
        seen.add(key);
        const m = masterMap[pn];
        const info = B_PNUM_INFO[pn] || C_PNUM_INFO[pn] || D_PNUM_INFO[pn];
        const barcode = m?.barcode || info?.barcode || "";
        rows.push({
          pnum: pn,
          name: m?.name || info?.name || A_ZONE_MASTER_NAME[zid] || "",
          lg: m?.lg || info?.lg || A_ZONE_CATEGORY_LG[zid] || "기타",
          md: m?.md || info?.md || A_ZONE_CATEGORY_MD[zid] || "",
          stock: m ? m.stock : (info?.stock ?? A_ZONE_STOCK[zid] ?? null),
          zone: zid,
          qty: barcode ? calcMonthQty(barcode) : 0,
          itemIdx: idx,
        });
      });
    }
    return rows;
  }, [data, masterMap, outboundMap]);

  // 3개월 미출고 행: 마스터 기준 (is_no_outbound_3m) — 미로드 시 A_NO_OUTBOUND_3M fallback
  const noOut3mRows = useMemo(() => {
    const masterKeys = Object.keys(masterMap);
    if (masterKeys.length > 0 && no3mPnums.size > 0) {
      return masterKeys
        .filter((k) => no3mPnums.has(k) && masterMap[k].name)
        .map((k) => ({
          pnum: k,
          name: masterMap[k].name,
          lg: masterMap[k].lg || "기타",
          md: masterMap[k].md,
          stock: masterMap[k].stock,
          zone: masterMap[k].loc || undefined,
        }));
    }
    return A_NO_OUTBOUND_3M.map((u) => ({
      pnum: u.pnum,
      name: u.master_name || u.name,
      lg: u.category_lg || u.cat || "기타",
      md: u.category_md,
      stock: u.stock,
      zone: u.loc || undefined,
    }));
  }, [masterMap, no3mPnums]);

  // 동적 로케이션 번호 (2026-09-05): 좌표·칸 고정 + 제품 유동 → 번호는 배치(data)에서 파생 재계산.
  // layoutState·data가 바뀌면 항상 최신 기준으로 발행된다 (번호는 저장값이 아님).
  const dynLocNos = useMemo(
    () => computeLocNosAll(layoutState, data, locExceptions, manualLocNos),
    [layoutState, data, locExceptions, manualLocNos]
  );
  // 존 ID → 로케이션 번호 배열 (전 동) — 표시·검색·모바일 공용
  const coordNosByZone = dynLocNos.byZone;

  // 제품번호 → 배치도 위치번호 맵(전 동) — 좌표 귀속 (2026-09-04): 존의 현재 좌표의 기준표 번호
  const pnumLocNoMap = useMemo(() => {
    const nosByZone: Record<string, number[]> = {};
    for (const [zid, nos] of coordNosByZone) nosByZone[zid] = nos;
    const map = new Map<string, number>();
    for (const [zid, nos] of Object.entries(nosByZone)) {
      const pns = (data[zid] || "").split(",").map((s) => s.trim()).filter(Boolean);
      pns.forEach((pn, i) => {
        const n = nos?.length === 1 ? nos[0] : nos?.[i];
        if (n && n > 0) map.set(pn, n);
      });
    }
    return map;
  }, [coordNosByZone, data]);

  // 검색: 제품명 / 로케이션(배치도 위치번호) / 제품번호 / 바코드
  const searchResults = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return [];
    type Hit = {
      pnum: string;
      name: string;
      loc: string;
      locNo: number | null;
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
        const name = binfo?.name || masterMap[pn]?.name || A_ZONE_MASTER_NAME[zid] || "";
        const barcode = binfo?.barcode || masterMap[pn]?.barcode || A_ZONE_BARCODE[zid] || "";
        const loc = masterMap[pn]?.loc || "";
        const locNo = pnumLocNoMap.get(pn) ?? null;
        const dong: DongKey = zid.startsWith("B-")
          ? "B"
          : zid.startsWith("C-")
            ? "C"
            : zid.startsWith("D-")
              ? "D"
              : zid.startsWith("E-")
                ? "E"
                : "A";
        if (
          match(pn) ||
          match(name) ||
          match(loc) ||
          match(zid) ||
          match(barcode) ||
          (locNo !== null && String(locNo).includes(q))
        ) {
          hitOf({ pnum: pn, name, loc: loc || "", locNo, zone: zid, dong, placed: true });
        }
      }
    }
    // 2) 미배치 제품 (통합 미배치) — u.loc은 마스터(쿠팡 전산) 값이라 위치번호 없음
    for (const u of unplaced) {
      const name = u.master_name || u.name || "";
      if (match(u.pnum) || match(name) || match(u.loc) || match(u.barcode)) {
        hitOf({ pnum: u.pnum, name, loc: u.loc, locNo: null, zone: null, dong: null, placed: false });
      }
    }

    // 정렬: 정확 일치(0) → 번호 접두 일치(1) → 그 외(2).
    // 동순위 내: 배치(placed) 우선 → pnum 숫자 오름차순(같으면 문자열 비교).
    const rankOf = (h: Hit) => {
      const pn = h.pnum.toLowerCase();
      if (pn === q) return 0;
      if (pn.startsWith(q)) return 1;
      return 2;
    };
    const numCmp = (a: string, b: string) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (Number.isNaN(na) && Number.isNaN(nb)) return a < b ? -1 : a > b ? 1 : 0;
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      if (na !== nb) return na - nb;
      return a < b ? -1 : a > b ? 1 : 0;
    };
    hits.sort((a, b) => {
      const ra = rankOf(a);
      const rb = rankOf(b);
      if (ra !== rb) return ra - rb;
      if (a.placed !== b.placed) return a.placed ? -1 : 1;
      return numCmp(a.pnum, b.pnum);
    });

    return hits.slice(0, 40);
  }, [searchQ, data, unplaced, masterMap, pnumLocNoMap]);

  const gotoSearchHit = (h: (typeof searchResults)[number]) => {
    if (h.placed && h.zone && h.dong) {
      // 총괄(ALL) 화면에서 표시 — 동 이동 대신 축소 카드 flash + selZone
      setDong("ALL");
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

  // 실제 존 포함 그리드 콘텐츠 크기 (2026-09-05): C동처럼 우측 확장 칸(C-R14-C21 등)이
  // layout 폭(current.width)을 넘으면 그리드 경계 밖으로 나가 클릭불가 → 최대 존 right/bottom까지 확장.
  const gridContentW = useMemo(() => {
    const base = (current.width || 0) + (gridPad.l || 0) + (gridPad.r || 0);
    const maxRight = Math.max(
      base,
      ...current.zones.map((z) => Number(z.style.left ?? 0) + Number(z.style.width ?? SLOT.w) + (gridPad.r || 0))
    );
    return maxRight;
  }, [current, gridPad]);
  const gridContentH = useMemo(() => {
    const base = (current.height || 0) + (gridPad.t || 0) + (gridPad.b || 0);
    const maxBottom = Math.max(
      base,
      ...current.zones.map((z) => Number(z.style.top ?? 0) + Number(z.style.height ?? SLOT.h) + (gridPad.b || 0))
    );
    return maxBottom;
  }, [current, gridPad]);

  // 물리 그리드 좌표 라벨 — 전 동 통일 "행-열" 숫자 체계 (2026-08-28)
  // 2026-09-03 좌표계 규칙 확정(공유/배치도-좌표계-규칙-확정-20260903.md) 반영:
  //   X = 좌→우 1..N (점유 열 픽셀 클러스터), Y = 아래(top큰)=1 ~ 위(top작)=N.
  //   행/열 산출과 coordOf는 buildGridCoordSystem(단일 구현) 사용 — 검색·총괄 coordOfAll과
  //   항상 동일 좌표. A동은 통로 행 포함 38px 연속 행, B/C/D는 점유 행 클러스터 아래→위.
  const gridLabels = useMemo(() => {
      const empty = { labels: [] as LineLabel[], coordOf: new Map<string, string>(), locOuter: new Set<string>() };
      if (dong === "ALL") return empty;
      const sys = buildGridCoordSystem(dong, current.zones);
      if (!sys) return empty;
      const { gc, rowRepsDesc, colReps, coordOf } = sys;
      const labels: LineLabel[] = [];
      const maxColX = Math.max(...current.zones.map((z) => Number(z.style.left ?? 0) + Number(z.style.width ?? SLOT.w)));
      const maxRowY = Math.max(...current.zones.map((z) => Number(z.style.top ?? 0) + Number(z.style.height ?? SLOT.h)));
      const lblStyle = (extra: React.CSSProperties): React.CSSProperties => ({ fontSize: 10, fontWeight: 700, color: "#2563eb", ...extra });
      const nCols = colReps.length;
      const nRows = rowRepsDesc.length;

      // 열 번호 라벨 (상단/하단) — X=1..N (좌→우)
      for (let col = 1; col <= nCols; col++) {
        const cx = colReps[col - 1];
        labels.push({ text: String(col), style: lblStyle({ left: cx - SLOT.w / 2, top: Math.max(2, gc.minTop - 18), width: SLOT.w, textAlign: "center" }) });
        labels.push({ text: String(col), style: lblStyle({ left: cx - SLOT.w / 2, top: maxRowY + 4, width: SLOT.w, textAlign: "center" }) });
      }

      // 행 번호 라벨 (좌측/우측) — Y=1(아래)..N(위)
      for (let row = 1; row <= nRows; row++) {
        const cy = rowRepsDesc[row - 1];
        labels.push({ text: String(row), style: lblStyle({ left: Math.max(0, gc.minLeft - 28), top: cy - 6, width: 24, textAlign: "right" }) });
        labels.push({ text: String(row), style: lblStyle({ left: maxColX + 6, top: cy - 6, width: 24, textAlign: "left" }) });
      }

      // coordOf: 존 ID → 물리 좌표 내부 키 "X-Y" — 라벨과 동일 규칙(buildGridCoordSystem)이라
      // 표시 좌표가 라벨과 항상 일치한다.

      // 좌표 기준 오버레이 (2026-09-05): A동 동적 발행 번호를 그리드 픽셀에 직접 렌더 —
      // 배치(data)·layout 기준 재계산(computeLocNosAll) 결과를 공용 사용 (존 위치·유무 무관)
      if (dong === "A") {
        const aCoordNos = dynLocNos.byCoord.get("A");
        if (aCoordNos) aCoordNos.forEach((nos, coord) => {
          const cMatch = /^(\d+)-(\d+)$/.exec(coord);
          if (!cMatch) return;
          const cxi = Number(cMatch[1]);
          const ryi = Number(cMatch[2]);
          const colPx = colReps[cxi - 1];
          const rowPx = rowRepsDesc[ryi - 1];
          if (colPx == null || rowPx == null) return;
          labels.push({
            text: fmtLocNos(nos),
            style: {
              left: colPx - SLOT.w / 2 + 2,
              top: rowPx - SLOT.h / 2 + 3,
              width: SLOT.w - 4,
              textAlign: "left",
              fontSize: 8,
              fontWeight: 700,
              color: "#d97706",
              fontFamily: "ui-monospace, monospace",
            },
          });
        });
      }

      // 로케이션 번호 표시는 좌표 기준 오버레이로 단일 렌더 (2026-09-04 — ZoneCell 측면 칩 폐기)
      return { labels, coordOf, locOuter: new Set<string>() };
    }, [dong, current.zones, dynLocNos]);

  // 전 동 칸 좌표 맵 (2026-08-31): 존 ID(A-L4-12 등) 표시 개념 폐지 — 위치는 좌표(X열, Y행)로만 확인한다.
  // 2026-09-03: gridLabels와 동일 규칙(buildGridCoordSystem 단일 구현)으로 통일 —
  // 구 computeGridCoords 점유 행 클러스터 + A동 슬롯번호계(rowLabelOf) 제거.
  // 내부 키는 존 ID → "X-Y" 그대로, 화면 표기는 fmtCoordKey가 담당.
  const coordOfAll = useMemo(() => {
    const m = new Map<string, string>();
    for (const lay of layoutState) {
      const sys = buildGridCoordSystem(lay.key, lay.zones);
      if (!sys) continue;
      sys.coordOf.forEach((v, zid) => m.set(zid, v));
    }
    return m;
  }, [layoutState]);
  const coordToZoneAll = useMemo(() => {
    // 동별 좌표 키 (2026-09-04): "A-9-21" — 동 간 동일 좌표 문자열 충돌 방지
    const m = new Map<string, string>();
    coordOfAll.forEach((coord, zid) => {
      const key = `${zid.split("-")[0]}-${coord}`;
      if (!m.has(key)) m.set(key, zid);
    });
    return m;
  }, [coordOfAll]);
  // 사용자 표시용 위치 라벨 (2026-09-05): 존 ID(A-L4-17 형식) 화면 표기 금지 — 좌표(X,Y)로만.
  // coordOfAll에 없는 커스텀 칸은 "칸"으로 표시 (존 ID 미노출).
  const zoneDisplayName = (zid: string | null): string => {
    if (!zid) return "칸";
    const c = coordOfAll.get(zid);
    return c ? `좌표 ${fmtCoordKey(c)}` : "칸";
  };

  // 가상 그리드 (2026-08-28, 수정 모드 전용): 현재 칸들이 차지한 열·행을 기준으로
  // 여백 공간까지 그리드를 확장해 점선 칸 표시 — 라인/칸을 빈 그리드 자리로 이동 가능하게 함.
  const ghostCells = useMemo(() => {
    if (!editMode) return [] as { left: number; top: number; width: number; height: number }[];
    const STEP_X = SLOT.w + 4;
    const STEP_Y = SLOT.h + SLOT.gapY;
    const zs = current.zones;
    if (zs.length === 0) return [];
    const roundTo = (v: number, step: number, origin: number) => origin + Math.round((v - origin) / step) * step;
    const minX = Math.min(...zs.map((z) => Number(z.style.left ?? 0)));
    const minY = Math.min(...zs.map((z) => Number(z.style.top ?? 0)));
    const maxX = Math.max(...zs.map((z) => Number(z.style.left ?? 0) + Number(z.style.width ?? SLOT.w)));
    const maxY = Math.max(...zs.map((z) => Number(z.style.top ?? 0) + Number(z.style.height ?? SLOT.h)));
    // 점유 셀 집합 (존재하는 칸은 실선으로 이미 그려짐)
    const occupied = new Set(
      zs.map((z) => `${roundTo(Number(z.style.left ?? 0), STEP_X, minX)}:${roundTo(Number(z.style.top ?? 0), STEP_Y, minY)}`)
    );
    const ghosts: { left: number; top: number; width: number; height: number }[] = [];
    const yStart = Math.max(0, minY - STEP_Y * 2); // 위쪽 여백 2행 추가
    const yEnd = maxY + STEP_Y * 2; // 아래쪽 여백 2행 추가
    for (let gy = yStart; gy <= yEnd; gy += STEP_Y) {
      const y = roundTo(gy, STEP_Y, minY);
      if (y < 0) continue;
      for (let gx = Math.max(0, minX - STEP_X); gx <= maxX; gx += STEP_X) {
        const x = roundTo(gx, STEP_X, minX);
        const key = `${x}:${y}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        ghosts.push({ left: x, top: y, width: SLOT.w, height: SLOT.h });
      }
    }
    return ghosts;
  }, [editMode, current.zones]);

  // 개별 동 화면 가로 확대 — 컨테이너 폭에 맞춰 지도 확대 표시 (수정 모드는 좌표 정밀도 위해 1배)
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  // 배치도 전용 수동 줌 — 동별 출고 비율 테이블과 독립적으로 배치도만 확대/축소 (2026-08-28)
  const [zoomFactor, setZoomFactor] = useState(1);
  /** 동별 기본 배율 (2026-09-05): C는 1.2로 하향 — 1.3이면 그리드(원본 폭 1136)가 scale 후
   *  컨테이너를 넘어 우측 맥스 라인(C-R14-C21 등)이 화면 밖/클릭불가가 됨 */
  const DONG_DEFAULT_ZOOM: Record<string, number> = { A: 1.2, B: 2.2, C: 1.2, D: 2.2 };
  useEffect(() => {
    const def = DONG_DEFAULT_ZOOM[dong];
    if (def) setZoomFactor(def);
    else setZoomFactor(1); // 총괄(ALL): 동별 기본 배율 미적용 — 총괄은 자체 auto-fit 사용
  }, [dong]);
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
  const zoomOut = () => setZoomFactor((z) => Math.max(0.3, Number((z - 0.1).toFixed(2))));
  const zoomReset = () => setZoomFactor(DONG_DEFAULT_ZOOM[dong] ?? 1);
  useEffect(() => {
    const compute = () => {
      // 자동 맞춤 확대 폐지 (2026-08-28) — 배율은 줌 컨트롤(zoomFactor)만 결정.
      // 우측 패널(동별 출고 비율 테이블 등)은 줌과 무관하게 항상 원래 크기 유지.
      setFitScale(1);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  });

  // A동 zone 시퀀스 (물리 순서) — shift 기준.
  // buildADongLayout은 라인 내림차순으로 zones를 생성하므로 cmpZoneOrderA로 물리 순서 정렬.
  const aSeq = useMemo(
    () =>
      (DONG_LAYOUTS.find((r) => r.key === "A")?.zones.map((z) => z.id) ?? []).sort(
        cmpZoneOrderA
      ),
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
        // 크로스동 중복 제거: 새 pnum이 B/C/D동에도 있으면 제거(전역 1칸 유일)
        removeCrossDongDupes(next, [src.pnum], dst.zoneId);
        
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
      // 고정 칸 가드 (2026-08-28): 드래그 이동 완전 차단
      if (current.zones.find((z) => z.id === src.zoneId)?.fixed) {
        setSaveMsg("🔒 고정 칸은 드래그 이동할 수 없습니다");
        window.setTimeout(() => setSaveMsg(""), 2000);
        setDragSource(null);
        return;
      }
      // 드래그한 칸을 보관함 드롭존에 놓음 → 칸 비우기 + 제품 보관 (A동 1칸 1품목)
      if (overId === "drop-staging") {
        setData((prev) => {
          const next = { ...prev };
          const val = next[src.zoneId];
          if (val) {
            const pns = val.split(",").map((s) => s.trim()).filter(Boolean);
            setStaging((s) => Array.from(new Set([...s, ...pns])));
            delete next[src.zoneId];
            
            persistLocal(next);
            return next;
          }
          return prev;
        });
        setDragSource(null);
        setSaveMsg("보관함에 넣음");
        window.setTimeout(() => setSaveMsg(""), 1500);
        return;
      }
      // T3(2026-08-19): 휴지통 드롭존 → 칸 삭제 + 제품(있으면) 임시보관함 이동
      if (overId === "drop-trash") {
        const val = data[src.zoneId];
        if (val) {
          const pns = val.split(",").map((s) => s.trim()).filter(Boolean);
          setStaging((s) => Array.from(new Set([...s, ...pns])));
        }
        setData((prev) => {
          const next = { ...prev };
          delete next[src.zoneId];
          persistLocal(next);
          return next;
        });
        // 레이아웃에서 칸 제거 (A동 고정 칸 포함 — 사용자 불필요 칸 삭제 지원)
        setLayoutState((prev) =>
          prev.map((d) => {
            if (d.key !== dong) return d;
            return { ...d, zones: d.zones.filter((z) => z.id !== src.zoneId) };
          })
        );
        setDragSource(null);
        setSaveMsg("칸 삭제됨");
        window.setTimeout(() => setSaveMsg(""), 1500);
        return;
      }
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
        // ⚠ 확대 배율 보정 (2026-08-28): dnd-kit translated는 화면(px) 단위,
        // 컨테이너는 scale() 적용 상태 → 배율로 나눠야 실제 그리드 좌표가 됨
        const translated = e.active.rect.current.translated;
        const cont = gridRef.current?.getBoundingClientRect();
        const scale = fitScale * zoomFactor || 1;
        if (translated && cont) {
          moveCellTo(
            src.zoneId,
            (translated.left - cont.left) / scale,
            (translated.top - cont.top) / scale
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
          // 크로스동 중복 제거: 새 pnum이 B/C/D동에도 있으면 제거(전역 1칸 유일)
          removeCrossDongDupes(next, [src.pnum], dst.zoneId);
          
          persistLocal(next);
        }
        return next;
      }

      const srcVal = next[src.zoneId];
      if (!srcVal) return prev;
      const srcItems = srcVal.split(",").map((s) => s.trim()).filter(Boolean);
      const srcItem = srcItems[src.itemIdx];
      if (!srcItem || srcItem !== src.pnum) return prev;

      // 체인 시프트 밀려남 품목 → 임시보관함(우측 패널) 기록 (공통 헬퍼, 2026-08-19 체인 시프트)
      const pushOverflow = (ov: string[]) => {
        if (!ov.length) return;
        setOverflow((o) => {
          const names = ov.map((pn) => {
            const m = masterMap[pn]?.name || "";
            return { pnum: pn, name: m, dansu: extractDansu(m), fromZone: dst.zoneId };
          });
          return [...o, ...names];
        });
      };

      const isA = src.zoneId.startsWith("A-") && dst.zoneId.startsWith("A-");
      if (isA) {
        // A동: 체인 시프트 (2026-08-19 체인 시프트) — dst 기존 제품은 aSeq 순서상
        // 다음 칸으로 연쇄 밀려남 (빈 칸에서 종료, 끝까지 점유면 마지막만 임시보관함).
        // 크로스동 중복 제거 먼저 → src 칸 제거(빈 칸 유지) → 체인 삽입.
        const next0 = { ...prev };
        removeCrossDongDupes(next0, [src.pnum]);
        delete next0[src.zoneId]; // src는 빈 칸 유지 — 당김 없음
        const { next: n2, overflow: ov } = aChainInsert(aSeq, next0, dst.zoneId, src.pnum);
        if (ov.length || n2[dst.zoneId] !== src.pnum) {
          pushOverflow(ov);
          
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
        } else if (dst.zoneId.startsWith("A-") && next[dst.zoneId]) {
          // B/C/D → A동 점유 칸: 체인 시프트 (2026-08-19 체인 시프트)
          // dst 기존 제품은 aSeq 순서상 다음 칸으로 연쇄 밀려남 (끝까지 점유면 마지막만 임시보관함).
          // 빈 칸 드롭은 기존 append 동작 유지 (아래 else).
          const filtered = srcItems.filter((_, i) => i !== src.itemIdx);
          if (filtered.length) next[src.zoneId] = filtered.join(",");
          else delete next[src.zoneId];
          const { next: n2, overflow: ov } = aChainInsert(aSeq, next, dst.zoneId, srcItem);
          Object.keys(next).forEach((k) => delete next[k]);
          Object.assign(next, n2);
          removeCrossDongDupes(next, [srcItem], dst.zoneId);
          pushOverflow(ov);
          changed = true;
        } else {
          // 다른 칸으로: 소스에서 제거 + 대상에 추가
          const filtered = srcItems.filter((_, i) => i !== src.itemIdx);
          const dstVal = next[dst.zoneId] || "";
          const dstItems = dstVal.split(",").map((s) => s.trim()).filter(Boolean);
          dstItems.push(srcItem);
          if (filtered.length) next[src.zoneId] = filtered.join(",");
          else delete next[src.zoneId];
          next[dst.zoneId] = dstItems.join(",");
          // 크로스동 중복 제거: 새 pnum이 B/C/D동 다른 칸에도 있으면 제거(전역 1칸 유일)
          removeCrossDongDupes(next, [srcItem], dst.zoneId);
          changed = true;
        }
      
      if (changed) persistLocal(next);
      return next;
    });
    setDragSource(null);
  };

  // ---- 수정 모드: 그룹 이동 + 영역 선택 ----

  // T2(2026-08-19): 선택 칸의 레이아웃 좌표를 위/아래 이웃 칸과 교환 (칸 자체가 이동)
  // 내용물(data)은 zoneId에 바인딩되어 있으므로 칸과 함께 자연스럽게 이동.
  const groupMove = (dir: 1 | -1) => {
    if (!selectedZones.length || !editMode) return;
    const STEP = SLOT.h + SLOT.gapY; // 세로 그리드 한 칸 (38px)
    const COL_TOL = SLOT.w * 0.6; // 같은 열(비슷한 x) 판정 허용 오차

    setLayoutState((prev) =>
      prev.map((d) => {
        if (d.key !== dong) return d;
        const zones = d.zones.map((z) => ({ ...z, style: { ...z.style } }));

        // 정렬: dir=1(위)=위쪽 칸 먼저, dir=-1(아래)=아래쪽 칸 먼저
        // → 블록 이동 시 순차 처리로 전체가 한 칸씩 이동
        // 고정 칸(fixed)은 이동·교환 대상에서 전부 제외 (2026-08-28)
        const selIdxs = selectedZones
          .map((zid) => zones.findIndex((z) => z.id === zid))
          .filter((i) => i >= 0 && !zones[i].fixed)
          .sort((a, b) => {
            const ay = Number(zones[a].style.top ?? 0);
            const by = Number(zones[b].style.top ?? 0);
            return dir === 1 ? ay - by : by - ay;
          });

        const selSet = new Set(selIdxs);

        for (const si of selIdxs) {
          const sx = Number(zones[si].style.left ?? 0);
          const sy = Number(zones[si].style.top ?? 0);
          const ty = sy + (dir === 1 ? -STEP : STEP); // 목적 그리드 한 칸 위/아래

          // 목적 그리드 자리에 비선택 칸이 있으면 좌표 교환 (라인 통째 교환 동작 유지)
          let best = -1;
          let bestDist = Infinity;
          for (let j = 0; j < zones.length; j++) {
            if (selSet.has(j)) continue;
            if (zones[j].fixed) continue; // 고정 칸과 교환 금지 (2026-08-28)
            const jx = Number(zones[j].style.left ?? 0);
            const jy = Number(zones[j].style.top ?? 0);
            if (Math.abs(jx - sx) > COL_TOL) continue;
            const dist = Math.abs(jy - ty);
            if (dist < bestDist) { bestDist = dist; best = j; }
          }

          if (best >= 0 && bestDist < SLOT.h) {
            // 점유 칸 → 교환
            const tmpStyle = { ...zones[si].style };
            zones[si] = { ...zones[si], style: { ...zones[best].style } };
            zones[best] = { ...zones[best], style: tmpStyle };
          } else {
            // 빈 그리드 자리(여백·가상 그리드 영역) → 그대로 한 칸 이동 (2026-08-28)
            zones[si] = { ...zones[si], style: { ...zones[si].style, top: Math.max(0, Math.round(ty)) } };
          }
        }

        return { ...d, zones };
      })
    );
  };

  // 좌우 이동 (2026-08-28): 상하 이동과 동일 패턴 — 방향키(←/→)·버튼 지원
  // dir: -1=왼쪽, 1=오른쪽. 이웃 칸이 있으면 교환, 빈 그리드 자리면 그대로 이동
  const groupMoveX = (dir: -1 | 1) => {
    if (!selectedZones.length || !editMode) return;
    const STEP = SLOT.w + 4; // 가로 그리드 한 칸 (52px)
    const ROW_TOL = SLOT.h * 0.6; // 같은 행(비슷한 y) 판정 허용 오차

    setLayoutState((prev) =>
      prev.map((d) => {
        if (d.key !== dong) return d;
        const zones = d.zones.map((z) => ({ ...z, style: { ...z.style } }));

        // 정렬: 오른쪽 이동이면 오른쪽 칸 먼저, 왼쪽 이동이면 왼쪽 칸 먼저 (블록 순차 처리)
        // 고정 칸(fixed)은 이동·교환 대상에서 전부 제외 (2026-08-28)
        const selIdxs = selectedZones
          .map((zid) => zones.findIndex((z) => z.id === zid))
          .filter((i) => i >= 0 && !zones[i].fixed)
          .sort((a, b) => {
            const ax = Number(zones[a].style.left ?? 0);
            const bx = Number(zones[b].style.left ?? 0);
            return dir === 1 ? bx - ax : ax - bx;
          });

        const selSet = new Set(selIdxs);

        for (const si of selIdxs) {
          const sx = Number(zones[si].style.left ?? 0);
          const sy = Number(zones[si].style.top ?? 0);
          const tx = sx + dir * STEP; // 목적 그리드 한 칸 왼쪽/오른쪽

          // 목적 그리드 자리에 비선택 칸이 있으면 교환
          let best = -1;
          let bestDist = Infinity;
          for (let j = 0; j < zones.length; j++) {
            if (selSet.has(j)) continue;
            if (zones[j].fixed) continue; // 고정 칸과 교환 금지 (2026-08-28)
            const jx = Number(zones[j].style.left ?? 0);
            const jy = Number(zones[j].style.top ?? 0);
            if (Math.abs(jy - sy) > ROW_TOL) continue;
            const dist = Math.abs(jx - tx);
            if (dist < bestDist) { bestDist = dist; best = j; }
          }

          if (best >= 0 && bestDist < SLOT.w) {
            // 점유 칸 → 교환
            const tmpStyle = { ...zones[si].style };
            zones[si] = { ...zones[si], style: { ...zones[best].style } };
            zones[best] = { ...zones[best], style: tmpStyle };
          } else {
            // 빈 그리드 자리 → 그대로 한 칸 이동
            zones[si] = { ...zones[si], style: { ...zones[si].style, left: Math.max(0, Math.round(tx)) } };
          }
        }

        return { ...d, zones };
      })
    );
  };

  const handleSelDown = (e: React.PointerEvent) => {
    if (!editMode) return;
    // 셀(button)에서 시작하면 셀 클릭 처리로 위임 — 셀 위 박스 선택은 Shift+드래그(아래 캡처 핸들러)
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    selStartRef.current = { x: e.clientX, y: e.clientY, cx: rect.left, cy: rect.top };
    selMovedRef.current = false;
    setSelRect({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY });
  };

  // Shift+드래그: 셀(버튼) 위에서 시작해도 박스 선택 (2026-08-28)
  // 캡처 단계에서 stopPropagation → dnd-kit 칸 이동 드래그 미발동. C동처럼 칸이 빽빽해
  // 빈 공간에서 드래그를 시작할 수 없을 때 라인 선택 가능.
  const handleSelDownCapture = (e: React.PointerEvent) => {
    if (!editMode || !e.shiftKey) return;
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    selStartRef.current = { x: e.clientX, y: e.clientY, cx: rect.left, cy: rect.top };
    selMovedRef.current = false;
    selSuppressClickRef.current = false;
    setSelRect({ x1: e.clientX, y1: e.clientY, x2: e.clientX, y2: e.clientY });
  };

  const handleSelMove = (e: React.PointerEvent) => {
    if (!selStartRef.current) return;
    if (!selMovedRef.current) {
      const dx = Math.abs(e.clientX - selStartRef.current.x);
      const dy = Math.abs(e.clientY - selStartRef.current.y);
      if (dx < 5 && dy < 5) return;
      selMovedRef.current = true;
      selSuppressClickRef.current = true;
    }
    setSelRect((r) => (r ? { ...r, x2: e.clientX, y2: e.clientY } : r));
  };

  const handleSelUp = () => {
    const s = selStartRef.current;
    const moved = selMovedRef.current;
    if (!s || !selRect || !moved) {
      // 미이동 = 클릭 (셀 클릭·인라인 편집 경로가 처리) — 기존 선택 보존
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
    // 고정 칸 가드 (2026-08-28): 고정 칸은 교환 대상에서 제외
    const srcZ = current.zones.find((z) => z.id === srcId);
    const dstZ = current.zones.find((z) => z.id === dstId);
    if (srcZ?.fixed || dstZ?.fixed) {
      setSaveMsg("🔒 고정 칸은 이동·교환할 수 없습니다");
      window.setTimeout(() => setSaveMsg(""), 2000);
      return;
    }
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
        // 그리드 스냅 (2026-08-28): 드롭 좌표를 52×38 그리드(기준=동 최소 좌표)에 정렬 —
        // 통로 빈칸 포함 모든 칸이 가상 그리드와 정확히 일치, 좌표 어긋남·중복 방지
        const zs = d.zones;
        const stepX = SLOT.w + 4;
        const stepY = SLOT.h + SLOT.gapY;
        const snap = (v: number, vals: number[], step: number) => {
          const origin = Math.min(...vals);
          return origin + Math.round((v - origin) / step) * step;
        };
        const zones = d.zones.map((z) =>
          z.id === zid
            ? {
                ...z,
                style: {
                  ...z.style,
                  left: snap(left, zs.map((x) => Number(x.style.left ?? 0)), stepX),
                  top: snap(top, zs.map((x) => Number(x.style.top ?? 0)), stepY),
                },
              }
            : z
        );
        return { ...d, zones };
      })
    );
  };

  // ═══ 고정 칸 토글 (2026-08-28): 건들면 안 되는 칸 잠금 ═══
  // 선택 칸의 fixed 플래그를 반전 — 드래그·라인 이동·좌표 이동 전부 차단, 화면에 🔒 표시
  const toggleFixedSelected = () => {
    if (!selectedZones.length) { setSaveMsg("고정할 칸을 먼저 선택하세요"); window.setTimeout(() => setSaveMsg(""), 2000); return; }
    setLayoutState((prev) =>
      prev.map((d) =>
        d.key !== dong
          ? d
          : {
              ...d,
              zones: d.zones.map((z) =>
                selectedZones.includes(z.id) ? { ...z, fixed: !z.fixed } : z
              ),
            }
      )
    );
    const sel = current.zones.filter((z) => selectedZones.includes(z.id));
    const locking = sel.some((z) => !z.fixed);
    setSaveMsg(`${locking ? "🔒 고정 설정" : "🔓 고정 해제"}: ${sel.length}칸 (저장 버튼으로 확정)`);
    window.setTimeout(() => setSaveMsg(""), 2500);
  };

  // ═══ 좌표 입력 이동 (2026-08-28): 선택 칸을 "X(가로), Y(세로)" 좌표로 정밀 이동 ═══
  // 드래그 없이 좌표 입력만으로 이동 — 화면 라벨(상단 열번호/좌측 행번호) 기준.
  // 여러 칸 선택 시 그룹 상대 위치 유지하며 목표 좌표로 이동.
  const [moveCoordText, setMoveCoordText] = useState("");
  const moveSelectedToCoord = () => {
    // 표기 규칙(2026-09-03): "X3, Y7" 형식. 기존 "3-7"/"3,7" 입력도 호환 허용.
    const m = /^(?:x\s*)?(\d+)\s*[,~-]\s*(?:y\s*)?(\d+)$/i.exec(moveCoordText.trim());
    if (!m) { setSaveMsg("좌표 형식: X가로, Y세로 (예: X3, Y7)"); window.setTimeout(() => setSaveMsg(""), 2000); return; }
    const sel = current.zones.filter((z) => selectedZones.includes(z.id));
    if (!sel.length) { setSaveMsg("이동할 칸을 먼저 선택하세요"); window.setTimeout(() => setSaveMsg(""), 2000); return; }
    if (sel.some((z) => z.fixed)) { setSaveMsg("🔒 고정 칸이 포함되어 이동할 수 없습니다"); window.setTimeout(() => setSaveMsg(""), 2000); return; }
    const col = parseInt(m[1], 10);
    const rowTxt = m[2];
    const sys = buildGridCoordSystem(dong, current.zones);
    if (!sys) return;
    const { gc, rowRepsDesc } = sys;
    // 행 해석 — 화면 라벨(gridLabels)과 동일 규칙(2026-09-03 통일): rowRepsDesc index+1 = Y (아래=1)
    // 목표 중심 좌표: 존재 행/열은 실제 위치, 범위 밖은 52×38 그리드로 확장 계산
    let cx: number;
    if (col >= 1 && col <= gc.cols.length) cx = gc.cols[col - 1];
    else if (col > gc.cols.length) cx = gc.cols[gc.cols.length - 1] + (col - gc.cols.length) * (SLOT.w + 4);
    else { setSaveMsg(`X${col}은(는) 범위 밖 (1~${gc.cols.length} 또는 그 이상 확장만 가능)`); window.setTimeout(() => setSaveMsg(""), 2500); return; }
    const ri = rowRepsDesc.findIndex((_, i) => String(i + 1) === rowTxt);
    let cy: number;
    if (ri >= 0) cy = rowRepsDesc[ri];
    else if (dong !== "A" && /^\d+$/.test(rowTxt)) {
      const li = parseInt(rowTxt, 10) - 1;
      // 라벨 범위 확장: 맨 위 행(마지막 라벨) 기준 38px 간격으로 위로 연장
      cy = rowRepsDesc[rowRepsDesc.length - 1] - li * (SLOT.h + SLOT.gapY);
    } else { setSaveMsg(`Y${rowTxt} 좌표를 찾을 수 없습니다`); window.setTimeout(() => setSaveMsg(""), 2500); return; }
    // 그룹 이동: 선택 칸 바운딩박스 좌상단을 목표 칸 좌상단으로 (상대 배치 유지)
    const minX = Math.min(...sel.map((z) => Number(z.style.left ?? 0)));
    const minY = Math.min(...sel.map((z) => Number(z.style.top ?? 0)));
    const dx = cx - SLOT.w / 2 - minX;
    const dy = cy - SLOT.h / 2 - minY;
    setLayoutState((prev) =>
      prev.map((d) =>
        d.key !== dong
          ? d
          : {
              ...d,
              zones: d.zones.map((z) =>
                selectedZones.includes(z.id)
                  ? { ...z, style: { ...z.style, left: Number(z.style.left ?? 0) + dx, top: Number(z.style.top ?? 0) + dy } }
                  : z
              ),
            }
      )
    );
    setSaveMsg(`선택 ${sel.length}칸 → ${dong}동 ${fmtCoord(col, rowTxt)} 이동 완료 (저장 버튼으로 확정)`);
    window.setTimeout(() => setSaveMsg(""), 2500);
  };

  // 새 빈 칸 추가: 기존 라인에 맞춰 정렬된 위치에 생성 (2026-08-19)
  // - y는 기준 라인(칸 선택 시 그 칸의 라인, 없으면 캔버스 안쪽 하단 라인)에 맞추고
  //   x는 그 라인의 마지막 칸 다음 위치 (캔버스 오른쪽에 떠 있는 과잉 C-NEW 잔존 라인 제외)
  // - 생성 직후 새 칸이 화면에 보이도록 자동 스크롤 + flash (2026-09-05):
  //   우측 카드 뒤/화면 밖에 숨지 않게
  const addCell = () => {
    const d = current;
    if (!d || d.key !== dong) {
      setSaveMsg("빈 칸 추가는 동별 배치 화면에서 사용하세요");
      window.setTimeout(() => setSaveMsg(""), 2000);
      return;
    }
    const id = `${d.key}-NEW-${Date.now().toString().slice(-5)}`;
    const zones = d.zones;
    let left = SLOT.padL;
    let top = SLOT.padT;
    if (zones.length > 0) {
      const ROW_TOL = SLOT.h / 2; // 같은 가로 라인 판정 허용 오차
      const topOf = (z: ZoneDef) => Number(z.style.top ?? 0);
      const leftOf = (z: ZoneDef) => Number(z.style.left ?? 0);
      const widthOf = (z: ZoneDef) => Number(z.style.width ?? SLOT.w);
      // 가로 라인 그룹핑 (y 기준)
      const rows: ZoneDef[][] = [];
      for (const z of zones) {
        const row = rows.find((r) => Math.abs(topOf(r[0]) - topOf(z)) <= ROW_TOL);
        if (row) row.push(z);
        else rows.push([z]);
      }
      // 캔버스 논리 폭(격자 테두리). 이를 크게 넘는 라인은 과잉 잔존(C-NEW 우측 여백) — 붙일 후보 제외
      const canvasRight = d.width + gridPad.l + gridPad.r;
      const rowRightOf = (r: ZoneDef[]) => Math.max(...r.map((z) => leftOf(z) + widthOf(z)));
      // 붙일 라인: 칸 선택 상태면 선택 칸 라인, 없으면 캔버스 안쪽 하단 라인(전부 밖이면 하단 라인)
      let targetRow: ZoneDef[] | null = null;
      if (selectedZones.length) {
        targetRow = rows.find((r) => r.some((z) => selectedZones.includes(z.id))) ?? null;
      }
      if (!targetRow) {
        const inCanvas = rows.filter((r) => rowRightOf(r) <= canvasRight + SLOT.w * 2);
        const pool = inCanvas.length ? inCanvas : rows;
        targetRow = pool.reduce((a, b) => (topOf(b[0]) > topOf(a[0]) ? b : a));
      }
      const rowTop = topOf(targetRow[0]);
      const rowRight = rowRightOf(targetRow);
      // 그리드 정렬 (2026-08-28): 새 칸은 52px(가로) 가상 그리드에 정확히 스냅 —
      // 드래그 스냅 주기(52px)와 일치해야 추가 후 이동 시 포인터↔칸 어긋남이 없음
      const STEP_X = SLOT.w + 4;
      const originX = Math.min(...zones.map(leftOf));
      left = originX + Math.ceil((rowRight - originX) / STEP_X) * STEP_X;
      top = rowTop;
    }
    const zone: ZoneDef = {
      id, num: "＋", line: -1, showNumAsProduct: false,
      style: { left, top, width: SLOT.w, height: SLOT.h },
    };
    setLayoutState((prev) =>
      prev.map((dd) => (dd.key === dong ? { ...dd, zones: [...dd.zones, zone] } : dd))
    );
    // 생성 직후 DOM 반영을 기다렸다가 새 칸으로 자동 스크롤 + flash (2026-09-05)
    window.setTimeout(() => {
      const el = gridRef.current?.querySelector<HTMLElement>(`[data-zone-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      setFlashZone(null);
      requestAnimationFrame(() => setFlashZone(id));
      window.setTimeout(() => setFlashZone(null), 8000);
    }, 80);
    setSaveMsg("빈 칸 추가됨 — 새 칸으로 자동 이동 (드래그로 원하는 위치에 배치)");
    window.setTimeout(() => setSaveMsg(""), 2600);
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
  // ── 보관함 드롭존은 StagingPanel 컴포넌트에서 정의 (DndContext 컨텍스트 수신) ──

  // 라인(열) 단위 좌표 교환: 선택 그룹 라인 ↔ 목적지 칸의 라인 (칸 수 동일할 때)
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

  // ═══ 라인 삭제·재배열 (2026-08-23, 수정 모드) ═══
  /** 라인 삭제: 해당 라인 칸의 제품 전부 임시보관함 이관 + 레이아웃에서 제거 (삭제 전 confirm) */
  const deleteLine = (lineNo: number) => {
    const d = layoutState.find((x) => x.key === dong);
    if (!d) return;
    const lineZoneIds = d.zones.filter((z) => z.line === lineNo).map((z) => z.id);
    if (lineZoneIds.length === 0) return;
    const prodCount = lineZoneIds.reduce((n, zid) => {
      const v = data[zid];
      return n + (v ? v.split(",").map((s) => s.trim()).filter(Boolean).length : 0);
    }, 0);
    if (
      !window.confirm(
        `${dong}동 ${lineNo}번 라인을 삭제할까요?\n칸 ${lineZoneIds.length}개${prodCount > 0 ? `, 제품 ${prodCount}개는 임시보관함으로 이동합니다.` : ""}`
      )
    )
      return;
    // 라인 내 제품 → 임시보관함 이관 (중복 제거)
    const toStage: string[] = [];
    for (const zid of lineZoneIds) {
      const v = data[zid];
      if (!v) continue;
      for (const pn of v.split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!toStage.includes(pn)) toStage.push(pn);
      }
    }
    if (toStage.length) setStaging((s) => Array.from(new Set([...s, ...toStage])));
    setData((prev) => {
      const next = { ...prev };
      for (const zid of lineZoneIds) delete next[zid];
      persistLocal(next);
      return next;
    });
    setLayoutState((prev) =>
      prev.map((x) => {
        if (x.key !== dong) return x;
        return {
          ...x,
          zones: x.zones.filter((z) => z.line !== lineNo),
          lineLabels: x.lineLabels.filter((lb) => parseLineNoFromLabel(lb.text) !== lineNo),
        };
      })
    );
    setSaveMsg(`🗑 ${lineNo}번 라인 삭제${prodCount > 0 ? ` — 제품 ${prodCount}개 임시보관함 이관` : ""}`);
    window.setTimeout(() => setSaveMsg(""), 2500);
  };

  /** 라인 좌우 재배열: 두 라인의 칸 좌표(좌우) 교환 — 라인 내 상하 간격·순서 유지 */
  const swapLines = (lineA: number, lineB: number) => {
    const d = layoutState.find((x) => x.key === dong);
    if (!d || lineA === lineB) return;
    const la = d.zones.filter((z) => z.line === lineA);
    const lb = d.zones.filter((z) => z.line === lineB);
    if (!la.length || !lb.length) return;
    const leftOf = (z: ZoneDef) => Number(z.style.left ?? 0);
    const topOf = (z: ZoneDef) => Number(z.style.top ?? 0);
    // 각 라인의 좌측 정렬 기준 + 폭 (교환 후 간격 일관성 유지)
    const laLeft = Math.min(...la.map(leftOf));
    const lbLeft = Math.min(...lb.map(leftOf));
    const laW = Math.max(...la.map((z) => leftOf(z) + Number(z.style.width ?? SLOT.w))) - laLeft;
    const lbW = Math.max(...lb.map((z) => leftOf(z) + Number(z.style.width ?? SLOT.w))) - lbLeft;
    const newLeftOf = (z: ZoneDef) =>
      z.line === lineA ? lbLeft + (leftOf(z) - laLeft) : laLeft + (leftOf(z) - lbLeft);
    // 폭 차이 보정: 좁은 라인 기준 중앙 정렬
    const adjust = (z: ZoneDef, srcW: number, dstW: number) => newLeftOf(z) + Math.max(0, (dstW - srcW) / 2);
    setLayoutState((prev) =>
      prev.map((x) => {
        if (x.key !== dong) return x;
        return {
          ...x,
          zones: x.zones.map((z) => {
            if (z.line === lineA) return { ...z, style: { ...z.style, left: adjust(z, laW, lbW), top: topOf(z) } };
            if (z.line === lineB) return { ...z, style: { ...z.style, left: adjust(z, lbW, laW), top: topOf(z) } };
            return z;
          }),
        };
      })
    );
    setSaveMsg(`↔ ${lineA}번 ↔ ${lineB}번 라인 순서 교환`);
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  /** 라인의 좌/우 이웃 라인 탐색 (라벨 좌표 기준) — 없으면 null */
  const findAdjacentLine = (lineNo: number, dir: -1 | 1): number | null => {
    const d = layoutState.find((x) => x.key === dong);
    if (!d) return null;
    const lines = [...new Set(d.zones.filter((z) => z.line >= 1).map((z) => z.line))];
    const leftOfLine = (ln: number) => Math.min(...d.zones.filter((z) => z.line === ln).map((z) => Number(z.style.left ?? 0)));
    const src = leftOfLine(lineNo);
    let best: number | null = null;
    let bestDist = Infinity;
    for (const ln of lines) {
      if (ln === lineNo) continue;
      const delta = (leftOfLine(ln) - src) * dir;
      if (delta > 0 && delta < bestDist) {
        bestDist = delta;
        best = ln;
      }
    }
    return best;
  };

  // ═══ 라인 설정 편집 (LineOverride UI, 2026-08-23) ═══
  /** 동·라인 선택 시 현재 오버라이드 값을 입력란에 로드 */
  const lcLoad = (dk: "A" | "B" | "C" | "D", lineKey: string) => {
    const ov = lineConfig[dk]?.[lineKey];
    setLcCount(ov?.count != null ? String(ov.count) : "");
    setLcBadge(ov?.badge ?? "");
    setLcHidden(new Set(ov?.hiddenSlots ?? []));
    setLcHiddenInput("");
  };

  /** 입력란 → LineOverride 객체 (빈 값은 필드 미포함) */
  const buildOverrideFromInputs = (): LineOverride => {
    const ov: LineOverride = {};
    const cnt = parseInt(lcCount, 10);
    if (Number.isFinite(cnt) && cnt >= 1) ov.count = cnt;
    const trimmedBadge = lcBadge.trim();
    if (trimmedBadge) ov.badge = trimmedBadge;
    if (lcHidden.size > 0) ov.hiddenSlots = [...lcHidden].sort((a, b) => a - b);
    return ov;
  };

  /** 적용: 입력값 → lineConfig 상태 (기존 applyLineOverrides 경유 반영 + 서버 스냅샷 포함) */
  const lcApply = () => {
    const dk = lcSelDong;
    const lineKey = lcSelLine;
    const ov = buildOverrideFromInputs();
    const mergeInto = (base: LineConfigMap): LineConfigMap => {
      const dongCfg = { ...(base[dk] ?? {}) };
      if (Object.keys(ov).length === 0) delete dongCfg[lineKey];
      else dongCfg[lineKey] = ov;
      return { ...base, [dk]: dongCfg };
    };
    setLineConfig(mergeInto);
    // A동은 오버라이드 반영 레이아웃 재빌드 (존재 유지 칸은 드래그 위치 보존, 새 칸은 계산 위치)
    if (dk === "A") {
      const rebuilt = buildAllDongLayouts(mergeInto(lineConfig));
      setLayoutState((prev) =>
        prev.map((d) => {
          if (d.key !== "A") return d;
          const oldPos = new Map(d.zones.map((z) => [z.id, { left: z.style.left, top: z.style.top }]));
          const zones = rebuilt.A.zones.map((z) => {
            const old = oldPos.get(z.id);
            return old ? { ...z, style: { ...z.style, left: old.left, top: old.top } } : z;
          });
          return { ...d, ...rebuilt.A, zones };
        })
      );
    }
    setSaveMsg(`✅ 라인 설정 적용: ${dk}동 ${lineKey}번`);
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  /** 숨김 슬롯 입력값 파싱 (콤마·공백·하이픈 구간 "3-5" 지원) → Set */
  const parseHiddenInput = (txt: string): Set<number> => {
    const out = new Set<number>();
    for (const part of txt.split(/[,\s]+/).filter(Boolean)) {
      const range = /^(\d+)\s*-\s*(\d+)$/.exec(part);
      if (range) {
        const a = +range[1];
        const b = +range[2];
        for (let n = Math.min(a, b); n <= Math.max(a, b); n++) out.add(n);
        continue;
      }
      const n = parseInt(part, 10);
      if (Number.isFinite(n) && n >= 1) out.add(n);
    }
    return out;
  };

  // 수정 모드 셀 클릭: 선택 없음 → 선택 / 선택 칸 → 해제 / 다른 칸(1개 선택 시) → 슬롯 좌표 이동
  const handleCellClick = (zid: string) => {
    if (!editMode) return;
    // 드래그 직후 click 이벤트 잔재 방지 (2026-08-28) — 셀 클릭으로 오발동 금지
    if (selSuppressClickRef.current) {
      selSuppressClickRef.current = false;
      return;
    }
    // 수기 편집: 칸 클릭 → 인라인 입력 (기존 값 표시, 콤마 구분 다품목)
    editingZoneRef.current = zid;
    setEditingZone(zid);
    setEditVal(data[zid] || "");
    setEditLocVal(manualLocNos[zid] != null ? String(manualLocNos[zid]) : "");
  };

  // A동 칸 정렬 (L1-1 → L1-19 → L2-1 → … → L7-8-2 → X1 → X2, 사용자 추가 칸은 뒤)
  // — 모듈 상단 aZoneSortKey/cmpZoneOrderA로 단일화 (aSeq 정렬과 동일 로직, aZonesOf extra 정렬 불변)
  const zoneOrderA = cmpZoneOrderA;

  // A동 물리 고정 순서(빈 칸 포함) + 사용자 추가 칸(A-NEW-* 등) — zoneOrderA로 뒤에 합침
  const aZonesOf = (m: PlacementMap): string[] => {
    const base = aSeq.filter((z) => z.startsWith("A-"));
    const extra = Object.keys(m)
      .filter((z) => z.startsWith("A-") && !base.includes(z))
      .sort(zoneOrderA);
    return [...base, ...extra];
  };

  // 크로스동 중복 제거 (공통 헬퍼): newPns를 B/C/D동에서만 제거(A동은 시프트가 처리),
  // excludeZid(배치 대상 칸)는 보존. 어떤 제품이든 전역 1칸 유일(R1) 규칙을 모든 경로에 통일.
  const removeCrossDongDupes = (
    next: PlacementMap,
    newPns: string[],
    excludeZid?: string
  ): PlacementMap => {
    for (const pn of newPns) {
      for (const z of Object.keys(next)) {
        if (z === excludeZid || z.startsWith("A-")) continue;
        const items = (next[z] || "").split(",").map((s) => s.trim()).filter(Boolean);
        if (!items.includes(pn)) continue;
        const rest = items.filter((x) => x !== pn);
        if (rest.length) next[z] = rest.join(",");
        else delete next[z];
      }
    }
    return next;
  };

  // 배치 편집 공통: 칸 값 설정 + 중복 제거(같은 제품 다른 칸) — 위치 고정 (2026-08-19)
  // 대상 칸(zid)만 변경. 빈칸 메우기 시프트 완전 제거 — 빈 칸은 그대로 유지.
  const applyPlacementEdit = (
    prev: PlacementMap,
    zid: string,
    newPns: string[],
    newVal: string
  ): PlacementMap => {
    const next = { ...prev };
    if (newVal) next[zid] = newVal;
    else delete next[zid];

    // ① 중복 칸 처리 (편집 칸 zid 제외): 같은 제품은 전역 1칸에만 배치.
    //    남은 품목이 있는 다품목 칸은 값 일부만 제거, 완전히 비워지면 키 제거.
    //    당김 없음 — 중복 제거로 생긴 빈 칸도 그대로 유지.
    const aZones = aZonesOf(next);
    for (const pn of newPns) {
      for (const z of aZones) {
        if (z === zid) continue;
        const items = (next[z] || "")
          .split(",").map((s) => s.trim()).filter(Boolean);
        if (!items.includes(pn)) continue;
        const rest = items.filter((x) => x !== pn);
        if (rest.length) next[z] = rest.join(",");
        else delete next[z];
      }
    }
    // ② B·C·D동 중복 제거 (크로스동 유일 규칙) — 제거 후 당김 없음
    removeCrossDongDupes(next, newPns, zid);
    return next;
  };

  // 인라인 편집 저장 — 빠진 제품은 📦임시보관함으로, 배치된 임시보관함 제품은 제거
  // 칸당 최대 품목 수 (2026-08-28): 전 동 공통 — 최대 10개까지 자유롭게 입력 가능
  const MAX_ITEMS_PER_CELL = 10;
  const commitInlineEdit = (zid: string) => {
    if (editingZoneRef.current !== zid) return; // ref 가드 — Enter→blur/더블 Enter 경쟁 안전
    const raw = editVal.replace(/[^0-9,\s]/g, ""); // 숫자/콤마/공백만 허용
    let newPns = Array.from(
      new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))
    );
    let overMsg = "";
    if (newPns.length > MAX_ITEMS_PER_CELL) {
      overMsg = ` (⚠ ${newPns.length - MAX_ITEMS_PER_CELL}개는 최대 ${MAX_ITEMS_PER_CELL}개 제한으로 제외)`;
      newPns = newPns.slice(0, MAX_ITEMS_PER_CELL);
    }
    const newVal = newPns.join(",");
    const oldPns = (data[zid] || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    // ① 칸에서 빠진 제품 → 임시보관함으로 이동 (B/C/D동 중복도 함께 제거 — FIX 2026-08-19)
    const removedFromZone = oldPns.filter((pn) => !newPns.includes(pn));
    // ② 임시보관함에 있던 제품 중 새로 배치된 것 → 임시보관함에서 제거
    const stagedAdded = newPns.filter((pn) => staging.includes(pn));

    setData((prev) => {
      const next = applyPlacementEdit(prev, zid, newPns, newVal);
      // FIX(2026-08-19): 빠진 제품이 있으면(newPns가 비어도) B/C/D동 동일 pnum도 제거.
      // applyPlacementEdit의 dedup은 newPns 기준이라 빈 칸(newPns=[])이면 루프 자체가 안 돌아
      // C동 등에 같은 제품이 잔존 → 임시보관함 이동과 동시에 크로스동 중복을 정리한다.
      if (removedFromZone.length) removeCrossDongDupes(next, removedFromZone);
      // staging 동기화를 함수형 업데이터로 통합 (stale 없음 — M2)
      setStaging((s) => {
        const merged = Array.from(new Set([...s, ...removedFromZone]));
        return stagedAdded.length ? merged.filter((pn) => !stagedAdded.includes(pn)) : merged;
      });
      
      return next;
    });
    // 수동 로케이션 번호 커밋 (A동 전용): 빈 값=자동 모드 복귀.
    // 구분 입력 지원 (2026-09-05): "70,71" / "70 71" / "70-71" → 첫 번호(70)로 해석.
    // (다품목 칸은 시작 번호만 저장하면 품목 수만큼 자동 연속 — 70 입력 시 70,71 자동)
    const locParts = editLocVal
      .split(/[,\s\-~]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    const locNum = locParts.length > 0 ? locParts[0] : 0;
    // 앞번호 중복 방지: 입력 값이 자연 커서(앞 칸들이 쓴 마지막 번호+1)보다 작으면 거부 (2026-09-05)
    if (locNum > 0) {
      const aLay = layoutState.find((l) => l.key === "A");
      const aZones = aLay?.zones ?? [];
      const sys = buildGridCoordSystem("A", aZones);
      let cursor = 1;
      let reached = false;
      if (sys) {
        const aCells: { zoneId: string; count: number; rank: number }[] = [];
        for (const z of aZones) {
          const coord = sys.coordOf.get(z.id);
          if (!coord) continue;
          const rank = aCanonOrder(coord);
          if (rank < 0) continue;
          const items = (data[z.id] || "").split(",").map((s) => s.trim()).filter(Boolean);
          const count = locExceptions.has(z.id) ? 1 : Math.max(1, items.length);
          aCells.push({ zoneId: z.id, count, rank });
        }
        aCells.sort((a, b) => a.rank - b.rank);
        for (const c of aCells) {
          if (c.zoneId === zid) { reached = true; break; }
          cursor += c.count;
        }
      }
      if (reached && locNum < cursor) {
        setEditLocVal("");
        editingZoneRef.current = null;
        setEditingZone(null);
        setEditVal("");
        setSaveMsg(`⚠ ${zoneDisplayName(zid)}: 앞번호(${cursor - 1})보다 작은 값(${locNum}) — 자동 모드 유지`);
        window.setTimeout(() => setSaveMsg(""), 3000);
        return;
      } else {
        setManualLocNos((prev) => ({ ...prev, [zid]: locNum }));
      }
    } else {
      setManualLocNos((prev) => {
        const next = { ...prev };
        delete next[zid];
        return next;
      });
    }
    editingZoneRef.current = null;
    setEditingZone(null);
    setEditVal("");
    setEditLocVal("");
    setSaveMsg(`✅ ${zoneDisplayName(zid)} 저장: ${newVal || "(비움)"}${overMsg}`);
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  const persistLocal = (d: PlacementMap) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ __v: "rank-a-v29", data: d }));
  };
  const openAssign = useCallback(
    (zoneId: string) => {
      if (!editMode) return; // ⛔ 수정 모드에서만 배정 다이얼로그 허용
      setCurrentZone(zoneId);
      setInputVal(data[zoneId] || "");
      setModalOpen(true);
    },
    [data, editMode]
  );
  void openAssign; // 수정 모드 전용 다이얼로그 진입점 (예약)

  // 제품 배정 다이얼로그 검색 후보: B/C/D_PNUM_INFO + 미배치 통합 (제품번호/이름/분류/바코드)
  const assignCandidates = useMemo(() => {
    const map = new Map<string, { pnum: string; name: string; lgmd: string; barcode: string; loc: string }>();
    const put = (pn: string, name: string, lgmd: string, barcode: string, loc: string) => {
      if (!map.has(pn)) map.set(pn, { pnum: pn, name, lgmd, barcode, loc });
    };
    for (const info of [B_PNUM_INFO, C_PNUM_INFO, D_PNUM_INFO]) {
      for (const [pn, v] of Object.entries(info)) put(pn, v.name, v.lg + (v.md ? " / " + v.md : ""), v.barcode, "");
    }
    for (const u of unplaced) put(u.pnum, u.master_name || u.name, u.category_lg || u.cat || "", "", u.loc || "");
    return Array.from(map.values());
  }, [unplaced]);
  const assignFiltered = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return [];
    return assignCandidates
      .filter((c) => c.pnum.includes(q) || c.name.toLowerCase().includes(q) || c.lgmd.toLowerCase().includes(q) || c.barcode.toLowerCase().includes(q) || c.loc.toLowerCase().includes(q))
      .slice(0, 50);
  }, [assignSearch, assignCandidates]);

  // 자리이탈 품목 이동 모드: 클릭한 칸으로 배치 (기존 제품은 자리이탈로)
  const handleMoveToZone = (zid: string): boolean => {
    if (!movePnum) return false;
    // 기존 제품 → 자리이탈 (setData 밖에서 처리 — 업데이터 함수 내 setState 금지)
    const oldVal = data[zid];
    if (oldVal && oldVal !== movePnum) {
      const oldPnums = oldVal.split(",").map((s) => s.trim()).filter(Boolean);
      setOverflow((ov) => {
        const existing = new Set(ov.map((o) => o.pnum));
        const add = oldPnums
          .filter((pn) => !existing.has(pn))
          .map((pn) => {
            const info = B_PNUM_INFO[pn] || C_PNUM_INFO[pn] || D_PNUM_INFO[pn];
            return { pnum: pn, name: info ? info.name : "", dansu: info ? info.dansu : "", fromZone: zid } as OverflowItem;
          });
        return add.length ? [...ov, ...add] : ov;
      });
    }
    setData((prev) => {
      const next = applyPlacementEdit(prev, zid, [movePnum], movePnum);
      
      return next;
    });
    setOverflow((ov) => ov.filter((o) => o.pnum !== movePnum));
    setMovePnum(null);
    return true;
  };

  const confirmAssign = (forceVal?: string) => {
    if (!currentZone) return;
    const val = (forceVal ?? inputVal).trim().replace(/[^0-9,\s]/g, "");
    let newPns = Array.from(
      new Set(val.split(",").map((s) => s.trim()).filter(Boolean))
    );
    if (newPns.length > MAX_ITEMS_PER_CELL) newPns = newPns.slice(0, MAX_ITEMS_PER_CELL);
    const newVal = newPns.join(",");
    // 현재 칸의 기존 제품 중 빠진 것 → 📦임시보관함으로 이동
    const oldPns = (data[currentZone] || "")
      .split(",").map((s) => s.trim()).filter(Boolean);
    const removedFromZone = oldPns.filter((pn) => !newPns.includes(pn));
    // 임시보관함에 있던 제품 중 새로 배치된 것 → 임시보관함에서 제거
    const stagedAdded = newPns.filter((pn) => staging.includes(pn));

    setData((prev) => {
      const next = applyPlacementEdit(prev, currentZone, newPns, newVal);
      setStaging((s) => {
        const merged = Array.from(new Set([...s, ...removedFromZone]));
        return stagedAdded.length ? merged.filter((pn) => !stagedAdded.includes(pn)) : merged;
      });
      return next;
    });
    setModalOpen(false);
    setAssignSearch("");
    setSaveMsg(`✅ ${zoneDisplayName(currentZone)} 저장: ${newVal || "(비움)"}`);
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  const saveData = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ __v: "rank-a-v29", data })
    );
    // 수동 저장: 서버에도 즉시 저장 (자동 저장 제거됨)
    void pdFlushNow(true);
    pdDirtyRef.current = false;
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
      JSON.stringify({ __v: "rank-a-v29", data: next })
    );
    setSaveMsg("A동만 초기화했습니다.");
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  /** A동 자동 재배치: 출고량 순위 기준 (분류 무관) */
  const applyARankPlacement = () => {
    setPlacementDialogOpen(true);
  };

  /** 재배치 실행 (다이얼로그 확인 버튼) */
  const executePlacement = () => {
    setPlacementDialogOpen(false);
    const mode = placementMode;
    const topRank = placementTopN;
    const cats = selectedCategories;
    const sizeThreshold = 4;
    const dong = targetDong;

    // 1. masterMap에서 품목 목록 구성 (출고량 내림차순)
    let allItems = Object.entries(masterMap)
      .filter(([pnum, m]) => m.name && !m.no3m && !A_STAGING_DEFAULT.includes(pnum))
      .map(([pnum, m]) => ({
        pnum,
        name: m.name,
        lg: m.lg,
        barcode: m.barcode,
        boxes: m.barcode ? calcMonthQty(m.barcode) : 0,
      }))
      .sort((a, b) => b.boxes - a.boxes);

    // "선택한 분류만" 옵션: 선택되지 않은 분류 제외
    if (mode === "category" && onlySelectedCategories && cats.length > 0) {
      allItems = allItems.filter(item => cats.includes(item.lg));
    }

    // 2. 모드에 따라 상위/나머지 분리
    let topN: typeof allItems = [];
    let rest: typeof allItems = [];

    if (mode === "outbound") {
      // 출고량 순위 모드: 단순 순위대로
      topN = allItems.slice(0, topRank);
      rest = allItems.slice(topRank);
    } else {
      // 분류 우선 모드: 상위 N개 안에서 분류별로 그룹화
      const topItems = allItems.slice(0, topRank);
      const restItems = allItems.slice(topRank);

      // 상위 N개를 분류별로 그룹화
      const topByCat: Record<string, typeof allItems> = {};
      for (const item of topItems) {
        if (!topByCat[item.lg]) topByCat[item.lg] = [];
        topByCat[item.lg].push(item);
      }

      // 나머지도 분류별로 그룹화
      const restByCat: Record<string, typeof allItems> = {};
      for (const item of restItems) {
        if (!restByCat[item.lg]) restByCat[item.lg] = [];
        restByCat[item.lg].push(item);
      }

      // 선택된 분류 순서대로 topN 구성
      topN = [];
      for (const cat of cats) {
        if (topByCat[cat]) topN.push(...topByCat[cat]);
      }
      // 선택되지 않은 분류: 출고량 많은 순서대로 분류별로 묶어서 추가
      const unselectedCats = Object.entries(topByCat)
        .filter(([cat]) => !cats.includes(cat))
        .sort((a, b) => {
          // 각 분류의 최고 출고량 비교
          const aMax = Math.max(...a[1].map(i => i.boxes), 0);
          const bMax = Math.max(...b[1].map(i => i.boxes), 0);
          return bMax - aMax;
        });
      for (const [cat, items] of unselectedCats) {
        topN.push(...items);
      }

      // 나머지도 같은 방식: 선택된 분류 먼저, 나머지는 출고량 순으로 분류별 묶음
      rest = [];
      for (const cat of cats) {
        if (restByCat[cat]) rest.push(...restByCat[cat]);
      }
      const unselectedRestCats = Object.entries(restByCat)
        .filter(([cat]) => !cats.includes(cat))
        .sort((a, b) => {
          const aMax = Math.max(...a[1].map(i => i.boxes), 0);
          const bMax = Math.max(...b[1].map(i => i.boxes), 0);
          return bMax - aMax;
        });
      for (const [cat, items] of unselectedRestCats) {
        rest.push(...items);
      }
    }

    // 대상 동의 zone 목록 가져오기
    const dongLayout = layoutState.find((r) => r.key === dong);
    if (!dongLayout) {
      alert(`${dong}동 레이아웃을 찾을 수 없습니다.`);
      return;
    }
    const dongZones = dongLayout.zones.map((z) => z.id);

    // 새 배치 생성
    const newDongPlacement: PlacementMap = {};
    let topIdx = 0;
    let restIdx = 0;

    if (dong === "A") {
      // A동: 동적 로케이션 번호(computeLocNosAll) 순서로 정렬 후 배치 (2026-09-05)
      // 상위 N개 → L1-L2 (번호 구간 시작), 나머지 → L3-L6
      const dongNoOf = (z: ZoneDef) => dynLocNos.byZone.get(z.id)?.[0] ?? Number.POSITIVE_INFINITY;
      // L1-L2 zone을 로케이션 번호 순으로 정렬
      const l1l2Zones = dongLayout.zones
        .filter((z) => z.line === 1 || z.line === 2)
        .sort((a, b) => dongNoOf(a) - dongNoOf(b));

      for (const zone of l1l2Zones) {
        if (topIdx < topN.length) {
          newDongPlacement[zone.id] = topN[topIdx++].pnum;
        }
      }

      // L1-L2에 들어가지 못한 topN 나머지 → rest 맨 앞에 추가
      if (topIdx < topN.length) {
        const leftover = topN.slice(topIdx);
        rest = [...leftover, ...rest];
      }

      // L3~L6: 나머지 (restItemsPerSlot 설정에 따라) — locNo 순으로 배치
      // 크기가 작은 제품(로코스 등)은 같은 분류끼리 묶어서 배치
      const restByCategory: Record<string, typeof rest> = {};
      for (const item of rest) {
        if (!restByCategory[item.lg]) restByCategory[item.lg] = [];
        restByCategory[item.lg].push(item);
      }

      // 분류별로 정렬된 rest 생성 (출고량 많은 분류 우선)
      const sortedRest: typeof rest = [];
      const sortedCategories = Object.entries(restByCategory)
        .sort((a, b) => {
          const aMax = Math.max(...a[1].map(i => i.boxes), 0);
          const bMax = Math.max(...b[1].map(i => i.boxes), 0);
          return bMax - aMax;
        });

      for (const [, items] of sortedCategories) {
        sortedRest.push(...items);
      }

      // L3~L6 zone을 로케이션 번호 순으로 정렬
      const l3l6Zones = dongLayout.zones
        .filter((z) => z.line >= 3 && z.line <= 6)
        .sort((a, b) => dongNoOf(a) - dongNoOf(b));

      // 정렬된 rest로 배치
      let sortedRestIdx = 0;
      for (const zone of l3l6Zones) {
          if (sortedRestIdx >= sortedRest.length) break;

          if (restItemsPerSlot === 1) {
            // 1칸 1품목
            newDongPlacement[zone.id] = sortedRest[sortedRestIdx++].pnum;
          } else if (restItemsPerSlot === 2) {
            // 1칸 2품목
            const item1 = sortedRest[sortedRestIdx++];
            if (sortedRestIdx < sortedRest.length) {
              const item2 = sortedRest[sortedRestIdx++];
              newDongPlacement[zone.id] = `${item1.pnum},${item2.pnum}`;
            } else {
              newDongPlacement[zone.id] = item1.pnum;
            }
          } else if (restItemsPerSlot === 3) {
            // 1칸 3품목
            const item1 = sortedRest[sortedRestIdx++];
            if (sortedRestIdx < sortedRest.length) {
              const item2 = sortedRest[sortedRestIdx++];
              if (sortedRestIdx < sortedRest.length) {
                const item3 = sortedRest[sortedRestIdx++];
                newDongPlacement[zone.id] = `${item1.pnum},${item2.pnum},${item3.pnum}`;
              } else {
                newDongPlacement[zone.id] = `${item1.pnum},${item2.pnum}`;
              }
            } else {
              newDongPlacement[zone.id] = item1.pnum;
            }
          }
      }

      // L7, X1, X2: 기존 값 유지
      for (const [zid, val] of Object.entries(data)) {
        if (zid.startsWith("A-L7-") || zid === "A-X1" || zid === "A-X2") {
          newDongPlacement[zid] = val;
        }
      }
    } else {
      // B/C/D/E동: A동에 배치되지 않은 제품만 배치
      const aDongPnums = new Set<string>();
      for (const [zid, val] of Object.entries(data)) {
        if (zid.startsWith("A-")) {
          val.split(",").map(s => s.trim()).filter(Boolean).forEach(p => aDongPnums.add(p));
        }
      }

      // B/C/D동: A동 미배치 제품 큐에서 하나씩 꺼내 배치 (shift 큐 — 2026-08-28)
      // FIX: 인덱스(itemIdx) 추적은 큐 소진/재배열 시 중복·잔존 배치의 원인 → 큐에서 직접 꺼내면
      // 각 제품이 정확히 한 번씩만 배치되어 칸 단위·크로스동 중복이 원천 차단됨.
      const itemQueue = [...topN, ...rest].filter(item => !aDongPnums.has(item.pnum));
      for (const zoneId of dongZones) {
        const item = itemQueue.shift();
        if (!item) break;
        newDongPlacement[zoneId] = item.pnum;
      }
    }

    // 다른 동 유지
    const next: PlacementMap = { ...newDongPlacement };
    for (const [k, v] of Object.entries(data)) {
      if (!k.startsWith(`${dong}-`)) next[k] = v;
    }

    // 크로스동 중복 제거 (대상 동 우선)
    const allDongPnums = new Set<string>();
    for (const val of Object.values(newDongPlacement)) {
      val.split(",").map((s) => s.trim()).filter(Boolean).forEach((p) => allDongPnums.add(p));
    }
    removeCrossDongDupes(next, Array.from(allDongPnums));

    // 빠진 품목 → 임시보관함
    const oldDongPnums = new Set<string>();
    for (const [zid, val] of Object.entries(data)) {
      if (zid.startsWith(`${dong}-`)) {
        val.split(",").map((s) => s.trim()).filter(Boolean).forEach((p) => oldDongPnums.add(p));
      }
    }
    const removedPnums = Array.from(oldDongPnums).filter((p) => !allDongPnums.has(p));

    setData(next);
    setStaging((s) => Array.from(new Set([...s, ...removedPnums])));

    // 모든 동 배치 현황 통계
    const allDongStats: Record<string, Record<string, number>> = {};
    const allDongTotal: Record<string, number> = {};

    for (const [zoneId, pnumStr] of Object.entries(next)) {
      const d = zoneId.split("-")[0];
      if (!allDongStats[d]) allDongStats[d] = {};
      if (!allDongTotal[d]) allDongTotal[d] = 0;

      const pnums = pnumStr.split(",").map((s) => s.trim()).filter(Boolean);
      for (const pnum of pnums) {
        const master = masterMap[pnum];
        const cat = master?.lg || "미분류";
        allDongStats[d][cat] = (allDongStats[d][cat] || 0) + 1;
        allDongTotal[d]++;
      }
    }

    // 콘솔에 상세 출력
    console.log(`📊 ${dong}동 재배치 완료 후 전체 현황:`);
    for (const d of ["A", "B", "C", "D", "E"]) {
      if (allDongTotal[d]) {
        console.log(`\n${d}동 (총 ${allDongTotal[d]}개):`);
        const sorted = Object.entries(allDongStats[d] || {})
          .sort((a, b) => b[1] - a[1]);
        for (const [cat, count] of sorted) {
          console.log(`  - ${cat}: ${count}개`);
        }
      }
    }

    setSaveMsg(`${dong}동 재배치 완료: ${Object.keys(newDongPlacement).length}칸 (전체 현황은 콘솔 확인)`);
    window.setTimeout(() => setSaveMsg(""), 3000);
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

  /* ═══ A동 엑셀 왕복 (2026-08-22) — 다운로드/업로드 ═══ */

  /** 중복 제품번호 해결: 마스터 전체 행에서 존 맥락(바코드→분류→이름) 기준으로 일치 행 선택 (2026-08-22) */
  const resolveMasterForZone = (pn: string, zid: string): MasterInfo | undefined => {
    const cands = masterRows.filter((r) => r.pnum === pn);
    if (cands.length === 0) return masterMap[pn];
    if (cands.length === 1) return cands[0];
    const zbc = A_ZONE_BARCODE[zid] || "";
    if (zbc) {
      const byBc = cands.find((r) => r.barcode === zbc);
      if (byBc) return byBc;
    }
    const zcat = A_ZONE_CAT[zid] || "";
    if (zcat) {
      const byCat = cands.find((r) => r.lg === zcat);
      if (byCat) return byCat;
    }
    const zname = A_ZONE_MASTER_NAME[zid] || "";
    if (zname) {
      const byName = cands.find((r) => r.name && zname.slice(0, 6) && r.name.includes(zname.slice(0, 6)));
      if (byName) return byName;
    }
    return cands[0];
  };

  /** 엑셀 다운로드: 현재 state 배치 → "vf 품목 배치도" 형식
   *  2026-08-29 용어 기준 정리: '제품번호' 열 = 제품 고유 번호(구 '로케이션' 유도 문자열 대체),
   *  '로케이션' 열 = 제품 배치도의 위치 번호(구 '로케이션(숫자)' 개명, A동 1~ / B 200~ / C 500~ / D 900~).
   *  다품목 칸은 품목별 개별 행 + 각자 번호 (2026-08-26 전 동 동적 규칙). */
  const exportExcel = () => {
    const isAll = dong === "ALL";
    const activeDong = dong;
    // 총괄 모드 = 전 동 존 (레이아웃 전부) — 2026-08-28 수정: 기존은 current(A동만) 내보내기 버그
    const sourceZones = isAll ? layoutState.flatMap((d) => d.zones) : current.zones;
    const zoneById = new Map(sourceZones.map((z) => [z.id, z]));
    const zonesToExport = isAll
      ? sourceZones.map((z) => z.id)
      : sourceZones.filter((z) => z.id.startsWith(`${activeDong}-`)).map((z) => z.id);
    const activeZoneDefs = zonesToExport.map((id) => zoneById.get(id)).filter((z): z is ZoneDef => !!z);
    // 로케이션 번호 = 동적 발행 결과(computeLocNosAll) 공용 사용 (2026-09-05)
    // 좌표 매핑 (배치도 파란 좌표 그대로, 2026-08-28) — gridLabels와 동일 규칙으로 통일
    // (2026-09-03: 구 rowLabelOf 슬롯번호계 제거. 업로드 적용(coordToZoneAll)과 왕복 일치 필수)
    const byDong = new Map<string, ZoneDef[]>();
    for (const z of activeZoneDefs) {
      const dk = z.id.split("-")[0];
      if (!byDong.has(dk)) byDong.set(dk, []);
      byDong.get(dk)!.push(z);
    }
    const coordOf = new Map<string, string>();
    for (const [dk, zs] of byDong) {
      const sys = buildGridCoordSystem(dk as DongKey, zs);
      if (!sys) continue;
      sys.coordOf.forEach((v, zid) => coordOf.set(zid, v));
    }
    type Row = { dong: string; no: number; cat: string; cellName: string; name: string; barcode: string; boxes: number; pn: string };
    const rows: Row[] = [];
    for (const zoneId of zonesToExport) {
      const val = data[zoneId];
      if (!val) continue;
      const pns = val.split(",").map((s) => s.trim()).filter(Boolean);
      if (!pns.length) continue;
      const zoneNos = dynLocNos.byZone.get(zoneId);
      const zoneDong = zoneId.split("-")[0];
      pns.forEach((pn, i) => {
        const m = resolveMasterForZone(pn, zoneId);
        rows.push({
          dong: zoneDong,
          no: zoneNos?.length === 1 ? zoneNos[0] : (zoneNos?.[i] ?? 0),
          cat: m?.lg || "",
          cellName: coordOf.get(zoneId) || "",
          name: m?.name || "",
          barcode: m?.barcode || "",
          boxes: m?.barcode ? calcMonthQty(m.barcode) : 0,
          pn,
        });
      });
    }
    const sortedByBoxes = [...rows].sort((a, b) => b.boxes - a.boxes || a.pn.localeCompare(b.pn));
    const rankMap = new Map<string, number>();
    sortedByBoxes.forEach((r, i) => rankMap.set(r.pn, i + 1));
    const rank = (pn: string) => rankMap.get(pn) ?? 0;
    rows.sort((a, b) => {
      if (a.dong !== b.dong) return a.dong.localeCompare(b.dong);
      return a.no - b.no || a.pn.localeCompare(b.pn);
    });
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fileName = isAll ? `전체_배치표_${ymd}.xlsx` : `${activeDong}동_배치표_${ymd}.xlsx`;
    const aoa: (string | number)[][] = [
      ["동", "칸(위치)", "순위_1개월박스", "분류", "제품번호", "제품명", "바코드", "1개월_출고박스", "단수", "로케이션", "비고"],
      ...rows.map((r) => [
        r.dong, fmtCoordKey(r.cellName), rank(r.pn), r.cat,
        /^\d+$/.test(r.pn) ? Number(r.pn) : r.pn,
        r.name, r.barcode, r.boxes, extractDansu(r.name), r.no, ""
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "vf 품목 배치표");
    XLSX.writeFile(wb, fileName);
  };

  const applyExcelUpload = (rows: string[][]) => {
    const activeDong = dong;
    const isA = activeDong === "A";
    const header = rows[0] || [];
    const idxRank = header.findIndex((h) => String(h ?? "").trim() === "순위_1개월박스");
    // 2026-08-29 형식: '제품번호' 열=제품 고유 번호, '로케이션' 열=배치도 위치 번호.
    // 구형 파일 호환: '로케이션' 열=320-A1-1-N 문자열(제품번호 역추출), '로케이션(숫자)' 열=위치 번호
    const idxPn = header.findIndex((h) => String(h ?? "").trim() === "제품번호");
    const idxLoc = header.findIndex((h) => String(h ?? "").trim() === "로케이션");
    const idxCellName = header.findIndex((h) => String(h ?? "").trim() === "칸(위치)");
    if (idxRank < 0 || (idxPn < 0 && idxLoc < 0)) {
      window.alert("엑셀 형식이 맞지 않습니다. 첫 줄 헤더에 '순위_1개월박스', '제품번호' 열이 필요합니다.");
      return;
    }
    // 동별 재적용 로직 — 전체 업로드 시 다른 동 배치 삭제 위험
    if (activeDong === "ALL") {
      window.alert("총괄 화면에서는 엑셀 업로드가 지원되지 않습니다. 동(A/B/C/D) 탭을 선택한 뒤 업로드해 주세요.");
      return;
    }
    const pnColIdx = idxPn >= 0 ? idxPn : idxLoc;
    const idxLocNum = idxPn >= 0 ? idxLoc : header.findIndex((h) => String(h ?? "").trim() === "로케이션(숫자)");
    const parsed: { pn: string; cellName: string; locNo: number; dong: string }[] = [];
    for (const r of rows.slice(1)) {
      const raw = String(r[pnColIdx] ?? "").replace(/\r\n/g, "\n");
      const parts = raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
      if (!parts.length) continue;
      const groupPns: string[] = [];
      let locNo: number | null = null;
      const numCell = idxLocNum >= 0 ? parseInt(String(r[idxLocNum] ?? ""), 10) : NaN;
      if (Number.isFinite(numCell)) locNo = numCell;
      let rowDong = activeDong;
      // 표기 규칙(2026-09-03): "X9, Y21" 표기를 내부 키("9-21")로 정규화 — 기존 하이픈 파일도 그대로 통과
      const cellName = normCoordKey(idxCellName >= 0 ? String(r[idxCellName] ?? "").trim() : "");
      const cellDong = cellName ? cellName.split("-")[0] : "";
      // 좌표 형식("9-21")은 split[0]이 숫자 → 동 문자(ABCD)일 때만 동 필터 적용 (2026-09-04)
      if (cellDong && /^[ABCD]$/.test(cellDong) && cellDong !== activeDong) continue;
      for (const part of parts) {
        let pn: string | null = null;
        let n: number | null = null;
        const mFull = /^320-A1-1-(\d+)$/.exec(part);
        if (mFull) {
          pn = mFull[1];
          n = parseInt(mFull[1], 10);
          rowDong = "A";
        } else if (/^\d+$/.test(part)) {
          n = parseInt(part, 10);
          pn = String(n);
        } else {
          pn = legacyLocToPnum(part);
        }
        if (pn && !groupPns.includes(pn)) groupPns.push(pn);
        // 구형 파일 전용 폴백 (옛 체계: 로케이션 끝번호=제품번호). 신규 형식은 '제품번호' 열 + '로케이션' 열(위치번호) 사용
        if (locNo === null && idxPn < 0 && n !== null && Number.isFinite(n)) locNo = n;
      }
      if (!groupPns.length) continue;
      for (const pn of groupPns) parsed.push({ pn, cellName, locNo: locNo ?? 0, dong: rowDong });
    }
    if (!parsed.length) {
      window.alert("적용할 데이터 행이 없습니다.");
      return;
    }
    const activeZoneDefs = current.zones.filter(z => z.id.startsWith(`${activeDong}-`));
    const sortedZones = [...activeZoneDefs];
    // 로케이션 번호 → 칸 역매핑: 동적 발행 번호(computeLocNosAll) 기준 (2026-09-05)
    const noToZone = new Map<number, string>();
    for (const z of sortedZones) {
      const nos = dynLocNos.byZone.get(z.id);
      if (!nos) continue;
      for (const n of nos) noToZone.set(n, z.id);
    }
    const next: PlacementMap = { ...data };
    for (const z of Object.keys(next)) {
      if (!z.startsWith(`${activeDong}-`)) continue;
      if (isA && (z.startsWith("A-L7") || z === "A-X1" || z === "A-X2")) continue;
      delete next[z];
    }
    const byZone = new Map<string, string[]>();
    const outOfRange: string[] = [];
    for (const p of parsed) {
      let zoneId = "";
      const coordMatch = p.cellName ? coordToZoneAll.get(`${p.dong}-${p.cellName}`) : undefined;
      if (p.cellName && coordMatch && coordMatch.startsWith(`${activeDong}-`)) {
        zoneId = coordMatch; // 좌표 매칭 — 유일한 칸 참조 방식 (2026-08-31 좌표 통일)
      } else if (p.locNo > 0) {
        zoneId = noToZone.get(p.locNo) || ""; // 동적 발행 번호 기준 매칭
      }
      if (!zoneId) {
        outOfRange.push(p.pn);
        continue;
      }
      const pns = byZone.get(zoneId) || [];
      if (!pns.includes(p.pn)) pns.push(p.pn);
      byZone.set(zoneId, pns);
    }
    for (const [zid, pns] of byZone) {
      next[zid] = pns.join(",");
    }
    if (outOfRange.length) {
      window.alert(`유효하지 않은 위치의 ${outOfRange.length}건은 적용되지 않았습니다.`);
    }
    const newPns = new Set(parsed.map((p) => p.pn));
    const oldPnums = new Set<string>();
    for (const [zid, val] of Object.entries(data)) {
      if (!zid.startsWith(`${activeDong}-`)) continue;
      for (const pn of val.split(",").map((s) => s.trim()).filter(Boolean)) oldPnums.add(pn);
    }
    const movedToStaging = Array.from(oldPnums).filter((pn) => !newPns.has(pn));
    setStaging((s) => {
      const merged = Array.from(new Set([...s, ...movedToStaging]));
      return merged.filter((pn) => !newPns.has(pn));
    });
    removeCrossDongDupes(next, Array.from(newPns));
    setData(next);
    persistLocal(next);
    setSaveMsg(`✅ ${activeDong}동 엑셀 업로드: ${newPns.size}개 제품 배치, 보관함 이동 ${movedToStaging.length}개`);
    window.setTimeout(() => setSaveMsg(""), 4000);
  };

  /** 엑셀 업로드 버튼 핸들러 — 파일 읽기 후 applyExcelUpload 호출 */
  const excelInputRef = useRef<HTMLInputElement | null>(null);
  const onExcelUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const sheetName = wb.SheetNames.includes("vf 품목 배치표") ? "vf 품목 배치표" : wb.SheetNames[0];
        const ws = sheetName ? wb.Sheets[sheetName] : null;
        if (!ws) {
          window.alert("시트를 읽을 수 없습니다.");
          return;
        }
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
        const cleaned = rows.map((r) => (Array.isArray(r) ? r : []).map((c) => String(c ?? "")));
        const body = cleaned.filter((r) => r.some((c) => c.trim() !== ""));
        if (body.length < 2) {
          window.alert("데이터 행이 없습니다.");
          return;
        }
        applyExcelUpload(body);
      } catch {
        window.alert("엑셀 파일을 읽는 중 오류가 발생했습니다.");
      }
    };
    reader.onerror = () => window.alert("파일을 읽을 수 없습니다.");
    reader.readAsArrayBuffer(file);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && modalOpen) {
        e.preventDefault();
        if (assignFiltered.length > 0) confirmAssign(assignFiltered[0].pnum);
        else confirmAssign();
      }
      // 수정 모드 방향키 이동 (2026-08-28): ←/→ 좌우, ↑/↓ 상하 (인라인 편집·모달 중엔 무시)
      if (editMode && !modalOpen && selectedZones.length) {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
        if (e.key === "ArrowLeft") { e.preventDefault(); groupMoveX(-1); }
        else if (e.key === "ArrowRight") { e.preventDefault(); groupMoveX(1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); groupMove(1); }
        else if (e.key === "ArrowDown") { e.preventDefault(); groupMove(-1); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, inputVal, currentZone, assignFiltered, editMode, selectedZones]);

  // 툴팁 생성: A동=배치 제품번호 기준(masterMap, 미로드 시 칸 하드코딩 fallback), B/C/D동=pnum 기반(다품목 나열)
  const makeTooltip = (z: ZoneDef): string => {
    const zid = z.id;
    // 좌표는 숫자 좌표만 노출 (2026-08-28) — 내부 존 아이디 미표시
    const parts: string[] = [];

    // 그리드 좌표 표시 (전 동) — 표기 규칙(2026-09-03): "X열, Y행" 형식 통일 (내부 키 "X-Y"는 표시 시점에 변환)
    if (z.gridCoord) {
      parts.unshift(`좌표 ${fmtCoordKey(z.gridCoord)}`);
    }
    if (z.fixed) {
      parts.unshift("🔒 고정 칸 — 이동·교환 불가");
    }

    const assigned = data[zid] || "";
    const pnums = assigned ? assigned.split(",").map((s) => s.trim()).filter(Boolean) : [];

    if (zid.startsWith("B-") || zid.startsWith("C-") || zid.startsWith("D-")) {
      // B/C/D동: 한 칸 다품목 → 각 품목 정보 나열
      if (pnums.length === 0) {
        return parts.join("\n");
      }
      for (const pn of pnums) {
        // 동적 마스터 우선 (이후 배치된 신규 제품도 이름 표시) — 정적 시드는 폴백
        const m = masterMap[pn];
        const info = B_PNUM_INFO[pn] || C_PNUM_INFO[pn] || D_PNUM_INFO[pn];
        const nm = m?.name || info?.name;
        if (nm) {
          const sub = [`${pn}: ${nm}`];
          const lg = m?.lg ?? info?.lg ?? "";
          const md = m?.md ?? info?.md ?? "";
          if (lg || md) sub.push(`분류: ${lg}${md ? " / " + md : ""}`);
          const stock = m && m.stock !== null && m.stock !== undefined ? m.stock : info?.stock;
          if (stock !== null && stock !== undefined) sub.push(`재고: ${stock}`);
          const bc = m?.barcode || info?.barcode || "";
          if (bc) {
            const ob4d = calcOutbound4d(bc);
            if (ob4d !== null) sub.push(`출고 4일치: ${ob4d}박스`);
          }
          parts.push(sub.join("\n"));
        } else {
          parts.push(`${pn}: (정보 없음)`);
        }
      }
      return parts.join("\n\n");
    }

    // A동: 배치된 제품번호 기준 (masterMap) — 마스터 미로드 시 칸 하드코딩 fallback
    if (pnums.length === 0) {
      return parts.join("\n");
    }
    for (const pn of pnums) {
      const m = masterMap[pn];
      if (m && m.name) {
        const sub = [`${pn}: ${m.name}`];
        if (m.lg || m.md) sub.push(`분류: ${m.lg}${m.md ? " / " + m.md : ""}`);
        if (m.stock !== null && m.stock !== undefined) sub.push(`재고: ${m.stock}`);
        if (m.barcode) {
          const ms = calcMonthStat(m.barcode);
          if (ms) sub.push(`최근 1개월 출고: ${ms.qty}박스 / ${Math.round(ms.amount).toLocaleString()}원`);
          const ob4d = calcOutbound4d(m.barcode);
          if (ob4d !== null) sub.push(`최근 3개월 4일치 예상 출고: ${ob4d}박스 (1개월 +30% 가중)`);
        }
        parts.push(sub.join("\n"));
      } else {
        // fallback: 칸 하드코딩 (마스터 로드 전 첫 렌더 대비)
        const masterName = A_ZONE_MASTER_NAME[zid] || "";
        const catLg = A_ZONE_CATEGORY_LG[zid] || "";
        const catMd = A_ZONE_CATEGORY_MD[zid] || "";
        const stock = A_ZONE_STOCK[zid];
        const bc = A_ZONE_BARCODE[zid] || "";
        const sub: string[] = [`${pn}: ${masterName || "(정보 없음)"}`];
        if (catLg || catMd) sub.push(`분류: ${catLg}${catMd ? " / " + catMd : ""}`);
        if (stock !== undefined && stock !== null) sub.push(`재고: ${stock}`);
        if (bc) {
          const ms = calcMonthStat(bc);
          if (ms) sub.push(`최근 1개월 출고: ${ms.qty}박스 / ${Math.round(ms.amount).toLocaleString()}원`);
          const ob4d = calcOutbound4d(bc);
          if (ob4d !== null) sub.push(`최근 3개월 4일치 예상 출고: ${ob4d}박스 (1개월 +30% 가중)`);
        }
        parts.push(sub.join("\n"));
      }
    }
    return parts.join("\n\n");
  };

  // 로케이션 리스트 데이터 — 동별(총괄=전 동) 누적 번호순 행 목록 (동적 발행 번호 사용, 2026-09-05)
  const locListSections = useMemo(() => {
    const dks = (dong === "ALL" ? ["A", "B", "C", "D"] : [dong]) as Array<"A" | "B" | "C" | "D">;
    return dks.map((dk) => {
      const lay = dk === dong ? current : layoutState.find((r) => r.key === dk);
      if (!lay) return { dk, rows: [] as { no: number; pn: string; name: string; lg: string; md: string; zone: string }[] };
      const zs = lay.zones;
      const rows: { no: number; pn: string; name: string; lg: string; md: string; zone: string }[] = [];
      for (const z of zs) {
        const nos = dynLocNos.byZone.get(z.id);
        if (!nos || nos.length === 0) continue;
        const pns = (data[z.id] || "").split(",").map((s) => s.trim()).filter(Boolean);
        pns.forEach((pn, i) => {
          const m = masterMap[pn];
          rows.push({ no: nos[i] ?? 0, pn, name: m?.name || "", lg: m?.lg || "", md: m?.md || "", zone: z.id });
        });
      }
      rows.sort((a, b) => a.no - b.no);
      return { dk, rows };
    });
  }, [dong, current, layoutState, data, dynLocNos, masterMap]);

  /** 인쇄용 동 코어 데이터 (레이아웃·동적 번호·품목행 공통 조립) */
  const getDongPrintCore = useCallback(
    (dk: "A" | "B" | "C" | "D") => {
      const lay = layoutState.find((r) => r.key === dk);
      if (!lay) return null;
      const zs = lay.zones;
      const dyn = dynLocNos.byZone;
      const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const items: { no: string; pn: string; nm: string; cat: string }[] = [];
      for (const z of zs) {
        const nos = dyn.get(z.id);
        if (!nos || !nos.length) continue;
        const pns = (data[z.id] || "").split(",").map((s) => s.trim()).filter(Boolean);
        pns.forEach((pn, i) => {
          const m = masterMap[pn];
          items.push({ no: String(nos[i] ?? ""), pn, nm: m?.name || "", cat: [m?.lg || "", m?.md || ""].filter(Boolean).join("/") });
        });
      }
      return { lay, zs, dyn, esc, items };
    },
    [layoutState, data, dynLocNos, masterMap]
  );

  /** 인쇄 창 열기 + 자동 print 호출 */
  const openPrintWindow = (title: string, landscape: boolean, bodyHtml: string, css: string) => {
    const html =
      `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><style>` +
      `@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:${landscape ? "4mm" : "6mm"}}` +
      css +
      `</style></head><body>${bodyHtml}` +
      `<script>window.onload=function(){setTimeout(function(){window.print();},200);}</scr` +
      `ipt></body></html>`;
    const w = window.open("", "_blank", "width=1180,height=820");
    if (!w) {
      window.alert("팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  /** 배치도 인쇄 — A4 가로, 도면을 페이지 최대 크기로 확대 */
  const printLayoutSheets = () => {
    const targets = (dong === "ALL" ? ["A", "B", "C", "D"] : [dong]) as Array<"A" | "B" | "C" | "D">;
    const isAOnly = targets.length === 1 && targets[0] === "A";
    const base =
      `*{box-sizing:border-box}body{margin:0;color:#111;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif}` +
      `section.sheet{page-break-after:always}section.sheet:last-child{page-break-after:auto}` +
      `h2{font-size:15px;margin:0 0 6px;display:flex;justify-content:space-between;align-items:baseline}` +
      `h2 small{font-size:10px;color:#555;font-weight:normal}` +
      `.map{position:relative;border:1px solid #94a3b8;background:#f8fafc;margin:0 auto}` +
      `.map .lbl{position:absolute;font-weight:700;color:#475569;white-space:nowrap;overflow:hidden}` +
      `.cell{position:absolute;border:1px solid #94a3b8;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;overflow:hidden}` +
      `.cell.on{background:#dbeafe;border-color:#1d4ed8}` +
      `.cell .no{font-size:9px;font-weight:800;color:#b45309}` +
      `.cell .pn{font-size:8px;color:#1e3a8a;text-align:center}` +
      `.rotate-90{transform:rotate(90deg);transform-origin:center center}`;
    const parts: string[] = [];
    for (const dk of targets) {
      const core = getDongPrintCore(dk);
      if (!core) continue;
      const { lay, zs, dyn } = core;
      const isADong = dk === "A";
      // 좌표 라벨용 패드 (2026-08-28): 좌·우 행 번호, 상·하 열 번호 인쇄
      const PADL = 28, PADT = 18, PADR = 30, PADB = 20;
      // A동은 90° 회전 인쇄 → 회전 후 기준(폭=lay.height, 높이=lay.width)으로 스케일 계산 — 여백 최소화
      const sc = isADong
        ? Math.min(1080 / (lay.height + PADT + PADB), 745 / (lay.width + PADL + PADR))
        : Math.min(1080 / (lay.width + PADL + PADR), 745 / (lay.height + PADT + PADB));
      const W = Math.round((lay.width + PADL + PADR) * sc);
      const H = Math.round((lay.height + PADT + PADB) * sc);
      // 좌표 라벨: 화면 gridLabels·coordOfAll·엑셀과 동일 규칙(buildGridCoordSystem 단일 구현) —
      // 상·하단 X=1..N(좌→우 colReps), 좌·우측 Y=1(아래)..N(위 rowRepsDesc, 통로 행 포함)
      let labelsHtml = "";
      const sys = buildGridCoordSystem(isADong ? "A" : dk, zs);
      if (sys) {
        const fs = Math.max(7, Math.round(10 * sc));
        const lbl = (left: number, top: number, w: number, txt: string, align: string) =>
          `<div class="lbl" style="left:${Math.round(left * sc)}px;top:${Math.round(top * sc)}px;width:${Math.round(w * sc)}px;text-align:${align};font-size:${fs}px;color:#1d4ed8">${txt}</div>`;
        const maxBottom = Math.max(...zs.map((z) => Number(z.style.top ?? 0) + Number(z.style.height ?? SLOT.h)));
        sys.colReps.forEach((cx, ci) => {
          const x = cx - SLOT.w / 2 + PADL;
          labelsHtml += lbl(x, PADT - fs - 4, SLOT.w, String(ci + 1), "center");
          labelsHtml += lbl(x, maxBottom + 6, SLOT.w, String(ci + 1), "center");
        });
        sys.rowRepsDesc.forEach((cy, ri) => {
          labelsHtml += lbl(2, cy - fs / 2 + PADT, PADL - 4, String(ri + 1), "right");
          labelsHtml += lbl(PADL + sys.colReps[sys.colReps.length - 1] + SLOT.w / 2 + 6, cy - fs / 2, PADR - 6, String(ri + 1), "left");
        });
      }
      const cellsHtml = zs
        .map((z) => {
          const st = z.style as { left: number; top: number; width: number; height: number };
          const pns = (data[z.id] || "").split(",").map((s) => s.trim()).filter(Boolean);
          const n = dyn.get(z.id);
          return (
            `<div class="cell${pns.length ? " on" : ""}" style="left:${Math.round((st.left + PADL) * sc)}px;top:${Math.round((st.top + PADT) * sc)}px;width:${Math.round(st.width * sc)}px;height:${Math.round(st.height * sc)}px">` +
            `<span class="no">${core.esc(n && n.length ? n.join(",") : "")}</span>` +
            (pns.length ? `<span class="pn">${pns.map(core.esc).join("<br>")}</span>` : "") +
            `</div>`
          );
        })
        .join("");
      const mapClass = isADong ? 'map rotate-90' : 'map';
      parts.push(
        `<section class="sheet"><h2><span>${dk}동 배치도</span><small>출력: ${new Date().toLocaleString("ko-KR")} / ${core.items.length}품목${dk === "A" ? " · L1·L2(1~38) 고정" : ""}</small></h2>` +
          `<div class="${mapClass}" style="width:${W}px;height:${H}px">${labelsHtml}${cellsHtml}</div></section>`
      );
    }
    if (!parts.length) {
      window.alert("인쇄할 동이 없습니다.");
      return;
    }
    openPrintWindow("배치도 인쇄", true, parts.join(""), base);
  };

  /** 품목 목록 인쇄 — A4 세로, 표 본문 14px */
  const printListSheets = () => {
    const targets = (dong === "ALL" ? ["A", "B", "C", "D"] : [dong]) as Array<"A" | "B" | "C" | "D">;
    const base =
      `*{box-sizing:border-box}body{margin:0;color:#111;font-size:14px;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif}` +
      `section.sheet{page-break-after:always}section.sheet:last-child{page-break-after:auto}` +
      `h2{font-size:17px;margin:0 0 8px;display:flex;justify-content:space-between;align-items:baseline}` +
      `h2 small{font-size:11px;color:#555;font-weight:normal}` +
      `table{border-collapse:collapse;width:100%;font-size:14px}` +
      `th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left;vertical-align:top}` +
      `th{background:#e2e8f0;font-size:13px}` +
      `td.no{text-align:center;font-family:Consolas,monospace;font-weight:700;color:#b45309;width:64px}` +
      `th.w-no{width:64px}th.w-pn{width:84px}th.w-cat{width:180px}` +
      `thead{display:table-header-group}tr{page-break-inside:avoid}`;
    const parts: string[] = [];
    for (const dk of targets) {
      const core = getDongPrintCore(dk);
      if (!core) continue;
      const rowsHtml = core.items.length
        ? core.items.map((r) => `<tr><td class="no">${core.esc(r.no)}</td><td>${core.esc(r.pn)}</td><td>${core.esc(r.nm)}</td><td>${core.esc(r.cat)}</td></tr>`).join("")
        : `<tr><td colspan="4" style="text-align:center;color:#888">배치 없음</td></tr>`;
      parts.push(
        `<section class="sheet"><h2><span>${dk}동 로케이션 · 품목 목록</span><small>출력: ${new Date().toLocaleString("ko-KR")} / ${core.items.length}품목</small></h2>` +
          `<table><thead><tr><th class="w-no">로케</th><th class="w-pn">제품번호</th><th>제품명</th><th class="w-cat">분류</th></tr></thead><tbody>${rowsHtml}</tbody></table></section>`
      );
    }
    if (!parts.length) {
      window.alert("인쇄할 동이 없습니다.");
      return;
    }
    openPrintWindow("품목 목록 인쇄", false, parts.join(""), base);
  };

  // 동별 화면용 배치 행 (해당 동만 필터)
  const dongRows = useMemo(() => {
    if (dong === "ALL") return placedRows;
    return placedRows.filter((r) => r.zone.startsWith(dong + "-"));
  }, [dong, placedRows]);

  // 동별 출고 비율 (최근 1개월, 배치 제품 기준) — 총괄 우측 상단 표시
  const dongOutboundRatio = useMemo(() => {
    const sums: Record<string, number> = {};
    let total = 0;
    for (const r of placedRows) {
      const d = r.zone.charAt(0);
      if (!/^[A-E]$/.test(d)) continue;
      sums[d] = (sums[d] || 0) + (r.qty || 0);
      total += r.qty || 0;
    }
    const pcts: Record<string, number> = {};
    for (const d of Object.keys(sums)) {
      pcts[d] = total > 0 ? Math.round((sums[d] / total) * 1000) / 10 : 0;
    }
    return { sums, total, pcts };
  }, [placedRows]);

  // 동별 TOP 3 품목 (최근 1개월 출고 박스 기준) — 우측 패널 비율 카드 하단 표시
  const dongTopProducts = useMemo(() => {
    const groups: Record<string, { pnum: string; name: string; qty: number; zone: string }[]> = {};
    for (const r of placedRows) {
      const d = r.zone.charAt(0);
      if (!/^[A-E]$/.test(d)) continue;
      if (!groups[d]) groups[d] = [];
      groups[d].push({ pnum: r.pnum, name: r.name, qty: r.qty || 0, zone: r.zone });
    }
    const result: Record<string, { pnum: string; name: string; qty: number; pct: number }[]> = {};
    for (const d of Object.keys(groups)) {
      const rows = groups[d];
      const sum = rows.reduce((acc, r) => acc + r.qty, 0);
      result[d] = [...rows]
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 3)
        .map((r) => ({
          pnum: r.pnum,
          name: r.name,
          qty: r.qty,
          pct: sum > 0 ? Math.round((r.qty / sum) * 1000) / 10 : 0,
        }));
    }
    return result;
  }, [placedRows]);

  // 우측 패널 (배치/미배치/임시보관함/3개월 미출고 탭) — 총괄·동별 공통
  // T5(2026-08-19): 수정 모드면 하단에 휴지통 + 임시보관함 패널 표시 (세로 스크롤)
  const renderRightPanel = (rows: typeof placedRows) => {
    const placedUnique = new Set(rows.map((r) => r.pnum)).size;
    return (
    <div
      className={
        "rounded-xl border bg-card p-3 shrink-0 w-[560px] flex flex-col gap-2 " +
        (editMode ? "max-h-[calc(100vh-110px)] overflow-auto" : "")
      }
    >
      {/* 동별 출고 비율 (최근 1개월) */}
      {dongOutboundRatio.total > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-slate-700">📦 동별 출고 비율 (최근 1개월)</span>
            <span className="text-[10px] text-slate-500 tabular-nums">합계 {dongOutboundRatio.total.toLocaleString()}박스</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(dongOutboundRatio.pcts).map(([d, pct]) => (
              <div key={d}>
                <div className="flex justify-between text-[10px]">
                  <span className="font-semibold text-slate-600">{d}동</span>
                  <span className="font-bold text-slate-800 tabular-nums">{pct}%</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div className="h-full rounded-full bg-[#721FE5]" style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>
                {(dongTopProducts[d]?.length || 0) > 0 && (
                  <div className="mt-1">
                    <div className="text-[9px] font-bold text-slate-500 mb-0.5">TOP</div>
                    {dongTopProducts[d].map((t) => (
                      <div key={t.pnum} className="text-[9px] text-slate-600 leading-tight truncate">
                        {t.pnum}번 {t.name.length > 20 ? t.name.slice(0, 20) : t.name} {t.qty}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => { setPanelTab("placed"); setOpenLg(null); setSelPnum(null); setSelZone(null); }}
          className={
            "flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors " +
            (panelTab === "placed" ? "bg-[#721FE5] text-white" : "bg-muted text-foreground hover:bg-muted/80")
          }
        >
          배치 내역 ({placedUnique})
        </button>
        <button
          type="button"
          onClick={() => { setPanelTab("unplaced"); setOpenLg(null); setSelPnum(null); setSelZone(null); }}
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
            onClick={() => { setPanelTab("overflow"); setOpenLg(null); setSelPnum(null); setSelZone(null); setMovePnum(null); }}
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
        <button
          type="button"
          onClick={() => { setPanelTab("staging"); setOpenLg(null); setSelPnum(null); setSelZone(null); setMovePnum(null); }}
          className={
            "flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors " +
            (panelTab === "staging"
              ? "bg-emerald-600 text-white"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100")
          }
        >
          📦 임시보관함 ({staging.length})
        </button>
        <button
          type="button"
          onClick={() => { setPanelTab("noout3m"); setOpenLg(null); setSelPnum(null); setSelZone(null); setMovePnum(null); }}
          className={
            "flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors " +
            (panelTab === "noout3m"
              ? "bg-slate-700 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200")
          }
        >
          🚫 3개월 미출고 ({noOut3mRows.length})
        </button>
        <button
          type="button"
          onClick={() => { setPanelTab("list"); setOpenLg(null); setSelPnum(null); setSelZone(null); setMovePnum(null); }}
          className={
            "flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors " +
            (panelTab === "list"
              ? "bg-sky-600 text-white"
              : "bg-sky-50 text-sky-700 hover:bg-sky-100")
          }
        >
          📋 리스트
        </button>
        <button
          type="button"
          onClick={() => { setPanelTab("server"); setOpenLg(null); setSelPnum(null); setSelZone(null); setMovePnum(null); void pdLoadHistory(); }}
          className={
            "flex-1 px-2 py-1.5 rounded-md text-xs font-semibold transition-colors " +
            (panelTab === "server"
              ? "bg-indigo-600 text-white"
              : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100")
          }
        >
          🗄 서버 버전{serverVersion != null ? ` (v${serverVersion})` : ""}
        </button>
      </div>
      {panelTab === "staging" ? (
        <StagingPanel staging={staging} onClear={clearStaging} onRemove={stagingToUnplaced} editMode={editMode} masterMap={masterMap} openLg={openLg} onToggle={(lg) => setOpenLg(openLg === lg ? null : lg)} />
      ) : panelTab === "placed" ? (
        <CategoryList
          rows={rows}
          openLg={openLg}
          onToggle={(lg) => setOpenLg(openLg === lg ? null : lg)}
          onSelect={(r) => { setSelPnum(r.pnum); setSelZone(r.zone ?? null); }}
          editMode={editMode}
        />
      ) : panelTab === "unplaced" ? (
        <UnplacedPanel
          rows={unplaced.map((u) => ({
            pnum: u.pnum,
            name: u.master_name || u.name,
            lg: u.category_lg || u.cat || "기타",
            md: u.category_md,
            stock: u.stock ?? null,
            zone: u.loc,
            qty: u.boxes ?? (u.barcode ? calcMonthQty(u.barcode) : 0),
          }))}
          openLg={openLg}
          onToggle={(lg) => setOpenLg(openLg === lg ? null : lg)}
          onSelect={(r) => { setSelPnum(r.pnum); setSelZone(r.zone ?? null); }}
        />
      ) : panelTab === "noout3m" ? (
        <CategoryList
          rows={noOut3mRows}
          openLg={openLg}
          onToggle={(lg) => setOpenLg(openLg === lg ? null : lg)}
          note={
            <p className="text-[10px] text-slate-700 bg-slate-100 rounded px-2 py-1 leading-snug">
              최근 3개월 출고 이력이 없는 품목 — <b>진열 대상에서 제외</b>되었습니다.
              <br />배치/미배치 목록에서 제외되며, 아래 목록으로만 확인할 수 있습니다. (기준: 제품 마스터)
            </p>
          }
        />
      ) : panelTab === "list" ? (
        <div className="space-y-3 px-1 max-h-[62vh] overflow-auto">
          <p className="text-[10px] text-slate-700 bg-slate-100 rounded px-2 py-1 leading-snug">
            동별 · 로케이션 번호순 배치 목록 — 행 클릭 시 해당 칸으로 이동·강조됩니다.
          </p>
          {locListSections.map((sec) => (
            <div key={sec.dk} className="rounded-lg border bg-white overflow-hidden">
              <div className="px-2 py-1.5 text-xs font-bold text-slate-800 bg-slate-50 border-b flex items-center justify-between">
                <span>{sec.dk}동</span>
                <span className="text-[10px] font-normal text-muted-foreground">{sec.rows.length}품목</span>
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[10px] text-muted-foreground border-b bg-white">
                    <th className="px-2 py-1 w-16">로케이션</th>
                    <th className="px-2 py-1 w-16">제품번호</th>
                    <th className="px-2 py-1">제품명</th>
                    <th className="px-2 py-1 w-28">분류</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((r) => (
                    <tr
                      key={`${r.zone}-${r.pn}`}
                      className="border-b last:border-b-0 hover:bg-sky-50 cursor-pointer"
                      onClick={() => { if (!handleMoveToZone(r.zone)) setDong(r.zone.split("-")[0] as DongKey); }}
                    >
                      <td className="px-2 py-1 font-mono font-bold text-amber-700">{r.no}</td>
                      <td className="px-2 py-1 tabular-nums">{r.pn}</td>
                      <td className="px-2 py-1 truncate max-w-[190px]" title={r.name}>{r.name || "(정보 없음)"}</td>
                      <td className="px-2 py-1 text-[10px] text-muted-foreground">{[r.lg, r.md].filter(Boolean).join("/")}</td>
                    </tr>
                  ))}
                  {sec.rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">배치 없음</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : panelTab === "server" ? (
        <div className="space-y-2 px-1">
          <p className="text-[10px] text-slate-700 bg-slate-100 rounded px-2 py-1 leading-snug">
            서버에는 <b>직전 버전 1개</b>만 보관됩니다. 복원하면 현재 상태가 먼저 저장된 뒤 직전 버전으로 되돌립니다.
          </p>
          {historyLoading ? (
            <div className="text-xs text-muted-foreground px-2 py-3 text-center">불러오는 중...</div>
          ) : historyList.length === 0 ? (
            <div className="text-xs text-muted-foreground px-2 py-3 text-center">보관된 이전 버전 없음</div>
          ) : (
            historyList.slice(0, 1).map((h) => (
              <div key={h.version} className="border rounded-md px-2 py-1.5 flex items-center justify-between gap-2">
                <div className="min-w-0 text-[11px]">
                  <div className="font-bold tabular-nums">버전 {h.version}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(h.created_at).toLocaleString("ko-KR")} · {h.saved_by}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700"
                  onClick={() => void pdRestoreVersion(h.version)}
                >
                  이 버전으로 복원
                </button>
              </div>
            ))
          )}
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
                <br />① 품목을 <b>클릭</b> 후 이동할 칸을 선택하거나 ② <b>미배치로</b> 보내세요.
              </p>
              {movePnum && (
                <p className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded px-2 py-1 leading-snug">
                  ▶ {movePnum}번 이동 중 — <b>미니맵(지도)에서 이동할 칸을 클릭</b>하세요. 기존 제품은 자리이탈로 이동합니다.
                </p>
              )}
              {overflow.map((o, oi) => (
                <div
                  key={`${o.pnum}-${o.fromZone}-${oi}`}
                  onClick={() => { setMovePnum(o.pnum); setSelPnum(o.pnum); setSelZone(null); }}
                  className={
                    "border rounded-md px-2 py-1.5 flex items-center justify-between gap-2 cursor-pointer " +
                    (movePnum === o.pnum ? "border-amber-500 bg-amber-100" : "hover:border-amber-300")
                  }
                  title="클릭 후 이동할 칸을 선택하세요 (기존 제품은 자리이탈로 이동)"
                >
                  <div className="min-w-0">
                    <div className="text-[11px] font-bold tabular-nums text-amber-900">
                      <DragChip
                        zoneId={o.fromZone || "overflow"}
                        itemIdx={0}
                        pnum={o.pnum}
                        text={o.pnum}
                        kind="overflow"
                        disabled={!editMode}
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
                    className="shrink-0 text-[10px] text-amber-700 hover:text-red-600"
                    onClick={(ev) => { ev.stopPropagation(); setOverflow((ov) => ov.filter((x) => x !== o)); }}
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
                  <div>1개월 출고: {u.barcode ? calcMonthQty(u.barcode) : u.boxes}박스</div>
                  <div>현재고: {u.stock ?? "-"}</div>
                  <div className="text-muted-foreground">로케이션: {u.loc}</div>
                </>
              );
            })()
          )}
        </div>
      ) : null}
      {editMode && (
        <TrashDropzone />
      )}
      {editMode && (
        <StagingPanel staging={staging} onClear={clearStaging} onRemove={stagingToUnplaced} editMode={editMode} masterMap={masterMap} openLg={openLg} onToggle={(lg) => setOpenLg(openLg === lg ? null : lg)} />
      )}
    </div>
  );
  };

  return (
    <div className="space-y-4 w-full max-w-none">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground mb-3">
          A동 · 위치는 좌표(X열, Y행)로 확인 · 동일 분류 묶음 ·
          7번=슬림서랍장 위주+칵투스(1칸 1품목) · X1/X2=2품목 · 호버 시 좌표·분류·제품명·재고 표시
        </p>
        <p className="text-base font-bold text-slate-800 mb-3 flex items-center justify-between gap-2 flex-wrap">
          <span>
            배치 {placedPnums.size} / {A_TOTAL_PRODUCTS}
            <span className="text-sm font-bold text-red-600 ml-2">
              미배치 {unplaced.length}
            </span>
          </span>
          {/* 서버 저장 상태 (2026-08-23 서버 영속화) */}
          <span className="flex items-center gap-2 text-xs font-normal">
            {serverSyncError && (
              <>
                <span className="text-red-600 font-semibold">⚠ 서버 미동기(로컬 전용)</span>
                <button
                  type="button"
                  className="rounded border border-red-300 bg-red-50 px-2 py-0.5 font-semibold text-red-700 hover:bg-red-100"
                  disabled={serverRetrying}
                  onClick={() => {
                    setServerRetrying(true);
                    void pdFlushNow(true).finally(() => setServerRetrying(false));
                  }}
                >
                  {serverRetrying ? "재시도 중..." : "재시도"}
                </button>
              </>
            )}
            {lastServerSaveText && (
              <span className="text-slate-500">마지막 서버 저장: {lastServerSaveText}</span>
            )}
          </span>
        </p>

        {/* 충돌 배너 — last-write-wins 전환으로 폐지 (2026-08-25) */}

        {/* 제품 위치 검색: 제품명 / 로케이션 / 제품번호 / 바코드 */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="제품명 · 로케이션(위치번호) · 제품번호 · 바코드 검색"
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
                        {h.placed
                          ? `위치 ${h.dong}동${h.zone && coordOfAll.get(h.zone) ? ` 좌표 ${fmtCoordKey(coordOfAll.get(h.zone)!)}` : ""}${h.locNo ? ` · 로케이션 ${h.locNo}` : ""}`
                          : `미배치${h.loc ? ` · 쿠팡 로케이션 ${h.loc}` : ""}`}
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

        <div className="flex flex-wrap gap-2 mb-4 items-center">
          {/* 모바일 조회 뷰 토글 (2026-08-25) */}
          <button
            type="button"
            onClick={() => setMobileView((v) => !v)}
            className={
              "px-3 py-2 rounded-lg text-xs font-bold border transition-colors " +
              (mobileView
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-600 border-slate-300")
            }
            title="목록형 조회 뷰 — 모바일에서 제품 확인용"
          >
            {mobileView ? "📋 목록 뷰 (ON)" : "🗺️ 지도 뷰"}
          </button>
          {!mobileView && (
          <>
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
          </>
          )}
        </div>

        {/* 모바일 조회 뷰 — 목록형 (2026-08-25) */}
        {mobileView && (
          <MobileListView data={data} masterMap={masterMap} mdyn={Object.fromEntries(coordNosByZone)} />
        )}

        {/* 분류·단수 필터 (드래그 재배치용) — E동/총괄 제외 */}
        {!mobileView && dong !== "ALL" && dong !== "E" && (
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

        {!mobileView && (dong === "ALL" ? (
          <div className="flex gap-3 items-start">
            <DndContext sensors={sensors} autoScroll={false} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {(() => {
              const renderCard = (
                k: DongKey,
                scale: number,
                wOverride?: number,
                hOverride?: number
              ) => {
                const dl = layoutState.find((r) => r.key === k) ?? DONG_LAYOUTS.find((r) => r.key === k)!;
                // 총괄 미니맵 번호 — 좌표 귀속 (2026-09-04): 각 존이 현재 차지한 좌표의 기준표 번호
                const miniNos = Object.fromEntries(coordNosByZone);
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
                        {/* 좌표 기준 오버레이 (2026-09-05): A동 동적 발행 번호 — 단독 뷰와 동일 소스(computeLocNosAll) */}
                        {k === "A" && (() => {
                          const aCoordNos = dynLocNos.byCoord.get("A");
                          const sysO = buildGridCoordSystem("A", dl.zones);
                          if (!aCoordNos || !sysO) return null;
                          return Array.from(aCoordNos.entries()).map(([coordO, nosO]) => {
                            const cMatchO = /^(\d+)-(\d+)$/.exec(coordO);
                            if (!cMatchO) return null;
                            const colPxO = sysO.colReps[Number(cMatchO[1]) - 1];
                            const rowPxO = sysO.rowRepsDesc[Number(cMatchO[2]) - 1];
                            if (colPxO == null || rowPxO == null) return null;
                            return (
                              <div
                                key={`ovl-${coordO}`}
                                className="absolute pointer-events-none text-[8px] leading-none font-mono font-bold text-amber-600"
                                style={{
                                  left: colPxO - SLOT.w / 2 + 2,
                                  top: rowPxO - SLOT.h / 2 + 3,
                                  width: SLOT.w - 4,
                                  textAlign: "left",
                                }}
                              >
                                {fmtLocNos(nosO)}
                              </div>
                            );
                          });
                        })()}
                        {dl.zones.map((z) => (
                          <MiniZoneCell
                            key={z.id}
                            z={z}
                            value={data[z.id] || ""}
                            tip={makeTooltip(z)}
                            flash={flashZone === z.id}
                            editMode={editMode}
                            onNavigate={() => { if (!handleMoveToZone(z.id)) setDong(k); }}
                            locNos={miniNos[z.id]}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              };
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
            })()}
            </DndContext>
          </div>
        ) : (
        <div ref={mapWrapRef} className="w-full overflow-auto pb-2" style={{ maxHeight: "calc(100vh - 240px)" }}>
          {/* 배치도 전용 줌 컨트롤 — 출고비율 테이블과 독립 (2026-08-28) */}
          <div className="flex items-center gap-1 mb-2">
            <button type="button" onClick={zoomOut} className="px-2 py-0.5 text-xs rounded border bg-white hover:bg-slate-100" title="배치도 축소">−</button>
            <span className="text-xs text-slate-600 w-12 text-center">{Math.round(zoomFactor * 100)}%</span>
            <button type="button" onClick={zoomIn} className="px-2 py-0.5 text-xs rounded border bg-white hover:bg-slate-100" title="배치도 확대">＋</button>
            <button type="button" onClick={zoomReset} className="px-2 py-0.5 text-xs rounded border bg-white hover:bg-slate-100" title="기본 배율">기본</button>
                        <span className="text-[10px] text-slate-400 ml-1">배치도 전용 확대/축소</span>
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="px-2 py-0.5 text-xs rounded border bg-white hover:bg-slate-100"
              title="우측 배치/미배치 내역 펼치기·접기 (접으면 배치도가 전체 폭을 씀)"
            >
              {panelOpen ? "📋 내역 접기 ◀" : "📋 내역 펼치기 ▶"}
            </button>
                      </div>
          <DndContext sensors={sensors} autoScroll={false} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 items-start">
          {/* 배치도 블록 — 우측 카드 침범 방지(2026-09-05): 카드 펼침 시 카드 폭(560+gap)만큼 제한,
              접으면 전체 폭 사용. 콘텐츠가 블록 폭을 넘으면 블록 안에서만 가로 스크롤 */}
          <div
            className="flex flex-col gap-2 shrink-0 min-w-0 overflow-auto"
            style={panelOpen ? { maxWidth: "calc(100% - 572px)" } : { maxWidth: "100%" }}
          >
          <div style={{ width: gridContentW * fitScale * zoomFactor, height: gridContentH * fitScale * zoomFactor }}>
                    <div
                      ref={gridRef}
                      className="relative rounded-xl border bg-slate-50 shrink-0"
                      style={{
                        height: gridContentH,
                        width: gridContentW,
                        minWidth: gridContentW,
                        minHeight: gridContentH,
                        transform: `scale(${fitScale * zoomFactor})`,
                        transformOrigin: "top left",
                      }}
            onPointerDownCapture={handleSelDownCapture}
            onPointerDown={handleSelDown}
            onPointerMove={handleSelMove}
            onPointerUp={handleSelUp}
          >
            {/* 구 lineLabels 렌더링 제거 (2026-08-28) — 숫자 좌표는 아래 gridLabels로만 표시 */}

            {/* 그리드 좌표 라벨 — 렌더 존 기준 동적 계산 (2026-08-28) */}
            {gridLabels.labels.map((lb, i) => (
              <div
                key={`gl-${i}`}
                className="absolute pointer-events-none text-[9px] font-bold text-blue-600 leading-none"
                style={lb.style}
              >
                {lb.text}
              </div>
            ))}

            {/* 가상 그리드 — 수정 모드 전용, 여백까지 점선 칸 표시 (2026-08-28) */}
            {ghostCells.map((g, i) => (
              <div
                key={`ghost-${i}`}
                className="absolute pointer-events-none rounded border border-dashed border-slate-300"
                style={{ left: g.left, top: g.top, width: g.width, height: g.height }}
              />
            ))}

          {current.zones.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                {current.label} 라인 배치 대기
              </div>
            ) : null}

            {current.zones.map((z) => {
              const zz = gridLabels.coordOf.has(z.id) ? { ...z, gridCoord: gridLabels.coordOf.get(z.id) } : z;
              return (
              <ZoneCell
                key={z.id}
                z={zz}
                value={data[z.id]}
                matched={filterMatchedZones.has(z.id)}
                flash={flashZone === z.id}
                sel={selZone === z.id}
                editMode={editMode}
                selected={selectedZones.includes(z.id)}
                moveTarget={canMoveTo && !selectedZones.includes(z.id)}
                onToggleSelect={() => handleCellClick(z.id)}
                editing={editingZone === z.id}
                editValue={editVal}
                editLocValue={editLocVal}
                onEditChange={setEditVal}
                onEditLocChange={setEditLocVal}
                onEditCommit={() => commitInlineEdit(z.id)}
                onEditCancel={() => { setEditingZone(null); setEditVal(""); setEditLocVal(""); }}
                tip={makeTooltip(zz)}
                locNos={coordNosByZone.get(z.id)}
              />
              );
            })}
            {editMode && selRect && selStartRef.current ? (
              <div
                className="pointer-events-none absolute z-50"
                style={{
                  // 확대 배율 보정 (2026-08-28): 화면(px)→그리드 좌표 환산
                  left: (Math.min(selRect.x1, selRect.x2) - selStartRef.current.cx) / (fitScale * zoomFactor || 1),
                  top: (Math.min(selRect.y1, selRect.y2) - selStartRef.current.cy) / (fitScale * zoomFactor || 1),
                  width: Math.abs(selRect.x2 - selRect.x1) / (fitScale * zoomFactor || 1),
                  height: Math.abs(selRect.y2 - selRect.y1) / (fitScale * zoomFactor || 1),
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
           </div>
           </div>
          {panelOpen && renderRightPanel(dongRows)}
          </div>
          </DndContext>
        </div>
        ))}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={editMode ? "default" : "secondary"}
            onClick={() => {
              setEditMode((v) => !v);
              setSelectedZones([]);
              // ⛔ 수정 모드 OFF 시 인라인 input 잔류 방지 (H3)
              editingZoneRef.current = null;
              setEditingZone(null);
              setEditVal("");
            }}
          >
            {editMode ? "✓ 수정 중" : "수정"}
          </Button>
          {editMode && selectedZones.length === 0 ? (
            <span className="text-[11px] text-slate-500">빈 공간 드래그 = 칸 선택 · 칸 위에서는 Shift+드래그</span>
          ) : null}
          {editMode && selectedZones.length > 0 ? (
            <>
              <span className="text-xs font-bold text-purple-700">
                {selectedZones.length}칸 선택
              </span>
              <Button type="button" className="bg-sky-600 hover:bg-sky-700" onClick={() => groupMove(1)} title="선택한 칸들을 한 칸 위로 이동 (한 라인을 통째로 올리려면 라인 전체를 드래그 선택)">
                ↑ 위로 이동
              </Button>
              <Button type="button" className="bg-sky-600 hover:bg-sky-700" onClick={() => groupMove(-1)} title="선택한 칸들을 한 칸 아래로 이동 (한 라인을 통째로 내리려면 라인 전체를 드래그 선택)">
                ↓ 아래로 이동
              </Button>
              <Button type="button" className="bg-sky-600 hover:bg-sky-700" onClick={() => groupMoveX(-1)} title="선택한 칸들을 한 칸 왼쪽으로 이동 (단축키: ← 방향키)">
                ← 왼쪽으로 이동
              </Button>
              <Button type="button" className="bg-sky-600 hover:bg-sky-700" onClick={() => groupMoveX(1)} title="선택한 칸들을 한 칸 오른쪽으로 이동 (단축키: → 방향키)">
                → 오른쪽으로 이동
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
            <Button type="button" variant="outline" onClick={toggleFixedSelected} title="선택한 칸을 고정(🔒)/해제 — 고정 칸은 드래그·라인 이동·좌표 이동 전부 차단">
              🔒 고정
            </Button>
          )}
          {editMode && (
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              이동:
              <input
                value={moveCoordText}
                onChange={(e) => setMoveCoordText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); moveSelectedToCoord(); } }}
                placeholder="X가로, Y세로"
                className="w-24 rounded border px-1.5 py-0.5 text-xs"
                title="목표 좌표 입력 (화면 라벨 기준, 예: X3, Y7)"
              />
              <button type="button" className="px-1.5 py-0.5 rounded border hover:bg-slate-100" onClick={moveSelectedToCoord} title="선택한 칸을 입력한 좌표로 이동">→</button>
            </span>
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
          <Button type="button" className="bg-blue-600 hover:bg-blue-700" onClick={applyARankPlacement} title="출고량 순위 기준 A동 자동 재배치">
            🔄 규칙 재배치
          </Button>
          <Button type="button" variant="secondary" onClick={exportJSON}>
            <Download className="w-4 h-4 mr-1.5" />
                        JSON 내보내기
                      </Button>
                      <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" onClick={exportExcel} title="현재 보고 있는 동의 배치를 엑셀로 다운로드 (전체 화면에서는 전체)">
                        <Download className="w-4 h-4 mr-1.5" />
                        엑셀 다운로드
                      </Button>
                      <Button type="button" className="bg-orange-600 hover:bg-orange-700" onClick={() => excelInputRef.current?.click()} title="엑셀 업로드로 현재 동 배치 반영">
                        <Upload className="w-4 h-4 mr-1.5" />
                        엑셀 업로드
                      </Button>
                      <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={onExcelUpload} />
                      <Button type="button" className="bg-slate-700 hover:bg-slate-800" onClick={printLayoutSheets} title="현재 동(총괄 화면에서는 전체 동) 배치도를 A4 가로 최대 크기로 인쇄">
                        🗺 배치도 인쇄
                      </Button>
                      <Button type="button" className="bg-sky-700 hover:bg-sky-800" onClick={printListSheets} title="현재 동(총괄 화면에서는 전체 동) 로케이션·품명 목록을 A4 세로 14pt로 인쇄">
                        📋 목록 인쇄
                      </Button>
          {saveMsg ? (
            <span className="text-sm text-green-700 font-medium">{saveMsg}</span>
          ) : null}
        </div>
      </div>

      {!mobileView && (dong === "A" ? (
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
      ) : null)}

      {/* B/C/D동 배치 현황 통계 */}
      {(() => {
        const stats: Record<string, Record<string, number>> = { B: {}, C: {}, D: {} };
        const totals: Record<string, number> = { B: 0, C: 0, D: 0 };

        for (const [zoneId, pnumStr] of Object.entries(data)) {
          const d = zoneId.split("-")[0];
          if (d !== "B" && d !== "C" && d !== "D") continue;
          const pnums = pnumStr.split(",").map((s: string) => s.trim()).filter(Boolean);
          for (const pnum of pnums) {
            const master = masterMap[pnum];
            const cat = master?.lg || "미분류";
            stats[d][cat] = (stats[d][cat] || 0) + 1;
            totals[d]++;
          }
        }

        const hasAny = totals.B > 0 || totals.C > 0 || totals.D > 0;
        if (!hasAny) return null;

        return (
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-semibold">B/C/D동 배치 현황</h3>
            <div className="grid grid-cols-3 gap-4">
              {(["B", "C", "D"] as const).map((d) => (
                <div key={d} className="border rounded-md p-2">
                  <h4 className="text-xs font-bold text-slate-600 mb-2">{d}동 ({totals[d]}개)</h4>
                  <div className="max-h-32 overflow-auto space-y-1">
                    {Object.entries(stats[d])
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, count]) => (
                        <div key={cat} className="text-[11px] flex justify-between">
                          <span className="truncate max-w-[100px]" title={cat}>{cat}</span>
                          <span className="text-muted-foreground tabular-nums">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {currentZone ? `${zoneDisplayName(currentZone)} 제품 배정` : "제품 배정"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="prod-assign">제품 검색 (번호 / 이름 / 분류 / 바코드 / 로케이션)</Label>
            <Input
              id="prod-assign"
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              placeholder="예: 663 / 모던 3단 화이트 / R0104…"
              autoFocus
            />
            {assignFiltered.length > 0 && (
              <div className="max-h-48 overflow-auto border rounded-md divide-y divide-slate-100">
                {assignFiltered.map((c) => (
                  <button
                    key={c.pnum}
                    type="button"
                    onClick={() => { setInputVal(c.pnum); setAssignSearch(""); }}
                    className={
                      "w-full text-left px-2 py-1 text-[11px] hover:bg-sky-50 flex justify-between gap-1 " +
                      (inputVal === c.pnum ? "bg-sky-100" : "")
                    }
                  >
                    <span className="font-semibold tabular-nums shrink-0">{c.pnum}</span>
                    <span className="truncate text-muted-foreground">{c.name || "-"}</span>
                    {c.lgmd && <span className="shrink-0 text-[10px] text-muted-foreground">{c.lgmd}</span>}
                    {c.loc && <span className="shrink-0 text-[10px] text-muted-foreground">📍{c.loc}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="pt-1 border-t border-slate-100">
              <Label htmlFor="prod-direct" className="text-[11px] text-slate-600">
                직접 입력 (콤마 구분 다품목 — 빠진 제품은 📦임시보관함으로 이동)
              </Label>
              <Input
                id="prod-direct"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value.replace(/[^0-9,\s]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmAssign(); } }}
                placeholder="예: 19,28"
                className="mt-1 tabular-nums"
              />
            </div>
            {inputVal ? (
              <p className="text-xs text-green-700">선택됨: {inputVal}번 — 확인 시 {zoneDisplayName(currentZone)}에 배정됩니다.</p>
            ) : (
              <p className="text-xs text-muted-foreground">비우고 확인하면 배정이 해제됩니다. (기존 제품은 자리이탈로 이동)</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button type="button" onClick={() => confirmAssign()}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* A동 재배치 설정 다이얼로그 */}
      <Dialog open={placementDialogOpen} onOpenChange={setPlacementDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>재배치 설정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* 대상 동 선택 */}
            <div>
              <Label className="text-sm font-medium">대상 동</Label>
              <div className="flex gap-2 mt-2">
                {["A", "B", "C", "D", "E"].map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant={targetDong === d ? "default" : "outline"}
                    onClick={() => setTargetDong(d)}
                    className={targetDong === d ? "bg-blue-600" : ""}
                  >
                    {d}동
                  </Button>
                ))}
              </div>
            </div>

            {/* 모드 선택 */}
            <div>
              <Label className="text-sm font-medium">배치 모드</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  variant={placementMode === "outbound" ? "default" : "outline"}
                  onClick={() => setPlacementMode("outbound")}
                  className={placementMode === "outbound" ? "bg-blue-600" : ""}
                >
                  📊 출고량 순위
                </Button>
                <Button
                  type="button"
                  variant={placementMode === "category" ? "default" : "outline"}
                  onClick={() => setPlacementMode("category")}
                  className={placementMode === "category" ? "bg-blue-600" : ""}
                >
                  📂 분류 우선
                </Button>
              </div>
            </div>

            {placementMode === "outbound" ? (
              <>
                <div>
                  <Label htmlFor="top-n">상위 N개 (1~2번 라인 배치)</Label>
                  <Input
                    id="top-n"
                    type="number"
                    min={1}
                    max={100}
                    value={placementTopN}
                    onChange={(e) => setPlacementTopN(Number(e.target.value))}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    출고량 기준 상위 {placementTopN}개 제품을 1~2번 라인에 배치합니다.
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium">나머지 라인 칸당 제품 수 (L3~L6)</Label>
                  <div className="flex gap-2 mt-2">
                    {[1, 2, 3].map((n) => (
                      <Button
                        key={n}
                        type="button"
                        variant={restItemsPerSlot === n ? "default" : "outline"}
                        onClick={() => setRestItemsPerSlot(n as 1 | 2 | 3)}
                        className={restItemsPerSlot === n ? "bg-green-600" : ""}
                      >
                        {n}개
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    상위 {placementTopN}개 이후 제품을 3~6번 라인에 칸당 {restItemsPerSlot}개씩 배치합니다.
                  </p>
                </div>

                <div>
                  <Label className="text-sm font-medium">상위 {placementTopN}개 미리보기</Label>
                  <div className="mt-2 max-h-48 overflow-auto border rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-muted sticky top-0">
                        <tr className="text-left">
                          <th className="p-2">순위</th>
                          <th className="p-2">제품번호</th>
                          <th className="p-2">1개월출고</th>
                          <th className="p-2">분류</th>
                          <th className="p-2">제품명</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const items = Object.entries(masterMap)
                            .filter(([pnum, m]) => m.name && !m.no3m && !A_STAGING_DEFAULT.includes(pnum))
                            .map(([pnum, m]) => ({
                              pnum,
                              name: m.name,
                              lg: m.lg,
                              boxes: m.barcode ? calcMonthQty(m.barcode) : 0,
                            }))
                            .sort((a, b) => b.boxes - a.boxes)
                            .slice(0, placementTopN);
                          return items.map((item, idx) => (
                            <tr key={item.pnum} className="border-t">
                              <td className="p-2 tabular-nums">{idx + 1}</td>
                              <td className="p-2 font-semibold tabular-nums">{item.pnum}</td>
                              <td className="p-2 tabular-nums">{item.boxes}</td>
                              <td className="p-2">{item.lg}</td>
                              <td className="p-2 max-w-[200px] truncate" title={item.name}>
                                {item.name}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {/* 좌측 컬럼: 상위 N개 입력 + 배치 미리보기 */}
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="top-n-cat">상위 N개 (1~2번 라인 배치)</Label>
                      <Input
                        id="top-n-cat"
                        type="number"
                        min={1}
                        max={200}
                        value={placementTopN}
                        onChange={(e) => setPlacementTopN(Number(e.target.value))}
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        상위 {placementTopN}개 안에서 선택한 분류끼리 먼저 묶여 배치됩니다.
                      </p>
                    </div>

                    <div>
                      <Label className="text-sm font-medium">나머지 라인 칸당 제품 수 (L3~L6)</Label>
                      <div className="flex gap-2 mt-2">
                        {[1, 2, 3].map((n) => (
                          <Button
                            key={n}
                            type="button"
                            variant={restItemsPerSlot === n ? "default" : "outline"}
                            onClick={() => setRestItemsPerSlot(n as 1 | 2 | 3)}
                            className={restItemsPerSlot === n ? "bg-green-600" : ""}
                          >
                            {n}개
                          </Button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        상위 {placementTopN}개 이후 제품을 3~6번 라인에 칸당 {restItemsPerSlot}개씩 배치합니다.
                      </p>
                    </div>

                    {/* 배치 미리보기 */}
                    <div>
                      <Label className="text-sm font-medium">배치 미리보기 (상위 {placementTopN}개)</Label>
                      <div className="mt-2 max-h-[400px] overflow-auto border rounded-md">
                        <table className="w-full text-xs">
                          <thead className="bg-muted sticky top-0">
                            <tr className="text-left">
                              <th className="p-2">순위</th>
                              <th className="p-2">제품번호</th>
                              <th className="p-2">1개월출고</th>
                              <th className="p-2">분류</th>
                              <th className="p-2">제품명</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const allItems = Object.entries(masterMap)
                                .filter(([pnum, m]) => m.name && !m.no3m && !A_STAGING_DEFAULT.includes(pnum))
                                .map(([pnum, m]) => ({
                                  pnum,
                                  name: m.name,
                                  lg: m.lg,
                                  boxes: m.barcode ? calcMonthQty(m.barcode) : 0,
                                }))
                                .sort((a, b) => b.boxes - a.boxes);

                              const topItems = allItems.slice(0, placementTopN);

                              // 선택된 분류별로 그룹화 (선택한 순서대로)
                              const selectedGrouped: typeof allItems = [];
                              for (const cat of selectedCategories) {
                                const items = topItems.filter(i => i.lg === cat);
                                selectedGrouped.push(...items);
                              }

                              // 선택되지 않은 분류: 출고량 많은 순으로 분류별 묶음
                              const unselectedItems = topItems.filter(i => !selectedCategories.includes(i.lg));
                              const unselectedByCat: Record<string, typeof allItems> = {};
                              for (const item of unselectedItems) {
                                if (!unselectedByCat[item.lg]) unselectedByCat[item.lg] = [];
                                unselectedByCat[item.lg].push(item);
                              }
                              const unsortedCats = Object.entries(unselectedByCat)
                                .sort((a, b) => Math.max(...b[1].map(i => i.boxes), 0) - Math.max(...a[1].map(i => i.boxes), 0));
                              const unselectedGrouped: typeof allItems = [];
                              for (const [, items] of unsortedCats) {
                                unselectedGrouped.push(...items);
                              }

                              const finalOrder = [...selectedGrouped, ...unselectedGrouped];

                              return finalOrder.map((item, idx) => (
                                <tr key={item.pnum} className={selectedCategories.includes(item.lg) ? "border-t bg-blue-50" : "border-t"}>
                                  <td className="p-2 tabular-nums">{idx + 1}</td>
                                  <td className="p-2 font-semibold tabular-nums">{item.pnum}</td>
                                  <td className="p-2 tabular-nums">{item.boxes}</td>
                                  <td className="p-2">{item.lg}</td>
                                  <td className="p-2 max-w-[200px] truncate" title={item.name}>
                                    {item.name}
                                  </td>
                                </tr>
                              ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        파란색 배경 = 선택된 분류 (먼저 배치됨)
                      </p>
                    </div>
                  </div>

                  {/* 우측 컬럼: 분류 선택 */}
                  <div>
                    <Label className="text-sm font-medium">우선 배치할 분류 선택 (선택한 순서대로 배치)</Label>
                  <div className="mt-2 max-h-[500px] overflow-auto border rounded-md divide-y">
                    {(() => {
                      // 선택된 분류: 순번순으로 정렬
                      const selected = selectedCategories.map(cat => {
                        const found = availableCategories.find(ac => ac.cat === cat);
                        return found || { cat, count: 0 };
                      });
                      // 미선택 분류: 가나다순 정렬
                      const unselected = availableCategories.filter(({ cat }) => !selectedCategories.includes(cat));
                      const sortedCategories = [...selected, ...unselected];
                      return sortedCategories;
                    })().map(({ cat, count }) => {
                      const orderIdx = selectedCategories.indexOf(cat);
                      const isSelected = orderIdx >= 0;
                      return (
                        <div
                          key={cat}
                          className={`flex items-center gap-2 p-2 ${isSelected ? "bg-blue-50" : "hover:bg-slate-50"}`}
                        >
                          <label className="flex items-center gap-2 flex-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCategories([...selectedCategories, cat]);
                                } else {
                                  setSelectedCategories(selectedCategories.filter(c => c !== cat));
                                }
                              }}
                              className="w-4 h-4"
                            />
                            <span className={`font-medium ${isSelected ? "text-blue-900" : ""}`}>{cat}</span>
                            <span className="text-xs text-muted-foreground">({count}개)</span>
                          </label>
                          {isSelected && (
                            <div className="flex items-center gap-1 ml-auto">
                              <input
                                type="number"
                                min={1}
                                max={selectedCategories.length}
                                value={orderIdx + 1}
                                onChange={(e) => {
                                  const newPos = Math.max(1, Math.min(selectedCategories.length, Number(e.target.value)));
                                  if (newPos !== orderIdx + 1) {
                                    const newCats = [...selectedCategories];
                                    const [moved] = newCats.splice(orderIdx, 1);
                                    newCats.splice(newPos - 1, 0, moved);
                                    setSelectedCategories(newCats);
                                  }
                                }}
                                className="w-12 h-6 px-1 text-center text-xs border border-gray-300 rounded"
                                title="순서 직접 입력"
                              />
                              <button
                                type="button"
                                disabled={orderIdx === 0}
                                onClick={() => {
                                  const newCats = [...selectedCategories];
                                  [newCats[orderIdx - 1], newCats[orderIdx]] = [newCats[orderIdx], newCats[orderIdx - 1]];
                                  setSelectedCategories(newCats);
                                }}
                                className="w-6 h-6 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-xs flex items-center justify-center"
                                title="위로 이동"
                              >↑</button>
                              <button
                                type="button"
                                disabled={orderIdx === selectedCategories.length - 1}
                                onClick={() => {
                                  const newCats = [...selectedCategories];
                                  [newCats[orderIdx], newCats[orderIdx + 1]] = [newCats[orderIdx + 1], newCats[orderIdx]];
                                  setSelectedCategories(newCats);
                                }}
                                className="w-6 h-6 rounded border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-xs flex items-center justify-center"
                                title="아래로 이동"
                              >↓</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    선택된 분류 {selectedCategories.length}개 — ↑↓ 버튼으로 순서 조정 가능
                  </p>
                  {selectedCategories.length > 0 && (
                    <label className="flex items-center gap-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md cursor-pointer hover:bg-amber-100">
                      <input
                        type="checkbox"
                        checked={onlySelectedCategories}
                        onChange={(e) => setOnlySelectedCategories(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm font-medium text-amber-900">
                        선택한 분류만 배치 (미선택 분류는 제외)
                      </span>
                    </label>
                  )}
                  </div>
                </div>
              </>
            )}

            <div className="text-xs text-slate-700 bg-slate-50 border rounded-md p-3 space-y-2">
              <p className="font-semibold text-sm">📌 배치 방법</p>
              {placementMode === "outbound" ? (
                <>
                  <p>• <strong>상위 {placementTopN}개</strong>를 출고량 순서대로 1~2번 라인에 배치</p>
                  <p>• 나머지는 3~6번 라인에 자동 배치</p>
                </>
              ) : (
                <>
                  <p>• <strong>상위 {placementTopN}개</strong> 안에서 선택한 분류가 먼저 배치</p>
                  <p>• 예: 모던 플러스 체크 → 모던 플러스 제품들이 순위 안에서 앞에 모입니다</p>
                  <p>• 선택 안 한 분류는 뒤에 자동 배치</p>
                </>
              )}
              <p className="text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-200">
                💡 재배치 후에도 드래그앤드롭으로 언제든 수동 조정 가능합니다.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setPlacementDialogOpen(false)}>
              취소
            </Button>
            <Button type="button" onClick={executePlacement}>
              재배치 실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
/* ===== 드래그앤드롭 셀 컴포넌트 (2026-08-17) — 편집 모드 확장 예정 ===== */
/** 총괄(ALL) 미니맵 셀: 드롭 대상(drop-ov-) + 점유 시 드래그 소스 (크로스동 이동) */
function MiniZoneCell({
  z,
  value,
  tip,
  flash,
  editMode,
  onNavigate,
  locNos,
}: {
  z: ZoneDef;
  value: string;
  tip: string;
  flash: boolean;
  editMode: boolean;
  onNavigate: () => void;
  locNos?: number[];
}) {
  const isA = z.id.startsWith("A-");
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `drop-ov-${z.id}`,
    data: { zoneId: z.id, fromOverview: true },
  });
  const assigned = Boolean(value);
  const items = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const drag = useDraggable({
    id: `ovdrag-${z.id}-0-${items[0] || "empty"}`,
    disabled: !assigned || !editMode,
    data: { kind: "zone", zoneId: z.id, itemIdx: 0, pnum: items[0] || "" } as DragSource,
  });
  const nodeRef = (node: HTMLButtonElement | null) => {
    dropRef(node);
    if (assigned) drag.setNodeRef(node);
  };
  return (
    <button
      ref={nodeRef}
      type="button"
      data-zone-id={z.id}
      title={tip}
      onClick={(e) => {
        e.stopPropagation();
        onNavigate();
      }}
      {...(assigned ? drag.listeners : {})}
      {...(assigned ? drag.attributes : {})}
      className={
        "absolute flex items-center justify-center rounded border text-center px-0.5 " +
        (assigned
          ? "border-blue-700 bg-blue-50 cursor-grab active:cursor-grabbing"
          : "border-slate-500 bg-white") +
        (isOver ? " ring-2 ring-purple-400" : "") +
        (flash ? " vf-zone-flash" : "")
      }
      style={z.style}
    >
      {/* 로케이션 번호 — 좌표 기준 오버레이로 단일 렌더 (2026-09-04, 총괄=단독 통일) */}
      {!isA && locNos && locNos.length > 0 && (
        <span className="absolute top-0.5 right-0.5 text-[7px] leading-none font-mono font-bold text-amber-600 pointer-events-none">
          {fmtLocNos(locNos)}
        </span>
      )}
      {assigned ? (
        z.productNamesVertical && items.length > 1 ? (
          /* 가로 배치 칸: 제품명 세로 나열 (구획 사이 가로 구분선, 2026-08-29) */
          <span className="font-semibold tabular-nums text-blue-900 flex flex-col items-center justify-center w-full h-full overflow-hidden text-[8px] leading-[1.15]">
            {items.map((it, i) => (
              <span
                key={i}
                className={
                  "flex-1 min-w-0 flex items-center justify-center" +
                  (i < items.length - 1 ? " border-b border-slate-300" : "")
                }
              >
                {it}
              </span>
            ))}
          </span>
        ) : (
        <span
          className={
            "font-semibold text-[10px] leading-tight tabular-nums text-blue-900" +
            (items.length > 1 ? " flex flex-col items-center text-[8px] leading-[1.15]" : "")
          }
        >
          {items.length > 1
            ? items.map((it, i) => <span key={i}>{it}</span>)
            : value}
        </span>
        )
      ) : null}
    </button>
  );
}

/* 통합 분류 목록 패널 — 배치/미배치/임시보관함/3개월 미출고 공통 형식
 * 분류(대분류) 그룹 → 클릭 시 세부 품목 펼침 → 각 행: 번호 + 제품명 + 현재고
 * T6(2026-08-19): editMode면 행 드래그 가능(zone 있는 행만) + 번호 "번" 접미사 */
type CatListRow = { pnum: string; name: string; lg: string; md?: string; stock: number | null; zone?: string; qty?: number | null; itemIdx?: number };

/** T6 완료(2026-08-19): 배치 내역 행 드래그 래퍼 — editMode면 행을 드래그해 칸에 배치
 * kind "zone" 소스로 handleDragEnd 공용 경로(위치 고정·크로스동 중복 제거)를 그대로 탄다. */
function RowDrag({
  zone,
  itemIdx,
  pnum,
  onClick,
  disabled = false,
  children,
}: {
  zone: string;
  itemIdx: number;
  pnum: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `row-${zone}-${itemIdx}-${pnum}`,
    disabled,
    data: { kind: "zone", zoneId: zone, itemIdx, pnum } as DragSource,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={
        "w-full text-left px-2 py-1 text-[11px] border-t first:border-t-0 flex items-center gap-2 " +
        (disabled ? (onClick ? "cursor-pointer hover:bg-sky-50" : "") : "cursor-grab active:cursor-grabbing select-none hover:bg-sky-50 ") +
        (isDragging ? "opacity-40" : "")
      }
      title={disabled ? undefined : "드래그하여 칸에 배치"}
      style={{ touchAction: "none" }}
    >
      {children}
    </div>
  );
}

/* 모바일 조회 뷰 (2026-08-25) — 읽기 전용 목록형: 동 선택 → 칸 목록(위치번호+품목) 표시
 * PC 그리드는 절대좌표라 모바일에서 식별 곤란 → 카드 리스트로 대체. 편집 기능 없음(안전). */
function MobileListView({
  data,
  masterMap,
  mdyn,
}: {
  data: PlacementMap;
  masterMap: Record<string, MasterInfo>;
  mdyn: Record<string, number[]>;
}) {
  const [mdong, setMdong] = useState<"A" | "B" | "C" | "D">("B");
  const [q, setQ] = useState("");
  const layout = DONG_LAYOUTS.find((r) => r.key === mdong);
  if (!layout) return null;
  // 좌표 귀속 번호 (2026-09-04) — 부모에서 전달 (coordNosByZone)
  const locNoOf = (zid: string): string => {
    const nos = mdyn[zid];
    if (!nos || nos.length === 0) return "";
    return nos.length > 1 ? `${nos[0]}~${nos[nos.length - 1]}` : String(nos[0]);
  };
  const rows = layout.zones
    .map((z) => ({ zid: z.id, val: data[z.id] || "" }))
    .filter((r) => r.val);
  // 위치번호(로케이션) 검색 — 번호 입력 시 해당 칸 카드가 목록에 남는다
  const filtered = q.trim()
    ? rows.filter(
        (r) =>
          r.val.toLowerCase().includes(q.trim().toLowerCase()) ||
          r.zid.includes(q.trim()) ||
          locNoOf(r.zid).includes(q.trim()) ||
          r.val
            .split(",")
            .some((pn) => (masterMap[pn.trim()]?.name || "").includes(q.trim()))
      )
    : rows;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {(["A", "B", "C", "D"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setMdong(k)}
            className={
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors " +
              (mdong === k ? "bg-[#721FE5] text-white" : "bg-muted text-foreground")
            }
          >
            {k}동
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제품번호·이름·로케이션 검색"
          className="flex-1 min-w-[140px] h-8 rounded border bg-white px-2 text-xs"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground py-6 text-center border rounded-lg bg-slate-50">
          배치된 품목이 없습니다{q ? " (검색 결과 없음)" : ""}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((r) => {
            const pns = r.val.split(",").map((s) => s.trim()).filter(Boolean);
            return (
              <div key={r.zid} className="border rounded-lg bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
                    {locNoOf(r.zid) || "번호 없음"}
                  </span>
                  <span className="text-[9px] text-slate-400">{pns.length}품목</span>
                </div>
                <div className="text-[11px] font-bold tabular-nums">{pns.join(", ")}</div>
                <div className="text-[10px] text-muted-foreground leading-snug">
                  {pns.map((pn) => masterMap[pn]?.name || pn).join(" · ")}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* 미배치 패널 — 정렬 토글(출고 상위순 / 분류별) 지원 (2026-08-25) */
function UnplacedPanel({
  rows,
  openLg,
  onToggle,
  onSelect,
}: {
  rows: CatListRow[];
  openLg: string | null;
  onToggle: (lg: string) => void;
  onSelect?: (row: CatListRow) => void;
}) {
  const [mode, setMode] = useState<"qty" | "lg">("qty");
  return (
    <div>
      <div className="flex items-center gap-1 px-1 pb-1">
        <button
          type="button"
          onClick={() => setMode("qty")}
          className={
            "rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition-colors " +
            (mode === "qty"
              ? "bg-purple-600 text-white border-purple-600"
              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50")
          }
        >
          출고량 순
        </button>
        <button
          type="button"
          onClick={() => setMode("lg")}
          className={
            "rounded-full px-2.5 py-0.5 text-[10px] font-bold border transition-colors " +
            (mode === "lg"
              ? "bg-sky-600 text-white border-sky-600"
              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50")
          }
        >
          분류별
        </button>
      </div>
      {mode === "qty" ? (
        <CategoryList
          sortBy="qty"
          rows={rows}
          openLg={openLg}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ) : (
        <CategoryList
          rows={rows}
          openLg={openLg}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

function CategoryList({
  rows,
  openLg,
  onToggle,
  onSelect,
  note,
  emptyMsg = "품목이 없습니다 🎉",
  sortBy = "lg",
  editMode = false,
}: {
  rows: CatListRow[];
  openLg: string | null;
  onToggle: (lg: string) => void;
  onSelect?: (row: CatListRow) => void;
  note?: ReactNode;
  emptyMsg?: string;
  sortBy?: "lg" | "qty";
  editMode?: boolean;
}) {
  // 출고 상위순: 분류 그룹핑 없이 전체 rows를 qty 내림차순(높은 출고 먼저) 플랫 리스트로 표시.
  // qty가 null/undefined면 0 취급 → 자연스럽게 뒤로 밀림. (안정 정렬로 동일 qty는 입력 순서 유지)
  if (sortBy === "qty") {
    const sorted = [...rows].sort((a, b) => (b.qty ?? 0) - (a.qty ?? 0));
    return (
      <div className="overflow-auto max-h-[560px] space-y-1 pr-1">
        {note}
        <div className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded-md px-2 py-1 sticky top-0 z-10">
          ⬇️ 출고 상위순 ({sorted.length}품목)
        </div>
        {sorted.length === 0 ? (
          <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-3 text-center">
            {emptyMsg}
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            {sorted.map((r, i) => (
              <RowDrag
                key={`${r.zone ?? ""}-${r.pnum}-${i}`}
                zone={r.zone ?? ""}
                itemIdx={r.itemIdx ?? 0}
                pnum={r.pnum}
                disabled={!editMode}
                onClick={onSelect ? () => onSelect(r) : undefined}
              >
                <span className="font-semibold tabular-nums shrink-0">{r.pnum}번</span>
                <span className="truncate text-muted-foreground flex-1">{r.name || "-"}</span>
                <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-700">출고 {r.qty ?? 0}박스</span>
                <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-500">
                  현재고 {r.stock ?? "-"}
                </span>
              </RowDrag>
            ))}
          </div>
        )}
      </div>
    );
  }

  const groups: Record<string, CatListRow[]> = {};
  for (const r of rows) {
    const lg = r.lg || "기타";
    (groups[lg] ??= []).push(r);
  }
  const keys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  return (
    <div className="overflow-auto max-h-[560px] space-y-1 pr-1">
      {note}
      {keys.length === 0 ? (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-3 text-center">
          {emptyMsg}
        </div>
      ) : (
        keys.map((lg) => (
          <div key={lg} className="border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => onToggle(lg)}
              className="w-full bg-muted px-2 py-1 text-[11px] font-bold flex justify-between items-center hover:bg-muted/80 cursor-pointer"
            >
              <span>{lg}</span>
              <span className="text-muted-foreground">
                {groups[lg].length}품목 {openLg === lg ? "▾" : "▸"}
              </span>
            </button>
            {openLg === lg && (
              <div className="max-h-60 overflow-auto">
                {groups[lg].map((r, i) => (
                  <RowDrag
                    key={`${r.zone ?? ""}-${r.pnum}-${i}`}
                    zone={r.zone ?? ""}
                    itemIdx={r.itemIdx ?? 0}
                    pnum={r.pnum}
                    disabled={!editMode}
                    onClick={onSelect ? () => onSelect(r) : undefined}
                  >
                    <span className="font-semibold tabular-nums shrink-0">{r.pnum}번</span>
                    <span className="truncate text-muted-foreground flex-1">{r.name || "-"}</span>
                    {r.qty != null && (
                      <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-400">출고 {r.qty}박스</span>
                    )}
                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-500">
                      현재고 {r.stock ?? "-"}
                    </span>
                  </RowDrag>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/* 임시 보관함 패널 — DndContext 안에서 렌더되어 useDroppable('drop-staging')이 컨텍스트를 받도록 별도 컴포넌트
 * 배치/미배치/미출고와 동일 형식: 분류 그룹 → 클릭 시 세부 품목 + 현재고 */
function StagingPanel({
  staging,
  onClear,
  onRemove,
  editMode,
  masterMap,
  openLg,
  onToggle,
}: {
  staging: string[];
  onClear: () => void;
  onRemove: (pn: string) => void;
  editMode: boolean;
  masterMap: Record<string, MasterInfo>;
  openLg: string | null;
  onToggle: (lg: string) => void;
}) {
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: "drop-staging",
    data: { kind: "staging" },
  });
  // 분류 그룹 (제품 마스터 기준)
  const groups: Record<string, { pnum: string; name: string; stock: number | null }[]> = {};
  for (const pn of staging) {
    const m = masterMap[pn];
    const lg = m?.lg || "기타";
    (groups[lg] ??= []).push({ pnum: pn, name: m?.name || "", stock: m?.stock ?? null });
  }
  const keys = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length);
  return (
    <div className="mt-2 rounded-md border border-amber-300 bg-amber-50/70 p-2 shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-amber-900">📦 임시 보관함 ({staging.length})</span>
        {staging.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-amber-700 hover:text-red-600"
            title="보관함 비우기 (배치는 유지)"
          >
            비우기
          </button>
        )}
      </div>
      <div
        ref={dropRef}
        className={
          "mt-1 min-h-9 rounded border-2 border-dashed p-1 flex flex-wrap gap-1 items-center " +
          (isOver ? "border-amber-500 bg-amber-100" : "border-amber-300")
        }
      >
        {staging.length === 0 ? (
          <span className="text-[10px] text-amber-500">
            빈 칸 — 품목을 여기에 놓거나, 칸 선택 후 "보관함에 넣기"
          </span>
        ) : (
          staging.map((pn) => <StagingChip key={pn} pnum={pn} name={masterMap[pn]?.name} onRemove={onRemove} disabled={!editMode} />)
        )}
      </div>
      {staging.length > 0 && (
        <div className="mt-2 overflow-auto max-h-[640px] space-y-1 pr-1">
          {keys.map((lg) => (
            <div key={lg} className="border rounded-md overflow-hidden bg-white">
              <button
                type="button"
                onClick={() => onToggle(lg)}
                className="w-full bg-amber-100 px-2 py-1 text-[11px] font-bold flex justify-between items-center hover:bg-amber-200/70 cursor-pointer"
              >
                <span>{lg}</span>
                <span className="text-amber-800">
                  {groups[lg].length}품목 {openLg === lg ? "▾" : "▸"}
                </span>
              </button>
              {openLg === lg && (
                <div className="max-h-72 overflow-auto">
                  {groups[lg].map((g) => (
                    <div
                      key={g.pnum}
                      className="w-full text-left px-2 py-1 text-[11px] border-t first:border-t-0 flex items-center gap-2"
                    >
                      <DragChip
                        zoneId="STAGING"
                        itemIdx={0}
                        pnum={g.pnum}
                        text={`${g.pnum}번`}
                        kind="staging"
                        disabled={!editMode}
                      />
                      <span className="truncate text-muted-foreground flex-1" title={g.name || undefined}>{g.name || "-"}</span>
                      <span className="shrink-0 text-[10px] font-medium tabular-nums text-slate-500">
                        현재고 {g.stock ?? "-"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemove(g.pnum)}
                        className="shrink-0 text-[10px] text-amber-700 hover:text-red-600"
                        title="보관함에서 제거"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StagingChip({ pnum, name, onRemove, disabled = false }: { pnum: string; name?: string; onRemove: (pn: string) => void; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `stg-${pnum}`,
    disabled,
    data: { kind: "staging", zoneId: "STAGING", itemIdx: 0, pnum } as DragSource,
  });
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={
        "inline-flex items-center gap-1 rounded bg-amber-200 text-amber-900 text-[11px] px-1.5 py-0.5 cursor-grab active:cursor-grabbing select-none max-w-full " +
        (isDragging ? "opacity-40" : "")
      }
      title={"드래그하여 칸에 배치 (점유 칸이면 교환)" + (name ? `\n${name}` : "")}
    >
      <span className="font-bold tabular-nums">{pnum}번</span>
      {name && <span className="truncate max-w-[130px] text-amber-800">{name}</span>}
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

function TrashDropzone() {
  const { setNodeRef, isOver } = useDroppable({
    id: "drop-trash",
    data: { kind: "trash" },
  });
  return (
    <div
      ref={setNodeRef}
      className={
        "rounded-md border-2 border-dashed p-3 flex items-center justify-center gap-2 transition-colors " +
        (isOver
          ? "border-red-600 bg-red-100"
          : "border-red-300 bg-red-50/60")
      }
      title="칸을 여기에 드롭하면 삭제됩니다 (제품은 임시보관함으로 이동)"
    >
      <span className="text-xl">🗑️</span>
      <span className="text-[11px] font-bold text-red-800">휴지통</span>
    </div>
  );
}

function DragChip({
  zoneId,
  itemIdx,
  pnum,
  text,
  kind = "zone",
  disabled = false,
}: {
  zoneId: string;
  itemIdx: number;
  pnum: string;
  text: string;
  kind?: "zone" | "overflow" | "staging";
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag-${kind === "overflow" ? "ov" : zoneId}-${itemIdx}-${pnum}`,
    disabled,
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
  matched,
  flash,
  sel,
  editMode,
  selected,
  moveTarget,
  onToggleSelect,
  tip,
  editing,
  editValue,
  editLocValue,
  onEditChange,
  onEditLocChange,
  onEditCommit,
  onEditCancel,
  locNos,
}: {
  z: ZoneDef;
  value: string;
  matched: boolean;
  flash: boolean;
  sel: boolean;
  editMode: boolean;
  selected: boolean;
  moveTarget: boolean;
  onToggleSelect: () => void;
  tip: string;
  editing: boolean;
  editValue: string;
  editLocValue: string;
  onEditChange: (v: string) => void;
  onEditLocChange: (v: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  locNos?: number[];
}) {
  const assigned = Boolean(value);
  const items = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const isA = z.id.startsWith("A-");
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `drop-${z.id}`,
    data: { zoneId: z.id } as { zoneId: string; itemIdx?: number },
  });
  // 셀 드래그: 수정 모드에서만 활성 (비수정=변경 불가) — 수정=칸(cell), data 동적
  // 고정 칸은 드래그 자체 비활성 (2026-08-28)
  const cellDrag = useDraggable({
    id: `cell-${z.id}`,
    disabled: !editMode || Boolean(z.fixed),
    data: (editMode
      ? { kind: "cell", zoneId: z.id }
      : { kind: "zone", zoneId: z.id, itemIdx: 0, pnum: items[0] || "" }) as DragSource,
  });
  const nodeRef = (node: HTMLButtonElement | null) => {
    dropRef(node);
    cellDrag.setNodeRef(node);
  };
  // 수기 편집 중: 인라인 input (콤마 구분 다품목) — 클릭 시 바로 입력 (수정 모드에서만)
  // A동은 로케이션 번호 수동 입력 필드도 함께 표시 (2026-09-05)
  const editBoxRef = useRef<HTMLDivElement | null>(null);
  // 수기 편집 중: 인라인 input (콤마 구분 다품목) — 클릭 시 바로 입력 (수정 모드에서만)
  // A동은 로케이션 번호 수동 입력 필드도 함께 표시 (2026-09-05)
  if (editing && editMode) {
    return (
      <div
        ref={(el) => {
          dropRef(el);
          editBoxRef.current = el;
        }}
        data-zone-id={z.id}
        className={
          "absolute flex flex-col items-center justify-center rounded border text-center overflow-hidden " +
          (assigned
            ? "border-blue-700 bg-blue-50 ring-2 ring-amber-400 ring-offset-1"
            : "border-slate-500 bg-white ring-2 ring-amber-400 ring-offset-1")
        }
        style={z.style}
        onBlur={(e) => {
          // 포커스가 편집 박스 밖으로 나갈 때만 저장 (두 input 간 이동은 무시)
          const next = e.relatedTarget as Node | null;
          if (next && editBoxRef.current && editBoxRef.current.contains(next)) return;
          onEditCommit();
        }}
      >
        <input
          autoFocus
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              onEditCommit();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              onEditCancel();
            }
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-[94%] h-[44%] min-w-0 text-[9px] text-center border rounded border-blue-400 outline-none focus:ring-2 focus:ring-blue-500 tabular-nums"
          placeholder="19,28"
          title="제품번호 콤마 구분 입력 (예: 19,28) — Enter 저장 / Esc 취소"
        />
        {isA ? (
          <input
            value={editLocValue}
            onChange={(e) => onEditLocChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                onEditCommit();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                onEditCancel();
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-[94%] h-[38%] min-w-0 text-[8px] text-center border rounded border-amber-300 outline-none focus:ring-2 focus:ring-amber-500 tabular-nums mt-0.5"
            placeholder={
              // 기본 배정 번호 표시 (2026-09-05) — 편집 시 그 칸의 자동 기본 번호를 알려줌
              // manual 값이 채워진 칸은 value가 우선 표시되고, 비면(자동 모드) 기본 번호를 placeholder로 보여줌
              !editLocValue && locNos && locNos.length > 0
                ? locNos.length === 1
                  ? `기본 ${locNos[0]}`
                  : `기본 ${locNos[0]}~${locNos[locNos.length - 1]}`
                : "로케이션 첫 번호"
            }
            title={
              locNos && locNos.length > 0
                ? `기본 배정 ${fmtLocNos(locNos)} — 그대로 쓰려면 비우고 저장, 바꾸려면 첫 번호 입력(품목 수만큼 자동 연속)`
                : "로케이션 번호: 첫 번호만 입력, 품목 수만큼 자동 연속 (예: 70). 비우면 자동 모드"
            }
          />
        ) : null}
      </div>
    );
  }
  return (
    <button
      ref={nodeRef}
      type="button"
      data-zone-id={z.id}
      onClick={editMode ? onToggleSelect : undefined}
      title={tip}
      {...cellDrag.listeners}
      {...cellDrag.attributes}
      className={
        "absolute flex items-center justify-center rounded border text-center px-0.5 transition-colors " +
        (assigned
          ? "border-blue-700 bg-blue-50"
          : "border-slate-500 bg-white hover:bg-sky-50 hover:border-blue-500") +
        (z.fixed ? " !border-rose-600 !bg-rose-50" : "") +
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
      {z.fixed ? (
        <span className="absolute -top-1.5 -left-1.5 text-[9px] leading-none pointer-events-none" title="고정 칸 — 이동 불가">🔒</span>
      ) : null}
      {assigned ? (
        items.length > 1 ? (
          z.productNamesVertical ? (
            /* 가로 배치 칸: 제품명 세로 나열 (구획 사이 가로 구분선, 2026-08-29) */
            <span className="flex flex-col w-full h-full items-stretch justify-center overflow-hidden">
              {items.map((it, i) => (
                <span
                  key={`${z.id}-seg-${i}`}
                  className={
                    "flex flex-col items-center justify-center min-h-0 py-0.5 " +
                    (i < items.length - 1 ? " border-b border-slate-300" : "")
                  }
                >
                  <span className="font-semibold text-[9px] leading-none tabular-nums text-blue-900">
                    <DragChip zoneId={z.id} itemIdx={i} pnum={it} text={it} disabled={!editMode} />
                  </span>
                </span>
              ))}
            </span>
          ) : (
            /* 세로 배치 칸(기본): 상→하 분할, 구획 사이 가로 구분선 (2026-08-29) */
            <span className="flex flex-col w-full h-full items-stretch justify-center overflow-hidden">
              {items.map((it, i) => (
                <span
                  key={`${z.id}-seg-${i}`}
                  className={
                    "flex flex-col items-center justify-center min-h-0 py-0.5 " +
                    (i < items.length - 1 ? " border-b border-slate-300" : "")
                  }
                >
                  <span className="font-semibold text-[9px] leading-none tabular-nums text-blue-900">
                    <DragChip zoneId={z.id} itemIdx={i} pnum={it} text={it} disabled={!editMode} />
                  </span>
                </span>
              ))}
            </span>
          )
        ) : (
        <span
          className={
            "font-semibold text-[10px] leading-tight tabular-nums text-blue-900"
          }
        >
          {isA && items[0]
            ? (
              <DragChip zoneId={z.id} itemIdx={0} pnum={items[0]} text={items[0]} disabled={!editMode} />
            )
            : displayOnly(items[0])}
        </span>
        )
      ) : (
        <span className="text-[9px] text-slate-300 leading-none">·</span>
      )}
      {!isA && locNos && locNos.length > 0 && (
        <span className="absolute top-0.5 right-0.5 text-[7px] leading-none font-mono font-bold text-amber-600 pointer-events-none">
          {fmtLocNos(locNos)}
        </span>
      )}
    </button>
  );
}

function displayOnly(t: string | undefined): string {
  return t ?? "";
}
