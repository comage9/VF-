import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, subMonths, subYears, eachDayOfInterval, parseISO, isSameDay, isValid } from "date-fns";
import {
    ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, LabelList
} from "recharts";
import {
    Loader2, Search, TrendingUp, Package, DollarSign, Calendar,
    Filter, Download, Sparkles, HelpCircle
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OutboundRecord } from "@shared/schema";
import ReactMarkdown from 'react-markdown';

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
    const salesAmountRaw = record?.salesAmount ?? record?.sales_amount;
    const salesAmount = salesAmountRaw === null || salesAmountRaw === undefined || salesAmountRaw === ''
        ? null
        : Number(salesAmountRaw);

    const outboundDate = record?.outboundDate ?? record?.outbound_date;

    return {
        ...record,
        productName: record?.productName ?? record?.product_name ?? '',
        outboundDate,
        salesAmount: salesAmount === null || Number.isNaN(salesAmount) ? null : salesAmount,
        boxQuantity: record?.boxQuantity ?? record?.box_quantity ?? null,
        unitCount: record?.unitCount ?? record?.unit_count ?? null,
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

// AI Report Component
const OutboundAIReport = ({ startDate, endDate, category, searchQuery, product, summaryStats }: any) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['/api/outbound/ai-analysis', startDate, endDate, category, searchQuery, product],
        queryFn: async () => {
            const res = await fetch('/api/outbound/ai-analysis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate, endDate, category, searchQuery, product, summaryStats })
            });
            if (!res.ok) throw new Error('Analysis failed');
            return res.json();
        },
        enabled: !!summaryStats.totalSales, // Only run if data exists
        staleTime: Infinity, // Cache indefinitely (until params change)
    });

    return (
        <Card className="h-full flex flex-col bg-gradient-to-br from-purple-50 to-white border-purple-100">
            <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold flex items-center gap-2 text-purple-700">
                    <Sparkles className="w-4 h-4" />
                    AI 출고 분석 리포트
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto text-sm leading-relaxed p-4 pt-0">
                {isLoading ? (
                    <div className="space-y-3 mt-4">
                        <div className="h-4 bg-purple-100 rounded w-3/4 animate-pulse" />
                        <div className="h-4 bg-purple-100 rounded w-full animate-pulse" />
                        <div className="h-4 bg-purple-100 rounded w-5/6 animate-pulse" />
                        <div className="text-xs text-purple-400 mt-2 text-center">데이터를 분석하고 있습니다...</div>
                    </div>
                ) : isError ? (
                    <div className="text-red-500 text-center mt-4">분석을 불러오지 못했습니다.</div>
                ) : (
                    <div className="prose prose-sm prose-purple max-w-none">
                        <ReactMarkdown>{data?.analysis || "분석 결과가 없습니다."}</ReactMarkdown>
                    </div>
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
}: {
    title: string;
    data: any[];
    rowKey: string;
    rowLabel: string;
    quantityKey: string;
    salesKey: string;
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
                        <div className="overflow-y-auto max-h-[500px]">
                            <table className="min-w-full divide-y divide-gray-200 border-collapse text-xs">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 border-r min-w-[140px]">
                                            {rowLabel}
                                        </th>
                                        <th className="px-2 py-2 text-right font-medium text-gray-500 min-w-[100px]">출고량(Box)</th>
                                        <th className="px-2 py-2 text-right font-medium text-gray-500 min-w-[140px]">매출액</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {data.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-2 py-1 whitespace-nowrap font-medium text-gray-900 sticky left-0 bg-white border-r">
                                                {row[rowKey]}
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
    onItemToggle
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
                        <div className="overflow-y-auto max-h-[500px]"> {/* Approx 15 rows */}
                            <table className="min-w-full divide-y divide-gray-200 border-collapse text-xs">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-2 py-2 text-left font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50 border-r min-w-[120px]">
                                            {rowLabel}
                                        </th>
                                        {dates.map((date, idx) => (
                                            <th key={idx} className="px-2 py-2 text-center font-medium text-gray-500 min-w-[80px]">
                                                {safeFormatDate(date, 'MM/dd')}
                                            </th>
                                        ))}
                                        <th className="px-2 py-2 text-right font-bold text-gray-700 bg-gray-50 sticky right-0 border-l">합계</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {data.map((row, idx) => (
                                        <tr key={idx} className={`hover:bg-gray-50 ${selectedItems.includes(row[rowKey]) ? 'bg-blue-50' : ''}`}>
                                            <td className="px-2 py-1 whitespace-nowrap font-medium text-gray-900 sticky left-0 bg-white border-r">
                                                {onItemToggle && (
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItems.includes(row[rowKey])}
                                                        onChange={() => onItemToggle(row[rowKey])}
                                                        className="mr-2 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    />
                                                )}
                                                {row[rowKey]}
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
                                            <td className="px-2 py-1 text-right whitespace-nowrap font-bold text-gray-900 sticky right-0 bg-gray-50 border-l">
                                                <div className="leading-tight">
                                                    <div>{NUMBER_FORMATTER.format(row.total[valueKey])}</div>
                                                    {secondaryValueKey && (row.total?.[secondaryValueKey] || 0) > 0 && (
                                                        <div className="text-[10px] font-medium text-gray-600">
                                                            {formatCurrency(row.total[secondaryValueKey])}
                                                        </div>
                                                    )}
                                                </div>
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

// --- Main Component ---
export default function OutboundDashboardUnified() {
    // Default: Last Week (Ending Yesterday)
    const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(() => format(subDays(new Date(), 1), 'yyyy-MM-dd'));
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
    const [groupByMode, setGroupByMode] = useState<'auto' | 'day' | 'week' | 'month'>('auto');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

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
    }, []);

    // 검색어 debounce (최소 2글자, 300ms 지연)

    // Quick Date Selection Handler
    const handleQuickDateChange = (value: string) => {
        const today = new Date();
        const yesterday = subDays(today, 1);
        let start = yesterday;
        let end = yesterday;

        switch (value) {
            case "yesterday":
                start = yesterday;
                end = yesterday;
                break;
            case "dayBefore":
                start = subDays(today, 2);
                end = subDays(today, 2);
                break;
            case "1week":
                start = subDays(yesterday, 6); // Total 7 days including yesterday
                end = yesterday;
                break;
            case "2weeks":
                start = subDays(yesterday, 13); // Total 14 days
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
            default:
                return;
        }
        setStartDate(format(start, 'yyyy-MM-dd'));
        setEndDate(format(end, 'yyyy-MM-dd'));
    };

    // Calculate date difference to determine grouping
    const groupBy = useMemo(() => {
        if (groupByMode !== 'auto') return groupByMode;
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 180) return 'month';
        if (diffDays > 90) return 'week';
        return 'day';
    }, [startDate, endDate, groupByMode]);

    // Fetch Aggregated Stats (Fast)
    const { data: outboundStats, isLoading: isStatsLoading, isError: isStatsError, error: statsError } = useQuery({
        queryKey: ['/api/outbound/stats', startDate, endDate, selectedCategory, searchQuery, selectedProduct, groupBy],
        queryFn: async () => {
            const params = new URLSearchParams({
                start: startDate,
                end: endDate,
                category: selectedCategory,
                search: searchQuery,
                groupBy,
                ...(selectedProduct ? { product: selectedProduct } : {}),
            });
            const res = await fetch(`/api/outbound/stats?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch stats');
            return res.json();
        }
    });

    const { data: outboundTopProducts = [] } = useQuery<any[]>({
        queryKey: ['/api/outbound/top-products', startDate, endDate, selectedCategory, searchQuery, selectedProduct],
        queryFn: async () => {
            const params = new URLSearchParams({
                start: startDate,
                end: endDate,
                category: selectedCategory,
                search: searchQuery,
                limit: '200',
                ...(selectedProduct ? { product: selectedProduct } : {}),
            });
            const res = await fetch(`/api/outbound/top-products?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch top products');
            const json = await res.json();
            return Array.isArray(json) ? json : [];
        },
        enabled: !isStatsLoading,
        staleTime: 60_000,
    });

    const canShowDailyPivot = rangeDays <= 60;

    const { data: categoryPivotServer = [] } = useQuery<any[]>({
        queryKey: ['/api/outbound/pivot', 'category', startDate, endDate, selectedCategory, searchQuery, selectedProduct],
        queryFn: async () => {
            const params = new URLSearchParams({
                row: 'category',
                groupBy: 'day',
                start: startDate,
                end: endDate,
                category: selectedCategory,
                search: searchQuery,
                limit: '200',
                ...(selectedProduct ? { product: selectedProduct } : {}),
            });
            const res = await fetch(`/api/outbound/pivot?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch category pivot');
            const json = await res.json();
            return Array.isArray(json) ? json : [];
        },
        enabled: canShowDailyPivot && !isStatsLoading,
        staleTime: 60_000,
    });

    const { data: productPivotServer = [] } = useQuery<any[]>({
        queryKey: ['/api/outbound/pivot', 'product', startDate, endDate, selectedCategory, searchQuery, selectedProduct],
        queryFn: async () => {
            const params = new URLSearchParams({
                row: 'product',
                groupBy: 'day',
                start: startDate,
                end: endDate,
                category: selectedCategory,
                search: searchQuery,
                limit: '100',
                ...(selectedProduct ? { product: selectedProduct } : {}),
            });
            const res = await fetch(`/api/outbound/pivot?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch product pivot');
            const json = await res.json();
            return Array.isArray(json) ? json : [];
        },
        enabled: canShowDailyPivot && !isStatsLoading,
        staleTime: 60_000,
    });

    // Fetch Records (Limited for Performance)
    const { data: outboundRecords = [], isLoading: isRecordsLoading, isError: isRecordsError, error: recordsError } = useQuery<OutboundRecordWithBoxes[]>({
        queryKey: ['/api/outbound', startDate, endDate], // Records fetch is independent of grouping
        queryFn: async () => {
            // Limit increased to 10000 to fetch all records
            const params = new URLSearchParams({ start: startDate, end: endDate, limit: '10000' });
            const res = await fetch(`/api/outbound?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch data');
            const raw = await res.json();
            if (!Array.isArray(raw)) return [];
            return raw.map(normalizeOutboundRecord);
        },
    });

    const isLoading = isStatsLoading || isRecordsLoading;

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

        // 0. Generate Dates Array based on Range (Moved to Top Level Scope)
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

                if (diffDays <= 60) {
                    dates = eachDayOfInterval({ start, end }).filter(d => !isSameDay(d, new Date()));
                } else {
                    // If > 60 days, we don't show pivot table details, so dates can be empty
                    dates = [];
                }
            }
        } catch {
            dates = [];
            diffDays = 0;
        }

        // 1. Filter Records (Client-side)
        const filteredBase = outboundRecords.filter(r => {
            const matchSearch = !searchQuery ||
                r.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.category.toLowerCase().includes(searchQuery.toLowerCase());
            const matchProduct = !selectedProduct || r.productName === selectedProduct;
            return matchSearch && matchProduct;
        });

        const filtered = (() => {
            let result = filteredBase;

            if (selectedCategories.length > 0) {
                result = result.filter(r => selectedCategories.includes(String(r.category || '').trim()));
            } else if (selectedCategory !== 'all') {
                if (selectedCategory === '__others__') {
                    const topCats = filteredBase
                        .reduce((acc: Map<string, number>, r) => {
                            const key = String(r.category || '').trim();
                            const prev = acc.get(key) || 0;
                            acc.set(key, prev + (r.salesAmount ?? 0));
                            return acc;
                        }, new Map<string, number>());

                    const top10 = new Set(
                        Array.from(topCats.entries())
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 10)
                            .map(([cat]) => cat)
                    );
                    result = filteredBase.filter(r => !top10.has(String(r.category || '').trim()));
                } else {
                    result = filteredBase.filter(r => String(r.category || '').trim() === String(selectedCategory || '').trim());
                }
            }

            return result;
        })();

        // Use Server Stats if available
        void outboundStats;

        // 2. KPIs
        const totalSales = Number(outboundStats.summary?.totalSalesAmount ?? 0);
        const totalQty = Number(outboundStats.summary?.totalQuantity ?? 0);

        // Avg Daily Sales
        let avgDailySales = 0;
        if (outboundStats.dailyTrend?.length) {
            avgDailySales = totalSales / outboundStats.dailyTrend.length;
        } else {
            // Fallback for avg calculation (using filtered records)
            try {
                const uniqueDays = new Set(filtered.map(r => safeFormatDate(r.outboundDate, 'yyyy-MM-dd'))).size || 1;
                avgDailySales = totalSales / uniqueDays;
            } catch (e) {
                console.error("❌ Error calculating uniqueDays:", e);
                avgDailySales = 0;
            }
        }

        // 3. Trend Data
        const dailyTrend = outboundStats.dailyTrend ? outboundStats.dailyTrend.map((d: any) => {
            try {
                return {
                    fullDate: d.date,
                    date: groupBy === 'month' ? d.date : groupBy === 'week' ? d.date : d.date.substring(5).replace('-', '/'),
                    sales: Number(d.salesAmount ?? 0),
                    quantity: Number(d.quantity ?? 0)
                };
            } catch {
                return { fullDate: '', date: '', sales: 0, quantity: 0 };
            }
        }) : [];

        // 4. Category Share
        let categoryShare: Array<{ name: string; value: number }> = [];
        if (outboundStats.categoryBreakdown) {
            const serverCats = outboundStats.categoryBreakdown.map((c: any) => ({
                name: c.category,
                value: Number(c.salesAmount ?? 0)
            }));
            const top10 = serverCats.slice(0, 10);
            const others = serverCats.slice(10).reduce((sum: number, c: any) => sum + c.value, 0);
            categoryShare = [...top10];
            if (others > 0) categoryShare.push({ name: "기타", value: others });
        }

        // 5. Top Products
        const topProducts = (outboundTopProducts || [])
            .map((r: any) => ({
                name: String(r?.name || '-'),
                value: Number(r?.quantity || 0),
                sales: Number(r?.salesAmount || 0),
            }))
            .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))
            .slice(0, 10);

        // 6. Pivot Data Helper
        const createTotalPivot = (groupBy: (r: OutboundRecordWithBoxes) => string) => {
            const map = new Map();
            filtered.forEach(r => {
                const key = groupBy(r);
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

        const categoryPivot = canShowDailyPivot ? categoryPivotServer : [];
        const productPivot = canShowDailyPivot ? productPivotServer : [];
        const categoryTotalPivot = Array.isArray(outboundStats.categoryBreakdown)
            ? outboundStats.categoryBreakdown
                .map((c: any) => ({
                    key: String(c?.category || '기타'),
                    total: {
                        quantity: Number(c?.quantity || 0),
                        salesAmount: Number(c?.salesAmount || 0),
                    }
                }))
                .sort((a: any, b: any) => (b.total.salesAmount || 0) - (a.total.salesAmount || 0))
            : createTotalPivot(r => r.category);

        const productTotalPivot = (outboundTopProducts || [])
            .map((r: any) => ({
                key: String(r?.name || '-'),
                total: {
                    quantity: Number(r?.quantity || 0),
                    salesAmount: Number(r?.salesAmount || 0),
                }
            }))
            .sort((a: any, b: any) => (b.total.quantity || 0) - (a.total.quantity || 0));

        // 제품별 카테고리 매핑 생성 (필터링된 레코드에서)
        const productCategoryMap = useMemo(() => {
            const map = new Map<string, string>();
            filtered.forEach(r => {
                if (r.productName && r.category) {
                    map.set(r.productName, r.category);
                }
            });
            return map;
        }, [filtered]);

        return {
            filtered,
            totalSales,
            totalQty,
            avgDailySales,
            dailyTrend,
            categoryShare,
            topProducts,
            categoryPivot,
            productPivot,
            dates: dates.reverse(),
            diffDays,
            categoryTotalPivot,
            productTotalPivot,
            productCategoryMap,
            summaryStats: {
                totalSales,
                totalQty,
                topCategory: categoryShare[0]?.name || 'N/A'
            }
        };
    }, [outboundRecords, outboundStats, startDate, endDate, selectedCategory, searchQuery, selectedProduct, groupBy, outboundTopProducts, canShowDailyPivot, categoryPivotServer, productPivotServer]);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

    // Download Handler
    const handleDownload = () => {
        if (!processedData?.filtered) return;

        const headers = ['출고날짜', '제품명', '분류', '바코드', '수량', '박스수량', '판매금액'];
        const csvContent = [
            headers.join(','),
            ...processedData.filtered.map(r => [
                format(new Date(r.outboundDate), 'yyyy-MM-dd'),
                `"${r.productName.replace(/"/g, '""')}"`, // Escape quotes
                r.category,
                r.barcode,
                r.quantity,
                r.boxQuantity,
                r.salesAmount
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

    const { totalSales, totalQty, avgDailySales, dailyTrend, categoryShare, topProducts, categoryPivot, productPivot, dates, summaryStats, categoryTotalPivot, productTotalPivot, productCategoryMap } = processedData;

    const trendTitle = groupBy === 'day'
        ? '일별 매출 및 출고량 추이'
        : groupBy === 'week'
            ? '주별 매출 및 출고량 추이'
            : '월별 매출 및 출고량 추이';

    return (
        <div className="space-y-6 p-2 bg-gray-50/30 min-h-screen">
            {/* 1. Unified Filter Bar */}
            <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col lg:flex-row gap-4 items-end lg:items-center justify-between sticky top-0 z-20">
                <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />

                        {/* Quick Date Select */}
                        <Select onValueChange={handleQuickDateChange}>
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="기간 선택" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="yesterday">어제</SelectItem>
                                <SelectItem value="dayBefore">그제</SelectItem>
                                <SelectItem value="1week">1주일</SelectItem>
                                <SelectItem value="2weeks">2주일</SelectItem>
                                <SelectItem value="1month">1개월</SelectItem>
                                <SelectItem value="6months">6개월</SelectItem>
                                <SelectItem value="1year">1년</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-gray-500" />
                            <Select value={groupByMode} onValueChange={(v) => setGroupByMode(v as any)}>
                                <SelectTrigger className="w-[160px]">
                                    <SelectValue placeholder="집계 단위" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">자동</SelectItem>
                                    <SelectItem value="day">일별</SelectItem>
                                    <SelectItem value="week">주별</SelectItem>
                                    <SelectItem value="month">월별</SelectItem>
                                </SelectContent>
                            </Select>

                            {rangeDays > 180 && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            aria-label="집계 단위 안내"
                                            className="inline-flex items-center justify-center w-7 h-7 rounded-md border bg-gray-50 text-gray-600 hover:bg-gray-100"
                                        >
                                            <HelpCircle className="w-4 h-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" align="start">
                                        <div className="text-xs leading-relaxed">
                                            6개월 초과 기간은 기본으로 월별 집계로 표시됩니다.
                                            <br />
                                            필요하면 위의 집계 단위에서 일별/주별로 변경할 수 있습니다.
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </div>

                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="border rounded-md px-2 py-1.5 text-sm bg-gray-50"
                        />
                        <span className="text-gray-400">~
                        </span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="border rounded-md px-2 py-1.5 text-sm bg-gray-50"
                        />
                    </div>

                    <div className="flex items-center gap-2 min-w-[180px]">
                        <Select
                            value={selectedCategory}
                            onValueChange={(v) => {
                                setSelectedCategory(v);
                                setSelectedProduct(null);
                            }}
                        >
                            <SelectTrigger className="h-9">
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

                    <div className="relative w-full md:w-[250px]">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="품목명 검색 (엔터키로 검색)"
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    setSearchQuery(e.currentTarget.value);
                                }
                            }}
                            className="pl-8 h-9"
                        />
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleDownload} className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100">
                        <Download className="w-4 h-4 mr-2" />
                        다운로드
                    </Button>
                </div>
            </div>

            {/* 2. KPI Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KPICard
                    title="총 매출액"
                    value={formatCurrency(totalSales)}
                    subValue={`일평균 ${formatCurrency(avgDailySales)}`}
                    icon={DollarSign}
                    colorClass="bg-blue-500 text-blue-600"
                />
                <KPICard
                    title="총 출고량"
                    value={`${NUMBER_FORMATTER.format(totalQty)} Box`}
                    subValue="기간 내 누적"
                    icon={Package}
                    colorClass="bg-emerald-500 text-emerald-600"
                />
                <KPICard
                    title="최다 판매 분류"
                    value={categoryShare[0]?.name || '-'}
                    subValue={`${((categoryShare[0]?.value || 0) / totalSales * 100).toFixed(1)}% 비중`}
                    icon={TrendingUp}
                    colorClass="bg-purple-500 text-purple-600"
                />
            </div>

            {/* Row 1: Trend (60%) + Pie (40%) */}
            <div className="flex flex-col lg:flex-row gap-4 h-[600px]">
                {/* Trend Chart */}
                <Card className="flex-[0.6] h-full flex flex-col">
                    <CardHeader className="pb-2">
                        <CardTitle>
                            {trendTitle}
                            {selectedProduct && <span className="text-sm font-normal text-blue-600 ml-2">({selectedProduct})</span>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 p-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                                data={dailyTrend}
                                margin={{ top: 12, right: 30, bottom: 12, left: 16 }}
                                onClick={(data) => {
                                    if (data && data.activePayload && data.activePayload.length > 0) {
                                        const clickedDate = data.activePayload[0].payload.fullDate;
                                        if (clickedDate) {
                                            setStartDate(clickedDate);
                                            setEndDate(clickedDate);
                                        }
                                    } else {
                                        setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
                                        setEndDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
                                    }
                                }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" scale="point" padding={{ left: 12, right: 48 }} tickMargin={10} />
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
                                    contentStyle={{
                                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '8px',
                                        padding: '12px'
                                    }}
                                    labelFormatter={(_label: any, payload: any[]) => {
                                        const full = payload?.[0]?.payload?.fullDate;
                                        return full || _label;
                                    }}
                                    formatter={(value, name, item) => {
                                        const dataKey = item?.dataKey || '';
                                        const isSales = dataKey === 'sales' || name === '매출액';

                                        const raw = Array.isArray(value) ? value[0] : value;
                                        const num = typeof raw === 'number' ? raw : Number(raw);
                                        return [
                                            isSales ? formatCurrency(num) : NUMBER_FORMATTER.format(num),
                                            isSales ? '매출액' : '출고량(Box)'
                                        ];
                                    }}
                                />
                                <Legend />
                                <Bar
                                    isAnimationActive={false}
                                    yAxisId="left"
                                    dataKey="quantity"
                                    name="출고량(Box)"
                                    fill="#2563EB"
                                    barSize={40}
                                    radius={[4, 4, 0, 0]}
                                >
                                    {dailyTrend.length <= 60 ? (
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
                            </ComposedChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Pie Chart */}
                <Card className="flex-[0.4] h-full" onClick={() => setSelectedCategory('all')}>
                    <CardHeader>
                        <CardTitle className="text-sm">분류별 매출 비중 {selectedPieCategory && <span className="text-xs font-normal text-muted-foreground ml-1">({selectedPieCategory})</span>}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[520px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={categoryShare}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={100}
                                    outerRadius={200}
                                    paddingAngle={2}
                                    dataKey="value"
                                    onClick={(data, _index, e) => {
                                        e.stopPropagation();
                                        const next = selectedCategory === '__others__' ? '기타' : selectedCategory;
                                        if (next === data.name) {
                                            setSelectedCategory('all');
                                        } else {
                                            setSelectedCategory(data.name === '기타' ? '__others__' : String(data.name));
                                        }
                                        setSelectedProduct(null);
                                    }}
                                    cursor="pointer"
                                    label={({ name, percent }) => percent < 0.02 ? '' : `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {categoryShare.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.name === selectedPieCategory ? '#2563EB' : COLORS[index % COLORS.length]}
                                            opacity={selectedPieCategory && selectedPieCategory !== entry.name ? 0.3 : 1}
                                        />
                                    ))}
                                </Pie>
                                <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                                <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '12px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Row 2: Category Pivot (60%) + Top 10 (40%) */}
            <div className="flex flex-col lg:flex-row gap-4 h-[500px]">
                {/* Category Pivot */}
                <div className="flex-[0.6] h-full overflow-hidden">
                    {!canShowDailyPivot ? (
                        <CompactTotalTable
                            title="분류별 기간 합계"
                            data={categoryTotalPivot}
                            rowKey="key"
                            rowLabel="분류"
                            quantityKey="quantity"
                            salesKey="salesAmount"
                        />
                    ) : (
                        <CompactPivotTable
                            title="분류별 일별 집계"
                            data={categoryPivot}
                            dates={dates}
                            rowKey="key"
                            rowLabel="분류"
                            valueKey="quantity"
                            secondaryValueKey="salesAmount"
                            selectedItems={selectedCategories}
                            onItemToggle={handleCategoryToggle}
                        />
                    )}
                </div>

                {/* Top 10 Products */}
                <Card className="flex-[0.4] h-full" onClick={() => setSelectedProduct(null)}>
                    <CardHeader>
                        <CardTitle className="text-sm">
                            TOP 10 출고 품목
                            {selectedPieCategory && <span className="text-xs font-normal text-muted-foreground ml-1">- {selectedPieCategory}</span>}
                            {selectedProduct && <span className="text-xs font-bold text-blue-600 ml-2">[{selectedProduct} 선택됨]</span>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[420px] p-0">
                        <div className="h-full overflow-y-auto pr-2">
                            <div style={{ height: Math.max(420, topProducts.length * 62) }}>
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
                                                setSelectedProduct(data.name === selectedProduct ? null : data.name);
                                            }}
                                            cursor="pointer"
                                        >
                                            {topProducts.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.name === selectedProduct ? '#2563EB' : COLORS[index % COLORS.length]} />
                                            ))}
                                            <LabelList dataKey="value" position="right" content={(props: any) => {
                                                const { x, y, width, height, value } = props;
                                                return (
                                                    <text x={x + width + 5} y={y + height / 2 + 4} fill="#666" fontSize={11} textAnchor="start">
                                                        {`${NUMBER_FORMATTER.format(value)} Box`}
                                                    </text>
                                                );
                                            }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Row 2.5: Selected Categories' Products Daily Pivot */}
            {selectedCategories.length > 0 && canShowDailyPivot && (
                <div className="h-[500px] overflow-hidden">
                    <CompactPivotTable
                        title={`선택된 분류 품목별 일별 집계 (${selectedCategories.join(', ')})`}
                        data={productPivot.filter((p: any) => {
                            const productCategory = productCategoryMap.get(p.key);
                            return productCategory && selectedCategories.includes(productCategory);
                        })}
                        dates={dates}
                        rowKey="key"
                        rowLabel="품목"
                        valueKey="quantity"
                        secondaryValueKey="salesAmount"
                    />
                </div>
            )}

            {/* Row 3: Product Pivot (60%) + AI Report (40%) */}
            <div className="flex flex-col lg:flex-row gap-4 h-[500px]">
                {/* Product Pivot */}
                <div className="flex-[0.6] h-full overflow-hidden">
                    {!canShowDailyPivot ? (
                        <CompactTotalTable
                            title="품목별 기간 합계"
                            data={productTotalPivot}
                            rowKey="key"
                            rowLabel="품목"
                            quantityKey="quantity"
                            salesKey="salesAmount"
                        />
                    ) : (
                        <CompactPivotTable
                            title="품목별 일별 집계"
                            data={productPivot}
                            dates={dates}
                            rowKey="key"
                            rowLabel="품목"
                            valueKey="quantity"
                            secondaryValueKey="salesAmount"
                        />
                    )}
                </div>

                {/* AI Analysis */}
                <div className="flex-[0.4] h-full overflow-y-auto">
                    <OutboundAIReport
                        startDate={startDate}
                        endDate={endDate}
                        category={selectedCategory}
                        searchQuery={searchQuery}
                        product={selectedProduct}
                        summaryStats={summaryStats}
                    />
                </div>
            </div>
        </div >
    );
}