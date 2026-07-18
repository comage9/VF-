import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, subMonths, subYears, eachDayOfInterval, parseISO, isSameDay, isValid, startOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval, getWeek, addDays, differenceInDays, differenceInWeeks, startOfYear, addYears, endOfWeek, endOfYear } from "date-fns";
import FCInboundUpload from "./fc-inbound-upload";
import {
    ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, LabelList
} from "recharts";
import {
    Loader2, Search, TrendingUp, Package, DollarSign, Calendar,
    Filter, Download, Sparkles, HelpCircle, Award, Info, ArrowUpDown
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, ChevronDown } from "lucide-react";
import type { OutboundRecord } from "@shared/schema";
const TopProductsYAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const raw = String(payload?.value ?? '').trim();
    const maxLineLen = 12;

    const parts = raw.split(/\s+/).filter(Boolean);
    let line1 = '';
    let line2 = '';
    if (parts.length >= 2) {
        for (const p of parts) {
            if ((line1 + (line1 ? ' ' : '') + p).length <= maxLineLen) {
                line1 = line1 ? `${line1} ${p}` : p;
            } else {
                line2 = line2 ? `${line2} ${p}` : p;
            }
        }
    } else {
        line1 = raw.slice(0, maxLineLen);
        line2 = raw.length > maxLineLen ? raw.slice(maxLineLen, maxLineLen * 2) : '';
    }

    if (line2.length > maxLineLen) {
        line2 = line2.slice(0, Math.max(0, maxLineLen - 1)) + '…';
    }

    return (
        <text x={x} y={y} textAnchor="end" fill="#374151" fontSize={11} dominantBaseline="middle">
            <tspan x={x} dy={-7}>{line1}</tspan>
            {line2 ? <tspan x={x} dy={14}>{line2}</tspan> : null}
        </text>
    );
};

// --- Types ---
type OutboundRecordWithBoxes = OutboundRecord;

function normalizeOutboundRecord(record: any): OutboundRecordWithBoxes {
    const salesAmountRaw = record?.salesAmount ?? record?.sales_amount ?? record?.supplyAmount ?? record?.supply_amount;
    const salesAmount = salesAmountRaw === null || salesAmountRaw === undefined || salesAmountRaw === ''
        ? null
        : Number(salesAmountRaw);

    const outboundDate = record?.outboundDate ?? record?.outbound_date ?? record?.inboundDate ?? record?.inbound_date;
    const logisticsCenter = record?.logisticsCenter ?? record?.logistics_center ?? '';

    return {
        ...record,
        productName: record?.productName ?? record?.product_name ?? '',
        outboundDate,
        salesAmount: salesAmount === null || Number.isNaN(salesAmount) ? null : salesAmount,
        purchasePrice: record?.purchasePrice ?? record?.purchase_price ?? null,
        boxQuantity: record?.boxQuantity ?? record?.box_quantity ?? null,
        unitCount: record?.unitCount ?? record?.unit_count ?? null,
        quantity: record?.quantity,  // FC inbound uses quantity field
        logisticsCenter,
        isEstimated: Boolean(record?.isEstimated ?? record?.is_estimated),
        estimateMethod: record?.estimateMethod ?? record?.estimate_method ?? '',
        status: record?.status ?? '',
        createdAt: record?.createdAt ?? record?.created_at ?? null,
        updatedAt: record?.updatedAt ?? record?.updated_at ?? null,
    } as OutboundRecordWithBoxes;
}

// --- Helper Functions ---
const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");
const CURRENCY_FORMATTER = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" });

function formatCurrency(value: number) {
    return CURRENCY_FORMATTER.format(value).replace("₩", "₩ ");
}

/** 전년(동기) 대비 증감률. 과거 금액/박스 없거나 0이면 null → N/A */
function growthPct(current: number, prev: number | null | undefined): number | null {
    if (prev == null || Number.isNaN(Number(prev)) || Number(prev) <= 0) return null;
    const c = Number(current) || 0;
    return ((c - Number(prev)) / Number(prev)) * 100;
}

function YoYPctCell({ pct }: { pct: number | null }) {
    if (pct == null || Number.isNaN(pct)) {
        return <span className="text-gray-400">N/A</span>;
    }
    const positive = pct > 0;
    const zero = Math.abs(pct) < 0.05;
    const color = zero ? 'text-gray-600' : positive ? 'text-emerald-600' : 'text-red-500';
    const prefix = zero ? '' : positive ? '▲' : '▼';
    return (
        <span className={`font-medium tabular-nums ${color}`}>
            {prefix}{Math.abs(pct).toFixed(1)}%
        </span>
    );
}

/** 선택 기간을 n년 전 동기간으로 이동 (윤년 보정은 date-fns subYears) */
function shiftIsoYear(iso: string, yearsBack: number): string {
    const d = parseISO(iso);
    if (!isValid(d)) return iso;
    return format(subYears(d, yearsBack), 'yyyy-MM-dd');
}

/** 분류명 매칭 키 (공백·전각공백 제거) */
function catMatchKey(name: string): string {
    return String(name || '')
        .replace(/\u00a0/g, ' ')
        .trim()
        .replace(/\s+/g, '');
}

function buildCategoryAmountMap(breakdown: any[] | undefined): Map<string, { salesAmount: number; quantity: number }> {
    const m = new Map<string, { salesAmount: number; quantity: number }>();
    (breakdown || []).forEach((c: any) => {
        const name = String(c.category ?? c.name ?? '').trim();
        if (!name) return;
        const entry = {
            salesAmount: Number(c.salesAmount ?? c.sales_amount ?? c.supplyAmount ?? c.supply_amount ?? 0),
            quantity: Number(c.quantity ?? 0),
        };
        // 원본명 + 정규화 키 둘 다 저장
        m.set(name, entry);
        m.set(catMatchKey(name), entry);
    });
    return m;
}

const CATEGORY_TABLE_PREVIEW = 10;

// VF/FC DataSource별 레이블 헬퍼
function getDataLabels(dataSource: 'vf' | 'fc') {
    if (dataSource === 'fc') {
        return {
            quantityLabel: '입고량',
            quantityUnit: '개',
            salesLabel: '공급가액',
            trendTitle: '일별 입고 추이',
            kpiQuantity: '총 입고량',
            kpiSales: '총 공급가액',
            categorySales: '분류별 입고 비중',
            tooltipQuantity: '입고량(개)',
        };
    }
    return {
        quantityLabel: '출고량',
        quantityUnit: 'Box',
        salesLabel: '매출액',
        trendTitle: '일별 매출 및 출고량 추이',
        kpiQuantity: '총 출고량',
        kpiSales: '총 매출액',
        categorySales: '분류별 매출 비중',
        tooltipQuantity: '출고량(Box)',
    };
}

// Safe Date Formatter
function safeFormatDate(dateStr: string | Date | null | undefined, fmt: string = 'yyyy-MM-dd'): string {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return ''; // Invalid Date
        return format(date, fmt);
    } catch (e) {
        return '';
    }
}

// --- Components ---

const reportFmt = (value: any, format?: string) => {
    if (value === null || value === undefined || value === "") return "-";
    const n = Number(value);
    if (format === "currency") {
        if (Number.isNaN(n)) return String(value);
        return n.toLocaleString("ko-KR") + "원";
    }
    if (format === "number") {
        if (Number.isNaN(n)) return String(value);
        return Number.isInteger(n) ? n.toLocaleString("ko-KR") : n.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
    }
    if (format === "signed") {
        if (Number.isNaN(n)) return String(value);
        const cls = n > 0 ? "text-emerald-600" : n < 0 ? "text-red-600" : "text-gray-600";
        return <span className={`font-medium tabular-nums ${cls}`}>{n > 0 ? "+" : ""}{n.toLocaleString("ko-KR")}</span>;
    }
    if (format === "pct") {
        if (Number.isNaN(n)) return "-";
        const cls = n > 0 ? "text-emerald-600" : n < 0 ? "text-red-600" : "text-gray-600";
        return <span className={`font-medium tabular-nums ${cls}`}>{n > 0 ? "+" : ""}{n.toFixed(1)}%</span>;
    }
    if (format === "pctAbs") {
        if (Number.isNaN(n)) return "-";
        return `${n.toFixed(1)}%`;
    }
    return String(value);
};

const priorityCls = (p: string) => {
    if (p === "높음") return "text-red-700 bg-red-50 border-red-100";
    if (p === "보통") return "text-amber-700 bg-amber-50 border-amber-100";
    if (p === "AI") return "text-indigo-700 bg-indigo-50 border-indigo-100";
    return "text-slate-600 bg-slate-50 border-slate-100";
};

/** 출고 분석 리포트 — 표 클릭 확대 / 바깥·다른 영역 클릭 시 원복
 *  증가·감소 품목 행 클릭 → onProductSelect로 상위 그래프 연동
 */
