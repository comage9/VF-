import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

// 색상 팔레트
const COLORS = [
  '#FF6384',
  '#36A2EB',
  '#FFCE56',
  '#4BC0C0',
  '#9966FF',
  '#FF9F40',
  '#FF6384',
  '#C9CBCF',
];

interface ChartData {
  name: string;
  value: number;
  [key: string]: any;
}

interface CommonBarChartProps {
  data: ChartData[];
  dataKey: string;
  height?: number;
  title?: string;
  colors?: string[];
  showLegend?: boolean;
}

export const CommonBarChart: React.FC<CommonBarChartProps> = ({
  data,
  dataKey,
  height = 300,
  title,
  colors = ['#3b82f6'],
  showLegend = true
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        {showLegend && <Legend />}
        {colors.map((color, index) => (
          <Bar 
            key={index} 
            dataKey={Array.isArray(dataKey) ? dataKey[index] : dataKey} 
            fill={color} 
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

interface CommonPieChartProps {
  data: ChartData[];
  height?: number;
  title?: string;
  colors?: string[];
  showLabels?: boolean;
}

export const CommonPieChart: React.FC<CommonPieChartProps> = ({
  data,
  height = 300,
  title,
  colors = COLORS,
  showLabels = true
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={showLabels ? ({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%` : false}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
};

interface CommonLineChartProps {
  data: ChartData[];
  dataKey: string;
  height?: number;
  title?: string;
  color?: string;
  strokeWidth?: number;
}

export const CommonLineChart: React.FC<CommonLineChartProps> = ({
  data,
  dataKey,
  height = 300,
  title,
  color = '#4bc0c0',
  strokeWidth = 2
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={strokeWidth}
          dot={{ fill: color, strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};