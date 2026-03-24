export type StockStatus = 'normal' | 'low' | 'high' | 'critical';

export interface UnifiedInventoryItem {
  id: number;
  productId: number | null;
  inventoryId: string | null;
  skuId: string | null;
  barcode: string | null;
  productName: string;
  productNameEng: string | null;
  category: string | null;
  subCategory1: string | null;
  subCategory2: string | null;
  color: string | null;
  productNumber: string | null;
  brand: string | null;
  currentStock: number;
  location: string | null;
  lastUpdated: string | null;
  minStock: number;
  maxStock: number | null;
  reorderPoint: number | null;
  safetyStock: number | null;
  stockStatus: StockStatus;
  restockNeeded: boolean;
  daysToReorder: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  isActive: boolean;
  source: 'product+inventory' | 'product-only' | 'inventory-only';
}

export interface UnifiedInventorySummary {
  totalItems: number;
  totalStock: number;
  averageStock: number;
  stockStatusCounts: Record<StockStatus, number>;
  lowStockCount: number;
  overStockCount: number;
  restockNeededCount: number;
  activeSkuCount: number;
  categoryCount: number;
  locationCount: number;
}

export interface UnifiedInventoryOptions {
  categories: string[];
  locations: string[];
  stockStatuses: StockStatus[];
}

export interface UnifiedInventoryPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
}

export interface UnifiedInventoryResponse {
  success: boolean;
  data: UnifiedInventoryItem[];
  pagination: UnifiedInventoryPagination;
  summary: {
    overall: UnifiedInventorySummary;
    filtered: UnifiedInventorySummary;
    options: UnifiedInventoryOptions;
  };
}

export interface UnifiedInventoryFilters {
  search?: string;
  category?: string;
  stockStatus?: StockStatus | '';
  location?: string;
  page?: number;
  limit?: number;
}
