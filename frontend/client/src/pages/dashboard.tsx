import { useMemo } from "react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import Sidebar, { SidebarItem, MobileNav } from "@/components/sidebar";
import OutboundTabs from "@/components/outbound-tabs";
import InventoryTab, { type InventoryTabKey } from "@/components/inventory-tab";
import DeliveryOverview from "@/pages/delivery-overview";
import ProductionPlan from "@/pages/production-plan";
import ProductMaster from "@/pages/product-master";
import NotFound from "@/pages/not-found";

interface PageMeta {
  key: string;
  title: string;
  description: string;
  ctaLabel?: string;
}

const NAV_ITEMS: SidebarItem[] = [
  {
    key: "delivery",
    path: "/delivery",
    label: "출고 현황",
    icon: "fa-chart-line",
    description: "오늘 출고량, 예측, 시간대별 추이를 한눈에 확인합니다.",
  },
  {
    key: "outbound",
    path: "/outbound",
    label: "출고 수량",
    icon: "fa-truck",
    description: "시간대별 출고 실적, 카테고리 필터, CSV/Google Sheets 연동 기능을 제공합니다.",
  },
  {
    key: "fc-inbound",
    path: "/fc-inbound",
    label: "FC 입고",
    icon: "fa-warehouse",
    description: "FC 물류센터별 입고 데이터 분석 및 품목별 현황을 모니터링합니다.",
  },
  {
    key: "inventory",
    path: "/inventory/enhanced",
    label: "전산 재고 수량",
    icon: "fa-boxes",
    description: "재고 현황과 부족/과잉 재고를 모니터링하고, 빠르게 보충이 필요한 품목을 파악합니다.",
  },
  {
    key: "production",
    path: "/production",
    label: "생산 계획",
    icon: "fa-industry",
    description: "생산 계획 테이블과 라인별 진행 상황을 실시간으로 모니터링합니다.",
  },
  {
    key: "master",
    path: "/master",
    label: "제품 마스터 관리",
    icon: "fa-database",
    description: "제품명, 바코드, 색상 등 제품 사양 데이터를 관리합니다.",
  },
];

const PAGE_META: Record<string, PageMeta> = {
  delivery: {
    key: "delivery",
    title: "출고 현황 대시보드",
    description: "오늘 출고량, 예측, 시간대별 추이를 한눈에 확인합니다.",
  },
  outbound: {
    key: "outbound",
    title: "출고 수량 분석",
    description: "실시간 출고 데이터와 품목별 현황을 모니터링합니다.",
    ctaLabel: "데이터 내보내기",
  },
  fc_inbound: {
    key: "fc-inbound",
    title: "FC 입고 분석",
    description: "FC 물류센터별 입고 데이터와 품목별 현황을 모니터링합니다.",
    ctaLabel: "CSV 다운로드",
  },
  inventory: {
    key: "inventory",
    title: "전산 재고 수량 분석",
    description: "재고 위험 신호를 빠르게 파악하고 부족/과잉을 관리합니다.",
    ctaLabel: "CSV 다운로드",
  },
  production: {
    key: "production",
    title: "생산 계획 모니터링",
    description: "생산 라인·품목별 진행 상황과 작업량을 실시간으로 추적합니다.",
    ctaLabel: "새로고침",
  },
  master: {
    key: "master",
    title: "제품 마스터 관리",
    description: "제품 사양 데이터베이스를 관리하고 자동완성 데이터를 설정합니다.",
  },
};

function normalizePath(location: string | undefined): string {
  const raw = location || "/";
  const base = ((import.meta as any).env?.BASE_URL as string | undefined ?? "/").replace(/\/$/, "");
  if (base && base !== "/" && raw.startsWith(base)) {
    const rest = raw.slice(base.length) || "/";
    return rest.startsWith("/") ? rest : `/${rest}`;
  }
  if (raw === "") return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function resolveActiveKey(pathname: string): string {
  switch (pathname) {
    case "/":
    case "/delivery":
      return "delivery";
    case "/outbound":
    case "/outbound/records":
    case "/outbound/analysis":
      return "outbound";
    case "/fc-inbound":
    case "/fc-inbound/records":
    case "/fc-inbound/analysis":
      return "fc-inbound";
    case "/inventory":
    case "/inventory/enhanced":
      return "inventory";
    case "/production":
      return "production";
    case "/master":
      return "master";
    default:
      return "unknown";
  }
}

export default function Dashboard() {
  const [location, setLocation] = useLocation();
  const normalizedPath = useMemo(() => normalizePath(location), [location]);
  const activeKey = resolveActiveKey(normalizedPath);
  const meta = PAGE_META[activeKey] || PAGE_META.delivery;

  // 기본 경로(/sales) 접근 시 /sales/delivery로 정규화
  useEffect(() => {
    if (normalizedPath === "/") {
      setLocation("/delivery");
    }
    // /inventory 루트 접근 시 기본 탭 경로로 리다이렉트
    if (normalizedPath === "/inventory") {
      setLocation("/inventory/enhanced");
    }
  }, [normalizedPath, setLocation]);

  const lastUpdated = useMemo(() => {
    return new Date().toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [activeKey, normalizedPath]);

  const renderContent = () => {
    switch (normalizedPath) {
      case "/":
      case "/delivery":
        return <DeliveryOverview />;
      case "/outbound":
      case "/outbound/records":
      case "/outbound/analysis":
        return (
          <OutboundTabs />
        );
      case "/fc-inbound":
      case "/fc-inbound/records":
      case "/fc-inbound/analysis":
        return (
          <OutboundTabs />
        );
      case "/inventory":
      case "/inventory/enhanced":
        return (
          <InventoryTab
            initialTab="enhanced"
            onTabChange={(_tab: InventoryTabKey) => {
              // 탭 변경 시 고유 경로로 이동
              const targetPath = "/inventory/enhanced";
              if (normalizedPath !== targetPath) setLocation(targetPath);
            }}
          />
        );
      case "/production":
        return <ProductionPlan />;
      case "/master":
        return <ProductMaster />;
      default:
        return <NotFound />;
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50">
      <Sidebar items={NAV_ITEMS} activeKey={activeKey === "unknown" ? "delivery" : activeKey} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-white via-blue-50 to-purple-50 border-b border-border px-6 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center">
            <MobileNav items={NAV_ITEMS} activeKey={activeKey === "unknown" ? "delivery" : activeKey} />
            <div>
              <h2 className="text-lg font-bold text-foreground bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent" data-testid="content-title">
                {meta.title}
              </h2>
              <p className="text-sm text-muted-foreground hidden md:block">{meta.description}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-sm text-muted-foreground bg-white/80 px-3 py-2 rounded-lg shadow-sm">
              <i className="fas fa-clock mr-2 text-blue-500" aria-hidden />
              <span data-testid="last-updated">마지막 갱신: {lastUpdated}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
