import type { UnifiedInventorySummary } from "../../types/inventory";

interface InventorySummaryCardsProps {
  summary?: UnifiedInventorySummary | null;
  onTotalClick?: () => void;
  onLowClick?: () => void;
  onHighClick?: () => void;
  onRestockClick?: () => void;
}

const CARD_BASE_CLASS = 'bg-card border border-border rounded-lg p-4 shadow-sm transition-colors';

function SummaryCardButton({
  title,
  value,
  subtitle,
  icon,
  accentClass,
  onClick,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  accentClass: string;
  onClick?: () => void;
}) {
  const Wrapper: any = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${CARD_BASE_CLASS} ${onClick ? 'text-left hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40' : ''}`.trim()}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground tracking-wide uppercase">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={`w-10 h-10 rounded-md bg-muted flex items-center justify-center ${accentClass}`}>
          <i className={`fas ${icon} text-base`} aria-hidden />
        </div>
      </div>
    </Wrapper>
  );
}

export function InventorySummaryCards({
  summary,
  onTotalClick,
  onLowClick,
  onHighClick,
  onRestockClick,
}: InventorySummaryCardsProps) {
  const safeSummary: UnifiedInventorySummary = summary ?? {
    totalItems: 0,
    totalStock: 0,
    averageStock: 0,
    stockStatusCounts: { normal: 0, low: 0, high: 0, critical: 0 },
    lowStockCount: 0,
    overStockCount: 0,
    restockNeededCount: 0,
    activeSkuCount: 0,
    categoryCount: 0,
    locationCount: 0,
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <SummaryCardButton
        title="총 재고량"
        value={safeSummary.totalStock.toLocaleString()}
        subtitle={`총 ${safeSummary.totalItems.toLocaleString()}개 품목`}
        icon="fa-boxes"
        accentClass="bg-purple-100 text-purple-700"
        onClick={onTotalClick}
      />
      <SummaryCardButton
        title="부족/치명 재고"
        value={safeSummary.lowStockCount.toLocaleString()}
        subtitle={`Critical ${safeSummary.stockStatusCounts.critical.toLocaleString()} · Low ${safeSummary.stockStatusCounts.low.toLocaleString()}`}
        icon="fa-exclamation-triangle"
        accentClass="bg-amber-100 text-amber-700"
        onClick={onLowClick}
      />
      <SummaryCardButton
        title="과잉 재고"
        value={safeSummary.overStockCount.toLocaleString()}
        subtitle={`High ${safeSummary.stockStatusCounts.high.toLocaleString()} / Normal ${safeSummary.stockStatusCounts.normal.toLocaleString()}`}
        icon="fa-warehouse"
        accentClass="bg-sky-100 text-sky-700"
        onClick={onHighClick}
      />
      <SummaryCardButton
        title="즉시 조치 필요"
        value={safeSummary.restockNeededCount.toLocaleString()}
        subtitle={`활성 SKU ${safeSummary.activeSkuCount.toLocaleString()}개`}
        icon="fa-bolt"
        accentClass="bg-rose-100 text-rose-700"
        onClick={onRestockClick}
      />
    </div>
  );
}
