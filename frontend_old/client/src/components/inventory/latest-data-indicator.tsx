import React from 'react';
import { LatestDataInfo } from '../../types/enhanced-inventory';

interface LatestDataInfoProps {
  latestDataInfo?: LatestDataInfo;
}

export function LatestDataIndicator({ latestDataInfo }: LatestDataInfoProps) {
  if (!latestDataInfo) {
    return null;
  }

  const {
    latestUploadDate,
    totalItems,
    filteredItems,
    dataCompleteness,
    hasLatestDataOnly
  } = latestDataInfo;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '없음';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCompletenessColor = (completeness: number) => {
    if (completeness >= 90) return 'text-green-600 bg-green-50';
    if (completeness >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getBadgeClass = (hasLatest: boolean) => {
    return hasLatest 
      ? 'bg-blue-100 text-blue-800 border-blue-200'
      : 'bg-gray-100 text-gray-600 border-gray-200';
  };

  return (
    <div className="bg-white rounded-lg border shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`px-3 py-1 rounded-full border text-sm font-medium ${getBadgeClass(hasLatestDataOnly)}`}>
              {hasLatestDataOnly ? '✅ 최신 데이터만 표시' : '⚠️ 모든 데이터 표시'}
            </div>
            {latestUploadDate && (
              <span className="text-sm text-gray-500">
                📅 {formatDate(latestUploadDate)}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center space-x-6 text-sm">
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">{filteredItems.toLocaleString()}</div>
            <div className="text-gray-500">표시된 항목</div>
          </div>
          
          {hasLatestDataOnly && totalItems !== filteredItems && (
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-600">{totalItems.toLocaleString()}</div>
              <div className="text-gray-500">전체 항목</div>
            </div>
          )}
          
          <div className="text-center">
            <div className={`text-lg font-semibold px-2 py-1 rounded ${getCompletenessColor(dataCompleteness)}`}>
              {dataCompleteness}%
            </div>
            <div className="text-gray-500">데이터 완성도</div>
          </div>
        </div>
      </div>
      
      {hasLatestDataOnly && dataCompleteness < 100 && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <div className="flex items-center">
            <span className="text-amber-600 text-sm">
              ⚠️ 일부 항목에 업로드 날짜가 없어 필터링에서 제외될 수 있습니다. 
              데이터 품질 개선을 위해 업로드 시 날짜 정보를 확인해주세요.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default LatestDataIndicator;