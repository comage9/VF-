// Common color palette for charts
export const COLORS = [
    '#0088FE', // Blue
    '#00C49F', // Green
    '#FFBB28', // Yellow
    '#FF8042', // Orange
    '#8884d8', // Purple
    '#82ca9d', // Light Green
    '#ffc658', // Gold
    '#8dd1e1', // Cyan
    '#F97316', // Orange-Red
    '#10B981', // Emerald
];

// Currency formatter
export const formatCurrency = (value: number): string => {
    if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
    if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
    return value.toLocaleString('ko-KR');
};

// Number formatter
export const NUMBER_FORMATTER = new Intl.NumberFormat('ko-KR');

// Date formatter
export const formatDate = (date: string | Date, format: 'short' | 'long' = 'short'): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (format === 'short') {
        return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
    }
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
};
