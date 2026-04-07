import { Link } from "wouter";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export interface SidebarItem {
  key: string;
  path: string;
  label: string;
  icon: string;
  description?: string;
}

interface SidebarProps {
  items: SidebarItem[];
  activeKey: string;
  className?: string;
}

function NavContent({ items, activeKey, onItemClick }: SidebarProps & { onItemClick?: () => void }) {
  const getButtonClass = (key: string) => {
    const baseClass = "nav-tab flex items-center px-4 py-3 text-left rounded-lg font-medium transition-all duration-200 w-full";
    if (activeKey === key) {
      // Toss Design Language: single accent #721FE5 for active state only
      return `${baseClass} bg-[#721FE5] text-white`;
    }
    // Grayscale for inactive — never use color
    return `${baseClass} text-[#3C3C3C] hover:bg-[#F4F4F5]`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header — clean, no gradient */}
      <div className="p-6 border-b border-[#E8E8EA]">
        <h1 className="text-xl font-bold text-[#2A2A2A] mb-1">
          VF 보노하우스
        </h1>
        <p className="text-sm text-[#717182]">실시간 생산 인사이트</p>
      </div>

      {/* Nav items */}
      <div className="flex flex-col p-4 space-y-1 flex-1 overflow-y-auto">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.path}
            onClick={onItemClick}
            className={getButtonClass(item.key)}
            data-testid={`nav-${item.key}`}
          >
            <i className={`fas ${item.icon} mr-3 w-5 text-center`}></i>
            <span className="flex-1">{item.label}</span>
            {activeKey === item.key && (
              <i className="fas fa-chevron-right ml-2 text-xs opacity-70"></i>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar({ items, activeKey, className }: SidebarProps) {
  return (
    <div className={`w-64 bg-[#FAFAFA] border-r border-[#E8E8EA] flex-col hidden md:flex ${className}`}>
      <NavContent items={items} activeKey={activeKey} />
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
      <SheetContent side="left" className="p-0 w-64">
        <NavContent items={items} activeKey={activeKey} onItemClick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
