import React, { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { FileText, Plus, Trash2, Upload, Loader2, Edit, Play, CheckCircle, Clock, RotateCcw, Package, TrendingUp, BarChart3, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
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
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

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
    machineNumber: row.machineNumber ?? row.line ?? '',
    moldNumber: row.moldNumber ?? row.sequence ?? '',
    productName: row.productName ?? '',
    productNameEng: row.productNameEng ?? '',
    color1: row.color1 ?? '',
    color2: row.color2 ?? '',
    unit: row.unit ? String(row.unit) : '',
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unitQuantity: Number.isFinite(unitQuantity) ? unitQuantity : 0,
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
  isSelected: boolean;
  onToggleSelect: (id: number, checked: boolean) => void;
  onStatusChange: (item: ProductionItem, newStatus: ProductionItem['status']) => void;
  onStatusReset: (item: ProductionItem) => void;
  onEdit: (item: ProductionItem) => void;
  onDelete: (id: number) => void;
  onMachineNumberChange: (item: ProductionItem, newMachineNumber: string) => void;
  getStatusBadge: (status: string | undefined) => JSX.Element;
  getMachineAccent: (machineNumber: string | undefined) => { border: string; headerBg: string; rowBg: string };
}

function SortableRow({
  row,
  isSelected,
  onToggleSelect,
  onStatusChange,
  onStatusReset,
  onEdit,
  onDelete,
  onMachineNumberChange,
  getStatusBadge,
  getMachineAccent,
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
            autoFocus
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
      <td className="py-3 px-4">{row.moldNumber}</td>
      <td className="py-3 px-4">
        <div className="font-medium">{row.productName}</div>
        <div className="text-xs text-muted-foreground">{row.productNameEng}</div>
      </td>
      <td className="py-3 px-4">{row.color1} {row.color2 && `/ ${row.color2}`}</td>
      <td className="py-3 px-4 text-right">{NUMBER_FORMATTER.format(row.unitQuantity || 0)}</td>
      <td className="py-3 px-4 text-right">{NUMBER_FORMATTER.format(row.quantity || 0)}</td>
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
}

function useProductionLog() {
  return useQuery<ProductionResponse>({
    queryKey: ["/api/production"],
    queryFn: async () => {
      const response = await fetch('/api/production');
      if (!response.ok) {
        throw new Error('생산 계획 데이터를 불러오지 못했습니다.');
      }
      return response.json();
    },
    retry: 2,
    staleTime: 5 * 60 * 1000,
  });
}

export default function ProductionPlan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useProductionLog();

  const [selectedDate, setSelectedDate] = useState<string>('latest');
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

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
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
    values.push(...(data?.data || []).map((row: ProductionItem) => String(row.productName || '').trim()).filter(Boolean));
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [specs, data?.data]);

  const normalizedRows = useMemo(() => {
    return (data?.data || []).map(normalizeProductionRow);
  }, [data?.data]);

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

  const latestDate = data?.latestDate || null;
  const allDates = data?.allDates || [];
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

  // Machine groups for rendering (must match DOM order for DnD)
  const { sortableItems, machineGroupEntries } = useMemo(() => {
    const groups = new Map<string, ProductionItem[]>();
    filteredRows.forEach(row => {
      const machine = row.machineNumber || '미분류';
      if (!groups.has(machine)) groups.set(machine, []);
      groups.get(machine)!.push(row);
    });
    const entries = Array.from(groups.entries());
    const items: number[] = [];
    entries.forEach(([, rows]) => rows.forEach(r => items.push(r.id)));
    return { sortableItems: items, machineGroupEntries: entries };
  }, [filteredRows]);

  const summary = useMemo(() => ({
    totalRecords: filteredRows.length,
    totalQuantity: filteredRows.reduce((sum, row) => sum + (row.quantity || 0), 0),
    totalUnitQuantity: filteredRows.reduce((sum, row) => sum + (row.unitQuantity || 0), 0),
    totalOutput: filteredRows.reduce((sum, row) => sum + ((row.unitQuantity || 0) * (row.quantity || 0)), 0),
  }), [filteredRows]);

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
      const response = await fetch('/api/production-log', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ids', ids })
      });
      if (!response.ok) throw new Error('선택 삭제 실패');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/production"] });
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
      toast({ title: '삭제 완료', description: `${selectedDate} 데이터가 삭제되었습니다.` });
    } catch (error) {
      toast({ title: '삭제 실패', description: `삭제 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, variant: 'destructive' });
    } finally {
      setIsDeletingDate(false);
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

  const handleEditClick = (item: ProductionItem) => {
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
  };

  const handleStatusChange = (item: ProductionItem, newStatus: ProductionItem['status']) => {
    const updates: Partial<ProductionItem> = { status: newStatus };
    updateMutation.mutate({ id: item.id, updates });
  };

  const handleStatusReset = (item: ProductionItem) => {
    if (!confirm('상태를 대기(Pending)로 초기화하시겠습니까?')) return;
    updateMutation.mutate({ id: item.id, updates: { status: 'pending', startTime: undefined, endTime: undefined } });
  };

  const handleDeleteClick = (id: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    deleteSelectedMutation.mutate([id]);
  };

  const handleMachineNumberChange = (item: ProductionItem, newMachineNumber: string) => {
    updateMutation.mutate({ id: item.id, updates: { machineNumber: newMachineNumber } });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    console.log('[DnD] dragEnd', { activeId: active.id, overId: over?.id });

    if (!over || active.id === over.id) {
      console.log('[DnD] skipped: no over or same id');
      return;
    }

    // Find rows from normalizedRows (source of truth)
    const activeRow = normalizedRows.find(r => r.id === active.id);
    const overRow = normalizedRows.find(r => r.id === over.id);
    console.log('[DnD] rows found', { activeRow: !!activeRow, overRow: !!overRow });

    if (!activeRow || !overRow) {
      console.log('[DnD] skipped: row not found');
      return;
    }

    const activeMachineNum = extractMachineNumber(activeRow.machineNumber);
    const overMachineNum = extractMachineNumber(overRow.machineNumber);

    console.log('[DnD] comparing', {
      activeMachine: activeRow.machineNumber,
      overMachine: overRow.machineNumber,
      activeMachineNum,
      overMachineNum,
      activeDate: activeRow.date,
      overDate: overRow.date
    });

    // Only allow dragging within the same machine number and date
    if (activeMachineNum !== overMachineNum || activeRow.date !== overRow.date) {
      console.log('[DnD] skipped: different machine or date');
      return;
    }

    // Get all rows for this machine number and date from normalizedRows
    const machineRows = normalizedRows.filter(r =>
      extractMachineNumber(r.machineNumber) === activeMachineNum &&
      r.date === activeRow.date
    );
    const machineIds = machineRows.map(r => r.id);

    // Reorder within the machine group
    const newOrder = arrayMove(machineIds, machineIds.indexOf(active.id as number), machineIds.indexOf(over.id as number));

    // Build orders array for API - assign sort_order to ALL rows in this group
    const orders = newOrder.map((id, index) => ({ id, sort_order: index + 1 }));
    console.log('[DnD] orders', orders);

    // Optimistic update using queryClient
    queryClient.setQueryData(["/api/production"], (oldData: ProductionResponse | undefined) => {
      if (!oldData) return oldData;

      return {
        ...oldData,
        data: oldData.data.map(item => {
          const orderItem = orders.find(o => o.id === item.id);
          return orderItem ? { ...item, sortOrder: orderItem.sort_order } : item;
        }),
        latestData: oldData.latestData.map(item => {
          const orderItem = orders.find(o => o.id === item.id);
          return orderItem ? { ...item, sortOrder: orderItem.sort_order } : item;
        }),
      };
    });

    // Call the mutation
    bulkReorderMutation.mutate(orders, {
      onError: () => {
        // On error, revert by invalidating queries to refetch original data
        queryClient.invalidateQueries({ queryKey: ["/api/production"] });
      }
    });
  };

  const getMachineAccent = (machineNumber: string | undefined) => {
    const palette = [
      {
        border: "border-l-blue-500",
        headerBg: "bg-blue-50/60 dark:bg-blue-950/20",
        rowBg: "bg-blue-50/30 dark:bg-blue-950/10",
      },
      {
        border: "border-emerald-500",
        headerBg: "bg-emerald-50/60 dark:bg-emerald-950/20",
        rowBg: "bg-emerald-50/30 dark:bg-emerald-950/10",
      },
      {
        border: "border-amber-500",
        headerBg: "bg-amber-50/60 dark:bg-amber-950/20",
        rowBg: "bg-amber-50/30 dark:bg-amber-950/10",
      },
      {
        border: "border-purple-500",
        headerBg: "bg-purple-50/60 dark:bg-purple-950/20",
        rowBg: "bg-purple-50/30 dark:bg-purple-950/10",
      },
      {
        border: "border-rose-500",
        headerBg: "bg-rose-50/60 dark:bg-rose-950/20",
        rowBg: "bg-rose-50/30 dark:bg-rose-950/10",
      },
      {
        border: "border-cyan-500",
        headerBg: "bg-cyan-50/60 dark:bg-cyan-950/20",
        rowBg: "bg-cyan-50/30 dark:bg-cyan-950/10",
      },
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
  };

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
      {/* 상단 컨트롤 패널 */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground">
            {selectedIds.length > 0 ? `선택 ${selectedIds.length}건` : ''}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="md:hidden"
            onClick={() => setShowMobileFilters((prev) => !prev)}
          >
            {showMobileFilters ? '필터 닫기' : '필터 열기'}
          </Button>
        </div>

        <div className={cn(
          "grid grid-cols-1 md:grid-cols-3 gap-4",
          !showMobileFilters && "hidden md:grid"
        )}>
          <div className="flex flex-col space-y-1.5">
            <Label htmlFor="date-filter">날짜 선택</Label>
            <Select value={selectedDate} onValueChange={setSelectedDate}>
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
                    <Input value={newRecord.machineNumber} onChange={(e) => setNewRecord({ ...newRecord, machineNumber: e.target.value })} placeholder="M001" />
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
                        <PopoverContent className="w-[200px] p-0">
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
                    <Label>기본수량</Label>
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
                    <Label>단위</Label>
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
                    <Label>수량</Label>
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
      <div className="grid grid-cols-2 gap-3">
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

      {/* 모바일 뷰 (카드 리스트) */}
      <div className="md:hidden space-y-4">
        {filteredRows.map((row) => (
          <Card
            key={row.id}
            className={cn(
              "overflow-hidden border-l-4",
              getMachineAccent(row.machineNumber).border,
            )}
          >
            <CardHeader
              className={cn(
                "p-3 flex flex-row items-center justify-between",
                getMachineAccent(row.machineNumber).headerBg,
              )}
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedIds.includes(row.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedIds([...selectedIds, row.id]);
                    } else {
                      setSelectedIds(selectedIds.filter(id => id !== row.id));
                    }
                  }}
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
                  <p className="font-bold text-lg">{NUMBER_FORMATTER.format((row.unitQuantity || 0) * (row.quantity || 0))}</p>
                  <p className="text-xs text-muted-foreground">총계</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">금형:</span> {row.moldNumber}
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">색상:</span> {row.color1} {row.color2 && `/ ${row.color2}`}
                </div>
              </div>

              <div className="pt-2 flex flex-wrap gap-2 border-t mt-2">
                {row.status === 'pending' && (
                  <Button size="sm" className="flex-1 min-w-[120px] bg-blue-600 hover:bg-blue-700" onClick={() => handleStatusChange(row, 'started')}>
                    <Play className="w-4 h-4 mr-2" /> 시작
                  </Button>
                )}
                {row.status === 'started' && (
                  <Button size="sm" className="flex-1 min-w-[120px] bg-green-600 hover:bg-green-700" onClick={() => handleStatusChange(row, 'ended')}>
                    <CheckCircle className="w-4 h-4 mr-2" /> 완료
                  </Button>
                )}
                {row.status === 'started' && (
                  <Button size="sm" variant="outline" className="flex-1 min-w-[120px]" onClick={() => handleStatusChange(row, 'stopped')}>
                    <Clock className="w-4 h-4 mr-2" /> 중지
                  </Button>
                )}
                {(row.status === 'ended' || row.status === 'started' || row.status === 'stopped') && (
                  <Button size="sm" variant="outline" className="flex-1 min-w-[120px]" onClick={() => handleStatusReset(row)}>
                    <RotateCcw className="w-4 h-4 mr-2" /> 초기화
                  </Button>
                )}
                <Button size="sm" variant="outline" className="flex-1 min-w-[120px]" onClick={() => handleEditClick(row)}>
                  <Edit className="w-4 h-4 mr-2" /> 수정
                </Button>
                <Button size="sm" variant="destructive" className="flex-1 min-w-[120px]" onClick={() => handleDeleteClick(row.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && filteredRows.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">데이터가 없습니다.</div>
        )}
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
                      checked={selectedIds.length === filteredRows.length && filteredRows.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedIds(filteredRows.map(row => row.id));
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
                  <th className="py-3 px-4">색상</th>
                  <th className="py-3 px-4 text-right">단위</th>
                  <th className="py-3 px-4 text-right">생산수량</th>
                  <th className="py-3 px-4 text-right">총계</th>
                  <th className="py-3 px-4 text-center">작업</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-10 text-muted-foreground">
                      데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
                    {machineGroupEntries.map(([machineNumber, rows]) => (
                      <React.Fragment key={machineNumber}>
                        <tr className={cn("border-t-2 border-border/80", getMachineAccent(machineNumber).headerBg)}>
                          <td colSpan={11} className="py-2 px-4 font-semibold text-sm">
                            기계번호: {machineNumber} ({rows.length}건)
                          </td>
                        </tr>
                        {rows.map((row) => (
                            <SortableRow
                              key={row.id}
                              row={row}
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
                            />
                        ))}
                      </React.Fragment>
                    ))}
                  </SortableContext>
                )}
              </tbody>
            </table>
          </div>
        </DndContext>
      </div>
    </div>
  );
}
