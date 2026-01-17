import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface UnifiedInventoryItem {
  id: number;
  productId?: number;
  inventoryId?: number;
  skuId: string;
  barcode: string;
  productName: string;
  productNameEng?: string;
  category: string;
  subCategory1?: string;
  subCategory2?: string;
  color?: string;
  productNumber?: string;
  brand?: string;
  currentStock: number;
  location?: string;
  lastUpdated?: string;
  minStock: number;
  maxStock?: number;
  reorderPoint?: number;
  safetyStock?: number;
  unitCost?: number;
  salesPrice?: number;
  supplier?: string;
  supplierCode?: string;
  notes?: string;
}

interface UnifiedInventoryResponse {
  success: boolean;
  data: UnifiedInventoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
  summary: {
    overall: {
      totalItems: number;
      totalValue: number;
      avgStock: number;
      lowStockItems: number;
      overStockItems: number;
    };
    filtered: {
      items: number;
      value: number;
    };
    options: {
      categories: string[];
      locations: string[];
      brands: string[];
    };
  };
}

interface FilterState {
  search: string;
  category: string;
  stockStatus: string;
  location: string;
  brand: string;
  page: number;
  limit: number;
}

const UnifiedInventoryPage: React.FC = () => {
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    category: '',
    stockStatus: '',
    location: '',
    brand: '',
    page: 1,
    limit: 50
  });
  
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [editingItem, setEditingItem] = useState<UnifiedInventoryItem | null>(null);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [inventoryData, setInventoryData] = useState<UnifiedInventoryResponse | null>(null);

  const queryClient = useQueryClient();

  // 데이터 로드 함수
  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value.toString());
      });
      
      console.log('Fetching unified inventory data:', params.toString());
      const response = await fetch(`/api/inventory/unified?${params}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        throw new Error(`API 오류: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      console.log('Unified inventory data received:', data);
      setInventoryData(data);
    } catch (error) {
      console.error('Fetch error:', error);
      setError(error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  // 초기 데이터 로드
  useEffect(() => {
    loadData();
  }, [filters]);

  // 통합 재고 데이터 조회 (React Query는 주석 처리)
  // const { data: inventoryData, isLoading, error } = useQuery<UnifiedInventoryResponse>({
  //   queryKey: ['inventory-unified', filters],
  //   queryFn: async () => {
  //     try {
  //       const params = new URLSearchParams();
  //       Object.entries(filters).forEach(([key, value]) => {
  //         if (value) params.append(key, value.toString());
  //       });
        
  //       console.log('Fetching unified inventory data:', params.toString());
  //       const response = await fetch(`/api/inventory/unified?${params}`);
        
  //       if (!response.ok) {
  //         const errorText = await response.text();
  //         console.error('API Error:', response.status, errorText);
  //         throw new Error(`API 오류: ${response.status} - ${errorText}`);
  //       }
        
  //       const data = await response.json();
  //       console.log('Unified inventory data received:', data);
  //       return data;
  //     } catch (error) {
  //       console.error('Fetch error:', error);
  //       throw error;
  //     }
  //   },
  //   staleTime: 30000,
  //   retry: 2,
  //   retryDelay: 1000,
  // });

  // 개별 항목 업데이트
  const updateItem = async (id: number, updates: Partial<UnifiedInventoryItem>) => {
    try {
      const response = await fetch(`/api/inventory/unified/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) throw new Error('업데이트 실패');
      await loadData(); // 데이터 재로드
      setEditingItem(null);
    } catch (error) {
      console.error('Update error:', error);
      alert('업데이트에 실패했습니다.');
    }
  };

  // 일괄 업데이트
  const bulkUpdate = async (ids: number[], updates: Partial<UnifiedInventoryItem>) => {
    try {
      const response = await fetch('/api/inventory/unified/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, updates })
      });
      if (!response.ok) throw new Error('일괄 업데이트 실패');
      await loadData(); // 데이터 재로드
      setSelectedItems(new Set());
      setShowBulkEdit(false);
    } catch (error) {
      console.error('Bulk update error:', error);
      alert('일괄 업데이트에 실패했습니다.');
    }
  };

  // React Query mutations (주석 처리)
  // const updateItemMutation = useMutation({
  //   mutationFn: async ({ id, updates }: { id: number; updates: Partial<UnifiedInventoryItem> }) => {
  //     const response = await fetch(`/api/inventory/unified/${id}`, {
  //       method: 'PATCH',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify(updates)
  //     });
  //     if (!response.ok) throw new Error('업데이트 실패');
  //     return response.json();
  //   },
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ['inventory-unified'] });
  //     setEditingItem(null);
  //   },
  // });

  // const bulkUpdateMutation = useMutation({
  //   mutationFn: async ({ ids, updates }: { ids: number[]; updates: Partial<UnifiedInventoryItem> }) => {
  //     const response = await fetch('/api/inventory/unified/bulk', {
  //       method: 'PATCH',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ ids, updates })
  //     });
  //     if (!response.ok) throw new Error('일괄 업데이트 실패');
  //     return response.json();
  //   },
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ['inventory-unified'] });
  //     setSelectedItems(new Set());
  //     setShowBulkEdit(false);
  //   },
  // });

  // 필터 변경 핸들러
  const handleFilterChange = (field: keyof FilterState, value: string | number) => {
    setFilters(prev => ({
      ...prev,
      [field]: value,
      ...(field !== 'page' && { page: 1 }) // 페이지 이외의 필터 변경 시 첫 페이지로
    }));
  };

  // 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    if (checked && inventoryData?.data) {
      setSelectedItems(new Set(inventoryData.data.map(item => item.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  // 개별 선택
  const handleSelectItem = (id: number, checked: boolean) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(id);
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  // 재고 상태 표시
  const getStockStatus = (item: UnifiedInventoryItem) => {
    if (item.currentStock <= 0) return { status: 'critical', label: '품절', color: 'bg-red-100 text-red-800' };
    if (item.currentStock <= item.minStock) return { status: 'low', label: '부족', color: 'bg-yellow-100 text-yellow-800' };
    if (item.maxStock && item.currentStock >= item.maxStock) return { status: 'high', label: '과재고', color: 'bg-purple-100 text-purple-800' };
    return { status: 'normal', label: '정상', color: 'bg-green-100 text-green-800' };
  };

  // 인라인 편집 저장
  const handleInlineEdit = (item: UnifiedInventoryItem, field: keyof UnifiedInventoryItem, value: any) => {
    updateItem(item.id, { [field]: value });
  };

  // 일괄 편집 실행
  const handleBulkEdit = (updates: Partial<UnifiedInventoryItem>) => {
    if (selectedItems.size === 0) {
      alert('선택된 항목이 없습니다.');
      return;
    }
    
    bulkUpdate(Array.from(selectedItems), updates);
  };

  const summary = inventoryData?.summary;
  const items = inventoryData?.data || [];
  const pagination = inventoryData?.pagination;

  if (error) {
    console.error('UnifiedInventoryPage error:', error);
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="text-red-600 text-lg">❌ 데이터 로드 오류</div>
          <div className="text-sm text-gray-500">{(error as Error).message}</div>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            페이지 새로고침
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <div className="text-gray-600">통합 재고 데이터를 불러오는 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 요약 대시보드 */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-2xl font-bold text-blue-600">{summary.overall.totalItems.toLocaleString()}</div>
            <div className="text-sm text-gray-600">총 제품 수</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-2xl font-bold text-green-600">{summary.overall.totalValue.toLocaleString()}원</div>
            <div className="text-sm text-gray-600">총 재고 가치</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-2xl font-bold text-yellow-600">{summary.overall.lowStockItems}</div>
            <div className="text-sm text-gray-600">부족 재고</div>
          </div>
          <div className="bg-white p-4 rounded-lg border shadow-sm">
            <div className="text-2xl font-bold text-purple-600">{summary.overall.overStockItems}</div>
            <div className="text-sm text-gray-600">과재고</div>
          </div>
        </div>
      )}

      {/* 통합 검색 및 필터 */}
      <div className="bg-white p-4 rounded-lg border shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="제품명, SKU, 바코드로 검색..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <select
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 카테고리</option>
            {summary?.options.categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={filters.stockStatus}
            onChange={(e) => handleFilterChange('stockStatus', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 재고상태</option>
            <option value="critical">품절</option>
            <option value="low">부족</option>
            <option value="normal">정상</option>
            <option value="high">과재고</option>
          </select>

          <select
            value={filters.location}
            onChange={(e) => handleFilterChange('location', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 로케이션</option>
            {summary?.options.locations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>

        {/* 액션 버튼 */}
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            {selectedItems.size > 0 && (
              <>
                <button
                  onClick={() => setShowBulkEdit(true)}
                  className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-md text-sm transition-colors"
                >
                  일괄 편집 ({selectedItems.size}개)
                </button>
                <button
                  onClick={() => setSelectedItems(new Set())}
                  className="bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-md text-sm transition-colors"
                >
                  선택 해제
                </button>
              </>
            )}
          </div>
          
          <div className="flex gap-2">
            <button className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-md text-sm transition-colors">
              CSV 내보내기
            </button>
            <button className="bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded-md text-sm transition-colors">
              템플릿 다운로드
            </button>
          </div>
        </div>
      </div>

      {/* 메인 테이블 */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === items.length && items.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="p-3 text-left font-medium">SKU</th>
                <th className="p-3 text-left font-medium">제품명</th>
                <th className="p-3 text-left font-medium">카테고리</th>
                <th className="p-3 text-left font-medium">현재고</th>
                <th className="p-3 text-left font-medium">최소재고</th>
                <th className="p-3 text-left font-medium">재고상태</th>
                <th className="p-3 text-left font-medium">로케이션</th>
                <th className="p-3 text-left font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span className="ml-2">데이터 로딩 중...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-500">
                    조건에 맞는 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const stockStatus = getStockStatus(item);
                  const isSelected = selectedItems.has(item.id);
                  
                  return (
                    <tr key={item.id} className={`border-t hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleSelectItem(item.id, e.target.checked)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="p-3 font-mono text-sm">{item.skuId}</td>
                      <td className="p-3">
                        <div>
                          <div className="font-medium">{item.productName}</div>
                          {item.productNameEng && (
                            <div className="text-sm text-gray-500">{item.productNameEng}</div>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                          {item.category}
                        </span>
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={item.currentStock}
                          onChange={(e) => handleInlineEdit(item, 'currentStock', parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                          min="0"
                        />
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          value={item.minStock}
                          onChange={(e) => handleInlineEdit(item, 'minStock', parseInt(e.target.value) || 0)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center"
                          min="0"
                        />
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${stockStatus.color}`}>
                          {stockStatus.label}
                        </span>
                      </td>
                      <td className="p-3 text-sm">{item.location || '-'}</td>
                      <td className="p-3">
                        <button
                          onClick={() => setEditingItem(item)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          편집
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {pagination && pagination.pages > 1 && (
          <div className="p-4 border-t bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                총 {pagination.total.toLocaleString()}개 중 {((pagination.page - 1) * pagination.limit + 1).toLocaleString()}-{Math.min(pagination.page * pagination.limit, pagination.total).toLocaleString()}개 표시
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleFilterChange('page', Math.max(1, pagination.page - 1))}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  이전
                </button>
                <span className="px-3 py-1">
                  {pagination.page} / {pagination.pages}
                </span>
                <button
                  onClick={() => handleFilterChange('page', Math.min(pagination.pages, pagination.page + 1))}
                  disabled={pagination.page >= pagination.pages}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  다음
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 개별 편집 모달 */}
      {editingItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">제품 편집</h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const updates = {
                currentStock: parseInt(formData.get('currentStock') as string) || 0,
                minStock: parseInt(formData.get('minStock') as string) || 0,
                maxStock: parseInt(formData.get('maxStock') as string) || undefined,
                reorderPoint: parseInt(formData.get('reorderPoint') as string) || undefined,
                location: formData.get('location') as string || undefined,
                notes: formData.get('notes') as string || undefined,
              };
              updateItem(editingItem.id, updates);
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">제품명</label>
                <div className="px-3 py-2 bg-gray-100 rounded">{editingItem.productName}</div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">현재고 *</label>
                <input
                  type="number"
                  name="currentStock"
                  defaultValue={editingItem.currentStock}
                  min="0"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">최소재고 *</label>
                <input
                  type="number"
                  name="minStock"
                  defaultValue={editingItem.minStock}
                  min="0"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">최대재고</label>
                <input
                  type="number"
                  name="maxStock"
                  defaultValue={editingItem.maxStock || ''}
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">재주문 시점</label>
                <input
                  type="number"
                  name="reorderPoint"
                  defaultValue={editingItem.reorderPoint || ''}
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">로케이션</label>
                <input
                  type="text"
                  name="location"
                  defaultValue={editingItem.location || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">메모</label>
                <textarea
                  name="notes"
                  defaultValue={editingItem.notes || ''}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="flex-1 px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 일괄 편집 모달 */}
      {showBulkEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">일괄 편집 ({selectedItems.size}개 항목)</h3>
              <button
                onClick={() => setShowBulkEdit(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const updates: Partial<UnifiedInventoryItem> = {};
              
              const minStock = formData.get('minStock') as string;
              const maxStock = formData.get('maxStock') as string;
              const reorderPoint = formData.get('reorderPoint') as string;
              const location = formData.get('location') as string;
              
              if (minStock) updates.minStock = parseInt(minStock);
              if (maxStock) updates.maxStock = parseInt(maxStock);
              if (reorderPoint) updates.reorderPoint = parseInt(reorderPoint);
              if (location) updates.location = location;
              
              if (Object.keys(updates).length === 0) {
                alert('변경할 항목을 입력해주세요.');
                return;
              }
              
              handleBulkEdit(updates);
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">최소재고 (일괄 변경)</label>
                <input
                  type="number"
                  name="minStock"
                  min="0"
                  placeholder="변경하지 않으려면 비워두세요"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">최대재고 (일괄 변경)</label>
                <input
                  type="number"
                  name="maxStock"
                  min="0"
                  placeholder="변경하지 않으려면 비워두세요"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">재주문 시점 (일괄 변경)</label>
                <input
                  type="number"
                  name="reorderPoint"
                  min="0"
                  placeholder="변경하지 않으려면 비워두세요"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">로케이션 (일괄 변경)</label>
                <input
                  type="text"
                  name="location"
                  placeholder="변경하지 않으려면 비워두세요"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowBulkEdit(false)}
                  className="flex-1 px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  적용
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UnifiedInventoryPage;