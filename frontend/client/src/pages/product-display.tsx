/**
 * 제품 배치도 (A~E동)
 * - 기본 양식: 초기 렉 칸(세로 긴 슬롯) 스타일
 * - A동: 라인 단위 배치 (1번 라인 로케이션 1~19, 아래=1 · 위=19)
 * - 2~4번 라인은 동일 양식으로 확장 가능
 * - localStorage 저장 + JSON 내보내기
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

const STORAGE_KEY = "vf_product_display_v1";

type DongKey = "A" | "B" | "C" | "D" | "E";

type ZoneDef = {
  id: string;
  num: string;
  line?: number;
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

/** 초기 렉 칸 양식(세로 긴 슬롯) 치수 — 원본 A형 슬롯 비율 유지·확대 */
const SLOT = {
  w: 88,
  h: 168,
  gapX: 14,
  gapY: 12,
  padL: 28,
  padT: 52,
  padR: 28,
  padB: 28,
  lineGap: 48, // 라인 사이 가로 간격
  lineTitleH: 28,
};

type LineSpec = {
  line: number;
  /** 로케이션 개수 */
  count: number;
  /** 시작 번호 (기본 1) */
  startNum?: number;
  /**
   * true: 맨 아래=startNum, 맨 위=startNum+count-1
   * (1번 라인: 아래 1 → 위 19)
   */
  bottomIsStart?: boolean;
};

/**
 * 한 라인을 세로 슬롯 열로 생성 (초기 양식).
 * 여러 라인을 가로로 나란히 배치해 2·3·4번 라인 확장.
 */
function buildVerticalLineZones(
  dong: DongKey,
  lines: LineSpec[],
  slot = SLOT
): { zones: ZoneDef[]; lineLabels: LineLabel[]; width: number; height: number } {
  const zones: ZoneDef[] = [];
  const lineLabels: LineLabel[] = [];
  const maxCount = Math.max(1, ...lines.map((l) => l.count));

  lines.forEach((lineSpec, lineIdx) => {
    const startNum = lineSpec.startNum ?? 1;
    const bottomIsStart = lineSpec.bottomIsStart !== false;
    const colLeft = slot.padL + lineIdx * (slot.w + slot.lineGap);

    lineLabels.push({
      text: `${lineSpec.line}번 라인`,
      style: {
        left: colLeft,
        top: 14,
        width: slot.w,
        textAlign: "center",
      },
    });

    for (let i = 0; i < lineSpec.count; i++) {
      // visualIdx 0 = 맨 위
      const visualIdx = bottomIsStart ? lineSpec.count - 1 - i : i;
      // i=0 → startNum (아래), i=count-1 → startNum+count-1 (위) when bottomIsStart
      const num = bottomIsStart
        ? startNum + i
        : startNum + (lineSpec.count - 1 - i);
      // place by visual: bottom row gets startNum
      const placeFromTop = bottomIsStart
        ? lineSpec.count - 1 - i
        : i;

      zones.push({
        id: `${dong}-L${lineSpec.line}-${num}`,
        num: String(num),
        line: lineSpec.line,
        style: {
          left: colLeft,
          top: slot.padT + placeFromTop * (slot.h + slot.gapY),
          width: slot.w,
          height: slot.h,
        },
      });
    }
  });

  const width =
    slot.padL +
    lines.length * slot.w +
    Math.max(0, lines.length - 1) * slot.lineGap +
    slot.padR;
  const height =
    slot.padT + maxCount * slot.h + Math.max(0, maxCount - 1) * slot.gapY + slot.padB;

  return { zones, lineLabels, width, height };
}

// A동: 우선 1번 라인만 (1~19, 아래=1 · 위=19). 2~4번은 같은 빌더로 추가.
const A_LINES: LineSpec[] = [
  { line: 1, count: 19, startNum: 1, bottomIsStart: true },
  // 이후 예:
  // { line: 2, count: N, startNum: 1, bottomIsStart: true },
  // { line: 3, count: N, startNum: 1, bottomIsStart: true },
  // { line: 4, count: N, startNum: 1, bottomIsStart: true },
];

