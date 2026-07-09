import React, { useMemo, useRef, useState, useCallback } from "react";
import type { ChangeEvent } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { FileText, Plus, Trash2, Upload, Loader2, Edit, Play, CheckCircle, Clock, RotateCcw, Package, TrendingUp, BarChart3, GripVertical, Star, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Check, ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"

import { MobileFilterDrawer } from "@/components/MobileFilterDrawer";
import { useInventory, useUpdateInventory, useOutboundStats } from '@/components/shared/api';
import type { ProductionItem as SharedProductionItem, ProductionDraft as SharedProductionDraft, OutboundData } from '@/components/shared/types';
import { OutboundStatsPanel } from '@/components/shared/outbound-stats-panel';

interface ProductionItem {
  id: number;
  date: string;
  machineNumber: string;
  moldNumber: string;
  productName: string;
  productNameEng?: string;
  color1?: string;
  color2?: string;
  unit?: string;
  quantity?: number;
  unitQuantity?: number;
  total?: number;
  status?: 'pending' | 'started' | 'ended' | 'stopped';
  startTime?: string;
  endTime?: string;
  sortOrder?: number;
}

interface ProductionDraft {
  date: string;
  machineNumber: string;
  moldNumber: string;
  productName: string;
  productNameEng?: string;
  color1?: string;
  color2?: string;
  unit?: string;
  quantity?: number;
  unitQuantity?: number;
  total?: number;
  status?: 'pending' | 'started' | 'ended' | 'stopped';
}

interface ProductionResponse {
  success: boolean;
  latestDate?: string;
  data: ProductionItem[];
  latestData: ProductionItem[];
  allDates: string[];
  totalRecords: number;
}

type ProductionStatus = NonNullable<ProductionItem['status']>;

interface MasterSpec {
  id?: number;
  product_name: string;
  product_name_eng?: string;
  mold_number?: string;
  color1?: string;
  color2?: string;
  default_quantity?: number;
}

type MachineNumberValue = string | number | null | undefined;
type RawProductionRow = {
  // camelCase keys
  id?: number;
  date?: string;
  machineNumber?: string;
  line?: string;
  moldNumber?: string;
  sequence?: string;
  productName?: string;
  productNameEng?: string;
  color1?: string;
  color2?: string;
  unit?: string;
  quantity?: number | string;
  unitQuantity?: number | string;
  total?: number | string;
  sortOrder?: number | string;
  status?: string;
  startTime?: string;
  endTime?: string;
  // underscore keys (from API)
  machine_number?: string;
  mold_number?: string;
  product_name?: string;
  product_name_eng?: string;
  unit_quantity?: number | string;
};

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");
const UNIT_OPTIONS = ['BOX', 'P', 'LINE', 'EA'] as const;

// Utility function to extract machine number from various value types
function extractMachineNumber(value: MachineNumberValue): number {
  const s = String(value ?? '').trim();
  const digits = s.replace(/[^0-9]/g, "");
  const numeric = digits ? Number(digits) : NaN;
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeProductionRow(row: RawProductionRow): ProductionItem {
  const toNumber = (v: number | string | null | undefined): number => {
    if (v === null || v === undefined) return NaN;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const cleaned = v.replace(/,/g, '').trim();
      if (cleaned === '') return NaN;
      return Number(cleaned);
    }
    return Number(v);
  };

  const quantity = toNumber(row.quantity);
  const unitQuantity = toNumber(row.unitQuantity);
  const total = toNumber(row.total);
  const sortOrder = toNumber(row.sortOrder);
  const computedTotal = (Number.isFinite(quantity) ? quantity : 0) * (Number.isFinite(unitQuantity) ? unitQuantity : 0);

  const statusMap: Record<string, ProductionStatus> = {
    'pending': 'pending',
    'started': 'started',
    'ended': 'ended',
    'stopped': 'stopped',
  };
  const normalizedStatus = row.status ? statusMap[row.status] : 'pending';

  return {
    id: row.id ?? Math.random(),
    date: row.date ?? '',
    machineNumber: row.machineNumber ?? row.line ?? row.machine_number ?? '',
    moldNumber: row.moldNumber ?? row.sequence ?? row.mold_number ?? '',
    productName: row.productName ?? row.product_name ?? '',
    productNameEng: row.productNameEng ?? row.product_name_eng ?? '',
    color1: row.color1 ?? '',
    color2: row.color2 ?? '',
    unit: row.unit ? String(row.unit) : '',
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unitQuantity: Number.isFinite(unitQuantity) ? unitQuantity : (row.unit_quantity ? toNumber(row.unit_quantity) : 0),
    total: Number.isFinite(total) && total > 0 ? total : computedTotal,
    status: normalizedStatus,
    startTime: row.startTime,
    endTime: row.endTime,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
  };
}

function createEmptyRecord(date?: string): ProductionDraft {
  const today = date ?? new Date().toISOString().slice(0, 10);
  return {
    date: today,
    machineNumber: '',
    moldNumber: '',
    productName: '',
    productNameEng: '',
    color1: '',
    color2: '',
    unit: '',
    quantity: 0,
    unitQuantity: 0,
    total: 0,
    status: 'pending',
  };
}

const STATUS_OPTIONS: Array<{ value: ProductionStatus; label: string }> = [
  { value: 'pending', label: '대기' },
  { value: 'started', label: '시작' },
  { value: 'ended', label: '종료' },
  { value: 'stopped', label: '중지' },
];

// SortableRow component for drag and drop
interface SortableRowProps {
  row: ProductionItem;
  index: number;
  isSelected: boolean;
  onToggleSelect: (id: string, checked: boolean) => void;
  onStatusChange: (id: string, status: string) => void;
  onStatusReset: (id: string) => void;
  onEdit: (row: ProductionItem) => void;
  onDelete: (id: string) => void;
  onMachineNumberChange: (row: ProductionItem, newMachineNumber: string) => void;
  getStatusBadge: (status: string) => React.ReactNode;
  getMachineAccent: (machineNumber: string) => { rowBg: string; badgeBg: string };
  weeklyOutbound?: number;
  showSeparator?: boolean;
}

const SortableRow = React.memo(function SortableRow({
  row,
  index,
  isSelected,
  onToggleSelect,
  onStatusChange,
  onStatusReset,
  onEdit,
  onDelete,
  onMachineNumberChange,
  getStatusBadge,
  getMachineAccent,
  weeklyOutbound,
  showSeparator,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isEditingMachine, setIsEditingMachine] = useState(false);

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "border-t border-border/60 hover:bg-muted/40",
        getMachineAccent(row.machineNumber).rowBg,
        showSeparator && "!border-t-2 !border-dashed !border-gray-400",
      )}
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            title="드래그하여 순서 변경"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelect(row.id, checked as boolean)}
          />
        </div>
      </td>
      <td className="py-3 px-4">{getStatusBadge(row.status)}</td>
      <td className="py-3 px-4">{row.date}</td>
      <td className="py-3 px-4">
        {isEditingMachine ? (
          <Select
            value={row.machineNumber}
            onValueChange={(value) => {
              onMachineNumberChange(row, value);
              setIsEditingMachine(false);
            }}
            onOpenChange={(open) => !open && setIsEditingMachine(false)}
          >
            <SelectTrigger className="h-8 w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 14 }, (_, i) => i + 1).map((num) => (
                <SelectItem key={num} value={String(num)}>
                  {num}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div
            className="cursor-pointer hover:bg-muted/50 rounded px-2 py-1 -mx-2 -my-1"
            onDoubleClick={() => setIsEditingMachine(true)}
            title="더블클릭하여 기계번호 변경"
          >
            {row.machineNumber}
          </div>
        )}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {row.moldNumber}
          {row.moldNumber === '99' && (
            <img src="/images/mold_99.jpg" className="w-8 h-8 cursor-pointer object-contain mix-blend-multiply" title="옷정리 트레이 - 클릭하여 확대" onClick={() => window.open('/images/mold_99.jpg', '_blank', 'width=600,height=600')} />
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="font-medium">{row.productName}</div>
        <div className="text-xs text-muted-foreground">{row.productNameEng}</div>
        {weeklyOutbound !== undefined && weeklyOutbound > 0 && (() => {
          const planned = (row.unitQuantity || 0) * (row.quantity || 0);
          if (planned === 0) return null;
          const ratio = planned / weeklyOutbound;
          const pct = Math.round(ratio * 100);
          let label = '';
          let color = '';
          if (ratio > 1.5) { label = `⚠ 초과 (${pct}%)`; color = 'text-orange-600'; }
          else if (ratio < 0.5) { label = `↓ 부족 (${pct}%)`; color = 'text-blue-600'; }
          else { label = `✓ 적정 (${pct}%)`; color = 'text-green-600'; }
          return (
            <div className={`text-xs mt-0.5 font-medium ${color}`}>
              주간출고 {weeklyOutbound.toLocaleString()} · {label}
            </div>
          );
        })()}
      </td>
      <td className="py-3 px-4 text-sm text-muted-foreground">{row.productNameEng}</td>
      <td className="py-3 px-4">{row.color1}</td>
      <td className="py-3 px-4 text-sm">{row.color2}</td>
      <td className="py-3 px-4 text-right">{row.unitQuantity ? `${NUMBER_FORMATTER.format(row.unitQuantity)}개` : '-'}</td>
      <td className="py-3 px-4 text-right">{NUMBER_FORMATTER.format(row.quantity || 0)}</td>
      <td className="py-3 px-4 text-right">{row.unit || '-'}</td>
      <td className="py-3 px-4 text-right font-medium">{NUMBER_FORMATTER.format((row.unitQuantity || 0) * (row.quantity || 0))}</td>
      <td className="py-3 px-4">
        <div className="flex items-center justify-center gap-2">
          {row.status === 'pending' && (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => onStatusChange(row, 'started')} title="작업 시작">
              <Play className="w-4 h-4" />
            </Button>
          )}
          {row.status === 'started' && (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => onStatusChange(row, 'ended')} title="작업 완료">
              <CheckCircle className="w-4 h-4" />
            </Button>
          )}
          {row.status === 'started' && (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => onStatusChange(row, 'stopped')} title="중지">
              <Clock className="w-4 h-4" />
            </Button>
          )}
          {(row.status === 'ended' || row.status === 'started' || row.status === 'stopped') && (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-orange-500" onClick={() => onStatusReset(row)} title="상태 초기화">
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(row)} title="수정">
            <Edit className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => onDelete(row.id)} title="삭제">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
});

