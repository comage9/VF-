import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import EnhancedInventoryPage from "./inventory/enhanced-inventory-page.tsx";
import { Button } from "./ui/button";
import { Package } from "lucide-react";

export type InventoryTabKey = 'enhanced';

interface InventoryTabProps {
  initialTab?: InventoryTabKey;
  onTabChange?: (tab: InventoryTabKey) => void;
}

export default function InventoryTab({ initialTab = 'enhanced', onTabChange }: InventoryTabProps = {}) {
  const [location] = useLocation();
  
  // URL 파라미터에서 초기 탭 상태 읽기
  const getInitialTabFromUrl = (): InventoryTabKey => {
    try {
      const url = new URL(window.location.href);
      const tabParam = url.searchParams.get('tab');
      if (tabParam && ['enhanced'].includes(tabParam)) {
        return tabParam as InventoryTabKey;
      }
    } catch (error) {
      console.warn('URL 파라미터 읽기 실패:', error);
    }
    return initialTab;
  };

  const [activeTab, setActiveTab] = useState<InventoryTabKey>(getInitialTabFromUrl());

  useEffect(() => {
    const urlTab = getInitialTabFromUrl();
    if (urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [location, activeTab]);

  const handleTabChange = (tab: InventoryTabKey) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const tabs = [
    {
      key: 'enhanced' as InventoryTabKey,
      label: '재고 현황',
      icon: Package,
      description: '상세 재고 현황 및 분석'
    }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'enhanced':
        return <EnhancedInventoryPage />;
      default:
        return <EnhancedInventoryPage />;
    }
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 탭 네비게이션 */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.key}
                variant={activeTab === tab.key ? 'default' : 'outline'}
                onClick={() => handleTabChange(tab.key)}
                className="flex items-center gap-2"
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Button>
            );
          })}
        </div>
        <div className="text-sm text-gray-600">
          {tabs.find(tab => tab.key === activeTab)?.description}
        </div>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex-1 min-h-0">
        {renderContent()}
      </div>
    </div>
  );
}
