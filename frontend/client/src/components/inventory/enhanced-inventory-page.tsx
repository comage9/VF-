import React, { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useIsFetching, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Package, AlertTriangle, TrendingUp, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import LatestDataIndicator from './latest-data-indicator';
import EditableStockSettings from './editable-stock-settings';
import ThreeMonthAnalysis from './three-month-analysis';
import InventoryTable from './inventory-table';
import InboundAvailabilityTab from './inbound-availability-tab';
import { UnifiedInventoryResponseEnhanced, InventoryItem, StockStatus } from '../../types/enhanced-inventory';

// React Query 클라이언트 생성
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30초
      retry: 1,
    },
  },
});

interface EnhancedInventoryPageProps {
  className?: string;
}

type ActiveTab = 'inventory' | 'analysis' | 'settings' | 'inbound';

interface InventoryUploadRecord {
  id: string;
  fileName: string;
  uploadDate: string;
  inventoryDate: string;
  status: 'success' | 'failed' | 'processing';
  recordsProcessed: number;
  recordsSkipped: number;
  uploadedBy: string;
  fileSize: number;
  errorMessage?: string;
}

interface BarcodeMasterRow {
  id: string;
  barcode: string;
  skuId: string;
  productName: string;
  category: string;
  location: string;
  lifecycleStatus: 'active' | 'paused' | 'discontinued';
  minStock: number;
  maxStock: number;
  reorderPoint: number;
  safetyStock: number;
  notes: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface OutboundRecord {
  id?: string | number;
  productName: string;
  skuId?: string;
  barcode?: string;
  outboundDate?: string;
  outbound_date?: string;
  inboundDate?: string;
  inbound_date?: string;
  quantity?: number;
  unitPrice?: number;
  unit_price?: number;
  totalPrice?: number;
  total_price?: number;
}

function EnhancedInventoryPageContent({ className = "" }: EnhancedInventoryPageProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('inventory');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [inventoryDate, setInventoryDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingReceipts, setIsUploadingReceipts] = useState(false);
  const [showUploadHistory, setShowUploadHistory] = useState(false);
  const [activeInventoryDate, setActiveInventoryDate] = useState<string | null>(null);
  const [stockStatusFilter, setStockStatusFilter] = useState<string | null>(null);
  const [locationConflictOnly, setLocationConflictOnly] = useState(false);
  const [hiddenBarcodes, setHiddenBarcodes] = useState<Set<string>>(() => {
    try {
      const raw = window.localStorage.getItem('enhancedInventoryHiddenBarcodes');
      const arr = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(arr)) {
        return new Set(arr.map((v) => String(v)));
      }
    } catch {
      // ignore
    }
    return new Set();
  });
  const [settingsSearch, setSettingsSearch] = useState('');
  const [settingsLifecycleFilter, setSettingsLifecycleFilter] = useState<'all' | 'active' | 'paused' | 'discontinued'>('all');

  const queryClient = useQueryClient();

  const isFetchingInventory = useIsFetching({ queryKey: ['enhanced-inventory-overview'] }) > 0;
  const isFetchingBarcodeMaster = useIsFetching({ queryKey: ['inventory-barcode-master'] }) > 0;
  const isFetchingUploadHistory = useIsFetching({ queryKey: ['inventory-upload-history'] }) > 0;
  const isFetchingOutboundDaily = useIsFetching({ queryKey: ['outbound-barcode-daily'] }) > 0;
  const isRefreshingAny = isFetchingInventory || isFetchingBarcodeMaster || isFetchingUploadHistory || isFetchingOutboundDaily;

  const handleRefreshInventory = () => {
    queryClient.invalidateQueries({ queryKey: ['enhanced-inventory-overview'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-barcode-master'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-upload-history'] });
    queryClient.invalidateQueries({ queryKey: ['outbound-barcode-daily'] });
  };

