import { useMemo, useState, useEffect, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import Sidebar, { SidebarItem, MobileNav } from "@/components/sidebar";
import OutboundTabs from "@/components/outbound-tabs";
import InventoryTab, { type InventoryTabKey } from "@/components/inventory-tab";
import DeliveryOverview from "@/pages/delivery-overview";
import DepartureDashboard from "@/pages/departure-dashboard";
import ProductionPlan from "@/pages/production-plan";
import ProductMaster from "@/pages/product-master";
import NotFound from "@/pages/not-found";
import { AIChatWidget } from "@/components/ai-chatbot";
import { useFreightSummary } from "@/components/shared/truck-freight-api";
import { ErrorBoundary } from "@/components/error-boundary";

/** 트럭 운송비 — lazy 로드 (해당 페이지 오류가 전체 대시보드를 깨지 않도록) */
const TruckFreightPage = lazy(() => import("@/pages/truck-freight"));
/** 제품 배치도 — A~E형 렉 진열 */
const ProductDisplayPage = lazy(() => import("@/pages/product-display"));

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
  {
    key: "barcode",
    path: "/barcode",
    label: "바코드 생성",
    icon: "fa-qrcode",
    description: "송장번호/제품 바코드 생성 및 시간대별 출고 데이터 전송",
  },
  {
    key: "departure",
    path: "/departure",
    label: "출차 관리",
    icon: "fa-truck-moving",
    description: "VF 출차 차량 등록 및 KPP/LS 연동 대시보드",
  },
  {
    key: "scanner",
    path: "/scanner",
    label: "VF 입고 바코드",
    icon: "fa-barcode",
    description: "미입고 품목 확인 및 바코드 스캔 작업을 수행합니다.",
  },
  {
    key: "truck-freight",
    path: "/truck-freight",
    label: "트럭 운송비",
    icon: "fa-truck-loading",
    description: "트럭 운송비 내역 조회, 입력 및 월별/계산서 종류별 통계를 확인합니다.",
  },
  {
    key: "product-display",
    path: "/product-display",
    label: "제품 배치도",
    icon: "fa-th-large",
    description: "A~E형 렉 도면에 제품 번호/이름을 배정하고 저장합니다.",
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
  barcode: {
    key: "barcode",
    title: "바코드 생성",
    description: "송장번호/제품 바코드 생성 및 시간대별 출고 데이터 전송",
  },
  scanner: {
    key: "scanner",
    title: "VF 입고 바코드",
    description: "미입고 품목 확인 및 바코드 스캔 작업을 수행합니다.",
  },
  departure: {
    key: "departure",
    title: "출차 관리 대시보드",
    description: "VF 출차 차량 등록, LS 배차 요청, KPP 팔레트 등록",
  },
  "truck-freight": {
    key: "truck-freight",
    title: "트럭 운송비 관리",
    description: "운송비 내역 조회, 입력 및 월별/계산서 종류별 통계",
  },
  "product-display": {
    key: "product-display",
    title: "제품 배치도",
    description: "A~E동 배치도에 제품을 배정하고 진열 현황을 관리합니다.",
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
    case "/inventory":
    case "/inventory/enhanced":
      return "inventory";
    case "/production":
      return "production";

    case "/master":
      return "master";
    case "/departure":
      return "departure";
    case "/barcode":
      return "barcode";
    case "/scanner":
      return "scanner";
    case "/truck-freight":
      return "truck-freight";
    case "/product-display":
      return "product-display";
    default:
      return "unknown";
  }
}

export default function Dashboard() {
  const [location, setLocation] = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const normalizedPath = useMemo(() => normalizePath(location), [location]);
  const activeKey = resolveActiveKey(normalizedPath);
  const meta = PAGE_META[activeKey] || PAGE_META.delivery;

  // 트럭 운송비: 최근 7일 내 신규 등록 건수 → 사이드바 메뉴 NEW 표시
  // 요약 API 실패해도 화면 전체가 비지 않도록 (throwOnError 없음)
  const { data: freightSummary } = useFreightSummary();
  const navItems = useMemo(() => {
    try {
      const hasFreightNew = (freightSummary?.recent_new_count ?? 0) > 0;
      if (!hasFreightNew) return NAV_ITEMS;
      return NAV_ITEMS.map((it) =>
        it.key === "truck-freight" ? { ...it, badge: "✨ NEW" } : it
      );
    } catch {
      return NAV_ITEMS;
    }
  }, [freightSummary?.recent_new_count]);

  // 페이지 제목 설정
  useEffect(() => {
    document.title = meta.title ? `${meta.title} | VF 보노하우스` : 'VF 보노하우스';
  }, [meta]);

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
      case "/departure":
        return <DepartureDashboard />;
      case "/barcode":
        return (
          <iframe
            src="/barcode.html"
            className="w-full h-full border-0"
            title="바코드 생성"
          />
        );
      case "/scanner":
        return (
          <iframe
            // SW/브라우저 캐시 우회 — 버전 문자열 변경 시 강제 갱신
            key="scanner-upload-display-20260731"
            src="/barcode_scanner.html?v=loc-seq-save-fix-20260731"
            className="w-full h-full border-0"
            title="VF 입고 바코드"
          />
        );
      case "/truck-freight":
        return (
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-12 text-muted-foreground text-sm">
                운송비 페이지 로딩…
              </div>
            }
          >
            <TruckFreightPage />
          </Suspense>
        );
      case "/product-display":
        return (
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-12 text-muted-foreground text-sm">
                제품 배치도 로딩…
              </div>
            }
          >
            <ProductDisplayPage />
          </Suspense>
        );
      default:
        return <NotFound />;
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar items={navItems} activeKey={activeKey === "unknown" ? "delivery" : activeKey} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <MobileNav items={navItems} activeKey={activeKey === "unknown" ? "delivery" : activeKey} />
            <div>
              <h2 className="text-lg font-bold text-foreground" data-testid="content-title">
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

        <div className="flex-1 overflow-auto p-6 min-h-0">
          <ErrorBoundary label="page-content" key={normalizedPath}>
            {renderContent()}
          </ErrorBoundary>
        </div>

        {/* Global AI Chatbot Widget */}
        <AIChatWidget
          pageContext={{
            name: activeKey === "outbound" ? "VF 출고 대시보드" :
                   activeKey === "delivery" ? "배송 현황" :
                   activeKey === "production" ? "생산 계획" :
                   activeKey === "master" ? "제품 마스터" : "대시보드",
            type: activeKey === "outbound" ? "vf-outbound" :
                   activeKey === "production" ? "production" :
                   activeKey === "inventory" ? "inventory" : "dashboard"
          }}
        />
      </div>
    </div>
  );
}
