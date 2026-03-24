import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  UnifiedInventoryFilters,
  UnifiedInventoryResponse,
  StockStatus,
} from "../types/inventory";

const DEFAULT_LIMIT = 50;

const STOCK_STATUS_ORDER: Record<StockStatus, number> = {
  critical: 0,
  low: 1,
  normal: 2,
  high: 3,
};

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  critical: "치명",
  low: "부족",
  normal: "정상",
  high: "과잉",
};

function buildQueryString(filters: UnifiedInventoryFilters): string {
  const params = new URLSearchParams();

  if (filters.page && filters.page > 1) {
    params.set('page', String(filters.page));
  }

  if (filters.limit && filters.limit !== DEFAULT_LIMIT) {
    params.set('limit', String(filters.limit));
  }

  if (filters.search && filters.search.trim().length > 0) {
    params.set('search', filters.search.trim());
  }

  if (filters.category && filters.category.trim().length > 0) {
    params.set('category', filters.category.trim());
  }

  if (filters.stockStatus && filters.stockStatus.trim().length > 0) {
    params.set('stockStatus', filters.stockStatus.trim());
  }

  if (filters.location && filters.location.trim().length > 0) {
    params.set('location', filters.location.trim());
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export function useUnifiedInventory(filters: UnifiedInventoryFilters) {
  return useQuery<UnifiedInventoryResponse>({
    queryKey: ['inventory-unified', filters],
    queryFn: async () => {
      const query = buildQueryString(filters);
      const response = await fetch(`/api/inventory/unified${query}`);
      if (!response.ok) {
        throw new Error('통합 재고 데이터를 불러오지 못했습니다.');
      }
      return response.json();
    },
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    meta: {
      sortOrder: STOCK_STATUS_ORDER,
    },
  });
}

export function getStatusSortWeight(status: StockStatus): number {
  return STOCK_STATUS_ORDER[status] ?? 99;
}
