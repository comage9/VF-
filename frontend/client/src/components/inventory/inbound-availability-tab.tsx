import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import * as XLSX from 'xlsx';
import {
  calcInboundPeriodMetrics,
  resolveAvgDailyFromUnified,
} from '@/lib/inboundPeriodMetrics';

interface InboundOrderLine {
  id: string;
  barcode: string;
  orderNo: string;
  orderStatus: string;
  productName: string;
  productNo: string;
  orderedQty: number;
  confirmedQty: number;
  receivedQty: number;
  expectedDate: string | null;
}

interface InboundUploadInfo {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: string;
  rowsTotal: number;
  rowsParsed: number;
  rowsSkipped: number;
}

interface InboundPolicy {
  statusMode: 'exclude' | 'include';
  statuses: string[];
}

interface InventoryItem {
  barcode: string;
  productName?: string;
  /** 마스터/통합 재고 SKU (unified: skuId) */
  skuId?: string | null;
  category?: string;
  currentStock: number;
  minStock?: number | null;
  maxStock?: number | null;
  location?: string;
  /** 단가(원) — MasterSpec.price / unified */
  price?: number | null;
  avgDailyOutbound14d?: number;
  avgDailyOutbound30d?: number;
  avgDailyOutbound60d?: number;
  avgDailyOutbound90d?: number;
}

/** 발주 확정 < 발주 시 기본 납품부족 사유 */
const DEFAULT_SHORTAGE_REASON = "협력사 재고부족 - 수요예측 오류";

/** 납품부족 사유 선택 옵션 (업로드 양식 열 대응) */
const SHORTAGE_REASON_OPTIONS = [
  DEFAULT_SHORTAGE_REASON,
  "협력사 재고부족 - 생산 지연",
  "협력사 재고부족 - 원자재 수급 지연",
  "협력사 재고부족 - 품질 이슈",
  "협력사 생산능력 부족",
  "물류/배송 지연",
  "기타",
] as const;

