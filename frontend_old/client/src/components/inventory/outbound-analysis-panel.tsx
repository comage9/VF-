import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import {
  TrendingUp,
  TrendingDown,
  Package,
  Calendar,
  Download,
  Filter,
  Search,
  AlertCircle,
  CheckCircle2,
  BarChart3,
  PieChart,
  Activity
} from 'lucide-react';
// 공통 차트 컴포넌트 임포트
import {
  CommonBarChart,
  CommonPieChart,
  CommonLineChart
} from '../charts/common-chart-components';

interface OutboundAnalysisItem {
  productName: string;
  barcode: string;
  category: string;
  totalOutbound: number;
  averageDaily: number;
  maxDaily: number;
  minDaily: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  reliability: number;
  lastOutboundDate: string;
  forecastNextMonth: number;
}

interface OutboundAnalysisResponse {
  data: OutboundAnalysisItem[];
  summary: {
    totalItems: number;
    totalQuantity: number;
    averageDaily: number;
    period: string;
  };
}

function DailyAnalysisCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['daily-analysis'],
    queryFn: async () => {
      const res = await fetch('/api/outbound/daily-analysis');
      if (!res.ok) throw new Error('No analysis found');
      return res.json();
    }
  });

  if (isLoading) return null;
  if (!data || !data.insight) return null;

  return (
    <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-100 mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-indigo-900">
          <span className="text-2xl">🤖</span> AI 일일 분석 리포트
          <span className="text-sm font-normal text-indigo-600 ml-auto">
            {new Date(data.date).toLocaleString()} 기준
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm max-w-none text-indigo-900 whitespace-pre-line">
          {data.insight}
        </div>
      </CardContent>
    </Card>
  );
}

