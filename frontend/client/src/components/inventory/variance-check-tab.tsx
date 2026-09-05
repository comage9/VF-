import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  MapPin,
  Package,
  Search,
  X,
} from "lucide-react";
import JsBarcode from "jsbarcode";

export type VarianceCauseCode =
  | "NO_MOVEMENT_WMS_LOWER"
  | "NO_MOVEMENT_WMS_HIGHER"
  | "AFTER_RECEIPT_GAP"
  | "AFTER_OUTBOUND_GAP"
  | "LEDGER_ONLY"
  | "WMS_ONLY"
  | "MATCH"
  | "OTHER";

export interface VarianceItem {
  barcode: string;
  productName: string;
  baseQty: number;
  receiptQty: number;
  outboundQty: number;
  ledgerQty: number;
  wmsQty: number;
  delta: number;
  causeCode: VarianceCauseCode;
  causeLabel: string;
  causeHint: string;
  /** 마스터(BarcodeMaster) 로케이션 SoT */
  masterLocation?: string;
  /** WMS 엑셀 로케이션 전부 (복수면 배열) */
  wmsLocations?: string[];
  locationConflict?: boolean;
}

interface VarianceSummary {
  compared: number;
  matchCount: number;
  mismatchCount: number;
  absDeltaSum: number;
  netDeltaSum: number;
  locationConflictCount?: number;
}

type BarcodeTone = "default" | "ok" | "bad";

