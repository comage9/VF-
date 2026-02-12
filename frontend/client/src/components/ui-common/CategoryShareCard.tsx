import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { useState } from "react";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1'];

export interface CategoryShareData {
    name: string;
    value: number;
}

interface CategoryShareCardProps {
    title?: string;
    data: CategoryShareData[];
    fullData?: CategoryShareData[];
    totalValue: number;
    currencyFormatter?: (value: number) => string;
    selectedCategory?: string;
    onCategorySelect?: (category: string) => void;
    topN?: number;
    height?: number;
    showList?: boolean;
}

export default function CategoryShareCard({
    title = '분류별 비중',
    data,
    fullData,
    totalValue,
    currencyFormatter = (v) => `₩${v.toLocaleString()}`,
    selectedCategory,
    onCategorySelect,
    topN = 8,
    height = 200,
    showList = true
}: CategoryShareCardProps) {
    const [internalSelection, setInternalSelection] = useState<string | null>(null);
    const effectiveSelection = selectedCategory !== undefined ? selectedCategory : internalSelection;

    // Prepare chart data (Top N + Others)
    const chartData = topN > 0
        ? data.slice(0, topN).concat({
            name: '기타',
            value: data.slice(topN).reduce((sum, cat) => sum + cat.value, 0)
        }).filter(cat => cat.value > 0)
        : data;

    // Use fullData for list if available, otherwise use data
    const listData = fullData || data;

    const handleCategoryClick = (categoryName: string) => {
        if (onCategorySelect) {
            const isSame = effectiveSelection === categoryName;
            const next = isSame ? 'all' : (categoryName === '기타' ? '__others__' : categoryName);
            onCategorySelect(next);
        } else {
            setInternalSelection(prev => prev === categoryName ? null : categoryName);
        }
    };

    const isSelected = (categoryName: string) => {
        if (effectiveSelection === 'all') return categoryName === chartData[0]?.name;
        if (effectiveSelection === '__others__') return categoryName === '기타';
        return effectiveSelection === categoryName;
    };

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 flex-1 flex flex-col min-h-0">
                <div className="flex gap-3 h-full min-h-0">
                    {/* List Table */}
                    {showList && (
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
                                    {listData.map((cat) => {
                                        const share = totalValue > 0 ? (cat.value / totalValue) * 100 : 0;
                                        const selected = isSelected(cat.name);

                                        return (
                                            <tr
                                                key={cat.name}
                                                onClick={() => handleCategoryClick(cat.name)}
                                                className={`border-b cursor-pointer hover:bg-blue-50 transition-colors ${
                                                    selected ? 'bg-blue-100 font-semibold' : ''
                                                }`}
                                            >
                                                <td className="py-1">{cat.name}</td>
                                                <td className="py-1 text-right">{currencyFormatter(cat.value)}</td>
                                                <td className="py-1 text-right">{share.toFixed(1)}%</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pie Chart */}
                    <div className={`flex items-center justify-center ${showList ? 'flex-1' : 'flex-1'}`}>
                        <ResponsiveContainer width="100%" height={height}>
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={showList ? 70 : 80}
                                    paddingAngle={2}
                                    dataKey="value"
                                    label={({ name, percent }) => percent < 0.03 ? '' : `${name} ${(percent * 100).toFixed(0)}%`}
                                    onClick={(data) => handleCategoryClick(String(data.name))}
                                    cursor={onCategorySelect ? 'pointer' : 'default'}
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={isSelected(entry.name) ? '#2563EB' : COLORS[index % COLORS.length]}
                                            opacity={effectiveSelection && effectiveSelection !== 'all' && !isSelected(entry.name) ? 0.3 : 1}
                                        />
                                    ))}
                                </Pie>
                                <RechartsTooltip formatter={(value: number) => currencyFormatter(value)} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