function AIChatSection({ contextData }: { contextData: any }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!question.trim()) return;

    const userQ = question;
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: userQ }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userQ,
          context: contextData
        })
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: '죄송합니다. 오류가 발생했습니다.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="h-[500px] flex flex-col mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-xl">💬</span> AI 데이터 Q&A
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-4 p-4 bg-slate-50 rounded-lg mb-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-10">
              <p>출고 데이터에 대해 무엇이든 물어보세요!</p>
              <p className="text-sm mt-2">예: "가장 많이 팔린 제품은?", "지난달 대비 추세는?"</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 rounded-lg ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 shadow-sm'
                }`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 p-3 rounded-lg shadow-sm">
                <i className="fas fa-spinner fa-spin text-blue-600"></i> 분석 중...
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleAsk()}
            placeholder="질문을 입력하세요..."
            disabled={loading}
          />
          <Button onClick={handleAsk} disabled={loading}>
            전송
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OutboundAnalysisPanel() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [period, setPeriod] = useState('3month');
  const [showCharts, setShowCharts] = useState(true);
  const [actualDateRange, setActualDateRange] = useState<{
    earliestDate: string | null;
    latestDate: string | null;
    hasData: boolean;
    totalRecords: number;
  } | null>(null);

  // 실제 데이터 기간 조회
  const { data: dateRangeData, isLoading: dateRangeLoading } = useQuery({
    queryKey: ['outbound-date-range'],
    queryFn: async () => {
      const response = await fetch('/api/outbound/date-range');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 300000, // 5분
  });

  useEffect(() => {
    if (dateRangeData?.success && dateRangeData?.data) {
      setActualDateRange(dateRangeData.data);
    }
  }, [dateRangeData]);

  // 바코드별 일별 출고 데이터 조회 (실제 데이터 기간 기준, 없으면 최근 90일로 폴백)
  const { data: barcodeDailyData, isLoading: barcodeLoading } = useQuery({
    queryKey: ['outbound-barcode-daily', actualDateRange?.earliestDate, actualDateRange?.latestDate],
    queryFn: async () => {
      let url = '';
      if (actualDateRange?.earliestDate && actualDateRange?.latestDate) {
        url = `/api/outbound/barcode-daily?startDate=${actualDateRange.earliestDate}&endDate=${actualDateRange.latestDate}`;
      } else {
        url = '/api/outbound/barcode-daily?days=90';
      }
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 300000, // 5분
  });

  // 기존 출고 분석 데이터 (실제 데이터 기간 기준)
  const { data, isLoading, error, refetch } = useQuery<OutboundAnalysisResponse>({
    queryKey: ['outbound-analysis', actualDateRange?.earliestDate, actualDateRange?.latestDate, searchTerm, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (actualDateRange?.earliestDate && actualDateRange?.latestDate) {
        params.append('startDate', actualDateRange.earliestDate);
        params.append('endDate', actualDateRange.latestDate);
      } else {
        params.append('days', '90');
      }
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      if (categoryFilter) params.append('category', categoryFilter);

      const response = await fetch(`/api/analytics/outbound-analysis?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 60000, // 1분
  });

  // 차트 데이터 계산
  const chartData = useMemo(() => {
    if (!barcodeDailyData?.data) return null;

    const barcodes = barcodeDailyData.data;

    // 상위 10개 제품별 출고량 차트
    const topProducts = barcodes
      .sort((a: any, b: any) => b.totalOutbound - a.totalOutbound)
      .slice(0, 10);

    // 카테고리별 분포 차트
    const categoryMap = new Map<string, number>();
    barcodes.forEach((item: any) => {
      const category = item.productName?.split(' ')[0] || '기타';
      categoryMap.set(category, (categoryMap.get(category) || 0) + item.totalOutbound);
    });

    const sortedCategories = Array.from(categoryMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);

    // 일별 추세 차트 (최근 30일)
    const dailyTrend = new Map<string, number>();
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      dailyTrend.set(dateStr, 0);
    }

    barcodes.forEach((item: any) => {
      if (item.dailyData) {
        item.dailyData.forEach((day: any) => {
          if (dailyTrend.has(day.date)) {
            dailyTrend.set(day.date, dailyTrend.get(day.date)! + day.quantity);
          }
        });
      }
    });

    return {
      topProducts,
      categories: sortedCategories,
      dailyTrend: Array.from(dailyTrend.entries()),
    };
  }, [barcodeDailyData]);

  // 차트 옵션
  const barChartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '상위 10개 제품 출고량',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const pieChartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'right' as const,
      },
      title: {
        display: true,
        text: '카테고리별 출고 분포',
      },
    },
  };

  const lineChartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: '일별 출고 추세 (최근 30일)',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const handleSearch = () => {
    refetch();
  };

  const handleExport = () => {
    if (!barcodeDailyData?.data) return;

    // CSV 데이터 생성
    const csvHeaders = [
      '바코드', '제품명', '총 출고량', '일평균', '최소재고',
      '최대재고', '발주시점', '신뢰도'
    ];

    const csvRows = barcodeDailyData.data.map((item: any) => [
      item.barcode,
      item.productName,
      item.totalOutbound,
      item.avgDaily?.toFixed(2),
      item.calculatedSettings?.minStock || 0,
      item.calculatedSettings?.maxStock || 0,
      item.calculatedSettings?.reorderPoint || 0,
      `${item.reliability}%`
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map(row => row.map((cell: any) => `"${cell}"`).join(','))
      .join('\n');

    // 다운로드
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `출고분석_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'decreasing':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      default:
        return <Package className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTrendBadge = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <Badge variant="default" className="bg-green-100 text-green-800">증가</Badge>;
      case 'decreasing':
        return <Badge variant="destructive">감소</Badge>;
      default:
        return <Badge variant="secondary">안정</Badge>;
    }
  };

  const getReliabilityBadge = (reliability: number) => {
    if (reliability >= 80) {
      return <Badge variant="default" className="bg-green-100 text-green-800">높음</Badge>;
    } else if (reliability >= 50) {
      return <Badge variant="outline">보통</Badge>;
    } else {
      return <Badge variant="destructive">낮음</Badge>;
    }
  };

  // 로딩 상태 처리
  if (dateRangeLoading || isLoading || barcodeLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="text-gray-600">출고 분석 데이터를 로딩중...</span>
        <div className="text-sm text-gray-500">
          {dateRangeLoading ? '데이터 기간 확인 중...' :
            barcodeLoading ? '바코드 데이터 로딩 중...' :
              '분석 데이터 로딩 중...'}
        </div>
      </div>
    );
  }

  // 데이터 없음 상태는 아래의 빈 데이터 가드에서 일괄 처리 (최근 90일 폴백도 시도)

  // 에러 상태 처리
  if (error) {
    return (
      <div className="space-y-4">
        <Alert className="mb-4 border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <div className="font-medium">출고 분석 데이터 로딩 실패</div>
            <div className="text-sm mt-1">{error.message}</div>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              페이지 새로고침
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // 빈 데이터 상태 처리 (요약/데이터 중 하나라도 있으면 렌더)
  const hasBarcodeSummary = (barcodeDailyData?.summary?.totalBarcodes || 0) > 0;
  const hasBarcodeRows = !!(barcodeDailyData?.data && barcodeDailyData.data.length > 0);
  const hasAnalysisSummary = !!data?.summary;
  if (!(hasBarcodeSummary || hasBarcodeRows || hasAnalysisSummary)) {
    return (
      <div className="space-y-4">
        <Alert className="mb-4 border-yellow-200 bg-yellow-50">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <div className="font-medium">출고 분석 데이터가 없습니다</div>
            <div className="text-sm mt-1">
              {!barcodeDailyData?.data ? '바코드별 출고 데이터가 없습니다.' : '분석 결과 데이터가 없습니다.'}
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                onClick={() => refetch()}
                variant="outline"
                size="sm"
              >
                데이터 다시 조회
              </Button>
              <Button
                onClick={() => window.location.href = '/sales/outbound'}
                variant="outline"
                size="sm"
              >
                출고 수량 관리
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 및 컨트롤 */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            출고 데이터 분석 ({barcodeDailyData?.summary?.totalBarcodes || 0}개 바코드)
          </h2>
          <p className="text-sm text-gray-600">
            {actualDateRange?.earliestDate && actualDateRange?.latestDate
              ? <>실제 데이터 기간: {actualDateRange.earliestDate} ~ {actualDateRange.latestDate}{actualDateRange?.totalRecords && ` (총 ${actualDateRange.totalRecords.toLocaleString()}건)`}</>
              : '최근 90일 데이터 기준'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowCharts(!showCharts)}
            variant="outline"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            {showCharts ? '차트 숨기기' : '차트 보기'}
          </Button>
          <Button onClick={() => refetch()} variant="outline">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            새로고침
          </Button>
          <Button onClick={handleExport} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            CSV 다운로드
          </Button>
        </div>
      </div>

      <DailyAnalysisCard />

      {/* 바코드 데이터 요약 */}
      {barcodeDailyData?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">전체 바코드</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {barcodeDailyData.summary.totalBarcodes.toLocaleString()}
                  </p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">총 출고량</p>
                  <p className="text-2xl font-bold text-green-600">
                    {barcodeDailyData.data?.reduce((sum: number, item: any) => sum + item.totalOutbound, 0).toLocaleString()}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">평균 신뢰도</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {Math.round(
                      barcodeDailyData.data?.reduce((sum: number, item: any) => sum + (item.reliability || 0), 0) /
                      (barcodeDailyData.data?.length || 1)
                    )}%
                  </p>
                </div>
                <Activity className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">분석 기간</p>
                  <p className="text-xl font-bold text-gray-700">
                    {period === '1month' ? '1개월' : period === '3month' ? '3개월' : '6개월'}
                  </p>
                </div>
                <Calendar className="w-8 h-8 text-gray-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 차트 섹션 */}
      {showCharts && chartData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 상위 제품 막대 차트 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                상위 10개 제품 출고량
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CommonBarChart
                data={chartData.topProducts.map((item: any) => ({
                  name: item.productName.length > 15
                    ? item.productName.substring(0, 15) + '...'
                    : item.productName,
                  value: item.totalOutbound
                }))}
                dataKey="value"
                height={300}
                title=""
                colors={['#3b82f6']}
              />
            </CardContent>
          </Card>

          {/* 카테고리별 파이 차트 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="w-5 h-5" />
                카테고리별 출고 분포
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CommonPieChart
                data={chartData.categories.map(([category, value]) => ({
                  name: category,
                  value
                }))}
                height={300}
                title=""
              />
            </CardContent>
          </Card>

          {/* 일별 추선 선 차트 (전체 너비) */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                일별 출고 추세 (최근 30일)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CommonLineChart
                data={chartData.dailyTrend.map(([date, value]) => ({
                  name: `${new Date(date).getMonth() + 1}/${new Date(date).getDate()}`,
                  value
                }))}
                dataKey="value"
                height={300}
                title=""
                color="#4bc0c0"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* 요약 카드 */}
      {data?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">분석 제품 수</p>
                  <p className="text-2xl font-bold">
                    {(data.summary.totalItems ?? 0).toLocaleString()}
                  </p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">총 출고량</p>
                  <p className="text-2xl font-bold text-green-600">
                    {(data.summary.totalQuantity ?? 0).toLocaleString()
                    }
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">평균 일일 출고</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {Math.round(data.summary.averageDaily ?? 0).toLocaleString()}
                  </p>
                </div>
                <CheckCircle2 className="w-8 h-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">분석 기간</p>
                  <p className="text-xl font-bold text-gray-700">{data.summary.period}</p>
                </div>
                <Calendar className="w-8 h-8 text-gray-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 검색 및 필터 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            검색 및 필터
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="flex gap-2">
                <Input
                  placeholder="제품명, 바코드로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch} variant="outline">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1month">1개월</option>
                <option value="3month">3개월</option>
                <option value="6month">6개월</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 바코드별 상세 데이터 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>
            바코드별 출고 분석 ({barcodeDailyData?.data?.length || 0}개)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">제품명</th>
                  <th className="text-left p-3 font-medium">바코드</th>
                  <th className="text-center p-3 font-medium">총 출고량</th>
                  <th className="text-center p-3 font-medium">일평균</th>
                  <th className="text-center p-3 font-medium">최소재고</th>
                  <th className="text-center p-3 font-medium">최대재고</th>
                  <th className="text-center p-3 font-medium">발주시점</th>
                  <th className="text-center p-3 font-medium">신뢰도</th>
                  <th className="text-center p-3 font-medium">계산 근거</th>
                </tr>
              </thead>
              <tbody>
                {barcodeDailyData?.data?.map((item: any, index: number) => (
                  <tr key={`${item.barcode}-${index}`} className="border-b hover:bg-gray-50">
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{item.productName}</span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-sm">{item.barcode}</td>
                    <td className="p-3 text-center font-mono">
                      <span className="font-bold text-blue-600">
                        {item.totalOutbound.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono">
                      <span className="font-medium">
                        {item.avgDaily?.toFixed(2)}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono">
                      <span className="text-orange-600 font-medium">
                        {item.calculatedSettings?.minStock || 0}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono">
                      <span className="text-green-600 font-medium">
                        {item.calculatedSettings?.maxStock || 0}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono">
                      <span className="text-red-600 font-medium">
                        {item.calculatedSettings?.reorderPoint || 0}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center">
                        <div className={`w-16 h-2 rounded-full bg-gray-200 relative`}>
                          <div
                            className={`h-2 rounded-full ${item.reliability >= 80 ? 'bg-green-500' :
                                item.reliability >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                            style={{ width: `${item.reliability}%` }}
                          ></div>
                        </div>
                        <span className="ml-2 text-sm font-medium">
                          {item.reliability}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-center text-sm text-gray-600">
                      <div className="max-w-xs truncate" title={item.calculatedSettings?.reasoning}>
                        {item.calculatedSettings?.reasoning || 'N/A'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {(!barcodeDailyData?.data || barcodeDailyData.data.length === 0) && (
              <div className="text-center py-8 text-gray-500">
                출고 분석 데이터가 없습니다.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AIChatSection contextData={data?.summary || barcodeDailyData?.summary || {}} />
    </div>
  );
}
