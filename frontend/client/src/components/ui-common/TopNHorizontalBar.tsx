import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { COLORS } from "./constants";

export interface TopNData {
    name: string;
    value: number;
    share?: number;
}

interface TopNHorizontalBarProps {
    title?: string;
    data: TopNData[];
    numberFormatter?: (value: number) => string;
    selectedLabel?: string;
    onLabelClick?: (label: string) => void;
    barSize?: number;
    colors?: string[];
    showShare?: boolean;
    topN?: number;
}

// Default Y-axis tick component for long product names
const DefaultYAxisTick = (props: any) => {
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
            <tspan x={x - 5} dy="0.3em">{line1}</tspan>
            {line2 && <tspan x={x - 5} dy="1.2em">{line2}</tspan>}
        </text>
    );
};

export default function TopNHorizontalBar({
    title = 'TOP N',
    data,
    numberFormatter = (v) => v.toLocaleString(),
    selectedLabel,
    onLabelClick,
    barSize = 14,
    colors = COLORS,
    showShare = true,
    topN = 30
}: TopNHorizontalBarProps) {
    const chartData = data.slice(0, topN);

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                    {title}
                    {selectedLabel && <span className="text-xs font-normal text-muted-foreground ml-1">- {selectedLabel}</span>}
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 min-h-0">
                <div className="h-full overflow-y-auto pr-2">
                    <div style={{ height: `${Math.max(100, chartData.length * 5)}%`, minHeight: '400px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="vertical"
                                data={chartData}
                                margin={{ top: 5, right: showShare ? 120 : 100, left: 10, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" tickFormatter={numberFormatter} />
                                <YAxis type="category" dataKey="name" width={160} tick={<DefaultYAxisTick />} interval={0} />
                                <RechartsTooltip
                                    formatter={(value: number, name: string) => {
                                        const entry = chartData.find(d => d.value === value);
                                        const share = entry?.share;
                                        const baseLabel = `${numberFormatter(value)}`;
                                        const shareLabel = share !== undefined ? ` (${share.toFixed(1)}%)` : '';
                                        return [baseLabel + shareLabel, name];
                                    }}
                                />
                                <Bar
                                    dataKey="value"
                                    fill="#8884d8"
                                    radius={[0, 4, 4, 0]}
                                    barSize={barSize}
                                    onClick={(data) => {
                                        if (onLabelClick) {
                                            onLabelClick(String(data.name));
                                        }
                                    }}
                                    cursor={onLabelClick ? 'pointer' : 'default'}
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.name === selectedLabel ? '#2563EB' : colors[index % colors.length]}
                                        />
                                    ))}
                                    <LabelList
                                        dataKey="value"
                                        position="right"
                                        content={(props: any) => {
                                            const { x, y, width, height, value, payload } = props;
                                            const share = payload?.share;
                                            return (
                                                <text x={x + width + 5} y={y + height / 2 + 4} fill="#666" fontSize={11} textAnchor="start">
                                                    {numberFormatter(value)}
                                                    {showShare && share !== undefined && ` (${share.toFixed(1)}%)`}
                                                </text>
                                            );
                                        }}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