const A_BUILT = buildVerticalLineZones("A", A_LINES);

const DONG_LAYOUTS: DongLayout[] = [
  {
    key: "A",
    label: "A동",
    width: Math.max(A_BUILT.width, 420),
    height: A_BUILT.height,
    zones: A_BUILT.zones,
    lineLabels: A_BUILT.lineLabels,
  },
  // B~E: 자리만 유지 (아직 라인 미배치) — A동 확정 후 동일 양식 적용
  {
    key: "B",
    label: "B동",
    width: 480,
    height: 360,
    zones: [],
    lineLabels: [{ text: "라인 배치 대기", style: { left: 24, top: 16, width: 200 } }],
  },
  {
    key: "C",
    label: "C동",
    width: 480,
    height: 360,
    zones: [],
    lineLabels: [{ text: "라인 배치 대기", style: { left: 24, top: 16, width: 200 } }],
  },
  {
    key: "D",
    label: "D동",
    width: 480,
    height: 360,
    zones: [],
    lineLabels: [{ text: "라인 배치 대기", style: { left: 24, top: 16, width: 200 } }],
  },
  {
    key: "E",
    label: "E동",
    width: 480,
    height: 360,
    zones: [],
    lineLabels: [{ text: "라인 배치 대기", style: { left: 24, top: 16, width: 200 } }],
  },
];

function loadPlacement(): PlacementMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSaveMsg("저장되었습니다.");
    window.setTimeout(() => setSaveMsg(""), 2000);
  };

  const resetData = () => {
    if (!window.confirm("모든 배정 내용을 초기화할까요?")) return;
    setData({});
    localStorage.removeItem(STORAGE_KEY);
    setSaveMsg("초기화되었습니다.");
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
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground mb-4">
          A~E동 배치도 · 초기 렉 칸(세로 슬롯) 양식. A동 1번 라인: 로케이션 1~19 (맨 아래 1 · 맨 위
          19). 2~4번 라인은 같은 양식으로 추가합니다.
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {DONG_LAYOUTS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setDong(r.key)}
              className={
                "px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors " +
                (dong === r.key
                  ? "bg-[#721FE5] text-white"
                  : "bg-muted text-foreground hover:bg-muted/80")
              }
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="w-full overflow-auto pb-2" style={{ maxHeight: "calc(100vh - 260px)" }}>
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
                className="absolute text-xs font-semibold text-slate-700 pointer-events-none"
                style={lb.style}
              >
                {lb.text}
              </div>
            ))}

            {current.zones.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                {current.label} 라인 배치 대기 — A동 확정 후 동일 양식 적용
              </div>
            ) : null}

            {current.zones.map((z) => {
              const assigned = Boolean(data[z.id]);
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => openAssign(z.id)}
                  title={`${z.id} 클릭하여 제품 배정`}
                  className={
                    "absolute flex flex-col items-center justify-center rounded-md border-2 text-center px-1 transition-colors shadow-sm " +
                    (assigned
                      ? "border-blue-700 bg-blue-100"
                      : "border-slate-700 bg-white hover:bg-sky-50 hover:border-blue-600")
                  }
                  style={z.style}
                >
                  <span className="font-bold text-lg leading-none">{z.num}</span>
                  {assigned ? (
                    <span className="mt-1 text-[11px] font-medium text-blue-800 break-all leading-tight px-0.5">
                      {data[z.id]}
                    </span>
                  ) : (
                    <span className="mt-1 text-[10px] text-muted-foreground">배정</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
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
              A동 1번 라인 {A_LINES[0]?.count ?? 0}칸 · 슬롯 {SLOT.w}×{SLOT.h}
            </span>
          ) : null}
        </div>
      </div>

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
