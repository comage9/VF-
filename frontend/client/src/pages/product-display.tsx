/**
 * 제품 배치도 (A~E동)
 * - 기본 양식: 세로 슬롯 콤팩트
 * - A동 가로(좌→우): 6 · 5 · 4 · 3 · 2 · 1 (우측=1번)
 * - 통로: 1|2, 3|4, 4|5 — **2와 3은 붙음(통로 없음)**, 5·6은 신규 예정
 * - 배치: 통로 지그재그 1↔2, 3↔4 (data). 5·6 = 신규 예정
 * - localStorage + JSON 내보내기
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
  A_RANK_PLACEMENT,
  A_SLOT_CONFLICTS,
  A_UNPLACED,
} from "@/pages/product-display-a-data";

const STORAGE_KEY = "vf_product_display_v1";

type DongKey = "A" | "B" | "C" | "D" | "E";

type ZoneDef = {
  id: string;
  /** 칸에 기본으로 찍는 라벨 (빈 칸이면 "") */
  num: string;
  line: number;
  /** true면 번호 라벨을 제품번호처럼 표시(1번 라인) */
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

/** 폰트(번호 2자리)에 맞춘 콤팩트 슬롯 */
const SLOT = {
  w: 48,
  h: 34,
  gapY: 4,
  padL: 20,
  padT: 44,
  padR: 20,
  padB: 20,
  /** 통로(일반) 간격 */
  lineGap: 28,
  /** 2-3 / 5-6 밀착(통로 없음) */
  tightGap: 6,
  rowIdxW: 22,
  rowIdxGap: 6,
};

const A_SLOTS_PER_LINE = 19;
/** 붙어 있는 라인 쌍 (통로 없음) */
const TIGHT_PAIRS: [number, number][] = [
  [2, 3],
  [5, 6],
];

type LineSpec = {
  line: number;
  count: number;
  /** 라인 헤더 부가 표시 */
  badge?: string;
  fillNumbers?: boolean;
  startNum?: number;
  bottomIsStart?: boolean;
};

function isTightPair(a: number, b: number): boolean {
  return TIGHT_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a)
  );
}

/**
 * A동 레이아웃
 * - 시각 좌→우: 6 · 5 · 4 · 3 · 2 · 1
 * - gap: 2-3·5-6 밀착, 나머지 통로
 */
function buildADongLayout(
  dong: DongKey = "A",
  vertLines: LineSpec[] = A_LINES,
  slot = SLOT
): { zones: ZoneDef[]; lineLabels: LineLabel[]; width: number; height: number } {
  const zones: ZoneDef[] = [];
  const lineLabels: LineLabel[] = [];
  const maxCount = Math.max(1, ...vertLines.map((l) => l.count));
  // 좌→우: 큰 라인 번호 먼저 (6…1)
  const ordered = [...vertLines].sort((a, b) => b.line - a.line);

  const colLefts: number[] = [];
  let x = slot.padL;
  ordered.forEach((lineSpec, i) => {
    colLefts.push(x);
    if (i < ordered.length - 1) {
      const next = ordered[i + 1];
      const gap = isTightPair(lineSpec.line, next.line) ? slot.tightGap : slot.lineGap;
      x += slot.w + gap;
    }
  });

  ordered.forEach((lineSpec, visualCol) => {
    const colLeft = colLefts[visualCol];
    const bottomIsStart = lineSpec.bottomIsStart !== false;
    const startNum = lineSpec.startNum ?? 1;
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
      const numVal = lineSpec.fillNumbers
        ? bottomIsStart
          ? startNum + i
          : startNum + (lineSpec.count - 1 - i)
        : i + 1;
      const placeFromTop = bottomIsStart ? lineSpec.count - 1 - i : i;
      const isPlanned = Boolean(lineSpec.badge);

      zones.push({
        id: `${dong}-L${lineSpec.line}-${numVal}`,
        num: isPlanned ? "예정" : lineSpec.fillNumbers ? String(numVal) : "",
        line: lineSpec.line,
        showNumAsProduct: Boolean(lineSpec.fillNumbers),
        style: {
          left: colLeft,
          top: slot.padT + placeFromTop * (slot.h + slot.gapY),
          width: slot.w,
          height: slot.h,
        },
      });
    }
  });

  // 1번 라인 우측 칸 순번 1~19
  const line1Idx = ordered.findIndex((l) => l.line === 1);
  const line1Left = colLefts[line1Idx] ?? slot.padL;
  const rowIdxLeft = line1Left + slot.w + slot.rowIdxGap;
  const line1Count = ordered.find((l) => l.line === 1)?.count ?? A_SLOTS_PER_LINE;
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

  const lastLeft = colLefts[colLefts.length - 1] ?? slot.padL;
  const width = lastLeft + slot.w + slot.rowIdxGap + slot.rowIdxW + slot.padR;
  const height =
    slot.padT + maxCount * slot.h + Math.max(0, maxCount - 1) * slot.gapY + slot.padB;

  return { zones, lineLabels, width, height };
}

/** 우측=1 … 좌측=6. 5·6=신규 예정. 2-3·5-6 밀착 */
const A_LINES: LineSpec[] = [
  { line: 1, count: A_SLOTS_PER_LINE },
  { line: 2, count: A_SLOTS_PER_LINE },
  { line: 3, count: A_SLOTS_PER_LINE },
  { line: 4, count: A_SLOTS_PER_LINE },
  { line: 5, count: A_SLOTS_PER_LINE, badge: "신규 예정" },
  { line: 6, count: A_SLOTS_PER_LINE, badge: "신규 예정" },
];

