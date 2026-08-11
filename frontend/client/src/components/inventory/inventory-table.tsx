import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Edit } from 'lucide-react';
import { UnifiedInventoryResponseEnhanced } from '../../types/enhanced-inventory';
import { matchesSearchInFields, isLocationPattern } from '@/lib/searchMatch';

interface InboundOrderLine {
  id: string;
  barcode: string;
  orderNo: string;
  orderStatus: string;
  productName: string;
  productNo: string;
  orderedQty: number;
  confirmedQty: number;
  receivedQty: number;
  expectedDate: string | null;
}

interface InventoryTableProps {
  data: UnifiedInventoryResponseEnhanced['data'];
  onItemUpdate: (itemId: string, updates: any) => void;
  selectedItems: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  stockStatusFilter?: string | null;
  onToggleStockStatus?: (status: string) => void;
  /** 품목명 클릭 → 출고/현재고 리포트 팝업 */
  onProductClick?: (item: UnifiedInventoryResponseEnhanced['data'][number]) => void;
  /** 우측 수정 아이콘 → 제품 마스터 수정 다이얼로그 (masterSpecId 필요) */
  onEditSpec?: (item: UnifiedInventoryResponseEnhanced['data'][number]) => void;
}

export default function InventoryTable({
  data,
  onItemUpdate: _onItemUpdate,
  selectedItems,
  onSelectionChange,
  stockStatusFilter,
  onToggleStockStatus,
  onProductClick,
  onEditSpec,
}: InventoryTableProps) {
  const [sortField, setSortField] = useState<string>('location');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterLocation, setFilterLocation] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const locationCollator = useMemo(() => {
    return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  }, []);

  // 바코드 마스터 데이터 조회 (재고 임계값 확인용)
  const { data: barcodeMasterData } = useQuery({
    queryKey: ['inventory-barcode-master'],
    queryFn: async () => {
      const response = await fetch('/api/inventory/barcode-master?limit=5000');
      if (!response.ok) {
        throw new Error('바코드 마스터 데이터를 불러올 수 없습니다.');
      }
      return response.json();
    },
    staleTime: 300000, // 5분
  });

  // 입고 발주서 데이터 조회 (입고 가능 수량 계산용)
  const { data: inboundData } = useQuery<{
    success: boolean;
    data: InboundOrderLine[];
    uploadInfo: any;
  }>({
    queryKey: ['inbound-order-latest'],
    queryFn: async () => {
      const response = await fetch('/api/inventory/inbound/latest');
      if (!response.ok) {
        throw new Error('입고 발주서 데이터를 불러올 수 없습니다.');
      }
      return response.json();
    },
    staleTime: 60000, // 1분
  });

  // 바코드별 임계값 맵 생성
  const thresholdMap = useMemo(() => {
    const map = new Map();
    if (barcodeMasterData?.data) {
      barcodeMasterData.data.forEach((item: any) => {
        if (item.barcode) {
          map.set(item.barcode, {
            minStock: item.minStock || 0,
            maxStock: item.maxStock || 0,
            hasThreshold: (item.minStock > 0 || item.maxStock > 0)
          });
        }
      });
    }
    return map;
  }, [barcodeMasterData]);

  // 바코드별 입고 가능 수량 맵 생성
  const inboundAvailableMap = useMemo(() => {
    const map = new Map<string, number>();
    if (inboundData?.data) {
      const uploadInfo = inboundData.uploadInfo;
      const isUnreceivedCsv = uploadInfo?.fileType === 'unreceived_csv';

      inboundData.data.forEach((line: InboundOrderLine) => {
        const existing = map.get(line.barcode) || 0;
        let inboundAvailable: number;

        if (isUnreceivedCsv) {
          // 발주서 미입고 물량.csv: (확정수량 - 입고수량) - 현재고
          // 현재고는 데이터에서 가져와야 함
          inboundAvailable = (line.confirmedQty - line.receivedQty);
        } else {
          // VF 발주서 업로드.xlsx: 확정수량
          inboundAvailable = line.confirmedQty;
        }

        // 음수 방지
        map.set(line.barcode, existing + Math.max(0, inboundAvailable));
      });
    }
    return map;
  }, [inboundData]);

  const getStockStatusColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'low':
        return 'bg-yellow-100 text-yellow-800';
      case 'high':
        return 'bg-blue-100 text-blue-800';
      case 'normal':
      default:
        return 'bg-green-100 text-green-800';
    }
  };

  const getStockStatusLabel = (status: string) => {
    switch (status) {
      case 'critical':
        return '위험';
      case 'low':
        return '부족(발주요청)';
      case 'high':
        return '과잉';
      case 'normal':
      default:
        return '안전';
    }
  };

  // 필터링 및 정렬된 데이터
  const filteredAndSortedData = useMemo(() => {
    let filtered = data.filter(item => {
      const matchesCategory = !filterCategory || item.category === filterCategory;
      const matchesLocation = !filterLocation || item.location === filterLocation;
      const matchesStockStatus = !stockStatusFilter || (item.stockStatus || 'normal') === stockStatusFilter;
      const matchesSearch =
        !searchTerm.trim() ||
        matchesSearchInFields(
          [item.productName, item.barcode, item.skuId, item.location],
          searchTerm
        );

      return matchesCategory && matchesLocation && matchesStockStatus && matchesSearch;
    });

    // 정렬 — 검색어가 로케이션 패턴이면 정확일치 우선
    filtered.sort((a, b) => {
      // 검색어가 있으면 로케이션 정확일치/시작일치 부스트
      if (searchTerm.trim() && isLocationPattern(searchTerm)) {
        const q = searchTerm.trim().toLowerCase();
        const aLoc = String(a.location || '').toLowerCase();
        const bLoc = String(b.location || '').toLowerCase();
        const aExact = aLoc === q ? 0 : aLoc.startsWith(q) ? 1 : 2;
        const bExact = bLoc === q ? 0 : bLoc.startsWith(q) ? 1 : 2;
        if (aExact !== bExact) return aExact - bExact;
      }

      let aValue = a[sortField as keyof typeof a];
      let bValue = b[sortField as keyof typeof b];

      // null/undefined 처리
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortDirection === 'asc' ? -1 : 1;
      if (bValue == null) return sortDirection === 'asc' ? 1 : -1;

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        if (sortField === 'location') {
          const cmp = locationCollator.compare(aValue, bValue);
          return sortDirection === 'asc' ? cmp : -cmp;
        }

        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [data, sortField, sortDirection, filterCategory, filterLocation, stockStatusFilter, searchTerm]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(new Set(filteredAndSortedData.map(item => item.id)));
    } else {
      onSelectionChange(new Set());
    }
  };

  const handleSelectItem = (itemId: string, checked: boolean) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(itemId);
    } else {
      newSelected.delete(itemId);
    }
    onSelectionChange(newSelected);
  };

  return (
    <div className="space-y-4">
      {/* 필터 및 검색 */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">검색</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="제품명, 바코드, 외부 SKU ID, 로케이션..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">분류</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체</option>
                {Array.from(new Set(data.map(item => item.category).filter(Boolean))).map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">로케이션</label>
            <select
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">전체</option>
                {Array.from(new Set(data.map(item => item.location).filter(Boolean))).map(location => (
                  <option key={location} value={location}>{location}</option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedItems.size === filteredAndSortedData.length && filteredAndSortedData.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('productName')}
                >
                  제품명 {sortField === 'productName' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">바코드</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">외부 SKU ID</th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('inventoryDate')}
                >
                  재고기준일 {sortField === 'inventoryDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('currentStock')}
                >
                  현재재고 {sortField === 'currentStock' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">단가</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">재고 금액</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">입고 가능</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">최소재고</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">최대재고</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">재고 상태</th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('location')}
                >
                  로케이션 {sortField === 'location' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">업데이트일</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50">수정</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.id)}
                      onChange={(e) => handleSelectItem(item.id, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {onProductClick ? (
                      <button
                        type="button"
                        onClick={() => onProductClick(item)}
                        className="text-left group"
                        title="클릭: 출고 수량·전산 재고 리포트"
                      >
                        <div className="text-sm font-medium text-gray-900 group-hover:text-indigo-700 group-hover:underline underline-offset-2">
                          {item.productName}
                        </div>
                        <div className="text-sm text-gray-500">{item.category}</div>
                      </button>
                    ) : (
                      <>
                        <div className="text-sm font-medium text-gray-900">{item.productName}</div>
                        <div className="text-sm text-gray-500">{item.category}</div>
                      </>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.barcode || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.skuId || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {item.inventoryDate ? new Date(item.inventoryDate).toLocaleDateString('ko-KR') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.currentStock}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(() => {
                      const price = Number(item.price || 0);
                      return price > 0 ? `${price.toLocaleString('ko-KR')}원` : '0원';
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-600">
                    {(() => {
                      const price = Number(item.price || 0);
                      const amount = Number(item.currentStock || 0) * price;
                      return price > 0 ? `${amount.toLocaleString('ko-KR')}원` : '0원';
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(() => {
                      const barcode = item.barcode || '';
                      const expectedInbound = inboundAvailableMap.get(barcode) || 0;
                      const finalInboundAvailable = Math.max(0, expectedInbound);
                      return (
                        <span className={finalInboundAvailable > 0 ? 'text-blue-600 font-medium' : 'text-gray-400'}>
                          {finalInboundAvailable.toLocaleString()}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(() => {
                      const threshold = thresholdMap.get(item.barcode);
                      return threshold?.minStock || item.minStock || 0;
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {(() => {
                      const threshold = thresholdMap.get(item.barcode);
                      return threshold?.maxStock || item.maxStock || '-';
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {(() => {
                      const status = (item.stockStatus || 'normal') as string;
                      const active = stockStatusFilter === status;
                      return (
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full cursor-pointer hover:opacity-80 ${getStockStatusColor(status)} ${active ? 'ring-2 ring-offset-1 ring-blue-300' : ''}`}
                          onClick={() => onToggleStockStatus?.(status)}
                        >
                          {getStockStatusLabel(status)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.location || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString('ko-KR') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center sticky right-0 bg-white">
                    <button
                      type="button"
                      title={
                        (item as any).masterSpecId
                          ? '제품 마스터 수정 (마스터 페이지와 동일)'
                          : '마스터 미연결 품목'
                      }
                      disabled={!(item as any).masterSpecId || !onEditSpec}
                      onClick={(e) => {
                        e.stopPropagation();
                        if ((item as any).masterSpecId) onEditSpec?.(item);
                      }}
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${
                        (item as any).masterSpecId
                          ? 'border-violet-200 text-violet-700 hover:bg-violet-50'
                          : 'border-gray-200 text-gray-300 cursor-not-allowed'
                      }`}
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAndSortedData.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            필터링된 재고 항목이 없습니다.
          </div>
        )}
      </div>

      {/* 요약 정보 */}
      <div className="bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex justify-between items-center text-sm text-gray-600">
          <span>총 {data.length}개 항목 중 {filteredAndSortedData.length}개 표시</span>
          <span>선택된 항목: {selectedItems.size}개</span>
        </div>
      </div>
    </div>
  );
}