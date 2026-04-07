// 재고 관리 시스템 관련 타입 정의

export interface LatestDataInfo {
  latestUploadDate: string | null;
  totalItems: number;
  filteredItems: number;
  dataCompleteness: number;
  hasLatestDataOnly: boolean;
}

export interface BarcodeInfo {
  id: string;
  barcode: string;
  productName: string;
  category: string;
  location: string;
  lifecycleStatus?: 'active' | 'paused' | 'discontinued';
  brand?: string;
  specification?: string;
  supplier?: string;
  supplierCode?: string;
  unitCost?: number;
  salesPrice?: number;
  minStock?: number;
  maxStock?: number;
  reorderPoint?: number;
  safetyStock?: number;
  outboundFrequency?: number;
  avgDaily?: number;
  notes?: string;
  hasInventoryData: boolean;
  lastSeenDate?: string;
  bacoDataTypes?: string[];
  lastBacoSync?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockThresholds {
  minStock: number | null;
  maxStock: number | null;
  reorderPoint: number | null;
  safetyStock: number | null;
}

export interface OutboundAnalysisItem {
  skuId: string;
  productName: string;
  barcode?: string;
  totalOutbound: number;
  avgDaily: number;
  avgWeekly: number;
  avgMonthly: number;
  recommendedSettings: {
    minStock: number;
    maxStock: number;
    reorderPoint: number;
    safetyStock: number;
    reasoning: {
      oneDayStock: number;
      fifteenDayStock: number;
      threeDayStock: number;
      seasonalFactor: number;
    };
  };
  outboundDates: string[];
  lastOutbound: string | null;
  trend: 'increasing' | 'decreasing' | 'stable';
  reliability: number; // 0-100, 데이터 신뢰도
}

export interface AnalysisParams {
  safetyFactor: number; // 안전계수
  seasonalAdjustment: boolean; // 계절성 조정
  trendAdjustment: boolean; // 트렌드 조정
  minimumDays: number; // 최소 데이터 일수
}

export interface InventoryItem {
  id: string;
  skuId?: string;
  productName: string;
  currentStock: number;
  minStock?: number | null;
  maxStock?: number | null;
  reorderPoint?: number | null;
  safetyStock?: number | null;
  lifecycleStatus?: 'active' | 'paused' | 'discontinued';
  hiddenReason?: string | null;
  category?: string;
  location?: string;
  barcode?: string;
  lastUpdated?: string;
  inventoryDate?: string; // 재고 기준일
  stockStatus?: StockStatus;
  coverDays?: number | null;
  outbound14dTotal?: number;
  avgDailyOutbound14d?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
}

// 바코드 마스터 데이터 응답
export interface BarcodeMasterResponse extends PaginatedResponse<BarcodeInfo> {
  total: number;
  withInventory: number;
  withoutInventory: number;
}

// 출고 분석 응답
export interface OutboundAnalysisResponse extends ApiResponse<OutboundAnalysisItem[]> {
  period: string;
  totalProducts: number;
  analyzableProducts: number;
  dataQuality: number;
}

// 통합 재고 응답 (기존 타입 확장)
export interface UnifiedInventoryResponseEnhanced {
  success: boolean;
  data: InventoryItem[];
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
      totalStock: number;
      criticalCount: number;
      lowCount: number;
      normalCount: number;
      highCount: number;
    };
    filtered: {
      totalItems: number;
      totalStock: number;
      criticalCount: number;
      lowCount: number;
      normalCount: number;
      highCount: number;
    };
    options: {
      showHidden: boolean;
      lifecycleFilter: string;
    };
  };
  lastUploadDate: string | null;
  latestDataInfo: LatestDataInfo; // 새로 추가된 필드
}

export type StockStatus = 'critical' | 'low' | 'normal' | 'high';

export interface StockLevel {
  current: number;
  min?: number | null;
  max?: number | null;
  status: StockStatus;
  percentage: number; // 최대재고 대비 현재재고 비율
}