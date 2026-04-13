"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MobileFilterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Filter states
  selectedDate: string;
  onDateChange: (value: string) => void;
  machineFilter: string;
  onMachineChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  sortOrder: string;
  onSortChange: (value: string) => void;
  // Options
  sortedDates: string[];
  latestDate?: string;
  machines: string[];
  // Selection
  selectedIds: number[];
  onClearSelection: () => void;
}

export function MobileFilterDrawer({
  open,
  onOpenChange,
  selectedDate,
  onDateChange,
  machineFilter,
  onMachineChange,
  search,
  onSearchChange,
  sortOrder,
  onSortChange,
  sortedDates,
  latestDate,
  machines,
  selectedIds,
  onClearSelection,
}: MobileFilterDrawerProps) {
  const [localSearch, setLocalSearch] = useState(search);

  const handleApply = () => {
    onSearchChange(localSearch);
    onOpenChange(false);
  };

  const handleReset = () => {
    onDateChange("latest");
    onMachineChange("all");
    onSearchChange("");
    setLocalSearch("");
    onSortChange("recent");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-full flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle className="text-lg font-semibold">필터 및 검색</SheetTitle>
          {selectedIds.length > 0 && (
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-muted-foreground">
                선택 {selectedIds.length}건
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                className="text-xs h-7"
              >
                선택 해제
              </Button>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {/* 날짜 선택 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">날짜 선택</Label>
            <Select value={selectedDate} onValueChange={onDateChange}>
              <SelectTrigger>
                <SelectValue placeholder="날짜 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">최신 ({latestDate || 'N/A'})</SelectItem>
                <SelectItem value="all">전체</SelectItem>
                {sortedDates.map((date) => (
                  <SelectItem key={date} value={date}>
                    {date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 기계번호 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">기계번호</Label>
            <Select value={machineFilter} onValueChange={onMachineChange}>
              <SelectTrigger>
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {machines.map((machine) => (
                  <SelectItem key={machine} value={machine}>
                    {machine}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 검색 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">검색</Label>
            <Input
              placeholder="품목명, 색상명 등"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
            />
          </div>

          {/* 정렬 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">정렬</Label>
            <Select value={sortOrder} onValueChange={onSortChange}>
              <SelectTrigger>
                <SelectValue placeholder="정렬 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">최근순</SelectItem>
                <SelectItem value="oldest">오래된순</SelectItem>
                <SelectItem value="name">품목명순</SelectItem>
                <SelectItem value="quantity">수량순</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter className="flex-shrink-0 flex-col gap-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleReset}
              className="flex-1"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              초기화
            </Button>
            <Button onClick={handleApply} className="flex-1">
              적용
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
