/**
 * 마스터 품목 클릭 시 출고 수량 그래프 (조회 전용 리포트)
 * - 편집/저장 없음
 * - barcode 우선, 없으면 product_name exact match
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, Package, TrendingDown, TrendingUp, Minus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type OutboundChartSpec = {
  id: number;
  product_name: string;
  barcode?: string;
  sku_id?: string;
  category_lg?: string;
  price?: number;
  is_vf_item?: boolean;
  location?: string;
  /** VF 지정일 YYYY-MM-DD — 품목 클릭 팝업에 표시 */
  vf_registered_at?: string | null;
};

type StockResponse = {
  found?: boolean;
  inBaseline?: boolean;
  barcode?: string;
  currentStock?: number | null;
  baseStock?: number;
  receiptQty?: number;
  outboundQty?: number;
  asOf?: string | null;
  lastInboundDate?: string | null;
  lastInboundQty?: number;
  lastOutboundDate?: string | null;
  lastOutboundQty?: number;
  location?: string;
  message?: string;
};

type RangeKey = 30 | 90 | 180 | 365;

type DailyPt = { date: string; quantity: number; salesAmount: number };
type StatsResponse = {
  summary: {
    totalCount: number;
    totalQuantity: number;
    totalSalesAmount: number;
  };
  dailyTrend: DailyPt[];
};

function formatDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function rangeBounds(days: RangeKey): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));
  return { start: formatDateYmd(start), end: formatDateYmd(end) };
}