/** 테이블 셀용 CODE128 — 가로 확대 + 가운데 정렬 */
function BarcodeCell({
  value,
  tone = "default",
  compact = true,
}: {
  value: string;
  tone?: BarcodeTone;
  compact?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const text = (value || "").trim();
  useEffect(() => {
    if (!svgRef.current || !text) return;
    try {
      svgRef.current.innerHTML = "";
      JsBarcode(svgRef.current, text, {
        format: "CODE128",
        displayValue: true,
        fontSize: compact ? 12 : 14,
        height: compact ? 48 : 60,
        margin: 6,
        // 막대 가로 폭 확대
        width: compact ? 2.2 : 2.6,
        background: "#ffffff",
        lineColor: "#111111",
        textAlign: "center",
        textPosition: "bottom",
        textMargin: 4,
      });
      // SVG 자체 가운데 정렬
      svgRef.current.style.display = "block";
      svgRef.current.style.margin = "0 auto";
    } catch {
      /* invalid */
    }
  }, [text, compact]);

  const wrap =
    tone === "ok"
      ? "rounded border border-emerald-200 bg-emerald-50/50 p-2 text-center"
      : tone === "bad"
        ? "rounded border border-red-200 bg-red-50/50 p-2 text-center"
        : "rounded border border-gray-200 bg-white p-2 text-center";

  if (!text) {
    return (
      <span className="block text-center text-xs text-gray-400">(없음)</span>
    );
  }
  return (
    <div className={wrap}>
      <p className="mb-1 text-center font-mono text-xs font-medium text-gray-800 break-all">
        {text}
      </p>
      <div className="flex justify-center overflow-x-auto bg-white py-1">
        <svg ref={svgRef} className="mx-auto" />
      </div>
    </div>
  );
}

/** 사이드 패널 등 라벨 있는 블록 */
function BarcodeBlock({
  value,
  label,
  tone = "default",
}: {
  value: string;
  label: string;
  tone?: BarcodeTone;
}) {
  return (
    <div
      className={
        tone === "ok"
          ? "rounded-md border border-emerald-300 bg-emerald-50/90 px-3 py-2"
          : tone === "bad"
            ? "rounded-md border border-red-300 bg-red-50/90 px-3 py-2"
            : "rounded-md border border-gray-200 bg-white px-3 py-2"
      }
    >
      <p
        className={`mb-1 text-xs font-semibold ${
          tone === "ok"
            ? "text-emerald-800"
            : tone === "bad"
              ? "text-red-800"
              : "text-gray-600"
        }`}
      >
        {label}
      </p>
      <BarcodeCell value={value} tone={tone} compact={false} />
    </div>
  );
}

function wrongLocationsOf(item: VarianceItem): string[] {
  const master = (item.masterLocation || "").trim();
  const wmsAll = (item.wmsLocations || [])
    .map((x) => String(x).trim())
    .filter(Boolean);
  return master ? wmsAll.filter((loc) => loc !== master) : wmsAll;
}

interface VarianceResponse {
  success: boolean;
  message?: string;
  errorId?: string;
  baselineAsOf?: string;
  wmsAsOf?: string;
  formula?: string;
  note?: string;
  parseStats?: {
    files?: number;
    rows?: number;
    rowsUsed?: number;
    rowsLpnSkipped?: number;
    barcodes?: number;
  };
  summary?: VarianceSummary;
  items?: VarianceItem[];
}

type FilterKey = "MISMATCH" | "LOC_CONFLICT" | "ALL_CAUSES" | VarianceCauseCode;

const CAUSE_FILTERS: { key: FilterKey; label: string }[] = [
  { key: "MISMATCH", label: "수량 불일치" },
  { key: "LOC_CONFLICT", label: "로케이션 불일치" },
  { key: "NO_MOVEMENT_WMS_LOWER", label: "입출고0 감소" },
  { key: "AFTER_RECEIPT_GAP", label: "입고 후 잔차" },
  { key: "AFTER_OUTBOUND_GAP", label: "출고 후 잔차" },
  { key: "LEDGER_ONLY", label: "전산만" },
  { key: "WMS_ONLY", label: "WMS만" },
  { key: "OTHER", label: "기타" },
];

function causeBadgeClass(code: string): string {
  switch (code) {
    case "NO_MOVEMENT_WMS_LOWER":
    case "NO_MOVEMENT_WMS_HIGHER":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "AFTER_RECEIPT_GAP":
      return "bg-blue-50 text-blue-800 border-blue-200";
    case "AFTER_OUTBOUND_GAP":
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    case "LEDGER_ONLY":
      return "bg-red-50 text-red-700 border-red-200";
    case "WMS_ONLY":
      return "bg-violet-50 text-violet-800 border-violet-200";
    case "MATCH":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    default:
      return "bg-gray-50 text-gray-700 border-gray-200";
  }
}

function deltaClass(delta: number): string {
  if (delta < 0) return "text-[#C85A54] font-semibold";
  if (delta > 0) return "text-[#6B9B7A] font-semibold";
  return "text-gray-500";
}

function downloadCsv(items: VarianceItem[], meta: { baselineAsOf?: string; wmsAsOf?: string }) {
  const header = [
    "barcode",
    "product_name",
    "base_qty",
    "receipt_qty",
    "outbound_qty",
    "ledger_qty",
    "wms_qty",
    "delta",
    "cause_code",
    "cause_label",
    "master_location",
    "wms_locations",
    "location_conflict",
    "baseline_as_of",
    "wms_as_of",
  ];
  const escape = (v: string | number | boolean) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [header.join(",")];
  for (const it of items) {
    lines.push(
      [
        it.barcode,
        it.productName,
        it.baseQty,
        it.receiptQty,
        it.outboundQty,
        it.ledgerQty,
        it.wmsQty,
        it.delta,
        it.causeCode,
        it.causeLabel,
        it.masterLocation || "",
        (it.wmsLocations || []).join("|"),
        it.locationConflict ? "1" : "0",
        meta.baselineAsOf || "",
        meta.wmsAsOf || "",
      ]
        .map(escape)
        .join(",")
    );
  }
  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = (meta.wmsAsOf || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  a.href = url;
  a.download = `inventory-variance_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VarianceCheckTab() {
  const [file, setFile] = useState<File | null>(null);
  const [wmsDate, setWmsDate] = useState(() => new Date().toISOString().slice(0, 10));
  // 기본 OFF: 페이지별 재고리스트는 같은 LPN이 여러 행으로 나오는 것이 정상이며 중복이 아님
  const [dedupeLpn, setDedupeLpn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VarianceResponse | null>(null);
  const [filter, setFilter] = useState<FilterKey>("MISMATCH");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<VarianceItem | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagDaily, setDiagDaily] = useState<{
    outbound?: { date: string; qty: number; rows: number }[];
    receipts?: { date: string; qty: number; rows: number }[];
  } | null>(null);

  // 로케이션 적용(마스터 수정) 상태 + 로케이션 공유 허용 목록
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [appliedBarcodes, setAppliedBarcodes] = useState<Set<string>>(new Set());
  const [locShareAllow, setLocShareAllow] = useState<string[]>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("varianceLocShareAllow") || "[]");
    } catch {
      return [];
    }
  });
  const persistLocShareAllow = (next: string[]) => {
    setLocShareAllow(next);
    try {
      window.localStorage.setItem("varianceLocShareAllow", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  // A동 배치도 위치번호 (2026-08-30): 배치도 칸의 저장 locNo = 칸 고정 번호.
  // WMS 업로드 여부와 무관하게 배치도 실시간 최신 배치를 번호순으로 보여주는 게 기준 화면.
  const [adongPnLoc, setAdongPnLoc] = useState<Map<string, number>>(new Map());
  const [pnRows, setPnRows] = useState<Map<string, { name: string; barcode: string }[]>>(new Map());
  const [adongLoading, setAdongLoading] = useState(false);
  const loadAdongBasis = useCallback(async () => {
    setAdongLoading(true);
    try {
      const pj = await (await fetch("/api/product-display/latest")).json();
      const p = JSON.parse(pj?.payload || "{}");
      const data: Record<string, string | string[]> = p?.data || {};
      const m = new Map<string, number>();
      for (const d of p?.layout || []) {
        for (const z of d?.zones || []) {
          const zid = String(z?.id || "");
          if (!zid.startsWith("A-") || zid === "A-X1" || zid === "A-X2") continue;
          const nos: number[] =
            Array.isArray(z.locNos) && z.locNos.length > 0
              ? z.locNos
              : z.locNo != null
                ? [z.locNo]
                : [];
          if (nos.length === 0 || nos[0] > 150) continue;
          const pns = String(data[zid] || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          pns.forEach((pn, i) => {
            m.set(pn, nos.length === 1 ? nos[0] : nos[i] ?? nos[nos.length - 1]); // 다품목 칸 제품별 번호
          });
        }
      }
      setAdongPnLoc(m);
      const mj = await (await fetch("/api/master/specs")).json();
      const arr = Array.isArray(mj) ? mj : mj?.data ?? mj?.results ?? [];
      const pm = new Map<string, { name: string; barcode: string }[]>();
      const bm = new Map<string, string>();
      for (const it of arr) {
        const bc = String(it.barcode || "").trim();
        const pn = it.product_number != null ? String(it.product_number) : "";
        if (bc && pn) bm.set(bc, pn);
        if (!pn) continue;
        const list = pm.get(pn) || [];
        list.push({ name: it.product_name || "", barcode: bc });
        pm.set(pn, list);
      }
      setPnRows(pm);
    } catch {
      /* 조회 실패 시 기존 값 유지 */
    } finally {
      setAdongLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadAdongBasis();
  }, [loadAdongBasis]);

  const applyLocation = async (barcode: string, location: string) => {
    setApplying((s) => new Set(s).add(barcode));
    try {
      const res = await fetch("/api/inventory/variance-check/apply-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ barcode, location }] }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };
      if (!res.ok || !data.success) throw new Error(data.message || `저장 실패 (${res.status})`);
      setAppliedBarcodes((s) => new Set(s).add(barcode));
      setResult((prev) =>
        prev
          ? {
              ...prev,
              items: (prev.items ?? []).map((it) =>
                it.barcode === barcode
                  ? { ...it, masterLocation: location, locationConflict: false }
                  : it
              ),
            }
          : prev
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying((s) => {
        const n = new Set(s);
        n.delete(barcode);
        return n;
      });
    }
  };

  /** WMS 로케이션 기준: 한 로케이션에 2개+ 품목 (허용 목록 제외) */
  const locShareGroups = useMemo(() => {
    const items = result?.items || [];
    const map = new Map<string, VarianceItem[]>();
    for (const it of items) {
      for (const loc of it.wmsLocations || []) {
        const arr = map.get(loc) || [];
        arr.push(it);
        map.set(loc, arr);
      }
    }
    const groups: { location: string; items: VarianceItem[] }[] = [];
    for (const [loc, arr] of map.entries()) {
      if (arr.length >= 2 && !locShareAllow.includes(loc)) {
        groups.push({ location: loc, items: arr });
      }
    }
    groups.sort((a, b) => b.items.length - a.items.length || a.location.localeCompare(b.location));
    return groups;
  }, [result, locShareAllow]);

  /** A동 배치도 실시간 목록 (1~150): 번호 → 현재 배치된 품목(바코드별 행) + WMS 대조 상태 */
  const wmsByBarcode = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const it of result?.items || []) {
      m.set(it.barcode, it.wmsLocations || []);
    }
    return m;
  }, [result]);

  const adongRows = useMemo(() => {
    const byNo = new Map<number, { pn: string; name: string; barcode: string; loc: string }[]>();
    for (const [pn, no] of adongPnLoc) {
      if (no == null || no > 150) continue;
      const loc = `320-A1-1-${no}`;
      for (const r of pnRows.get(pn) || []) {
        const list = byNo.get(no) || [];
        list.push({ pn, name: r.name, barcode: r.barcode, loc });
        byNo.set(no, list);
      }
    }
    return Array.from(byNo.entries())
      .sort((a, b) => a[0] - b[0])
      .flatMap(([no, rows]) =>
        rows.map((r) => ({
          no,
          ...r,
          wms: wmsByBarcode.get(r.barcode) || null,
          checked: wmsByBarcode.has(r.barcode),
        }))
      );
  }, [adongPnLoc, pnRows, wmsByBarcode]);

  const adongMismatchCount = useMemo(
    () => adongRows.filter((r) => (r.wms || []).some((loc) => loc !== r.loc)).length,
    [adongRows]
  );

  const runCheck = async () => {
    if (!file) {
      setError("WMS 파일(xlsx 또는 zip)을 선택하세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setSelected(null);
    setDiagDaily(null);
    try {
      const fd = new FormData();
      fd.append("files", file);
      fd.append("asOfDate", wmsDate);
      fd.append("dedupeLpn", dedupeLpn ? "1" : "0");
      fd.append("includeMatches", "0");

      const res = await fetch("/api/inventory/variance-check", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as VarianceResponse;
      if (!res.ok || !data.success) {
        throw new Error(data.message || `대조 실패 (${res.status})`);
      }
      setResult(data);
      try {
        window.localStorage.setItem(
          "inventoryVarianceLastSummary",
          JSON.stringify({
            mismatchCount: data.summary?.mismatchCount ?? 0,
            at: new Date().toISOString(),
          })
        );
      } catch {
        /* ignore */
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (item: VarianceItem) => {
    setSelected(item);
    setDiagDaily(null);
    setDiagLoading(true);
    try {
      const res = await fetch(
        `/api/inventory/stock-diagnostics?barcode=${encodeURIComponent(item.barcode)}`
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setDiagDaily({
          outbound: (data.outboundAfterReal?.daily || []).map(
            (r: { date: string; qty: number; rows: number }) => r
          ),
          receipts: (data.receiptsAfter?.daily || []).map(
            (r: { date: string; qty: number; rows: number }) => r
          ),
        });
      }
    } catch {
      /* optional */
    } finally {
      setDiagLoading(false);
    }
  };

  const filteredItems = useMemo(() => {
    const items = result?.items || [];
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "MISMATCH" && it.causeCode === "MATCH" && !it.locationConflict) {
        return false;
      }
      if (filter === "MISMATCH" && it.causeCode === "MATCH" && it.locationConflict) {
        // 수량 일치·로케이션만 다른 건 수량 필터에서 제외
        return false;
      }
      if (filter === "LOC_CONFLICT" && !it.locationConflict) return false;
      if (
        filter !== "MISMATCH" &&
        filter !== "LOC_CONFLICT" &&
        filter !== "ALL_CAUSES" &&
        it.causeCode !== filter
      ) {
        return false;
      }
      if (!q) return true;
      const locHay = [
        it.masterLocation || "",
        ...(it.wmsLocations || []),
      ]
        .join(" ")
        .toLowerCase();
      return (
        it.barcode.toLowerCase().includes(q) ||
        (it.productName || "").toLowerCase().includes(q) ||
        locHay.includes(q)
      );
    });
  }, [result, filter, search]);

  const summary = result?.summary;

  return (
    <div className="space-y-4">
      {/* Intro */}
      <div className="rounded-lg border border-gray-200 bg-[#FAFAFA] px-4 py-3 text-sm text-[#6A6A6A]">
        <p className="text-[#3C3C3C] font-medium">전산 현재고 vs 창고(WMS) 차이 확인</p>
        <p className="mt-1 text-xs leading-relaxed">
          수량: baseline + 입고 − 출고 (바코드 단위). 로케이션:{" "}
          <strong className="text-[#3C3C3C]">마스터 페이지 기준</strong>, WMS 엑셀 로케이션이 여러 개면
          전부 표시·바코드로 확인. 조회 전용(기존 재고 업로드로 반영). DB 자동 수정 없음.
        </p>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-600">
              WMS 파일 (xlsx / zip)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.zip,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-[#F0E8FF] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#721FE5]"
            />
            {file && (
              <p className="mt-1 truncate text-xs text-gray-500">
                <FileSpreadsheet className="mr-1 inline h-3 w-3" />
                {file.name}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">WMS 기준일</label>
            <input
              type="date"
              value={wmsDate}
              onChange={(e) => setWmsDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <label
            className="flex items-center gap-2 pb-2 text-sm text-gray-700"
            title="기본 꺼짐: 페이지별 여러 행은 정상. 켜면 같은 바코드+LPN을 한 번만 셈"
          >
            <input
              type="checkbox"
              checked={dedupeLpn}
              onChange={(e) => setDedupeLpn(e.target.checked)}
              className="rounded border-gray-300"
            />
            LPN 중복 제거 (기본 끔 · 여러 행=정상)
          </label>
          <button
            type="button"
            onClick={runCheck}
            disabled={loading || !file}
            className="inline-flex items-center gap-2 rounded-md bg-[#721FE5] px-4 py-2 text-sm font-medium text-white hover:bg-[#5f1ac0] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Package className="h-4 w-4" />
            )}
            대조 실행
          </button>
          <button
            type="button"
            disabled={!result?.items?.length}
            onClick={() =>
              downloadCsv(result?.items || [], {
                baselineAsOf: result?.baselineAsOf,
                wmsAsOf: result?.wmsAsOf,
              })
            }
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
        </div>
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* KPI */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card className="border border-gray-200 bg-white">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase text-[#7A7A7A]">대조 대상</p>
              <p className="mt-1 text-2xl font-bold text-[#2A2A2A]">{summary.compared}</p>
              <p className="mt-1 text-xs text-gray-500">
                전산 기준 {result?.baselineAsOf || "—"} · WMS {result?.wmsAsOf || "—"}
              </p>
            </CardContent>
          </Card>
          <Card className="border border-emerald-100 bg-emerald-50/40">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase text-emerald-800">일치</p>
              <p className="mt-1 text-2xl font-bold text-emerald-900">{summary.matchCount}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> 전산 = 창고
              </p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer border border-red-100 bg-red-50/30 hover:shadow-sm"
            onClick={() => setFilter("MISMATCH")}
          >
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase text-red-700">불일치</p>
              <p className="mt-1 text-2xl font-bold text-[#C85A54]">{summary.mismatchCount}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
                <AlertTriangle className="h-3 w-3" /> 클릭 시 불일치 필터
              </p>
            </CardContent>
          </Card>
          <Card className="border border-amber-100 bg-amber-50/40">
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase text-amber-800">|Δ| 합</p>
              <p className="mt-1 text-2xl font-bold text-amber-950">
                {summary.absDeltaSum}
                <span className="ml-0.5 text-sm font-medium text-amber-700">박스</span>
              </p>
              <p className="mt-1 text-xs text-amber-800">
                순 Δ {summary.netDeltaSum > 0 ? "+" : ""}
                {summary.netDeltaSum}
              </p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer border border-purple-100 bg-purple-50/40 hover:shadow-sm md:col-span-1 col-span-2"
            onClick={() => setFilter("LOC_CONFLICT")}
          >
            <CardContent className="p-4">
              <p className="text-xs font-medium uppercase text-purple-800">로케이션 불일치</p>
              <p className="mt-1 text-2xl font-bold text-purple-950">
                {summary.locationConflictCount ?? 0}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-purple-700">
                <MapPin className="h-3 w-3" /> 마스터 기준 · 클릭 필터
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {result?.parseStats && (
        <p className="text-xs text-gray-500">
          파싱: 행 {result.parseStats.rowsUsed ?? "—"} / LPN 스킵{" "}
          {result.parseStats.rowsLpnSkipped ?? 0} · WMS 바코드 {result.parseStats.barcodes ?? "—"}
        </p>
      )}

      {/* A동 배치도 순 (1~150): WMS 업로드와 무관하게 배치도 실시간 최신 배치를 번호순 표시 + WMS 불일치 표시 (2026-08-30) */}
      <div className="overflow-x-auto rounded-lg border border-amber-300 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          <span>
            A동 배치도 순 (위치번호 1~150) — 실시간 최신 배치 {adongRows.length}품목
            {result
              ? ` · WMS 불일치 ${adongMismatchCount}건`
              : " · WMS 파일 대조 전 (대조 실행 시 불일치 표시)"}
          </span>
          <button
            type="button"
            onClick={() => void loadAdongBasis()}
            disabled={adongLoading}
            className="rounded border border-amber-300 bg-white px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {adongLoading ? "불러오는 중…" : "↻ 최신 배치 새로고침"}
          </button>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-amber-50/60 text-left text-xs font-semibold uppercase text-amber-900">
            <tr>
              <th className="px-3 py-2" scope="col">
                배치도 번호
              </th>
              <th className="px-3 py-2" scope="col">
                제품명
              </th>
              <th className="min-w-[220px] px-3 py-2 text-center" scope="col">
                상품 바코드
                <span className="mt-0.5 block font-normal normal-case text-amber-700">
                  CODE128
                </span>
              </th>
              <th className="min-w-[200px] px-3 py-2 text-center" scope="col">
                이동할 로케이션
                <span className="mt-0.5 block font-normal normal-case text-amber-700">
                  배치도 · 마스터 CODE128
                </span>
              </th>
              <th className="min-w-[220px] px-3 py-2 text-center text-red-900" scope="col">
                현재 WMS 로케이션
                <span className="mt-0.5 block font-normal normal-case text-red-700">
                  틀린 곳 · CODE128 (복수 전부)
                </span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {adongRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">
                  {adongLoading ? "배치도·마스터 불러오는 중…" : "표시할 배치 데이터가 없습니다."}
                </td>
              </tr>
            ) : (
              adongRows.map((r) => {
                const wrong = (r.wms || []).filter((loc) => loc !== r.loc);
                return (
                  <tr
                    key={`adong-${r.no}-${r.barcode}`}
                    className={`align-top ${wrong.length > 0 ? "bg-red-50/40" : "hover:bg-amber-50/40"}`}
                  >
                    <td className="px-3 py-2 font-mono text-base font-bold text-amber-700 tabular-nums">
                      {r.no}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900 leading-snug">{r.name || "—"}</p>
                    </td>
                    <td className="px-3 py-2 text-center align-middle">
                      <BarcodeCell value={r.barcode} tone="default" />
                    </td>
                    <td className="px-3 py-2 text-center align-middle">
                      <BarcodeCell value={r.loc} tone="ok" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        {!r.checked ? (
                          <span className="text-xs text-gray-400">— (대조 전)</span>
                        ) : wrong.length > 0 ? (
                          wrong.map((loc, i) => (
                            <BarcodeCell key={`${r.barcode}-adong-w-${i}`} value={loc} tone="bad" />
                          ))
                        ) : (r.wms || []).length > 0 ? (
                          <span className="text-xs font-semibold text-emerald-700">✓ 일치</span>
                        ) : (
                          <span className="text-xs text-gray-400">WMS 파일에 없음</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 한 로케이션에 2개 이상 품목 감지 (허용 목록 제외) */}
      {result && locShareGroups.length > 0 && (
        <Card className="border border-orange-200 bg-orange-50/40">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-orange-900">
              한 로케이션에 2개 이상 품목 — {locShareGroups.length}건
            </p>
            <p className="mt-0.5 text-xs text-orange-700">
              문제가 되는 로케이션입니다. 괜찮다고 판단한 로케이션은 [허용]으로 숨길 수 있습니다.
            </p>
            <div className="mt-3 space-y-2">
              {locShareGroups.map((g) => (
                <div key={g.location} className="rounded-md border border-orange-200 bg-white p-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs font-semibold text-gray-800">
                      {g.location} — {g.items.length}개 품목
                    </p>
                    <button
                      type="button"
                      onClick={() => persistLocShareAllow([...locShareAllow, g.location])}
                      className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      허용 (숨김)
                    </button>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {g.items.map((it) => (
                      <li key={`${g.location}-${it.barcode}`} className="text-xs text-gray-600">
                        <span className="font-mono">{it.barcode}</span> · {it.productName} ·
                        전산 {it.ledgerQty}박스
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      {result && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {CAUSE_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? "border-[#721FE5] bg-[#F0E8FF] text-[#721FE5]"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {f.label}
              </button>
            ))}
            <div className="relative ml-auto min-w-[180px]">
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="바코드 / 상품명"
                className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm"
              />
            </div>
          </div>

          {/* 로케이션 불일치: 테이블 + 제품명 + CODE128 */}
          {filter === "LOC_CONFLICT" ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                제품명과 함께{" "}
                <strong className="text-gray-800">상품 바코드</strong> ·{" "}
                <strong className="text-emerald-800">바른 로케이션(마스터)</strong> ·{" "}
                <strong className="text-red-800">틀린 로케이션(WMS)</strong> 을 CODE128로
                표시합니다.
                {filteredItems.length > 0 ? ` (${filteredItems.length}건)` : ""}
              </p>

              {filteredItems.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">
                  로케이션 불일치 품목이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-purple-200 bg-white shadow-sm">
                  <table className="min-w-full text-sm">
                    <thead className="bg-purple-50 text-left text-xs font-semibold uppercase text-purple-900">
                      <tr>
                        <th className="px-3 py-3" scope="col">
                          No
                        </th>
                        <th className="px-3 py-3" scope="col">
                          제품명
                        </th>
                        <th className="min-w-[220px] px-3 py-3 text-center" scope="col">
                          상품 바코드
                          <span className="mt-0.5 block font-normal normal-case text-purple-700">
                            CODE128
                          </span>
                        </th>
                        <th className="min-w-[220px] px-3 py-3 text-center text-emerald-900" scope="col">
                          바른 로케이션
                          <span className="mt-0.5 block font-normal normal-case text-emerald-700">
                            마스터 · CODE128
                          </span>
                        </th>
                        <th className="min-w-[240px] px-3 py-3 text-center text-red-900" scope="col">
                          틀린 로케이션
                          <span className="mt-0.5 block font-normal normal-case text-red-700">
                            WMS · CODE128 (복수 전부)
                          </span>
                        </th>
                        <th className="px-3 py-3 text-right" scope="col">
                          전산
                        </th>
                        <th className="px-3 py-3 text-right" scope="col">
                          WMS
                        </th>
                        <th className="px-3 py-3 text-center" scope="col">
                          마스터 적용
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredItems.map((it, idx) => {
                        const master = (it.masterLocation || "").trim();
                        const wrong = wrongLocationsOf(it);
                        return (
                          <tr
                            key={it.barcode}
                            className="align-top hover:bg-purple-50/40"
                          >
                            <td className="px-3 py-3 text-gray-500 tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="max-w-[220px] px-3 py-3">
                              <p className="font-medium text-gray-900 leading-snug">
                                {it.productName || "—"}
                              </p>
                              <p className="mt-1 font-mono text-[11px] text-gray-500">
                                {it.barcode}
                              </p>
                            </td>
                            <td className="px-3 py-3 text-center align-middle">
                              <BarcodeCell value={it.barcode} tone="default" />
                            </td>
                            <td className="px-3 py-3 text-center align-middle">
                              <BarcodeCell value={master} tone="ok" />
                            </td>
                            <td className="px-3 py-3 text-center align-middle">
                              {wrong.length === 0 ? (
                                <BarcodeCell value="" tone="bad" />
                              ) : (
                                <div className="mx-auto flex max-w-md flex-col items-center gap-2">
                                  {wrong.map((loc, i) => (
                                    <BarcodeCell
                                      key={`${it.barcode}-w-${loc}-${i}`}
                                      value={loc}
                                      tone="bad"
                                    />
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">
                              {it.ledgerQty}
                            </td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">
                              {it.wmsQty}
                            </td>
                            <td className="px-3 py-3 text-center align-middle">
                              {wrong.length === 0 ? (
                                <span className="text-xs text-gray-400">—</span>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  {wrong.map((loc, i) => (
                                    <button
                                      key={`${it.barcode}-apply-${i}`}
                                      type="button"
                                      disabled={applying.has(it.barcode) || appliedBarcodes.has(it.barcode)}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void applyLocation(it.barcode, loc);
                                      }}
                                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium ${
                                        appliedBarcodes.has(it.barcode)
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : "border-purple-200 bg-white text-purple-800 hover:bg-purple-50"
                                      } disabled:opacity-60`}
                                      title={`제품 마스터 로케이션을 ${loc}(으)로 수정`}
                                    >
                                      {appliedBarcodes.has(it.barcode) ? "✓ 적용됨" : "적용"}
                                      <span className="font-mono">{loc}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Table — 수량 대조 */}
              <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#FAFAF9] text-left text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2.5 font-medium" scope="col">
                        바코드
                      </th>
                      <th className="px-3 py-2.5 font-medium" scope="col">
                        상품명
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium" scope="col">
                        기본
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium" scope="col">
                        입고
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium" scope="col">
                        출고
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium" scope="col">
                        전산
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium" scope="col">
                        WMS
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium" scope="col">
                        Δ
                      </th>
                      <th className="px-3 py-2.5 font-medium" scope="col">
                        원인
                      </th>
                      <th className="px-3 py-2.5 font-medium" scope="col">
                        마스터 로케이션
                      </th>
                      <th className="px-3 py-2.5 font-medium" scope="col">
                        WMS 로케이션
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                          {summary && summary.mismatchCount === 0 ? (
                            <span className="inline-flex items-center gap-2 text-emerald-700">
                              <CheckCircle2 className="h-5 w-5" />
                              불일치 0건 — 전산과 창고가 일치합니다.
                            </span>
                          ) : (
                            "표시할 행이 없습니다. 필터를 변경해 보세요."
                          )}
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((it) => (
                        <tr
                          key={it.barcode}
                          className="cursor-pointer hover:bg-[#F0E8FF]/40"
                          onClick={() => openDetail(it)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openDetail(it);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`${it.barcode} 상세, 차이 ${it.delta}`}
                        >
                          <td className="px-3 py-2 font-mono text-xs text-gray-900">
                            {it.barcode}
                          </td>
                          <td
                            className="max-w-[200px] truncate px-3 py-2 text-gray-700"
                            title={it.productName}
                          >
                            {it.productName || "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.baseQty}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.receiptQty}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.outboundQty}</td>
                          <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-[#2A2A2A]">
                            {it.ledgerQty}
                          </td>
                          <td className="px-3 py-2 text-right text-base font-bold tabular-nums">
                            {it.wmsQty}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums ${deltaClass(it.delta)}`}
                            title={
                              it.delta < 0
                                ? `전산 대비 창고 ${Math.abs(it.delta)}박스 적음`
                                : it.delta > 0
                                  ? `전산 대비 창고 ${it.delta}박스 많음`
                                  : "일치"
                            }
                          >
                            {it.delta > 0 ? `+${it.delta}` : it.delta}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-block rounded-full border px-2 py-0.5 text-xs ${causeBadgeClass(it.causeCode)}`}
                            >
                              {it.causeLabel}
                            </span>
                            {it.locationConflict ? (
                              <span className="ml-1 inline-block rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs text-purple-800">
                                로케이션
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-800">
                            {it.masterLocation || (
                              <span className="text-gray-400">(마스터 없음)</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {(it.wmsLocations || []).length ? (
                              <span
                                className={
                                  it.locationConflict
                                    ? "font-medium text-amber-800"
                                    : "text-gray-700"
                                }
                              >
                                {(it.wmsLocations || []).join(", ")}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">
                행을 클릭하면 수량 분해와 바코드를 볼 수 있습니다. 로케이션 바코드는{" "}
                <strong>로케이션 불일치</strong> 필터에서 바로 표시됩니다.
              </p>
            </>
          )}
        </>
      )}

      {!result && !loading && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
          <Package className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-700">WMS 파일을 올려 대조를 실행하세요</p>
          <p className="mt-1 text-xs text-gray-500">
            쿠팡 페이지별재고리스트 zip / xlsx 지원 · 스냅샷을 덮어쓰지 않습니다
          </p>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal>
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="닫기"
            onClick={() => setSelected(null)}
          />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-start justify-between border-b px-4 py-3">
              <div>
                <p className="font-mono text-sm font-semibold text-gray-900">{selected.barcode}</p>
                <p className="mt-0.5 text-sm text-gray-600">{selected.productName || "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="rounded-lg border bg-[#FAFAF9] p-3 text-sm">
                <p className="mb-2 text-xs font-medium uppercase text-gray-500">구성 분해</p>
                <ul className="space-y-1.5 tabular-nums text-gray-800">
                  <li className="flex justify-between">
                    <span>기본 재고 (baseline)</span>
                    <span>{selected.baseQty}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>+ 입고</span>
                    <span>{selected.receiptQty}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>− 출고</span>
                    <span>{selected.outboundQty}</span>
                  </li>
                  <li className="flex justify-between border-t pt-1.5 font-bold">
                    <span>= 전산 현재고</span>
                    <span>{selected.ledgerQty}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>창고 WMS</span>
                    <span>{selected.wmsQty}</span>
                  </li>
                  <li className={`flex justify-between ${deltaClass(selected.delta)}`}>
                    <span>Δ (WMS − 전산)</span>
                    <span>
                      {selected.delta > 0 ? `+${selected.delta}` : selected.delta}
                    </span>
                  </li>
                </ul>
              </div>

              <div>
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-xs ${causeBadgeClass(selected.causeCode)}`}
                >
                  {selected.causeLabel}
                </span>
                {selected.locationConflict ? (
                  <span className="ml-2 inline-block rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs text-purple-800">
                    로케이션 불일치 (마스터 기준)
                  </span>
                ) : null}
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{selected.causeHint}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium uppercase text-gray-500">
                  CODE128 · 상품 / 바른 로케이션 / 틀린 로케이션
                </p>
                <BarcodeBlock value={selected.barcode} label="① 상품 바코드" tone="default" />
                <BarcodeBlock
                  value={selected.masterLocation || ""}
                  label="② 바른 로케이션 (마스터)"
                  tone="ok"
                />
                {(() => {
                  const master = (selected.masterLocation || "").trim();
                  const wrong = (selected.wmsLocations || [])
                    .map((x) => String(x).trim())
                    .filter((loc) => loc && loc !== master);
                  if (wrong.length === 0) {
                    return (
                      <BarcodeBlock value="" label="③ 틀린 로케이션 (WMS)" tone="bad" />
                    );
                  }
                  return wrong.map((loc, idx) => (
                    <BarcodeBlock
                      key={`${loc}-${idx}`}
                      value={loc}
                      label={
                        wrong.length > 1
                          ? `③ 틀린 로케이션 ${idx + 1} (WMS)`
                          : "③ 틀린 로케이션 (WMS)"
                      }
                      tone="bad"
                    />
                  ));
                })()}
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase text-gray-500">
                  일자별 출고 (기준일 이후)
                </p>
                {diagLoading ? (
                  <p className="text-xs text-gray-400">불러오는 중…</p>
                ) : diagDaily?.outbound?.length ? (
                  <ul className="space-y-1 text-sm">
                    {diagDaily.outbound.map((r) => (
                      <li key={r.date} className="flex justify-between tabular-nums">
                        <span>{r.date}</span>
                        <span>
                          {r.qty} <span className="text-xs text-gray-400">({r.rows}행)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400">(없음)</p>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-medium uppercase text-gray-500">
                  일자별 입고 (기준일 이후)
                </p>
                {diagLoading ? (
                  <p className="text-xs text-gray-400">불러오는 중…</p>
                ) : diagDaily?.receipts?.length ? (
                  <ul className="space-y-1 text-sm">
                    {diagDaily.receipts.map((r) => (
                      <li key={r.date} className="flex justify-between tabular-nums">
                        <span>{r.date}</span>
                        <span>
                          {r.qty} <span className="text-xs text-gray-400">({r.rows}행)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400">(없음)</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
