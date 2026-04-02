import { useQuery } from "@tanstack/react-query";

export interface OverStockItem {
  skuId: string;
  barcode: string;
  productName: string;
  category: string;
  brand: string;
  currentStock: number;
  maxStock: number;
  excess: number;
  location: string;
}

export interface OverStockResponse {
  success: boolean;
  data: OverStockItem[];
  total: number;
}

export interface LowStockItem {
  skuId: string;
  barcode: string;
  productName: string;
  category: string;
  brand: string;
  currentStock: number;
  minStock: number;
  shortage: number;
  location: string;
}

export interface LowStockResponse {
  success: boolean;
  data: LowStockItem[];
  total: number;
}

// 부족재고 조회 hook
export function useLowStockItems() {
  return useQuery<LowStockResponse>({
    queryKey: ['low-stock-items'],
    queryFn: async () => {
      const response = await fetch('/api/products/low-stock');
      if (!response.ok) {
        throw new Error('Failed to fetch low stock items');
      }
      return response.json();
    },
    refetchInterval: 30000, // 30초마다 자동 갱신
  });
}

// 과잉재고 조회 hook
export function useOverStockItems() {
  return useQuery<OverStockResponse>({
    queryKey: ['over-stock-items'],
    queryFn: async () => {
      const response = await fetch('/api/products/over-stock');
      if (!response.ok) {
        throw new Error('Failed to fetch over stock items');
      }
      return response.json();
    },
    refetchInterval: 30000, // 30초마다 자동 갱신
  });
}

// 제품 마스터 통계 조회 hook
export function useProductStatistics() {
  return useQuery({
    queryKey: ['product-statistics'],
    queryFn: async () => {
      const response = await fetch('/api/products/statistics');
      if (!response.ok) {
        throw new Error('Failed to fetch product statistics');
      }
      return response.json();
    },
  });
}

// 제품 목록 조회 hook
export function useProducts(options: {
  category?: string;
  brand?: string;
  search?: string;
  limit?: number;
} = {}) {
  return useQuery({
    queryKey: ['products', options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options.category) params.append('category', options.category);
      if (options.brand) params.append('brand', options.brand);
      if (options.search) params.append('search', options.search);
      if (options.limit) params.append('limit', options.limit.toString());

      const response = await fetch(`/api/products?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }
      return response.json();
    },
  });
}

// 재고 기준 업데이트 mutation
export async function updateStockStandard(skuId: string, standards: {
  minStock?: number;
  maxStock?: number;
  reorderPoint?: number;
  safetyStock?: number;
}) {
  const response = await fetch(`/api/products/${skuId}/stock-standards`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(standards),
  });

  if (!response.ok) {
    throw new Error('Failed to update stock standard');
  }

  return response.json();
}

// 제품 추가 mutation
export async function addProduct(productData: {
  skuId: string;
  barcode: string;
  productName: string;
  location?: string;
  productNumber?: string;
  category?: string;
  brand?: string;
  minStock?: number;
  maxStock?: number;
  reorderPoint?: number;
  safetyStock?: number;
}) {
  const response = await fetch('/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(productData),
  });

  if (!response.ok) {
    throw new Error('Failed to add product');
  }

  return response.json();
}

// 제품 삭제 mutation
export async function deleteProduct(skuId: string) {
  const response = await fetch(`/api/products/${skuId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete product');
  }

  return response.json();
}

// VF CSV 재임포트 mutation
export async function importVfCsv() {
  const response = await fetch('/api/products/import-vf-csv', {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to import VF CSV');
  }

  return response.json();
}