const OutboundAIReport = ({
    startDate,
    endDate,
    category,
    searchQuery,
    product,
    summaryStats,
    apiPrefix,
    selectedProduct,
    onProductSelect,
}: any) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const expandedRef = useRef<HTMLDivElement | null>(null);

    const { data, isLoading, isError, refetch, isFetching } = useQuery({
        queryKey: [apiPrefix + '/ai-analysis', 'v4-insight', startDate, endDate, category, searchQuery, product],
        queryFn: async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 55_000);
            try {
                const res = await fetch(`${apiPrefix}/ai-analysis`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ startDate, endDate, category, searchQuery, product, summaryStats }),
                    signal: controller.signal,
                });
                if (!res.ok) {
                    // 프록시/백엔드 일시 오류 시 페이지 전체를 깨지 않고 안내 문구
                    return {
                        analysis:
                            '### AI 분석 일시 불가\n\n백엔드 연결이 끊겼거나 응답이 지연되었습니다. 잠시 후 다시 시도해 주세요.\n\n' +
                            '(`runserver` 중복 실행·OpenRouter 지연 시 Vite에 `ECONNRESET` 이 표시될 수 있습니다.)',
                        source: 'client-fallback',
                    };
                }
                return res.json();
            } catch (e: any) {
                const aborted = e?.name === 'AbortError';
                return {
                    analysis:
                        '### AI 분석 일시 불가\n\n' +
                        (aborted
                            ? '요청 시간이 초과되었습니다 (약 55초). 백엔드·OpenRouter 상태를 확인해 주세요.'
                            : `네트워크/프록시 오류: ${e?.message || e}\n\n백엔드가 http://127.0.0.1:5176 에서 동작 중인지 확인하세요.`),
                    source: 'client-fallback',
                };
            } finally {
                clearTimeout(timer);
            }
        },
        enabled: !!(summaryStats?.totalSales || summaryStats?.totalQty || (startDate && endDate)),
        staleTime: 5 * 60 * 1000,
        retry: 0,
    });

    // 확대 중: 확대 패널 밖 클릭 → 원복
    useEffect(() => {
        if (!expandedId) return;
        const onDown = (e: MouseEvent) => {
            const el = expandedRef.current;
            if (el && !el.contains(e.target as Node)) {
                setExpandedId(null);
            }
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [expandedId]);

    const th = "px-1.5 py-1 text-center text-[11px] font-semibold text-purple-700/90 bg-purple-50 border-b border-purple-100 sticky top-0 whitespace-nowrap leading-snug";
    const td = "px-1.5 py-1 text-[11px] border-b border-purple-50/80 text-center leading-snug align-middle";

    const modeLabel =
        data?.mode === "insight-tables+ai" ? "동향·증감 · AI" :
        data?.mode === "insight-tables" ? "동향·증감 · 준비" :
        data?.mode === "empty" ? "데이터 없음" : "인사이트";

    const toggleExpand = (id: string) => {
        setExpandedId((cur) => (cur === id ? null : id));
    };

    const renderSectionTable = (sec: any, opts?: { maxH?: string; expanded?: boolean }) => {
        if (!sec || sec.type !== "table" || !Array.isArray(sec.rows)) return null;
        const isUp = sec.id === "up";
        const isDown = sec.id === "down";
        const isPrep = sec.id === "prep";
        const isExp = !!opts?.expanded;
        const maxH = isExp ? "max-h-[min(70vh,560px)]" : (opts?.maxH || "max-h-[220px]");
        return (
            <div
                key={sec.id}
                ref={isExp ? expandedRef : undefined}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(sec.id);
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpand(sec.id);
                    }
                }}
                title={isExp ? "클릭 또는 바깥 영역 클릭 → 원래 배치" : "클릭하면 이 표만 확대"}
                className={`rounded-md border bg-white overflow-hidden flex flex-col min-w-0 h-full cursor-pointer transition-shadow ${
                    isExp ? "shadow-lg ring-2 ring-purple-300 border-purple-300" : "hover:border-purple-300 hover:shadow-sm"
                } ${
                    isUp ? "border-emerald-100" : isDown ? "border-red-100" : isPrep ? "border-amber-100" : "border-purple-100"
                }`}
            >
                <div
                    className={`px-2 py-1.5 text-[12px] font-bold border-b text-center shrink-0 flex items-center justify-center gap-2 ${
                        isUp
                            ? "text-emerald-800 bg-emerald-50/80 border-emerald-100"
                            : isDown
                                ? "text-red-800 bg-red-50/80 border-red-100"
                                : isPrep
                                    ? "text-amber-900 bg-amber-50/80 border-amber-100"
                                    : "text-purple-800 bg-purple-50/80 border-purple-100"
                    }`}
                >
                    <span>{sec.title}</span>
                    <span className="text-[10px] font-normal opacity-70">
                        {isExp ? "축소" : "확대"}
                    </span>
                </div>
                <div
                    className={`overflow-x-auto overflow-y-auto flex-1 ${maxH}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <table className="w-full">
                        <thead>
                            <tr>
                                {(sec.columns || []).map((c: any) => (
                                    <th key={c.key} className={th}>{c.label}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sec.rows.map((row: any, ri: number) => {
                                const productKey = String(row.productName || row.name || "").trim();
                                const isProductRow = (isUp || isDown) && !!productKey;
                                const isSelected = isProductRow && selectedProduct && (
                                    selectedProduct === productKey || selectedProduct === row.name
                                );
                                return (
                                <tr
                                    key={ri}
                                    className={`hover:bg-slate-50/80 ${isProductRow ? "cursor-pointer" : ""} ${isSelected ? "bg-indigo-100 ring-1 ring-inset ring-indigo-300" : ""}`}
                                    title={isProductRow ? "클릭: 이 품목 출고 그래프 표시" : undefined}
                                    onClick={(e) => {
                                        if (!isProductRow || !onProductSelect) return;
                                        e.stopPropagation();
                                        // 같은 품목 재클릭 → 선택 해제
                                        if (isSelected) onProductSelect(null);
                                        else onProductSelect(productKey);
                                    }}
                                >
                                    {(sec.columns || []).map((c: any) => {
                                        if (c.key === "priority") {
                                            return (
                                                <td key={c.key} className={`${td} whitespace-nowrap`}>
                                                    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium leading-tight ${priorityCls(String(row[c.key] || ""))}`}>
                                                        {row[c.key] || "-"}
                                                    </span>
                                                </td>
                                            );
                                        }
                                        const isLong = c.key === "name" || c.key === "action" || c.key === "detail" || c.key === "note" || c.key === "item" || c.key === "value";
                                        return (
                                            <td
                                                key={c.key}
                                                className={`${td} tabular-nums ${isLong ? "truncate max-w-[9rem]" : ""} ${c.key === "name" || c.key === "action" ? "font-medium text-slate-700" : "text-slate-600"} ${isSelected && c.key === "name" ? "text-indigo-800" : ""}`}
                                                title={isLong ? String(row.productName ?? row[c.key] ?? "") : undefined}
                                            >
                                                {reportFmt(row[c.key], c.format)}
                                            </td>
                                        );
                                    })}
                                </tr>
                                );
                            })}
                            {sec.rows.length === 0 && (
                                <tr>
                                    <td colSpan={(sec.columns || []).length || 1} className="py-3 text-center text-gray-400 text-[11px]">
                                        해당 항목 없음
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderSummaryPanel = (opts?: { expanded?: boolean }) => {
        const isExp = !!opts?.expanded;
        return (
            <div
                ref={isExp ? expandedRef : undefined}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand("summary");
                }}
                onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpand("summary");
                    }
                }}
                title={isExp ? "클릭 또는 바깥 영역 클릭 → 원래 배치" : "클릭하면 한눈 요약만 확대"}
                className={`rounded-md border border-indigo-100 bg-indigo-50/70 px-2.5 py-2 flex flex-col min-w-0 h-full cursor-pointer transition-shadow ${
                    isExp ? "shadow-lg ring-2 ring-indigo-300" : "hover:border-indigo-300 hover:shadow-sm"
                }`}
            >
                <div className="text-[12px] font-bold text-indigo-800 mb-1.5 flex items-center justify-center gap-1 shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                    한눈 요약
                    <span className="text-[10px] font-normal opacity-70">{isExp ? "축소" : "확대"}</span>
                </div>
                {Array.isArray(data?.insights) && data.insights.length > 0 ? (
                    <ul
                        className={`space-y-1 overflow-y-auto flex-1 ${isExp ? "max-h-[min(70vh,560px)]" : "max-h-[200px]"}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {data.insights.map((line: string, i: number) => (
                            <li key={i} className="text-[11px] text-indigo-950 leading-snug text-center">
                                <span className="text-indigo-400">• </span>
                                {line}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-[11px] text-indigo-400 text-center py-4">요약 없음</p>
                )}
            </div>
        );
    };

    const sectionById = (id: string) =>
        (data?.sections || []).find((s: any) => s.id === id);

    return (
        <Card className="h-full flex flex-col bg-gradient-to-br from-purple-50 to-white border-purple-100">
            <CardHeader className="pb-1.5 py-2 px-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-purple-700">
                        <Sparkles className="w-3.5 h-3.5" />
                        출고 분석 리포트
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
                            {modeLabel}
                        </span>
                    </CardTitle>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="text-[11px] px-2 py-0.5 rounded border border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-50"
                    >
                        {isFetching ? "갱신 중…" : "다시 분석"}
                    </button>
                </div>
                {data?.period?.label && (
                    <p className="text-[11px] text-purple-600/80 mt-0.5 text-center">
                        기간 {data.period.label} · {data.period.days}일
                        {data.compareNote && <span className="block text-purple-500/70 text-[10px]">{data.compareNote}</span>}
                    </p>
                )}
            </CardHeader>
            <CardContent
                className="flex-1 overflow-y-auto p-2 pt-0 space-y-2.5"
                onClick={() => {
                    if (expandedId) setExpandedId(null);
                }}
            >
                {isLoading ? (
                    <div className="space-y-2 mt-3">
                        <div className="h-3 bg-purple-100 rounded w-3/4 animate-pulse mx-auto" />
                        <div className="h-20 bg-purple-50 rounded animate-pulse" />
                        <div className="text-[11px] text-purple-400 mt-2 text-center">동향·증감 분석 중…</div>
                    </div>
                ) : isError || data?.mode === "empty" || data?.success === false ? (
                    <div className="text-center py-6 text-sm text-red-500">
                        {data?.message || "분석을 불러오지 못했습니다."}
                    </div>
                ) : expandedId ? (
                    /* 확대 모드: 선택 표만 전체 표시 */
                    <div className="h-full min-h-[320px]" onClick={(e) => e.stopPropagation()}>
                        {expandedId === "summary"
                            ? renderSummaryPanel({ expanded: true })
                            : renderSectionTable(sectionById(expandedId), { expanded: true, maxH: "max-h-[min(70vh,560px)]" })}
                        <p className="text-[10px] text-center text-purple-400 mt-2">
                            표 제목 다시 클릭 또는 빈 곳·다른 영역 클릭 → 원래 배치
                        </p>
                    </div>
                ) : (
                    <>
                        {/* 1행: 동향 요약 | 최근 일별 | 한눈 요약 */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 items-stretch">
                            {renderSectionTable(sectionById("trend"), { maxH: "max-h-[200px]" })}
                            {renderSectionTable(sectionById("recent"), { maxH: "max-h-[200px]" })}
                            {renderSummaryPanel()}
                        </div>

                        {/* 2행: 증가 품목 | 감소 품목 | 준비 사항 */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 items-stretch">
                            {renderSectionTable(sectionById("up"), { maxH: "max-h-[260px]" })}
                            {renderSectionTable(sectionById("down"), { maxH: "max-h-[260px]" })}
                            {renderSectionTable(sectionById("prep"), { maxH: "max-h-[260px]" })}
                        </div>

                        {!data?.sections?.length && data?.analysis && (
                            <div className="text-[11px] text-slate-600 whitespace-pre-wrap text-center">{data.analysis}</div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};

const CompactTotalTable = ({
    title,
    data,
    rowKey,
    rowLabel,
    quantityKey,
    salesKey,
    quantityLabel = '출고량',
    quantityUnit = 'Box',
    salesLabel = '매출액',
}: {
    title: string;
    data: any[];
    rowKey: string;
    rowLabel: string;
    quantityKey: string;
    salesKey: string;
    quantityLabel?: string;
    quantityUnit?: string;
    salesLabel?: string;
}) => {
    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="py-3 px-4 border-b bg-gray-50/50">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    {title}
                </CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <div className="inline-block min-w-full align-middle">
                        <div className="overflow-y-auto max-h-[800px]">
                            <table className="min-w-full divide-y divide-gray-200 border-collapse text-xs">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 border-r min-w-[140px]">
                                            {rowLabel}
                                        </th>
                                        <th className="px-2 py-2 text-right font-medium text-gray-500 min-w-[100px]">제품명</th>
                                        <th className="px-2 py-2 text-right font-medium text-gray-500 min-w-[100px]">합계</th>
                                        <th className="px-2 py-2 text-right font-medium text-gray-500 min-w-[100px]">{quantityLabel}({quantityUnit})</th>
                                        <th className="px-2 py-2 text-right font-medium text-gray-500 min-w-[140px]">{salesLabel}</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {data.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-2 py-1 whitespace-nowrap font-medium text-gray-900 sticky left-0 bg-white border-r">
                                                {row[rowKey]}
                                            </td>
                                            <td className="px-2 py-1 whitespace-nowrap text-gray-900">
                                                {row.productName || "-"}
                                            </td>
                                            <td className="px-2 py-1 text-right whitespace-nowrap font-bold text-gray-900">
                                                {row.totalSum || 0}
                                            </td>
                                            <td className="px-2 py-1 text-right whitespace-nowrap font-bold text-gray-900">
                                                {NUMBER_FORMATTER.format(row?.total?.[quantityKey] || 0)}
                                            </td>
                                            <td className="px-2 py-1 text-right whitespace-nowrap font-bold text-gray-900">
                                                {formatCurrency(row?.total?.[salesKey] || 0)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
};

// Compact Pivot Table
const CompactPivotTable = ({
    title,
    data,
    dates,
    rowKey,
    rowLabel,
    valueKey,
    secondaryValueKey,
    selectedItems = [],
    onItemToggle,
    quantityLabel = '출고량',
    quantityUnit = 'Box',
    salesLabel = '매출액',
}: {
    title: string;
    data: any[];
    dates: Date[];
    rowKey: string;
    rowLabel: string;
    valueKey: string;
    secondaryValueKey?: string;
    selectedItems?: string[];
    onItemToggle?: (item: string) => void;
    quantityLabel?: string;
    quantityUnit?: string;
    salesLabel?: string;
}) => {
    const maxVal = data.reduce((max, row) => {
        const rowMax = dates.reduce((m, d) => {
            // Safe format
            const dateKey = safeFormatDate(d, 'yyyy-MM-dd');
            if (!dateKey) return m;
            const val = row.values[dateKey]?.[valueKey] || 0;
            return Math.max(m, val);
        }, 0);
        return Math.max(max, rowMax);
    }, 0);

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="py-3 px-4 border-b bg-gray-50/50">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    {title}
                </CardTitle>
            </CardHeader>
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <div className="inline-block min-w-full align-middle">
                        <div className="overflow-y-auto max-h-[800px]"> {/* Approx 15 rows */}
                            <table className="min-w-full divide-y divide-gray-200 border-collapse text-xs">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 border-r min-w-[120px]">
                                            {rowLabel}
                                        </th>
                                        <th className="px-2 py-2 text-right font-bold text-gray-700 bg-gray-50 sticky left-[120px] border-r border-l">합계</th>
                                        {dates.map((date, idx) => (
                                            <th key={idx} className="px-2 py-2 text-center font-medium text-gray-500 min-w-[80px]">
                                                {safeFormatDate(date, 'MM/dd')}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {data.map((row, idx) => (
                                        <tr key={idx} className={`hover:bg-gray-50 ${selectedItems.includes(row[rowKey]) ? 'bg-blue-50' : ''}`}>
                                            <td className="px-2 py-1 whitespace-nowrap font-medium text-gray-900 sticky left-0 bg-white border-r">
                                                {row[rowKey]}
                                            </td>
                                            <td className="px-2 py-1 text-right whitespace-nowrap font-bold text-gray-900 sticky left-[120px] bg-gray-50 border-r border-l">
                                                <div className="leading-tight">
                                                    <div>{NUMBER_FORMATTER.format(row.total[valueKey])}</div>
                                                    {secondaryValueKey && (row.total?.[secondaryValueKey] || 0) > 0 && (
                                                        <div className="text-[10px] font-medium text-gray-600">
                                                            {formatCurrency(row.total[secondaryValueKey])}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            {dates.map((date, dIdx) => {
                                                const dateKey = safeFormatDate(date, 'yyyy-MM-dd');
                                                if (!dateKey) return <td key={dIdx}></td>;

                                                const val = row.values[dateKey]?.[valueKey] || 0;
                                                const secVal = secondaryValueKey ? (row.values[dateKey]?.[secondaryValueKey] || 0) : null;

                                                // Heatmap logic
                                                const opacity = maxVal > 0 ? (val / maxVal) * 0.3 : 0;
                                                const bgStyle = val > 0 ? { backgroundColor: `rgba(59, 130, 246, ${opacity})` } : {};

                                                return (
                                                    <td key={dateKey} className="px-2 py-1 text-right whitespace-nowrap" style={bgStyle}>
                                                        <div className={val > 0 ? "font-medium text-gray-900" : "text-gray-300"}>
                                                            {NUMBER_FORMATTER.format(val)}
                                                            {secVal !== null && secVal > 0 && (
                                                                <span className="text-[10px] text-gray-500 ml-1">
                                                                    / {formatCurrency(secVal)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
};

// Integrated Category-Product Pivot Table with Accordion
interface CategoryWithProducts {
    category: string;
    total: {
        quantity: number;
        salesAmount: number;
    };
    products: Array<{
        name: string;
        total: {
            quantity: number;
            salesAmount: number;
        };
    }>;
}

// Server pivot data type
interface ServerPivotItem {
    key: string;
    values: Record<string, { quantity: number; salesAmount: number }>;
    total: { quantity: number; salesAmount: number };
}

const IntegratedPivotTable = ({
    filteredRecords,
    startDate,
    endDate,
    groupBy,
    quantityLabel = '출고량',
    quantityUnit = 'Box',
    salesLabel = '매출액',
    selectedCategory,
    onCategorySelect,
    serverPivotData,
    productNumberMap = new Map(),
}: {
    filteredRecords: OutboundRecordWithBoxes[];
    startDate: string;
    endDate: string;
    groupBy: 'day' | 'week' | 'month' | 'year';
    quantityLabel?: string;
    quantityUnit?: string;
    salesLabel?: string;
    selectedCategory?: string;
    onCategorySelect?: (category: string) => void;
    serverPivotData?: ServerPivotItem[];
    productNumberMap?: Map<string, string>;
}) => {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [tableSearch, setTableSearch] = useState('');
    const [tableSortBy, setTableSortBy] = useState<'sales' | 'quantity'>('sales');

    // 한글 초성 추출 유틸리티
    const getChosung = (str: string) => {
        const cho = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
        let result = "";
        for(let i=0; i<str.length; i++) {
            const code = str.charCodeAt(i) - 44032;
            if(code > -1 && code < 11172) result += cho[Math.floor(code / 588)];
            else result += str.charAt(i);
        }
        return result;
    };

    // 검색어 매칭 여부 판별 함수
    const isProductMatch = (productName: string) => {
        if (!tableSearch.trim()) return true;
        const term = tableSearch.toLowerCase().trim();
        const termChosung = getChosung(term);
        
        const prodNo = productNumberMap.get(productName) || '';
        const matchName = productName.toLowerCase().includes(term) || getChosung(productName).includes(termChosung);
        const matchNo = prodNo.toLowerCase().includes(term);
        return matchName || matchNo;
    };

    // 날짜 간격 계산
    const diffDays = useMemo(() => {
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        if (!isValid(start) || !isValid(end)) return 0;
        return Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    }, [startDate, endDate]);

    // Generate date columns based on groupBy
    const dateColumns = useMemo(() => {
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        if (!isValid(start) || !isValid(end)) return [];

        const columns: Array<{ key: string; label: string; date: Date }> = [];

        if (groupBy === 'day') {
            // 일별: 각 날짜
            const days = eachDayOfInterval({ start, end });
            days.forEach(day => {
                columns.push({
                    key: format(day, 'yyyy-MM-dd'),
                    label: format(day, 'MM/dd'),
                    date: day
                });
            });
        } else if (groupBy === 'week') {
            // 주별: 매주 월요일
            const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
            weeks.forEach((weekStart, index) => {
                const weekEnd = addDays(weekStart, 6);
                // Adjust week end to not exceed period end
                const adjustedEnd = weekEnd > end ? end : weekEnd;
                columns.push({
                    key: format(weekStart, 'yyyy-MM-dd'),
                    label: `${format(weekStart, 'MM/dd')}-${format(adjustedEnd, 'MM/dd')}`,
                    date: weekStart
                });
            });
        } else if (groupBy === 'month') {
            // 월별: 각 월
            let current = startOfMonth(start);
            const endMonth = startOfMonth(end);
            while (current <= endMonth) {
                columns.push({
                    key: format(current, 'yyyy-MM'),
                    label: format(current, 'yyyy.MM'),
                    date: current
                });
                current = endOfMonth(addDays(current, 32)); // Next month
                current = startOfMonth(current);
            }
        } else if (groupBy === 'year') {
            // 년별: 각 년도
            let current = startOfYear(start);
            const endYear = startOfYear(end);
            while (current <= endYear) {
                columns.push({
                    key: format(current, 'yyyy'),
                    label: format(current, 'yyyy년'),
                    date: current
                });
                current = startOfYear(addYears(current, 1));
            }
        }

        return [...columns].reverse();
    }, [startDate, endDate, groupBy]);

    // Aggregate data by category and date column
    const pivotData = useMemo(() => {
        // Category-level data: category -> dateKey -> { quantity, salesAmount }
        const categoryData = new Map<string, Map<string, { quantity: number; salesAmount: number }>>();

        // Product-level data: category -> product -> dateKey -> { quantity, salesAmount }
        const productData = new Map<string, Map<string, Map<string, { quantity: number; salesAmount: number }>>>();

        // Use server pivot data if available (for month/week grouping with large date ranges)
        if (serverPivotData && serverPivotData.length > 0) {
            // Process server pivot data for categories
            serverPivotData.forEach(item => {
                const category = item.key || '미분류';
                categoryData.set(category, new Map());

                // Initialize all date columns
                dateColumns.forEach(col => {
                    categoryData.get(category)!.set(col.key, { quantity: 0, salesAmount: 0 });
                });

                // Fill in values from server data
                if (item.values) {
                    Object.entries(item.values).forEach(([dateKey, value]) => {
                        categoryData.get(category)!.set(dateKey, {
                            quantity: value.quantity || 0,
                            salesAmount: value.salesAmount || 0
                        });
                    });
                }
            });

            // Calculate column totals from server data
            const columnTotals = new Map<string, { quantity: number; salesAmount: number }>();
            dateColumns.forEach(col => {
                let totalQty = 0;
                let totalSales = 0;
                categoryData.forEach(catData => {
                    const cellData = catData.get(col.key);
                    if (cellData) {
                        totalQty += cellData.quantity;
                        totalSales += cellData.salesAmount;
                    }
                });
                columnTotals.set(col.key, { quantity: totalQty, salesAmount: totalSales });
            });

            // Calculate category totals from server data
            const categoryTotals = new Map<string, { quantity: number; salesAmount: number }>();
            serverPivotData.forEach(item => {
                const category = item.key || '미분류';
                categoryTotals.set(category, {
                    quantity: item.total?.quantity || 0,
                    salesAmount: item.total?.salesAmount || 0
                });
            });

            // Client-side product aggregation (since server only provides category data)
            const productTotals = new Map<string, Map<string, { quantity: number; salesAmount: number }>>();
            const productsByCategory = new Map<string, Set<string>>();

            // Get unique products per category from filtered records
            filteredRecords.forEach(r => {
                const category = r.category || '미분류';
                const product = r.productName || '미분류';
                if (!productsByCategory.has(category)) {
                    productsByCategory.set(category, new Set());
                }
                productsByCategory.get(category)!.add(product);
            });

            // Initialize and aggregate product data
            productsByCategory.forEach((products, category) => {
                productData.set(category, new Map());
                productTotals.set(category, new Map());

                products.forEach(product => {
                    productData.get(category)!.set(product, new Map());
                    dateColumns.forEach(col => {
                        productData.get(category)!.get(product)!.set(col.key, { quantity: 0, salesAmount: 0 });
                    });

                    // Aggregate data for this product
                    const prodTotalQty = { quantity: 0, salesAmount: 0 };
                    filteredRecords.forEach(record => {
                        if (record.category === category && record.productName === product) {
                            const recordDate = parseISO(record.outboundDate || record.inboundDate || '');
                            if (!isValid(recordDate)) return;

                            const qty = record.boxQuantity ?? record.quantity ?? 0;
                            const sales = record.salesAmount ?? 0;

                            let dateKey = '';
                            if (groupBy === 'day') {
                                dateKey = format(recordDate, 'yyyy-MM-dd');
                            } else if (groupBy === 'week') {
                                const weekStart = startOfWeek(recordDate, { weekStartsOn: 1 });
                                dateKey = format(weekStart, 'yyyy-MM-dd');
                            } else if (groupBy === 'month') {
                                dateKey = format(recordDate, 'yyyy-MM');
                            } else if (groupBy === 'year') {
                                dateKey = format(recordDate, 'yyyy');
                            }

                            // Update product cell data
                            const prodMap = productData.get(category);
                            if (prodMap) {
                                const cellData = prodMap.get(product);
                                if (cellData && cellData.has(dateKey)) {
                                    cellData.get(dateKey)!.quantity += qty;
                                    cellData.get(dateKey)!.salesAmount += sales;
                                }
                            }

                            prodTotalQty.quantity += qty;
                            prodTotalQty.salesAmount += sales;
                        }
                    });

                    productTotals.get(category)!.set(product, { ...prodTotalQty });
                });
            });

            return { categoryData, productData, columnTotals, categoryTotals, productTotals };
        }

        // Client-side aggregation (original logic)
        // Get all unique categories
        const categories = new Set<string>();
        const productsByCategory = new Map<string, Set<string>>();

        filteredRecords.forEach(r => {
            const category = r.category || '미분류';
            const product = r.productName || '미분류';
            categories.add(category);
            if (!productsByCategory.has(category)) {
                productsByCategory.set(category, new Set());
            }
            productsByCategory.get(category)!.add(product);
        });

        // Initialize category data
        categories.forEach(category => {
            categoryData.set(category, new Map());
            dateColumns.forEach(col => {
                categoryData.get(category)!.set(col.key, { quantity: 0, salesAmount: 0 });
            });

            // Initialize product data for this category
            productData.set(category, new Map());
            productsByCategory.get(category)!.forEach(product => {
                productData.get(category)!.set(product, new Map());
                dateColumns.forEach(col => {
                    productData.get(category)!.get(product)!.set(col.key, { quantity: 0, salesAmount: 0 });
                });
            });
        });

        // Aggregate records by category and product
        filteredRecords.forEach(record => {
            const category = record.category || '미분류';
            const product = record.productName || '미분류';
            const recordDate = parseISO(record.outboundDate || record.inboundDate || '');
            if (!isValid(recordDate)) return;

            const qty = record.boxQuantity ?? record.quantity ?? 0;
            const sales = record.salesAmount ?? 0;

            let dateKey = '';
            if (groupBy === 'day') {
                dateKey = format(recordDate, 'yyyy-MM-dd');
            } else if (groupBy === 'week') {
                const weekStart = startOfWeek(recordDate, { weekStartsOn: 1 });
                dateKey = format(weekStart, 'yyyy-MM-dd');
            } else if (groupBy === 'month') {
                dateKey = format(recordDate, 'yyyy-MM');
            } else if (groupBy === 'year') {
                dateKey = format(recordDate, 'yyyy');
            }

            // Aggregate at category level
            const catData = categoryData.get(category);
            if (catData) {
                const cellData = catData.get(dateKey);
                if (cellData) {
                    cellData.quantity += qty;
                    cellData.salesAmount += sales;
                }
            }

            // Aggregate at product level
            const prodMap = productData.get(category);
            if (prodMap) {
                const prodData = prodMap.get(product);
                if (prodData) {
                    const cellData = prodData.get(dateKey);
                    if (cellData) {
                        cellData.quantity += qty;
                        cellData.salesAmount += sales;
                    }
                }
            }
        });

        // Calculate totals per column
        const columnTotals = new Map<string, { quantity: number; salesAmount: number }>();
        dateColumns.forEach(col => {
            let totalQty = 0;
            let totalSales = 0;
            categoryData.forEach(catData => {
                const cellData = catData.get(col.key);
                if (cellData) {
                    totalQty += cellData.quantity;
                    totalSales += cellData.salesAmount;
                }
            });
            columnTotals.set(col.key, { quantity: totalQty, salesAmount: totalSales });
        });

        // Calculate category totals
        const categoryTotals = new Map<string, { quantity: number; salesAmount: number }>();
        categoryData.forEach((catData, category) => {
            let totalQty = 0;
            let totalSales = 0;
            catData.forEach(cellData => {
                totalQty += cellData.quantity;
                totalSales += cellData.salesAmount;
            });
            categoryTotals.set(category, { quantity: totalQty, salesAmount: totalSales });
        });

        // Calculate product totals (for sorting)
        const productTotals = new Map<string, Map<string, { quantity: number; salesAmount: number }>>();
        productData.forEach((prodMap, category) => {
            productTotals.set(category, new Map());
            prodMap.forEach((dateMap, product) => {
                let totalQty = 0;
                let totalSales = 0;
                dateMap.forEach(cellData => {
                    totalQty += cellData.quantity;
                    totalSales += cellData.salesAmount;
                });
                productTotals.get(category)!.set(product, { quantity: totalQty, salesAmount: totalSales });
            });
        });

        return { categoryData, productData, columnTotals, categoryTotals, productTotals };
    }, [filteredRecords, dateColumns, groupBy, serverPivotData]);

    // 검색어 입력 시, 검색 결과가 있는 카테고리는 자동으로 펼쳐주기
    useEffect(() => {
        if (tableSearch.trim() && pivotData?.productTotals) {
            const autoExpand = new Set<string>();
            pivotData.productTotals.forEach((prodMap, category) => {
                const hasMatch = Array.from(prodMap.keys()).some(isProductMatch);
                if (hasMatch) {
                    autoExpand.add(category);
                }
            });
            setExpandedCategories(autoExpand);
        }
    }, [tableSearch, pivotData?.productTotals]);

    const toggleCategory = (category: string) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    };

    // Calculate overall totals
    const grandTotalQuantity = Array.from(pivotData.columnTotals.values()).reduce((sum, v) => sum + v.quantity, 0);
    const grandTotalSales = Array.from(pivotData.columnTotals.values()).reduce((sum, v) => sum + v.salesAmount, 0);

    // Sort categories by sales or quantity
    const sortedCategories = useMemo(() => {
        const categories = Array.from(pivotData.categoryTotals.entries());
        categories.sort((a, b) => {
            if (tableSortBy === 'sales') {
                return b[1].salesAmount - a[1].salesAmount;
            } else {
                return b[1].quantity - a[1].quantity;
            }
        });
        return categories;
    }, [pivotData.categoryTotals, tableSortBy]);

    // 검색어 필터링을 반영한 카테고리 목록
    const filteredSortedCategories = useMemo(() => {
        if (!tableSearch.trim()) return sortedCategories;
        return sortedCategories.filter(([category, _]) => {
            const prodMap = pivotData.productTotals.get(category);
            if (!prodMap) return false;
            return Array.from(prodMap.keys()).some(isProductMatch);
        });
    }, [sortedCategories, pivotData.productTotals, tableSearch]);

    // 각 카테고리별 매칭된 품목 목록 가공 및 정렬
    const matchedProducts = useMemo(() => {
        const productsMap = new Map<string, Array<[string, { quantity: number; salesAmount: number }]>>();
        
        pivotData.productTotals.forEach((prodMap, category) => {
            let prods = Array.from(prodMap.entries());
            
            if (tableSearch.trim()) {
                prods = prods.filter(([productName, _]) => isProductMatch(productName));
            }
            
            // 품목 정렬 적용
            prods.sort((a, b) => {
                if (tableSortBy === 'sales') {
                    return b[1].salesAmount - a[1].salesAmount;
                } else {
                    return b[1].quantity - a[1].quantity;
                }
            });
            
            productsMap.set(category, prods);
        });
        
        return productsMap;
    }, [pivotData.productTotals, tableSearch, tableSortBy]);

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="py-3 px-4 border-b bg-gray-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    📦 통합 기간 합계 테이블
                    <span className="text-xs font-normal text-gray-500">
                        ({groupBy === 'day' ? '일별' : groupBy === 'week' ? '주별' : groupBy === 'month' ? '월별' : groupBy === 'year' ? '년별' : '월별'})
                    </span>
                </CardTitle>
                
                {/* 실시간 초성/품목번호 매칭 상세 품목 검색바 */}
                <div className="relative w-full sm:w-[220px]">
                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="품목명, 초성 또는 품목번호 검색"
                        value={tableSearch}
                        onChange={(e) => setTableSearch(e.target.value)}
                        className="w-full pl-8 pr-8 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400 shadow-xs"
                    />
                    {tableSearch && (
                        <button
                            onClick={() => setTableSearch('')}
                            className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 text-xs font-bold px-1"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </CardHeader>
            
            {/* 일별 장기간 피벗 안내 (표시는 유지, 가로 스크롤) */}
            {diffDays > 120 && groupBy === 'day' && (
                <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 text-[11px] text-amber-800 flex items-center gap-1.5 font-medium">
                    <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>일별 열이 {diffDays}개입니다. 가로로 스크롤해 확인하거나, 주별/월별 집계를 권장합니다.</span>
                </div>
            )}
            
            <div className="flex-1 overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <div className="inline-block min-w-full align-middle">
                        <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
                            <table className="min-w-full divide-y divide-gray-200 border-collapse text-xs">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 border-r min-w-[150px] z-20">
                                            분류
                                        </th>
                                        <th 
                                            className="px-2 py-2 text-right font-medium text-gray-500 min-w-[110px] bg-gray-50 cursor-pointer hover:bg-gray-100 select-none transition-colors"
                                            onClick={() => setTableSortBy(prev => prev === 'sales' ? 'quantity' : 'sales')}
                                            title="클릭 시 정렬 기준 변경 (매출액 / 출고량)"
                                        >
                                            <div className="flex items-center justify-end gap-1">
                                                <span>합계 ({tableSortBy === 'sales' ? '매출액순' : '출고량순'})</span>
                                                <ArrowUpDown className="w-3 h-3 text-gray-400" />
                                            </div>
                                        </th>
                                        {dateColumns.map(col => (
                                            <th key={col.key} className="px-2 py-2 text-center font-medium text-gray-500 min-w-[80px] whitespace-nowrap">
                                                {col.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {/* Grand Total Row */}
                                    <tr className="bg-blue-50 font-bold">
                                        <td className="px-2 py-2 whitespace-nowrap sticky left-0 bg-blue-50 border-r z-20">
                                            📊 전체 합계
                                        </td>
                                        <td className="px-2 py-2 text-right whitespace-nowrap text-blue-900 font-bold bg-blue-50">
                                            <div>{NUMBER_FORMATTER.format(grandTotalQuantity)}</div>
                                            <div className="text-[10px]">{formatCurrency(grandTotalSales)}</div>
                                        </td>
                                        {dateColumns.map(col => {
                                            const total = pivotData.columnTotals.get(col.key);
                                            return (
                                                <td key={col.key} className="px-2 py-2 text-center whitespace-nowrap text-blue-900">
                                                    <div className="text-[10px]">{NUMBER_FORMATTER.format(total?.quantity || 0)}</div>
                                                    <div className="text-[9px] text-gray-600">
                                                        {(total?.salesAmount || 0) > 0
                                                            ? formatCurrency(total.salesAmount).replace('₩', '').trim()
                                                            : '-'}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* Category Rows */}
                                    {filteredSortedCategories.map(([category, totals]) => {
                                        const isExpanded = expandedCategories.has(category);
                                        const isSelected = selectedCategory === category;
                                        const share = grandTotalSales > 0 ? (totals.salesAmount / grandTotalSales) * 100 : 0;

                                        // Get matched and sorted products for this category
                                        const sortedProducts = matchedProducts.get(category) || [];

                                        return (
                                            <React.Fragment key={`cat-${category}`}>
                                                {/* Category Row */}
                                                <tr className={`hover:bg-gray-50 ${isExpanded ? 'bg-gray-100' : ''} ${isSelected ? 'bg-blue-100' : ''}`}>
                                                    <td className="px-2 py-2 whitespace-nowrap font-medium sticky left-0 bg-white border-r z-10">
                                                        <div className="flex items-center gap-1">
                                                            {/* Toggle Arrow */}
                                                            <span
                                                                className={`transform transition-transform cursor-pointer hover:text-blue-600 text-gray-400 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                                                                onClick={() => toggleCategory(category)}
                                                            >
                                                                ▼
                                                            </span>
                                                            <span className={isExpanded ? '📂' : '📁'} />
                                                            <span
                                                                className={`cursor-pointer hover:text-blue-600 ${isSelected ? 'text-blue-700 font-bold' : ''}`}
                                                                onClick={() => onCategorySelect?.(category)}
                                                            >
                                                                {category}
                                                            </span>
                                                            <span className="text-gray-400 text-[10px] ml-1">({share.toFixed(1)}%)</span>
                                                            {isSelected && <span className="text-blue-600 font-bold">✓</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-2 py-2 text-right whitespace-nowrap font-bold text-gray-900 bg-white">
                                                        <div>{NUMBER_FORMATTER.format(totals.quantity)}</div>
                                                        <div className="text-[10px] text-gray-600">{formatCurrency(totals.salesAmount)}</div>
                                                    </td>
                                                    {dateColumns.map(col => {
                                                        const catData = pivotData.categoryData.get(category);
                                                        const cellData = catData?.get(col.key);
                                                        return (
                                                            <td key={col.key} className="px-2 py-2 text-center whitespace-nowrap text-gray-700">
                                                                <div className="text-[10px]">{cellData ? NUMBER_FORMATTER.format(cellData.quantity) : '-'}</div>
                                                                <div className="text-[9px] text-gray-500">
                                                                    {cellData && cellData.salesAmount > 0
                                                                        ? formatCurrency(cellData.salesAmount).replace('₩', '').trim()
                                                                        : '-'}
                                                                </div>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>

                                                {/* Product Rows (when expanded) */}
                                                {isExpanded && sortedProducts.map(([productName, prodTotals]) => {
                                                    const prodShare = totals.salesAmount > 0
                                                        ? (prodTotals.salesAmount / totals.salesAmount) * 100
                                                        : 0;

                                                    return (
                                                        <tr key={`prod-${category}-${productName}`} className="hover:bg-blue-50 bg-gray-50/50">
                                                            <td className="px-2 py-1 whitespace-nowrap sticky left-0 bg-gray-50/80 border-r z-10 pl-6">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-gray-400 text-[10px]">📦</span>
                                                                    {/* 제품 번호: 가독성 높은 모노스페이스 그레이 배지 스타일 */}
                                                                    <span className="inline-flex items-center bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border border-gray-200/80 shadow-xs">
                                                                        {productNumberMap.get(productName) || "미지정"}
                                                                    </span>
                                                                    {/* 제품명: 진한 글씨로 확실히 강조 및 줄바꿈 차단 */}
                                                                    <span className="text-gray-800 font-semibold text-[11px] truncate max-w-[200px]" title={productName}>
                                                                        {productName}
                                                                    </span>
                                                                    {/* 비중(점유율) 표시 */}
                                                                    <span className="text-gray-400 text-[9px] font-normal">({prodShare.toFixed(1)}%)</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-1 text-right whitespace-nowrap text-gray-700 bg-gray-50/80">
                                                                <div className="text-[9px]">{NUMBER_FORMATTER.format(prodTotals.quantity)}</div>
                                                                <div className="text-[8px] text-gray-500">{formatCurrency(prodTotals.salesAmount)}</div>
                                                            </td>
                                                            {dateColumns.map(col => {
                                                                const prodMap = pivotData.productData.get(category);
                                                                const prodData = prodMap?.get(productName);
                                                                const cellData = prodData?.get(col.key);
                                                                return (
                                                                    <td key={col.key} className="px-2 py-1 text-center whitespace-nowrap text-gray-600">
                                                                        <div className="text-[9px]">{cellData ? NUMBER_FORMATTER.format(cellData.quantity) : '-'}</div>
                                                                        <div className="text-[8px] text-gray-400">
                                                                            {cellData && cellData.salesAmount > 0
                                                                                ? formatCurrency(cellData.salesAmount).replace('₩', '').trim()
                                                                                : '-'}
                                                                        </div>
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
};

// KPI Card
const KPICard = ({ title, value, subValue, icon: Icon, colorClass }: any) => (
    <Card>
        <CardContent className="p-6 flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
                <h3 className="text-2xl font-bold">{value}</h3>
                {subValue && <p className="text-xs text-muted-foreground mt-1">{subValue}</p>}
            </div>
            <div className={`p-3 rounded-full ${colorClass} bg-opacity-10`}>
                <Icon className={`w-6 h-6 ${colorClass.replace('bg-', 'text-')}`} />
            </div>
        </CardContent>
    </Card>
);

// Custom Tooltip with Growth Rate
const CustomTrendTooltip = ({ active, payload, label, totalSales, totalQty }: {
    active?: boolean;
    payload?: any[];
    label?: string;
    totalSales: number;
    totalQty: number;
}) => {
    if (!active || !payload || !payload.length) return null;

    const currentData = payload[0]?.payload;
    if (!currentData) return null;

    const currentSales = Number(currentData.sales || 0);
    const currentQty = Number(currentData.quantity || 0);
    const salesTrend = currentData.salesTrend != null ? Number(currentData.salesTrend) : null;
    const prevYearSales = currentData.prevYearSales != null ? Number(currentData.prevYearSales) : null;
    const prevYearQty = currentData.prevYearQuantity != null ? Number(currentData.prevYearQuantity) : null;

    const formatCurrency = (value: number) => {
        if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
        if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
        return value.toLocaleString();
    };

    // 표 행 정의: 색상 + 라벨 + 값 (+ 옵션 증감률)
    type Row = { dot: string; dashed?: boolean; label: string; value: string; delta?: number | null };
    const rows: Row[] = [
        { dot: '#2563EB', label: '출고량(Box)', value: `${currentQty.toLocaleString()}` },
        { dot: '#F97316', label: '매출액', value: `${formatCurrency(currentSales)}` },
    ];
    if (salesTrend != null) {
        rows.push({ dot: '#EF4444', dashed: true, label: '매출 추세선', value: formatCurrency(salesTrend) });
    }
    if (prevYearSales != null) {
        const delta = prevYearSales > 0 ? ((currentSales - prevYearSales) / prevYearSales) * 100 : null;
        const prevLabel = currentData.prevYearDate ? `전년 매출(${String(currentData.prevYearDate).slice(5)})` : '전년 매출액';
        rows.push({ dot: '#A855F7', dashed: true, label: prevLabel, value: formatCurrency(prevYearSales), delta });
    }
    if (prevYearQty != null) {
        const delta = prevYearQty > 0 ? ((currentQty - prevYearQty) / prevYearQty) * 100 : null;
        const prevLabel = currentData.prevYearDate ? `전년 출고(${String(currentData.prevYearDate).slice(5)})` : '전년 출고량';
        rows.push({ dot: '#22C55E', dashed: true, label: prevLabel, value: prevYearQty.toLocaleString(), delta });
    }

    const isEst = Boolean(currentData.isEstimated || currentData.hasEstimated);

    return (
        <div className="bg-black/80 backdrop-blur-sm rounded-lg shadow-xl p-3 min-w-[200px] text-white border border-white/10">
            {isEst && (
                <div className="mb-1.5 text-[10px] font-semibold text-amber-300 tracking-wide">
                    ⚠ 예측 보정{currentData.isEstimated ? " (해당 기간 실적 없음·앞뒤 평균)" : " 포함"}
                </div>
            )}
            {/* 날짜 헤더 */}
            <div className="text-xs font-semibold text-white/90 mb-2 pb-2 border-b border-white/15">
                {currentData.fullDate || label}
            </div>
            {/* 표 형태: 각 시리즈 = 한 행 (색상점 + 라벨 | 값) */}
            <div className="flex flex-col gap-1.5">
                {rows.map((row, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <span
                                className={row.dashed ? "inline-block w-3" : "inline-block w-2.5 h-2.5 rounded-full"}
                                style={row.dashed
                                    ? { borderTop: `2px dashed ${row.dot}`, height: 0 }
                                    : { backgroundColor: row.dot }}
                            />
                            <span className="text-white/80">{row.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{row.value}</span>
                            {row.delta != null && (
                                <span className={row.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                    {row.delta >= 0 ? '▲' : '▼'}{Math.abs(row.delta).toFixed(1)}%
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Main Component ---
interface OutboundDashboardUnifiedProps {
    dataSource?: 'vf' | 'fc';
    activeTab?: string;
}

/** VF 출고 실데이터 시작일 (확인된 최초 일자) */
const VF_DATA_FLOOR = "2022-02-02";
/** 6개월 이상이면 일별 집계 비활성 → 주별 */
const DAY_AGG_MAX_DAYS = 183;

/** 기간 프리셋 → start/end (YYYY-MM-dd). meta는 'all'용 earliest/latest */
function getPresetDateRange(
    preset: string,
    meta?: { earliestDate?: string | null; latestDate?: string | null } | null
): { start: string; end: string } | null {
    const today = new Date();
    const yesterday = subDays(today, 1);
    let start = yesterday;
    let end = yesterday;

    switch (preset) {
        case "yesterday":
            start = yesterday;
            end = yesterday;
            break;
        case "dayBefore":
            start = subDays(today, 2);
            end = subDays(today, 2);
            break;
        case "1week":
            start = subDays(yesterday, 6);
            end = yesterday;
            break;
        case "2weeks":
            start = subDays(yesterday, 13);
            end = yesterday;
            break;
        case "1month":
            start = subMonths(yesterday, 1);
            end = yesterday;
            break;
        case "6months":
            start = subMonths(yesterday, 6);
            end = yesterday;
            break;
        case "1year":
            start = subYears(yesterday, 1);
            end = yesterday;
            break;
        case "2year":
            start = subYears(yesterday, 2);
            end = yesterday;
            break;
        case "3year":
            start = subYears(yesterday, 3);
            end = yesterday;
            break;
        case "all": {
            // 데이터 있는 기간: 시작 = max(실데이터 최초, meta earliest), 끝 = meta latest(데이터 최신일)
            const floor = parseISO(VF_DATA_FLOOR);
            start = isValid(floor) ? floor : subYears(yesterday, 4);
            end = yesterday;

            if (meta?.earliestDate) {
                const e = parseISO(String(meta.earliestDate).slice(0, 10));
                // 2022-02-02 이상·유효한 일자만 반영 (이상 연도 제외)
                if (isValid(e) && e.getFullYear() >= 2022) {
                    // 실제 최초가 floor보다 뒤면 그 날짜, 이전이면 floor
                    start = e.getTime() > floor.getTime() ? e : floor;
                }
            }
            if (meta?.latestDate) {
                const l = parseISO(String(meta.latestDate).slice(0, 10));
                // 데이터 최신일 사용 (어제보다 과거여도 최신 실적일 우선)
                if (isValid(l) && l.getFullYear() >= 2022 && l.getFullYear() <= 2100) {
                    end = l;
                }
            }
            if (start.getTime() > end.getTime()) {
                start = end;
            }
            break;
        }
        default:
            return null;
    }
    return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
}

export default function OutboundDashboardUnified({ dataSource = 'vf', activeTab }: OutboundDashboardUnifiedProps = {}) {
    const getApiPrefix = () => dataSource === 'fc' ? '/api/fc-inbound' : '/api/outbound';
    const labels = getDataLabels(dataSource);

    // Default: VF 2주 프리셋 + 일별 / FC 1년 프리셋 + 월별
    // periodMode: preset=날짜 직접 수정 전(프리셋 우선), manual=사용자가 날짜 칸을 직접 설정
    const isFC = dataSource === 'fc';
    const defaultPreset = isFC ? "1year" : "2weeks";
    const initialRange = getPresetDateRange(defaultPreset) || {
        start: format(subDays(subDays(new Date(), 1), 13), "yyyy-MM-dd"),
        end: format(subDays(new Date(), 1), "yyyy-MM-dd"),
    };
    const [startDate, setStartDate] = useState(initialRange.start);
    const [endDate, setEndDate] = useState(initialRange.end);
    const [periodMode, setPeriodMode] = useState<"preset" | "manual">("preset");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    // FC: month mode, VF: day mode (auto switches based on period when mode=auto)
    const [groupByMode, setGroupByMode] = useState<'auto' | 'day' | 'week' | 'month' | 'year'>(() => isFC ? 'month' : 'day');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedLogisticsCenter, setSelectedLogisticsCenter] = useState<string[]>([]);  // 다중 선택
    const [selectedRangePreset, setSelectedRangePreset] = useState<string>(defaultPreset);
    const [productNumberMap, setProductNumberMap] = useState<Map<string, string>>(new Map());
    /** 분류별 비중: 1년前 기본, true면 2·3년前 컬럼 추가 */
    const [showMultiYearCompare, setShowMultiYearCompare] = useState(false);
    /** null=한 줄 2패널 / trend|share=선택 패널만 전체 확대 (비중+전년 통합 표) */
    const [expandedCategoryPanel, setExpandedCategoryPanel] = useState<null | 'trend' | 'share'>(null);
    const expandedPanelRef = useRef<HTMLDivElement | null>(null);

    // 추세/분류 패널 확대 중: 패널 밖 클릭 시 원복
    useEffect(() => {
        if (!expandedCategoryPanel) return;
        const onDown = (e: MouseEvent) => {
            const el = expandedPanelRef.current;
            if (el && !el.contains(e.target as Node)) {
                setExpandedCategoryPanel(null);
            }
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [expandedCategoryPanel]);

    useEffect(() => {
        const fetchProductNumbers = async () => {
            try {
                const res = await fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vRPjO9qxLlACh8vfMLlrSoRZlVMtkuuKLxd7HH-XAZFW-f9QGrSsdckK5p_pmHDss4CVgLbZDqQjgFh/pub?gid=626478017&single=true&output=csv");
                const text = await res.text();
                const lines = text.split("\n");
                if (lines.length < 2) return;
                const map = new Map<string, string>();
                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].split(",");
                    if (cols.length >= 7) {
                        const productNumber = cols[1].trim();
                        const productName = cols[5].trim();
                        if (productName && productNumber) map.set(productName, productNumber);
                    }
                }
                setProductNumberMap(map);
            } catch (err) {
                console.error("Failed to load product number CSV:", err);
            }
        };
        fetchProductNumbers();
    }, []);

    // 데이터 기간 메타 (전체 프리셋용) — VF only
    const { data: dateMeta } = useQuery<{ earliestDate?: string | null; latestDate?: string | null } | null>({
        queryKey: ["/api/outbound/meta", dataSource],
        queryFn: async () => {
            if (dataSource !== "vf") return null;
            const res = await fetch("/api/outbound/meta");
            if (!res.ok) return null;
            return res.json();
        },
        staleTime: 5 * 60_000,
    });

    // dataSource가 변경될 때 필터 초기화 (VF/FC 독립적인 필터링)
    useEffect(() => {
        const fc = dataSource === "fc";
        const preset = fc ? "1year" : "2weeks";
        const range = getPresetDateRange(preset);
        setSelectedCategories([]);
        setSelectedCategory("all");
        setSelectedProduct(null);
        setSelectedProducts([]);
        setSearchQuery("");
        setSearchInput("");
        setSelectedLogisticsCenter([]);
        setPeriodMode("preset");
        setSelectedRangePreset(preset);
        setGroupByMode(fc ? "month" : "day");
        if (range) {
            setStartDate(range.start);
            setEndDate(range.end);
        }
    }, [dataSource]);

    // 필터 초기화 함수 (기본 설정으로 복원)
    const resetFilters = useCallback(() => {
        const fc = dataSource === "fc";
        const preset = fc ? "1year" : "2weeks";
        const range = getPresetDateRange(preset, dateMeta);
        setSelectedCategories([]);
        setSelectedCategory("all");
        setSelectedProduct(null);
        setSelectedProducts([]);
        setSearchQuery("");
        setSearchInput("");
        setSelectedLogisticsCenter([]);
        setPeriodMode("preset");
        setSelectedRangePreset(preset);
        setGroupByMode(fc ? "month" : "day");
        if (range) {
            setStartDate(range.start);
            setEndDate(range.end);
        }
    }, [dataSource, dateMeta]);

    // 프리셋 모드 + '전체': meta 도착 후 earliest~latest 재적용
    useEffect(() => {
        if (periodMode !== "preset" || selectedRangePreset !== "all") return;
        const range = getPresetDateRange("all", dateMeta);
        if (!range) return;
        setStartDate(range.start);
        setEndDate(range.end);
    }, [dateMeta, periodMode, selectedRangePreset]);

    const rangeDays = useMemo(() => {
        try {
            const start = parseISO(startDate);
            const end = parseISO(endDate);
            if (!isValid(start) || !isValid(end)) return 0;
            const diffTime = Math.abs(end.getTime() - start.getTime());
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } catch {
            return 0;
        }
    }, [startDate, endDate]);

    const selectedPieCategory = useMemo(() => {
        if (selectedCategory === '__others__') return '기타';
        if (selectedCategory && selectedCategory !== 'all') return selectedCategory;
        return null;
    }, [selectedCategory]);

    const handleCategoryToggle = useCallback((category: string) => {
        const normalized = String(category || '').trim();
        if (!normalized) return;
        setSelectedCategories(prev => {
            if (prev.includes(normalized)) {
                return prev.filter(c => c !== normalized);
            }
            return [...prev, normalized];
        });
        setSelectedCategory('all');
        setSelectedProduct(null);
    }, []);

    // 검색어 debounce (최소 2글자, 300ms 지연)

    // 프리셋 선택: periodMode=preset 으로 전환 후 날짜 동기화
    const handleQuickDateChange = (value: string) => {
        const range = getPresetDateRange(value, dateMeta);
        if (!range) return;
        setPeriodMode("preset");
        setSelectedRangePreset(value);
        setStartDate(range.start);
        setEndDate(range.end);
        // 6개월 이상 기간 → 일별 불가, 주별로 전환
        try {
            const s = parseISO(range.start);
            const e = parseISO(range.end);
            const days = Math.ceil(Math.abs(e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
            if (days >= DAY_AGG_MAX_DAYS && (groupByMode === "day" || groupByMode === "auto")) {
                setGroupByMode("week");
            }
        } catch {
            /* ignore */
        }
    };

    // 날짜 칸 직접 수정 → 수동 모드 (프리셋 라벨 해제)
    const handleManualStartDate = (value: string) => {
        if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            setStartDate(value);
            setPeriodMode("manual");
            setSelectedRangePreset("");
        }
    };
    const handleManualEndDate = (value: string) => {
        if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            setEndDate(value);
            setPeriodMode("manual");
            setSelectedRangePreset("");
        }
    };

    /** 6개월(약 183일) 이상이면 일별 집계 불가 */
    const dayAggregationBlocked = rangeDays >= DAY_AGG_MAX_DAYS;

    // 기간이 6개월+ 인데 일별이 선택돼 있으면 주별로 강제
    useEffect(() => {
        if (dayAggregationBlocked && groupByMode === "day") {
            setGroupByMode("week");
        }
    }, [dayAggregationBlocked, groupByMode]);

    // 집계 단위: 6개월 이상이면 일별 불가 → 주별
    // auto는 기간에 따라 권장 단위
    const groupBy = useMemo(() => {
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 0;
        const noDay = diffDays >= DAY_AGG_MAX_DAYS;

        if (groupByMode !== "auto") {
            // 일별 선택해도 6개월+ 이면 주별
            if (groupByMode === "day" && noDay) return "week";
            return groupByMode;
        }

        // auto: 6개월+ 일 불가 / ≤60일 일 / ≤1년 주 / ≤3년 월 / 그 이상 년
        if (diffDays > 1095) return "year";
        if (diffDays > 365) return "month";
        if (noDay || diffDays > 60) return "week";
        return "day";
    }, [startDate, endDate, groupByMode]);

    /** 일별 피벗 열이 과도할 때만 soft 제한 (그래프는 제한 없음) */
    const PIVOT_DAY_SOFT_MAX = 120;
    const pivotDayHeavy = groupBy === "day" && rangeDays > PIVOT_DAY_SOFT_MAX;

    // Fetch Aggregated Stats (Fast)
    const { data: outboundStats, isLoading: isStatsLoading, isError: isStatsError, error: statsError } = useQuery({
        queryKey: [getApiPrefix() + '/stats', startDate, endDate, selectedCategory, selectedCategories, searchQuery, selectedProduct, selectedLogisticsCenter, groupBy],
        queryFn: async () => {
            const params = new URLSearchParams({
                start: startDate,
                end: endDate,
                category: selectedCategory,
                search: searchQuery,
                groupBy,
                ...(selectedProduct ? { product: selectedProduct } : {}),
                ...(dataSource === 'fc' && selectedLogisticsCenter.length > 0 ? { logistics_center: selectedLogisticsCenter.join(',') } : {}),
            });
            const res = await fetch(`${getApiPrefix()}/stats?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch stats');
            return res.json();
        }
    });

    // 전년 동기간 분류 집계 (별도 조회 — prevYears 누락/캐시 이슈 대비, category=all로 전 분류 맵 확보)
    const fetchYoyStats = useCallback(async (yearsBack: number) => {
        const params = new URLSearchParams({
            start: shiftIsoYear(startDate, yearsBack),
            end: shiftIsoYear(endDate, yearsBack),
            category: 'all',
            search: searchQuery || '',
            groupBy: 'day',
            ...(selectedProduct ? { product: selectedProduct } : {}),
        });
        const res = await fetch(`${getApiPrefix()}/stats?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch yoy stats');
        return res.json();
    }, [startDate, endDate, searchQuery, selectedProduct, dataSource]);

    const { data: yoyStats1, isFetching: isYoy1Fetching } = useQuery({
        queryKey: [getApiPrefix() + '/stats-yoy', 1, startDate, endDate, searchQuery, selectedProduct, dataSource],
        queryFn: () => fetchYoyStats(1),
        enabled: (dataSource === 'vf' || dataSource === 'fc') && !!startDate && !!endDate,
        staleTime: 60_000,
    });
    const { data: yoyStats2 } = useQuery({
        queryKey: [getApiPrefix() + '/stats-yoy', 2, startDate, endDate, searchQuery, selectedProduct, dataSource],
        queryFn: () => fetchYoyStats(2),
        enabled: (dataSource === 'vf' || dataSource === 'fc') && showMultiYearCompare && !!startDate && !!endDate,
        staleTime: 60_000,
    });
    const { data: yoyStats3 } = useQuery({
        queryKey: [getApiPrefix() + '/stats-yoy', 3, startDate, endDate, searchQuery, selectedProduct, dataSource],
        queryFn: () => fetchYoyStats(3),
        enabled: (dataSource === 'vf' || dataSource === 'fc') && showMultiYearCompare && !!startDate && !!endDate,
        staleTime: 60_000,
    });

    /** 분류 행 클릭 시 하위 품목 드릴다운 (기타/전체 제외) */
    const drillCategory =
        selectedCategory && selectedCategory !== 'all' && selectedCategory !== '__others__'
            ? selectedCategory
            : null;

    const fetchCategoryProducts = useCallback(
        async (start: string, end: string, category: string) => {
            const params = new URLSearchParams({
                start,
                end,
                category,
                search: searchQuery || '',
                limit: '80',
            });
            const res = await fetch(`${getApiPrefix()}/top-products?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch category products');
            const json = await res.json();
            return Array.isArray(json) ? json : [];
        },
        [searchQuery, dataSource]
    );

    const { data: catProductsCurrent = [], isFetching: isCatProductsFetching } = useQuery<any[]>({
        queryKey: [getApiPrefix() + '/cat-products', drillCategory, startDate, endDate, searchQuery, dataSource],
        queryFn: () => fetchCategoryProducts(startDate, endDate, drillCategory!),
        enabled: !!drillCategory && !!startDate && !!endDate,
        staleTime: 60_000,
    });

    const { data: catProductsYoy1 = [] } = useQuery<any[]>({
        queryKey: [getApiPrefix() + '/cat-products-yoy', 1, drillCategory, startDate, endDate, searchQuery, dataSource],
        queryFn: () =>
            fetchCategoryProducts(shiftIsoYear(startDate, 1), shiftIsoYear(endDate, 1), drillCategory!),
        enabled: dataSource === 'vf' && !!drillCategory && !!startDate && !!endDate,
        staleTime: 60_000,
    });

    const { data: catProductsYoy2 = [] } = useQuery<any[]>({
        queryKey: [getApiPrefix() + '/cat-products-yoy', 2, drillCategory, startDate, endDate, searchQuery, dataSource],
        queryFn: () =>
            fetchCategoryProducts(shiftIsoYear(startDate, 2), shiftIsoYear(endDate, 2), drillCategory!),
        enabled: dataSource === 'vf' && showMultiYearCompare && !!drillCategory && !!startDate && !!endDate,
        staleTime: 60_000,
    });

    const { data: catProductsYoy3 = [] } = useQuery<any[]>({
        queryKey: [getApiPrefix() + '/cat-products-yoy', 3, drillCategory, startDate, endDate, searchQuery, dataSource],
        queryFn: () =>
            fetchCategoryProducts(shiftIsoYear(startDate, 3), shiftIsoYear(endDate, 3), drillCategory!),
        enabled: dataSource === 'vf' && showMultiYearCompare && !!drillCategory && !!startDate && !!endDate,
        staleTime: 60_000,
    });

    /** 선택 분류 하위 품목 + 전년 동기 증감 */
    const categoryProductDrilldown = useMemo(() => {
        if (!drillCategory) return [] as Array<{
            name: string;
            sales: number;
            qty: number;
            sharePct: number;
            prevYears: Record<string, { salesAmount: number; quantity: number } | null>;
        }>;

        const toMap = (rows: any[]) => {
            const m = new Map<string, { salesAmount: number; quantity: number }>();
            for (const r of rows || []) {
                const name = String(r.name ?? r.product_name ?? r.productName ?? '').trim();
                if (!name) continue;
                m.set(name, {
                    salesAmount: Number(r.salesAmount ?? r.sales_amount ?? 0),
                    quantity: Number(r.quantity ?? r.qty ?? 0),
                });
            }
            return m;
        };

        const yoyMaps: Record<string, Map<string, { salesAmount: number; quantity: number }>> = {
            '1': toMap(catProductsYoy1),
            '2': toMap(catProductsYoy2),
            '3': toMap(catProductsYoy3),
        };

        const cur = [...(catProductsCurrent || [])]
            .map((r: any) => ({
                name: String(r.name ?? r.product_name ?? r.productName ?? '').trim(),
                sales: Number(r.salesAmount ?? r.sales_amount ?? 0),
                qty: Number(r.quantity ?? r.qty ?? 0),
            }))
            .filter((r) => r.name)
            .sort((a, b) => b.sales - a.sales);

        const totalSalesCat = cur.reduce((s, r) => s + r.sales, 0) || 1;

        return cur.slice(0, 40).map((r) => {
            const prevYears: Record<string, { salesAmount: number; quantity: number } | null> = {};
            for (const y of ['1', '2', '3'] as const) {
                const p = yoyMaps[y]?.get(r.name);
                prevYears[y] = p && (p.salesAmount > 0 || p.quantity > 0) ? p : null;
            }
            return {
                name: r.name,
                sales: r.sales,
                qty: r.qty,
                sharePct: (r.sales / totalSalesCat) * 100,
                prevYears,
            };
        });
    }, [drillCategory, catProductsCurrent, catProductsYoy1, catProductsYoy2, catProductsYoy3]);

    const { data: outboundTopProducts = [] } = useQuery<any[]>({
        queryKey: [getApiPrefix() + '/top-products', startDate, endDate, selectedCategory, selectedCategories, searchQuery, selectedProduct, selectedLogisticsCenter],
        queryFn: async () => {
            const params = new URLSearchParams({
                start: startDate,
                end: endDate,
                category: selectedCategory,
                search: searchQuery,
                limit: '200',
                ...(selectedProduct ? { product: selectedProduct } : {}),
                ...(dataSource === 'fc' && selectedLogisticsCenter.length > 0 ? { logistics_center: selectedLogisticsCenter.join(',') } : {}),
            });
            const res = await fetch(`${getApiPrefix()}/top-products?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch top products');
            const json = await res.json();
            return Array.isArray(json) ? json : [];
        },
        enabled: !isStatsLoading,
        staleTime: 60_000,
    });

    // 피벗·기간 테이블: 선택 집계 단위로 항상 표시 (일별 장기간은 가로 스크롤 + 경고 배너)
    const canShowDailyPivot = true;

    const { data: categoryPivotServer = [] } = useQuery<any[]>({
        queryKey: [getApiPrefix() + '/pivot', 'category', startDate, endDate, selectedCategory, selectedCategories, searchQuery, selectedProduct, selectedLogisticsCenter, groupBy],
        queryFn: async () => {
            const params = new URLSearchParams({
                row: 'category',
                groupBy: groupBy,
                start: startDate,
                end: endDate,
                category: selectedCategory,
                search: searchQuery,
                limit: '200',
                ...(selectedProduct ? { product: selectedProduct } : {}),
                ...(dataSource === 'fc' && selectedLogisticsCenter.length > 0 ? { logistics_center: selectedLogisticsCenter.join(',') } : {}),
            });
            const res = await fetch(`${getApiPrefix()}/pivot?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch category pivot');
            const json = await res.json();
            return Array.isArray(json) ? json : [];
        },
        enabled: !isStatsLoading,
        staleTime: 60_000,
    });

    const { data: productPivotServer = [] } = useQuery<any[]>({
        queryKey: [getApiPrefix() + '/pivot', 'product', startDate, endDate, selectedCategory, selectedCategories, searchQuery, selectedProduct, selectedLogisticsCenter, groupBy],
        queryFn: async () => {
            const params = new URLSearchParams({
                row: 'product',
                groupBy: groupBy,
                start: startDate,
                end: endDate,
                category: selectedCategory,
                search: searchQuery,
                limit: '100',
                ...(selectedProduct ? { product: selectedProduct } : {}),
                ...(dataSource === 'fc' && selectedLogisticsCenter.length > 0 ? { logistics_center: selectedLogisticsCenter.join(',') } : {}),
            });
            const res = await fetch(`${getApiPrefix()}/pivot?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch product pivot');
            const json = await res.json();
            return Array.isArray(json) ? json : [];
        },
        enabled: !isStatsLoading,
        staleTime: 60_000,
    });

    // Fetch Records (Limited for Performance) — KPI/추이 본선은 /stats 집계 사용
    const RECORDS_FETCH_LIMIT = 10000;
    const { data: outboundRecords = [], isLoading: isRecordsLoading, isError: isRecordsError, error: recordsError } = useQuery<OutboundRecordWithBoxes[]>({
        queryKey: [getApiPrefix(), startDate, endDate], // Records fetch is independent of grouping
        queryFn: async () => {
            const params = new URLSearchParams({ start: startDate, end: endDate, limit: String(RECORDS_FETCH_LIMIT) });
            const res = await fetch(`${getApiPrefix()}?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch data');
            const raw = await res.json();
            if (!Array.isArray(raw)) return [];
            return raw.map(normalizeOutboundRecord);
        },
    });
    const recordsPossiblyTruncated = outboundRecords.length >= RECORDS_FETCH_LIMIT;

    const isLoading = isStatsLoading || isRecordsLoading;

    // 자동완성용 품목 카탈로그 (기간 내 출고 + 마스터 맵)
    const uniqueProductNames = useMemo(() => {
        const productNames = new Set<string>();
        outboundRecords.forEach(record => {
            if (record.productName && record.productName.trim()) {
                productNames.add(record.productName.trim());
            }
        });
        // 구글시트 마스터 품명도 후보에 포함 (기간 외 품목 검색용)
        productNumberMap.forEach((_no, name) => {
            if (name && name.trim()) productNames.add(name.trim());
        });
        outboundTopProducts.forEach((p: any) => {
            const n = String(p?.name || p?.productName || p?.product_name || "").trim();
            if (n) productNames.add(n);
        });
        return Array.from(productNames).sort((a, b) => a.localeCompare(b, "ko"));
    }, [outboundRecords, productNumberMap, outboundTopProducts]);

    // Extract unique logistics centers (FC only) - VF67 최상단
    const uniqueLogisticsCenters = useMemo(() => {
        if (dataSource !== 'fc') return [];
        const centers = new Set<string>();
        outboundRecords.forEach(record => {
            const center = record.logisticsCenter;
            if (center && center.trim()) {
                centers.add(center.trim());
            }
        });
        const sorted = Array.from(centers).sort();
        // VF67을 최상단으로 이동
        const vf67Index = sorted.indexOf('VF67');
        if (vf67Index > -1) {
            sorted.splice(vf67Index, 1);
            sorted.unshift('VF67');
        }
        return sorted;
    }, [outboundRecords, dataSource]);

    /** 검색어 정규화: 공백 정리 + 흔한 오탈자 */
    const normalizeSearchText = (s: string) =>
        s
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim()
            // 각투스/칵터스 → 칵투스 등 유사 입력
            .replace(/각투스/g, "칵투스")
            .replace(/칵터스/g, "칵투스")
            .replace(/cactus/g, "칵투스");

    /** 품명 내 검색 토큰 하이라이트 (정규화 매칭 포함) */
    const highlightProductMatch = (name: string, query: string): React.ReactNode => {
        const tokens = normalizeSearchText(query).split(" ").filter((t) => t.length > 0);
        if (tokens.length === 0) return name;

        // 표시 문자열에서 찾을 후보 (원문 변형 포함)
        const variantsFor = (token: string): string[] => {
            const set = new Set<string>([token]);
            if (token === "칵투스") {
                set.add("각투스");
                set.add("칵터스");
                set.add("cactus");
            }
            return Array.from(set);
        };

        const ranges: Array<[number, number]> = [];
        const lower = name.toLowerCase();
        for (const token of tokens) {
            for (const v of variantsFor(token)) {
                let from = 0;
                while (from < lower.length) {
                    const idx = lower.indexOf(v, from);
                    if (idx < 0) break;
                    ranges.push([idx, idx + v.length]);
                    from = idx + v.length;
                }
            }
        }
        if (ranges.length === 0) return name;

        ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const merged: Array<[number, number]> = [];
        for (const r of ranges) {
            const last = merged[merged.length - 1];
            if (last && r[0] <= last[1]) {
                last[1] = Math.max(last[1], r[1]);
            } else {
                merged.push([r[0], r[1]]);
            }
        }

        const nodes: React.ReactNode[] = [];
        let cursor = 0;
        merged.forEach(([start, end], i) => {
            if (cursor < start) nodes.push(name.slice(cursor, start));
            nodes.push(
                <mark key={`h-${i}-${start}`} className="bg-amber-200/80 text-inherit rounded-sm px-0.5">
                    {name.slice(start, end)}
                </mark>
            );
            cursor = end;
        });
        if (cursor < name.length) nodes.push(name.slice(cursor));
        return <>{nodes}</>;
    };

    // 부분 단어 포함 매칭 (예: "비누", "칵투스" → 관련 품목 목록 롤링)
    // "보노하우스 칵투스 커버형 비누 받침대" ← "비누" 또는 "칵투스" 또는 "커버 비누"
    const filteredProductNames = useMemo(() => {
        if (!searchInput || searchInput.trim().length < 1) return [] as string[];
        const raw = normalizeSearchText(searchInput);
        // 공백 기준 토큰 AND 매칭 ("커버 비누" → 둘 다 포함)
        const tokens = raw.split(" ").filter((t) => t.length > 0);
        if (tokens.length === 0) return [];

        const scored: Array<{ name: string; score: number }> = [];
        for (const name of uniqueProductNames) {
            const n = normalizeSearchText(name);
            // 모든 토큰이 품명에 포함되어야 함 (부분 일치)
            if (!tokens.every((t) => n.includes(t))) continue;

            // 관련도: 전체 구문 일치 > 앞쪽 매칭 > 짧은 이름
            let score = 0;
            if (n.includes(raw)) score += 100;
            const firstIdx = n.indexOf(tokens[0]);
            score += Math.max(0, 50 - firstIdx);
            score += Math.max(0, 30 - Math.min(name.length, 30));
            // 토큰이 연속으로 가까우면 가산
            if (tokens.length > 1) {
                const joined = tokens.join("");
                if (n.replace(/\s/g, "").includes(joined)) score += 40;
            }
            // 정확히 그 단어로 시작하는 경우 가산
            if (tokens.some((t) => n.startsWith(t) || n.includes(` ${t}`))) score += 15;
            scored.push({ name, score });
        }
        scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "ko"));
        return scored.slice(0, 40).map((s) => s.name);
    }, [uniqueProductNames, searchInput]);

    // Handle autocomplete selection → 품목 선택 시 그래프/필터 연동
    const handleAutocompleteSelect = (productName: string) => {
        setSearchInput(productName);
        setSearchQuery(""); // 부분검색 해제, 품목 정확 매칭으로 전환
        setSelectedProduct(productName);
        setShowAutocomplete(false);
        setHighlightedIndex(-1);
        requestAnimationFrame(() => {
            document.getElementById("outbound-trend-chart")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
        });
    };

    // Handle input focus and blur
    const handleInputFocus = () => {
        if (searchInput.trim().length >= 1) {
            setShowAutocomplete(true);
        }
    };

    const handleInputBlur = () => {
        // Delay to allow click on autocomplete item
        setTimeout(() => {
            setShowAutocomplete(false);
            setHighlightedIndex(-1);
        }, 200);
    };

    // Handle keyboard navigation in autocomplete
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && filteredProductNames[highlightedIndex]) {
                handleAutocompleteSelect(filteredProductNames[highlightedIndex]);
            } else if (filteredProductNames.length === 1) {
                handleAutocompleteSelect(filteredProductNames[0]);
            } else if (filteredProductNames.length > 0) {
                // 목록이 있으면 첫 항목 선택하지 않고 부분검색으로 필터
                setSearchQuery(searchInput.trim());
                setSelectedProduct(null);
                setShowAutocomplete(true);
            } else {
                setSearchQuery(searchInput.trim());
                setSelectedProduct(null);
                setShowAutocomplete(false);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setShowAutocomplete(true);
            setHighlightedIndex(prev =>
                prev < filteredProductNames.length - 1 ? prev + 1 : prev
            );
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        } else if (e.key === 'Escape') {
            setShowAutocomplete(false);
            setHighlightedIndex(-1);
        }
    };

    // Extract Categories
    const categories = useMemo(() => {
        const cats = new Set<string>();
        if (outboundStats?.categoryBreakdown && Array.isArray(outboundStats.categoryBreakdown)) {
            outboundStats.categoryBreakdown.forEach((c: any) => {
                const name = String(c?.category || '').trim();
                if (name) cats.add(name);
            });
        }
        if (cats.size === 0) {
            outboundRecords.forEach((r) => {
                if (r.category) cats.add(r.category);
            });
        }
        return Array.from(cats).sort();
    }, [outboundRecords, outboundStats]);

    // Process Data
    const processedData = useMemo(() => {

        // Data not ready yet? Return null to show loading state
        if (isStatsLoading || !outboundStats) {
                return null;
        }

        // 0. Generate Dates Array based on Range (일별 피벗 열용 — 전 기간 생성)
        let dates: Date[] = [];
        let diffDays = 0;
        try {
            const start = parseISO(startDate);
            const end = parseISO(endDate);

            if (!isValid(start) || !isValid(end)) {
                dates = [];
            } else {
                const diffTime = Math.abs(end.getTime() - start.getTime());
                diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                // 선택 기간 전 일 생성 (장기간은 피벗 가로 스크롤로 대응)
                dates = eachDayOfInterval({ start, end }).filter(d => !isSameDay(d, new Date()));
            }
        } catch {
            dates = [];
            diffDays = 0;
        }

        const normalizeCategoryKey = (value: string) => value.trim();

        // 1. Filter Records (Client-side)
        const filteredBase = outboundRecords.filter(r => {
            const matchSearch = !searchQuery ||
                r.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.category.toLowerCase().includes(searchQuery.toLowerCase());
            const matchProduct = !selectedProduct || r.productName === selectedProduct;
            const matchLogisticsCenter = selectedLogisticsCenter.length === 0 ||
                selectedLogisticsCenter.includes(r.logisticsCenter || '');
            return matchSearch && matchProduct && matchLogisticsCenter;
        });

        const topCategories = new Set(
            Array.from(
                filteredBase
                    .reduce((acc: Map<string, number>, r) => {
                        const key = normalizeCategoryKey(String(r.category || ''));
                        if (!key) return acc;
                        const prev = acc.get(key) || 0;
                        acc.set(key, prev + (r.salesAmount ?? 0));
                        return acc;
                    }, new Map<string, number>())
                    .entries()
            )
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([cat]) => cat)
        );

        // Check if all records have empty categories (FC inbound case)
        const allCategoriesEmpty = filteredBase.length > 0 &&
            filteredBase.every(r => !r.category || r.category.trim() === '');

        const matchesCategorySelection = (rawCategory: string) => {
            const key = normalizeCategoryKey(rawCategory || '');

            // Handle FC inbound case: if all categories are empty, allow them when 'all' is selected
            if (allCategoriesEmpty && !key) {
                return selectedCategory === 'all' || selectedCategory === '';
            }

            if (!key) return false;
            if (selectedCategories.length > 0) {
                return selectedCategories.includes(key);
            }
            if (selectedCategory === 'all') return true;
            if (selectedCategory === '__others__') {
                return !topCategories.has(key);
            }
            return key === normalizeCategoryKey(selectedCategory || '');
        };

        const filtered = filteredBase.filter(r => matchesCategorySelection(String(r.category || '')));

        const hasMultiCategorySelection = selectedCategories.length > 0;

        const aggregateRecords = (records: OutboundRecordWithBoxes[], mode: 'day' | 'week' | 'month' | 'year') => {
            const map = new Map<string, {
                fullDate: string;
                date: string;
                sales: number;
                quantity: number;
                realCount: number;
                estCount: number;
                isEstimated?: boolean;
                hasEstimated?: boolean;
            }>();
            records.forEach(record => {
                const rawDate = record.outboundDate;
                const parsed = rawDate ? parseISO(String(rawDate)) : null;
                if (!parsed || !isValid(parsed)) return;
                let keyDate = parsed;
                if (mode === 'week') keyDate = startOfWeek(parsed, { weekStartsOn: 1 });
                else if (mode === 'month') keyDate = startOfMonth(parsed);
                else if (mode === 'year') keyDate = startOfYear(parsed);

                let key: string;
                let label: string;
                if (mode === 'month') {
                    key = format(keyDate, 'yyyy-MM-dd');
                    label = format(keyDate, 'yyyy.MM');
                } else if (mode === 'week') {
                    key = format(keyDate, 'yyyy-MM-dd');
                    label = format(keyDate, 'MM/dd') + '-' + format(addDays(keyDate, 6), 'MM/dd');
                } else if (mode === 'year') {
                    key = format(keyDate, 'yyyy-MM-dd');
                    label = format(keyDate, 'yyyy');
                } else {
                    key = format(keyDate, 'yyyy-MM-dd');
                    label = format(parsed, 'MM/dd');
                }

                const entry = map.get(key) || {
                    fullDate: key,
                    date: label,
                    sales: 0,
                    quantity: 0,
                    realCount: 0,
                    estCount: 0,
                };
                entry.sales += Number(record.salesAmount ?? 0);
                const qty = record.boxQuantity ?? record.quantity ?? 0;
                entry.quantity += Number(qty);
                const isEst = Boolean(
                    (record as any).isEstimated ?? (record as any).is_estimated
                );
                if (isEst) entry.estCount += 1;
                else entry.realCount += 1;
                map.set(key, entry);
            });
            return Array.from(map.values())
                .map((e) => ({
                    fullDate: e.fullDate,
                    date: e.date,
                    sales: e.sales,
                    quantity: e.quantity,
                    isEstimated: e.estCount > 0 && e.realCount === 0,
                    hasEstimated: e.estCount > 0 && e.realCount > 0,
                }))
                .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
        };

        let dailyTrend = hasMultiCategorySelection
            ? aggregateRecords(filtered, groupBy as 'day' | 'week' | 'month' | 'year')
            : (outboundStats.dailyTrend ? outboundStats.dailyTrend.map((d: any) => {
                try {
                    const raw = String(d.date || '');
                    let dateDisplay = raw;
                    if (groupBy === 'day' && raw.length >= 10) {
                        dateDisplay = raw.substring(5).replace('-', '/');
                    } else if (groupBy === 'week' && raw.length >= 10) {
                        const ws = parseISO(raw.slice(0, 10));
                        dateDisplay = isValid(ws)
                            ? `${format(ws, 'MM/dd')}-${format(addDays(ws, 6), 'MM/dd')}`
                            : raw;
                    } else if (groupBy === 'month' && raw.length >= 7) {
                        dateDisplay = raw.slice(0, 7).replace('-', '.');
                    } else if (groupBy === 'year' && raw.length >= 4) {
                        dateDisplay = raw.slice(0, 4);
                    }
                    return {
                        fullDate: raw.slice(0, 10) || raw,
                        date: dateDisplay,
                        sales: Number(d.salesAmount ?? d.supplyAmount ?? 0),
                        quantity: Number(d.quantity ?? 0),
                        isEstimated: Boolean(d.isEstimated ?? d.is_estimated),
                        hasEstimated: Boolean(d.hasEstimated ?? d.has_estimated),
                    };
                } catch {
                    return { fullDate: '', date: '', sales: 0, quantity: 0 };
                }
            }) : []);

        // 기간 내 빈 버킷을 0으로 채워 그래프·전년 정렬 유지 (일/주/월/년)
        if (startDate && endDate) {
            try {
                const start = parseISO(startDate);
                const end = parseISO(endDate);
                if (isValid(start) && isValid(end)) {
                    type TrendPt = {
                        fullDate: string;
                        date: string;
                        sales: number;
                        quantity: number;
                        isEstimated?: boolean;
                        hasEstimated?: boolean;
                    };
                    const byDate = new Map<string, TrendPt>();
                    for (const d of dailyTrend as TrendPt[]) {
                        if (d?.fullDate) byDate.set(d.fullDate, d);
                        // month keys may be yyyy-MM
                        if (d?.fullDate?.length >= 7) byDate.set(d.fullDate.slice(0, 7), d);
                        if (d?.fullDate?.length >= 4) byDate.set(d.fullDate.slice(0, 4), d);
                    }
                    if (groupBy === "day") {
                        dailyTrend = eachDayOfInterval({ start, end }).map((day) => {
                            const key = format(day, "yyyy-MM-dd");
                            const existing = byDate.get(key);
                            if (existing) return existing;
                            return {
                                fullDate: key,
                                date: format(day, "MM/dd"),
                                sales: 0,
                                quantity: 0,
                                isEstimated: false,
                                hasEstimated: false,
                            };
                        });
                    } else if (groupBy === "week") {
                        // 백엔드 TruncWeek 시작요일이 달라도 월요일 키로 정규화 후 채움
                        type WeekAgg = TrendPt & { _real: number; _est: number };
                        const byWeek = new Map<string, WeekAgg>();
                        for (const d of dailyTrend as TrendPt[]) {
                            const parsed = d.fullDate ? parseISO(String(d.fullDate).slice(0, 10)) : null;
                            if (!parsed || !isValid(parsed)) continue;
                            const wk = format(startOfWeek(parsed, { weekStartsOn: 1 }), "yyyy-MM-dd");
                            const prev = byWeek.get(wk);
                            const isEstOnly = Boolean(d.isEstimated);
                            const hasEst = Boolean(d.hasEstimated);
                            // isEstimated only → est; hasEstimated → both; neither → real
                            const addReal = isEstOnly ? 0 : 1;
                            const addEst = isEstOnly || hasEst ? 1 : 0;
                            if (prev) {
                                prev.sales += Number(d.sales) || 0;
                                prev.quantity += Number(d.quantity) || 0;
                                prev._real += addReal;
                                prev._est += addEst;
                            } else {
                                byWeek.set(wk, {
                                    fullDate: wk,
                                    date: d.date,
                                    sales: Number(d.sales) || 0,
                                    quantity: Number(d.quantity) || 0,
                                    _real: addReal,
                                    _est: addEst,
                                    isEstimated: false,
                                    hasEstimated: false,
                                });
                            }
                        }
                        const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
                        dailyTrend = weeks.map((weekStart) => {
                            const key = format(weekStart, "yyyy-MM-dd");
                            const existing = byWeek.get(key);
                            const weekEnd = addDays(weekStart, 6);
                            const adjustedEnd = weekEnd > end ? end : weekEnd;
                            const label = `${format(weekStart, "MM/dd")}-${format(adjustedEnd, "MM/dd")}`;
                            if (existing) {
                                const isEstimated = existing._est > 0 && existing._real === 0;
                                const hasEstimated = existing._est > 0 && existing._real > 0;
                                return {
                                    fullDate: key,
                                    date: label,
                                    sales: existing.sales,
                                    quantity: existing.quantity,
                                    isEstimated,
                                    hasEstimated,
                                };
                            }
                            return {
                                fullDate: key,
                                date: label,
                                sales: 0,
                                quantity: 0,
                                isEstimated: false,
                                hasEstimated: false,
                            };
                        });
                    } else if (groupBy === "month") {
                        const monthList: Date[] = [];
                        let m = startOfMonth(start);
                        const mEnd = startOfMonth(end);
                        while (m.getTime() <= mEnd.getTime()) {
                            monthList.push(m);
                            m = startOfMonth(addDays(m, 32));
                        }
                        dailyTrend = monthList.map((monthStart) => {
                            const key = format(monthStart, "yyyy-MM");
                            // backend TruncMonth often returns yyyy-MM-dd (1st of month)
                            const keyDay = format(monthStart, "yyyy-MM-dd");
                            const existing = byDate.get(key) || byDate.get(keyDay);
                            if (existing) {
                                return {
                                    ...existing,
                                    fullDate: existing.fullDate || keyDay,
                                    date: format(monthStart, "yyyy.MM"),
                                };
                            }
                            return {
                                fullDate: keyDay,
                                date: format(monthStart, "yyyy.MM"),
                                sales: 0,
                                quantity: 0,
                                isEstimated: false,
                                hasEstimated: false,
                            };
                        });
                    } else if (groupBy === "year") {
                        const years: number[] = [];
                        for (let y = start.getFullYear(); y <= end.getFullYear(); y++) years.push(y);
                        dailyTrend = years.map((y) => {
                            const keyDay = `${y}-01-01`;
                            const existing = byDate.get(keyDay) || byDate.get(String(y));
                            if (existing) {
                                return {
                                    ...existing,
                                    fullDate: existing.fullDate || keyDay,
                                    date: String(y),
                                };
                            }
                            return {
                                fullDate: keyDay,
                                date: String(y),
                                sales: 0,
                                quantity: 0,
                            };
                        });
                    }
                }
            } catch {
                /* keep sparse */
            }
        }

        // 전년 동기: 날짜 키로 매핑 (index 정렬 금지)
        // prevYearTrend 항목 date = 전년 실제 일자 (YYYY-MM-DD)
        const prevYearByDate = new Map<string, { quantity: number; salesAmount: number }>();
        if (!hasMultiCategorySelection && Array.isArray(outboundStats.prevYearTrend)) {
            for (const d of outboundStats.prevYearTrend) {
                const key = String(d?.date || '').slice(0, 10);
                if (!key) continue;
                prevYearByDate.set(key, {
                    quantity: Number(d.quantity ?? 0),
                    salesAmount: Number(d.salesAmount ?? d.supplyAmount ?? 0),
                });
            }
        }

        // 금액(sales) 기준 선형 회귀 추세선 계산 (최소제곡법)
        const salesValues = dailyTrend.map(d => Number(d.sales) || 0);
        const n = salesValues.length;
        let trendValues: number[] = [];
        if (n >= 2) {
            const sumX = salesValues.reduce((s, _, i) => s + i, 0);
            const sumY = salesValues.reduce((s, v) => s + v, 0);
            const sumXY = salesValues.reduce((s, v, i) => s + i * v, 0);
            const sumX2 = salesValues.reduce((s, _, i) => s + i * i, 0);
            const denom = n * sumX2 - sumX * sumX;
            if (denom !== 0) {
                const m = (n * sumXY - sumX * sumY) / denom;
                const b = (sumY - m * sumX) / n;
                trendValues = salesValues.map((_, i) => Math.max(0, m * i + b));
            }
        }

        // Add allTrendData, prevYear(달력 1년 전), trend to each item
        const dailyTrendWithAllData = dailyTrend.map((item, i) => {
            const prevKey = item.fullDate ? shiftIsoYear(item.fullDate, 1) : '';
            const prev = prevKey ? prevYearByDate.get(prevKey) : undefined;
            return {
                ...item,
                allTrendData: dailyTrend,
                salesTrend: trendValues.length > 0 ? Math.round(trendValues[i]) : undefined,
                // 해당 달력일에 전년 실적 없으면 0 (점선이 잘못된 날과 묶이지 않도록)
                prevYearSales: prev ? Number(prev.salesAmount ?? 0) : 0,
                prevYearQuantity: prev ? Number(prev.quantity ?? 0) : 0,
                prevYearDate: prevKey || undefined,
            };
        });

        const totalSales = hasMultiCategorySelection
            ? filtered.reduce((sum, r) => sum + Number(r.salesAmount ?? 0), 0)
            : Number(outboundStats.summary?.totalSalesAmount ?? outboundStats.summary?.totalSupplyAmount ?? 0);
        const totalQty = hasMultiCategorySelection
            ? filtered.reduce((sum, r) => sum + Number(r.boxQuantity ?? r.quantity ?? 0), 0)
            : Number(outboundStats.summary?.totalQuantity ?? 0);

        let avgDailySales = 0;
        if (dailyTrend.length) {
            avgDailySales = totalSales / dailyTrend.length;
        }

        type CatShareRow = {
            name: string;
            value: number;
            quantity: number;
            prevYears?: Record<string, { salesAmount: number; quantity: number } | null>;
        };
        let categoryShare: CatShareRow[] = [];
        let categoryShareFull: CatShareRow[] = []; // 전체 분류 (리스트용)

        // 전년 맵 (모든 경로 공통)
        const yoyMaps: Record<string, Map<string, { salesAmount: number; quantity: number }>> = {
            '1': buildCategoryAmountMap(yoyStats1?.categoryBreakdown),
            '2': buildCategoryAmountMap(yoyStats2?.categoryBreakdown),
            '3': buildCategoryAmountMap(yoyStats3?.categoryBreakdown),
        };
        const attachPrevYears = (name: string, rawPrev?: any): CatShareRow['prevYears'] => {
            const prevYears: NonNullable<CatShareRow['prevYears']> = {};
            const key = catMatchKey(name);
            for (const y of ['1', '2', '3'] as const) {
                const fromFetch =
                    yoyMaps[y]?.get(name) ||
                    yoyMaps[y]?.get(key) ||
                    null;
                let fromEmbed: { salesAmount: number; quantity: number } | null = null;
                if (rawPrev && typeof rawPrev === 'object') {
                    const p = rawPrev[y] ?? rawPrev[Number(y)];
                    if (p != null) {
                        fromEmbed = {
                            salesAmount: Number(p.salesAmount ?? p.sales_amount ?? 0),
                            quantity: Number(p.quantity ?? 0),
                        };
                    }
                }
                const merged = fromFetch || fromEmbed;
                prevYears[y] = merged && (merged.salesAmount > 0 || merged.quantity > 0) ? merged : null;
            }
            return prevYears;
        };

        if (hasMultiCategorySelection) {
            const categoryMap = new Map<string, CatShareRow>();
            filtered.forEach(r => {
                const key = normalizeCategoryKey(String(r.category || ''));
                if (!key) return;
                const entry = categoryMap.get(key) || { name: key, value: 0, quantity: 0 };
                entry.value += Number(r.salesAmount ?? 0);
                entry.quantity += Number(r.boxQuantity ?? r.quantity ?? 0);
                categoryMap.set(key, entry);
            });
            const sortedCategories = Array.from(categoryMap.values())
                .map(c => ({ ...c, prevYears: attachPrevYears(c.name) }))
                .sort((a, b) => b.value - a.value);

            // 상위 8개 + 기타
            const top8 = sortedCategories.slice(0, 8);
            const others = sortedCategories.slice(8).reduce((sum: number, cat) => sum + cat.value, 0);

            categoryShare = [...top8];
            if (others > 0) {
                categoryShare.push({ name: '기타', value: others, quantity: 0 });
            }

            categoryShareFull = sortedCategories;
        } else if (outboundStats?.categoryBreakdown) {
            const serverCats: CatShareRow[] = outboundStats.categoryBreakdown.map((c: any) => {
                const name = String(c.category ?? c.name ?? '').trim();
                return {
                    name,
                    value: Number(c.salesAmount ?? c.sales_amount ?? c.supplyAmount ?? c.supply_amount ?? 0),
                    quantity: Number(c.quantity ?? 0),
                    prevYears: attachPrevYears(name, c.prevYears ?? c.prev_years),
                };
            }).filter((c: CatShareRow) => c.name).sort((a, b) => b.value - a.value);

            // 파이/토글용 상위 8 + 기타 (테이블은 full 사용)
            const top8 = serverCats.slice(0, 8);
            const others = serverCats.slice(8).reduce((sum: number, c) => sum + c.value, 0);
            const othersQty = serverCats.slice(8).reduce((sum: number, c) => sum + c.quantity, 0);

            categoryShare = [...top8];
            if (others > 0) {
                categoryShare.push({ name: '기타', value: others, quantity: othersQty });
            }

            categoryShareFull = serverCats;
        }

// Calculate total quantity for share percentage in top products
        // Note: share uses TOP 30's own total as denominator, not ALL records

        const topProducts = hasMultiCategorySelection
            ? (() => {
                const aggregated = Array.from(
                    filtered.reduce((acc, r) => {
                        const name = String(r.productName || '-');
                        const entry = acc.get(name) || { name, value: 0, sales: 0 };
                        entry.value += Number(r.boxQuantity ?? r.quantity ?? 0);
                        entry.sales += Number(r.salesAmount ?? 0);
                        acc.set(name, entry);
                        return acc;
                    }, new Map<string, { name: string; value: number; sales: number }>())
                        .values()
                )
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 30);
                const totalTop30 = aggregated.reduce((sum, p) => sum + p.value, 0);
                return aggregated.map(p => ({
                    ...p,
                    share: totalTop30 > 0 ? (p.value / totalTop30) * 100 : 0,
                    label: `${NUMBER_FORMATTER.format(p.value)} Box (${(totalTop30 > 0 ? (p.value / totalTop30) * 100 : 0).toFixed(1)}%)`,
                }));
            })()
            : (() => {
                const sorted = (outboundTopProducts || [])
                    .map((r: any) => ({
                        name: String(r?.name || '-'),
                        value: Number(r?.quantity || 0),
                        sales: Number(r?.salesAmount ?? r?.supplyAmount ?? 0),
                    }))
                    .sort((a: any, b: any) => (b.value || 0) - a.value)
                    .slice(0, 30);
                const totalTop30 = sorted.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
                return sorted.map(p => {
                    const share = totalTop30 > 0 ? (p.value / totalTop30) * 100 : 0;
                    return {
                        ...p,
                        share,
                        label: `${NUMBER_FORMATTER.format(p.value)} Box (${share.toFixed(1)}%)`,
                    };
                });
            })();

        const createTotalPivot = (groupByKey: (r: OutboundRecordWithBoxes) => string) => {
            const map = new Map();
            filtered.forEach(r => {
                const key = groupByKey(r);
                if (!map.has(key)) map.set(key, { total: { quantity: 0, salesAmount: 0 } });
                const entry = map.get(key);
                const qty = r.boxQuantity ?? r.quantity ?? 0;
                const sales = r.salesAmount ?? 0;
                entry.total.quantity += qty;
                entry.total.salesAmount += sales;
            });
            return Array.from(map.entries())
                .map(([key, val]) => ({ key, ...val }))
                .sort((a, b) => b.total.salesAmount - a.total.salesAmount);
        };

        const createPivotByRange = (
            records: OutboundRecordWithBoxes[],
            groupByKey: (r: OutboundRecordWithBoxes) => string,
            mode: 'day' | 'week' | 'month' | 'year'
        ) => {
            const map = new Map();
            records.forEach(r => {
                const key = groupByKey(r);
                if (!map.has(key)) {
                    map.set(key, { values: {}, total: { quantity: 0, salesAmount: 0 } });
                }
                const entry = map.get(key);
                const date = r.outboundDate ? parseISO(String(r.outboundDate)) : null;
                if (!date || !isValid(date)) return;

                let dateKey = format(date, 'yyyy-MM-dd');
                if (mode === 'week') {
                    dateKey = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
                } else if (mode === 'month') {
                    dateKey = format(startOfMonth(date), 'yyyy-MM');
                } else if (mode === 'year') {
                    dateKey = format(startOfYear(date), 'yyyy');
                }

                if (!entry.values[dateKey]) {
                    entry.values[dateKey] = { quantity: 0, salesAmount: 0 };
                }

                const qty = r.boxQuantity ?? r.quantity ?? 0;
                const sales = r.salesAmount ?? 0;
                entry.values[dateKey].quantity += qty;
                entry.values[dateKey].salesAmount += sales;
                entry.total.quantity += qty;
                entry.total.salesAmount += sales;
            });

            return Array.from(map.entries())
                .map(([key, val]) => ({ key, ...val }))
                .sort((a, b) => b.total.salesAmount - a.total.salesAmount);
        };

        const categoryPivot = hasMultiCategorySelection
            ? createPivotByRange(filtered, r => r.category, groupBy as 'day' | 'week' | 'month' | 'year')
            : categoryPivotServer;
        const productPivot = hasMultiCategorySelection
            ? createPivotByRange(filtered, r => r.productName, groupBy as 'day' | 'week' | 'month' | 'year')
            : productPivotServer;
        const categoryTotalPivot = createTotalPivot(r => r.category);
        const productTotalPivot = createTotalPivot(r => r.productName);

        const displayDates = (() => {
            const start = parseISO(startDate);
            const end = parseISO(endDate);
            if (!isValid(start) || !isValid(end)) return [] as Date[];
            if (groupBy === "week") {
                return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
            }
            if (groupBy === "month") {
                const monthList: Date[] = [];
                let m = startOfMonth(start);
                const mEnd = startOfMonth(end);
                while (m.getTime() <= mEnd.getTime()) {
                    monthList.push(m);
                    m = startOfMonth(addDays(m, 32));
                }
                return monthList;
            }
            if (groupBy === "year") {
                const years: Date[] = [];
                for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
                    years.push(new Date(y, 0, 1));
                }
                return years;
            }
            return dates;
        })();

        return {
            filtered,
            totalSales,
            totalQty,
            avgDailySales,
            dailyTrend: dailyTrendWithAllData,
            categoryShare,
            categoryShareFull,
            topProducts,
            categoryPivot,
            productPivot,
            dates: displayDates,
            diffDays,
            categoryTotalPivot,
            productTotalPivot,
            summaryStats: {
                totalSales,
                totalQty,
                topCategory: categoryShare[0]?.name || 'N/A'
            }
        };
    }, [outboundRecords, outboundStats, yoyStats1, yoyStats2, yoyStats3, startDate, endDate, selectedCategory, selectedCategories, searchQuery, selectedProduct, selectedLogisticsCenter, groupBy, outboundTopProducts, canShowDailyPivot, categoryPivotServer, productPivotServer]);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

    // Download Handler
    const handleDownload = () => {
        if (!processedData?.filtered) return;

        const headers = ['출고날짜', '제품명', '분류', '바코드', '수량', '박스수량', '판매금액', '매입가(단가)'];
        const csvContent = [
            headers.join(','),
            ...processedData.filtered.map(r => [
                format(new Date(r.outboundDate), 'yyyy-MM-dd'),
                `"${r.productName.replace(/"/g, '""')}"`, // Escape quotes
                r.category,
                r.barcode,
                r.quantity,
                r.boxQuantity,
                r.salesAmount,
                r.purchasePrice ?? ''
            ].join(','))
        ].join('\n');

        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `outbound_data_${startDate}_${endDate}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // React Rules of Hooks 준수를 위해 모든 조건부 리턴(return)보다 위에 useMemo 정의
    const statsSummary = useMemo(() => {
        const dailyTrend = processedData?.dailyTrend;
        if (!dailyTrend || dailyTrend.length === 0) return { peakDay: null, minDay: null, avgSales: 0 };
        
        let peakDay = dailyTrend[0];
        let minDay = null;
        let totalSalesSum = 0;
        let validDays = 0;
        
        dailyTrend.forEach(item => {
            const s = Number(item.sales || 0);
            totalSalesSum += s;
            if (s > 0) {
                validDays++;
                if (!peakDay || s > Number(peakDay.sales || 0)) {
                    peakDay = item;
                }
                if (!minDay || s < Number(minDay.sales || 0)) {
                    minDay = item;
                }
            }
        });

        const avgSales = validDays > 0 ? totalSalesSum / validDays : 0;
        
        return { peakDay, minDay, avgSales };
    }, [processedData?.dailyTrend]);

    if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin w-8 h-8 text-gray-400" /></div>;
    if (isStatsError) {
        return (
            <div className="p-12 text-center text-red-600">
                통계 데이터를 불러오지 못했습니다.
                <div className="text-sm text-muted-foreground mt-2">{String((statsError as any)?.message || statsError || '')}</div>
            </div>
        );
    }
    if (isRecordsError) {
        return (
            <div className="p-12 text-center text-red-600">
                원본 데이터를 불러오지 못했습니다.
                <div className="text-sm text-muted-foreground mt-2">{String((recordsError as any)?.message || recordsError || '')}</div>
            </div>
        );
    }
    if (!processedData) return <div className="p-12 text-center text-gray-500">데이터가 없습니다.</div>;

    const { totalSales, totalQty, avgDailySales, dailyTrend, categoryShare, categoryShareFull, topProducts, categoryPivot, productPivot, dates, summaryStats, categoryTotalPivot, productTotalPivot } = processedData;

    const trendTitle = groupBy === 'day'
        ? '일별 매출 및 출고량 추이'
        : groupBy === 'week'
            ? '주별 매출 및 출고량 추이'
            : groupBy === 'year'
                ? '년별 매출 및 출고량 추이'
                : '월별 매출 및 출고량 추이';

    const trendPointCount = dailyTrend?.length || 0;
    const xAxisInterval =
        trendPointCount > 90
            ? Math.ceil(trendPointCount / 12)
            : trendPointCount > 40
                ? Math.ceil(trendPointCount / 16)
                : 0;

    return (
        <div className="space-y-6 p-2 bg-gray-50/30 min-h-screen">
            {/* FC Inbound Upload Section */}
            {dataSource === 'fc' && <FCInboundUpload onUploadComplete={() => window.location.reload()} />}
            {/* 1. Unified Filter Bar — sticky 틀고정: 본문과 확실히 구분 */}
            <div className="sticky top-0 z-30 -mx-2 px-4 py-3.5 rounded-xl border-2 border-indigo-200/90 bg-gradient-to-r from-indigo-100 via-sky-50 to-violet-100 shadow-[0_8px_28px_-6px_rgba(49,46,129,0.28)] ring-1 ring-indigo-300/50 flex flex-col lg:flex-row gap-4 items-end lg:items-center justify-between before:absolute before:inset-x-0 before:bottom-0 before:h-0.5 before:bg-gradient-to-r before:from-indigo-500 before:via-blue-500 before:to-violet-500 relative">
                <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-500" />

                        {/* 기간 프리셋 (직접 날짜 수정 전 우선) */}
                        <Select
                            value={periodMode === "preset" && selectedRangePreset ? selectedRangePreset : undefined}
                            onValueChange={handleQuickDateChange}
                        >
                            <SelectTrigger className={`w-[150px] bg-white border-indigo-200/80 shadow-sm hover:border-indigo-300 ${periodMode === "manual" ? "opacity-80" : ""}`}>
                                <SelectValue placeholder={periodMode === "manual" ? "수동 기간" : "기간 선택"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="yesterday">어제</SelectItem>
                                <SelectItem value="dayBefore">그제</SelectItem>
                                <SelectItem value="1week">1주일</SelectItem>
                                <SelectItem value="2weeks">2주일</SelectItem>
                                <SelectItem value="1month">1개월</SelectItem>
                                <SelectItem value="6months">6개월</SelectItem>
                                <SelectItem value="1year">1년</SelectItem>
                                <SelectItem value="2year">2년</SelectItem>
                                <SelectItem value="3year">3년</SelectItem>
                                <SelectItem value="all">전체</SelectItem>
                            </SelectContent>
                        </Select>
                        {periodMode === "preset" && selectedRangePreset && (
                            <span className="hidden xl:inline text-[10px] text-indigo-600 font-medium whitespace-nowrap">
                                프리셋
                            </span>
                        )}
                        {periodMode === "manual" && (
                            <span className="hidden xl:inline text-[10px] text-amber-700 font-medium whitespace-nowrap" title="날짜를 직접 설정 중">
                                수동
                            </span>
                        )}

                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-slate-500" />
                            <div className="flex bg-white p-0.5 rounded-lg border border-indigo-200/80 shadow-sm">
                                {[
                                    { value: 'auto', label: '자동' },
                                    { value: 'day', label: '일별' },
                                    { value: 'week', label: '주별' },
                                    { value: 'month', label: '월별' },
                                    { value: 'year', label: '년별' }
                                ].map(opt => {
                                    const dayDisabled = opt.value === "day" && dayAggregationBlocked;
                                    // 일별 강제 주별 전환 시 UI상 주별이 활성처럼 보이도록
                                    const isActive =
                                        !dayDisabled &&
                                        (groupByMode === opt.value ||
                                            (opt.value === "week" && groupBy === "week" && groupByMode === "day" && dayAggregationBlocked));
                                    return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        disabled={dayDisabled}
                                        onClick={() => {
                                            if (dayDisabled) return;
                                            setGroupByMode(opt.value as any);
                                        }}
                                        className={`px-2 py-1.5 md:px-3 md:py-1 text-xs rounded-md font-medium transition-all ${
                                            dayDisabled
                                                ? "text-slate-300 cursor-not-allowed opacity-50"
                                                : isActive
                                                ? "bg-indigo-600 text-white shadow-sm font-semibold"
                                                : "text-slate-600 hover:text-indigo-700 hover:bg-indigo-50"
                                        }`}
                                        title={
                                            dayDisabled
                                                ? "6개월 이상 기간은 일별 불가 · 주별로 표시됩니다"
                                                : opt.value === "auto"
                                                ? "기간 길이에 따라 일/주/월/년 자동"
                                                : `${opt.label} 집계`
                                        }
                                    >
                                        {opt.label}
                                    </button>
                                    );
                                })}
                            </div>
                            {groupByMode === "auto" && (
                                <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                    →{groupBy === "day" ? "일" : groupBy === "week" ? "주" : groupBy === "month" ? "월" : "년"}
                                </span>
                            )}
                            {dayAggregationBlocked && (
                                <span className="text-[10px] text-amber-700 whitespace-nowrap font-medium" title="6개월 이상">
                                    일별 불가
                                </span>
                            )}

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        aria-label="기간·집계 안내"
                                        className="inline-flex items-center justify-center w-7 h-7 rounded-md border bg-white text-indigo-600 hover:bg-indigo-50 border-indigo-200"
                                    >
                                        <HelpCircle className="w-4 h-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" align="start" className="max-w-xs">
                                    <div className="text-xs leading-relaxed space-y-1">
                                        <p><b>프리셋</b>을 고르면 기간이 자동 설정됩니다. 날짜를 직접 바꾸면 <b>수동</b> 모드입니다.</p>
                                        <p><b>전체</b>: 데이터 최초({VF_DATA_FLOOR}) ~ 최신 출고일</p>
                                        <p><b>6개월 이상</b>은 일별 선택 불가 → 주별로 그래프를 그립니다. (월/년은 가능)</p>
                                        <p className="text-slate-500">자동: &lt;6개월·≤60일→일, 그 외 주/월/년</p>
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </div>

                        <input
                            type="date"
                            value={startDate}
                            onChange={e => handleManualStartDate(e.target.value)}
                            className={`border rounded-md px-2 py-1.5 text-sm shadow-sm ${
                                periodMode === "manual"
                                    ? "border-amber-300 bg-amber-50/50"
                                    : "border-indigo-200/80 bg-white"
                            }`}
                            title={periodMode === "preset" ? "수정 시 수동 기간으로 전환" : "수동 시작일"}
                        />
                        <span className="text-indigo-400 font-medium">~
                        </span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => handleManualEndDate(e.target.value)}
                            className={`border rounded-md px-2 py-1.5 text-sm shadow-sm ${
                                periodMode === "manual"
                                    ? "border-amber-300 bg-amber-50/50"
                                    : "border-indigo-200/80 bg-white"
                            }`}
                            title={periodMode === "preset" ? "수정 시 수동 기간으로 전환" : "수동 종료일"}
                        />
                    </div>

                    <div className="flex items-center gap-2 min-w-[180px]">
                            <Select
                                value={selectedCategory}
                                onValueChange={(v) => {
                                    setSelectedCategory(v);
                                    setSelectedCategories([]);
                                    setSelectedProduct(null);
                                }}
                            >
                            <SelectTrigger className="h-9 bg-white border-indigo-200/80 shadow-sm">
                                <SelectValue placeholder="분류 선택" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">전체 분류</SelectItem>
                                <SelectItem value="__others__">기타(상위 10 제외)</SelectItem>
                                {categories.map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 물류 센터 필터 (FC만) - 다중 선택 */}
                    {dataSource === 'fc' && uniqueLogisticsCenters.length > 0 && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-9 min-w-[180px] justify-between">
                                    <span className="truncate">
                                        {selectedLogisticsCenter.length === 0
                                            ? "전체 물류센터"
                                            : selectedLogisticsCenter.length === 1
                                                ? selectedLogisticsCenter[0]
                                                : `${selectedLogisticsCenter.length}개 선택`}
                                    </span>
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[250px] p-3" align="start">
                                <div className="space-y-2">
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="select-all-centers"
                                            checked={selectedLogisticsCenter.length === uniqueLogisticsCenters.length}
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    setSelectedLogisticsCenter(uniqueLogisticsCenters);
                                                } else {
                                                    setSelectedLogisticsCenter([]);
                                                }
                                            }}
                                        />
                                        <label
                                            htmlFor="select-all-centers"
                                            className="text-sm font-medium cursor-pointer flex-1"
                                        >
                                            전체 선택
                                        </label>
                                    </div>
                                    <div className="h-px bg-gray-200" />
                                    <div className="max-h-[300px] overflow-y-auto space-y-1">
                                        {uniqueLogisticsCenters.map((center) => (
                                            <div key={center} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`center-${center}`}
                                                    checked={selectedLogisticsCenter.includes(center)}
                                                    onCheckedChange={(checked) => {
                                                        if (checked) {
                                                            setSelectedLogisticsCenter([...selectedLogisticsCenter, center]);
                                                        } else {
                                                            setSelectedLogisticsCenter(selectedLogisticsCenter.filter(c => c !== center));
                                                        }
                                                    }}
                                                />
                                                <label
                                                    htmlFor={`center-${center}`}
                                                    className="text-sm cursor-pointer flex-1"
                                                >
                                                    {center}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}

                    <div className="relative w-full md:w-[340px] z-40">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400 z-10" />
                        <Input
                            placeholder="일부 단어 검색 (예: 비누, 칵투스)"
                            value={searchInput}
                            onChange={e => {
                                const v = e.target.value;
                                setSearchInput(v);
                                setSelectedProduct(null); // 타이핑 중에는 부분검색 모드
                                if (v.trim().length >= 1) {
                                    setShowAutocomplete(true);
                                } else {
                                    setShowAutocomplete(false);
                                    setSearchQuery("");
                                }
                                setHighlightedIndex(-1);
                            }}
                            onFocus={handleInputFocus}
                            onBlur={handleInputBlur}
                            onKeyDown={handleKeyDown}
                            className="pl-9 pr-8 h-9 text-sm bg-white border-indigo-200/80 shadow-sm"
                            autoComplete="off"
                            aria-autocomplete="list"
                            aria-expanded={showAutocomplete && searchInput.trim().length >= 1}
                        />
                        {searchInput && (
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    setSearchInput("");
                                    setSearchQuery("");
                                    setSelectedProduct(null);
                                    setShowAutocomplete(false);
                                }}
                                className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 z-10"
                                title="검색 지우기"
                            >
                                ✕
                            </button>
                        )}
                        {/* 부분 일치 품목 롤링(드롭다운) — 비누/칵투스 등 일부 단어로 유사 품목 선택 */}
                        {showAutocomplete && searchInput.trim().length >= 1 && (
                            <div
                                className="absolute left-0 right-0 top-full mt-1 min-w-[320px] max-h-72 overflow-y-auto rounded-lg border border-indigo-200 bg-white shadow-xl z-50"
                                onMouseDown={(e) => e.preventDefault()}
                                role="listbox"
                            >
                                {filteredProductNames.length === 0 ? (
                                    <div className="px-3 py-2.5 text-xs text-slate-400 text-center">
                                        &quot;{searchInput.trim()}&quot; 포함 품목 없음
                                        <div className="mt-1 text-[10px] text-slate-300">다른 단어로 검색해 보세요</div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="px-2.5 py-1.5 text-[10px] font-medium text-indigo-600 bg-indigo-50 border-b border-indigo-100 sticky top-0 z-[1]">
                                            &quot;{searchInput.trim()}&quot; 포함 {filteredProductNames.length}개 · 클릭 선택 · ↑↓ Enter
                                        </div>
                                        <ul className="py-1">
                                            {filteredProductNames.map((name, idx) => {
                                                const prodNo = productNumberMap.get(name);
                                                return (
                                                    <li key={name} role="option" aria-selected={idx === highlightedIndex}>
                                                        <button
                                                            type="button"
                                                            className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-indigo-50 transition-colors flex items-start gap-2 ${
                                                                idx === highlightedIndex ? "bg-indigo-100 text-indigo-900" : "text-slate-700"
                                                            } ${selectedProduct === name ? "font-semibold text-indigo-800" : ""}`}
                                                            onClick={() => handleAutocompleteSelect(name)}
                                                            onMouseEnter={() => setHighlightedIndex(idx)}
                                                        >
                                                            <span className="flex-1 min-w-0 leading-snug break-words">
                                                                {highlightProductMatch(name, searchInput)}
                                                            </span>
                                                            {prodNo ? (
                                                                <span className="shrink-0 text-[10px] text-slate-400 font-mono mt-0.5">
                                                                    {prodNo}
                                                                </span>
                                                            ) : null}
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 필터 초기화 버튼 */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={resetFilters}
                        className="h-9 bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-900 shadow-sm"
                        title="필터 초기화 (기본 설정으로 복원)"
                    >
                        🔄 초기화
                    </Button>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleDownload} className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                        <Download className="w-4 h-4 mr-2" />
                        다운로드
                    </Button>
                </div>
            </div>

            {/* 기간·집계 상태 안내 */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 -mt-1">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-indigo-100">
                    기간 {startDate} ~ {endDate}
                    <span className="text-indigo-600 font-medium">
                        ({periodMode === "preset" ? `프리셋·${selectedRangePreset || "-"}` : "수동"} · {rangeDays}일)
                    </span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-indigo-100">
                    집계 <b className="text-indigo-700">{groupBy === "day" ? "일별" : groupBy === "week" ? "주별" : groupBy === "month" ? "월별" : "년별"}</b>
                    {groupByMode === "auto" ? " (자동)" : " (선택)"}
                    · 포인트 {trendPointCount}개
                </span>
                {recordsPossiblyTruncated && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
                        원본 행 {RECORDS_FETCH_LIMIT.toLocaleString()}+건 한도 — KPI/추이는 서버 집계 기준
                    </span>
                )}
                {Number(outboundStats?.summary?.estimatedDays || outboundStats?.estimateMeta?.days || 0) > 0 && (
                    <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 font-medium"
                        title="빠진 일자를 앞·뒤 실적일 품목 평균으로 채움 (status=예측 보정)"
                    >
                        예측 보정 {Number(outboundStats?.summary?.estimatedDays || outboundStats?.estimateMeta?.days || 0)}일
                        · {Number(outboundStats?.summary?.estimatedCount || outboundStats?.estimateMeta?.rows || 0).toLocaleString()}행
                    </span>
                )}
            </div>

            {/* 2. KPI Overview - Z-Layout 기반 (5초 테스트) */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* 1순위: 전체 공급가액 - 가장 강조 */}
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-blue-700 uppercase">전체 공급가액</p>
                                <h3 className="text-xl font-bold text-blue-900">{formatCurrency(totalSales)}</h3>
                                <p className="text-xs text-blue-700 mt-1">일평균 {formatCurrency(avgDailySales)}</p>
                            </div>
                            <DollarSign className="w-8 h-8 text-blue-600 bg-white rounded-full p-1.5" />
                        </div>
                    </CardContent>
                </Card>

                {/* 2순위: 전체 입고량 */}
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-emerald-700 uppercase">전체 {labels.quantityLabel}</p>
                                <h3 className="text-xl font-bold text-emerald-900">{NUMBER_FORMATTER.format(totalQty)} {labels.quantityUnit}</h3>
                                <p className="text-xs text-emerald-700 mt-1">기간 내 누적</p>
                            </div>
                            <Package className="w-8 h-8 text-emerald-600 bg-white rounded-full p-1.5" />
                        </div>
                    </CardContent>
                </Card>

                {/* 3순위: 일평균 */}
                <Card className="bg-gray-50 border border-gray-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-gray-600 uppercase">일평균 {labels.salesLabel}</p>
                                <h3 className="text-xl font-bold text-gray-900">{formatCurrency(avgDailySales)}</h3>
                                <p className="text-xs text-gray-500 mt-1">일별 기준</p>
                            </div>
                            <TrendingUp className="w-8 h-8 text-gray-500 bg-white rounded-full p-1.5" />
                        </div>
                    </CardContent>
                </Card>

                {/* 4순위: 최다 분류 */}
                <Card className="bg-gray-50 border border-gray-200">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-gray-600 uppercase">최다 {labels.quantityLabel} 분류</p>
                                <h3 className="text-xl font-bold text-gray-900">{categoryShare[0]?.name || '-'}</h3>
                                <p className="text-xs text-gray-500 mt-1">{((categoryShare[0]?.value || 0) / totalSales * 100).toFixed(1)}% 비중</p>
                            </div>
                            <Award className="w-8 h-8 text-yellow-600 bg-white rounded-full p-1.5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* 한 줄 2패널: 추세 | 분류 비중+전년 통합 표 — 선택 시 단일 확대 */}
            {(() => {
                const allCats = (categoryShareFull?.length ? categoryShareFull : categoryShare) || [];
                const totalCatCount = allCats.length;
                const exp = expandedCategoryPanel;
                const isTrend = exp === 'trend';
                const isShare = exp === 'share';
                const anyExpanded = exp !== null;
                // 선택 분류가 미리보기 밖이면 목록에 포함해 품목 드릴다운이 보이게 함
                // 스크롤 조회를 지원하기 위해 확대 여부와 무관하게 모든 분류 품목 데이터를 렌더링합니다.
                let shareRows = [...allCats];
                const yearOffsets = showMultiYearCompare ? [1, 2, 3] : [1];
                const yoyRangeLabel = `${shiftIsoYear(startDate, 1)} ~ ${shiftIsoYear(endDate, 1)}`;
                const hasAnyYoy = allCats.some((c: any) => c.prevYears && (c.prevYears['1'] || c.prevYears['2'] || c.prevYears['3']));

                const panelH = anyExpanded ? 'min-h-[560px] h-[min(80vh,720px)]' : 'h-[500px]';

                /** 분류별 당기 비중 + 전년 동기간 비교 통합 표 (+ 선택 시 품목 드릴다운) */
                const colSpan = 4 + yearOffsets.length * 4;
                const renderCategoryShareYoyTable = (rows: any[]) => (
                    <table className="w-full text-[11px] border-collapse">
                        <thead className="sticky top-0 bg-white z-10">
                            <tr className="border-b">
                                <th className="text-left py-1.5 pr-1 text-gray-600 font-medium">분류 / 품목</th>
                                <th className="text-right py-1.5 px-1 text-gray-600 font-medium whitespace-nowrap" title="선택 기간 매출">당기매출</th>
                                <th className="text-right py-1.5 px-1 text-gray-600 font-medium whitespace-nowrap">비중</th>
                                <th className="text-right py-1.5 px-1 text-gray-600 font-medium whitespace-nowrap" title="선택 기간 출고">당기박스</th>
                                {yearOffsets.map((y) => (
                                    <React.Fragment key={`h-${y}`}>
                                        <th className="text-right py-1.5 px-1 text-gray-600 font-medium whitespace-nowrap" title={`${y}년 전 동기간 매출`}>{y}Y매출</th>
                                        <th className="text-right py-1.5 px-1 text-gray-600 font-medium whitespace-nowrap" title={`${y}년 전 동기간 출고`}>{y}Y박스</th>
                                        <th className="text-right py-1.5 px-1 text-gray-600 font-medium whitespace-nowrap" title="(당기매출−전년매출)/전년매출">{y}Y매출%</th>
                                        <th className="text-right py-1.5 px-1 text-gray-600 font-medium whitespace-nowrap" title="(당기박스−전년박스)/전년박스">{y}Y박스%</th>
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((cat: any) => {
                                const isPieSelected = selectedPieCategory === cat.name ||
                                    (selectedPieCategory === '__others__' && cat.name === '기타') ||
                                    (selectedPieCategory === 'all' && cat.name === categoryShare[0]?.name);
                                // 품목 드릴다운: 명시적으로 분류를 선택한 경우만 (all 자동 강조 제외)
                                const isDrillOpen =
                                    drillCategory != null &&
                                    cat.name === drillCategory;
                                const share = totalSales > 0 ? (cat.value / totalSales) * 100 : 0;
                                return (
                                    <React.Fragment key={cat.name}>
                                    <tr
                                        onClick={(e) => {
                                            // 분류/품목 클릭: 드릴다운·필터만 (패널 확대 금지 → 왼쪽 차트와 함께 볼 수 있음)
                                            e.stopPropagation();
                                            if (selectedCategories.length > 0) return;
                                            if (cat.name === '기타') {
                                                const next = selectedCategory === '__others__' ? 'all' : '__others__';
                                                setSelectedCategory(next);
                                                setSelectedProduct(null);
                                                return;
                                            }
                                            const next = selectedCategory === cat.name ? 'all' : cat.name;
                                            setSelectedCategory(next);
                                            setSelectedProduct(null);
                                        }}
                                        className={`border-b cursor-pointer hover:bg-blue-50 transition-colors ${isDrillOpen ? 'bg-blue-100 font-semibold' : isPieSelected && !drillCategory ? 'bg-blue-50/60' : ''}`}
                                        title={cat.name === '기타' ? '기타 분류' : '클릭: 하위 품목 펼치기 · 왼쪽 차트와 함께 확인'}
                                    >
                                        <td className="py-1.5 pr-1 max-w-[9rem] truncate" title={cat.name}>
                                            <span className="inline-flex items-center gap-1">
                                                {cat.name !== '기타' && (
                                                    <span className="text-[10px] text-blue-500 w-3 shrink-0">
                                                        {isDrillOpen ? '▼' : '▶'}
                                                    </span>
                                                )}
                                                {cat.name}
                                            </span>
                                        </td>
                                        <td className="py-1 px-0.5 text-right whitespace-nowrap">{formatCurrency(cat.value)}</td>
                                        <td className="py-1 px-0.5 text-right whitespace-nowrap">{share.toFixed(1)}%</td>
                                        <td className="py-1 px-0.5 text-right whitespace-nowrap">{Number(cat.quantity || 0).toLocaleString()}</td>
                                        {yearOffsets.map((y) => {
                                            const prev = cat.prevYears?.[String(y)];
                                            const hasPrev = prev && (Number(prev.salesAmount) > 0 || Number(prev.quantity) > 0);
                                            const salesPct = hasPrev ? growthPct(cat.value, prev.salesAmount) : null;
                                            const qtyPct = hasPrev ? growthPct(Number(cat.quantity || 0), prev.quantity) : null;
                                            return (
                                                <React.Fragment key={`yoy-${cat.name}-${y}`}>
                                                    <td className="py-1 px-0.5 text-right whitespace-nowrap text-gray-700">
                                                        {hasPrev ? formatCurrency(Number(prev.salesAmount)) : <span className="text-gray-400">N/A</span>}
                                                    </td>
                                                    <td className="py-1 px-0.5 text-right whitespace-nowrap text-gray-700">
                                                        {hasPrev ? Number(prev.quantity || 0).toLocaleString() : <span className="text-gray-400">N/A</span>}
                                                    </td>
                                                    <td className="py-1 px-0.5 text-right whitespace-nowrap"><YoYPctCell pct={salesPct} /></td>
                                                    <td className="py-1 px-0.5 text-right whitespace-nowrap"><YoYPctCell pct={qtyPct} /></td>
                                                </React.Fragment>
                                            );
                                        })}
                                    </tr>
                                    {isDrillOpen && isCatProductsFetching && (
                                        <tr className="bg-slate-50">
                                            <td colSpan={colSpan} className="py-2 pl-6 text-[11px] text-blue-600">
                                                {cat.name} 품목 로딩 중…
                                            </td>
                                        </tr>
                                    )}
                                    {isDrillOpen && !isCatProductsFetching && categoryProductDrilldown.length === 0 && (
                                        <tr className="bg-slate-50">
                                            <td colSpan={colSpan} className="py-2 pl-6 text-[11px] text-gray-400">
                                                하위 품목 데이터 없음
                                            </td>
                                        </tr>
                                    )}
                                    {isDrillOpen && categoryProductDrilldown.map((p) => {
                                        const isProdSel = selectedProduct === p.name;
                                        return (
                                            <tr
                                                key={`${cat.name}::${p.name}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedProduct(isProdSel ? null : p.name);
                                                }}
                                                className={`border-b border-slate-100 cursor-pointer hover:bg-indigo-50/80 ${isProdSel ? 'bg-indigo-100' : 'bg-slate-50/90'}`}
                                                title="클릭: 이 품목으로 필터"
                                            >
                                                <td className="py-1 pr-1 pl-5 max-w-[12rem] truncate text-slate-700 font-normal" title={p.name}>
                                                    <span className="text-slate-400 mr-1">└</span>
                                                    {p.name}
                                                </td>
                                                <td className="py-1 px-0.5 text-right whitespace-nowrap font-normal">{formatCurrency(p.sales)}</td>
                                                <td className="py-1 px-0.5 text-right whitespace-nowrap text-slate-500 font-normal">{p.sharePct.toFixed(1)}%</td>
                                                <td className="py-1 px-0.5 text-right whitespace-nowrap font-normal">{Number(p.qty || 0).toLocaleString()}</td>
                                                {yearOffsets.map((y) => {
                                                    const prev = p.prevYears?.[String(y)];
                                                    const hasPrev = prev && (Number(prev.salesAmount) > 0 || Number(prev.quantity) > 0);
                                                    const salesPct = hasPrev ? growthPct(p.sales, prev.salesAmount) : null;
                                                    const qtyPct = hasPrev ? growthPct(Number(p.qty || 0), prev.quantity) : null;
                                                    return (
                                                        <React.Fragment key={`pyoy-${p.name}-${y}`}>
                                                            <td className="py-1 px-0.5 text-right whitespace-nowrap text-gray-600 font-normal">
                                                                {hasPrev ? formatCurrency(Number(prev.salesAmount)) : <span className="text-gray-400">N/A</span>}
                                                            </td>
                                                            <td className="py-1 px-0.5 text-right whitespace-nowrap text-gray-600 font-normal">
                                                                {hasPrev ? Number(prev.quantity || 0).toLocaleString() : <span className="text-gray-400">N/A</span>}
                                                            </td>
                                                            <td className="py-1 px-0.5 text-right whitespace-nowrap font-normal"><YoYPctCell pct={salesPct} /></td>
                                                            <td className="py-1 px-0.5 text-right whitespace-nowrap font-normal"><YoYPctCell pct={qtyPct} /></td>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                    </React.Fragment>
                                );
                            })}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={colSpan} className="py-6 text-center text-gray-400">데이터 없음</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                );

                return (
            <div
                className={`flex flex-col lg:flex-row gap-3 ${panelH}`}
                onClick={() => {
                    // 빈 영역(패널 사이 등) 클릭 시 원복
                    if (anyExpanded) setExpandedCategoryPanel(null);
                }}
            >
                {/* ① 추세 차트 */}
                {(exp === null || isTrend) && (
                <Card
                    id="outbound-trend-chart"
                    ref={isTrend ? (expandedPanelRef as any) : undefined}
                    className={`${isTrend ? 'flex-1 ring-2 ring-blue-300 shadow-lg' : 'flex-[1.15]'} h-full flex flex-col min-w-0 ${!isTrend ? 'cursor-pointer hover:border-blue-300' : 'border-blue-200 shadow-md'} ${selectedProduct ? 'ring-2 ring-indigo-400' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!isTrend) setExpandedCategoryPanel('trend');
                        else setExpandedCategoryPanel(null); // 제목 영역 토글 축소
                    }}
                    title={isTrend ? '클릭 또는 바깥 영역 → 원래 배치' : '클릭하면 추세 차트만 확대'}
                >
                    <CardHeader className="pb-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <CardTitle className="text-base font-bold flex items-center gap-1.5">
                            <span>📈 {trendTitle}</span>
                            {selectedProduct && <span className="text-sm font-normal text-blue-600 ml-1">({selectedProduct})</span>}
                            <span className="text-[10px] font-normal text-blue-600 ml-1">{isTrend ? '축소' : '확대 →'}</span>
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {/* 최고/최저/일평균 매출 실시간 요약 배지 */}
                        <div className="flex flex-wrap gap-1.5 text-[10px] md:text-[11px] font-medium">
                            {statsSummary.peakDay && (
                                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded bg-orange-50 text-orange-700 border border-orange-100 shadow-xs">
                                    <span className="font-semibold text-orange-800">최고:</span>
                                    <span>{statsSummary.peakDay.date}</span>
                                    <span className="font-bold">({Math.round(Number(statsSummary.peakDay.sales || 0) / 10000).toLocaleString()}만)</span>
                                </span>
                            )}
                            {statsSummary.minDay && (
                                <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded bg-blue-50 text-blue-700 border border-blue-100 shadow-xs">
                                    <span className="font-semibold text-blue-800">최저:</span>
                                    <span>{statsSummary.minDay.date}</span>
                                    <span className="font-bold">({Math.round(Number(statsSummary.minDay.sales || 0) / 10000).toLocaleString()}만)</span>
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded bg-gray-50 text-gray-700 border border-gray-100 shadow-xs">
                                <span className="font-semibold text-gray-800">평균:</span>
                                <span className="font-bold">{Math.round(statsSummary.avgSales / 10000).toLocaleString()}만</span>
                            </span>
                        </div>
                        {isTrend && (
                            <button
                                type="button"
                                className="text-[11px] px-3 py-1 rounded-md bg-gray-900 text-white hover:bg-gray-700"
                                onClick={(e) => { e.stopPropagation(); setExpandedCategoryPanel(null); }}
                            >
                                접기
                            </button>
                        )}
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 p-2 flex flex-col justify-between min-h-0" onClick={(e) => e.stopPropagation()}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                                data={dailyTrend}
                                margin={{ top: 12, right: 30, bottom: 12, left: 16 }}
                                onClick={(data) => {
                                    if (data && data.activePayload && data.activePayload.length > 0) {
                                        const clickedDate = data.activePayload[0].payload.fullDate;
                                        if (clickedDate) {
                                            setPeriodMode("manual");
                                            setSelectedRangePreset("");
                                            
                                            if (groupBy === "month") {
                                                // 월별 클릭: 해당 월의 1일부터 마지막날까지 설정
                                                const d = parseISO(clickedDate.slice(0, 7) + "-01");
                                                if (isValid(d)) {
                                                    const startStr = format(startOfMonth(d), "yyyy-MM-dd");
                                                    const endStr = format(endOfMonth(d), "yyyy-MM-dd");
                                                    setStartDate(startStr);
                                                    setEndDate(endStr);
                                                }
                                            } else if (groupBy === "week") {
                                                // 주별 클릭: 해당 주의 월요일부터 일요일까지 설정
                                                const d = parseISO(clickedDate);
                                                if (isValid(d)) {
                                                    const startStr = format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
                                                    const endStr = format(endOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
                                                    setStartDate(startStr);
                                                    setEndDate(endStr);
                                                }
                                            } else if (groupBy === "year") {
                                                // 년별 클릭: 해당 년도의 1월 1일부터 12월 31일까지 설정
                                                const d = parseISO(clickedDate.slice(0, 4) + "-01-01");
                                                if (isValid(d)) {
                                                    const startStr = format(startOfYear(d), "yyyy-MM-dd");
                                                    const endStr = format(endOfYear(d), "yyyy-MM-dd");
                                                    setStartDate(startStr);
                                                    setEndDate(endStr);
                                                }
                                            } else {
                                                // 일별 클릭: 기존처럼 동일하게 하루 설정
                                                const d = parseISO(clickedDate);
                                                const formatted = isValid(d) ? format(d, "yyyy-MM-dd") : clickedDate;
                                                setStartDate(formatted);
                                                setEndDate(formatted);
                                            }
                                        }
                                    } else {
                                        // 빈 영역 클릭: 2주 프리셋으로 복귀
                                        handleQuickDateChange("2weeks");
                                    }
                                }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    scale="point"
                                    padding={{ left: 12, right: 48 }}
                                    tickMargin={10}
                                    interval={xAxisInterval}
                                    minTickGap={8}
                                    tick={{ fontSize: trendPointCount > 60 ? 10 : 11 }}
                                />
                                <YAxis
                                    yAxisId="left"
                                    orientation="left"
                                    tickFormatter={(v: number) => NUMBER_FORMATTER.format(v)}
                                />
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    width={86}
                                    tickMargin={10}
                                    tickFormatter={(v: number) => `${Math.round(v / 10000)}만`}
                                />
                                <RechartsTooltip
                                    content={({ active, payload, label }: any) => (
                                        <CustomTrendTooltip
                                            active={active}
                                            payload={payload}
                                            label={label}
                                            totalSales={totalSales}
                                            totalQty={totalQty}
                                        />
                                    )}
                                    cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                />
                                <Legend />
                                <Bar
                                    isAnimationActive={false}
                                    yAxisId="left"
                                    dataKey="quantity"
                                    name="출고량(Box)"
                                    barSize={trendPointCount > 120 ? 6 : trendPointCount > 60 ? 12 : trendPointCount > 30 ? 22 : 40}
                                    radius={[4, 4, 0, 0]}
                                >
                                    {dailyTrend.map((entry: any, index: number) => (
                                        <Cell
                                            key={`bar-est-${index}`}
                                            fill={entry.isEstimated || entry.hasEstimated ? "#F59E0B" : "#2563EB"}
                                        />
                                    ))}
                                    {dailyTrend.length <= 40 ? (
                                        <LabelList
                                            dataKey="quantity"
                                            content={(props: any) => {
                                                const { x, y, width, height, value } = props;
                                                const num = typeof value === 'number' ? value : Number(value);
                                                if (!num || num <= 0) return null;

                                                const cx = x + width / 2;
                                                const cyInside = y + height * 0.2 + 4;
                                                const cy = height < 18 ? y - 6 : cyInside;

                                                return (
                                                    <text
                                                        x={cx}
                                                        y={cy}
                                                        textAnchor="middle"
                                                        fill={height < 18 ? '#2563EB' : '#FFFFFF'}
                                                        fontSize={11}
                                                        fontWeight={600}
                                                    >
                                                        {NUMBER_FORMATTER.format(num)}
                                                    </text>
                                                );
                                            }}
                                        />
                                    ) : null}
                                </Bar>
                                <Line
                                    isAnimationActive={false}
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="sales"
                                    name="매출액"
                                    stroke="#F97316"
                                    strokeWidth={3}
                                    dot={false}
                                    label={dailyTrend.length <= 60 ? { position: 'top', fill: '#F97316', fontSize: 11, fontWeight: 'bold', dy: -6, formatter: (v: number) => v > 0 ? `${Math.round(v / 10000)}만` : '' } : undefined}
                                />
                                {/* 금액 기준 추세선 (선형 회귀) */}
                                <Line
                                    isAnimationActive={false}
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="salesTrend"
                                    name="매출 추세선"
                                    stroke="#EF4444"
                                    strokeWidth={2}
                                    strokeDasharray="6 4"
                                    dot={false}
                                    connectNulls={true}
                                />
                                {/* 전년 동기 매출액 */}
                                <Line
                                    isAnimationActive={false}
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="prevYearSales"
                                    name="전년 매출액"
                                    stroke="#A855F7"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    connectNulls={true}
                                />
                                {/* 전년 동기 출고량 */}
                                <Line
                                    isAnimationActive={false}
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="prevYearQuantity"
                                    name="전년 출고량"
                                    stroke="#22C55E"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    connectNulls={true}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                        
                        {/* 차트 동기화 클릭 팁 문구 */}
                        {!isTrend && (
                        <div className="text-[10px] text-gray-400 mt-1 flex items-center justify-center gap-1 select-none">
                            <span>💡 막대 클릭=날짜 동기화 · 카드 클릭=차트 확대</span>
                        </div>
                        )}
                    </CardContent>
                </Card>
                )}

                {/* ② 분류별 매출 비중 + 전년 동기간 — 분류/품목 클릭=드릴다운(확대 안 함), 빈 영역만 확대 */}
                {(exp === null || isShare) && (
                <Card
                    ref={isShare ? (expandedPanelRef as any) : undefined}
                    className={`${isShare ? 'flex-1 ring-2 ring-blue-300 shadow-lg' : 'flex-1'} h-full flex flex-col min-w-0 ${isShare ? 'border-blue-200 shadow-md' : ''}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <CardHeader className="pb-2 shrink-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div>
                                <CardTitle className="text-sm">
                                    {labels.categorySales} · 전년 동기간
                                    {isShare && <span className="ml-2 text-xs font-normal text-blue-600">전체 {totalCatCount}개</span>}
                                    {drillCategory && (
                                        <span className="ml-2 text-xs font-normal text-indigo-600">
                                            · {drillCategory} 품목 {categoryProductDrilldown.length}개
                                        </span>
                                    )}
                                </CardTitle>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                    분류 클릭=품목 펼침 · 마우스 스크롤 가능
                                    {isShare ? ' · 바깥 클릭/접기=원복' : ` · 전체 ${totalCatCount}개 분류`}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {dataSource === 'vf' && (
                                    <button
                                        type="button"
                                        onClick={() => setShowMultiYearCompare(v => !v)}
                                        className={`text-[11px] px-2 py-1 rounded-md border ${showMultiYearCompare ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-600'}`}
                                    >
                                        {showMultiYearCompare ? '1년前만' : '2·3년前'}
                                    </button>
                                )}
                                {isShare ? (
                                    <button type="button" className="text-[11px] px-3 py-1 rounded-md bg-gray-900 text-white" onClick={() => setExpandedCategoryPanel(null)}>접기</button>
                                ) : (
                                    <button
                                        type="button"
                                        className="text-[11px] px-2 py-1 rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"
                                        onClick={() => setExpandedCategoryPanel('share')}
                                    >
                                        확대
                                    </button>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent
                        className="p-3 flex-1 min-h-0 overflow-auto cursor-pointer"
                        title="빈 영역 클릭 시 확대/축소 · 분류·품목 행은 드릴다운만"
                        onClick={(e) => {
                            // 표/버튼이 아닌 빈 여백(패딩·빈 공간) 클릭 시에만 확대 토글
                            if (e.target === e.currentTarget) {
                                setExpandedCategoryPanel(isShare ? null : 'share');
                            }
                        }}
                    >
                        <div
                            className="min-h-full"
                            onClick={(e) => {
                                // 테이블 래퍼의 빈 여백 클릭 시에도 확대 (행 클릭은 tr에서 stop)
                                if (e.target === e.currentTarget) {
                                    setExpandedCategoryPanel(isShare ? null : 'share');
                                }
                            }}
                        >
                        <div 
                            onClick={(e) => e.stopPropagation()} 
                            className={`overflow-y-auto ${isShare ? 'max-h-[70vh]' : 'max-h-[350px]'} scrollbar-thin scrollbar-thumb-gray-200 pr-1`}
                        >
                            {renderCategoryShareYoyTable(shareRows)}
                        </div>
                        {!isShare && totalCatCount > CATEGORY_TABLE_PREVIEW && (
                            <button
                                type="button"
                                className="mt-2 w-full text-[11px] py-1.5 rounded-md border border-dashed border-blue-300 text-blue-700 hover:bg-blue-50"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedCategoryPanel('share');
                                }}
                            >
                                나머지 {totalCatCount - CATEGORY_TABLE_PREVIEW}개 더 보기 (확대)
                            </button>
                        )}
                        {/* 표 아래 여백: 빈 화면 클릭 확대용 */}
                        {!isShare && (
                            <div
                                className="mt-2 min-h-[48px] rounded border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-400 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-600"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedCategoryPanel('share');
                                }}
                            >
                                빈 곳 클릭 → 표 확대
                            </div>
                        )}
                        {dataSource === 'vf' && isYoy1Fetching && (
                            <p className="text-[10px] text-blue-500 mt-2" onClick={(e) => e.stopPropagation()}>전년 동기간 데이터 로딩 중…</p>
                        )}
                        {dataSource === 'vf' && !isYoy1Fetching && !hasAnyYoy && !isStatsLoading && (
                            <p className="text-[10px] text-amber-600 mt-2" onClick={(e) => e.stopPropagation()}>전년 동기간({yoyRangeLabel}) 실적이 없습니다. 당기 비중 열만 표시됩니다.</p>
                        )}
                        {dataSource === 'fc' && (
                            <p className="text-[10px] text-gray-400 mt-2" onClick={(e) => e.stopPropagation()}>FC 입고 모드는 전년 비교 열이 N/A일 수 있습니다.</p>
                        )}
                        </div>
                    </CardContent>
                </Card>
                )}
            </div>
                );
            })()}

            {/* Category Toggle Buttons */}
            {canShowDailyPivot && categoryShare.length > 0 && (
                <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <div className="mb-2 text-sm font-medium text-gray-700">분류 선택 (토글)</div>
                    <div className="flex flex-wrap gap-2">
                        {categoryShare.map((cat: any) => (
                            <button
                                key={cat.name}
                                onClick={() => handleCategoryToggle(cat.name)}
                                className={`px-3 py-1.5 text-sm rounded-md border transition-all ${
                                    selectedCategories.includes(cat.name)
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                }`}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Row 2: Integrated Pivot Table (60%) + Top 30 (40%) */}
            <div className="flex flex-col lg:flex-row gap-4 h-[700px]">
                {/* Integrated Category-Product Pivot Table */}
                <div className="flex-[0.6] h-full overflow-hidden flex flex-col">
                    {pivotDayHeavy && (
                        <div className="shrink-0 bg-amber-50 border border-amber-200 rounded-t-lg px-3 py-1.5 text-[11px] text-amber-800 flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5 shrink-0" />
                            일별 피벗 열이 {rangeDays}개입니다. 가로 스크롤로 전체 확인 · 느리면 주별/월별 권장
                        </div>
                    )}
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <IntegratedPivotTable
                            filteredRecords={processedData.filtered}
                            startDate={startDate}
                            endDate={endDate}
                            groupBy={groupBy}
                            quantityLabel={labels.quantityLabel}
                            quantityUnit={labels.quantityUnit}
                            salesLabel={labels.salesLabel}
                            selectedCategory={selectedPieCategory}
                            onCategorySelect={(category) => {
                                if (selectedCategories.length > 0) return;
                                if (selectedCategory === category) {
                                    setSelectedCategory('all');
                                } else {
                                    setSelectedCategory(category === '전체' ? 'all' : category);
                                }
                                setSelectedProduct(null);
                            }}
                            serverPivotData={categoryPivotServer}
                            productNumberMap={productNumberMap}
                        />
                    </div>
                </div>

                {/* Top 30 Products */}
                <Card className="flex-[0.4] h-full flex flex-col" onClick={() => {
                    if (selectedCategories.length === 0) {
                        setSelectedProduct(null);
                    }
                }}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">
                            TOP 30 출고 품목
                            {selectedPieCategory && <span className="text-xs font-normal text-muted-foreground ml-1">- {selectedPieCategory}</span>}
                            {selectedProduct && <span className="text-xs font-bold text-blue-600 ml-2">[{selectedProduct} 선택됨]</span>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 p-0 min-h-0">
                        <div className="h-full overflow-y-auto pr-2">
                            <div style={{ height: `${Math.max(100, topProducts.length * 5)}%`, minHeight: '500px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        layout="vertical"
                                        data={topProducts}
                                        margin={{ top: 5, right: 100, left: 10, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                        <XAxis type="number" />
                                        <YAxis type="category" dataKey="name" width={160} tick={<TopProductsYAxisTick />} interval={0} />
                                        <RechartsTooltip formatter={(value: number) => [
                                            `${NUMBER_FORMATTER.format(value)} Box`, "출고량(Box)"
                                        ]} />
                                        <Bar
                                            dataKey="value"
                                            fill="#8884d8"
                                            radius={[0, 4, 4, 0]}
                                            barSize={14}
                                            onClick={(data, _index, e) => {
                                                e.stopPropagation();
                                                if (selectedCategories.length > 0) return;
                                                setSelectedProduct(data.name === selectedProduct ? null : data.name);
                                            }}
                                            cursor={selectedCategories.length > 0 ? 'default' : 'pointer'}
                                        >
                                            {topProducts.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.name === selectedProduct ? '#2563EB' : COLORS[index % COLORS.length]} />
                                            ))}
                                            <LabelList dataKey="label" position="right" fontSize={11} fill="#666" />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Row 3: AI Analysis */}
            <div className="flex flex-col lg:flex-row gap-4 h-[800px]">
                <div className="flex-1 h-full overflow-y-auto">
                    <OutboundAIReport
                        startDate={startDate}
                        endDate={endDate}
                        category={selectedCategory}
                        searchQuery={searchQuery}
                        product={selectedProduct}
                        selectedProduct={selectedProduct}
                        summaryStats={summaryStats}
                        apiPrefix={getApiPrefix()}
                        onProductSelect={(name: string | null) => {
                            // 증가/감소 품목 클릭 → 상단 일별 출고 그래프에 해당 품목만 표시
                            setSelectedProduct(name);
                            if (name) {
                                setExpandedCategoryPanel(null); // 분류 확대 중이면 닫아 차트 보이게
                                // 차트 위치로 스크롤
                                requestAnimationFrame(() => {
                                    document.getElementById("outbound-trend-chart")?.scrollIntoView({
                                        behavior: "smooth",
                                        block: "center",
                                    });
                                });
                            }
                        }}
                    />
                </div>
            </div>
        </div >
    );
}