  const handleLifecycleStatusChange = async (item: BarcodeMasterRow, statusValue: string) => {
    const lifecycleStatus = String(statusValue || '').trim().toLowerCase();
    if (!['active', 'paused', 'discontinued'].includes(lifecycleStatus)) return;
    const barcode = String(item?.barcode || '').trim();
    if (!barcode) return;
    try {
      const res = await fetch(`/api/inventory/unified/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode, lifecycleStatus }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || '상태 변경에 실패했습니다.');
      }
      queryClient.invalidateQueries({ queryKey: ['enhanced-inventory-overview'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-barcode-master'] });
    } catch (e: unknown) {
      console.error('lifecycle status update failed', e);
      alert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.');
    }
  };

  const handleRecalculateInventory = async () => {
    await queryClient.refetchQueries({ queryKey: ['enhanced-inventory-overview'] });
    await queryClient.refetchQueries({ queryKey: ['inventory-barcode-master'] });
    await queryClient.refetchQueries({ queryKey: ['inventory-upload-history'] });
    await queryClient.refetchQueries({ queryKey: ['outbound-barcode-daily'] });
  };

  // 실제 API에서 최신 재고 데이터 조회 (765건 전체)
  const { data: inventoryData, isLoading: isLoadingInventory, error: inventoryError } = useQuery<UnifiedInventoryResponseEnhanced>({
    queryKey: ['enhanced-inventory-overview'],
    queryFn: async () => {
      const response = await fetch('/api/inventory/unified');
      if (!response.ok) {
        throw new Error('재고 데이터를 불러오는데 실패했습니다');
      }
      return response.json();
    },
    refetchInterval: 30000, // 30초마다 자동 새로고침
  });

  // NOTE: 입고 발주 데이터는 InventoryTable / InboundAvailabilityTab 내부에서 필요 시 조회

  // 실제 인벤토리 아이템 데이터는 inventoryData.data에서 가져옴
  const inventoryItems = inventoryData?.data || [];

  const { data: barcodeMasterData, isLoading: isLoadingBarcodeMaster } = useQuery<{ success: boolean; data: BarcodeMasterRow[] }>({
    queryKey: ['inventory-barcode-master'],
    queryFn: async () => {
      const response = await fetch('/api/inventory/barcode-master?limit=5000');
      if (!response.ok) {
        throw new Error('BarcodeMaster 데이터를 불러올 수 없습니다.');
      }
      return response.json();
    },
    staleTime: 60_000,
  });

  const barcodeMasterItems = barcodeMasterData?.data || [];

  const unifiedByBarcode = React.useMemo(() => {
    const m = new Map<string, InventoryItem>();
    for (const it of inventoryItems) {
      const bc = String((it as InventoryItem)?.barcode || '').trim();
      if (!bc) continue;
      m.set(bc, it);
    }
    return m;
  }, [inventoryItems]);

  const settingsCatalogItems = React.useMemo(() => {
    return barcodeMasterItems.map((bm) => {
      const bc = String(bm?.barcode || '').trim();
      const u = bc ? unifiedByBarcode.get(bc) : null;
      return {
        id: bm.id,
        barcode: bc,
        skuId: bm.skuId || '',
        productName: (bm.productName || (u as InventoryItem | null)?.productName || '').trim(),
        category: (bm.category || (u as InventoryItem | null)?.category || '').trim(),
        location: (bm.location || (u as InventoryItem | null)?.location || '').trim(),
        lifecycleStatus: (bm.lifecycleStatus || (u as InventoryItem | null)?.lifecycleStatus || 'active') as 'active' | 'paused' | 'discontinued',
        minStock: bm.minStock ?? 0,
        maxStock: bm.maxStock ?? 0,
        reorderPoint: bm.reorderPoint ?? 0,
        safetyStock: bm.safetyStock ?? 0,
        currentStock: (u as InventoryItem | null)?.currentStock ?? 0,
        inventoryDate: (u as InventoryItem | null)?.inventoryDate ?? null,
        stockStatus: (u as InventoryItem | null)?.stockStatus ?? 'normal',
      };
    });
  }, [barcodeMasterItems, unifiedByBarcode]);

  const { data: uploadHistoryData, isLoading: isLoadingUploads } = useQuery<InventoryUploadRecord[]>({
    queryKey: ['inventory-upload-history'],
    queryFn: async () => {
      const response = await fetch('/api/inventory/upload-history');
      if (!response.ok) {
        throw new Error('업로드 이력을 불러올 수 없습니다.');
      }
      const json = await response.json();
      return Array.isArray(json.data) ? (json.data as InventoryUploadRecord[]) : [];
    },
    staleTime: 60_000,
  });

  const uploadHistory = uploadHistoryData ?? [];

  const normalizeDateKey = (value: string | null | undefined) => (value ? value.slice(0, 10) : null);

  const deleteUploadsMutation = useMutation({
    mutationFn: async (date?: string | null) => {
      const endpoint = date ? `/api/inventory/upload-history/${encodeURIComponent(date)}` : '/api/inventory/upload-history';
      const response = await fetch(endpoint, { method: 'DELETE' });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || '업로드 삭제에 실패했습니다.');
      }
      return response.json();
    },
    onSuccess: (_data, date) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-upload-history'] });
      queryClient.invalidateQueries({ queryKey: ['enhanced-inventory-overview'] });

      if (date) {
        const normalizedDate = normalizeDateKey(date);
        if (normalizedDate) {
          setActiveInventoryDate((prev) => (normalizeDateKey(prev) === normalizedDate ? null : prev));
        }
      } else {
        setActiveInventoryDate(null);
      }
    },
    onError: (error: Error | unknown) => {
      console.error('업로드 삭제 실패:', error);
      alert(error instanceof Error ? error.message : '업로드 삭제에 실패했습니다.');
    },
  });

  const isDeletingUploads = deleteUploadsMutation.isPending;

  const normalizedActiveDate = normalizeDateKey(activeInventoryDate);

  const inventoryItemsForInventoryTab = React.useMemo(() => {
    let filtered = inventoryItems;

    // 위치 정보가 있는 항목만 표시
    filtered = filtered.filter((item: InventoryItem) => item && item.location && String(item.location).trim() !== '');

    // 재고 현황 탭 정책: 중단/단종은 숨김(카드/필터 집계에서도 제외)
    filtered = filtered.filter((item: InventoryItem) => {
      const ls = String(item?.lifecycleStatus || 'active').toLowerCase();
      return !['paused', 'discontinued'].includes(ls);
    });

    // 예외(숨김) 처리: barcode 기준으로 테이블에서 제외
    filtered = filtered.filter((item: InventoryItem) => {
      const bc = String(item?.barcode || '').trim();
      if (!bc) return true;
      return !hiddenBarcodes.has(bc);
    });

    // DB 기반 숨김 처리: 단종/중단(paused/discontinued) + 재고0인 경우 backend가 hiddenReason을 내려줌
    filtered = filtered.filter((item: InventoryItem) => {
      const reason = item?.hiddenReason;
      if (!reason) return true;
      return reason !== 'lifecycle_zero_stock';
    });

    if (normalizedActiveDate) {
      filtered = filtered.filter((item) => {
        if (!item || !item.inventoryDate) return false;
        return normalizeDateKey(item.inventoryDate) === normalizedActiveDate;
      });
    }

    return filtered;
  }, [inventoryItems, normalizedActiveDate, hiddenBarcodes]);

  const inventoryItemsForSettingsTab = React.useMemo(() => {
    let filtered = settingsCatalogItems;

    // 설정 탭 정책: BarcodeMaster 전체 + 상태별 필터 가능
    const filterVal = String(settingsLifecycleFilter || 'all').toLowerCase();
    if (filterVal !== 'all') {
      filtered = filtered.filter((item: InventoryItem) => String(item?.lifecycleStatus || 'active').toLowerCase() === filterVal);
    }

    return filtered;
  }, [settingsCatalogItems, settingsLifecycleFilter]);

  const toggleHiddenBarcode = (barcode: string, hidden: boolean) => {
    const bc = String(barcode || '').trim();
    if (!bc) return;
    setHiddenBarcodes((prev) => {
      const next = new Set(prev);
      if (hidden) next.add(bc);
      else next.delete(bc);
      try {
        window.localStorage.setItem('enhancedInventoryHiddenBarcodes', JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const activeDateLabel = normalizedActiveDate
    ? new Date(normalizedActiveDate).toLocaleDateString('ko-KR')
    : null;

  const locationConflictBarcodeSet = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const item of inventoryItemsForInventoryTab) {
      const bc = String(item?.barcode || '').trim();
      if (!bc) continue;
      const loc = String(item?.location ?? '').trim();
      if (!map.has(bc)) map.set(bc, new Set());
      map.get(bc)!.add(loc);
    }
    const out = new Set<string>();
    for (const [bc, locSet] of map.entries()) {
      if ((locSet?.size || 0) > 1) out.add(bc);
    }
    return out;
  }, [inventoryItemsForInventoryTab]);

  const locationConflictRows = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const item of inventoryItemsForInventoryTab) {
      const bc = String(item?.barcode || '').trim();
      if (!bc) continue;
      const loc = String(item?.location ?? '').trim();
      if (!map.has(bc)) map.set(bc, new Set());
      map.get(bc)!.add(loc);
    }

    const rows: Array<{ barcode: string; locations: string[] }> = [];
    for (const [bc, locSet] of map.entries()) {
      const uniqueLocations = Array.from(locSet || []).map((v) => String(v)).filter((v) => v !== '');
      const distinct = uniqueLocations.length;
      if (distinct > 1) {
        uniqueLocations.sort((a, b) => a.localeCompare(b));
        rows.push({ barcode: bc, locations: uniqueLocations });
      }
    }
    rows.sort((a, b) => a.barcode.localeCompare(b.barcode));
    return rows;
  }, [inventoryItemsForInventoryTab]);

  const hasLocationConflicts = locationConflictBarcodeSet.size > 0;

  useEffect(() => {
    if (locationConflictOnly && !hasLocationConflicts) {
      setLocationConflictOnly(false);
    }
  }, [locationConflictOnly, hasLocationConflicts]);

  const inventoryItemsForInventoryTabDisplayed = React.useMemo(() => {
    if (!locationConflictOnly) return inventoryItemsForInventoryTab;
    return inventoryItemsForInventoryTab.filter((item: InventoryItem) => locationConflictBarcodeSet.has(String(item?.barcode || '').trim()));
  }, [inventoryItemsForInventoryTab, locationConflictBarcodeSet, locationConflictOnly]);

  // Calculate Unit Price from Outbound Data (Last 90 days)
  const { data: outboundRecords } = useQuery({
    queryKey: ['outbound-for-price-calculation'],
    queryFn: async () => {
      // Calculate start date (90 days ago)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 90);

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const res = await fetch(`/api/outbound?startDate=${startStr}&endDate=${endStr}`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    },
    staleTime: 300000, // 5 minutes
  });

  const priceMap = React.useMemo(() => {
    const map = new Map<string, number>();
    if (!outboundRecords) return map;

    // Group by product name -> list of unit prices
    // We'll take the average of the most recent transactions or just the latest one
    // Here we use a simple approach: map product/barcode to the latest calculated unit price

    // Sort records by date descending
    const sorted = [...outboundRecords].sort((a: OutboundRecord, b: OutboundRecord) => {
      const dateA = a.outboundDate || a.outbound_date || a.inboundDate || a.inbound_date || 0;
      const dateB = b.outboundDate || b.outbound_date || b.inboundDate || b.inbound_date || 0;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    for (const record of sorted) {
      const name = String(record.productName || record.product_name || '').trim();
      const barcode = String(record.barcode || '').trim();
      const sales = Number(record.salesAmount || record.sales_amount || 0);
      // Use boxQuantity first, then quantity
      const qty = Number(record.boxQuantity || record.box_quantity || record.quantity || 0);

      if (sales > 0 && qty > 0) {
        const unitPrice = sales / qty;

        // Priority: Barcode -> Product Name
        if (barcode && !map.has(barcode)) {
          map.set(barcode, unitPrice);
        }
        if (name && !map.has(name)) {
          map.set(name, unitPrice);
        }
      }
    }
    return map;
  }, [outboundRecords]);

  const statusSummary = React.useMemo(() => {
    const summary = { critical: 0, low: 0, normal: 0, high: 0, totalValue: 0, totalItems: 0, totalQuantity: 0 };
    inventoryItemsForInventoryTabDisplayed.forEach((item: InventoryItem) => {
      const key = item?.stockStatus;
      if (key === 'critical') summary.critical += 1;
      else if (key === 'low') summary.low += 1;
      else if (key === 'high') summary.high += 1;
      else summary.normal += 1;

      // Calculate total inventory value
      // Use currentStock from item
      const stockQty = Number(item?.currentStock || 0);

      // Attempt to find price
      const bc = String(item?.barcode || '').trim();
      const name = String(item?.productName || '').trim();
      const unitPrice = priceMap.get(bc) || priceMap.get(name) || 0;

      summary.totalValue += unitPrice * stockQty;
      summary.totalItems += 1;
      summary.totalQuantity += stockQty;
    });
    return summary;
  }, [inventoryItemsForInventoryTabDisplayed, priceMap]);

  // Format currency for KPI cards
  const formatCurrency = (value: number) => {
    if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
    if (value >= 10000) return `${(value / 10000).toFixed(0)}만`;
    return value.toLocaleString('ko-KR');
  };

  const toggleStockStatusFilter = (status: string) => {
    setStockStatusFilter((prev) => (prev === status ? null : status));
  };

  const tabs = [
    { key: 'inventory' as const, label: '📦 재고 현황', description: '최신 데이터 기반 재고 관리' },
    { key: 'analysis' as const, label: '📊 출고 분석', description: '3개월 출고 데이터 분석 및 예측' },
    { key: 'inbound' as const, label: '📥 입고 가능', description: '발주서 기반 입고 가능 수량 관리' },
    { key: 'settings' as const, label: '⚙️ 재고 설정', description: '재고 한계값 및 알림 설정' },
  ];

  // 재고 아이템 업데이트 핸들러
  const handleItemUpdate = (updatedItem: InventoryItem) => {
    console.log('재고 아이템 업데이트:', updatedItem);
    // 여기에 실제 업데이트 로직 구현
  };

  // 파일 선택 핸들러
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    setSelectedFiles(files);
  };

  const handleReceiptFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setReceiptFile(file);
  };

  // 파일 업로드 핸들러
  const handleUpload = async () => {
    if (!selectedFiles.length || !inventoryDate) {
      alert('파일과 재고 기준일을 모두 입력해주세요.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      selectedFiles.forEach((file) => formData.append('files', file));
      formData.append('inventoryDate', inventoryDate);

      const response = await fetch('/api/inventory/baseline-upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        alert('업로드가 성공했습니다!');
        setSelectedFiles([]);
        setReceiptFile(null);
        const normalized = normalizeDateKey(inventoryDate);
        setActiveInventoryDate(normalized);

        // 재고 데이터 다시 불러오기
        queryClient.invalidateQueries({ queryKey: ['enhanced-inventory-overview'] });
        queryClient.invalidateQueries({ queryKey: ['inventory-upload-history'] });
      } else {
        const error = await response.text();
        alert(`업로드 실패: ${error}`);
      }
    } catch (error) {
      console.error('업로드 오류:', error);
      alert('업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReceiptsUpload = async () => {
    if (!receiptFile) {
      alert('입고 데이터 파일을 선택해주세요.');
      return;
    }

    setIsUploadingReceipts(true);
    try {
      const formData = new FormData();
      formData.append('file', receiptFile);

      const response = await fetch('/api/inventory/receipts-upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const json = await response.json().catch(() => null);
        alert(json?.message ? `입고 업로드 완료: ${json.message}` : '입고 업로드가 성공했습니다!');
        setReceiptFile(null);
        queryClient.invalidateQueries({ queryKey: ['enhanced-inventory-overview'] });
        queryClient.invalidateQueries({ queryKey: ['inventory-upload-history'] });
      } else {
        const error = await response.text();
        alert(`입고 업로드 실패: ${error}`);
      }
    } catch (error) {
      console.error('입고 업로드 오류:', error);
      alert('입고 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploadingReceipts(false);
    }
  };

  const handleRefreshUploadHistory = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory-upload-history'] });
  };

  const handleDeleteUploadHistory = (date?: string | null) => {
    const confirmMessage = date
      ? `${date} 업로드 기록과 해당 재고 데이터를 삭제하시겠습니까?`
      : '모든 업로드 기록과 재고 데이터를 삭제하시겠습니까?';
    if (!window.confirm(confirmMessage)) return;
    deleteUploadsMutation.mutate(date ?? null);
  };

  const handleApplyUploadFilter = (date: string | null) => {
    const normalized = normalizeDateKey(date);
    setActiveInventoryDate(normalized);
    if (normalized) {
      setInventoryDate(normalized);
    }
    setActiveTab('inventory');
    setShowUploadHistory(true);
  };

  const handlePrepareReupload = (date: string | null) => {
    const normalized = normalizeDateKey(date);
    if (!normalized) {
      alert('재업로드를 위해서는 유효한 재고 기준일이 필요합니다.');
      return;
    }
    setInventoryDate(normalized);
    setActiveInventoryDate(normalized);
    setActiveTab('inventory');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`bg-gray-50 min-h-screen ${className}`}>
      <div className="w-full mx-auto px-2 sm:px-3 lg:px-4 py-4">
        {/* 헤더 */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Enhanced Inventory Management</h1>
              <p className="text-gray-600 mt-1">통합 재고 관리 및 분석 시스템</p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/api/inventory/unified/download.csv"
                className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50"
              >
                CSV 다운로드
              </a>
              <button
                onClick={handleRefreshInventory}
                className="px-3 py-2 bg-white border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-60"
                disabled={isRefreshingAny}
              >
                {isRefreshingAny ? '새로고침 중...' : '새로고침'}
              </button>
              <button
                onClick={handleRecalculateInventory}
                className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-60"
                disabled={isRefreshingAny}
              >
                {isRefreshingAny ? '재고 재계산 중...' : '재고 재계산'}
              </button>
              <LatestDataIndicator />
            </div>
          </div>
        </div>

        {/* 탭 네비게이션 */}
        <div className="bg-white rounded-lg shadow mb-4">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8 px-4">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  <div className="flex flex-col items-center space-y-1">
                    <span>{tab.label}</span>
                    <span className="text-xs text-gray-400">{tab.description}</span>
                  </div>
                </button>
              ))}
            </nav>
          </div>

          {/* 탭 컨텐츠 */}
          <div className="p-4">
            {activeTab === 'inventory' && (
              <div className="space-y-4">
                {/* KPI Overview - Z-Layout 기반 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {/* 1순위: 총 재고금액 - 가장 강조 */}
                  <Card
                    className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setStockStatusFilter(null)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-blue-700 uppercase">총 재고금액</p>
                          <h3 className="text-xl font-bold text-blue-900">{statusSummary.totalValue.toLocaleString()}원</h3>
                          <p className="text-xs text-blue-700 mt-1">총 수량: {statusSummary.totalQuantity.toLocaleString()}개</p>
                          <p className="text-xs text-blue-700 mt-1">등록 품목: {statusSummary.totalItems.toLocaleString()}종</p>
                        </div>
                        <DollarSign className="w-8 h-8 text-blue-600 bg-white rounded-full p-1.5" />
                      </div>
                      <p className="text-xs text-blue-600 mt-2">클릭시 전체 품목 표시</p>
                    </CardContent>
                  </Card>

                  {/* 2순위: 위험 품목 수 - 강조 */}
                  <Card
                    className="bg-gradient-to-br from-red-50 to-red-100 border-2 border-red-200 cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setStockStatusFilter('critical')}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-red-700 uppercase">위험 품목</p>
                          <h3 className="text-xl font-bold text-red-900">{statusSummary.critical}</h3>
                          <p className="text-xs text-red-700 mt-1">즉시 보충 필요</p>
                        </div>
                        <AlertCircle className="w-8 h-8 text-red-600 bg-white rounded-full p-1.5" />
                      </div>
                      <p className="text-xs text-red-600 mt-2">클릭시 위험 품목만 표시</p>
                    </CardContent>
                  </Card>

                  {/* 3순위: 총 품목 수 */}
                  <Card
                    className="bg-gray-50 border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setStockStatusFilter(null)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-gray-600 uppercase">총 품목 수</p>
                          <h3 className="text-xl font-bold text-gray-900">{statusSummary.totalItems}</h3>
                          <p className="text-xs text-gray-500 mt-1">전체 관리 품목</p>
                        </div>
                        <Package className="w-8 h-8 text-gray-500 bg-white rounded-full p-1.5" />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">클릭시 전체 품목 표시</p>
                    </CardContent>
                  </Card>

                  {/* 4순위: 부족 품목 수 */}
                  <Card
                    className="bg-gray-50 border border-gray-200 cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setStockStatusFilter('low')}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-gray-600 uppercase">부족 품목</p>
                          <h3 className="text-xl font-bold text-gray-900">{statusSummary.low}</h3>
                          <p className="text-xs text-gray-500 mt-1">발주 요청 필요</p>
                        </div>
                        <AlertTriangle className="w-8 h-8 text-amber-500 bg-white rounded-full p-1.5" />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">클릭시 부족 품목만 표시</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-blue-900 mb-4">📤 재고 데이터 업로드</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          재고 기준일 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          value={inventoryDate}
                          onChange={(e) => setInventoryDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          파일 선택 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          onChange={handleFileSelect}
                          multiple
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={handleUpload}
                          disabled={!selectedFiles.length || !inventoryDate || isUploading}
                          className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isUploading ? '업로드 중...' : '업로드'}
                        </button>
                        <a
                          href="/api/inventory/template"
                          download="inventory_template.csv"
                          className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 inline-block text-center"
                        >
                          템플릿
                        </a>
                      </div>
                    </div>

                    {selectedFiles.length > 0 && (
                      <div className="mt-3 p-3 bg-white border border-blue-200 rounded-md">
                        <p className="text-sm text-gray-600">
                          선택된 파일: <span className="font-medium">{selectedFiles.length}개</span>
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-emerald-900 mb-4">📥 입고 데이터 업로드</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          파일 선택 <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleReceiptFileSelect}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          required
                        />
                      </div>

                      <div>
                        <button
                          onClick={handleReceiptsUpload}
                          disabled={!receiptFile || isUploadingReceipts}
                          className="w-full bg-emerald-600 text-white py-2 px-4 rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isUploadingReceipts ? '업로드 중...' : '입고 업로드'}
                        </button>
                      </div>
                    </div>

                    <div className="text-sm text-gray-600 mt-2">
                      기준일 이후(포함) 입고만 자동 반영됩니다.
                    </div>

                    {receiptFile && (
                      <div className="mt-3 p-3 bg-white border border-emerald-200 rounded-md">
                        <p className="text-sm text-gray-600">
                          선택된 파일: <span className="font-medium">{receiptFile.name}</span>
                          ({(receiptFile.size / 1024 / 1024).toFixed(2)} MB)
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 상태 필터 바 - 간소화된 버전 */}
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-sm text-gray-600">필터:</span>
                  {stockStatusFilter ? (
                    <button
                      onClick={() => setStockStatusFilter(null)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200"
                    >
                      전체
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 bg-blue-100 text-blue-700 text-sm rounded-md font-medium">전체</span>
                  )}
                  {[
                    { key: 'critical', label: '위험', count: statusSummary.critical, color: 'red' },
                    { key: 'low', label: '부족', count: statusSummary.low, color: 'yellow' },
                    { key: 'normal', label: '안전', count: statusSummary.normal, color: 'green' },
                    { key: 'high', label: '과잉', count: statusSummary.high, color: 'blue' },
                  ].map((filter) => (
                    <button
                      key={filter.key}
                      onClick={() => toggleStockStatusFilter(filter.key)}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${stockStatusFilter === filter.key
                        ? `bg-${filter.color}-100 text-${filter.color}-700 font-medium border-2 border-${filter.color}-300`
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                    >
                      {filter.label} ({filter.count})
                    </button>
                  ))}
                  {hasLocationConflicts && (
                    <button
                      onClick={() => setLocationConflictOnly((prev) => !prev)}
                      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${locationConflictOnly
                        ? 'bg-purple-100 text-purple-700 font-medium border-2 border-purple-300'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      title="클릭하면 로케이션이 2개 이상인 바코드만 테이블에 표시합니다."
                    >
                      로케이션 불일치 ({locationConflictBarcodeSet.size})
                    </button>
                  )}
                </div>

                {/* 업로드 이력 패널 */}
                <div className="bg-white border border-gray-200 rounded-lg">
                  <div className="border-b border-gray-200 px-4 py-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-lg font-semibold text-gray-900">📋 업로드 이력</h3>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setShowUploadHistory(!showUploadHistory)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          {showUploadHistory ? '숨기기' : '이력 보기'}
                        </button>
                        <button
                          onClick={handleRefreshUploadHistory}
                          className="text-green-600 hover:text-green-800 text-sm disabled:opacity-60"
                          disabled={isLoadingUploads}
                        >
                          {isLoadingUploads ? '새로고침 중...' : '새로고침'}
                        </button>
                        <button
                          onClick={() => handleDeleteUploadHistory(null)}
                          className="text-red-600 hover:text-red-800 text-sm disabled:opacity-60"
                          disabled={isDeletingUploads}
                        >
                          {isDeletingUploads ? '삭제 중...' : '전체 삭제'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {showUploadHistory && (
                    <div className="p-4">
                      {isLoadingUploads ? (
                        <p className="text-gray-500 text-center py-4">업로드 이력을 불러오는 중입니다...</p>
                      ) : uploadHistory.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">업로드 이력이 없습니다.</p>
                      ) : (
                        <div className="space-y-3">
                          {uploadHistory.map((record) => {
                            const dateKey = normalizeDateKey(record.inventoryDate);
                            const dateLabel = dateKey ? new Date(dateKey).toLocaleDateString('ko-KR') : '일자 미지정';
                            const uploadedAtLabel = record.uploadDate
                              ? new Date(record.uploadDate).toLocaleString('ko-KR')
                              : '';
                            return (
                              <div key={record.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-3 bg-gray-50 rounded-md">
                                <div>
                                  <span className="font-medium text-gray-900">{dateLabel}</span>
                                  {record.recordsProcessed !== undefined && (
                                    <span className="text-gray-500 ml-2">({record.recordsProcessed}건)</span>
                                  )}
                                  {uploadedAtLabel && (
                                    <span className="text-xs text-gray-400 ml-2">업로드: {uploadedAtLabel}</span>
                                  )}
                                  {record.fileName && (
                                    <div className="text-xs text-gray-500 mt-1">파일: {record.fileName}</div>
                                  )}
                                </div>
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => handleApplyUploadFilter(dateKey)}
                                    className="text-blue-600 hover:text-blue-800 text-sm disabled:opacity-60"
                                    disabled={!dateKey}
                                  >
                                    필터링
                                  </button>
                                  <button
                                    onClick={() => handlePrepareReupload(dateKey)}
                                    className="text-sm text-gray-700 hover:text-gray-900 disabled:opacity-60"
                                    disabled={!dateKey}
                                  >
                                    재업로드
                                  </button>
                                  <button
                                    onClick={() => handleDeleteUploadHistory(dateKey)}
                                    className="text-red-600 hover:text-red-800 text-sm disabled:opacity-60"
                                    disabled={isDeletingUploads || !dateKey}
                                  >
                                    {isDeletingUploads ? '삭제 중...' : '삭제'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {locationConflictOnly && hasLocationConflicts && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-purple-900">로케이션 불일치 상세</div>
                        <div className="text-xs text-purple-800 mt-1">
                          바코드별로 2개 이상 로케이션이 존재합니다. (총 {locationConflictRows.length}개 바코드)
                        </div>
                      </div>
                      <button
                        onClick={() => setLocationConflictOnly(false)}
                        className="px-3 py-1.5 bg-white border border-purple-300 text-purple-800 rounded-md text-sm hover:bg-purple-100"
                      >
                        필터 해제
                      </button>
                    </div>

                    <div className="mt-3 max-h-52 overflow-y-auto">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {locationConflictRows.map((row) => (
                          <div key={row.barcode} className="bg-white border border-purple-100 rounded-md p-2">
                            <div className="text-xs text-gray-700 font-mono">{row.barcode}</div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {row.locations.map((loc) => (
                                <span
                                  key={loc}
                                  className="inline-flex items-center px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-[11px]"
                                >
                                  {loc}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 기존 재고 테이블 */}
                {normalizedActiveDate && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm text-blue-900">
                      {activeDateLabel} 기준 재고 {inventoryItemsForInventoryTabDisplayed.length}건을 표시합니다.
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveInventoryDate(null)}
                        className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-md text-sm hover:bg-blue-50"
                      >
                        날짜 필터 해제
                      </button>
                      <button
                        onClick={() => {
                          setStockStatusFilter(null);
                          setLocationConflictOnly(false);
                        }}
                        className="text-sm text-blue-700 hover:text-blue-900"
                      >
                        상태 필터 초기화
                      </button>
                    </div>
                  </div>
                )}

                {isLoadingInventory ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-2 text-gray-600">재고 데이터 로딩 중...</p>
                  </div>
                ) : inventoryError ? (
                  <div className="text-center py-8">
                    <p className="text-red-600">재고 데이터를 불러오는데 실패했습니다.</p>
                  </div>
                ) : (
                  <InventoryTable
                    data={inventoryItemsForInventoryTabDisplayed}
                    selectedItems={selectedItems}
                    onSelectionChange={setSelectedItems}
                    onItemUpdate={handleItemUpdate}
                    stockStatusFilter={stockStatusFilter}
                    onToggleStockStatus={toggleStockStatusFilter}
                  />
                )}
              </div>
            )}

            {activeTab === 'analysis' && (
              <ThreeMonthAnalysis />
            )}

            {activeTab === 'inbound' && (
              <InboundAvailabilityTab />
            )}

            {activeTab === 'settings' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">재고 설정 편집</h3>
                  <p className="text-gray-600 mb-6">
                    개별 제품의 재고 한계값을 직접 편집하거나 3개월 출고 데이터를 기반으로 자동 설정할 수 있습니다.
                  </p>
                </div>

                <div className="bg-white border rounded-lg p-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">설정 검색</label>
                  <input
                    type="text"
                    value={settingsSearch}
                    onChange={(e) => setSettingsSearch(e.target.value)}
                    placeholder="제품명/바코드/로케이션..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="mt-3 flex items-center gap-3">
                    <div className="text-sm text-gray-700">상태</div>
                    <select
                      value={settingsLifecycleFilter}
                      onChange={(e) => setSettingsLifecycleFilter(e.target.value as 'all' | 'active' | 'paused' | 'discontinued')}
                      className="text-sm border border-gray-300 rounded px-2 py-2"
                    >
                      <option value="all">전체</option>
                      <option value="active">활성</option>
                      <option value="paused">중단</option>
                      <option value="discontinued">단종</option>
                    </select>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    예외(숨김)로 설정한 품목은 재고 현황 테이블에서 표시되지 않습니다.
                  </div>
                </div>

                <div className="space-y-4">
                  {isLoadingInventory || isLoadingBarcodeMaster ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                      <p className="mt-2 text-gray-600">재고 설정 로딩 중...</p>
                    </div>
                  ) : inventoryItemsForSettingsTab.length > 0 ? (
                    (inventoryItemsForSettingsTab
                      .filter((item: BarcodeMasterRow) => {
                        const q = settingsSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          String(item.productName || '').toLowerCase().includes(q) ||
                          String(item.barcode || '').toLowerCase().includes(q) ||
                          String(item.location || '').toLowerCase().includes(q)
                        );
                      })
                      .slice(0, 50)
                      .map((item: BarcodeMasterRow) => {
                        const bc = String(item?.barcode || '').trim();
                        const isHidden = bc ? hiddenBarcodes.has(bc) : false;
                        const lifecycleStatus = String(item?.lifecycleStatus || 'active');
                        return (
                          <div key={item.id} className="space-y-2">
                            <div className="flex items-center justify-between bg-white border rounded-lg px-4 py-2">
                              <div className="text-sm text-gray-700 truncate">
                                <span className="font-medium">{item.productName}</span>
                                {item.location ? <span className="text-gray-500"> · {item.location}</span> : null}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">상태</span>
                                  <select
                                    value={lifecycleStatus}
                                    onChange={(e) => handleLifecycleStatusChange(item, e.target.value)}
                                    className="text-sm border border-gray-300 rounded px-2 py-1"
                                    disabled={!bc}
                                  >
                                    <option value="active">활성</option>
                                    <option value="paused">중단</option>
                                    <option value="discontinued">단종</option>
                                  </select>
                                </div>
                                <label className="flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={isHidden}
                                    onChange={(e) => toggleHiddenBarcode(bc, e.target.checked)}
                                    disabled={!bc}
                                  />
                                  예외(숨김)
                                </label>
                              </div>
                            </div>
                            <EditableStockSettings
                              item={{
                                id: item.id,
                                skuId: item.skuId,
                                productName: item.productName,
                                currentStock: item.currentStock,
                                minStock: item.minStock,
                                maxStock: item.maxStock,
                                reorderPoint: item.reorderPoint,
                                safetyStock: item.safetyStock,
                                lifecycleStatus: item.lifecycleStatus,
                                category: item.category,
                                location: item.location,
                                barcode: item.barcode,
                                inventoryDate: item.inventoryDate || '',
                                stockStatus: item.stockStatus,
                              }}
                              onUpdate={handleItemUpdate}
                            />
                          </div>
                        );
                      }))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      편집할 재고 항목이 없습니다.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EnhancedInventoryPage(props: EnhancedInventoryPageProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <EnhancedInventoryPageContent {...props} />
    </QueryClientProvider>
  );
}
