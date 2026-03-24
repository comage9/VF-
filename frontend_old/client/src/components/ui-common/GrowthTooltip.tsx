import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface GrowthTooltipProps {
    active?: boolean;
    payload?: any[];
    label?: string;
    totalValue?: number;
    currencyFormatter?: (value: number) => string;
    numberFormatter?: (value: number) => string;
    valueKey?: string;
    labelKey?: string;
    showShare?: boolean;
    showGrowth?: boolean;
}

export default function GrowthTooltip({
    active,
    payload,
    label,
    totalValue = 0,
    currencyFormatter = (v) => `₩${v.toLocaleString()}`,
    numberFormatter = (v) => v.toLocaleString(),
    valueKey = 'sales',
    labelKey = 'name',
    showShare = true,
    showGrowth = true
}: GrowthTooltipProps) {
    if (!active || !payload || !payload.length) return null;

    const currentData = payload[0]?.payload;
    if (!currentData) return null;

    const currentValue = Number(currentData[valueKey] || 0);
    const currentLabel = currentData[labelKey] || currentData.fullDate || label;

    // Calculate growth rate
    let growthRate = null;
    if (showGrowth) {
        const allTrendData = currentData.allTrendData || [];
        const currentIndex = allTrendData.findIndex((d: any) => d.fullDate === currentData.fullDate);

        if (currentIndex > 0) {
            const prevData = allTrendData[currentIndex - 1];
            const prevValue = Number(prevData?.[valueKey] || 0);
            if (prevValue > 0) {
                growthRate = ((currentValue - prevValue) / prevValue) * 100;
            }
        }
    }

    // Calculate share
    const share = showShare && totalValue > 0 ? (currentValue / totalValue) * 100 : 0;

    const renderGrowth = (growth: number | null) => {
        if (growth === null) {
            return <span className="text-gray-400">-</span>;
        }
        const isPositive = growth >= 0;
        const color = isPositive ? 'text-emerald-600' : 'text-red-600';
        const icon = isPositive ? TrendingUp : TrendingDown;

        return (
            <div className={`flex items-center gap-1 ${color}`}>
                {icon && <icon className="w-3 h-3" />}
                <span>{Math.abs(growth).toFixed(1)}%</span>
            </div>
        );
    };

    const isCurrency = valueKey === 'sales' || valueKey === 'salesAmount' || valueKey === 'amount';
    const formattedValue = isCurrency ? currencyFormatter(currentValue) : numberFormatter(currentValue);

    return (
        <div className="bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-4 min-w-[200px]">
            <div className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">
                {currentLabel}
            </div>

            {/* Value Row */}
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">{isCurrency ? '금액' : '수량'}</span>
                <span className="font-semibold text-gray-900">{formattedValue}</span>
            </div>

            {/* Share Row */}
            {showShare && (
                <div className="flex items-center justify-between mb-2 pl-4">
                    <span className="text-xs text-gray-500">비중</span>
                    <span className="text-xs text-gray-600">{share.toFixed(1)}%</span>
                </div>
            )}

            {/* Growth Row */}
            {showGrowth && growthRate !== null && (
                <div className="flex items-center justify-between pl-4">
                    <span className="text-xs text-gray-500">전기 대비</span>
                    {renderGrowth(growthRate)}
                </div>
            )}
        </div>
    );
}

// Named export for Recharts compatibility
export { GrowthTooltip as GrowthTooltipComponent };