function useProductionLog(selectedDate: string = 'latest') {
  const queryKey = selectedDate === 'latest'
    ? ["/api/production"]
    : selectedDate === 'all'
      ? ["/api/production", "all"]
      : ["/api/production", selectedDate];

  const url = selectedDate === 'latest'
    ? '/api/production'
    : selectedDate === 'all'
      ? '/api/production?all=true'
      : `/api/production?date=${selectedDate}`;

  return useQuery<ProductionItem[]>({
    queryKey,
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('생산 계획 데이터를 불러오지 못했습니다.');
      }
      const json = await response.json();
      return json.results.data; // Use data field (not latestData)
    },
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });
}

interface SortableMobileCardProps {
  row: ProductionItem;
  index: number;
  selectedIds: number[];
  onToggleSelect: (id: number, checked: boolean) => void;
  onStatusChange: (row: ProductionItem, status: ProductionStatus) => void;
  onStatusReset: (row: ProductionItem) => void;
  onEdit: (row: ProductionItem) => void;
  onDelete: (id: number) => void;
  getStatusBadge: (status: string | undefined) => JSX.Element;
  getMachineAccent: (machineNumber: string | undefined) => { border: string; headerBg: string; rowBg: string };
  onReorder: (activeId: number, overId: number) => void;
}

