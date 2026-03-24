import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, eachDayOfInterval, parseISO, isSameDay } from "date-fns";
import { ko } from "date-fns/locale";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from "recharts";
import { Loader2, Search, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DataTable from "@/components/data-table";
import type { OutboundRecord } from "@shared/schema";

// --- Types ---
type OutboundRecordWithBoxes = OutboundRecord;

type SortKey = 'salesAmount' | 'quantity';

// --- Helper Functions ---
const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");
const CURRENCY_FORMATTER = new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" });

function formatCurrency(value: number) {
    return CURRENCY_FORMATTER.format(value).replace("₩", "₩ ");
}

// --- Components ---

// 1. Pivot Table Component
const PivotTable = ({
    title,
    data,
    dates,
    rowKey,
    rowLabel,
    valueKey,
    secondaryValueKey,
    showTotal = true,
    onSort,
    sortKey
}: {
    title: string;
    data: any[];
    dates: Date[];
    rowKey: string;
    rowLabel: string;
    valueKey: string;
    secondaryValueKey?: string;
    showTotal?: boolean;
    onSort?: (key: SortKey) => void;
    sortKey?: SortKey;
}) => {
    const maxVal = Math.max(...data.flatMap(row => dates.map(d => row.values[format(d, 'yyyy-MM-dd')]?.[valueKey] || 0)));

    return (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden mb-6">
            <div className="p-4 border-b bg-gray-50 font-semibold text-lg flex justify-between items-center">
                <span>{title}</span>
                {onSort && (
                    <div className="flex items-center gap-2 text-sm font-normal">
                        <span className="text-gray-500">정렬:</span>
                        <Button
                            variant={sortKey === 'salesAmount' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-8"
                            onClick={() => onSort('salesAmount')}
                        >
                            판매금액순
                        </Button>
                        <Button
                            variant={sortKey === 'quantity' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-8"
                            onClick={() => onSort('quantity')}
                        >
                            수량순
                        </Button>
                    </div>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right border-collapse">
                    <thead>
                        <tr className="bg-gray-100 text-gray-700">
                            <th className="p-2 border text-left min-w-[150px] sticky left-0 bg-gray-100 z-10">{rowLabel}</th>
                            {dates.map(date => (
                                <th key={date.toString()} className="p-2 border min-w-[100px]">
                                    {format(date, 'yyyy. M. d.')}
                                </th>
                            ))}
                            {showTotal && <th className="p-2 border min-w-[100px] font-bold">총 합계</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                                <td className="p-2 border text-left font-medium sticky left-0 bg-white z-10">{row[rowKey]}</td>
                                {dates.map(date => {
                                    const dateKey = format(date, 'yyyy-MM-dd');
                                    const val = row.values[dateKey]?.[valueKey] || 0;
                                    const secVal = secondaryValueKey ? (row.values[dateKey]?.[secondaryValueKey] || 0) : null;

                                    const opacity = maxVal > 0 ? (val / maxVal) * 0.5 : 0;
                                    const bgStyle = val > 0 ? { backgroundColor: `rgba(59, 130, 246, ${opacity})` } : {};

                                    return (
                                        <td key={dateKey} className="p-2 border" style={bgStyle}>
                                            <div className="font-medium">{NUMBER_FORMATTER.format(val)}</div>
                                            {secVal !== null && (
                                                <div className="text-xs text-gray-500">{NUMBER_FORMATTER.format(secVal)}</div>
                                            )}
                                        </td>
                                    );
                                })}
                                {showTotal && (
                                    <td className="p-2 border font-bold bg-gray-50">
                                        <div>{NUMBER_FORMATTER.format(row.total[valueKey])}</div>
                                        {secondaryValueKey && (
                                            <div className="text-xs text-gray-600">{NUMBER_FORMATTER.format(row.total[secondaryValueKey])}</div>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                        <tr className="bg-gray-100 font-bold">
                            <td className="p-2 border text-left sticky left-0 bg-gray-100 z-10">총 합계</td>
                            {dates.map(date => {
                                const dateKey = format(date, 'yyyy-MM-dd');
                                const totalVal = data.reduce((sum, row) => sum + (row.values[dateKey]?.[valueKey] || 0), 0);
                                const totalSecVal = secondaryValueKey ? data.reduce((sum, row) => sum + (row.values[dateKey]?.[secondaryValueKey] || 0), 0) : 0;
                                return (
                                    <td key={dateKey} className="p-2 border">
                                        <div>{NUMBER_FORMATTER.format(totalVal)}</div>
                                        {secondaryValueKey && <div className="text-xs text-gray-600">{NUMBER_FORMATTER.format(totalSecVal)}</div>}
                                    </td>
                                );
                            })}
                            {showTotal && (
                                <td className="p-2 border">
                                    <div>{NUMBER_FORMATTER.format(data.reduce((sum, row) => sum + row.total[valueKey], 0))}</div>
                                    {secondaryValueKey && (
                                        <div className="text-xs text-gray-600">
                                            {NUMBER_FORMATTER.format(data.reduce((sum, row) => sum + row.total[secondaryValueKey], 0))}
                                        </div>
                                    )}
                                </td>
                            )}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- Main Component ---
export default function OutboundRecordsV2() {
    const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [sortKey, setSortKey] = useState<SortKey>('salesAmount');

    // Fetch Data
    const { data: outboundRecords = [], isLoading } = useQuery<OutboundRecordWithBoxes[]>({
        queryKey: ['/api/outbound', startDate, endDate],
        queryFn: async () => {
            const params = new URLSearchParams({ start: startDate, end: endDate, limit: '10000' });
            const res = await fetch(`/api/outbound?${params.toString()}`);
            if (!res.ok) throw new Error('Failed to fetch data');
            return res.json();
        }
    });

    // Extract Categories
    const categories = useMemo(() => {
        const cats = new Set(outboundRecords.map(r => r.category));
        return Array.from(cats).sort();
    }, [outboundRecords]);

    // Process Data
    const { categoryPivot, productPivot, dates, categoryShare, productShare, filteredRecords } = useMemo(() => {
        if (!outboundRecords.length) return { categoryPivot: [], productPivot: [], dates: [], categoryShare: [], productShare: [], filteredRecords: [] };

        // 1. Base Filter (Date & Search only) - For Category Chart
        const baseFilteredRecords = outboundRecords.filter(r => {
            const matchSearch = !searchQuery || r.productName.toLowerCase().includes(searchQuery.toLowerCase());
            return matchSearch;
        });

        // 2. Final Filter (Base + Category) - For Tables & Product Chart
        const filteredRecords = baseFilteredRecords.filter(r => {
            return selectedCategory === "all" || r.category === selectedCategory;
        });

        // 3. Dates
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        const dateRange = eachDayOfInterval({ start, end }).reverse();

        // 4. Pivot Data Helper
        const createPivot = (records: OutboundRecordWithBoxes[], groupBy: (r: OutboundRecordWithBoxes) => string) => {
            const map = new Map();
            records.forEach(r => {
                const key = groupBy(r);
                if (!map.has(key)) map.set(key, { values: {}, total: { quantity: 0, salesAmount: 0 } });
                const entry = map.get(key);
                const dateKey = format(new Date(r.outboundDate), 'yyyy-MM-dd');

                if (!entry.values[dateKey]) entry.values[dateKey] = { quantity: 0, salesAmount: 0 };

                const qty = r.boxQuantity ?? r.quantity ?? 0;
                const sales = r.salesAmount ?? 0;

                entry.values[dateKey].quantity += qty;
                entry.values[dateKey].salesAmount += sales;
                entry.total.quantity += qty;
                entry.total.salesAmount += sales;
            });

            return Array.from(map.entries())
                .map(([key, val]) => ({ key, ...val }))
                .sort((a, b) => {
                    if (sortKey === 'salesAmount') return b.total.salesAmount - a.total.salesAmount;
                    return b.total.quantity - a.total.quantity;
                });
        };

        const categoryPivot = createPivot(filteredRecords, r => r.category);
        const productPivot = createPivot(filteredRecords, r => r.productName);

        // For the Chart, we need a pivot on baseFilteredRecords to get the shares
        const categoryPivotForChart = createPivot(baseFilteredRecords, r => r.category);

        const categoryShare = categoryPivotForChart.map(c => ({
            name: c.key,
            value: c.total.salesAmount,
            quantity: c.total.quantity
        }));

        const productShare = filteredRecords
            .reduce((acc, r) => {
                const key = r.productName;
                const sales = r.salesAmount ?? 0;
                const existing = acc.find(x => x.name === key);
                if (existing) existing.value += sales;
                else acc.push({ name: key, value: sales });
                return acc;
            }, [] as { name: string; value: number }[])
            .sort((a, b) => b.value - a.value)
            .slice(0, 15);

        return { categoryPivot, productPivot, dates: dateRange, categoryShare, productShare, filteredRecords };
    }, [outboundRecords, startDate, endDate, selectedCategory, searchQuery, sortKey]);

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57'];

    if (isLoading) return <div className="flex justify-center p-12"><Loader2 className="animate-spin w-8 h-8 text-gray-400" /></div>;

    return (
        <div className="space-y-6 p-4">
            {/* Filters */}
            <div className="bg-white p-4 rounded-lg border shadow-sm flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                    {/* Date Range */}
                    <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-700 whitespace-nowrap">조회 기간</span>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="border rounded px-2 py-1.5 text-sm"
                        />
                        <span>~</span>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="border rounded px-2 py-1.5 text-sm"
                        />
                    </div>

                    {/* Category Filter */}
                    <div className="flex items-center gap-2 min-w-[200px]">
                        <span className="font-semibold text-gray-700 whitespace-nowrap">분류</span>
                        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                            <SelectTrigger>
                                <SelectValue placeholder="전체" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">전체</SelectItem>
                                {categories.map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Product Search */}
                    <div className="flex items-center gap-2 w-full md:w-[300px]">
                        <span className="font-semibold text-gray-700 whitespace-nowrap">품목</span>
                        <div className="relative w-full">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="품목명 검색 (포함)"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                    </div>
                </div>

                <Button variant="outline" size="sm" onClick={() => {
                    setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
                    setEndDate(format(new Date(), 'yyyy-MM-dd'));
                    setSelectedCategory("all");
                    setSearchQuery("");
                }}>
                    필터 초기화
                </Button>
            </div>

            {/* Section 1: Category Pivot */}
            <PivotTable
                title="분류별 일별 수량/판매금액"
                data={categoryPivot}
                dates={dates}
                rowKey="key"
                rowLabel="분류"
                valueKey="quantity"
                secondaryValueKey="salesAmount"
                onSort={setSortKey}
                sortKey={sortKey}
            />

            {/* Section 2: Product Pivot */}
            <PivotTable
                title="품목별 일별 수량"
                data={productPivot}
                dates={dates}
                rowKey="key"
                rowLabel="품목"
                valueKey="quantity"
                onSort={setSortKey}
                sortKey={sortKey}
            />

            {/* Section 3: Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Category Share */}
                <div className="bg-white p-4 rounded-lg border shadow-sm h-[400px]">
                    <h3 className="font-semibold mb-4 text-center">분류별 판매금액 비중</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={categoryShare}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={2}
                                dataKey="value"
                                onClick={(data) => setSelectedCategory(data.name === selectedCategory ? "all" : data.name)}
                                cursor="pointer"
                            >
                                {categoryShare.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke={entry.name === selectedCategory ? "#000" : "none"} strokeWidth={2} />
                                ))}
                            </Pie>
                            <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend layout="vertical" align="right" verticalAlign="middle" />
                        </PieChart>
                    </ResponsiveContainer>
                    <p className="text-center text-xs text-gray-500 mt-[-20px]">* 차트를 클릭하여 해당 분류로 필터링할 수 있습니다</p>
                </div>

                {/* Product Share */}
                <div className="bg-white p-4 rounded-lg border shadow-sm h-[400px]">
                    <h3 className="font-semibold mb-4 text-center">
                        {selectedCategory !== "all" ? `${selectedCategory} 품목별 비중` : "전체 품목별 비중 (Top 15)"}
                    </h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={productShare}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={100}
                                paddingAngle={2}
                                dataKey="value"
                            >
                                {productShare.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <RechartsTooltip formatter={(value: number) => formatCurrency(value)} />
                            <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Section 4: Detailed List */}
            <div className="mt-8">
                <h3 className="font-semibold text-lg mb-4">출고 상세 내역</h3>
                <DataTable
                    title=""
                    data={filteredRecords}
                    columns={[
                        { key: 'outboundDate', label: '출고 날짜', render: (v) => format(new Date(v), 'yyyy. M. d.') },
                        { key: 'productName', label: '상품명' },
                        { key: 'category', label: '분류' },
                        { key: 'barcode', label: '바코드' },
                        { key: 'boxQuantity', label: '출고 수량(박스)', render: (v, r) => NUMBER_FORMATTER.format(v ?? r.quantity ?? 0) },
                        { key: 'unitCount', label: '출고 수량(낱개)', render: (v) => v ? NUMBER_FORMATTER.format(v) : '-' },
                        { key: 'salesAmount', label: '판매금액', render: (v) => v ? formatCurrency(v) : '-' },
                        { key: 'notes', label: '비고' }
                    ]}
                    searchPlaceholder="결과 내 재검색..."
                />
            </div>
        </div>
    );
}
