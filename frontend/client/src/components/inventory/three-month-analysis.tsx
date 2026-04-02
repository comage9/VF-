import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OutboundAnalysisItem, AnalysisParams, OutboundAnalysisResponse } from '../../types/enhanced-inventory';

interface ThreeMonthAnalysisProps {
  className?: string;
}

interface BarcodeDailyDatum {
  date: string;
  quantity: number;
  salesAmount?: number;
}

interface BarcodeDailyItem {
  barcode: string;
  productName?: string;
  category?: string;
  dailyData: BarcodeDailyDatum[];
  totalOutbound?: number;
  avgDaily?: number;
  calculatedSettings?: {
    minStock: number;
    maxStock: number;
    reorderPoint: number;
  };
}

interface BarcodeDailyResponse {
  success: boolean;
  data: BarcodeDailyItem[];
  summary?: {
    totalRecords?: number;
    totalBarcodes?: number;
  };
}

export function ThreeMonthAnalysis({ className = "" }: ThreeMonthAnalysisProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'1month' | '3month' | '6month'>('3month');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [analysisParams, setAnalysisParams] = useState<AnalysisParams>({
    safetyFactor: 1.5, // 안전계수
    seasonalAdjustment: true, // 계절성 조정
    trendAdjustment: true, // 트렌드 조정
    minimumDays: 7, // 최소 데이터 일수
  });
  const [isCalculating, setIsCalculating] = useState(false);

  const queryClient = useQueryClient();

  // 바코드별 일별 출고 데이터 조회
  const { data: barcodeDailyData, isLoading, error } = useQuery<BarcodeDailyResponse>({
    queryKey: ['outbound-barcode-daily', selectedPeriod],
    queryFn: async () => {
      const days = selectedPeriod === '1month' ? 30 : selectedPeriod === '3month' ? 90 : 180;
      const response = await fetch(`/api/outbound/barcode-daily?days=${days}`);
      if (!response.ok) {
        throw new Error('바코드별 일별 출고 데이터를 불러올 수 없습니다.');
      }
      return response.json();
    },
    refetchInterval: 60000, // 1분마다 갱신
  });

  // 자동 계산 적용
  const applyCalculationMutation = useMutation({
    mutationFn: async (products: string[]) => {
      const response = await fetch('/api/inventory/apply-calculated-thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          products,
          analysisParams,
          period: selectedPeriod 
        }),
      });
      
      if (!response.ok) {
        throw new Error('자동 계산 적용에 실패했습니다.');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['enhanced-inventory-overview'] });
      queryClient.invalidateQueries({ queryKey: ['barcode-master-for-inventory'] });
      alert(`${data.applied}개 제품의 재고 설정이 업데이트되었습니다.`);
    },
  });

  const handleApplySingle = async (barcode: string) => {
    if (!barcode) return;
    try {
      await applyCalculationMutation.mutateAsync([barcode]);
    } catch (error) {
      console.error('개별 설정 적용 오류:', error);
    }
  };

  const handleCalculateAll = async () => {
    if (!barcodeDailyData?.data) return;

    setIsCalculating(true);
    try {
      const productsWithData = barcodeDailyData.data
        .filter((item) => item.dailyData.length >= analysisParams.minimumDays)
        .map((item) => item.barcode);

      if (productsWithData.length === 0) {
        alert('충분한 출고 데이터가 있는 제품이 없습니다.');
        return;
      }

      await applyCalculationMutation.mutateAsync(productsWithData);
    } catch (error) {
      console.error('자동 계산 적용 오류:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const getReliabilityColor = (reliability: number) => {
    if (reliability >= 80) return 'text-green-600 bg-green-50';
    if (reliability >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getTrendIcon = (trend: OutboundAnalysisItem['trend']) => {
    switch (trend) {
      case 'increasing': return '📈';
      case 'decreasing': return '📉';
      default: return '➡️';
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center h-64 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-500">3개월 출고 데이터 분석 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <p className="text-red-600">출고 분석 데이터 로딩 오류: {error.message}</p>
      </div>
    );
  }

  const analysis = (barcodeDailyData?.data || []).filter((item) => {
    const matchesSearch =
      !searchTerm.trim() ||
      (item.productName || '').toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
      (item.barcode || '').toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchTerm.trim().toLowerCase());
    const matchesCategory = !categoryFilter || (item.category || '') === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className={`bg-white rounded-lg border shadow-sm ${className}`}>
      {/* 헤더 */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">📊 출고 분석 및 재고 계산</h3>
            <p className="text-sm text-gray-500">
              바코드별 일별 출고 집계: {barcodeDailyData?.data?.length || 0}개 제품 |
              총 출고 기록: {barcodeDailyData?.summary?.totalRecords || 0}건
            </p>
          </div>
          
          <div className="flex items-center space-x-3">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as any)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="1month">최근 1개월</option>
              <option value="3month">최근 3개월</option>
              <option value="6month">최근 6개월</option>
            </select>
            
            <button
              onClick={handleCalculateAll}
              disabled={isCalculating || applyCalculationMutation.isPending}
              className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {isCalculating ? '계산 중...' : '전체 자동 설정'}
            </button>
          </div>
        </div>
      </div>

      {/* 분석 파라미터 */}
      <div className="p-4 bg-gray-50 border-b">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-2">
            <label className="block text-xs text-gray-600 mb-1">검색(제품명/바코드/분류)</label>
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm"
              placeholder="예: 로스트, R000..."
            />
          </div>

          <div>
            <label className="block text-xs text-gray-600 mb-1">분류</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-2 py-1 border rounded text-sm"
            >
              <option value="">전체</option>
              {Array.from(new Set((barcodeDailyData?.data || []).map((i) => i.category).filter(Boolean))).map((c) => (
                <option key={c as string} value={c as string}>{c as string}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">안전계수</label>
            <input
              type="number"
              step="0.1"
              min="1.0"
              max="3.0"
              value={analysisParams.safetyFactor}
              onChange={(e) => setAnalysisParams(prev => ({
                ...prev,
                safetyFactor: parseFloat(e.target.value) || 1.5
              }))}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          
          <div>
            <label className="block text-xs text-gray-600 mb-1">최소 데이터 일수</label>
            <input
              type="number"
              min="3"
              max="30"
              value={analysisParams.minimumDays}
              onChange={(e) => setAnalysisParams(prev => ({
                ...prev,
                minimumDays: parseInt(e.target.value) || 7
              }))}
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="seasonal"
              checked={analysisParams.seasonalAdjustment}
              onChange={(e) => setAnalysisParams(prev => ({
                ...prev,
                seasonalAdjustment: e.target.checked
              }))}
              className="mr-2"
            />
            <label htmlFor="seasonal" className="text-xs text-gray-600">계절성 조정</label>
          </div>
          
          <div className="flex items-center">
            <input
              type="checkbox"
              id="trend"
              checked={analysisParams.trendAdjustment}
              onChange={(e) => setAnalysisParams(prev => ({
                ...prev,
                trendAdjustment: e.target.checked
              }))}
              className="mr-2"
            />
            <label htmlFor="trend" className="text-xs text-gray-600">트렌드 조정</label>
          </div>
        </div>
      </div>

      {/* 분석 결과 */}
      <div className="max-h-[70vh] overflow-y-auto">
        {analysis.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            분석 가능한 출고 데이터가 없습니다.
          </div>
        ) : (
          <div className="divide-y">
            {analysis.map((item: BarcodeDailyItem) => (
              <div key={item.barcode} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div>
                        <div className="font-medium text-sm">{item.productName}</div>
                        <div className="text-xs text-gray-500">바코드: {item.barcode}</div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <div className={`px-2 py-1 rounded text-xs ${
                          item.dailyData.length >= analysisParams.minimumDays
                            ? 'text-green-600 bg-green-50'
                            : 'text-yellow-600 bg-yellow-50'
                        }`}>
                          데이터 {item.dailyData.length}일
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-gray-500">일평균:</span> {(item.avgDaily ?? 0).toFixed(1)}개
                      </div>
                      <div>
                        <span className="text-gray-500">총출고:</span> {(item.totalOutbound ?? 0).toLocaleString()}개
                      </div>
                      <div>
                        <span className="text-gray-500">데이터 일수:</span> {item.dailyData.length}일
                      </div>
                      <div>
                        <span className="text-gray-500">최근 출고:</span> {item.dailyData.length > 0 ? item.dailyData[item.dailyData.length - 1].date : '-'}
                      </div>
                    </div>
                  </div>

                  <div className="ml-4 text-right">
                    <div className="text-sm font-medium text-gray-900">계산된 재고 설정</div>
                    <div className="text-xs space-y-1">
                      <div>최소 재고: <span className="font-medium">{item.calculatedSettings?.minStock ?? 0}</span></div>
                      <div>최대 재고: <span className="font-medium">{item.calculatedSettings?.maxStock ?? 0}</span></div>
                      <div>발주 시점: <span className="font-medium">{item.calculatedSettings?.reorderPoint ?? 0}</span></div>
                    </div>
                    <button
                      onClick={() => {
                        handleApplySingle(item.barcode);
                      }}
                      className="mt-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                    >
                      적용
                    </button>
                  </div>
                </div>

                {/* 출고량 차트 */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-600 mb-2">최근 7일 출고량 추이</div>
                  <div className="flex items-end space-x-1 h-16">
                    {item.dailyData.slice(-7).map((day: BarcodeDailyDatum, idx: number) => {
                      const max = Math.max(...item.dailyData.slice(-7).map((d: BarcodeDailyDatum) => d.quantity));
                      const height = Math.max((day.quantity / (max || 1)) * 100, 5);
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center">
                          <div
                            className="w-full bg-blue-500 rounded-t"
                            style={{ height: `${height}%` }}
                            title={`${day.date}: ${day.quantity}개`}
                          ></div>
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(day.date).getDate()}일
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 상세 분석 정보 */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <details className="text-xs">
                    <summary className="cursor-pointer text-blue-600 hover:text-blue-800">
                      계산 근거 보기
                    </summary>
                    <div className="mt-2 p-2 bg-blue-50 rounded text-blue-700">
                      <div>• 일일 출고량: {(item.avgDaily ?? 0).toFixed(1)}개</div>
                      <div>• 최소 재고 = 일일 출고량 = {item.calculatedSettings?.minStock ?? 0}개</div>
                      <div>• 최대 재고 = 일일 출고량 × 10일 = {item.calculatedSettings?.maxStock ?? 0}개</div>
                      <div>• 발주 시점 = 일일 출고량 × 3일 = {item.calculatedSettings?.reorderPoint ?? 0}개</div>
                      <div className="mt-1 text-xs">
                        * 출고 데이터를 기반으로 자동 계산된 값입니다.
                      </div>
                    </div>
                  </details>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ThreeMonthAnalysis;