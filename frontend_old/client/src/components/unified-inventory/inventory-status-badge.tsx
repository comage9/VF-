import type { StockStatus } from "../../types/inventory";
import { STOCK_STATUS_LABELS } from "../../hooks/useUnifiedInventory";

const STATUS_STYLES: Record<StockStatus, string> = {
  critical: 'bg-red-100 text-red-700 border border-red-200',
  low: 'bg-orange-100 text-orange-700 border border-orange-200',
  normal: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  high: 'bg-sky-100 text-sky-700 border border-sky-200',
};

interface InventoryStatusBadgeProps {
  status: StockStatus;
}

export function InventoryStatusBadge({ status }: InventoryStatusBadgeProps) {
  const label = STOCK_STATUS_LABELS[status] ?? status;
  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full uppercase tracking-wide ${STATUS_STYLES[status] || STATUS_STYLES.normal}`}>
      {label}
    </span>
  );
}
