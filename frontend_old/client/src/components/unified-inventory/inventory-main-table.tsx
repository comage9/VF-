import { useEffect, useMemo, useState } from "react";
import type {
  UnifiedInventoryItem,
  UnifiedInventoryPagination,
} from "../../types/inventory";
import { InventoryStatusBadge } from "./inventory-status-badge";

interface InventoryMainTableProps {
  items: UnifiedInventoryItem[];
  isLoading: boolean;
  selectedId: number | null;
  onSelect: (item: UnifiedInventoryItem) => void;
  onStockUpdate: (item: UnifiedInventoryItem, value: number) => void;
  pagination: UnifiedInventoryPagination | null;
  onPageChange: (page: number) => void;
}

export function InventoryMainTable({
  items,
  isLoading,
  selectedId,
  onSelect,
  onStockUpdate,
  pagination,
  onPageChange,
}: InventoryMainTableProps) {
  const [draftValues, setDraftValues] = useState<Record<number, string>>({});

  useEffect(() => {
    const initial: Record<number, string> = {};
    items.forEach((item) => {
      initial[item.id] = String(item.currentStock ?? 0);
    });
    setDraftValues(initial);
  }, [items]);

  const handleDraftChange = (item: UnifiedInventoryItem, value: string) => {
    setDraftValues((prev) => ({
      ...prev,
      [item.id]: value,
    }));
  };

  const commitDraft = (item: UnifiedInventoryItem) => {
    const raw = draftValues[item.id];
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      setDraftValues((prev) => ({
        ...prev,
        [item.id]: String(item.currentStock ?? 0),
      }));
      return;
    }
    if (parsed === item.currentStock) {
      return;
    }
    onStockUpdate(item, parsed);
  };

  const tableBody = useMemo(() => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan={8} className="px-4 py-20 text-center text-muted-foreground">
            <div className="flex flex-col items-center gap-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
              <span>재고 데이터를 불러오는 중입니다...</span>
            </div>
          </td>
        </tr>
      );
    }

    if (!items.length) {
      return (
        <tr>
          <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">
            조건에 해당하는 재고 데이터가 없습니다.
          </td>
        </tr>
      );
    }

    return items.map((item) => {
      const isSelected = item.id === selectedId;
      const draft = draftValues[item.id] ?? String(item.currentStock ?? 0);
      const rowAccent = isSelected ? 'bg-primary/5 border-primary/40' : 'hover:bg-muted/40';

      return (
        <tr
          key={item.id}
          className={`border-b border-border/70 cursor-pointer transition-colors ${rowAccent}`}
          onClick={() => onSelect(item)}
        >
          <td className="px-4 py-3 text-sm font-medium text-foreground">
            <div className="flex flex-col">
              <span>{item.productName || '이름 미확인'}</span>
              <span className="text-xs text-muted-foreground">{item.brand || item.source}</span>
            </div>
          </td>
          <td className="px-4 py-3 text-sm text-muted-foreground">
            <div className="flex flex-col gap-1">
              <span>SKU · {item.skuId || '—'}</span>
              <span>BAR · {item.barcode || '—'}</span>
            </div>
          </td>
          <td className="px-4 py-3 text-sm">
            {isSelected ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={draft}
                  min={0}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => handleDraftChange(item, event.target.value)}
                  onBlur={() => commitDraft(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitDraft(item);
                    }
                    if (event.key === 'Escape') {
                      setDraftValues((prev) => ({
                        ...prev,
                        [item.id]: String(item.currentStock ?? 0),
                      }));
                    }
                  }}
                  className="w-24 rounded-md border border-input px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    commitDraft(item);
                  }}
                  className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  적용
                </button>
              </div>
            ) : (
              <span className="font-semibold text-foreground">{item.currentStock?.toLocaleString()}</span>
            )}
          </td>
          <td className="px-4 py-3 text-sm text-muted-foreground">
            <div className="flex flex-col">
              <span>최소 {item.minStock?.toLocaleString()}</span>
              <span>최대 {item.maxStock != null ? item.maxStock.toLocaleString() : '—'}</span>
            </div>
          </td>
          <td className="px-4 py-3">
            <InventoryStatusBadge status={item.stockStatus} />
          </td>
          <td className="px-4 py-3 text-sm text-muted-foreground">
            <div className="flex flex-col">
              <span>{item.location || '—'}</span>
              <span className="text-xs">{item.category || '카테고리 미지정'}</span>
            </div>
          </td>
          <td className="px-4 py-3 text-sm text-muted-foreground">
            {item.lastUpdated ? new Date(item.lastUpdated).toLocaleString('ko-KR') : '—'}
          </td>
        </tr>
      );
    });
  }, [items, isLoading, selectedId, draftValues, onSelect, onStockUpdate]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">통합 재고 테이블</h3>
          <p className="text-xs text-muted-foreground">
            총 {pagination?.total?.toLocaleString() ?? items.length.toLocaleString()}개 항목
          </p>
        </div>
        {pagination && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              페이지 {pagination.page} / {pagination.pages}
            </span>
          </div>
        )}
      </header>
      <div className="relative flex-1 overflow-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">제품</th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">식별자</th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">현재고</th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">재고 기준</th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">상태</th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">로케이션</th>
              <th className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">최종 업데이트</th>
            </tr>
          </thead>
          <tbody>{tableBody}</tbody>
        </table>
      </div>
      {pagination && pagination.pages > 1 && (
        <footer className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {(pagination.page - 1) * pagination.limit + 1} -
            {Math.min(pagination.page * pagination.limit, pagination.total)} / {pagination.total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
            >
              이전
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!pagination.hasMore}
              onClick={() => onPageChange(Math.min(pagination.pages, pagination.page + 1))}
            >
              다음
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}