function shortDateLabel(iso: string): string {
  // 2026-06-23 → 6/23
  const parts = iso.split("-");
  if (parts.length < 3) return iso;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

/** 최소제곱 선형 회귀 추세값 (수량 기준) */
function linearTrend(values: number[]): { trend: number[]; slope: number } {
  const n = values.length;
  if (n < 2) return { trend: values.map((v) => v), slope: 0 };
  const sumX = values.reduce((s, _, i) => s + i, 0);
  const sumY = values.reduce((s, v) => s + v, 0);
  const sumXY = values.reduce((s, v, i) => s + i * v, 0);
  const sumX2 = values.reduce((s, _, i) => s + i * i, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { trend: values.map((v) => v), slope: 0 };
  const m = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - m * sumX) / n;
  // 음수 클램프하지 않음 — 하락 추세 가시성 유지 (표시는 0 이상 권장 시 max)
  const trend = values.map((_, i) => Math.round((m * i + b) * 100) / 100);
  return { trend, slope: m };
}

async function fetchProductOutboundStats(
  spec: OutboundChartSpec,
  days: RangeKey
): Promise<StatsResponse> {
  const { start, end } = rangeBounds(days);
  const params = new URLSearchParams({
    startDate: start,
    endDate: end,
    groupBy: "day",
  });
  const barcode = (spec.barcode || "").trim();
  if (barcode) {
    params.set("barcode", barcode);
  } else if (spec.product_name) {
    params.set("product", spec.product_name);
  }

  const res = await fetch(`/api/outbound/stats?${params.toString()}`);
  if (!res.ok) {
    throw new Error("출고 통계를 불러오지 못했습니다.");
  }
  const data = (await res.json()) as StatsResponse;

  // barcode 필터 결과가 비고 product_name 이 있으면 제품명으로 한 번 더 시도
  if (
    barcode &&
    (data.summary?.totalQuantity || 0) === 0 &&
    (data.dailyTrend?.length || 0) === 0 &&
    spec.product_name
  ) {
    const p2 = new URLSearchParams({
      startDate: start,
      endDate: end,
      groupBy: "day",
      product: spec.product_name,
    });
    const res2 = await fetch(`/api/outbound/stats?${p2.toString()}`);
    if (res2.ok) return (await res2.json()) as StatsResponse;
  }
  return data;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: OutboundChartSpec | null;
};

export function ProductOutboundChartDialog({ open, onOpenChange, spec }: Props) {
  const [days, setDays] = useState<RangeKey>(90);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: [
      "master-product-outbound",
      spec?.id,
      spec?.barcode,
      spec?.product_name,
      days,
    ],
    queryFn: () => fetchProductOutboundStats(spec!, days),
    enabled: open && !!spec,
    staleTime: 60_000,
  });

  /** 전산 현재고 조회 (바코드 기준 inventory_stock 규칙). 마스터 VF·enhanced 공용 */
  const showStockPanel = !!spec?.is_vf_item || !!spec?.barcode;
  const stockBarcode = (spec?.barcode || "").trim();
  const {
    data: stockData,
    isLoading: stockLoading,
    isError: stockError,
  } = useQuery({
    queryKey: ["master-product-current-stock", stockBarcode],
    queryFn: async (): Promise<StockResponse> => {
      const res = await fetch(
        `/api/master/specs/current-stock?barcode=${encodeURIComponent(stockBarcode)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "현재고 조회 실패");
      }
      return res.json();
    },
    enabled: open && !!spec && showStockPanel && !!stockBarcode,
    staleTime: 30_000,
  });

  const { chartData, trendSlope } = useMemo(() => {
    const trend = data?.dailyTrend || [];
    const qtyValues = trend.map((d) => Number(d.quantity) || 0);
    const { trend: trendVals, slope } = linearTrend(qtyValues);
    const rows = trend.map((d, i) => ({
      name: shortDateLabel(d.date),
      date: d.date,
      quantity: Number(d.quantity) || 0,
      salesAmount: Number(d.salesAmount) || 0,
      qtyTrend: trendVals[i] ?? null,
    }));
    return { chartData: rows, trendSlope: slope };
  }, [data]);

  const totalQty = data?.summary?.totalQuantity ?? 0;
  const totalSales = Number(data?.summary?.totalSalesAmount ?? 0);
  const shipDays = chartData.filter((d) => d.quantity > 0).length;
  const avgDaily = shipDays > 0 ? totalQty / shipDays : 0;
  const peak = chartData.reduce(
    (acc, d) => (d.quantity > acc.quantity ? d : acc),
    { name: "-", date: "", quantity: 0, salesAmount: 0, qtyTrend: null as number | null }
  );

  const trendDirection =
    chartData.length < 2
      ? "flat"
      : trendSlope > 0.02
        ? "up"
        : trendSlope < -0.02
          ? "down"
          : "flat";

  const rangeOptions: { key: RangeKey; label: string }[] = [
    { key: 30, label: "30일" },
    { key: 90, label: "90일" },
    { key: 180, label: "180일" },
    { key: 365, label: "1년" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-8 leading-snug">
            {spec?.product_name || "출고 수량"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                <Package className="h-3 w-3" />
                출고 리포트 (조회 전용)
              </span>
              {spec?.is_vf_item && (
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800 border border-violet-200">
                  VF
                </span>
              )}
              {spec?.is_vf_item && (
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800 border border-violet-200">
                  VF 등록일{" "}
                  <span className="font-mono tabular-nums">
                    {spec.vf_registered_at
                      ? String(spec.vf_registered_at).slice(0, 10)
                      : "미등록"}
                  </span>
                </span>
              )}
              {spec?.barcode && (
                <span className="font-mono">바코드 {spec.barcode}</span>
              )}
              {spec?.sku_id && (
                <span className="font-mono">SKU {spec.sku_id}</span>
              )}
              {spec?.location && (
                <span className="font-mono">로케이션 {spec.location}</span>
              )}
              {spec?.category_lg && <span>{spec.category_lg}</span>}
              {typeof spec?.price === "number" && spec.price > 0 && (
                <span>{spec.price.toLocaleString()}원</span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {rangeOptions.map((opt) => (
            <Button
              key={opt.key}
              type="button"
              size="sm"
              variant={days === opt.key ? "default" : "outline"}
              className="h-8 px-3 text-xs"
              onClick={() => setDays(opt.key)}
            >
              {opt.label}
            </Button>
          ))}
          {isFetching && !isLoading && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground ml-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              갱신 중
            </span>
          )}
        </div>

        {/* 전산 현재고 (바코드 검색) — VF 배지 품목·enhanced 공용 */}
        {showStockPanel && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold text-violet-800 uppercase tracking-wide">
                {spec?.is_vf_item ? "VF 현재고 (전산)" : "현재고 (전산)"}
              </div>
              {!stockBarcode && (
                <span className="text-xs text-amber-700">바코드 없음 — 재고 조회 불가</span>
              )}
              {stockBarcode && stockLoading && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> 재고 조회 중…
                </span>
              )}
              {stockBarcode && stockError && (
                <span className="text-xs text-destructive">재고 조회 실패</span>
              )}
            </div>
            {stockBarcode && !stockLoading && !stockError && stockData && (
              <div className="space-y-2 mt-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <SummaryTile
                    label="현재고"
                    value={
                      stockData.currentStock != null
                        ? `${Number(stockData.currentStock).toLocaleString()}개`
                        : "-"
                    }
                  />
                  <SummaryTile
                    label="마지막 입고"
                    value={
                      stockData.lastInboundDate
                        ? `${stockData.lastInboundDate} · ${Number(stockData.lastInboundQty || 0).toLocaleString()}개`
                        : "-"
                    }
                  />
                  <SummaryTile
                    label="마지막 출고"
                    value={
                      stockData.lastOutboundDate
                        ? `${stockData.lastOutboundDate} · ${Number(stockData.lastOutboundQty || 0).toLocaleString()}개`
                        : "-"
                    }
                  />
                </div>
                {/* 기준일·입출고일 / 로케이션 두 줄 (스냅샷 수량은 표시 안 함) */}
                <div className="rounded-md border border-violet-100 bg-white/70 px-3 py-2 text-xs text-gray-700 space-y-1">
                  <div className="leading-relaxed">
                    <span className="text-muted-foreground">기준일:</span>{" "}
                    <span className="font-medium tabular-nums">{stockData.asOf || "-"}</span>
                    <span className="text-muted-foreground mx-1.5">·</span>
                    <span className="text-muted-foreground">마지막 출고:</span>{" "}
                    <span className="font-medium tabular-nums">
                      {stockData.lastOutboundDate || "-"}
                    </span>
                    <span className="text-muted-foreground mx-1.5">·</span>
                    <span className="text-muted-foreground">최근 입고:</span>{" "}
                    <span className="font-medium tabular-nums">
                      {stockData.lastInboundDate || "-"}
                      {stockData.lastInboundDate && stockData.lastInboundQty != null
                        ? ` (${Number(stockData.lastInboundQty).toLocaleString()}개)`
                        : ""}
                    </span>
                  </div>
                  <div className="leading-relaxed">
                    <span className="text-muted-foreground">로케이션:</span>{" "}
                    <span className="font-mono font-medium">
                      {stockData.location || spec?.location || "-"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SummaryTile label="총 출고 수량" value={`${Number(totalQty).toLocaleString()}개`} />
          <SummaryTile label="출고 일수" value={`${shipDays}일`} />
          <SummaryTile
            label="출고일 평균"
            value={shipDays ? `${avgDaily.toFixed(1)}개` : "-"}
          />
          <SummaryTile
            label="총 매출"
            value={totalSales > 0 ? `${Math.round(totalSales).toLocaleString()}원` : "-"}
          />
        </div>

        <div className="rounded-lg border bg-card p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-800">일별 출고 수량</h3>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {chartData.length >= 2 && (
                <span
                  className={`inline-flex items-center gap-0.5 font-medium ${
                    trendDirection === "up"
                      ? "text-red-600"
                      : trendDirection === "down"
                        ? "text-blue-600"
                        : "text-slate-500"
                  }`}
                  title={`일 단위 기울기 ${trendSlope.toFixed(3)}`}
                >
                  {trendDirection === "up" ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : trendDirection === "down" ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                  추세{" "}
                  {trendDirection === "up"
                    ? "상승"
                    : trendDirection === "down"
                      ? "하락"
                      : "보합"}
                </span>
              )}
              {peak.quantity > 0 && (
                <span>
                  피크 {peak.date} · {peak.quantity.toLocaleString()}개
                </span>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              출고 데이터 로딩…
            </div>
          ) : isError ? (
            <div className="h-[300px] flex items-center justify-center text-destructive text-sm">
              {(error as Error)?.message || "오류가 발생했습니다."}
            </div>
          ) : chartData.length === 0 || totalQty === 0 ? (
            <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground text-sm gap-1">
              <span>선택한 기간에 출고 실적이 없습니다.</span>
              <span className="text-xs">기간을 늘리거나 다른 품목을 확인해 주세요.</span>
            </div>
          ) : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 22, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    width={36}
                    domain={[0, (max: number) => Math.max(4, Math.ceil(max * 1.15))]}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === "출고 수량")
                        return [`${Number(value).toLocaleString()}개`, "출고 수량"];
                      if (name === "추세선")
                        return [`${Number(value).toFixed(1)}개`, "추세선"];
                      if (name === "salesAmount")
                        return [`${Math.round(Number(value)).toLocaleString()}원`, "매출"];
                      return [value, name];
                    }}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload;
                      return p?.date || "";
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={24}
                    wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
                  />
                  <Bar
                    dataKey="quantity"
                    name="출고 수량"
                    fill="#6366f1"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={chartData.length > 40 ? 14 : 28}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="quantity"
                      position="top"
                      formatter={(v: number) => (v > 0 ? String(v) : "")}
                      style={{
                        fontSize: chartData.length > 40 ? 9 : 11,
                        fontWeight: 600,
                        fill: "#4338ca",
                      }}
                      offset={4}
                    />
                  </Bar>
                  {chartData.length >= 2 && (
                    <Line
                      type="linear"
                      dataKey="qtyTrend"
                      name="추세선"
                      stroke="#f97316"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      activeDot={{ r: 4, fill: "#f97316" }}
                      isAnimationActive={false}
                      connectNulls
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          출고 실적 조회 전용입니다. 품목 정보 수정은 행의 편집 버튼을 이용해 주세요.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-bold text-gray-900 mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