const SortableMobileCard = React.memo(function SortableMobileCard({
  row,
  index,
  selectedIds,
  onToggleSelect,
  onStatusChange,
  onStatusReset,
  onEdit,
  onDelete,
  getStatusBadge,
  getMachineAccent,
}: SortableMobileCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const cardStyle = useMemo(() => ({
    ...style,
    touchAction: 'pan-y' as const,
  }), [style]);

  return (
    <Card
      ref={setNodeRef}
      style={cardStyle}
      className={cn(
        "overflow-hidden border-l-4",
        getMachineAccent(row.machineNumber).border,
        isDragging && "shadow-lg scale-105"
      )}
    >
      <CardHeader
        className={cn(
          "p-3 flex flex-row items-center justify-between",
          getMachineAccent(row.machineNumber).headerBg,
        )}
      >
        <div className="flex items-center gap-2">
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
            <GripVertical className="w-4 h-4" />
          </button>
          <Checkbox
            checked={selectedIds.includes(row.id)}
            onCheckedChange={(checked) => onToggleSelect(row.id, checked as boolean)}
          />
          <Badge variant="outline">{row.machineNumber}</Badge>
          <span className="font-medium text-sm">{row.date}</span>
        </div>
        {getStatusBadge(row.status)}
      </CardHeader>
      <CardContent className="p-3 space-y-2">
        <div className="flex justify-between items-start">
          <div>
            <h4 className="font-semibold text-base">{row.productName}</h4>
            <p className="text-xs text-muted-foreground">{row.productNameEng}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-lg">{NUMBER_FORMATTER.format(row.unitQuantity || 0)}개 × {NUMBER_FORMATTER.format(row.quantity || 0)}{row.unit || ''}</p>
            <p className="text-xs text-muted-foreground">= {NUMBER_FORMATTER.format((row.unitQuantity || 0) * (row.quantity || 0))}개</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">금형:</span> {row.moldNumber}
            {row.moldNumber === '99' && (
              <img src="/images/mold_99.jpg" className="w-8 h-8 inline-block ml-1 align-middle object-contain mix-blend-multiply cursor-pointer" title="옷정리 트레이 - 클릭" onClick={() => window.open('/images/mold_99.jpg', '_blank', 'width=600,height=600')} />
            )}
          </div>
          <div>
            <span className="text-muted-foreground text-xs">색상:</span> {row.color1} {row.color2 && `/ ${row.color2}`}
          </div>
        </div>

        <div className="pt-2 flex flex-wrap gap-2 border-t mt-2">
          {row.status === 'pending' && (
            <Button size="sm" className="flex-1 min-w-[120px] bg-blue-600 hover:bg-blue-700" onClick={() => onStatusChange(row, 'started')} style={{ touchAction: 'manipulation' }}>
              <Play className="w-4 h-4 mr-2" /> 시작
            </Button>
          )}
          {row.status === 'started' && (
            <Button size="sm" className="flex-1 min-w-[120px] bg-green-600 hover:bg-green-700" onClick={() => onStatusChange(row, 'ended')} style={{ touchAction: 'manipulation' }}>
              <CheckCircle className="w-4 h-4 mr-2" /> 완료
            </Button>
          )}
          {row.status === 'started' && (
            <Button size="sm" variant="outline" className="flex-1 min-w-[120px]" onClick={() => onStatusChange(row, 'stopped')} style={{ touchAction: 'manipulation' }}>
              <Clock className="w-4 h-4 mr-2" /> 중지
            </Button>
          )}
          {(row.status === 'ended' || row.status === 'started' || row.status === 'stopped') && (
            <Button size="sm" variant="outline" className="flex-1 min-w-[120px]" onClick={() => onStatusReset(row)} style={{ touchAction: 'manipulation' }}>
              <RotateCcw className="w-4 h-4 mr-2" /> 초기화
            </Button>
          )}
          <Button size="sm" variant="outline" className="flex-1 min-w-[120px]" onClick={() => onEdit(row)} style={{ touchAction: 'manipulation' }}>
            <Edit className="w-4 h-4 mr-2" /> 수정
          </Button>
          <Button size="sm" variant="destructive" className="flex-1 min-w-[120px]" onClick={() => onDelete(row.id)} style={{ touchAction: 'manipulation' }}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

function useProductionMeta() {
  return useQuery<{ latestDate: string; allDates: string[] }>({
    queryKey: ["/api/production-meta"],
    queryFn: async () => {
      const response = await fetch('/api/production');
      if (!response.ok) {
        throw new Error('생산 계획 메타 데이터를 불러오지 못했습니다.');
      }
      const json = await response.json();
      return { latestDate: json.results.latestDate, allDates: json.results.allDates };
    },
    staleTime: 5 * 60 * 1000,
  });
}

function getMachineAccent(machineNumber: string | undefined) {
  const palette = [
    { border: "border-l-blue-500", headerBg: "bg-blue-50/60 dark:bg-blue-950/20", rowBg: "bg-blue-50/30 dark:bg-blue-950/10" },
    { border: "border-emerald-500", headerBg: "bg-emerald-50/60 dark:bg-emerald-950/20", rowBg: "bg-emerald-50/30 dark:bg-emerald-950/10" },
    { border: "border-amber-500", headerBg: "bg-amber-50/60 dark:bg-amber-950/20", rowBg: "bg-amber-50/30 dark:bg-amber-950/10" },
    { border: "border-purple-500", headerBg: "bg-purple-50/60 dark:bg-purple-950/20", rowBg: "bg-purple-50/30 dark:bg-purple-950/10" },
    { border: "border-rose-500", headerBg: "bg-rose-50/60 dark:bg-rose-950/20", rowBg: "bg-rose-50/30 dark:bg-rose-950/10" },
    { border: "border-cyan-500", headerBg: "bg-cyan-50/60 dark:bg-cyan-950/20", rowBg: "bg-cyan-50/30 dark:bg-cyan-950/10" },
  ] as const;
  const raw = String(machineNumber ?? "").trim();
  const digits = raw.replace(/[^0-9]/g, "");
  const numeric = digits ? Number(digits) : NaN;
  let idx = 0;
  if (Number.isFinite(numeric)) {
    idx = Math.abs(numeric) % palette.length;
  } else {
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
    }
    idx = hash % palette.length;
  }
  return palette[idx];
}

export default function ProductionPlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const { data: latestData = [], isLoading } = useProductionLog(selectedDate);
  const { data: meta } = useProductionMeta();
  const { data: invData, isLoading: invLoading } = useInventory();
  const updateInventory = useUpdateInventory();
  const { data: outboundStats } = useOutboundStats(7);

  // 미완료 작업 이월 (어제 -> 오늘)
  const carryForwardMutation = useMutation({
    mutationFn: async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const url = `/api/production-log/carry-forward?from_date=${yesterday}&to_date=${today}`;
      const response = await fetch(url, { method: 'POST' });
      if (!response.ok) throw new Error('이월 실패');
      return response.json() as Promise<{ success: boolean; carried: number; skipped: number; from_date: string; to_date: string; }>;
    },
    onSuccess: (data) => {
      alert(`${data.carried}건 이월 완료 (${data.skipped}건 중복 생략)`);
      queryClient.invalidateQueries({ queryKey: ["/api/production"] });
    },
    onError: (error) => {
      alert(`이월 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
  });

  // 제품별 주간 출고량 Map
  const productOutboundMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!outboundStats?.by_product) return map;
    for (const p of outboundStats.by_product) {
      map.set(p.product_name, p.quantity);
    }
    return map;
  }, [outboundStats]);

  const [machineFilter, setMachineFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newRecord, setNewRecord] = useState<ProductionDraft>(() => createEmptyRecord());
  const [isSaving, setIsSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingDate, setIsDeletingDate] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<ProductionStatus>('pending');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState<string>('recent');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAIRecommend, setShowAIRecommend] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'inventory'>('active');
  const [editingInventory, setEditingInventory] = useState<string | null>(null);
  const [editStockValue, setEditStockValue] = useState<string>('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [moveConfirmDate, setMoveConfirmDate] = useState<string | null>(null);

  // 모바일 메인 탭 상태
  const [mobileMainTab, setMobileMainTab] = useState<'monitoring' | 'plans'>('monitoring');

  // === 사원번호 모드 ===
  const [employeeNumber, setEmployeeNumber] = useState<string>('');
  const [employeeMachines, setEmployeeMachines] = useState<string[]>([]);
  const [employeeName, setEmployeeName] = useState<string>('');
  const [empLoading, setEmpLoading] = useState(false);

  const handleEmployeeLogin = useCallback(async () => {
    const emp = employeeNumber.trim();
    if (!emp) {
      setEmployeeMachines([]);
      setEmployeeName('');
      return;
    }
    // 1~50 범위 검증
    const empNum = parseInt(emp, 10);
    if (isNaN(empNum) || empNum < 1 || empNum > 50) {
      setEmployeeMachines([]);
      setEmployeeName('1~50번만 가능');
      return;
    }
    setEmpLoading(true);
    try {
      const res = await fetch(`/api/machine/users?employee_number=${encodeURIComponent(emp)}`);
      const json = await res.json();
      if (json.success && json.users.length > 0) {
        setEmployeeMachines(json.users.map((u: any) => u.machine_number));
        setEmployeeName(json.users[0].user_name || '');
      } else {
        setEmployeeMachines([]);
        setEmployeeName('사용자 없음');
      }
    } catch {
      setEmployeeMachines([]);
      setEmployeeName('조회 실패');
    } finally {
      setEmpLoading(false);
    }
  }, [employeeNumber]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 0,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch specs for autocomplete
  const { data: specs = [] } = useQuery<MasterSpec[]>({
    queryKey: ["/api/master/specs"],
    queryFn: async () => {
      const res = await fetch("/api/master/specs");
      if (!res.ok) throw new Error("Failed to fetch specs");
      return res.json();
    },
  });

  const uniqueProductNames = useMemo(() => {
    const values: string[] = [];
    values.push(...specs.map((s: MasterSpec) => String(s.product_name || '').trim()).filter(Boolean));
    values.push(...(Array.isArray(latestData) ? latestData : []).map((row: ProductionItem) => String(row.productName || '').trim()).filter(Boolean));
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [specs, latestData]);

  const normalizedRows = useMemo(() => {
    return Array.isArray(latestData) ? latestData.map(normalizeProductionRow) : [];
  }, [latestData]);

  const productLogRows = useMemo(() => {
    if (!newRecord.productName) return [] as ProductionItem[];
    return normalizedRows.filter((row) => row.productName === newRecord.productName);
  }, [normalizedRows, newRecord.productName]);

  const availableColor1Options = useMemo(() => {
    const values: string[] = [];

    const fromLogs = productLogRows
      .map((row) => (row.color1 || '').trim())
      .filter((v) => Boolean(v));
    values.push(...fromLogs);

    if (newRecord.productName) {
      const fromSpecs = specs
        .filter((s: MasterSpec) => s.product_name === newRecord.productName)
        .map((s: MasterSpec) => String(s.color1 || '').trim())
        .filter((v: string) => Boolean(v));
      values.push(...fromSpecs);
    }

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [productLogRows, specs, newRecord.productName]);

  const availableColor2Options = useMemo(() => {
    const values: string[] = [];
    if (!newRecord.productName || !newRecord.color1) return values;

    const fromLogs = productLogRows
      .filter((row) => (row.color1 || '').trim() === (newRecord.color1 || '').trim())
      .map((row) => (row.color2 || '').trim())
      .filter((v) => Boolean(v));
    values.push(...fromLogs);

    const fromSpecs = specs
      .filter((s: MasterSpec) => s.product_name === newRecord.productName && String(s.color1 || '').trim() === String(newRecord.color1 || '').trim())
      .map((s: MasterSpec) => String(s.color2 || '').trim())
      .filter((v: string) => Boolean(v));
    values.push(...fromSpecs);

    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [productLogRows, specs, newRecord.productName, newRecord.color1]);

  const availableUnitQuantities = useMemo(() => {
    const values: number[] = [];
    const fromLogs = productLogRows
      .map((row) => Number(row.unitQuantity))
      .filter((v) => Number.isFinite(v) && v > 0);
    values.push(...fromLogs);

    if (values.length === 0 && newRecord.productName) {
      const spec = specs.find((s: MasterSpec) => s.product_name === newRecord.productName);
      const fallback = Number(spec?.default_quantity);
      if (Number.isFinite(fallback) && fallback > 0) values.push(fallback);
    }

    return Array.from(new Set(values)).sort((a, b) => a - b);
  }, [productLogRows, specs, newRecord.productName]);

  const availableUnitLabels = useMemo(() => {
    const values: string[] = [...UNIT_OPTIONS];
    const fromLogs = productLogRows
      .map((row) => String(row.unit || '').trim())
      .filter((v) => Boolean(v));
    values.push(...fromLogs);
    return Array.from(new Set(values));
  }, [productLogRows]);

  const latestDate = meta?.latestDate || '';
  const allDates = meta?.allDates || [];
  const sortedDates = useMemo(() => {
    return [...allDates].sort((a, b) => String(b).localeCompare(String(a)));
  }, [allDates]);
  const machines = useMemo(() => {
    const uniqueMachines = new Set<string>();
    normalizedRows.forEach(row => {
      if (row.machineNumber) uniqueMachines.add(row.machineNumber);
    });
    return Array.from(uniqueMachines).sort();
  }, [normalizedRows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const dateToMatch = selectedDate === 'latest' ? latestDate : selectedDate === 'all' ? null : selectedDate;

    const rows = normalizedRows.filter((row) => {
      if (dateToMatch && row.date !== dateToMatch) return false;
      if (machineFilter !== 'all' && row.machineNumber !== machineFilter) return false;
      if (keyword) {
        const haystack = [row.productName, row.productNameEng, row.color1, row.color2].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });

    const toMachineNumber = (v: MachineNumberValue): number | null => {
      const s = String(v ?? '').trim();
      const n = Number(s);
      return Number.isFinite(n) ? n : null;
    };

    // Sort by date desc (latest first), then machineNumber asc (numeric-aware)
    // Within same date and machineNumber: sort_order asc (ignore if 0), then moldNumber for same products, then id asc
    rows.sort((a, b) => {
      const da = a.date || '';
      const db = b.date || '';
      if (da !== db) return db.localeCompare(da);

      const ma = toMachineNumber(a.machineNumber);
      const mb = toMachineNumber(b.machineNumber);
      if (ma !== null && mb !== null && ma !== mb) return ma - mb;
      if (ma !== null && mb === null) return -1;
      if (ma === null && mb !== null) return 1;

      const sa = String(a.machineNumber ?? '');
      const sb = String(b.machineNumber ?? '');
      if (sa !== sb) return sa.localeCompare(sb);

      // Within same date and machineNumber: sort_order takes priority
      const soa = a.sortOrder ?? 0;
      const sob = b.sortOrder ?? 0;
      // If either has a sort_order set, use it (non-zero comes first)
      if (soa !== sob) {
        // 0 means "no explicit order" - push to end
        if (soa === 0) return 1;
        if (sob === 0) return -1;
        return soa - sob;
      }

      // Same product - group by moldNumber
      if (a.productName === b.productName) {
        const moldA = a.moldNumber || '';
        const moldB = b.moldNumber || '';
        if (moldA !== moldB) return moldA.localeCompare(moldB);
      }

      // ID asc (upload order)
      return (a.id || 0) - (b.id || 0);
    });
    return rows;
  }, [normalizedRows, search, machineFilter, selectedDate, latestDate]);

  // 진행 중 / 완료 탭 분리
  const activeRows = useMemo(() => filteredRows.filter(r => r.status !== 'ended'), [filteredRows]);
  const completedRows = useMemo(() => filteredRows.filter(r => r.status === 'ended'), [filteredRows]);
  const displayRows = activeTab === 'active' ? activeRows : completedRows;

  // Drag overlay content - extracted to avoid IIFE pattern
  const renderDragOverlay = useCallback(() => {
    if (!activeId) return null;

    const row = displayRows.find(r => r.id === activeId);
    if (!row) return null;

    return (
      <Card className={cn("overflow-hidden border-l-4 shadow-2xl scale-105 bg-card", getMachineAccent(row.machineNumber).border)}>
        <CardHeader className={cn("p-3", getMachineAccent(row.machineNumber).headerBg)}>
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4" />
            <Badge variant="outline">{row.machineNumber}</Badge>
            <span className="font-medium text-sm">{row.date}</span>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          <h4 className="font-semibold">{row.productName}</h4>
          <p className="text-xs text-muted-foreground">{row.productNameEng}</p>
        </CardContent>
      </Card>
    );
  }, [activeId, displayRows, getMachineAccent]);

  // Machine groups for rendering (must match DOM order for DnD)
  const { sortableItems, machineGroupEntries } = useMemo(() => {
    const groups = new Map<string, ProductionItem[]>();
    displayRows.forEach(row => {
      const machine = row.machineNumber || '미분류';
      if (!groups.has(machine)) groups.set(machine, []);
      groups.get(machine)!.push(row);
    });
    const entries = Array.from(groups.entries());
    const items: number[] = [];
    entries.forEach(([, rows]) => rows.forEach(r => items.push(r.id)));
    return { sortableItems: items, machineGroupEntries: entries };
  }, [displayRows]);

  const summary = useMemo(() => ({
    totalRecords: displayRows.length,
    totalQuantity: displayRows.reduce((sum, row) => sum + (row.quantity || 0), 0),
    totalUnitQuantity: displayRows.reduce((sum, row) => sum + (row.unitQuantity || 0), 0),
    totalOutput: displayRows.reduce((sum, row) => sum + ((row.unitQuantity || 0) * (row.quantity || 0)), 0),
  }), [displayRows]);

  const bulkStatusMutation = useMutation({
    mutationFn: async (payload: { ids?: number[]; date?: string; scope?: string; status: ProductionStatus }) => {
      const response = await fetch('/api/production/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({ message: '일괄 상태 변경에 실패했습니다.' }));
        throw new Error(errorPayload.message || '일괄 상태 변경에 실패했습니다.');
      }
      return response.json();
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/production"] });
      setSelectedIds([]); // 선택 해제
      toast({ title: '상태 변경 완료', description: `대상 ${res?.updated ?? 0}건` });
    },
    onError: (error) => {
      toast({ title: '상태 변경 실패', description: error instanceof Error ? error.message : '일괄 상태 변경 중 문제가 발생했습니다.', variant: 'destructive' });
    }
  });

  const handleUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('productionFile', file);

    try {
      setIsUploading(true);
      const response = await fetch('/api/upload-production-file', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: '업로드에 실패했습니다.' }));
        throw new Error(payload.error || payload.message || '업로드에 실패했습니다.');
      }

      const result = await response.json();
      toast({ title: '업로드 완료', description: result?.message || '생산 계획 데이터를 업로드했습니다.' });
      await queryClient.invalidateQueries({ queryKey: ["/api/production"] });
    } catch (error) {
      console.error('생산 계획 업로드 오류:', error);
      toast({ title: '업로드 실패', description: error instanceof Error ? error.message : '업로드 처리 중 문제가 발생했습니다.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleTemplateDownload = async () => {
    try {
      const response = await fetch('/api/production/template');
      if (!response.ok) {
        throw new Error('템플릿 다운로드에 실패했습니다.');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '생산계획.xls';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast({ title: '다운로드 실패', description: `템플릿 다운로드 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, variant: 'destructive' });
    }
  };

  const deleteSelectedMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const response = await fetch('/api/production-log/bulk-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (!response.ok) throw new Error('선택 삭제 실패');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production"] });
      queryClient.invalidateQueries({ queryKey: ["production-meta"] });
      setSelectedIds([]);
      toast({ title: '삭제 완료', description: '선택된 데이터가 삭제되었습니다.' });
    },
    onError: (error) => {
      toast({ title: '삭제 실패', description: `삭제 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, variant: 'destructive' });
    }
  });

  const handleDeleteByDate = async () => {
    if (selectedDate === 'all' || selectedDate === 'latest') {
      toast({ title: '일자 선택 필요', description: '삭제할 일자를 선택해주세요.', variant: 'destructive' });
      return;
    }

    if (!confirm(`${selectedDate} 날짜의 모든 데이터를 삭제하시겠습니까?`)) return;

    try {
      setIsDeletingDate(true);
      const response = await fetch(`/api/production-log/${selectedDate}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: '일자별 삭제에 실패했습니다.' }));
        throw new Error(payload.message || '일자별 삭제에 실패했습니다.');
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/production"] });
      await queryClient.invalidateQueries({ queryKey: ["production-meta"] });
      setSelectedDate('latest');
      toast({ title: '삭제 완료', description: `${selectedDate} 데이터가 삭제되었습니다.` });
    } catch (error) {
      toast({ title: '삭제 실패', description: `삭제 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, variant: 'destructive' });
    } finally {
      setIsDeletingDate(false);
    }
  };

  // AI 추천 불러오기
  const fetchAIRecommendations = async () => {
    setAiLoading(true);
    setShowAIRecommend(true);
    try {
      const res = await fetch('/api/ai/production-recommend');
      const data = await res.json();
      if (data.success && Array.isArray(data.recommendations)) {
        setAiRecommendations(data.recommendations);
      } else if (Array.isArray(data)) {
        setAiRecommendations(data);
      } else {
        setAiRecommendations([]);
      }
    } catch (e) {
      setAiRecommendations([]);
    } finally {
      setAiLoading(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (record: ProductionDraft) => {
      const response = await fetch('/api/production-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record })
      });
      if (!response.ok) throw new Error('추가 실패');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production"] });
      setIsDialogOpen(false);
      setNewRecord(createEmptyRecord());
      toast({ title: '추가 완료', description: '생산 계획이 추가되었습니다.' });
    },
    onError: (error) => {
      toast({ title: '추가 실패', description: `추가 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number, updates: Partial<ProductionItem> }) => {
      const response = await fetch(`/api/production-log/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) throw new Error('수정 실패');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production"] });
      setIsDialogOpen(false);
      setEditingId(null);
      setNewRecord(createEmptyRecord());
    },
    onError: (error) => {
      toast({ title: '수정 실패', description: `수정 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, variant: 'destructive' });
    }
  });

  const bulkReorderMutation = useMutation({
    mutationFn: async (orders: { id: number; sort_order: number }[]) => {
      const response = await fetch('/api/production-log/bulk-reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });
      if (!response.ok) throw new Error('순서 변경 실패');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production"] });
    },
    onError: (error) => {
      toast({ title: '순서 변경 실패', description: `순서 변경 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, variant: 'destructive' });
    }
  });

  const movePendingToTodayMutation = useMutation({
    mutationFn: async (fromDate: string) => {
      const response = await fetch('/api/production-log/move-pending-to-today', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_date: fromDate }),
      });
      if (!response.ok) throw new Error('이동 실패');
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: '이동 완료', description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/production"] });
      setMoveConfirmDate(null);
    },
    onError: (error) => {
      toast({ title: '이동 실패', description: `이동 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, variant: 'destructive' });
      setMoveConfirmDate(null);
    }
  });

  const handleSubmit = async () => {
    if (!newRecord.date || !newRecord.machineNumber || !newRecord.moldNumber || !newRecord.productName) {
      toast({ title: '필수 항목 누락', description: '일자, 기계번호, 금형번호, 제품명은 필수입니다.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const computedTotal = (Number(newRecord.unitQuantity) || 0) * (Number(newRecord.quantity) || 0);
      const payload: ProductionDraft = {
        ...newRecord,
        total: computedTotal,
      };
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, updates: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditClick = useCallback((item: ProductionItem) => {
    setEditingId(item.id);
    setNewRecord({
      date: item.date,
      machineNumber: item.machineNumber,
      moldNumber: item.moldNumber,
      productName: item.productName,
      productNameEng: item.productNameEng,
      color1: item.color1,
      color2: item.color2,
      unit: item.unit,
      quantity: item.quantity,
      unitQuantity: item.unitQuantity,
      total: item.total,
      status: item.status,
    });
    setIsDialogOpen(true);
  }, []);

  const handleStatusChange = useCallback((item: ProductionItem, newStatus: ProductionItem['status']) => {
    const updates: Partial<ProductionItem> = { status: newStatus };
    updateMutation.mutate({ id: item.id, updates });
  }, [updateMutation]);

  const handleStatusReset = useCallback((item: ProductionItem) => {
    if (!confirm('상태를 대기(Pending)로 초기화하시겠습니까?')) return;
    updateMutation.mutate({ id: item.id, updates: { status: 'pending', startTime: undefined, endTime: undefined } });
  }, [updateMutation]);

  const handleDeleteClick = useCallback((id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    deleteSelectedMutation.mutate([id]);
  }, [deleteSelectedMutation]);

  const handleMachineNumberChange = useCallback((item: ProductionItem, newMachineNumber: string) => {
    updateMutation.mutate({ id: item.id, updates: { machineNumber: newMachineNumber } });
  }, [updateMutation]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    // Find rows from normalizedRows (source of truth)
    const activeRow = normalizedRows.find(r => r.id === active.id);
    const overRow = normalizedRows.find(r => r.id === over.id);

    // If not dropped on a valid row, abort
    if (!activeRow || !overRow) {
      return;
    }

    const activeMachineNum = extractMachineNumber(activeRow.machineNumber);
    const targetMachineNum = extractMachineNumber(overRow.machineNumber);

    // Only allow dragging within the same machine number and date
    if (activeMachineNum !== targetMachineNum || activeRow.date !== overRow.date) {
      toast({ title: '순서 변경 불가', description: '같은 기계, 같은 일자 내에서만 순서를 변경할 수 있습니다.', variant: 'destructive' });
      return;
    }

    // Get all rows for this machine number and date from filteredRows (current display order)
    const currentMachineRows = filteredRows.filter(r =>
      extractMachineNumber(r.machineNumber) === activeMachineNum &&
      r.date === activeRow.date
    );
    const machineIds = currentMachineRows.map(r => r.id);

    // Reorder within the machine group
    const activeIndex = machineIds.indexOf(active.id as number);
    const overIndex = machineIds.indexOf(overRow.id as number);

    if (activeIndex === -1 || overIndex === -1) {
      return;
    }

    const newOrder = arrayMove(machineIds, activeIndex, overIndex);

    // Build orders array for API - assign sort_order to updated rows
    const orders = newOrder.map((id, index) => ({ id, sort_order: index + 1 }));

    // Optimistic update
    queryClient.setQueryData(["/api/production"], (oldData: any) => {
      if (!oldData) return oldData;

      const isArray = Array.isArray(oldData);
      const items = isArray ? (oldData as ProductionItem[]) : (oldData as ProductionResponse)?.latestData || [];

      const updatedItems = items.map(item => {
        const orderItem = orders.find(o => o.id === item.id);
        return orderItem ? { ...item, sortOrder: orderItem.sort_order } : item;
      });

      return isArray ? updatedItems : {
        ...oldData,
        latestData: updatedItems,
        data: updatedItems,
      };
    });

    // Call the mutation
    bulkReorderMutation.mutate(orders);
  };

  // moved to module scope (see above)

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'started':
        return <Badge className="bg-blue-500 hover:bg-blue-600">시작</Badge>;
      case 'ended':
        return <Badge className="bg-green-500 hover:bg-green-600">종료</Badge>;
      case 'stopped':
        return <Badge className="bg-red-500 hover:bg-red-600">중지</Badge>;
      default:
        return <Badge variant="outline" className="text-muted-foreground">대기</Badge>;
    }
  };

  return (
    <div className="space-y-6 pb-28 md:pb-0">
      {/* === 사원번호 모드 === */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-wrap items-center gap-3">
        <Label htmlFor="emp-number" className="whitespace-nowrap text-sm font-medium">사원번호</Label>
        <Input
          id="emp-number"
          type="number"
          min={1}
          max={50}
          placeholder="사원번호 (1~50) — 빈칸 시 전체"
          value={employeeNumber}
          onChange={(e) => setEmployeeNumber(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleEmployeeLogin()}
          className="max-w-[200px]"
        />
        <Button onClick={handleEmployeeLogin} disabled={empLoading} size="sm">
          {empLoading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />조회 중</> : '조회'}
        </Button>
        {employeeNumber && (
          <Button onClick={() => { setEmployeeNumber(''); setEmployeeMachines([]); setEmployeeName(''); }} variant="outline" size="sm">
            전체 보기
          </Button>
        )}
        {employeeName && (
          <Badge variant={employeeMachines.length > 0 ? 'default' : 'destructive'} className="text-xs">
            {employeeName}
          </Badge>
        )}
      </div>

      {/* 모바일 최소 헤더 - Drawer 열기 */}
      <div className="md:hidden sticky top-0 z-20 bg-card border-b border-border flex flex-col backdrop-blur-sm bg-card/95 shadow-sm">
        <div className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsDrawerOpen(true)}
              className="h-9 w-9 p-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </Button>
            <span className="text-sm font-semibold">생산 계획</span>
            <button onClick={() => document.body.classList.toggle('monochrome')} className="ml-2 text-xs px-2 py-0.5 rounded border hover:bg-muted" title="모노크롬 전환">◐</button>
            {selectedIds.length > 0 && (
              <Badge variant="secondary" className="text-xs">{selectedIds.length}건 선택</Badge>
            )}
          </div>
        </div>
        <div className="flex border-t border-border">
          <button onClick={() => setMobileMainTab('monitoring')} className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${mobileMainTab === 'monitoring' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}>📈 모니터링</button>
          <button onClick={() => setMobileMainTab('plans')} className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${mobileMainTab === 'plans' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-muted-foreground hover:bg-muted/50'}`}>📋 계획표</button>
        </div>
      </div>

      {/* 데스크탑 필터 패널 - 스크롤해도 고정 */}
      <div className="hidden md:block bg-card border border-border rounded-lg p-4 space-y-4 sticky top-0 z-10 backdrop-blur-sm bg-card/95">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            {selectedIds.length > 0 ? `선택 ${selectedIds.length}건` : ''}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="date-filter">날짜 선택</Label>
            <Select value={selectedDate} onValueChange={(value) => {
              // Check if selected date is a past date with pending records
              const today = new Date().toISOString().split('T')[0];
              if (value !== 'latest' && value !== 'all' && value < today) {
                // Check if there are pending records for this date
                const pendingForDate = normalizedRows.filter(r => r.date === value && r.status === 'pending');
                if (pendingForDate.length > 0) {
                  setMoveConfirmDate(value);
                  return;
                }
              }
              setSelectedDate(value);
            }}>
              <SelectTrigger id="date-filter">
                <SelectValue placeholder="날짜 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest">최신 날짜 ({latestDate || 'N/A'})</SelectItem>
                <SelectItem value="all">전체</SelectItem>
                {sortedDates.map((date) => (
                  <SelectItem key={date} value={date}>{date}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={carryForwardMutation.isPending}
              onClick={() => carryForwardMutation.mutate()}
              className="mt-2"
              data-testid="carry-forward-button"
            >
              {carryForwardMutation.isPending ? '이월 중...' : '이월 (어제 → 오늘)'}
            </Button>
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="machine-filter">기계번호</Label>
            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger id="machine-filter">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {machines.map((machine) => (
                  <SelectItem key={machine} value={machine}>{machine}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="search">검색</Label>
            <Input
              id="search"
              placeholder="품목명, 색상명 등"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleTemplateDownload}>
            <FileText className="w-4 h-4 mr-2" />
            양식
          </Button>

          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
            업로드
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={handleUploadChange}
          />

          <Button
            variant="outline"
            size="sm"
            onClick={fetchAIRecommendations}
            disabled={aiLoading}
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lightbulb className="w-4 h-4 mr-2" />}
            AI 추천
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => {
                setEditingId(null);
                setNewRecord(createEmptyRecord(latestDate || undefined));
              }}>
                <Plus className="w-4 h-4 mr-2" />
                신규
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? '생산 계획 수정' : '신규 생산 계획'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>일자 *</Label>
                    <Input type="date" value={newRecord.date} onChange={(e) => setNewRecord({ ...newRecord, date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>기계번호 *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !newRecord.machineNumber && "text-muted-foreground"
                          )}
                        >
                          {newRecord.machineNumber || "기계번호 선택"}
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0">
                        <Command>
                          <CommandInput placeholder="기계번호 검색..." />
                          <CommandList>
                            <CommandEmpty>기계를 찾을 수 없습니다.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="생산대기"
                                key="생산대기"
                                onSelect={() => {
                                  setNewRecord((prev) => ({ ...prev, machineNumber: "생산대기" }));
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    newRecord.machineNumber === "생산대기" ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                생산대기
                              </CommandItem>
                              {[...Array(14)].map((_, i) => {
                                const num = String(i + 1);
                                const label = `M${num}`;
                                return (
                                  <CommandItem
                                    value={label}
                                    key={label}
                                    onSelect={() => {
                                      setNewRecord((prev) => ({ ...prev, machineNumber: label }));
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        newRecord.machineNumber === label ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {label}
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>금형번호 *</Label>
                    <Input value={newRecord.moldNumber} onChange={(e) => setNewRecord({ ...newRecord, moldNumber: e.target.value })} placeholder="T001" />
                  </div>
                  <div className="space-y-2">
                    <Label>제품명 *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !newRecord.productName && "text-muted-foreground"
                          )}
                        >
                          {newRecord.productName || "제품 선택"}
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0">
                        <Command>
                          <CommandInput placeholder="제품 검색..." />
                          <CommandList>
                            <CommandEmpty>제품을 찾을 수 없습니다.</CommandEmpty>
                            <CommandGroup>
                              {uniqueProductNames.map((name) => (
                                <CommandItem
                                  value={name}
                                  key={name}
                                  onSelect={() => {
                                    const spec = specs.find((s: MasterSpec) => s.product_name === name);
                                    const rows = normalizedRows.filter((row) => row.productName === name);

                                    const bestRow = rows.reduce<ProductionItem | null>((best, cur) => {
                                      if (!best) return cur;
                                      const bestDate = String(best.date || '');
                                      const curDate = String(cur.date || '');
                                      if (curDate > bestDate) return cur;
                                      if (curDate < bestDate) return best;
                                      return (Number(cur.id) || 0) > (Number(best.id) || 0) ? cur : best;
                                    }, null);

                                    const unitQtyCandidates = Array.from(
                                      new Set(
                                        rows
                                          .map((r) => Number(r.unitQuantity))
                                          .filter((v) => Number.isFinite(v) && v > 0)
                                      )
                                    ).sort((a, b) => a - b);
                                    const defaultUnitQty = unitQtyCandidates[0]
                                      ?? (Number(spec?.default_quantity) > 0 ? Number(spec?.default_quantity) : 0);

                                    const color1Candidates = Array.from(
                                      new Set(
                                        rows
                                          .map((r) => String(r.color1 || '').trim())
                                          .filter((v) => Boolean(v))
                                      )
                                    ).sort((a, b) => a.localeCompare(b));
                                    if (color1Candidates.length === 0) {
                                      const fromSpecs = specs
                                        .filter((s: MasterSpec) => s.product_name === name)
                                        .map((s: MasterSpec) => String(s.color1 || '').trim())
                                        .filter((v: string) => Boolean(v));
                                      color1Candidates.push(...Array.from(new Set(fromSpecs)).sort((a, b) => a.localeCompare(b)));
                                    }
                                    const defaultColor1 = color1Candidates[0] || '';

                                    const color2Candidates = Array.from(
                                      new Set(
                                        rows
                                          .filter((r) => String(r.color1 || '').trim() === defaultColor1)
                                          .map((r) => String(r.color2 || '').trim())
                                          .filter((v) => Boolean(v))
                                      )
                                    ).sort((a, b) => a.localeCompare(b));
                                    if (color2Candidates.length === 0) {
                                      const fromSpecs2 = specs
                                        .filter((s: MasterSpec) => s.product_name === name && String(s.color1 || '').trim() === defaultColor1)
                                        .map((s: MasterSpec) => String(s.color2 || '').trim())
                                        .filter((v: string) => Boolean(v));
                                      color2Candidates.push(...Array.from(new Set(fromSpecs2)).sort((a, b) => a.localeCompare(b)));
                                    }
                                    const defaultColor2 = color2Candidates[0] || '';

                                    const unitLabelCandidates = Array.from(
                                      new Set([
                                        ...UNIT_OPTIONS,
                                        ...rows.map((r) => String(r.unit || '').trim()).filter((v) => Boolean(v)),
                                      ])
                                    );
                                    const defaultUnitLabel = unitLabelCandidates.find((v) => Boolean(v)) || 'BOX';

                                    setNewRecord((prev) => ({
                                      ...prev,
                                      productName: name,
                                      productNameEng: (spec?.product_name_eng || '').trim() || String(bestRow?.productNameEng || '').trim() || '',
                                      moldNumber: (spec?.mold_number || '').trim() || String(bestRow?.moldNumber || '').trim() || '',
                                      color1: defaultColor1,
                                      color2: defaultColor2,
                                      unit: defaultUnitLabel,
                                      unitQuantity: defaultUnitQty,
                                      total: defaultUnitQty * (Number(prev.quantity) || 0),
                                    }));
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      newRecord.productName === name ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>제품명(영문)</Label>
                  <Input value={newRecord.productNameEng || ''} onChange={(e) => setNewRecord({ ...newRecord, productNameEng: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>색상1</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !newRecord.color1 && "text-muted-foreground"
                          )}
                        >
                          {newRecord.color1 || "색상 선택"}
                          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0">
                        <Command>
                          <CommandInput placeholder="색상 검색..." />
                          <CommandList>
                            <CommandEmpty>색상을 찾을 수 없습니다.</CommandEmpty>
                            <CommandGroup>
                              {availableColor1Options.map((color) => (
                                <CommandItem
                                  value={color}
                                  key={color}
                                  onSelect={() => {
                                    const candidates = Array.from(
                                      new Set(
                                        normalizedRows
                                          .filter((row) => row.productName === newRecord.productName && String(row.color1 || '').trim() === String(color || '').trim())
                                          .map((row) => String(row.color2 || '').trim())
                                          .filter((v) => Boolean(v))
                                      )
                                    ).sort((a, b) => a.localeCompare(b));
                                    if (candidates.length === 0) {
                                      const fromSpecs = specs
                                        .filter((s: MasterSpec) => s.product_name === newRecord.productName && String(s.color1 || '').trim() === String(color || '').trim())
                                        .map((s: MasterSpec) => String(s.color2 || '').trim())
                                        .filter((v: string) => Boolean(v));
                                      candidates.push(...Array.from(new Set(fromSpecs)).sort((a, b) => a.localeCompare(b)));
                                    }
                                    setNewRecord((prev) => ({
                                      ...prev,
                                      color1: color,
                                      color2: candidates[0] || '',
                                    }));
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      newRecord.color1 === color ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {color}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>색상2</Label>
                    {availableColor2Options.length > 0 ? (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className={cn(
                              "w-full justify-between",
                              !newRecord.color2 && "text-muted-foreground"
                            )}
                          >
                            {newRecord.color2 || "색상 선택"}
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0 max-h-[300px] overflow-y-auto">
                          <Command>
                            <CommandInput placeholder="색상2 검색..." />
                            <CommandList>
                              <CommandEmpty>색상을 찾을 수 없습니다.</CommandEmpty>
                              <CommandGroup>
                                {availableColor2Options.map((color) => (
                                  <CommandItem
                                    value={color}
                                    key={color}
                                    onSelect={() => setNewRecord((prev) => ({ ...prev, color2: color }))}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        newRecord.color2 === color ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {color}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Input value={newRecord.color2 || ''} onChange={(e) => setNewRecord({ ...newRecord, color2: e.target.value })} />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>단위(낱개)</Label>
                    {availableUnitQuantities.length > 0 ? (
                      <Select
                        value={String(newRecord.unitQuantity ?? 0)}
                        onValueChange={(v) => {
                          const uq = parseInt(v, 10) || 0;
                          setNewRecord((prev) => ({
                            ...prev,
                            unitQuantity: uq,
                            total: uq * (Number(prev.quantity) || 0),
                          }));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="기본수량 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableUnitQuantities.map((uq) => (
                            <SelectItem key={uq} value={String(uq)}>{NUMBER_FORMATTER.format(uq)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type="number"
                        value={newRecord.unitQuantity || 0}
                        onChange={(e) => {
                          const uq = parseInt(e.target.value) || 0;
                          setNewRecord((prev) => ({
                            ...prev,
                            unitQuantity: uq,
                            total: uq * (Number(prev.quantity) || 0),
                          }));
                        }}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>생산단위(P/BOX)</Label>
                    <Select
                      value={newRecord.unit || ''}
                      onValueChange={(v) => setNewRecord((prev) => ({ ...prev, unit: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="단위 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableUnitLabels.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>생산수량</Label>
                    <Input
                      type="number"
                      value={newRecord.quantity || 0}
                      onChange={(e) => {
                        const q = parseInt(e.target.value) || 0;
                        setNewRecord((prev) => ({
                          ...prev,
                          quantity: q,
                          total: (Number(prev.unitQuantity) || 0) * q,
                        }));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>총계</Label>
                    <Input
                      type="number"
                      readOnly
                      value={(Number(newRecord.unitQuantity) || 0) * (Number(newRecord.quantity) || 0)}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>취소</Button>
                <Button onClick={handleSubmit} disabled={isSaving}>
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  저장
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Button
            variant="destructive"
            size="sm"
            onClick={handleDeleteByDate}
            disabled={isDeletingDate || selectedDate === 'all' || selectedDate === 'latest'}
          >
            {isDeletingDate ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            일자 삭제
          </Button>

          {/* 이동 확인 대화상자 */}
          <Dialog open={moveConfirmDate !== null} onOpenChange={(open) => !open && setMoveConfirmDate(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>미완료 생산계획 이동</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {moveConfirmDate}에 미완료(pending) 생산계획이 있습니다.
                  오늘({new Date().toISOString().split('T')[0]})로 이동하시겠습니까?
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => {
                    setMoveConfirmDate(null);
                    setSelectedDate('latest');
                  }}>
                    취소
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => {
                      if (moveConfirmDate) {
                        movePendingToTodayMutation.mutate(moveConfirmDate);
                        setSelectedDate(new Date().toISOString().split('T')[0]);
                      }
                    }}
                    disabled={movePendingToTodayMutation.isPending}
                  >
                    {movePendingToTodayMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    이동
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm(`선택된 ${selectedIds.length}건의 데이터를 삭제하시겠습니까?`)) {
                  deleteSelectedMutation.mutate(selectedIds);
                }
              }}
              disabled={deleteSelectedMutation.isPending}
            >
              {deleteSelectedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              선택 삭제 ({selectedIds.length})
            </Button>
          )}

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as ProductionStatus)}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="상태 선택" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="sm"
              variant="outline"
              disabled={selectedIds.length === 0 || bulkStatusMutation.isPending}
              onClick={() => {
                if (!confirm(`선택된 ${selectedIds.length}건의 상태를 변경하시겠습니까?`)) return;
                bulkStatusMutation.mutate({ ids: selectedIds, status: bulkStatus });
              }}
            >
              선택 상태 변경
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={selectedDate === 'all' || selectedDate === 'latest' || bulkStatusMutation.isPending}
              onClick={() => {
                const date = selectedDate;
                if (date === 'all' || date === 'latest') return;
                if (!confirm(`${date} 날짜 전체 상태를 변경하시겠습니까?`)) return;
                bulkStatusMutation.mutate({ date, status: bulkStatus });
              }}
            >
              일자 상태 변경
            </Button>

            <Button
              size="sm"
              variant="outline"
              disabled={bulkStatusMutation.isPending}
              onClick={() => {
                if (!confirm(`전체 데이터 상태를 변경하시겠습니까?`)) return;
                bulkStatusMutation.mutate({ scope: 'all', status: bulkStatus });
              }}
            >
              전체 상태 변경
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Overview - Z-Layout 기반 (2x2 그리드) */}
      <div className={`grid grid-cols-2 gap-3 ${mobileMainTab === 'monitoring' ? 'grid' : 'hidden md:grid'}`}>
        {/* 1순위: 총 수량 - 가장 강조 */}
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-blue-700 uppercase">총 수량</p>
                <h3 className="text-xl font-bold text-blue-900">{NUMBER_FORMATTER.format(summary.totalQuantity)}</h3>
                <p className="text-xs text-blue-700 mt-1">전체 생산 수량</p>
              </div>
              <Package className="w-8 h-8 text-blue-600 bg-white rounded-full p-1.5" />
            </div>
          </CardContent>
        </Card>

        {/* 2순위: 총 단위수량 - 강조 */}
        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-700 uppercase">총 단위수량</p>
                <h3 className="text-xl font-bold text-emerald-900">{NUMBER_FORMATTER.format(summary.totalUnitQuantity)}</h3>
                <p className="text-xs text-emerald-700 mt-1">누적 단위 생산</p>
              </div>
              <BarChart3 className="w-8 h-8 text-emerald-600 bg-white rounded-full p-1.5" />
            </div>
          </CardContent>
        </Card>

        {/* 3순위: 총 레코드 */}
        <Card className="bg-gray-50 border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase">총 레코드</p>
                <h3 className="text-xl font-bold text-gray-900">{NUMBER_FORMATTER.format(summary.totalRecords)}</h3>
                <p className="text-xs text-gray-500 mt-1">생산 계획 수</p>
              </div>
              <FileText className="w-8 h-8 text-gray-500 bg-white rounded-full p-1.5" />
            </div>
          </CardContent>
        </Card>

        {/* 4순위: 총계 */}
        <Card className="bg-gray-50 border border-gray-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase">총 생산량</p>
                <h3 className="text-xl font-bold text-gray-900">{NUMBER_FORMATTER.format(summary.totalOutput)}</h3>
                <p className="text-xs text-gray-500 mt-1">전체 생산 완료</p>
              </div>
              <TrendingUp className="w-8 h-8 text-amber-500 bg-white rounded-full p-1.5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI 추천 결과 섹션 */}
      {showAIRecommend && (
        <div className={`bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4 ${mobileMainTab === 'monitoring' ? 'block' : 'hidden md:block'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-purple-800 dark:text-purple-300 flex items-center gap-2">
              <Star className="w-4 h-4" />
              AI 생산 추천 결과
            </h3>
            <Button size="sm" variant="ghost" onClick={() => setShowAIRecommend(false)}>닫기</Button>
          </div>
          {aiLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              <span className="ml-2 text-sm text-purple-600">AI가 분석 중...</span>
            </div>
          ) : aiRecommendations.length === 0 ? (
            <p className="text-sm text-purple-600 text-center py-4">추천 결과가 없습니다.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {aiRecommendations.map((rec: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-white/80 dark:bg-slate-900/60 rounded-lg p-3 border border-purple-100 dark:border-purple-800"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs ${idx < 2 ? 'bg-red-500' : idx < 5 ? 'bg-orange-500' : 'bg-blue-500'}`}>
                        {idx < 2 ? '최우선' : idx < 5 ? '우선' : '일반'}
                      </Badge>
                      <span className="font-medium text-sm">{rec.product_name || rec.productName}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                      {rec.quantity || rec.recommended_quantity || '-'}개
                    </span>
                  </div>
                  {rec.reason && (
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">{rec.reason}</p>
                  )}
                  {rec.machine_number && (
                    <p className="text-xs text-gray-500 mt-1">기계: {rec.machine_number}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 진행 중 / 완료 탭 */}
      <div className={`flex gap-2 mb-4 ${mobileMainTab === 'plans' ? 'flex' : 'hidden md:flex'}`}>
        <Button
          variant={activeTab === 'active' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('active')}
        >
          진행 중 ({activeRows.length})
        </Button>
        <Button
          variant={activeTab === 'completed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('completed')}
        >
          완료 ({completedRows.length})
        </Button>
        <Button
          variant={activeTab === 'inventory' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setActiveTab('inventory')}
        >
          재고 확인
        </Button>
      </div>

      {/* 재고 확인 탭 */}
      {activeTab === 'inventory' && (
        <div className={`space-y-4 ${mobileMainTab === 'plans' ? 'block' : 'hidden md:block'}`}>
          <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-purple-600" />
                  <span className="font-semibold text-purple-900">현재 재고 수량</span>
                </div>
                <Badge variant="outline" className="text-purple-700 border-purple-300">
                  수정 가능
                </Badge>
              </div>
              {invLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  로딩 중...
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {(invData?.items || invData?.data || []).slice(0, 50).map((item: any) => (
                    <div
                      key={item.id || item.barcode}
                      className="flex items-center justify-between bg-white/60 rounded-lg p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-purple-900 truncate">
                          {item.product_name || item.barcode}
                        </p>
                        <p className="text-xs text-purple-600">
                          최소: {NUMBER_FORMATTER.format(item.min_stock || 0)} | 기준: {NUMBER_FORMATTER.format(item.reorder_point || 0)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {editingInventory === (item.id || item.barcode) ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={editStockValue}
                              onChange={(e) => setEditStockValue(e.target.value)}
                              className="w-24 h-8 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  updateInventory.mutate({
                                    id: String(item.id || item.barcode),
                                    data: { current_stock: parseInt(editStockValue) || 0 }
                                  });
                                  setEditingInventory(null);
                                } else if (e.key === 'Escape') {
                                  setEditingInventory(null);
                                }
                              }}
                            />
                            <Button size="sm" className="h-8 px-2" onClick={() => {
                              updateInventory.mutate({
                                id: String(item.id || item.barcode),
                                data: { current_stock: parseInt(editStockValue) || 0 }
                              });
                              setEditingInventory(null);
                            }}>
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setEditingInventory(null)}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="font-bold text-lg text-purple-900">
                              {NUMBER_FORMATTER.format(item.current_stock || 0)}
                            </span>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => {
                              setEditingInventory(String(item.id || item.barcode));
                              setEditStockValue(String(item.current_stock || 0));
                            }}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 생산계획 탭이 아닐 때만 출고량 통계 + 생산 목록 표시 */}
      {activeTab !== 'inventory' && (
        <>
          {/* 출고량 통계 패널 */}
          <div className={`${mobileMainTab === 'monitoring' ? 'block' : 'hidden md:block'}`}>
            <OutboundStatsPanel />
          </div>

      {/* 모바일 뷰 (카드 리스트) - 드래그 앤 드롭 */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={({ active }) => setActiveId(active.id as number)}
        onDragEnd={(event) => {
          const { active, over } = event;
          setActiveId(null);
          if (!over || active.id === over.id) return;

          const activeRow = displayRows.find(r => r.id === active.id);
          const overRow = displayRows.find(r => r.id === over.id);
          if (!activeRow || !overRow) return;

          // 같은 기계, 같은 날짜 내에서만 순서 변경
          if (activeRow.machineNumber !== overRow.machineNumber || activeRow.date !== overRow.date) {
            toast({ title: '순서 변경 불가', description: '같은 기계, 같은 일자 내에서만 순서를 변경할 수 있습니다.', variant: 'destructive' });
            return;
          }

          // 순서 변경
          const sameGroupRows = displayRows.filter(r => r.machineNumber === activeRow.machineNumber && r.date === activeRow.date);
          const activeIndex = sameGroupRows.findIndex(r => r.id === active.id);
          const overIndex = sameGroupRows.findIndex(r => r.id === over.id);
          if (activeIndex === -1 || overIndex === -1) return;

          const newOrder = arrayMove(sameGroupRows, activeIndex, overIndex);
          const orders = newOrder.map((r, idx) => ({ id: r.id, sort_order: idx + 1 }));

          // Optimistic update
          queryClient.setQueryData(["/api/production"], (oldData: any) => {
            if (!oldData) return oldData;
            const items = Array.isArray(oldData) ? oldData : oldData?.results?.latestData || [];
            const updatedItems = items.map((item: any) => {
              const order = orders.find((o: any) => o.id === item.id);
              return order ? { ...item, sortOrder: order.sort_order } : item;
            });
            return Array.isArray(oldData) ? updatedItems : { ...oldData, results: { ...oldData.results, latestData: updatedItems } };
          });

// Use mutation to persist order change
          bulkReorderMutation.mutate(orders, {
            onSuccess: () => {
              toast({ title: '순서 변경 완료' });
            },
            onError: () => {
              queryClient.invalidateQueries({ queryKey: ["/api/production"] });
              toast({ title: '순서 변경 실패', variant: 'destructive' });
            },
          });
        }}
      >
        <SortableContext items={displayRows.map(r => r.id)} strategy={verticalListSortingStrategy}>
          <div className={`md:hidden space-y-4 flex-1 overflow-y-auto px-3 pb-24 pt-2 ${mobileMainTab === 'plans' ? 'block' : 'hidden'}`}>
            {displayRows.map((row, index) => (
              <SortableMobileCard
                key={row.id}
                row={row}
                index={index}
                selectedIds={selectedIds}
                onToggleSelect={(id, checked) => {
                  if (checked) {
                    setSelectedIds([...selectedIds, id]);
                  } else {
                    setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
                  }
                }}
                onStatusChange={handleStatusChange}
                onStatusReset={handleStatusReset}
                onEdit={handleEditClick}
                onDelete={handleDeleteClick}
                getStatusBadge={getStatusBadge}
                getMachineAccent={getMachineAccent}
                onReorder={() => {}}
              />
            ))}
            {!isLoading && displayRows.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">데이터가 없습니다.</div>
            )}
          </div>
        </SortableContext>
        <DragOverlay>
          {renderDragOverlay()}
        </DragOverlay>
      </DndContext>
        </>
      )}

      <div className={`md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 z-20 ${mobileMainTab === 'plans' ? 'block' : 'hidden'}`}>
        <div className="p-3 space-y-2">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setShowMobileFilters((prev) => !prev)}
            >
              {showMobileFilters ? '필터 닫기' : '필터'}
            </Button>
            <Button
              type="button"
              size="sm"
              className="flex-1"
              onClick={() => {
                setEditingId(null);
                setNewRecord(createEmptyRecord(latestDate || undefined));
                setIsDialogOpen(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" /> 신규
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="flex-1"
              disabled={selectedIds.length === 0 || deleteSelectedMutation.isPending}
              onClick={() => {
                if (selectedIds.length === 0) return;
                if (confirm(`선택된 ${selectedIds.length}건의 데이터를 삭제하시겠습니까?`)) {
                  deleteSelectedMutation.mutate(selectedIds);
                }
              }}
            >
              삭제
            </Button>
          </div>

          <div className="flex gap-2">
            <Select value={bulkStatus} onValueChange={(v) => setBulkStatus(v as ProductionStatus)}>
              <SelectTrigger className="h-9 flex-1">
                <SelectValue placeholder="상태 선택" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={selectedIds.length === 0 || bulkStatusMutation.isPending}
              onClick={() => {
                if (selectedIds.length === 0) return;
                if (!confirm(`선택된 ${selectedIds.length}건의 상태를 변경하시겠습니까?`)) return;
                bulkStatusMutation.mutate({ ids: selectedIds, status: bulkStatus });
              }}
            >
              선택 상태 변경
            </Button>
          </div>
        </div>
      </div>

      {/* 데스크탑 뷰 (테이블) */}
      <div className="hidden md:block bg-card border border-border rounded-lg overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left text-muted-foreground">
                  <th className="py-3 px-4 w-10">
                    <Checkbox
                      checked={selectedIds.length === displayRows.length && displayRows.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedIds(displayRows.map(row => row.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                    />
                  </th>
                  <th className="py-3 px-4">상태</th>
                  <th className="py-3 px-4">일자</th>
                  <th className="py-3 px-4">기계</th>
                  <th className="py-3 px-4">금형</th>
                  <th className="py-3 px-4">제품명</th>
                  <th className="py-3 px-4">영문명</th>
                  <th className="py-3 px-4">색상</th>
                  <th className="py-3 px-4">롯트번호</th>
                  <th className="py-3 px-4 text-right">단위</th>
                  <th className="py-3 px-4 text-right">생산수량</th>
                  <th className="py-3 px-4 text-right">생산단위</th>
                  <th className="py-3 px-4 text-right">작업예정 수량(낱개)</th>
                  <th className="py-3 px-4 text-center">작업</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="text-center py-10 text-muted-foreground">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
                    {(() => {
                      let globalIndex = 0;
                      return machineGroupEntries.map(([machineNumber, rows]) => (
                        <React.Fragment key={machineNumber}>
                          <tr className={cn("border-t-2 border-border/80", getMachineAccent(machineNumber).headerBg)}>
                            <td colSpan={12} className="py-2 px-4 font-semibold text-sm">
                              기계번호: {machineNumber} ({rows.length}건)
                            </td>
                          </tr>
                          {rows.map((row, rowIdx) => {
                            const displayIndex = displayRows.findIndex(r => r.id === row.id) + 1;
                            const prevRow = rowIdx > 0 ? rows[rowIdx - 1] : null;
                            const showSep = prevRow && prevRow.moldNumber !== row.moldNumber;
                            return (
                            <SortableRow
                              key={row.id}
                              row={row}
                              index={displayIndex}
                              isSelected={selectedIds.includes(row.id)}
                              onToggleSelect={(id, checked) => {
                                if (checked) {
                                  setSelectedIds([...selectedIds, id]);
                                } else {
                                  setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
                                }
                              }}
                              onStatusChange={handleStatusChange}
                              onStatusReset={handleStatusReset}
                              onEdit={handleEditClick}
                              onDelete={handleDeleteClick}
                              onMachineNumberChange={handleMachineNumberChange}
                              getStatusBadge={getStatusBadge}
                              getMachineAccent={getMachineAccent}
                              weeklyOutbound={productOutboundMap.get(row.productName)}
                              showSeparator={showSep}
                            />
                            );
                          })}
                        </React.Fragment>
                      ));
                    })()}
                  </SortableContext>
                )}
              </tbody>
            </table>
          </div>
        </DndContext>

      {/* 모바일 필터 Drawer */}
      <MobileFilterDrawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        machineFilter={machineFilter}
        onMachineChange={setMachineFilter}
        search={search}
        onSearchChange={setSearch}
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        sortedDates={sortedDates}
        latestDate={latestDate}
        machines={machines}
        selectedIds={selectedIds}
        onClearSelection={() => setSelectedIds([])}
      />
      </div>
    </div>
  );
}
