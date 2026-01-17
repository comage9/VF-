import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SummaryCards from "./summary-cards";
import DataTable from "./data-table";
import ProductMasterTab from "./product-master-tab";
import type { InventoryItem } from "@shared/schema";
import { useLowStockItems, useProductStatistics, useOverStockItems, type OverStockResponse } from "../hooks/useProducts";

const EXCLUDED_LOW_STOCK_STATUSES = ['단종', 'fc변경'];

type InventoryRow = InventoryItem & {
  totalQuantity?: number | string | null;
  skuId?: string | null;
  location?: string | null;
  dataType?: string | null;
  date?: string | null;
  recordDate?: string | null;
  recordDateRaw?: string | null;
  availability?: string | null;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const cleaned = value.trim();
    if (cleaned.length === 0) return 0;
    const normalized = cleaned.replace(/[^0-9.+-]/g, '');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function getRecordTimestamp(item: InventoryRow): number {
  const sources = [
    item.recordDate,
    item.date,
    item.recordDateRaw,
    item.lastRestock,
    item.updatedAt,
    item.createdAt,
  ];
  for (const source of sources) {
    if (!source) continue;
    const timestamp = new Date(source).getTime();
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }
  return 0;
}

function sortByRecent(data: InventoryRow[]): InventoryRow[] {
  return [...data].sort((a, b) => {
    const timestampA = getRecordTimestamp(a);
    const timestampB = getRecordTimestamp(b);
    return timestampB - timestampA;
  });
}

export default function InventoryTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"inventory" | "product-master">("inventory");
  const [tableData, setTableData] = useState<InventoryRow[]>([]);
  const [tableTitle, setTableTitle] = useState("전산 재고 현황");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  
  // 제품 마스터 기반 부족재고 조회
  const { data: lowStockData, isLoading: isLoadingLowStock } = useLowStockItems();
  const { data: productStats } = useProductStatistics();
  const { data: overStockData, isLoading: isLoadingOverStock } = useOverStockItems();
  
  const { data: inventoryItems = [], isLoading } = useQuery<InventoryRow[]>({
    queryKey: ['/api/inventory'],
    queryFn: async () => {
      const response = await fetch('/api/inventory');
      if (!response.ok) {
        throw new Error('Failed to load inventory');
      }
      return response.json();
    }
  });

  const { data: inventoryDates = [] } = useQuery<{ date: string; count: number }[]>({
    queryKey: ['/api/inventory/dates'],
    queryFn: async () => {
      const response = await fetch('/api/inventory/dates');
      if (!response.ok) {
        throw new Error('Failed to load inventory date summary');
      }
      return response.json();
    },
  });

  const sortedInventory = useMemo(() => sortByRecent(inventoryItems), [inventoryItems]);

  const filteredData = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return sortedInventory.filter((item) => {
      const searchableFields = [
        item.name,
        item.location,
        item.category,
        item.barcode,
        item.skuId,
        item.dataType,
      ]
        .filter((value) => value !== undefined && value !== null)
        .map((value) => String(value).toLowerCase());
      const matchesSearch = !keyword || searchableFields.some((field) => field.includes(keyword));
      const locationValue = item.location || item.category || '';
      const matchesCategory = !filterCategory || locationValue === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [sortedInventory, searchQuery, filterCategory]);

  // 초기 테이블 데이터 설정
  useEffect(() => {
    setTableData(filteredData);
  }, [filteredData]);

  const outOfStockItems = useMemo(() => {
    return sortedInventory.filter((item) => {
      const stock = toNumber(item.totalQuantity ?? item.currentStock);
      const normalizedStatus = (item.status || '').toLowerCase().replace(/\\s+/g, '');
      if (EXCLUDED_LOW_STOCK_STATUSES.some((phrase) => normalizedStatus.includes(phrase.replace(/\\s+/g, '')))) {
        return false;
      }
      return stock <= 0;
    });
  }, [sortedInventory]);

  const categoryOptions = useMemo(() => {
    const unique = new Set<string>();
    sortedInventory.forEach((item) => {
      const value = (item.location || item.category || '').trim();
      if (!value) return;
      unique.add(value);
    });
    return Array.from(unique).map((value) => ({
      value,
      label: value,
    }));
  }, [sortedInventory]);

  const latestInventoryDate = inventoryDates.find((entry) => entry.date !== 'unknown')?.date || null;

  // 부족재고 카드 클릭 핸들러
  const handleLowStockClick = (items: any[] = outOfStockItems) => {
    const mappedItems = items.map(item => {
      if (item.productName || item.currentStock !== undefined) {
        // 부족재고 API 데이터 구조
        return {
          ...item,
          name: item.productName || item.name,
          totalQuantity: item.currentStock,
          barcode: item.barcode,
          location: item.location,
          skuId: item.skuId
        };
      }
      // 기존 인벤토리 데이터 구조
      return item;
    });
    
    setTableData(sortByRecent(mappedItems));
    setTableTitle("부족 재고 상세");
  };

  // 과잉재고 카드 클릭 핸들러  
  const handleOverStockClick = (items: any[] = []) => {
    const mappedItems = items.map(item => ({
      ...item,
      name: item.productName || item.name,
      totalQuantity: item.currentStock,
      barcode: item.barcode,
      location: item.location,
      skuId: item.skuId
    }));
    
    setTableData(mappedItems);
    setTableTitle("과잉 재고 상세");
  };

  // 전체 재고로 테이블 초기화
  const resetTableToDefault = () => {
    setTableData(filteredData);
    setTableTitle("전산 재고 현황");
  };

  const handleDeleteByDate = async (dateToDelete?: string) => {
    const targetDate = dateToDelete || selectedDate;
    if (!targetDate) {
      alert('삭제할 일자를 선택해주세요.');
      return;
    }

    const confirmed = confirm(`${targetDate} 데이터를 삭제하시겠습니까?`);
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      const response = await fetch(`/api/inventory/date/${targetDate}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Delete request failed');
      }
      const result = await response.json();
      alert(`삭제 완료: ${result.deleted}건 제거되었습니다.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/inventory'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['/api/inventory/dates'], refetchType: 'active' }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['/api/inventory'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['/api/inventory/dates'], type: 'active' }),
      ]);
      setSelectedDate('');
    } catch (error) {
      console.error('Delete by date error:', error);
      alert('삭제 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    const confirmed = confirm('모든 재고 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.');
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      const response = await fetch('/api/inventory', { method: 'DELETE' });
      if (!response.ok) {
        throw new Error('Delete all request failed');
      }
      const result = await response.json();
      alert(`전체 삭제 완료: ${result.deleted}건 제거되었습니다.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/inventory'], refetchType: 'active' }),
        queryClient.invalidateQueries({ queryKey: ['/api/inventory/dates'], refetchType: 'active' }),
      ]);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['/api/inventory'], type: 'active' }),
        queryClient.refetchQueries({ queryKey: ['/api/inventory/dates'], type: 'active' }),
      ]);
      setSelectedDate('');
    } catch (error) {
      console.error('Delete all error:', error);
      alert('전체 삭제 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = [
    {
      key: 'barcode',
      label: 'barcode',
      render: (value: string | null) => (
        <span className="text-sm font-mono text-muted-foreground">{value || '-'}</span>
      )
    },
    {
      key: 'date',
      label: 'date',
      render: (_value: string | null, row: InventoryRow) => {
        const display = row.date || row.recordDateRaw || row.recordDate;
        if (!display) {
          return <span className="text-sm text-muted-foreground">-</span>;
        }
        const parsed = new Date(display);
        if (!Number.isNaN(parsed.getTime())) {
          return (
            <span className="text-sm text-muted-foreground">{parsed.toISOString().slice(0, 10)}</span>
          );
        }
        return <span className="text-sm text-muted-foreground">{display}</span>;
      }
    },
    {
      key: 'totalQuantity',
      label: 'totalQuantity',
      render: (_value: number | string | null, row: InventoryRow) => {
        const quantity = toNumber(row.totalQuantity ?? row.currentStock);
        return <span className="text-sm text-foreground">{quantity.toLocaleString()}</span>;
      }
    },
    {
      key: 'skuId',
      label: 'SKU ID',
      render: (value: string | null) => (
        <span className="text-sm text-muted-foreground">{value || '-'}</span>
      )
    },
    {
      key: 'location',
      label: '로케이션',
      render: (value: string | null) => (
        <span className="text-sm text-muted-foreground">{value || '-'}</span>
      )
    },
    {
      key: 'name',
      label: '상품명',
      render: (value: string) => (
        <span className="text-sm font-medium text-foreground">{value}</span>
      )
    },
  ];

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('csv', file);

    try {
      const response = await fetch('/api/inventory/import.csv', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('File upload failed');
      }

      alert('업로드가 완료되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory/dates'] });
    } catch (error) {
      console.error('Upload error:', error);
      alert('업로드에 실패했습니다. 파일 형식과 데이터를 확인해주세요.');
    } finally {
      // allow re-uploading the same file consecutively
      event.target.value = '';
    }
  };

  if (isLoading) {
    return <div className="text-center py-8">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <button
          onClick={() => setActiveTab("inventory")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "inventory"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          재고 현황
        </button>
        <button
          onClick={() => setActiveTab("product-master")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "product-master"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          제품 마스터 관리
        </button>
      </div>

      {activeTab === "inventory" ? (
        <>
          <SummaryCards 
            type="inventory"
            totalItems={sortedInventory.length}
            lowStockCount={lowStockData?.data?.length ?? 0}
            overStockCount={overStockData?.data?.length ?? 0}
            onTotalInventoryClick={() => resetTableToDefault()}
            onLowStockClick={() => handleLowStockClick(lowStockData?.data ?? [])}
            onOverStockClick={() => handleOverStockClick(overStockData?.data ?? [])}
          />

          <div className="flex flex-col md:flex-row justify-between gap-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <label className="flex flex-col text-sm text-muted-foreground">
                삭제할 일자
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="mt-1 px-3 py-2 border border-input rounded bg-background text-foreground"
                />
              </label>
              <button
                type="button"
                onClick={() => handleDeleteByDate()}
                disabled={isDeleting || !selectedDate}
                className="px-4 py-2 text-sm border border-red-500 text-red-600 rounded hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isDeleting ? '삭제 중...' : '일자별 데이터 삭제'}
              </button>
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={isDeleting}
                className="px-4 py-2 text-sm border border-red-500 text-red-600 rounded hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isDeleting ? '삭제 중...' : '전체 데이터 삭제'}
              </button>
            </div>
            <div className="flex justify-end gap-3">
              <button 
                className="btn btn-sm btn-secondary" 
                onClick={resetTableToDefault}
              >
                전체 보기
              </button>
              <button 
                className="btn btn-sm btn-primary" 
                onClick={() => fileInputRef.current?.click()}
              >
                Upload CSV
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv,.xlsx"
                onChange={handleUpload}
              />
            </div>
          </div>

          <DataTable
            title={tableTitle}
            columns={columns}
            data={tableData}
            searchPlaceholder="상품 · 바코드 · SKU 검색..."
            filterOptions={categoryOptions}
            onSearch={setSearchQuery}
            onFilter={setFilterCategory}
          />

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-foreground mb-3">업로드 일자 요약</h2>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left text-muted-foreground">일자</th>
                    <th className="px-4 py-2 text-right text-muted-foreground">항목 수</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inventoryDates.length === 0 ? (
                    <tr>
                      <td className="px-4 py-3 text-muted-foreground" colSpan={2}>업로드된 데이터가 없습니다.</td>
                    </tr>
                  ) : (
                    inventoryDates.map(({ date, count }) => (
                      <tr key={date} className="hover:bg-muted/50">
                        <td className="px-4 py-3 text-foreground">
                          {date === 'unknown' ? '일자 정보 없음' : date.replace(/-/g, '.')}
                        </td>
                        <td className="px-4 py-3 text-right text-foreground flex items-center justify-end gap-3">
                          <span>{count.toLocaleString()}</span>
                          {date !== 'unknown' && (
                            <button
                              type="button"
                              className="px-2 py-1 text-xs border border-red-500 text-red-600 rounded hover:bg-red-500/10"
                              onClick={() => handleDeleteByDate(date)}
                              disabled={isDeleting}
                            >
                              삭제
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <ProductMasterTab />
      )}
    </div>
  );
}

export { type InventoryRow };