import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StockThresholds, InventoryItem } from '../../types/enhanced-inventory';

interface EditableStockSettingsProps {
  item: InventoryItem;
  onUpdate?: (itemId: string, updates: StockThresholds) => void;
  disabled?: boolean;
}

export function EditableStockSettings({ 
  item, 
  onUpdate, 
  disabled = false 
}: EditableStockSettingsProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<StockThresholds>({
    minStock: item.minStock ?? null,
    maxStock: item.maxStock ?? null,
    reorderPoint: item.reorderPoint ?? null,
    safetyStock: item.safetyStock ?? null,
  });
  const [originalValues, setOriginalValues] = useState<StockThresholds>(values);

  const queryClient = useQueryClient();

  // 아이템이 변경되면 값 업데이트
  useEffect(() => {
    const newValues = {
      minStock: item.minStock ?? null,
      maxStock: item.maxStock ?? null,
      reorderPoint: item.reorderPoint ?? null,
      safetyStock: item.safetyStock ?? null,
    };
    setValues(newValues);
    setOriginalValues(newValues);
  }, [item.id, item.minStock, item.maxStock, item.reorderPoint, item.safetyStock]);

  // 출고 분석 데이터 조회
  const { data: outboundAnalysis } = useQuery({
    queryKey: ['outbound-barcode-daily', '3month'],
    queryFn: async () => {
      const response = await fetch('/api/outbound/barcode-daily?days=90');
      if (!response.ok) {
        throw new Error('출고 분석 데이터를 불러올 수 없습니다.');
      }
      return response.json();
    },
    enabled: isEditing, // 편집 모드일 때만 조회
  });

  // 서버 업데이트 mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: StockThresholds) => {
      const response = await fetch(`/api/inventory/unified/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...updates,
          auditLog: {
            action: 'update_stock_settings',
            timestamp: new Date().toISOString(),
            user: 'system', // 실제로는 사용자 정보
            oldValues: originalValues,
            newValues: updates,
            source: 'manual_edit'
          }
        }),
      });

      if (!response.ok) {
        throw new Error('재고 설정 업데이트에 실패했습니다.');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['enhanced-inventory-overview'] });
      onUpdate?.(item.id, variables);
      setIsEditing(false);
      setOriginalValues(values);
    },
    onError: (error) => {
      console.error('재고 설정 업데이트 오류:', error);
      // 오류 시 원래 값으로 복원
      setValues(originalValues);
    },
  });

  const handleEdit = () => {
    if (disabled) return;
    setIsEditing(true);
  };

  const handleSave = () => {
    // 유효성 검사
    const errors = validateThresholds(values, item.currentStock);
    if (errors.length > 0) {
      alert('설정 오류:\n' + errors.join('\n'));
      return;
    }

    updateMutation.mutate(values);
  };

  const handleCancel = () => {
    setValues(originalValues);
    setIsEditing(false);
  };

  const handleValueChange = (field: keyof StockThresholds, inputValue: string) => {
    const numValue = inputValue === '' ? null : parseFloat(inputValue);
    setValues(prev => ({ ...prev, [field]: numValue }));
  };

  const handleAutoSet = () => {
    // 바코드나 SKU로 출고 분석 데이터에서 설정 찾기
    const barcodeKey = item.barcode || item.skuId;
    if (!barcodeKey || !outboundAnalysis?.data) {
      alert('출고 분석 데이터를 찾을 수 없습니다.');
      return;
    }

    const analysisItem = outboundAnalysis.data.find((item: any) =>
      item.barcode === barcodeKey || item.barcode === item.skuId
    );

    if (!analysisItem) {
      alert('이 제품의 출고 분석 데이터가 없습니다.');
      return;
    }

    // 계산된 설정 적용
    const newSettings = {
      minStock: analysisItem.calculatedSettings.minStock,
      maxStock: analysisItem.calculatedSettings.maxStock,
      reorderPoint: analysisItem.calculatedSettings.reorderPoint,
      safetyStock: null, // 출고 분석에서는 safetyStock 계산하지 않음
    };

    setValues(newSettings);

    // 자동으로 저장 (감사 로그 포함)
    updateMutation.mutate(newSettings);
    // TODO: 감사 로그는 별도 API로 기록하거나 확장된 mutation으로 처리
  };

  const validateThresholds = (thresholds: StockThresholds, currentStock: number): string[] => {
    const errors: string[] = [];
    
    if (thresholds.minStock !== null && thresholds.minStock < 0) {
      errors.push('최소재고는 0 이상이어야 합니다.');
    }
    
    if (thresholds.maxStock !== null && thresholds.maxStock < 0) {
      errors.push('최대재고는 0 이상이어야 합니다.');
    }
    
    if (thresholds.minStock !== null && thresholds.maxStock !== null && 
        thresholds.minStock > thresholds.maxStock) {
      errors.push('최소재고는 최대재고보다 작아야 합니다.');
    }
    
    if (thresholds.reorderPoint !== null && thresholds.minStock !== null &&
        thresholds.reorderPoint < thresholds.minStock) {
      errors.push('재주문점은 최소재고 이상이어야 합니다.');
    }
    
    if (thresholds.safetyStock !== null && thresholds.safetyStock < 0) {
      errors.push('안전재고는 0 이상이어야 합니다.');
    }
    
    return errors;
  };

  const getStockStatus = (current: number, min: number | null, max: number | null) => {
    if (min === null) return { status: 'normal', color: 'text-gray-600' };
    
    if (current <= min * 0.5) return { status: 'critical', color: 'text-red-600' };
    if (current <= min) return { status: 'low', color: 'text-orange-600' };
    if (max !== null && current >= max) return { status: 'overstock', color: 'text-purple-600' };
    return { status: 'normal', color: 'text-green-600' };
  };

  const stockStatus = getStockStatus(item.currentStock, values.minStock, values.maxStock);

  return (
    <div className="bg-white rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-gray-900">{item.productName}</h4>
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-gray-500">SKU: {item.skuId}</span>
            <span className={`font-medium ${stockStatus.color}`}>
              현재재고: {item.currentStock.toLocaleString()}개
            </span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {!isEditing ? (
            <button
              onClick={handleEdit}
              disabled={disabled}
              className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              편집
            </button>
          ) : (
            <div className="space-x-2">
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
              >
                {updateMutation.isPending ? '저장중...' : '저장'}
              </button>
              <button
                onClick={handleCancel}
                disabled={updateMutation.isPending}
                className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600 disabled:opacity-50"
              >
                취소
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs text-gray-600 mb-1">최소재고</label>
          <input
            type="number"
            value={values.minStock ?? ''}
            onChange={(e) => handleValueChange('minStock', e.target.value)}
            disabled={!isEditing}
            placeholder="설정 안됨"
            className="w-full px-2 py-1 border rounded text-sm disabled:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">최대재고</label>
          <input
            type="number"
            value={values.maxStock ?? ''}
            onChange={(e) => handleValueChange('maxStock', e.target.value)}
            disabled={!isEditing}
            placeholder="설정 안됨"
            className="w-full px-2 py-1 border rounded text-sm disabled:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">재주문점</label>
          <input
            type="number"
            value={values.reorderPoint ?? ''}
            onChange={(e) => handleValueChange('reorderPoint', e.target.value)}
            disabled={!isEditing}
            placeholder="설정 안됨"
            className="w-full px-2 py-1 border rounded text-sm disabled:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-600 mb-1">안전재고</label>
          <input
            type="number"
            value={values.safetyStock ?? ''}
            onChange={(e) => handleValueChange('safetyStock', e.target.value)}
            disabled={!isEditing}
            placeholder="설정 안됨"
            className="w-full px-2 py-1 border rounded text-sm disabled:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* 재고 상태 시각화 */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>재고 레벨</span>
          <span className={stockStatus.color}>{stockStatus.status.toUpperCase()}</span>
        </div>
        
        <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
          {values.minStock !== null && values.maxStock !== null && (
            <>
              {/* 현재 재고 표시 */}
              <div
                className={`absolute top-0 left-0 h-full transition-all duration-300 ${
                  stockStatus.status === 'critical' ? 'bg-red-500' :
                  stockStatus.status === 'low' ? 'bg-orange-500' :
                  stockStatus.status === 'overstock' ? 'bg-purple-500' :
                  'bg-green-500'
                }`}
                style={{
                  width: `${Math.min(100, (item.currentStock / values.maxStock) * 100)}%`
                }}
              />
              
              {/* 최소재고 마커 */}
              <div
                className="absolute top-0 w-0.5 h-full bg-red-700 opacity-75"
                style={{
                  left: `${Math.min(100, (values.minStock / values.maxStock) * 100)}%`
                }}
              />
              
              {/* 재주문점 마커 */}
              {values.reorderPoint !== null && (
                <div
                  className="absolute top-0 w-0.5 h-full bg-yellow-600 opacity-75"
                  style={{
                    left: `${Math.min(100, (values.reorderPoint / values.maxStock) * 100)}%`
                  }}
                />
              )}
            </>
          )}
        </div>
        
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0</span>
          <span>최소: {values.minStock ?? '없음'}</span>
          <span>최대: {values.maxStock ?? '없음'}</span>
        </div>
      </div>

      {/* 추천 설정 (미래 기능) */}
      {isEditing && (
        <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
          <div className="flex items-center justify-between">
            <span className="text-blue-700">💡 3개월 출고 데이터 기반 추천 설정</span>
            <button
              type="button"
              className="text-blue-600 hover:text-blue-800 underline"
              onClick={handleAutoSet}
              disabled={!outboundAnalysis?.data}
            >
              {outboundAnalysis?.data ? '자동 설정' : '분석 데이터 로딩중...'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default EditableStockSettings;