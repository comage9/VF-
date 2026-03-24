import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, subMonths, subYears, eachDayOfInterval, parseISO, isSameDay, isValid, startOfWeek, startOfMonth, endOfMonth, eachWeekOfInterval, getWeek, addDays, differenceInDays, differenceInWeeks } from "date-fns";
import FCInboundUpload from "./fc-inbound-upload";
import {
    ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, LabelList
} from "recharts";
import {
    Loader2, Search, TrendingUp, Package, DollarSign, Calendar,
    Filter, Download, Sparkles, HelpCircle, Award
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
        boxQuantity: record?.boxQuantity ?? record?.box_quantity ?? null,
        unitCount: record?.unitCount ?? record?.unit_count ?? null,
        quantity: record?.quantity,  // FC inbound uses quantity field
        logisticsCenter,
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

// AI Report Component
const OutboundAIReport = ({ startDate, endDate, category, searchQuery, product, summaryStats, apiPrefix }: any) => {
    const { data, isLoading, isError } = useQuery({
        queryKey: [apiPrefix + '/ai-analysis', startDate, endDate, category, searchQuery, product],
        queryFn: async () => {
            const res = await fetch(`${apiPrefix}/ai-analysis`, {
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
}: {
    filteredRecords: OutboundRecordWithBoxes[];
    startDate: string;
    endDate: string;
    groupBy: 'day' | 'week' | 'month';
    quantityLabel?: string;
    quantityUnit?: string;
    salesLabel?: string;
    selectedCategory?: string;
    onCategorySelect?: (category: string) => void;
    serverPivotData?: ServerPivotItem[];
}) => {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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
        }

        return columns;
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

    // Sort categories by total sales
    const sortedCategories = Array.from(pivotData.categoryTotals.entries())
        .sort((a, b) => b[1].salesAmount - a[1].salesAmount);

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="py-3 px-4 border-b bg-gray-50/50">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    📦 통합 기간 합계 테이블
                    <span className="text-xs font-normal text-gray-500">
                        ({groupBy === 'day' ? '일별' : groupBy === 'week' ? '주별' : '월별'})
                    </span>
                </CardTitle>
            </CardHeader>
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
                                        {dateColumns.map(col => (
                                            <th key={col.key} className="px-2 py-2 text-center font-medium text-gray-500 min-w-[80px] whitespace-nowrap">
                                                {col.label}
                                            </th>
                                        ))}
                                        <th className="px-2 py-2 text-right font-medium text-gray-500 min-w-[100px] bg-gray-50">
                                            합계
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {/* Grand Total Row */}
                                    <tr className="bg-blue-50 font-bold">
                                        <td className="px-2 py-2 whitespace-nowrap sticky left-0 bg-blue-50 border-r z-20">
                                            📊 전체 합계
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
                                        <td className="px-2 py-2 text-right whitespace-nowrap text-blue-900 font-bold bg-blue-50">
                                            <div>{NUMBER_FORMATTER.format(grandTotalQuantity)}</div>
                                            <div className="text-[10px]">{formatCurrency(grandTotalSales)}</div>
                                        </td>
                                    </tr>

                                    {/* Category Rows */}
                                    {sortedCategories.map(([category, totals]) => {
                                        const isExpanded = expandedCategories.has(category);
                                        const isSelected = selectedCategory === category;
                                        const share = grandTotalSales > 0 ? (totals.salesAmount / grandTotalSales) * 100 : 0;

                                        // Get sorted products for this category
                                        const categoryProducts = pivotData.productTotals.get(category);
                                        const sortedProducts = categoryProducts
                                            ? Array.from(categoryProducts.entries())
                                                .sort((a, b) => b[1].salesAmount - a[1].salesAmount)
                                            : [];

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
                                                    <td className="px-2 py-2 text-right whitespace-nowrap font-bold text-gray-900 bg-white">
                                                        <div>{NUMBER_FORMATTER.format(totals.quantity)}</div>
                                                        <div className="text-[10px] text-gray-600">{formatCurrency(totals.salesAmount)}</div>
                                                    </td>
                                                </tr>

                                                {/* Product Rows (when expanded) */}
                                                {isExpanded && sortedProducts.map(([productName, prodTotals]) => {
                                                    const prodShare = totals.salesAmount > 0
                                                        ? (prodTotals.salesAmount / totals.salesAmount) * 100
                                                        : 0;

                                                    return (
                                                        <tr key={`prod-${category}-${productName}`} className="hover:bg-blue-50 bg-gray-50/50">
                                                            <td className="px-2 py-1 whitespace-nowrap sticky left-0 bg-gray-50/80 border-r z-10 pl-6">
                                                                <span className="text-gray-500">📦</span>
                                                                <span className="ml-1 text-gray-700">{productName}</span>
                                                                <span className="text-gray-400 text-[9px] ml-1">({prodShare.toFixed(1)}%)</span>
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
                                                            <td className="px-2 py-1 text-right whitespace-nowrap text-gray-700 bg-gray-50/80">
                                                                <div className="text-[9px]">{NUMBER_FORMATTER.format(prodTotals.quantity)}</div>
                                                                <div className="text-[8px] text-gray-500">{formatCurrency(prodTotals.salesAmount)}</div>
                                                            </td>
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

    // Find previous period data from the full trend array
    // We need to pass the full trend data to calculate growth
    const allTrendData = payload[0]?.payload?.allTrendData || [];
    const currentIndex = allTrendData.findIndex((d: any) => d.fullDate === currentData.fullDate);

    let salesGrowth = null;
    let qtyGrowth = null;

    if (currentIndex > 0) {
        const prevData = allTrendData[currentIndex - 1];
        const prevSales = Number(prevData?.sales || 0);
        const prevQty = Number(prevData?.quantity || 0);

        if (prevSales > 0) {
            salesGrowth = ((currentSales - prevSales) / prevSales) * 100;
        }
        if (prevQty > 0) {
            qtyGrowth = ((currentQty - prevQty) / prevQty) * 100;
        }
    }

    const salesShare = totalSales > 0 ? (currentSales / totalSales) * 100 : 0;
    const qtyShare = totalQty > 0 ? (currentQty / totalQty) * 100 : 0;

    const formatCurrency = (value: number) => {
        if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
        if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
        return value.toLocaleString();
    };

    const renderGrowth = (growth: number | null) => {
        if (growth === null) return <span className="text-gray-400">-</span>;
        const isPositive = growth >= 0;
        const color = isPositive ? 'text-emerald-600' : 'text-red-600';
        const icon = isPositive ? '▲' : '▼';
        return <span className={color}>{icon} {Math.abs(growth).toFixed(1)}%</span>;
    };

    return (
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-4 min-w-[240px]">
            <div className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">
                {currentData.fullDate || label}
            </div>

            {/* Sales Row */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    <span className="text-sm text-gray-600">매출액</span>
                </div>
                <div className="text-right">
                    <div className="font-semibold text-gray-900">{formatCurrency(currentSales)}</div>
                    <div className="text-xs text-gray-500">비중 {salesShare.toFixed(1)}%</div>
                </div>
            </div>
            {salesGrowth !== null && (
                <div className="flex items-center justify-between mb-3 pl-5">
                    <span className="text-xs text-gray-500">전기 대비</span>
                    {renderGrowth(salesGrowth)}
                </div>
            )}

            {/* Quantity Row */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <span className="text-sm text-gray-600">출고량</span>
                </div>
                <div className="text-right">
                    <div className="font-semibold text-gray-900">{currentQty.toLocaleString()} Box</div>
                    <div className="text-xs text-gray-500">비중 {qtyShare.toFixed(1)}%</div>
                </div>
            </div>
            {qtyGrowth !== null && (
                <div className="flex items-center justify-between pl-5">
                    <span className="text-xs text-gray-500">전기 대비</span>
                    {renderGrowth(qtyGrowth)}
                </div>
            )}
        </div>
    );
};

// --- Main Component ---
interface OutboundDashboardUnifiedProps {
    dataSource?: 'vf' | 'fc';
    activeTab?: string;
}

export default function OutboundDashboardUnified({ dataSource = 'vf', activeTab }: OutboundDashboardUnifiedProps = {}) {
    const getApiPrefix = () => dataSource === 'fc' ? '/api/fc-inbound' : '/api/outbound';
    const labels = getDataLabels(dataSource);

    // Default: Different for VF/FC
    // VF: Last 2 weeks (14 days including yesterday) - day mode
    // FC: Last 12 months - month mode
    const isFC = dataSource === 'fc';
    const [startDate, setStartDate] = useState(() => {
        if (isFC) {
            // FC: 12 months ago
            return format(subMonths(new Date(), 12), 'yyyy-MM-dd');
        } else {
            // VF: 14 days ago
            const yesterday = subDays(new Date(), 1);
            const twoWeeksAgo = subDays(yesterday, 13);
            return format(twoWeeksAgo, 'yyyy-MM-dd');
        }
    });
    const [endDate, setEndDate] = useState(() => {
        const yesterday = subDays(new Date(), 1);
        return format(yesterday, 'yyyy-MM-dd');
    });
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    // FC: month mode, VF: day mode (auto switches based on period)
    const [groupByMode, setGroupByMode] = useState<'auto' | 'day' | 'week' | 'month'>(() => isFC ? 'month' : 'day');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedLogisticsCenter, setSelectedLogisticsCenter] = useState<string[]>([]);  // 다중 선택
    const [selectedRangePreset, setSelectedRangePreset] = useState<string>('');  // 선택된 기간 프리셋

    // dataSource가 변경될 때 필터 초기화 (VF/FC 독립적인 필터링)
    useEffect(() => {
        // Reset to default values based on dataSource
        const isFC = dataSource === 'fc';
        setSelectedCategories([]);
        setSelectedCategory('all');
        setSelectedProduct(null);
        setSelectedProducts([]);
        setSearchQuery("");
        setSearchInput("");
        setSelectedLogisticsCenter([]);
        // Reset date range to default
        if (isFC) {
            setStartDate(format(subMonths(new Date(), 12), 'yyyy-MM-dd'));
            setGroupByMode('month');
        } else {
            const yesterday = subDays(new Date(), 1);
            const twoWeeksAgo = subDays(yesterday, 13);
            setStartDate(format(twoWeeksAgo, 'yyyy-MM-dd'));
            setGroupByMode('day');
        }
        setEndDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
    }, [dataSource]);

    // 필터 초기화 함수 (기본 설정으로 복원)
    const resetFilters = useCallback(() => {
        const isFC = dataSource === 'fc';
        setSelectedCategories([]);
        setSelectedCategory('all');
        setSelectedProduct(null);
        setSelectedProducts([]);
        setSearchQuery("");
        setSearchInput("");
        setSelectedLogisticsCenter([]);
        // Reset date range to default
        if (isFC) {
            setStartDate(format(subMonths(new Date(), 12), 'yyyy-MM-dd'));
            setGroupByMode('month');
        } else {
            const yesterday = subDays(new Date(), 1);
            const twoWeeksAgo = subDays(yesterday, 13);
            setStartDate(format(twoWeeksAgo, 'yyyy-MM-dd'));
            setGroupByMode('day');
        }
        setEndDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'));
    }, [dataSource]);

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

    // Quick Date Selection Handler
    const handleQuickDateChange = (value: string) => {
        setSelectedRangePreset(value);  // 선택된 기간 프리셋 저장
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

        if (diffDays > 180) return 'week';
        if (diffDays > 90) return 'week';
        return 'day';
    }, [startDate, endDate, groupByMode]);

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

    const canShowDailyPivot = rangeDays <= 60;

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
        enabled: (canShowDailyPivot || groupBy === 'week' || groupBy === 'month') && !isStatsLoading,
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
        enabled: (canShowDailyPivot || groupBy === 'week' || groupBy === 'month') && !isStatsLoading,
        staleTime: 60_000,
    });

    // Fetch Records (Limited for Performance)
    const { data: outboundRecords = [], isLoading: isRecordsLoading, isError: isRecordsError, error: recordsError } = useQuery<OutboundRecordWithBoxes[]>({
        queryKey: [getApiPrefix(), startDate, endDate], // Records fetch is independent of grouping
        queryFn: async () => {
            const params = new URLSearchParams({ start: startDate, end: endDate, limit: '10000' });
            const res = await fetch(`${getApiPrefix()}?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch data');
            const raw = await res.json();
            if (!Array.isArray(raw)) return [];
            return raw.map(normalizeOutboundRecord);
        },
    });

    const isLoading = isStatsLoading || isRecordsLoading;

    // Extract unique product names for autocomplete
    const uniqueProductNames = useMemo(() => {
        const productNames = new Set<string>();
        outboundRecords.forEach(record => {
            if (record.productName && record.productName.trim()) {
                productNames.add(record.productName.trim());
            }
        });
        return Array.from(productNames).sort();
    }, [outboundRecords]);

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

    // Filter product names based on search input
    const filteredProductNames = useMemo(() => {
        if (!searchInput || searchInput.length < 1) return [];
        const query = searchInput.toLowerCase();
        return uniqueProductNames.filter(name => 
            name.toLowerCase().includes(query)
        ).slice(0, 10); // Limit to 10 suggestions
    }, [uniqueProductNames, searchInput]);

    // Handle autocomplete selection
    const handleAutocompleteSelect = (productName: string) => {
        setSearchInput(productName);
        setSearchQuery(productName);
        setShowAutocomplete(false);
        setHighlightedIndex(-1);
        setSelectedProduct(null);
    };

    // Handle input focus and blur
    const handleInputFocus = () => {
        if (searchInput.length >= 1 && filteredProductNames.length > 0) {
            setShowAutocomplete(true);
        }
    };

    const handleInputBlur = () => {
        // Delay to allow click on autocomplete item
        setTimeout(() => {
            setShowAutocomplete(false);
            setHighlightedIndex(-1);
        }, 150);
    };

    // Handle keyboard navigation in autocomplete
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            if (highlightedIndex >= 0 && filteredProductNames[highlightedIndex]) {
                handleAutocompleteSelect(filteredProductNames[highlightedIndex]);
            } else {
                setSearchQuery(searchInput);
                setShowAutocomplete(false);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
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

        const aggregateRecords = (records: OutboundRecordWithBoxes[], mode: 'day' | 'week' | 'month') => {
            const map = new Map<string, { fullDate: string; date: string; sales: number; quantity: number }>();
            records.forEach(record => {
                const rawDate = record.outboundDate;
                const parsed = rawDate ? parseISO(String(rawDate)) : null;
                if (!parsed || !isValid(parsed)) return;
                let keyDate = parsed;
                if (mode === 'week') keyDate = startOfWeek(parsed, { weekStartsOn: 1 });
                else if (mode === 'month') keyDate = startOfMonth(parsed);

                // Format key based on mode
                let key: string;
                let label: string;
                if (mode === 'month') {
                    key = format(keyDate, 'yyyy-MM');
                    label = format(keyDate, 'yyyy.MM');
                } else if (mode === 'week') {
                    key = format(keyDate, 'yyyy-MM-dd');
                    label = format(keyDate, 'MM/dd') + '-' + format(addDays(keyDate, 6), 'MM/dd');
                } else {
                    key = format(keyDate, 'yyyy-MM-dd');
                    label = format(parsed, 'MM/dd');
                }

                const entry = map.get(key) || { fullDate: key, date: label, sales: 0, quantity: 0 };
                entry.sales += Number(record.salesAmount ?? 0);
                const qty = record.boxQuantity ?? record.quantity ?? 0;
                entry.quantity += Number(qty);
                map.set(key, entry);
            });
            return Array.from(map.values()).sort((a, b) => a.fullDate.localeCompare(b.fullDate));
        };

        const dailyTrend = hasMultiCategorySelection
            ? aggregateRecords(filtered, groupBy)
            : (outboundStats.dailyTrend ? outboundStats.dailyTrend.map((d: any) => {
                try {
                    // 날짜 포맷: 그대로 사용 (YYYY-MM-DD)
                    // 월별: "2025-11-01" 형식 유지
                    // 주별: "2025-11-01" 형식 유지
                    // 일별: "11/07" 형식으로 변환
                    let dateDisplay = d.date;
                    if (groupBy === 'day') {
                        dateDisplay = d.date.substring(5).replace('-', '/');
                    }
                    return {
                        fullDate: d.date,
                        date: dateDisplay,
                        sales: Number(d.salesAmount ?? d.supplyAmount ?? 0),
                        quantity: Number(d.quantity ?? 0)
                    };
                } catch {
                    return { fullDate: '', date: '', sales: 0, quantity: 0 };
                }
            }) : []);

        // Add allTrendData reference to each item for growth calculation
        const dailyTrendWithAllData = dailyTrend.map(item => ({
            ...item,
            allTrendData: dailyTrend
        }));

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

        let categoryShare: Array<{ name: string; value: number }> = [];
        let categoryShareFull: Array<{ name: string; value: number }> = []; // 전체 분류 (리스트용)

        if (hasMultiCategorySelection) {
            const categoryMap = new Map<string, { name: string; value: number }>();
            filtered.forEach(r => {
                const key = normalizeCategoryKey(String(r.category || ''));
                if (!key) return;
                const entry = categoryMap.get(key) || { name: key, value: 0 };
                entry.value += Number(r.salesAmount ?? 0);
                categoryMap.set(key, entry);
            });
            const sortedCategories = Array.from(categoryMap.values()).sort((a, b) => b.value - a.value);

            // 상위 8개 + 기타
            const top8 = sortedCategories.slice(0, 8);
            const others = sortedCategories.slice(8).reduce((sum: number, cat) => sum + cat.value, 0);

            categoryShare = [...top8];
            if (others > 0) {
                categoryShare.push({ name: '기타', value: others });
            }

            // 전체 분류는 리스트용으로 저장
            categoryShareFull = sortedCategories;
        } else if (outboundStats.categoryBreakdown) {
            const serverCats = outboundStats.categoryBreakdown.map((c: any) => ({
                name: c.category,
                value: Number(c.salesAmount ?? c.supplyAmount ?? 0)
            })).sort((a, b) => b.value - a.value);

            // 상위 8개 + 기타
            const top8 = serverCats.slice(0, 8);
            const others = serverCats.slice(8).reduce((sum: number, c: any) => sum + c.value, 0);

            categoryShare = [...top8];
            if (others > 0) {
                categoryShare.push({ name: '기타', value: others });
            }

            // 전체 분류는 리스트용으로 저장
            categoryShareFull = serverCats;
        }

        // Calculate total quantity for share percentage in top products
        const totalQtyForTopProducts = filtered.reduce((sum, r) => sum + Number(r.boxQuantity ?? r.quantity ?? 0), 0);

        const topProducts = hasMultiCategorySelection
            ? Array.from(filtered.reduce((acc, r) => {
                const name = String(r.productName || '-');
                const entry = acc.get(name) || { name, value: 0, sales: 0, share: 0 };
                entry.value += Number(r.boxQuantity ?? r.quantity ?? 0);
                entry.sales += Number(r.salesAmount ?? 0);
                acc.set(name, entry);
                return acc;
            }, new Map<string, { name: string; value: number; sales: number; share: number }>())
                .values())
                .map(p => ({
                    ...p,
                    share: totalQtyForTopProducts > 0 ? (p.value / totalQtyForTopProducts) * 100 : 0
                }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 30)
            : (outboundTopProducts || [])
                .map((r: any) => ({
                    name: String(r?.name || '-'),
                    value: Number(r?.quantity || 0),
                    sales: Number(r?.salesAmount ?? r?.supplyAmount ?? 0),
                    share: totalQty > 0 ? (Number(r?.quantity || 0) / totalQty) * 100 : 0,
                }))
                .sort((a: any, b: any) => (b.value || 0) - a.value)
                .slice(0, 30);

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
            mode: 'day' | 'week' | 'month'
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
                }
                if (mode === 'month') {
                    dateKey = format(startOfMonth(date), 'yyyy-MM-dd');
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

        const categoryPivot = (canShowDailyPivot || groupBy === 'week' || groupBy === 'month')
            ? (hasMultiCategorySelection ? createPivotByRange(filtered, r => r.category, groupBy) : categoryPivotServer)
            : [];
        const productPivot = (canShowDailyPivot || groupBy === 'week' || groupBy === 'month')
            ? (hasMultiCategorySelection ? createPivotByRange(filtered, r => r.productName, groupBy) : productPivotServer)
            : [];
        const categoryTotalPivot = createTotalPivot(r => r.category);
        const productTotalPivot = createTotalPivot(r => r.productName);

        const displayDates = (() => {
            if (!canShowDailyPivot && groupBy === 'day') return [] as Date[];
            if (groupBy === 'week') {
                const weeks = new Set<string>();
                const start = parseISO(startDate);
                const end = parseISO(endDate);
                if (isValid(start) && isValid(end)) {
                    const range = eachDayOfInterval({ start, end }).filter(d => !isSameDay(d, new Date()));
                    range.forEach(d => weeks.add(format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')));
                }
                return Array.from(weeks).sort().map(d => parseISO(d));
            }
            if (groupBy === 'month') {
                const months = new Set<string>();
                const start = parseISO(startDate);
                const end = parseISO(endDate);
                if (isValid(start) && isValid(end)) {
                    const range = eachDayOfInterval({ start, end }).filter(d => !isSameDay(d, new Date()));
                    range.forEach(d => months.add(format(startOfMonth(d), 'yyyy-MM-dd')));
                }
                return Array.from(months).sort().map(d => parseISO(d));
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
    }, [outboundRecords, outboundStats, startDate, endDate, selectedCategory, selectedCategories, searchQuery, selectedProduct, selectedLogisticsCenter, groupBy, outboundTopProducts, canShowDailyPivot, categoryPivotServer, productPivotServer]);

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

    const { totalSales, totalQty, avgDailySales, dailyTrend, categoryShare, categoryShareFull, topProducts, categoryPivot, productPivot, dates, summaryStats, categoryTotalPivot, productTotalPivot } = processedData;

    const trendTitle = groupBy === 'day'
        ? '일별 매출 및 출고량 추이'
        : groupBy === 'week'
            ? '주별 매출 및 출고량 추이'
            : '월별 매출 및 출고량 추이';

    return (
        <div className="space-y-6 p-2 bg-gray-50/30 min-h-screen">
            {/* FC Inbound Upload Section */}
            {dataSource === 'fc' && <FCInboundUpload onUploadComplete={() => window.location.reload()} />}
            {/* 1. Unified Filter Bar */}
            <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col lg:flex-row gap-4 items-end lg:items-center justify-between sticky top-0 z-20">
                <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />

                        {/* Quick Date Select */}
                        <Select value={selectedRangePreset} onValueChange={handleQuickDateChange}>
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
                            onChange={e => {
                                // 날짜가 완전히 선택되었는지 확인 (YYYY-MM-DD 형식)
                                const value = e.target.value;
                                if (value && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                    setStartDate(value);
                                    // 프리셋 선택 초기화
                                    setSelectedRangePreset('');
                                }
                            }}
                            className="border rounded-md px-2 py-1.5 text-sm bg-gray-50"
                        />
                        <span className="text-gray-400">~
                        </span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => {
                                // 날짜가 완전히 선택되었는지 확인 (YYYY-MM-DD 형식)
                                const value = e.target.value;
                                if (value && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
                                    setEndDate(value);
                                    // 프리셋 선택 초기화
                                    setSelectedRangePreset('');
                                }
                            }}
                            className="border rounded-md px-2 py-1.5 text-sm bg-gray-50"
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

                    <div className="relative w-full md:w-[250px]">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="품목명 검색 (엔터키로 검색)"
                            value={searchInput}
                            onChange={e => {
                                setSearchInput(e.target.value);
                                if (e.target.value.length >= 1) {
                                    setShowAutocomplete(true);
                                } else {
                                    setShowAutocomplete(false);
                                }
                                setHighlightedIndex(-1);
                            }}
                            onKeyDown={handleKeyDown}
                            className="pl-9 pr-8 h-9 text-sm"
                        />
                        {searchInput && (
                            <button
                                onClick={() => {
                                    setSearchInput("");
                                    setSearchQuery("");
                                    setShowAutocomplete(false);
                                }}
                                className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* 필터 초기화 버튼 */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={resetFilters}
                        className="h-9 text-gray-600 hover:text-gray-900"
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

            {/* Row 1: Trend (60%) + Pie (40%) */}
            <div className="flex flex-col lg:flex-row gap-4 h-[500px]">
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
                                <Tooltip
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

                {/* 분류별 비중: 리스트 + 파이 차트 */}
                <Card className="flex-[0.4] h-full flex flex-col">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            {labels.categorySales}
                            {selectedPieCategory && <span className="text-xs font-normal text-blue-600 ml-1">({selectedPieCategory})</span>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 flex-1 flex flex-col min-h-0">
                        <div className="flex gap-3 h-full min-h-0">
                            {/* 왼쪽: 상위 분류 리스트 */}
                            <div className="flex-1 overflow-y-auto min-h-0">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-white">
                                        <tr className="border-b">
                                            <th className="text-left py-1.5 text-gray-600 font-medium">분류</th>
                                            <th className="text-right py-1.5 text-gray-600 font-medium">금액</th>
                                            <th className="text-right py-1.5 text-gray-600 font-medium">비중</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(categoryShareFull || categoryShare).map((cat) => {
                                            const isSelected = selectedPieCategory === cat.name ||
                                                              (selectedPieCategory === '__others__' && cat.name === '기타') ||
                                                              (selectedPieCategory === 'all' && cat.name === categoryShare[0]?.name);
                                            const share = totalSales > 0 ? (cat.value / totalSales) * 100 : 0;

                                            return (
                                                <tr
                                                    key={cat.name}
                                                    onClick={() => {
                                                        if (selectedCategories.length > 0) return;
                                                        const next = selectedPieCategory === cat.name ? 'all' : (cat.name === '기타' ? '__others__' : cat.name);
                                                        setSelectedCategory(next);
                                                        setSelectedProduct(null);
                                                    }}
                                                    className={`border-b cursor-pointer hover:bg-blue-50 transition-colors ${
                                                        isSelected ? 'bg-blue-100 font-semibold' : ''
                                                    }`}
                                                >
                                                    <td className="py-1">{cat.name}</td>
                                                    <td className="py-1 text-right">{formatCurrency(cat.value)}</td>
                                                    <td className="py-1 text-right">{share.toFixed(1)}%</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* 오른쪽: 파이 차트 */}
                            <div className="flex-1 flex items-center justify-center min-h-0">
                                <ResponsiveContainer width="100%" height="200">
                                    <PieChart>
                                        <Pie
                                            data={categoryShare}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={2}
                                            dataKey="value"
                                            onClick={(data, _index, e) => {
                                                e.stopPropagation();
                                                if (selectedCategories.length > 0) return;
                                                const next = selectedPieCategory === '__others__' ? '기타' : selectedPieCategory;
                                                if (next === data.name) {
                                                    setSelectedCategory('all');
                                                } else {
                                                    setSelectedCategory(data.name === '기타' ? '__others__' : String(data.name));
                                                }
                                                setSelectedProduct(null);
                                            }}
                                            cursor={selectedCategories.length > 0 ? 'default' : 'pointer'}
                                            label={({ name, percent }) => percent < 0.03 ? '' : `${name} ${(percent * 100).toFixed(0)}%`}
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
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

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
                <div className="flex-[0.6] h-full overflow-hidden">
                    {groupBy === 'day' && rangeDays > 60 ? (
                        <Card className="h-full flex flex-col items-center justify-center">
                            <CardContent className="text-center p-8">
                                <Filter className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                                    일별 기간 합계 테이블 제한
                                </h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    선택한 기간이 {rangeDays}일로 너무 깁니다. (최대 60일)
                                </p>
                                <p className="text-xs text-gray-400">
                                    주별 또는 월별 집계를 선택하거나, 기간을 60일 이내로 설정해주세요.
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
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
                        />
                    )}
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
                                            <LabelList dataKey="value" position="right" content={(props: any) => {
                                                const { x, y, width, height, value, payload } = props;
                                                const share = payload?.share || 0;
                                                return (
                                                    <text x={x + width + 5} y={y + height / 2 + 4} fill="#666" fontSize={11} textAnchor="start">
                                                        {`${NUMBER_FORMATTER.format(value)} Box (${share.toFixed(1)}%)`}
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

            {/* Row 3: AI Analysis (100% width) */}
            <div className="flex flex-col lg:flex-row gap-4 h-[800px]">
                {/* AI Analysis - Full Width */}
                <div className="flex-1 h-full overflow-y-auto">
                    <OutboundAIReport
                        startDate={startDate}
                        endDate={endDate}
                        category={selectedCategory}
                        searchQuery={searchQuery}
                        product={selectedProduct}
                        summaryStats={summaryStats}
                        apiPrefix={getApiPrefix()}
                    />
                </div>
            </div>
        </div >
    );
}