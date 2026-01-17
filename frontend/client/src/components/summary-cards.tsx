interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: string;
  iconColor: string;
  subtitle?: string;
  onClick?: () => void;
}

function SummaryCard({ title, value, icon, iconColor, subtitle, onClick }: SummaryCardProps) {
  const Wrapper = onClick ? 'button' : 'div';
  const baseClass = 'bg-white/90 backdrop-blur-sm rounded-xl border border-border p-6 shadow-md hover:shadow-xl transition-all duration-300';
  const clickableClass = onClick ? 'w-full text-left cursor-pointer hover:border-blue-400 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50' : 'hover:-translate-y-1';

  return (
    <Wrapper
      type={onClick ? 'button' as const : undefined}
      onClick={onClick}
      className={`${baseClass} ${clickableClass}`.trim()}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
          <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{value}</p>
        </div>
        <div className={`w-14 h-14 ${iconColor} rounded-xl flex items-center justify-center shadow-lg transform transition-transform duration-300 hover:scale-110`}>
          <i className={`fas ${icon} text-xl ${iconColor.replace('bg-', 'text-').replace('/10', '')}`}></i>
        </div>
      </div>
      {subtitle && (
        <div className="mt-4 text-muted-foreground text-sm font-medium">{subtitle}</div>
      )}
    </Wrapper>
  );
}

interface InventorySummaryProps {
  type: 'inventory';
  totalItems: number;
  lowStockCount: number;
  overStockCount: number;
  onLowStockClick: () => void;
  onOverStockClick: () => void;
  onTotalInventoryClick: () => void;
}

interface OutboundSummaryProps {
  type: 'outbound';
  data: any[];
}

type SummaryCardsProps = InventorySummaryProps | OutboundSummaryProps;

export default function SummaryCards(props: SummaryCardsProps) {
  if (props.type === 'inventory') {
    const { totalItems, lowStockCount, overStockCount, onLowStockClick, onOverStockClick, onTotalInventoryClick } = props;
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <SummaryCard
          title="총 재고량"
          value={(totalItems || 0).toLocaleString()}
          icon="fa-boxes"
          iconColor="bg-purple-500/10"
          onClick={onTotalInventoryClick}
        />
        <SummaryCard
          title="부족 재고"
          value={lowStockCount || 0}
          icon="fa-exclamation-triangle"
          iconColor="bg-orange-500/10"
          onClick={onLowStockClick}
        />
        <SummaryCard
          title="과잉 재고"
          value={overStockCount || 0}
          icon="fa-warehouse"
          iconColor="bg-red-500/10"
          onClick={onOverStockClick}
        />
        <SummaryCard
          title="종류 수"
          value="전체"
          icon="fa-list"
          iconColor="bg-green-500/10"
        />
      </div>
    );
  }

  // Outbound type handling
  const { data } = props;
  const totalQuantity = data?.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0) || 0;
  const totalItems = data?.length || 0;
  const avgQuantity = totalItems > 0 ? Math.round(totalQuantity / totalItems) : 0;
  const uniqueProducts = new Set(data?.map(item => item.productName) || []).size;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <SummaryCard
        title="총 출고량"
        value={totalQuantity.toLocaleString()}
        icon="fa-truck"
        iconColor="bg-blue-500/10"
      />
      <SummaryCard
        title="출고 건수"
        value={totalItems.toLocaleString()}
        icon="fa-list-ol"
        iconColor="bg-green-500/10"
      />
      <SummaryCard
        title="평균 출고량"
        value={avgQuantity.toLocaleString()}
        icon="fa-chart-line"
        iconColor="bg-orange-500/10"
      />
      <SummaryCard
        title="상품 종류"
        value={uniqueProducts.toLocaleString()}
        icon="fa-boxes"
        iconColor="bg-purple-500/10"
      />
    </div>
  );
}