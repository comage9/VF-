import { useEffect, useMemo, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SummaryCards from "./summary-cards";
import DataTable from "./data-table";
import type { OutboundRecord } from "@shared/schema";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");

type OutboundRecordWithBoxes = OutboundRecord & {
  boxQuantity?: number | null;
  unitCount?: number | null;
};

function formatISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function OutboundTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [defaults, setDefaults] = useState<{ start: string; end: string; min: string; max: string }>({ start: '', end: '', min: '', max: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: meta, isLoading: metaLoading } = useQuery<{ earliestDate: string | null; latestDate: string | null }>({
    queryKey: ['/api/outbound/meta'],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!meta || !meta.latestDate || !meta.earliestDate) return;
    const latest = parseDate(meta.latestDate);
    const earliest = parseDate(meta.earliestDate);
    if (!latest || !earliest) return;

    const defaultStart = new Date(latest);
    defaultStart.setDate(defaultStart.getDate() - 7);
    if (defaultStart < earliest) {
      defaultStart.setTime(earliest.getTime());
    }

    const startIso = formatISODate(defaultStart);
    const endIso = formatISODate(latest);
    setDefaults({
      start: startIso,
      end: endIso,
      min: formatISODate(earliest),
      max: endIso,
    });

    if (!startDate && !endDate) {
      setStartDate(startIso);
      setEndDate(endIso);
    }
  }, [meta, startDate, endDate]);

  const { data: outboundRecords = [], isLoading: dataLoading } = useQuery<OutboundRecordWithBoxes[]>({
    queryKey: ['/api/outbound', startDate, endDate],
    enabled: Boolean(startDate && endDate),
    queryFn: async ({ queryKey }) => {
      const [, start, end] = queryKey;
      const params = new URLSearchParams();
      if (typeof start === 'string' && start) params.set('start', start);
      if (typeof end === 'string' && end) params.set('end', end);
      params.set('limit', '10000'); // 충분한 데이터를 가져오기 위해 limit 설정
      const res = await fetch(`/api/outbound?${params.toString()}`);
      if (!res.ok) throw new Error('출고 데이터를 가져오는데 실패했습니다.');
      return res.json();
    },
  });

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('csv', file);
    formData.append('type', 'outbound');

    try {
      const response = await fetch('/api/upload/csv', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('File upload failed');
      }

      alert('Upload successful!');
      queryClient.invalidateQueries({ queryKey: ['/api/outbound'] });
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed');
    }
  };

  const filteredData = useMemo(() => {
    const rangeFiltered = outboundRecords.filter((record) => {
      const matchesSearch = !searchQuery || searchQuery.length >= 2 && (record.productName.toLowerCase().includes(searchQuery.toLowerCase()) || record.category.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = !filterCategory || record.category === filterCategory;
      return matchesSearch && matchesCategory;
    });

    // Sort: Date (desc) -> Sales Amount (desc)
    return rangeFiltered.sort((a, b) => {
      const dateA = new Date(a.outboundDate).getTime();
      const dateB = new Date(b.outboundDate).getTime();
      if (dateA !== dateB) {
        return dateB - dateA; // Recent date first
      }
      const salesA = a.salesAmount || 0;
      const salesB = b.salesAmount || 0;
      return salesB - salesA; // High sales first
    });
  }, [outboundRecords, searchQuery, filterCategory]);

  const chartSeries = useMemo(() => {
    const totals = new Map<string, { date: string; quantity: number; sales: number }>();
    const getBoxQuantity = (record: OutboundRecordWithBoxes) => {
      const value = record.boxQuantity ?? record.quantity;
      return typeof value === 'number' ? value : Number(value || 0);
    };
    filteredData.forEach((record) => {
      const parsed = parseDate(record.outboundDate);
      if (!parsed) return;
      const key = formatISODate(parsed);
      const entry = totals.get(key) ?? { date: key, quantity: 0, sales: 0 };
      entry.quantity += getBoxQuantity(record);
      if (typeof record.salesAmount === 'number') {
        entry.sales += record.salesAmount;
      }
      totals.set(key, entry);
    });
    return Array.from(totals.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredData]);

  const pointCount = chartSeries.length;
  const labelInterval = pointCount > 20 ? Math.ceil(pointCount / 10) : 1;

  const columns = [
    {
      key: 'outboundDate',
      label: '출고 날짜',
      render: (value: string) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {new Date(value).toLocaleDateString('ko-KR')}
        </span>
      )
    },
    {
      key: 'productName',
      label: '상품명',
      render: (value: string) => (
        <span className="text-sm font-medium text-foreground block min-w-[150px]">{value}</span>
      )
    },
    {
      key: 'category',
      label: '분류',
      render: (value: string) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{value}</span>
      )
    },
    {
      key: 'barcode',
      label: '바코드',
      render: (value: string | null) => (
        <span className="text-sm text-muted-foreground font-mono whitespace-nowrap">{value || '-'}</span>
      )
    },
    {
      key: 'quantity',
      label: '출고 수량(박스)',
      render: (_value: number, row: OutboundRecordWithBoxes) => {
        const boxValue = row.boxQuantity ?? row.quantity ?? 0;
        return (
          <span className="text-sm text-foreground font-medium">{NUMBER_FORMATTER.format(Number(boxValue) || 0)}</span>
        );
      }
    },
    {
      key: 'unitCount',
      label: '출고 수량(낱개)',
      render: (_value: number | null | undefined, row: OutboundRecordWithBoxes) => {
        if (row.unitCount === null || row.unitCount === undefined) {
          return <span className="text-sm text-muted-foreground">-</span>;
        }
        return <span className="text-sm text-foreground">{NUMBER_FORMATTER.format(Number(row.unitCount) || 0)}</span>;
      }
    },
    {
      key: 'salesAmount',
      label: '판매금액',
      render: (value: number | null | undefined) => (
        <span className="text-sm text-foreground">
          {typeof value === 'number' ? `₩${NUMBER_FORMATTER.format(value)}` : '-'}
        </span>
      )
    },
    {
      key: 'notes',
      label: '비고',
      render: (value: string | null) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px]" title={value || ''}>{value || '-'}</span>
      )
    },
  ];

  const categoryOptions = Array.from(
    new Set(outboundRecords.map(record => record.category))
  ).map(category => ({
    value: category,
    label: category
  }));

  const handleDownloadExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);

      const res = await fetch(`/api/outbound/download/excel?${params.toString()}`);
      if (!res.ok) throw new Error('Download failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `outbound_data_${startDate || 'all'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error('Download error:', error);
      alert('다운로드에 실패했습니다.');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch('/api/outbound/template');
      if (!res.ok) throw new Error('Download failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'outbound_upload_template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error('Template download error:', error);
      alert('양식 다운로드에 실패했습니다.');
    }
  };

  const handleResetDateRange = () => {
    setStartDate(defaults.start);
    setEndDate(defaults.end);
  };

  const isLoadingCombined = metaLoading || dataLoading;

  if (isLoadingCombined) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-2xl text-muted-foreground mb-2"></i>
          <p className="text-muted-foreground">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  const latestDate = meta?.latestDate ? parseDate(meta.latestDate) : null;

  return (
    <div>
      <SummaryCards type="outbound" data={filteredData} />

      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">조회 기간</h3>
            <p className="text-sm text-muted-foreground">
              데이터가 존재하는 가장 최근 일자를 기준으로 7일 범위가 기본 선택됩니다.
            </p>
            {latestDate && (
              <p className="text-xs text-muted-foreground">
                최신 데이터: {formatISODate(latestDate)} (기본 범위 {defaults.start} ~ {defaults.end})
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm"
                min={defaults.min}
                max={defaults.max}
              />
              <span className="text-sm text-muted-foreground">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="px-3 py-2 border border-input rounded-lg bg-background text-foreground text-sm"
                min={defaults.min}
                max={defaults.max}
              />
            </div>
            <button
              type="button"
              onClick={handleResetDateRange}
              className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition"
            >
              기본 범위로 초기화
            </button>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <h3 className="text-base font-semibold text-foreground mb-4">일별 출고 수량 & 판매금액</h3>
        {chartSeries.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
            선택된 기간에 데이터가 없습니다.
          </div>
        ) : (
          <div className="h-[600px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartSeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground) / 0.2)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  interval={labelInterval === 1 ? 0 : labelInterval}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  yAxisId="quantity"
                  domain={[0, (dataMax: number) => (dataMax * 3)]}
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(value) => NUMBER_FORMATTER.format(Number(value || 0))}
                />
                <YAxis
                  yAxisId="sales"
                  orientation="right"
                  domain={[0, (dataMax: number) => (dataMax * 1.1)]}
                  tick={{ fontSize: 12 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(value) => NUMBER_FORMATTER.format(Number(value || 0))}
                />
                <Tooltip
                  formatter={(value: number, name) => {
                    const formatted = NUMBER_FORMATTER.format(value || 0);
                    return name === '판매금액' ? [`₩ ${formatted}`, name] : [formatted, name];
                  }}
                  labelFormatter={(label) => label}
                />
                <Legend />
                <Line
                  yAxisId="quantity"
                  type="monotone"
                  dataKey="quantity"
                  name="출고 수량(박스)"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  label={pointCount <= 20 ? {
                    position: 'top',
                    formatter: (value: number) => NUMBER_FORMATTER.format(value || 0),
                  } : undefined}
                />
                <Line
                  yAxisId="sales"
                  type="monotone"
                  dataKey="sales"
                  name="판매금액"
                  stroke="#F97316"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                  label={pointCount <= 20 ? {
                    position: 'top',
                    formatter: (value: number) => `₩ ${NUMBER_FORMATTER.format(value || 0)}`,
                  } : undefined}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="flex justify-end mb-4 gap-2">
        <button
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition flex items-center gap-2 text-sm font-medium"
          onClick={handleDownloadTemplate}
        >
          <i className="fas fa-file-download"></i> 양식 다운로드
        </button>
        <button
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition flex items-center gap-2 text-sm font-medium"
          onClick={handleDownloadExcel}
        >
          <i className="fas fa-file-excel"></i> Excel 다운로드
        </button>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition flex items-center gap-2 text-sm font-medium"
          onClick={() => fileInputRef.current?.click()}
        >
          <i className="fas fa-upload"></i> Excel/CSV 업로드
        </button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".csv, .xlsx, .xls"
          onChange={handleUpload}
        />
      </div>

      <DataTable
        title="출고 상세 내역"
        columns={columns}
        data={filteredData}
        searchPlaceholder="상품명 검색..."
        filterOptions={categoryOptions}
        onSearch={setSearchQuery}
        onFilter={setFilterCategory}
      />
    </div>
  );
}
