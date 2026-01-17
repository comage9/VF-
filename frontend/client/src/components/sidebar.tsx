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
    const baseClass = "nav-tab flex items-center px-4 py-3 text-left rounded-lg font-medium transition-all duration-300 w-full";
    if (activeKey === key) {
      return `${baseClass} bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-[1.02]`;
    }
    return `${baseClass} bg-secondary hover:bg-gradient-to-r hover:from-blue-50 hover:to-blue-100 text-secondary-foreground hover:shadow-md hover:scale-[1.01]`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-border bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <h1 className="text-xl font-bold text-foreground mb-1 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          비즈니스 분석
        </h1>
        <p className="text-sm text-muted-foreground">실시간 출고·재고·생산 인사이트</p>
      </div>

      <div className="flex flex-col p-4 space-y-2 flex-1 overflow-y-auto">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.path}
            onClick={onItemClick}
            className={getButtonClass(item.key)}
            data-testid={`nav-${item.key}`}
          >
            <i className={`fas ${item.icon} mr-3 w-5 text-center transition-transform duration-300 group-hover:scale-110`}></i>
            <span className="flex-1">{item.label}</span>
            {activeKey === item.key && (
              <i className="fas fa-chevron-right ml-2 text-sm"></i>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar({ items, activeKey, className }: SidebarProps) {
  return (
    <div className={`w-80 bg-gradient-to-b from-white via-gray-50 to-white border-r border-border flex-col hidden md:flex shadow-lg ${className}`}>
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
      <SheetContent side="left" className="p-0 w-80">
        <NavContent items={items} activeKey={activeKey} onItemClick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
