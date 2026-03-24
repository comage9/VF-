import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useUnifiedInventory } from "../../hooks/useUnifiedInventory";
import type {
  UnifiedInventoryFilters,
  UnifiedInventoryItem,
} from "../../types/inventory";
import { InventorySummaryCards } from "./inventory-summary-cards";
import { UnifiedSearchFilters } from "./unified-search-filters";
import { InventoryMainTable } from "./inventory-main-table";
import { InventoryDetailPanel } from "./inventory-detail-panel";
import { InventoryActionBar } from "./inventory-action-bar";
import { updateStockStandard } from "../../hooks/useProducts";

const DEFAULT_FILTERS: UnifiedInventoryFilters = {
  search: '',
  category: '',
  stockStatus: '',
  location: '',
  page: 1,
  limit: 50,
};

export function UnifiedInventoryPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<UnifiedInventoryFilters>(DEFAULT_FILTERS);
  const { data, isLoading, isFetching, error } = useUnifiedInventory(filters);
  const [selectedItem, setSelectedItem] = useState<UnifiedInventoryItem | null>(null);

  useEffect(() => {
    if (!data?.data?.length) {
      setSelectedItem(null);
      return;
    }
    setSelectedItem((prev) => {
      if (!prev) {
        return data.data[0];
      }
      const updated = data.data.find((item) => item.id === prev.id);
      return updated ?? data.data[0];
    });
  }, [data?.data]);

  const updateInventoryMutation = useMutation({
    mutationFn: async ({ item, value }: { item: UnifiedInventoryItem; value: number }) => {
      if (!item.inventoryId) {
        throw new Error('이 항목은 현재 재고 데이터가 없어 수정할 수 없습니다.');
      }
      const payload = {
        currentStock: value,
        totalQuantity: value,
        updatedAt: new Date().toISOString(),
      };
      const response = await fetch(`/api/inventory/${item.inventoryId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error('재고 수량 업데이트에 실패했습니다.');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-unified'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['over-stock-items'] });
    },
    onError: (mutationError: unknown) => {
      const message = mutationError instanceof Error ? mutationError.message : '재고 수량 업데이트 중 오류가 발생했습니다.';
      alert(message);
    },
  });

  const updateStandardsMutation = useMutation({
    mutationFn: async ({
      skuId,
      patch,
    }: {
      skuId: string;
      patch: {
        minStock: number;
        maxStock: number | null;
        reorderPoint: number | null;
        safetyStock: number | null;
      };
    }) => {
      const cleanedPatch = {
        minStock: patch.minStock,
        maxStock: patch.maxStock ?? undefined,
        reorderPoint: patch.reorderPoint ?? undefined,
        safetyStock: patch.safetyStock ?? undefined,
      };
      await updateStockStandard(skuId, cleanedPatch);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-unified'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (mutationError: unknown) => {
      const message = mutationError instanceof Error ? mutationError.message : '재고 기준 업데이트 중 오류가 발생했습니다.';
      alert(message);
    },
  });

  const filteredSummary = data?.summary.filtered;
  const options = data?.summary.options;
  const isRefetching = isFetching && !isLoading;

  const handleSelect = (item: UnifiedInventoryItem) => {
    setSelectedItem(item);
  };

  const handleStockUpdate = (item: UnifiedInventoryItem, value: number) => {
    updateInventoryMutation.mutate({ item, value });
  };

  const handleStandardsUpdate = async (
    skuId: string,
    patch: {
      minStock: number;
      maxStock: number | null;
      reorderPoint: number | null;
      safetyStock: number | null;
    }
  ) => {
    updateStandardsMutation.mutate({ skuId, patch });
  };

  const handleFilterChange = (next: Partial<UnifiedInventoryFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...next,
      page: next.page ?? 1,
    }));
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const showAll = () => handleFilterChange({ stockStatus: '', page: 1 });
  const showLow = () => handleFilterChange({ stockStatus: 'low', page: 1 });
  const showHigh = () => handleFilterChange({ stockStatus: 'high', page: 1 });
  const showRestock = () => handleFilterChange({ stockStatus: 'low', page: 1 });

  return (
    <div className="flex h-full flex-col gap-6">
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          통합 재고 데이터를 불러오는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
        </div>
      )}

      <InventorySummaryCards
        summary={filteredSummary}
        onTotalClick={showAll}
        onLowClick={showLow}
        onHighClick={showHigh}
        onRestockClick={showRestock}
      />

      <UnifiedSearchFilters
        search={filters.search ?? ''}
        category={filters.category ?? ''}
        stockStatus={(filters.stockStatus ?? '') as any}
        location={filters.location ?? ''}
        options={options}
        onSearchChange={(value) => handleFilterChange({ search: value, page: 1 })}
        onCategoryChange={(value) => handleFilterChange({ category: value, page: 1 })}
        onStatusChange={(value) => handleFilterChange({ stockStatus: value, page: 1 })}
        onLocationChange={(value) => handleFilterChange({ location: value, page: 1 })}
        onResetFilters={resetFilters}
      />

      <div className="grid flex-1 grid-cols-1 gap-6 xl:grid-cols-[7fr_3fr]">
        <InventoryMainTable
          items={data?.data ?? []}
          isLoading={isLoading}
          selectedId={selectedItem?.id ?? null}
          onSelect={handleSelect}
          onStockUpdate={handleStockUpdate}
          pagination={data?.pagination ?? null}
          onPageChange={(page) => handleFilterChange({ page })}
        />
        <InventoryDetailPanel
          item={selectedItem}
          isUpdatingStandards={updateStandardsMutation.isPending}
          onUpdateStockStandards={handleStandardsUpdate}
        />
      </div>

      <InventoryActionBar onResetView={resetFilters} />

      {isRefetching && (
        <div className="fixed bottom-6 left-1/2 z-10 -translate-x-1/2 transform rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground shadow">
          최신 재고 데이터를 동기화하는 중...
        </div>
      )}
    </div>
  );
}
