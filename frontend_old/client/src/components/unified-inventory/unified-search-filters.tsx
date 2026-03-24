import { useEffect, useState } from "react";
import type { UnifiedInventoryOptions, StockStatus } from "../../types/inventory";
import { STOCK_STATUS_LABELS } from "../../hooks/useUnifiedInventory";

interface UnifiedSearchFiltersProps {
  search: string;
  category: string;
  stockStatus: StockStatus | '';
  location: string;
  options?: UnifiedInventoryOptions;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onStatusChange: (value: StockStatus | '') => void;
  onLocationChange: (value: string) => void;
  onResetFilters?: () => void;
}

const DEBOUNCE_DELAY = 250;

export function UnifiedSearchFilters({
  search,
  category,
  stockStatus,
  location,
  options,
  onSearchChange,
  onCategoryChange,
  onStatusChange,
  onLocationChange,
  onResetFilters,
}: UnifiedSearchFiltersProps) {
  const [localSearch, setLocalSearch] = useState(search);

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (localSearch !== search) {
        onSearchChange(localSearch);
      }
    }, DEBOUNCE_DELAY);

    return () => window.clearTimeout(timer);
  }, [localSearch, search, onSearchChange]);

  return (
    <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="inventory-search" className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            통합 검색
          </label>
          <input
            id="inventory-search"
            type="search"
            placeholder="제품명 · SKU · 바코드 · 로케이션"
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            className="w-full px-3 py-2 border border-input rounded-md bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          />
        </div>

        <div className="flex-1 min-w-[180px]">
          <label htmlFor="inventory-category" className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            카테고리
          </label>
          <select
            id="inventory-category"
            value={category}
            onChange={(event) => onCategoryChange(event.target.value)}
            className="w-full px-3 py-2 border border-input rounded-md bg-background"
          >
            <option value="">전체</option>
            {options?.categories.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[160px]">
          <label htmlFor="inventory-status" className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            재고 상태
          </label>
          <select
            id="inventory-status"
            value={stockStatus}
            onChange={(event) => onStatusChange(event.target.value as StockStatus | '')}
            className="w-full px-3 py-2 border border-input rounded-md bg-background"
          >
            <option value="">전체</option>
            {options?.stockStatuses.map((option) => (
              <option key={option} value={option}>
                {STOCK_STATUS_LABELS[option] ?? option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[160px]">
          <label htmlFor="inventory-location" className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            로케이션
          </label>
          <select
            id="inventory-location"
            value={location}
            onChange={(event) => onLocationChange(event.target.value)}
            className="w-full px-3 py-2 border border-input rounded-md bg-background"
          >
            <option value="">전체</option>
            {options?.locations.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onCategoryChange('');
              onStatusChange('');
              onLocationChange('');
              onSearchChange('');
              setLocalSearch('');
              onResetFilters?.();
            }}
            className="px-4 py-2 border border-border rounded-md bg-background text-sm text-muted-foreground hover:bg-muted/50"
          >
            필터 초기화
          </button>
        </div>
      </div>
    </div>
  );
}