export default function InboundAvailabilityTab() {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [policyStatuses, setPolicyStatuses] = useState<string[]>([]);
  const [policyMode, setPolicyMode] = useState<'exclude' | 'include'>('exclude');
  const [targetMode, setTargetMode] = useState<'min' | 'max'>(() => {
    try {
      const raw = window.localStorage.getItem('inboundTargetMode');
      return raw === 'max' ? 'max' : 'min';
    } catch {
      return 'min';
    }
  });

  /** 빠른 추가용 프리셋 (고정 제한 아님 — 아래 직접 입력으로 임의 일수 가능) */
  const PERIOD_PRESETS = [3, 4, 7, 10, 12, 14, 20, 30] as const;
  const [selectedPeriods, setSelectedPeriods] = useState<number[]>(() => {
    try {
      const raw = window.localStorage.getItem('inboundSelectedPeriods');
      if (raw) {
        const arr = JSON.parse(raw) as unknown;
        if (
          Array.isArray(arr) &&
          arr.length > 0 &&
          arr.every((n) => Number.isFinite(Number(n)) && Number(n) >= 1)
        ) {
          return [...new Set(arr.map((n) => Math.floor(Number(n))))].sort(
            (a, b) => a - b
          );
        }
      }
    } catch {
      // ignore
    }
    return [10];
  });
  const [customDaysInput, setCustomDaysInput] = useState('');
  /**
   * 업로드 발주서 물량 반영 비중 (%).
   * 확정/미입고 수량에 곱해 orderIn 상한으로 사용 (10·20·30·50·100 또는 직접 입력).
   */
  const [orderSharePercent, setOrderSharePercent] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem('inboundOrderSharePercent');
      const n = raw != null ? Number(raw) : 100;
      if (Number.isFinite(n) && n >= 0 && n <= 200) return Math.round(n * 10) / 10;
    } catch {
      // ignore
    }
    return 100;
  });
  const [customShareInput, setCustomShareInput] = useState('');
  const ORDER_SHARE_PRESETS = [10, 20, 30, 50, 100] as const;
  /** 단일 계산 폴백(엑셀 등)용 대표 일수 = 선택 중 첫 값 */
  const periodDays = selectedPeriods[0] ?? 10;
  /** 바코드 → 납품부족 사유 (수동 선택 유지) */
  const [shortageReasons, setShortageReasons] = useState<Map<string, string>>(
    () => new Map()
  );

  const clampDays = (raw: number) =>
    Math.max(1, Math.min(365, Math.floor(Number(raw) || 0)));

  const addPeriod = (days: number) => {
    const d = clampDays(days);
    if (!Number.isFinite(d) || d < 1) return;
    setSelectedPeriods((prev) =>
      prev.includes(d) ? prev : [...prev, d].sort((a, b) => a - b)
    );
  };

  const removePeriod = (days: number) => {
    setSelectedPeriods((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((d) => d !== days);
    });
  };

  const togglePeriod = (days: number) => {
    const d = clampDays(days);
    setSelectedPeriods((prev) => {
      if (prev.includes(d)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== d);
      }
      return [...prev, d].sort((a, b) => a - b);
    });
  };

  const handleAddCustomDays = () => {
    const n = parseInt(String(customDaysInput).trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      alert('1~365 사이의 일수를 입력하세요.');
      return;
    }
    addPeriod(n);
    setCustomDaysInput('');
  };

  const clampShare = (raw: number) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return 100;
    return Math.max(0, Math.min(200, Math.round(n * 10) / 10));
  };

  const handleSetShare = (raw: number) => {
    setOrderSharePercent(clampShare(raw));
  };

  const handleAddCustomShare = () => {
    const n = parseFloat(String(customShareInput).trim().replace(/%/g, ''));
    if (!Number.isFinite(n) || n < 0) {
      alert('0~200 사이의 비중(%)을 입력하세요.');
      return;
    }
    handleSetShare(n);
    setCustomShareInput('');
  };

  /** 발주 확정 수량에 반영 비중 적용 */
  const applyOrderShare = (qty: number): number => {
    const base = Math.max(0, Number(qty) || 0);
    const p = clampShare(orderSharePercent);
    if (p === 100) return base;
    return Math.max(0, Math.round((base * p) / 100));
  };

  // 0 수량 필터 토글 (true = 숨기기, false = 보기)
  const [hideZeroQty, setHideZeroQty] = useState<boolean>(true);
  // 계산법 도움말 토글
  const [showCalcHelp, setShowCalcHelp] = useState<boolean>(false);
  // 확정수량 수정 상태 (barcode -> 수정된 수량)
  const [editedQuantities, setEditedQuantities] = useState<Map<string, number>>(new Map());

  // 최신 입고 발주서 데이터 조회
  const { data: inboundData, isLoading: isLoadingInbound, refetch: refetchInbound } = useQuery<{
    success: boolean;
    data: InboundOrderLine[];
    uploadInfo: InboundUploadInfo | null;
  }>({
    queryKey: ['inbound-order-latest'],
    queryFn: async () => {
      const response = await fetch('/api/inventory/inbound/latest');
      if (!response.ok) {
        throw new Error('입고 발주서 데이터를 불러올 수 없습니다.');
      }
      return response.json();
    },
    staleTime: 60_000,
  });

  const clearLatestMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/inventory/inbound/latest', { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.text().catch(() => '');
        throw new Error(error || '초기화에 실패했습니다.');
      }
      return response.json();
    },
    onSuccess: () => {
      alert('최신 업로드 데이터가 초기화되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['inbound-order-latest'] });
    },
    onError: (error: any) => {
      console.error('초기화 오류:', error);
      alert(error?.message || '초기화 중 오류가 발생했습니다.');
    },
  });

  // 재고 데이터 조회 (현재고 가져오기 위함)
  const { data: inventoryData } = useQuery<{
    success: boolean;
    data: InventoryItem[];
  }>({
    queryKey: ['enhanced-inventory-overview'],
    queryFn: async () => {
      const response = await fetch('/api/inventory/unified');
      if (!response.ok) {
        throw new Error('재고 데이터를 불러올 수 없습니다.');
      }
      return response.json();
    },
    staleTime: 60_000,
  });

  // 정책 조회
  const { data: policyData, refetch: refetchPolicy } = useQuery<InboundPolicy>({
    queryKey: ['inbound-policy'],
    queryFn: async () => {
      const response = await fetch('/api/inventory/inbound/policy');
      if (!response.ok) {
        throw new Error('정책을 불러올 수 없습니다.');
      }
      return response.json();
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!policyData) return;
    setPolicyStatuses(policyData.statuses || []);
    setPolicyMode(policyData.statusMode || 'exclude');
  }, [policyData]);

  useEffect(() => {
    try {
      window.localStorage.setItem('inboundTargetMode', targetMode);
    } catch {
      // ignore
    }
  }, [targetMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'inboundSelectedPeriods',
        JSON.stringify(selectedPeriods)
      );
    } catch {
      // ignore
    }
  }, [selectedPeriods]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        'inboundOrderSharePercent',
        String(orderSharePercent)
      );
    } catch {
      // ignore
    }
  }, [orderSharePercent]);

  const inventoryItems = inventoryData?.data || [];
  const inventoryMap = useMemo(
    () =>
      new Map(
        inventoryItems.map((item) => [String(item.barcode || '').trim(), item])
      ),
    [inventoryItems]
  );

  /** 최근 30일 출고 매출 → 일평균 (전산 금액과 비교용) */
  const { data: recentSales } = useQuery<{
    totalSales: number;
    dayCount: number;
    avgDailySales: number;
    startDate: string;
    endDate: string;
  }>({
    queryKey: ['outbound-sales-avg-30d'],
    queryFn: async () => {
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 29);
      const pad = (n: number) => String(n).padStart(2, '0');
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const startDate = fmt(start);
      const endDate = fmt(end);
      const response = await fetch(
        `/api/outbound?startDate=${startDate}&endDate=${endDate}`
      );
      if (!response.ok) throw new Error('출고 매출을 불러올 수 없습니다.');
      const raw = await response.json();
      const rows: any[] = Array.isArray(raw)
        ? raw
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.results)
            ? raw.results
            : [];
      const byDay = new Map<string, number>();
      let totalSales = 0;
      for (const row of rows) {
        if (row?.is_estimated || row?.isEstimated) continue;
        const amt = Number(row?.sales_amount ?? row?.salesAmount ?? 0) || 0;
        if (amt <= 0) continue;
        const day = String(row?.outbound_date ?? row?.outboundDate ?? '').slice(
          0,
          10
        );
        if (!day) continue;
        totalSales += amt;
        byDay.set(day, (byDay.get(day) || 0) + amt);
      }
      const dayCount = byDay.size || 0;
      const avgDailySales = dayCount > 0 ? totalSales / dayCount : 0;
      return { totalSales, dayCount, avgDailySales, startDate, endDate };
    },
    staleTime: 5 * 60_000,
  });

  // 파일 업로드 mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/inventory/inbound/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || '업로드에 실패했습니다.');
      }

      return response.json();
    },
    onSuccess: (data: { message?: string }) => {
      alert(
        data?.message ||
          "입고 발주서가 저장되었습니다. 전산 재고에는 반영하지 않습니다."
      );
      setSelectedFile(null);
      setShortageReasons(new Map());
      refetchInbound();
      // 재고는 건드리지 않음 — unified 무효화 불필요
    },
    onError: (error: any) => {
      console.error('업로드 오류:', error);
      alert(error?.message || '업로드 중 오류가 발생했습니다.');
    },
  });

  // 정책 업데이트 mutation
  const policyMutation = useMutation({
    mutationFn: async (policy: InboundPolicy) => {
      const response = await fetch('/api/inventory/inbound/policy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(policy),
      });

      if (!response.ok) {
        throw new Error('정책 업데이트에 실패했습니다.');
      }

      return response.json();
    },
    onSuccess: () => {
      alert('정책이 업데이트되었습니다.');
      refetchPolicy();
      refetchInbound();
    },
    onError: (error: any) => {
      console.error('정책 업데이트 오류:', error);
      alert(error?.message || '정책 업데이트 중 오류가 발생했습니다.');
    },
  });

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
  };

  const handleUpload = () => {
    if (!selectedFile) {
      alert('파일을 선택해주세요.');
      return;
    }
    uploadMutation.mutate(selectedFile);
  };

  const handlePolicyUpdate = () => {
    policyMutation.mutate({
      statusMode: policyMode,
      statuses: policyStatuses,
    });
  };

  const handleStatusAdd = () => {
    const newStatus = prompt('추가할 발주 상태를 입력하세요:');
    if (newStatus && newStatus.trim()) {
      setPolicyStatuses([...policyStatuses, newStatus.trim()]);
    }
  };

  const handleStatusRemove = (status: string) => {
    setPolicyStatuses(policyStatuses.filter((s) => s !== status));
  };

  // 확정수량 수정 핸들러
  const handleConfirmedQtyChange = (barcode: string, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    setEditedQuantities((prev) => {
      const next = new Map(prev);
      next.set(barcode, num);
      return next;
    });
  };

  const inboundLines = inboundData?.data || [];
  const uploadInfo = inboundData?.uploadInfo;
  const hasInboundData = inboundLines.length > 0;

  // 표시할 발주 품목 (바코드 기준 중복 제거, 0 수량 필터)
  const visibleInboundLines = useMemo(() => {
    if (inboundLines.length === 0) return [];
    const seen = new Set<string>();
    return inboundLines.filter((line) => {
      const bc = String(line.barcode || '').trim();
      if (!bc || seen.has(bc)) return false;
      seen.add(bc);
      if (hideZeroQty) {
        const editedOrOriginal = editedQuantities.get(bc) ?? line.confirmedQty;
        if (editedOrOriginal === 0) return false;
      }
      return true;
    });
  }, [inboundLines, hideZeroQty, editedQuantities]);

  /**
   * 일평균 · hold · 입고가능/권장 — 스캐너와 동일 SoT
   * @see src/lib/inboundPeriodMetrics.ts
   */
  const getAvgDailyOutbound = (
    item: InventoryItem | undefined,
    lookbackDays: number = periodDays
  ): number => {
    if (!item) return 0;
    return resolveAvgDailyFromUnified(item, lookbackDays).avg;
  };

  /** 단가(원): 통합 재고 price 우선 */
  const getUnitPrice = (barcode: string): number => {
    const bc = String(barcode || "").trim();
    const p = Number(inventoryMap.get(bc)?.price ?? 0) || 0;
    return p > 0 ? p : 0;
  };

  /**
   * 납품부족 사유:
   * - 확정(또는 기간 입고가능) ≥ 발주 → 사유 없음
   * - 부족 시: 사용자가 선택한 값 유지, 미선택이면 기본값
   */
  const resolveShortageReason = (
    barcode: string,
    orderedQty: number,
    confirmedOrAvailable: number
  ): string => {
    const o = Math.max(0, Number(orderedQty) || 0);
    const c = Math.max(0, Number(confirmedOrAvailable) || 0);
    if (!(o > 0 && c < o)) return "";
    const bc = String(barcode || "").trim();
    const manual = (shortageReasons.get(bc) || "").trim();
    return manual || DEFAULT_SHORTAGE_REASON;
  };

  const handleShortageReasonChange = (barcode: string, reason: string) => {
    const bc = String(barcode || "").trim();
    if (!bc) return;
    setShortageReasons((prev) => {
      const next = new Map(prev);
      if (!reason) next.delete(bc);
      else next.set(bc, reason);
      return next;
    });
  };

  /** 발주서 있을 때: available = min(gap, 확정×반영비중) — 스캐너 공식 + 발주 비중 */
  const calcPeriodMetrics = (
    line: InboundOrderLine,
    days: number
  ): {
    holdQty: number;
    inboundAvailable: number;
    avgDaily: number;
    avgSource: string;
    currentStock: number;
    unitPrice: number;
    availableAmount: number;
    orderAmount: number;
    /** 비중 적용 전 확정(미입고) 상한 */
    baseOrderIn: number;
    /** 비중 적용 후 orderIn */
    effectiveOrderIn: number;
  } => {
    const bc = String(line.barcode || '').trim();
    const item = inventoryMap.get(bc);
    const qty = editedQuantities.get(bc) ?? line.confirmedQty;
    const isUnreceivedCsv = uploadInfo?.fileType === 'unreceived_csv';
    const baseOrderIn = isUnreceivedCsv
      ? Math.max(0, qty - line.receivedQty)
      : Math.max(0, qty);
    const orderIn = applyOrderShare(baseOrderIn);
    const m = calcInboundPeriodMetrics({
      currentStock: Number(item?.currentStock ?? 0) || 0,
      days,
      stockFields: item || null,
      orderIn,
    });
    const unitPrice = getUnitPrice(bc);
    const ordered = Math.max(0, Number(line.orderedQty) || 0);
    return {
      holdQty: m.hold,
      inboundAvailable: m.available,
      avgDaily: m.avg,
      avgSource: m.avgSource,
      currentStock: m.stock,
      unitPrice,
      availableAmount: m.available * unitPrice,
      orderAmount: ordered * unitPrice,
      baseOrderIn,
      effectiveOrderIn: orderIn,
    };
  };

  /** 발주서 없을 때: 권장 입고 = gap (확정 없음) */
  const calcStockBasedMetrics = (
    item: InventoryItem,
    days: number
  ): {
    holdQty: number;
    recommendedInbound: number;
    avgDaily: number;
    avgSource: string;
    currentStock: number;
  } => {
    const m = calcInboundPeriodMetrics({
      currentStock: Number(item.currentStock ?? 0) || 0,
      days,
      stockFields: item,
      orderIn: 0,
    });
    return {
      holdQty: m.hold,
      recommendedInbound: m.available,
      avgDaily: m.avg,
      avgSource: m.avgSource,
      currentStock: m.stock,
    };
  };

  /** 발주 없음 모드: 출고 이력(unified 평균) 있는 품목 · 권장 입고 내림차순 */
  const stockBasedRows = useMemo(() => {
    if (hasInboundData) return [] as Array<{ item: InventoryItem; barcode: string }>;
    const rows = inventoryItems
      .map((item) => {
        const barcode = String(item.barcode || '').trim();
        return { item, barcode };
      })
      .filter(({ item, barcode }) => {
        if (!barcode) return false;
        const avg14 = Number(item.avgDailyOutbound14d ?? 0) || 0;
        const avg30 = Number(item.avgDailyOutbound30d ?? 0) || 0;
        const avg60 = Number(item.avgDailyOutbound60d ?? 0) || 0;
        const avg90 = Number(item.avgDailyOutbound90d ?? 0) || 0;
        return avg14 > 0 || avg30 > 0 || avg60 > 0 || avg90 > 0;
      })
      .map(({ item, barcode }) => {
        const primary = calcStockBasedMetrics(item, periodDays);
        return { item, barcode, primary };
      })
      .filter(({ item, primary }) => {
        if (!hideZeroQty) return true;
        if (primary.recommendedInbound > 0) return true;
        return selectedPeriods.some((days) => {
          if (days === periodDays) return false;
          return calcStockBasedMetrics(item, days).recommendedInbound > 0;
        });
      })
      .sort((a, b) => b.primary.recommendedInbound - a.primary.recommendedInbound);

    return rows.map(({ item, barcode }) => ({ item, barcode }));
  }, [
    hasInboundData,
    inventoryItems,
    periodDays,
    selectedPeriods,
    hideZeroQty,
  ]);

  // 선택 일수별 합계 (발주 모드: 입고가능 수량·금액 / 재고 모드: 권장)
  const totalsByPeriod = useMemo(() => {
    const map = new Map<
      number,
      {
        hold: number;
        available: number;
        availableAmount: number;
        orderAmount: number;
        percent: number;
      }
    >();
    for (const days of selectedPeriods) {
      let hold = 0;
      let available = 0;
      let availableAmount = 0;
      let orderAmount = 0;
      if (hasInboundData) {
        for (const line of visibleInboundLines) {
          const m = calcPeriodMetrics(line, days);
          hold += m.holdQty;
          available += m.inboundAvailable;
          availableAmount += m.availableAmount;
          orderAmount += m.orderAmount;
        }
      } else {
        for (const { item } of stockBasedRows) {
          const m = calcStockBasedMetrics(item, days);
          hold += m.holdQty;
          available += m.recommendedInbound;
          const price = Number(item.price ?? 0) || 0;
          availableAmount += m.recommendedInbound * price;
        }
      }
      const percent =
        orderAmount > 0
          ? Math.round((availableAmount / orderAmount) * 1000) / 10
          : 0;
      map.set(days, { hold, available, availableAmount, orderAmount, percent });
    }
    return map;
  }, [
    hasInboundData,
    visibleInboundLines,
    stockBasedRows,
    selectedPeriods,
    editedQuantities,
    inventoryMap,
    uploadInfo?.fileType,
    orderSharePercent,
  ]);

  /**
   * 전산 금액 vs N일 목표(hold) vs 부족분(gap) — 일 매출과 비교용
   * (전체 unified 품목 기준, 발주 상한 없음)
   */
  const moneyCoverageByPeriod = useMemo(() => {
    const map = new Map<
      number,
      {
        stockValue: number;
        holdValue: number;
        gapValue: number;
        coveredValue: number;
        stockDays: number | null;
        holdDays: number | null;
        coveredDays: number | null;
      }
    >();
    const avgSales = recentSales?.avgDailySales ?? 0;
    for (const days of selectedPeriods) {
      let stockValue = 0;
      let holdValue = 0;
      let gapValue = 0;
      let coveredValue = 0;
      for (const item of inventoryItems) {
        const price = Number(item.price ?? 0) || 0;
        if (price <= 0) continue;
        const stock = Math.max(0, Number(item.currentStock ?? 0) || 0);
        const m = calcInboundPeriodMetrics({
          currentStock: stock,
          days,
          stockFields: item,
          orderIn: 0,
        });
        const hold = m.hold;
        const gap = m.gap;
        stockValue += stock * price;
        holdValue += hold * price;
        gapValue += gap * price;
        // 품목별 max(전산, hold) = 전산 + gap
        coveredValue += (stock + gap) * price;
      }
      const daysOrNull = (v: number) =>
        avgSales > 0 ? Math.round((v / avgSales) * 10) / 10 : null;
      map.set(days, {
        stockValue,
        holdValue,
        gapValue,
        coveredValue,
        stockDays: daysOrNull(stockValue),
        holdDays: daysOrNull(holdValue),
        coveredDays: daysOrNull(coveredValue),
      });
    }
    return map;
  }, [inventoryItems, selectedPeriods, recentSales?.avgDailySales]);

  /**
   * 업로드 발주서 양식(상품목록 시트 컬럼)으로 내보내기.
   * 확정수량 = 선택 기간의 입고 가능 수량.
   * 확정 < 발주 → 납품부족 사유 = 협력사 재고부족 - 수요예측 오류
   */
  const handleExportUploadFormat = (days: number) => {
    if (!hasInboundData || visibleInboundLines.length === 0) {
      alert("내보낼 발주 데이터가 없습니다.");
      return;
    }
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rows = visibleInboundLines.map((line) => {
      const bc = String(line.barcode || "").trim();
      const m = calcPeriodMetrics(line, days);
      const confirmedExport = m.inboundAvailable;
      const shortage = resolveShortageReason(
        bc,
        line.orderedQty,
        confirmedExport
      );
      return {
        발주번호: line.orderNo || "",
        발주상태: line.orderStatus || "",
        상품바코드: bc,
        상품이름: line.productName || "",
        상품번호: line.productNo || "",
        발주수량: line.orderedQty,
        확정수량: confirmedExport,
        입고예정일: line.expectedDate
          ? String(line.expectedDate).slice(0, 10)
          : "",
        단가: m.unitPrice,
        발주금액: m.orderAmount,
        입고가능금액: m.availableAmount,
        "납품부족 사유 선택": shortage,
        [`${days}일보유`]: m.holdQty,
        [`${days}일입고가능`]: m.inboundAvailable,
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "상품목록");
    XLSX.writeFile(
      workbook,
      `PO_FOR_CONFIRM_${days}일_입고가능_${today}.xlsx`
    );
  };

  // Excel 내보내기 (발주 모드 · 재고 기반 추천 모드)
  const handleExportExcel = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    if (hasInboundData) {
      if (visibleInboundLines.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
      }
      // 업로드 양식 호환 다운로드 (대표 선택 기간 = periodDays)
      handleExportUploadFormat(periodDays);
      return;
    }

    // 재고 기반 추천 모드
    if (stockBasedRows.length === 0) {
      alert('내보낼 데이터가 없습니다. (출고 이력이 있는 품목이 없음)');
      return;
    }
    const rows = stockBasedRows.map(({ item, barcode }) => {
      const primary = calcStockBasedMetrics(item, periodDays);
      const row: Record<string, string | number> = {
        상품명: item.productName || '-',
        SKU: (item.skuId || '').toString().trim() || '-',
        상품바코드: barcode,
        전산재고: primary.currentStock,
        일평균출고: Math.round(primary.avgDaily),
        로케이션: item.location || '',
      };
      for (const days of selectedPeriods) {
        const m = calcStockBasedMetrics(item, days);
        row[`${days}일보유목표`] = m.holdQty;
        row[`${days}일입고권장`] = m.recommendedInbound;
      }
      return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '재고기반_입고권장');
    XLSX.writeFile(workbook, `재고기반_입고권장_${today}.xlsx`);
  };

  const BarcodeCell = React.memo(function BarcodeCell({ value }: { value: string }) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const displayValue = String(value || '').trim();

    useEffect(() => {
      if (!svgRef.current) return;
      if (!displayValue) {
        while (svgRef.current.firstChild) svgRef.current.removeChild(svgRef.current.firstChild);
        return;
      }

      try {
        JsBarcode(svgRef.current, displayValue, {
          format: 'CODE128',
          displayValue: false,
          margin: 0,
          height: 31,
          width: 1.26,
        });
      } catch (e) {
        // ignore rendering errors
      }
    }, [displayValue]);

    return (
      <div className="flex flex-col items-center gap-1">
        <svg ref={svgRef} className="h-8 w-[190px]" />
        <div className="text-[11px] text-gray-700 font-mono text-center">{displayValue || '-'}</div>
      </div>
    );
  });

  return (
    <div className="space-y-6">
      {/* 업로드 섹션 */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📥 입고 발주서 업로드</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              파일 선택 <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              지원 파일: VF 발주서·PO_FOR_CONFIRM.xlsx, 발주서 미입고 물량.csv
              <br />
              <span className="text-xs text-indigo-700">
                발주서는 입고 가능 계산용만 저장합니다. 전산 재고에는 반영하지 않습니다
                (재고 = 스냅샷 + 입고 데이터 업로드 − 출고).
              </span>
            </p>
          </div>

          <div>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploadMutation.isPending}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploadMutation.isPending ? '업로드 중...' : '업로드'}
            </button>
          </div>
        </div>

        {selectedFile && (
          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-gray-600">
              선택된 파일: <span className="font-medium">{selectedFile.name}</span>
              ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          </div>
        )}

        {uploadInfo && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
            <div className="flex items-start justify-between gap-4">
              <h4 className="font-medium text-green-900 mb-2">최신 업로드 정보</h4>
              <button
                onClick={() => {
                  if (!window.confirm('최신 업로드 데이터를 초기화(삭제)하시겠습니까?')) return;
                  clearLatestMutation.mutate();
                }}
                disabled={clearLatestMutation.isPending}
                className="text-sm text-red-700 bg-white border border-red-200 px-3 py-1.5 rounded-md hover:bg-red-50"
              >
                {clearLatestMutation.isPending ? '초기화 중...' : '데이터 초기화'}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <span className="text-gray-600">파일명:</span>
                <div className="font-medium text-gray-900">{uploadInfo.fileName}</div>
              </div>
              <div>
                <span className="text-gray-600">파일 타입:</span>
                <div className="font-medium text-gray-900">
                  {uploadInfo.fileType === 'vf_xlsx' ? 'VF 발주서' : '미입고 물량'}
                </div>
              </div>
              <div>
                <span className="text-gray-600">업로드일:</span>
                <div className="font-medium text-gray-900">
                  {new Date(uploadInfo.uploadedAt).toLocaleString('ko-KR')}
                </div>
              </div>
              <div>
                <span className="text-gray-600">처리 건수:</span>
                <div className="font-medium text-gray-900">
                  {uploadInfo.rowsParsed}건 (스킵: {uploadInfo.rowsSkipped}건)
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 정책 설정 */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">⚙️ 발주 상태 필터링 정책</h3>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="policyMode"
                value="exclude"
                checked={policyMode === 'exclude'}
                onChange={() => setPolicyMode('exclude')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">제외 (exclude)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="policyMode"
                value="include"
                checked={policyMode === 'include'}
                onChange={() => setPolicyMode('include')}
                className="w-4 h-4 text-blue-600"
              />
              <span className="text-sm text-gray-700">포함 (include)</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              발주 상태 목록
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {policyStatuses.map((status) => (
                <span
                  key={status}
                  className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"
                >
                  {status}
                  <button
                    onClick={() => handleStatusRemove(status)}
                    className="ml-1 text-gray-500 hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <button
              onClick={handleStatusAdd}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              + 상태 추가
            </button>
          </div>

          <button
            onClick={handlePolicyUpdate}
            disabled={policyMutation.isPending}
            className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {policyMutation.isPending ? '저장 중...' : '정책 저장'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          🎯 보유 일수 · 발주 비중
        </h3>

        <div className="space-y-5">
          {/* ── 일수 자유 선택 ── */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              보유·입고 가능 기준 일수 (자유 입력 · 복수 선택)
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              {PERIOD_PRESETS.map((days) => {
                const on = selectedPeriods.includes(days);
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => togglePeriod(days)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      on
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {days}일
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1}
                max={365}
                value={customDaysInput}
                onChange={(e) => setCustomDaysInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomDays();
                  }
                }}
                placeholder="예: 5, 18, 45…"
                className="w-36 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddCustomDays}
                className="px-3 py-1.5 rounded-md text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
              >
                일수 추가
              </button>
              <span className="text-xs text-gray-500">1~365일 · 프리셋 외 임의 일수 가능</span>
            </div>
            {selectedPeriods.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 items-center pt-1">
                <span className="text-xs text-gray-500 mr-1">선택됨:</span>
                {selectedPeriods.map((days) => (
                  <span
                    key={`sel-${days}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200"
                  >
                    {days}일
                    <button
                      type="button"
                      onClick={() => removePeriod(days)}
                      disabled={selectedPeriods.length <= 1}
                      className="text-blue-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed leading-none"
                      title={
                        selectedPeriods.length <= 1
                          ? '최소 1개 일수는 유지'
                          : '제거'
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-gray-500">
              선택 일수마다 <b>N일 보유</b>(일평균출고×N) ·{' '}
              {hasInboundData ? (
                <>
                  <b>N일 입고 가능</b>(확정×반영비중 상한) 열을 표시합니다.
                </>
              ) : (
                <>
                  <b>N일 입고 권장</b>(목표−전산, 부족분) 열을 표시합니다. 발주서
                  업로드 시 입고 가능 모드로 전환됩니다.
                </>
              )}{' '}
              전산 재고는 공통으로 표시됩니다.
            </p>
          </div>

          {/* ── 발주 파일 반영 비중 ── */}
          {hasInboundData ? (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700">
                발주서 물량 반영 비중
                <span className="ml-2 text-indigo-700 font-bold tabular-nums">
                  {orderSharePercent}%
                </span>
              </label>
              <p className="text-xs text-gray-500">
                업로드한 확정(또는 미입고) 수량에 이 비중을 곱한 값이{' '}
                <b>입고 가능 상한</b>이 됩니다. 예: 발주 확정 100 · 비중 30% →
                상한 30.
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                {ORDER_SHARE_PRESETS.map((p) => {
                  const on = orderSharePercent === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleSetShare(p)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        on
                          ? 'bg-violet-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {p}%
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={200}
                  step={1}
                  value={customShareInput}
                  onChange={(e) => setCustomShareInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomShare();
                    }
                  }}
                  placeholder="예: 15, 35, 75…"
                  className="w-36 px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                  type="button"
                  onClick={handleAddCustomShare}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-violet-600 text-white hover:bg-violet-700"
                >
                  비중 적용
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.min(100, Math.max(0, orderSharePercent))}
                  onChange={(e) => handleSetShare(Number(e.target.value))}
                  className="w-40 accent-violet-600"
                  title="0~100% 슬라이더 (200%까지는 숫자 입력)"
                />
                <span className="text-xs text-gray-500">0~200% (직접 입력)</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 입고 가능/권장 수량 요약 — 선택 일수별 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          📊 선택 일수별 {hasInboundData ? '입고 가능' : '입고 권장'} 요약
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {hasInboundData
            ? '전산 재고 대비 N일 보유 목표 · 발주 확정수량 범위 내 입고 가능'
            : '전산 재고 대비 N일 보유 목표 · 부족분(권장 입고). 발주서 없음 · 출고 이력 품목 기준'}
        </p>

        {/* 금액 커버리지 — 일 매출 vs 전산/hold/gap */}
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-left">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <h4 className="text-sm font-bold text-amber-900">
              💰 금액 커버리지 (전체 전산 품목 · 발주 상한 없음)
            </h4>
            <div className="text-xs text-amber-800">
              {recentSales && recentSales.avgDailySales > 0 ? (
                <>
                  최근 {recentSales.dayCount}일 일평균 매출{' '}
                  <span className="font-bold text-amber-950">
                    ₩{Math.round(recentSales.avgDailySales).toLocaleString()}
                  </span>
                  <span className="text-amber-700/80 ml-1">
                    ({recentSales.startDate} ~ {recentSales.endDate})
                  </span>
                </>
              ) : (
                <span className="text-amber-700">출고 매출 집계 중 또는 없음</span>
              )}
            </div>
          </div>
          <p className="text-xs text-amber-900/80 mb-3">
            「입고 가능 ₩」은 <b>부족분(gap)</b>만입니다. 30일 매출(~3억)과 맞출 때는{' '}
            <b>N일 보유 목표(hold) 금액</b> 또는 <b>전산+gap</b>을 보세요. 단가=MasterSpec ·
            매출=출고 sales_amount.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {selectedPeriods.map((days) => {
              const c = moneyCoverageByPeriod.get(days);
              const avg = recentSales?.avgDailySales ?? 0;
              return (
                <div
                  key={`money-${days}`}
                  className="bg-white rounded-lg border border-amber-100 p-3 text-xs text-gray-700 space-y-1.5"
                >
                  <div className="font-semibold text-amber-900 text-sm mb-1">
                    {days}일 목표 기준
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">전산 재고 금액</span>
                    <span className="font-medium tabular-nums">
                      ₩{Math.round(c?.stockValue ?? 0).toLocaleString()}
                      {c?.stockDays != null ? (
                        <span className="text-gray-400 ml-1">(~{c.stockDays}일)</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">{days}일 hold 금액</span>
                    <span className="font-medium tabular-nums text-indigo-700">
                      ₩{Math.round(c?.holdValue ?? 0).toLocaleString()}
                      {c?.holdDays != null ? (
                        <span className="text-gray-400 ml-1">(~{c.holdDays}일)</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">부족분 gap 금액</span>
                    <span className="font-medium tabular-nums text-orange-700">
                      ₩{Math.round(c?.gapValue ?? 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 pt-1 border-t border-amber-50">
                    <span className="text-gray-600 font-medium">전산 + gap</span>
                    <span className="font-bold tabular-nums text-emerald-800">
                      ₩{Math.round(c?.coveredValue ?? 0).toLocaleString()}
                      {c?.coveredDays != null ? (
                        <span className="text-gray-400 font-normal ml-1">
                          (~{c.coveredDays}일)
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {avg > 0 && days > 0 ? (
                    <div className="text-[11px] text-gray-400 pt-0.5">
                      참고: 일매출×{days} ≈ ₩
                      {Math.round(avg * days).toLocaleString()}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {hasInboundData && orderSharePercent !== 100 ? (
          <p className="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-md px-3 py-2 mb-3">
            발주 반영 비중 <b>{orderSharePercent}%</b> 적용 중 — 확정 수량의{' '}
            {orderSharePercent}%만 입고 가능 상한으로 사용합니다.
          </p>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
          {selectedPeriods.map((days) => {
            const t = totalsByPeriod.get(days);
            return (
              <div
                key={days}
                className="bg-white rounded-lg border border-blue-100 p-4 text-center"
              >
                <div className="text-xs font-medium text-gray-500 mb-1">{days}일 기준</div>
                <div className="text-2xl font-bold text-blue-600">
                  {(t?.available ?? 0).toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {hasInboundData ? '입고 가능 합계 (수량)' : '권장 입고 합계 (수량)'}
                </div>
                <div className="text-sm font-semibold text-emerald-700 mt-2">
                  ₩{(t?.availableAmount ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {hasInboundData
                    ? `발주 상한(×${orderSharePercent}%) · 부족분만`
                    : '부족분(gap) 금액 · 전산 미포함'}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  보유 합 {(t?.hold ?? 0).toLocaleString()}
                </div>
                {hasInboundData && (t?.orderAmount ?? 0) > 0 ? (
                  <div className="mt-2 pt-2 border-t border-blue-50 text-xs text-gray-600">
                    발주금액 ₩{(t?.orderAmount ?? 0).toLocaleString()}
                    <br />
                    <span className="text-indigo-700 font-bold text-sm">
                      입고 비중 {(t?.percent ?? 0).toLocaleString()}%
                    </span>
                    <div className="text-[10px] text-gray-400 mt-0.5 font-normal">
                      = 입고가능금액 ÷ 발주금액
                      {orderSharePercent !== 100
                        ? ` (상한에 비중 ${orderSharePercent}% 반영)`
                        : ''}
                    </div>
                  </div>
                ) : null}
                {hasInboundData ? (
                  <button
                    type="button"
                    onClick={() => handleExportUploadFormat(days)}
                    className="mt-3 w-full text-xs bg-green-600 text-white py-1.5 px-2 rounded-md hover:bg-green-700"
                  >
                    {days}일 양식 다운로드
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {/* 계산법 도움말 팝업 */}
        {showCalcHelp && (
          <div className="mb-4 p-4 bg-white border border-blue-200 rounded-lg text-left text-sm">
            <h4 className="font-bold text-blue-800 mb-2">📖 기간 수량·금액 계산 (스캐너와 동일)</h4>
            <ol className="list-decimal list-inside space-y-1 text-gray-700">
              <li>
                <b>일평균(박스):</b> 최근 <b>90일(≈3개월)</b> 출고 합 ÷ 90 을 기본 속도.
                14일(없으면 30일) 평균이 3개월보다 <b>높으면</b> 급증분×40% 가산
                (source: 90d 또는 90d+surge). 폴백: 60→30→14
              </li>
              <li>
                <b>N일 보유(hold):</b> round(일평균 × N). 아주 작은 값(raw &lt; 0.5)은 0
              </li>
              <li>
                <b>부족분(gap):</b> max(0, hold − 전산재고). 「입고 가능 ₩」= gap×단가(발주 시 상한)
              </li>
              <li>
                <b>발주 반영 비중:</b> orderIn = round(확정×비중%). 입고가능 = min(gap, orderIn)
              </li>
              <li>
                <b>입고 비중 %:</b> 입고가능금액 ÷ 발주금액. 일수에 비례하지 않음
                (재고가 버텨 주는 동안 gap=0 → N이 커지면 한꺼번에 gap이 열림)
              </li>
              <li>
                <b>금액 커버리지:</b> 전산 ₩ · hold ₩ · gap ₩ · (전산+gap) ₩ 을 일평균 매출과 비교
              </li>
            </ol>
            <p className="mt-2 text-gray-500 text-xs">
              SoT: <code>src/lib/inboundPeriodMetrics.ts</code> · 스캐너{' '}
              <code>public/js/inbound-period-metrics.js</code>
            </p>
          </div>
        )}
        {/* 입고 가능 수량 합계 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              {hideZeroQty ? '0 수량 숨기기' : '0 수량 보기'}
            </span>
            <button
              onClick={() => setHideZeroQty((v) => !v)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                hideZeroQty
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {hideZeroQty ? '0 수량 보기' : '0 수량 숨기기'}
            </button>
          </div>
          <button
            onClick={handleExportExcel}
            className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 text-sm font-medium"
          >
            {hasInboundData
              ? `📥 업로드 양식 다운로드 (${periodDays}일 입고가능→확정)`
              : '📥 입고권장 엑셀로 내보내기'}
          </button>
        </div>
      </div>

      {/* 데이터 테이블: 발주 있음 / 재고 기반 추천 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {hasInboundData
              ? '📋 입고 발주서 · 전산 재고 · 일수별 보유/입고 가능'
              : '📋 재고 기반 추천 · 일수별 보유 목표 / 입고 권장'}
          </h3>
          {hasInboundData && visibleInboundLines.length > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              전체 발주 품목 (총 {visibleInboundLines.length}개) · 선택 일수:{' '}
              {selectedPeriods.map((d) => `${d}일`).join(', ')}
            </p>
          )}
          {!hasInboundData && stockBasedRows.length > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              출고 이력 품목 (총 {stockBasedRows.length}개) · 선택 일수:{' '}
              {selectedPeriods.map((d) => `${d}일`).join(', ')} · 정렬: 권장 입고 내림차순
            </p>
          )}
        </div>

        {isLoadingInbound ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-2 text-gray-600">데이터 로딩 중...</p>
          </div>
        ) : hasInboundData && visibleInboundLines.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            표시할 발주 품목이 없습니다. (0 수량 숨김 설정을 확인해 주세요)
          </div>
        ) : hasInboundData ? (
          <div className="overflow-x-auto min-w-[1200px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[180px]">상품명</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[90px]">SKU</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[80px]">전산 재고</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[88px]">
                    일평균 출고
                    <div className="text-[10px] font-normal text-gray-500">
                      3개월 기준
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCalcHelp((v) => !v)}
                      title="계산법 도움말"
                      className="ml-1 text-blue-500 hover:text-blue-700 text-xs align-middle"
                    >
                      ?
                    </button>
                  </th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[70px]">
                    단가
                  </th>
                  {selectedPeriods.map((days) => (
                    <React.Fragment key={`h-${days}`}>
                      <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[72px] bg-amber-50">
                        {days}일 보유
                      </th>
                      <th className="px-3 py-3 text-right font-medium text-blue-800 min-w-[80px] bg-blue-50">
                        {days}일 입고 가능
                      </th>
                      <th className="px-3 py-3 text-right font-medium text-emerald-800 min-w-[88px] bg-emerald-50">
                        {days}일 금액
                      </th>
                    </React.Fragment>
                  ))}
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[80px]">발주<br/>수량</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[80px]">발주<br/>금액</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[110px]">확정수량<br/><span className="text-xs font-normal text-gray-500">(수정가능)</span></th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[220px]">
                    납품부족 사유 선택
                    <div className="text-[10px] font-normal text-gray-500">
                      확정&lt;발주 시 기본: 수요예측 오류
                    </div>
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[200px]">상품바코드</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[90px]">입고예정일</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[80px]">발주상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleInboundLines.map((line) => {
                  const primary = calcPeriodMetrics(line, periodDays);
                  const bc = String(line.barcode || '').trim();
                  const sku =
                    (line.productNo || inventoryMap.get(bc)?.skuId || '').toString().trim() ||
                    '-';
                  const confirmed =
                    editedQuantities.get(bc) ?? line.confirmedQty;
                  const needsShortage =
                    line.orderedQty > 0 && confirmed < line.orderedQty;
                  const shortage = resolveShortageReason(
                    bc,
                    line.orderedQty,
                    confirmed
                  );
                  return (
                    <tr key={line.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-gray-900 text-xs">{line.productName || '-'}</td>
                      <td className="px-3 py-3 text-gray-700 text-xs font-mono">{sku}</td>
                      <td className="px-3 py-3 text-right text-gray-900 font-medium">
                        {primary.currentStock.toLocaleString()}
                      </td>
                      <td
                        className="px-3 py-3 text-right text-gray-600"
                        title={
                          primary.avgSource
                            ? `일평균 출처: ${primary.avgSource}`
                            : undefined
                        }
                      >
                        {primary.avgDaily > 0
                          ? primary.avgDaily.toLocaleString(undefined, {
                              maximumFractionDigits: 1,
                            })
                          : '0'}
                        {primary.avgSource.includes('surge') ? (
                          <div className="text-[10px] text-orange-600 font-medium">
                            급증가중
                          </div>
                        ) : primary.avgSource ? (
                          <div className="text-[10px] text-gray-400">
                            {primary.avgSource}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-700 text-xs">
                        {primary.unitPrice > 0
                          ? primary.unitPrice.toLocaleString()
                          : "-"}
                      </td>
                      {selectedPeriods.map((days) => {
                        const m = calcPeriodMetrics(line, days);
                        return (
                          <React.Fragment key={`${line.id}-${days}`}>
                            <td className="px-3 py-3 text-right text-gray-900 bg-amber-50/60">
                              {m.holdQty.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right font-bold text-blue-700 bg-blue-50">
                              {m.inboundAvailable > 0 ? m.inboundAvailable.toLocaleString() : '0'}
                            </td>
                            <td className="px-3 py-3 text-right text-emerald-800 bg-emerald-50/80 text-xs font-semibold">
                              {m.unitPrice > 0
                                ? `₩${m.availableAmount.toLocaleString()}`
                                : "-"}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      <td className="px-3 py-3 text-right text-gray-600">{line.orderedQty.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-gray-700 text-xs">
                        {primary.unitPrice > 0
                          ? `₩${primary.orderAmount.toLocaleString()}`
                          : "-"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          value={confirmed}
                          onChange={(e) => handleConfirmedQtyChange(String(line.barcode || '').trim(), e.target.value)}
                          className="w-20 px-2 py-1 text-right border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-3 text-xs min-w-[200px]">
                        {needsShortage ? (
                          <select
                            value={shortage}
                            onChange={(e) =>
                              handleShortageReasonChange(bc, e.target.value)
                            }
                            className="w-full max-w-[240px] px-2 py-1.5 border border-amber-300 rounded-md text-xs bg-amber-50 text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
                            title="납품부족 사유 선택"
                          >
                            {SHORTAGE_REASON_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-900"><BarcodeCell value={line.barcode} /></td>
                      <td className="px-3 py-3 text-gray-600 text-xs">
                        {line.expectedDate ? new Date(line.expectedDate).toLocaleDateString('ko-KR') : '-'}
                      </td>
                      <td className="px-3 py-3 text-gray-600 text-xs">{line.orderStatus || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : stockBasedRows.length === 0 ? (
          <div className="text-center py-8 text-gray-500 space-y-2">
            <p>표시할 출고 이력 품목이 없습니다.</p>
            <p className="text-sm">
              발주서를 업로드하거나, 재고·출고 데이터 동기화 후 다시 확인해 주세요.
              {hideZeroQty ? ' (0 수량 숨김이 켜져 있으면 권장 입고 0인 품목은 숨겨집니다)' : ''}
            </p>
          </div>
        ) : (
          <div>
            <div className="mx-4 mt-4 mb-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
              업로드된 발주서가 없습니다. 품목별 재고와 출고 속도를 기준으로{' '}
              <b>{selectedPeriods.map((d) => `${d}일`).join('/')}</b> 보유 목표량과{' '}
              <b>권장 입고량(부족분)</b>을 표시합니다. 확정 상한 없음 · 추정값입니다.
            </div>
            <div className="overflow-x-auto min-w-[900px]">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[180px]">상품명</th>
                    <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[90px]">SKU</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[80px]">현재재고</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[88px]">
                      일평균 출고
                      <div className="text-[10px] font-normal text-gray-500">
                        3개월 기준
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCalcHelp((v) => !v)}
                        title="계산법 도움말"
                        className="ml-1 text-blue-500 hover:text-blue-700 text-xs align-middle"
                      >
                        ?
                      </button>
                    </th>
                    {selectedPeriods.map((days) => (
                      <React.Fragment key={`sh-${days}`}>
                        <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[72px] bg-amber-50">
                          {days}일 보유
                        </th>
                        <th className="px-3 py-3 text-right font-medium text-blue-800 min-w-[88px] bg-blue-50">
                          {days}일 입고권장
                        </th>
                      </React.Fragment>
                    ))}
                    <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[200px]">상품바코드</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {stockBasedRows.map(({ item, barcode }) => {
                    const primary = calcStockBasedMetrics(item, periodDays);
                    const sku = (item.skuId || '').toString().trim() || '-';
                    return (
                      <tr key={barcode} className="hover:bg-gray-50">
                        <td className="px-3 py-3 text-gray-900 text-xs">
                          {item.productName || '-'}
                        </td>
                        <td className="px-3 py-3 text-gray-700 text-xs font-mono">{sku}</td>
                        <td className="px-3 py-3 text-right text-gray-900 font-medium">
                          {primary.currentStock.toLocaleString()}
                        </td>
                        <td
                          className="px-3 py-3 text-right text-gray-600"
                          title={
                            primary.avgSource
                              ? `일평균 출처: ${primary.avgSource}`
                              : undefined
                          }
                        >
                          {primary.avgDaily > 0
                            ? primary.avgDaily.toLocaleString(undefined, {
                                maximumFractionDigits: 1,
                              })
                            : '0'}
                          {primary.avgSource.includes('surge') ? (
                            <div className="text-[10px] text-orange-600 font-medium">
                              급증가중
                            </div>
                          ) : primary.avgSource ? (
                            <div className="text-[10px] text-gray-400">
                              {primary.avgSource}
                            </div>
                          ) : null}
                        </td>
                        {selectedPeriods.map((days) => {
                          const m = calcStockBasedMetrics(item, days);
                          return (
                            <React.Fragment key={`${barcode}-${days}`}>
                              <td className="px-3 py-3 text-right text-gray-900 bg-amber-50/60">
                                {m.holdQty.toLocaleString()}
                              </td>
                              <td className="px-3 py-3 text-right font-bold text-blue-700 bg-blue-50">
                                {m.recommendedInbound > 0
                                  ? m.recommendedInbound.toLocaleString()
                                  : '0'}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="px-3 py-3 text-gray-900">
                          <BarcodeCell value={barcode} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
