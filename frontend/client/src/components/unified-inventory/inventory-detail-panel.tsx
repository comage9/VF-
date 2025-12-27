import { useEffect, useMemo, useState } from "react";
import type { UnifiedInventoryItem } from "../../types/inventory";
import { InventoryStatusBadge } from "./inventory-status-badge";

interface InventoryDetailPanelProps {
  item: UnifiedInventoryItem | null;
  isUpdatingStandards: boolean;
  onUpdateStockStandards: (skuId: string, patch: {
    minStock: number;
    maxStock: number | null;
    reorderPoint: number | null;
    safetyStock: number | null;
  }) => Promise<void> | void;
}

function toOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed.length) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function InventoryDetailPanel({
  item,
  isUpdatingStandards,
  onUpdateStockStandards,
}: InventoryDetailPanelProps) {
  const [minStock, setMinStock] = useState('0');
  const [maxStock, setMaxStock] = useState('');
  const [reorderPoint, setReorderPoint] = useState('');
  const [safetyStock, setSafetyStock] = useState('');

  useEffect(() => {
    if (!item) {
      setMinStock('0');
      setMaxStock('');
      setReorderPoint('');
      setSafetyStock('');
      return;
    }
    setMinStock(String(item.minStock ?? 0));
    setMaxStock(item.maxStock != null ? String(item.maxStock) : '');
    setReorderPoint(item.reorderPoint != null ? String(item.reorderPoint) : '');
    setSafetyStock(item.safetyStock != null ? String(item.safetyStock) : '');
  }, [item?.id]);

  const canEditStandards = Boolean(item?.skuId);

  const summaryChips = useMemo(() => {
    if (!item) return [];
    const chips: { label: string; value: string }[] = [];
    chips.push({ label: 'SKU', value: item.skuId ?? '—' });
    chips.push({ label: 'BAR', value: item.barcode ?? '—' });
    chips.push({ label: '소스', value: item.source });
    chips.push({ label: '보충 필요', value: item.restockNeeded ? '예' : '아니오' });
    chips.push({ label: '예상 리오더', value: item.daysToReorder != null ? `${item.daysToReorder}일` : '—' });
    return chips;
  }, [item]);

  if (!item) {
    return (
      <aside className="h-full rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
        좌측 테이블에서 품목을 선택하면 상세 정보와 재고 기준을 확인할 수 있습니다.
      </aside>
    );
  }

  return (
    <aside className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{item.productName || '제품명 미확인'}</h3>
            <p className="text-xs text-muted-foreground">
              {item.productNameEng || item.category || '카테고리 미지정'}
            </p>
          </div>
          <InventoryStatusBadge status={item.stockStatus} />
        </div>
        <div className="flex flex-wrap gap-2">
          {summaryChips.map((chip) => (
            <span key={`${chip.label}-${chip.value}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">{chip.label}</span>
              <span>{chip.value}</span>
            </span>
          ))}
        </div>
      </header>

      <section className="space-y-2 text-sm">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">기본 정보</h4>
        <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
          <div>
            <p className="text-xs text-muted-foreground/80">제품 번호</p>
            <p className="text-foreground">{item.productNumber || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground/80">로케이션</p>
            <p className="text-foreground">{item.location || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground/80">최종 업데이트</p>
            <p className="text-foreground">{item.updatedAt ? new Date(item.updatedAt).toLocaleString('ko-KR') : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground/80">생성 일시</p>
            <p className="text-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleString('ko-KR') : '—'}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">재고 기준 관리</h4>
          {!canEditStandards && (
            <span className="text-xs text-amber-500">SKU ID가 없어 수정할 수 없습니다.</span>
          )}
        </div>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!item.skuId) {
              return;
            }
            const min = Number(minStock);
            if (!Number.isFinite(min)) {
              return;
            }
            onUpdateStockStandards(item.skuId, {
              minStock: Math.max(0, Math.round(min)),
              maxStock: toOptionalNumber(maxStock),
              reorderPoint: toOptionalNumber(reorderPoint),
              safetyStock: toOptionalNumber(safetyStock),
            });
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            최소 재고
            <input
              type="number"
              min={0}
              value={minStock}
              onChange={(event) => setMinStock(event.target.value)}
              disabled={!canEditStandards}
              className="rounded-md border border-input px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            최대 재고
            <input
              type="number"
              min={0}
              placeholder="-"
              value={maxStock}
              onChange={(event) => setMaxStock(event.target.value)}
              disabled={!canEditStandards}
              className="rounded-md border border-input px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            재주문 시점
            <input
              type="number"
              min={0}
              placeholder="-"
              value={reorderPoint}
              onChange={(event) => setReorderPoint(event.target.value)}
              disabled={!canEditStandards}
              className="rounded-md border border-input px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            안전 재고
            <input
              type="number"
              min={0}
              placeholder="-"
              value={safetyStock}
              onChange={(event) => setSafetyStock(event.target.value)}
              disabled={!canEditStandards}
              className="rounded-md border border-input px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            />
          </label>
          <div className="col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={!canEditStandards || isUpdatingStandards}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdatingStandards ? '저장 중...' : '재고 기준 저장'}
            </button>
          </div>
        </form>
      </section>

      <section className="mt-auto space-y-2 text-xs text-muted-foreground">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">진단</h4>
        <ul className="space-y-1">
          <li>현재고 {item.currentStock.toLocaleString()} / 최소 {item.minStock.toLocaleString()}</li>
          <li>재고 상태: {item.stockStatus === 'normal' ? '안정' : item.stockStatus}</li>
          <li>보충 필요 여부: {item.restockNeeded ? '즉시 점검 요망' : '정상 범위'}</li>
        </ul>
      </section>
    </aside>
  );
}
