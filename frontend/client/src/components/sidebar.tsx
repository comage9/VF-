import { Link } from "wouter";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, ArrowBigLeft, ArrowBigRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export interface SidebarItem {
  key: string;
  path: string;
  label: string;
  icon: string;
  description?: string;
  externalUrl?: string;
  /** 사이드바 메뉴 항목 옆에 표시할 작은 배지 (예: "NEW") */
  badge?: string;
}

interface SidebarProps {
  items: SidebarItem[];
  activeKey: string;
  className?: string;
  collapsed?: boolean;
  onToggle?: () => void;
}

function NavContent({ items, activeKey, collapsed, onItemClick }: SidebarProps & { onItemClick?: () => void }) {
  const getButtonClass = (key: string) => {
    const baseClass = "nav-tab flex items-center px-4 py-3 text-left rounded-lg font-medium transition-all duration-200 w-full";
    if (collapsed) {
      return activeKey === key
        ? `${baseClass} bg-[#721FE5] text-white justify-center px-0 group relative`
        : `${baseClass} text-[color:var(--sidebar-foreground)] hover:bg-[color:var(--secondary-hover)] justify-center px-0 group relative`;
    }
    if (activeKey === key) {
      // Toss Design Language: single accent #721FE5 for active state only
      return `${baseClass} bg-[#721FE5] text-white`;
    }
    // Use CSS variables for automatic dark mode support
    return `${baseClass} text-[color:var(--sidebar-foreground)] hover:bg-[color:var(--secondary-hover)]`;
  };

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA]" data-sidebar>
      {/* Header — clean, no gradient */}
      {!collapsed ? (
        <div className="p-6 border-b border-[color:var(--sidebar-border)]">
          <h1 className="text-xl font-bold text-[color:var(--sidebar-foreground)] mb-1">
            VF 보노하우스
          </h1>
          <p className="text-sm text-[color:var(--muted-foreground)]">실시간 생산 인사이트</p>
        </div>
      ) : (
        <div className="p-4 border-b border-[color:var(--sidebar-border)] flex justify-center">
          <h1 className="text-lg font-bold text-[color:var(--sidebar-foreground)]">VF</h1>
        </div>
      )}

      {/* Nav items */}
      <div className="flex flex-col p-4 space-y-1 flex-1 overflow-y-auto">
        {items.map((item) => (
          item.externalUrl ? (
            <a
              key={item.key}
              href={item.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onItemClick}
              className={getButtonClass(item.key)}
              data-testid={`nav-${item.key}`}
            >
              <i className={`fas ${item.icon} ${collapsed ? '' : 'mr-3'} w-5 text-center shrink-0`}></i>
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 shrink-0">
                  {item.badge}
                </span>
              )}
              {collapsed && item.badge && (
                <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500" title={item.badge}></span>
              )}
              {!collapsed && <i className="fas fa-external-link-alt ml-2 text-xs opacity-50"></i>}
              {collapsed && <span className="hidden lg:group-hover:block absolute left-full ml-2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg">{item.label}</span>}
            </a>
          ) : (
          <Link
            key={item.key}
            href={item.path}
            onClick={onItemClick}
            className={getButtonClass(item.key)}
            data-testid={`nav-${item.key}`}
          >
            <i className={`fas ${item.icon} ${collapsed ? '' : 'mr-3'} w-5 text-center shrink-0`}></i>
            {!collapsed && <span className="flex-1">{item.label}</span>}
            {!collapsed && item.badge && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 shrink-0">
                {item.badge}
              </span>
            )}
            {collapsed && item.badge && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500" title={item.badge}></span>
            )}
            {collapsed && <span className="hidden lg:group-hover:block absolute left-full ml-2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50 shadow-lg">{item.label}</span>}
            {activeKey === item.key && (
              <i className="fas fa-chevron-right ml-2 text-xs opacity-70"></i>
            )}
          </Link>
          )
        ))}
      </div>
    </div>
  );
}

export default function Sidebar({ items, activeKey, collapsed, onToggle, className }: SidebarProps) {
  return (
    <div className="relative flex">
      <div className={`${collapsed ? 'w-16' : 'w-64'} bg-[color:var(--sidebar)] border-r border-[color:var(--sidebar-border)] flex-col hidden md:flex transition-all duration-300 ${className}`} data-sidebar>
        <NavContent items={items} activeKey={activeKey} collapsed={collapsed} />
      </div>
      {/* 토글 버튼 — KPP 스타일: 사이드바 우측 외곽에 부착 */}
      <button
        onClick={onToggle}
        className="hidden md:flex absolute top-1/2 -translate-y-1/2 -right-3 z-50 w-6 h-12 items-center justify-center rounded-r-full bg-[#721FE5] text-white shadow-md hover:bg-[#5a1ab8] transition-all duration-200 cursor-pointer border-none"
        title={collapsed ? "펼치기" : "접기"}
      >
        <i className={`fas fa-chevron-${collapsed ? 'right' : 'left'} text-xs`}></i>
      </button>
    </div>
  );
}

export function MobileNav({ items, activeKey }: SidebarProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden mr-2">
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-64 bg-[color:var(--sidebar)] border-r border-[color:var(--sidebar-border)]">
        <NavContent items={items} activeKey={activeKey} onItemClick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