const A_BUILT = buildADongLayout("A", A_LINES);

/** 1개월 출고순위 표(slot 1~80) → A동 기본 배정. 비면 빈 칸. */
function defaultAPlacement(): PlacementMap {
  return { ...A_RANK_PLACEMENT };
}

const DONG_LAYOUTS: DongLayout[] = [
  {
    key: "A",
    label: "A동",
    width: Math.max(A_BUILT.width, 320),
    height: A_BUILT.height,
    zones: A_BUILT.zones,
    lineLabels: A_BUILT.lineLabels,
  },
  {
    key: "B",
    label: "B동",
    width: 360,
    height: 280,
    zones: [],
    lineLabels: [{ text: "라인 배치 대기", style: { left: 16, top: 12, width: 160 } }],
  },
  {
    key: "C",
    label: "C동",
    width: 360,
    height: 280,
    zones: [],
    lineLabels: [{ text: "라인 배치 대기", style: { left: 16, top: 12, width: 160 } }],
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
  const defaults = defaultAPlacement();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;
    // 버전 키: 순위표 배정 적용 시 강제 덮어쓰기 플래그
    // rank-a-v7 = 통로 페어 지그재그: cell n에 L1-n→L2-n, 이어서 L3-n→L4-n
    if (parsed.__v === "rank-a-v7" && parsed.data && typeof parsed.data === "object") {
      return { ...defaults, ...parsed.data };
    }
    return defaults;
  } catch {
    return defaults;
  }
}

export default function ProductDisplayPage() {
  const [dong, setDong] = useState<DongKey>("A");
  const [data, setData] = useState<PlacementMap>(() => loadPlacement());
  const [modalOpen, setModalOpen] = useState(false);
  const [currentZone, setCurrentZone] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [saveMsg, setSaveMsg] = useState("");

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
      JSON.stringify({ __v: "rank-a-v7", data })
    );
    setSaveMsg("저장되었습니다.");
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  const resetData = () => {
    if (!window.confirm("A동을 통로 지그재그(1|2, 2·3붙음, 3|4) + 5·6 신규예정 기본으로 되돌릴까요?")) return;
    const defaults = defaultAPlacement();
    setData(defaults);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ __v: "rank-a-v7", data: defaults })
    );
    setSaveMsg("순위표 기본 배정으로 초기화했습니다.");
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

  return (
    <div className="space-y-4 w-full max-w-none">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground mb-3">
          A동 · 통로: 1|2, 3|4 (2·3 붙음). 지그재그 1↔2·3↔4. 5·6번=신규 예정.
          예: 1-1=1, 2-1=2, 1-2=3, 2-2=601.
        </p>

        <div className="flex flex-wrap gap-2 mb-4">
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
              const planned = z.line >= 5 && !assigned;
              const display = assigned ? data[z.id] : planned ? "예정" : "";
              const filled = Boolean(display);
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => openAssign(z.id)}
                  title={`${z.id} 클릭하여 제품 배정`}
                  className={
                    "absolute flex items-center justify-center rounded border text-center px-0.5 transition-colors " +
                    (assigned
                      ? "border-blue-700 bg-blue-50"
                      : planned
                        ? "border-dashed border-amber-400 bg-amber-50/40 text-amber-700"
                        : "border-slate-500 bg-white hover:bg-sky-50 hover:border-blue-500")
                  }
                  style={z.style}
                >
                  {filled ? (
                    <span className="font-semibold text-[11px] leading-none text-blue-900 tabular-nums">
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
          {dong === "A" ? (
            <span className="text-xs text-muted-foreground ml-2">
              배치 {Object.keys(data).filter((k) => k.startsWith("A-") && data[k]).length}칸 · 미배치{" "}
              {A_UNPLACED.length} · 슬롯충돌 {A_SLOT_CONFLICTS.length}
            </span>
          ) : null}
        </div>
      </div>

      {dong === "A" ? (
        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold">
            A동 미배치 ({A_UNPLACED.length}건) — 80칸 초과분만 (현재 순차 채움이면 0)
          </h3>
          <div className="overflow-auto max-h-64 border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr className="text-left">
                  <th className="p-2">slot</th>
                  <th className="p-2">제품번호</th>
                  <th className="p-2">1개월박스</th>
                  <th className="p-2">분류</th>
                  <th className="p-2">로케이션</th>
                  <th className="p-2">제품명</th>
                </tr>
              </thead>
              <tbody>
                {A_UNPLACED.map((u) => (
                  <tr key={`${u.slot}-${u.barcode}`} className="border-t">
                    <td className="p-2 tabular-nums">{u.slot}</td>
                    <td className="p-2 font-semibold tabular-nums">{u.pnum}</td>
                    <td className="p-2 tabular-nums">{u.boxes}</td>
                    <td className="p-2">{u.cat}</td>
                    <td className="p-2 font-mono text-[10px]">{u.loc}</td>
                    <td className="p-2 max-w-[280px] truncate" title={u.name}>
                      {u.name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {A_SLOT_CONFLICTS.length > 0 ? (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 space-y-1">
              <div className="font-semibold">동일 slot 복수 SKU (출고 많은 쪽만 칸 표시)</div>
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
