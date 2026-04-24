import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import * as XLSX from 'xlsx';

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
  currentStock: number;
  minStock?: number | null;
  maxStock?: number | null;
  location?: string;
  avgDailyOutbound14d?: number;
  avgDailyOutbound30d?: number;
}

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

  // 기간 선택 (3, 7, 10, 14, 30일)
  const [periodDays, setPeriodDays] = useState<number>(10);

  // 일별 출고 데이터 조회 (Enhanced 가중치 계산용)
  const { data: outboundDailyData } = useQuery<{
    success: boolean;
    data: Array<{
      barcode: string;
      productName: string;
      category: string;
      dailyData: Array<{ date: string; quantity: number }>;
      totalOutbound: number;
      avgDaily: number;
    }>;
    summary: { totalRecords: number; totalBarcodes: number };
  }>({
    queryKey: ['outbound-barcode-daily', 60],
    queryFn: async () => {
      const response = await fetch('/api/outbound/barcode-daily?days=60');
      if (!response.ok) throw new Error('일별 출고 데이터를 불러올 수 없습니다.');
      return response.json();
    },
    staleTime: 5 * 60_000, // 5분
  });


  // 일별 출고 데이터 맵 (바코드 기반, last 60days)
  const outboundDailyMap = useMemo(() => {
    const map = new Map<string, Array<{ date: string; quantity: number }>>();
    const data = outboundDailyData?.data || [];
    for (const item of data) {
      const bc = (item.barcode || '').trim();
      if (bc) map.set(bc, item.dailyData || []);
    }
    return map;
  }, [outboundDailyData]);

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

  const inventoryItems = inventoryData?.data || [];
  const inventoryMap = useMemo(() => new Map(inventoryItems.map((item) => [item.barcode, item])), [inventoryItems]);

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
    onSuccess: () => {
      alert('입고 발주서 파일이 업로드되었습니다.');
      setSelectedFile(null);
      refetchInbound();
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

  // Excel 내보내기 핸들러
  const handleExportExcel = () => {
    if (visibleInboundLines.length === 0) {
      alert('내보낼 데이터가 없습니다.');
      return;
    }

    const rows = visibleInboundLines.map((line) => {
      const bc = String(line.barcode || '').trim();
      const editedQty = editedQuantities.get(bc) ?? line.confirmedQty;
      const item = inventoryMap.get(bc);
      const currentStock = Number(item?.currentStock ?? 0) || 0;
      const avgDailyOutbound = getAvgDailyOutbound(item);
      const targetStock = avgDailyOutbound * periodDays;
      const recommendedQty = (() => {
        // per-row direct calculation instead of aggregated map (for Excel export)
        const bc = String(line.barcode || '').trim();
        const item = inventoryMap.get(bc);
        const currentStock = Number(item?.currentStock ?? 0) || 0;
        const avgDailyOutbound = getAvgDailyOutbound(item);
        const targetStock = avgDailyOutbound * periodDays;
        const confirmedQty = line.confirmedQty;
        const isUnreceivedCsv = uploadInfo?.fileType === 'unreceived_csv';
        const base = isUnreceivedCsv
          ? Math.max(0, (confirmedQty - line.receivedQty))
          : Math.max(0, confirmedQty);
        const needToTarget = Math.max(0, targetStock - (currentStock + base));
        return Math.floor(Math.min(base, needToTarget));
      })();

      return {
        '상품명': line.productName || '-',
        '상품바코드': bc,
        '상대방 발주수량': line.orderedQty,
        '확정수량': editedQty,
        '평균일일출고': avgDailyOutbound,
        [`목표재고(${periodDays}일)`]: Math.round(targetStock),
        '현재고': currentStock,
        '추천확정수량': recommendedQty,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '발주서 검토');


    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `발주서_검토_${today}.xlsx`;
    XLSX.writeFile(workbook, filename);
  };

  const inboundLines = inboundData?.data || [];
  const uploadInfo = inboundData?.uploadInfo;

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

  // Enhanced 평균일일출고 계산 (이중 가중치)
  const calcEnhancedAvgDaily = (barcode: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    

    // 선택기간 종료일 = 오늘, 시작일 = 오늘 - (periodDays - 1)
    const endDate = new Date(today);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (periodDays - 1));

    // 월초 포함 여부 체크 (1일~5일)
    const startMonth = startDate.getMonth();
    const startYear = startDate.getFullYear();
    
    

    let includesMonthStart = false;
    const ms = new Date(startYear, startMonth, 1);
    const me = new Date(startYear, startMonth, 5);
    if (ms <= endDate && me >= startDate) includesMonthStart = true;

    const dailyData = outboundDailyMap.get(barcode) || [];

    // 1) 이전달 전체 데이터
    let prevMonthTotal = 0;
    let prevMonthDays = 0;
    if (includesMonthStart) {
      const prevMonth = new Date(startYear, startMonth, 0); // 이전달 마지막일
      
      for (const d of dailyData) {
        const dd = new Date(d.date);
        if (dd.getFullYear() === prevMonth.getFullYear() && dd.getMonth() === prevMonth.getMonth()) {
          prevMonthTotal += d.quantity;
          prevMonthDays += 1;
        }
      }
    }

    // 2) 선택기간 데이터 (최종 7일 가중치 1.5, 예전 7일 가중치 1.0, 미만 전체 1.5)
    let weightedSum = 0;
    let weightSum = 0;
    const periodData = dailyData.filter((d) => {
      const dd = new Date(d.date);
      return dd >= startDate && dd <= endDate;
    });
    const totalDays = periodData.length;

    if (totalDays === 0) return 0;

    if (totalDays >= 7) {
      // 최신 7일: 가중치 1.5, 예전 7일: 가중치 1.0
      const recentData = periodData.slice(-7);
      const olderData = periodData.slice(0, -7);
      for (const d of olderData) {
        weightedSum += d.quantity * 1.0;
        weightSum += 1 * 1.0;
      }
      for (const d of recentData) {
        weightedSum += d.quantity * 1.5;
        weightSum += 1 * 1.5;
      }
    } else {
      // 7일 미만: 전체 가중치 1.5
      for (const d of periodData) {
        weightedSum += d.quantity * 1.5;
        weightSum += 1 * 1.5;
      }
    }

    // 최종 가중치 합산
    const prevWeighted = prevMonthTotal * 1.0;
    const prevWeight = prevMonthDays * 1.0;

    if (weightSum + prevWeight === 0) return 0;
    return Math.round((weightedSum + prevWeighted) / (weightSum + prevWeight));
  };

  // 기간별 평균 일일 출고량 계산 (정수 반환, Enhanced 우선)
  const getAvgDailyOutbound = (item: InventoryItem | undefined): number => {
    if (!item) return 0;
    const bc = (item.barcode || '').trim();
    const hasDailyData = outboundDailyMap.has(bc) && (outboundDailyMap.get(bc) || []).length > 0;

    // Enhanced 계산 가능 시 사용
    if (hasDailyData) {
      return calcEnhancedAvgDaily(bc);
    }

    // Fallback: 기존 aggregate 데이터比例計算
    const avg14d = Number(item.avgDailyOutbound14d ?? 0) || 0;
    const avg30d = Number(item.avgDailyOutbound30d ?? 0) || 0;
    if (periodDays === 14) return Math.round(avg14d);
    if (periodDays === 30) return Math.round(avg30d);
    if (avg14d > 0) return Math.round(avg14d * (periodDays / 14));
    if (avg30d > 0) return Math.round(avg30d * (periodDays / 30));
    return 0;
  };

  // 입고 가능 수량 계산 (기간별 목표재고 기반, 확정수량에서 줄이기만 가능)
  // NOTE: This stores per-row values, NOT aggregated by barcode (unlike inboundAvailableByBarcode below).
  // Each row's inboundAvailable = Math.floor(Math.min(thisRowQty, Math.max(0, targetStock - (currentStock + thisRowQty))))
  const inboundAvailableByRow = useMemo(() => {
    const out: Array<{ bc: string; lineId: string; value: number }> = [];
    for (const line of inboundLines) {
      const bc = String(line.barcode || '').trim();
      if (!bc) continue;

      const item = inventoryMap.get(bc);
      const currentStock = Number(item?.currentStock ?? 0) || 0;
      const avgDailyOutbound = getAvgDailyOutbound(item);
      const targetStock = avgDailyOutbound * periodDays;

      const isUnreceivedCsv = uploadInfo?.fileType === 'unreceived_csv';
      const base = isUnreceivedCsv
        ? Math.max(0, (line.confirmedQty - line.receivedQty))
        : Math.max(0, line.confirmedQty);

      const needToTarget = Math.max(0, targetStock - (currentStock + base));
      const inboundAvail = Math.floor(Math.min(base, needToTarget));
      out.push({ bc, lineId: line.id, value: inboundAvail });
    }
    return out;
  }, [inboundLines, inventoryMap, periodDays, uploadInfo?.fileType]);

  // DEBUG: Log inboundAvailableByRow stats
  console.debug('[DEBUG inboundAvailableByRow] total rows:', inboundAvailableByRow.length);
  console.debug('[DEBUG inboundAvailableByRow] unique barcodes:', new Set(inboundAvailableByRow.map(r => r.bc)).size);
  console.debug('[DEBUG inboundAvailableByRow] sum of all values:', inboundAvailableByRow.reduce((s, r) => s + r.value, 0));

  // 입고 가능 수량 맵 (바코드 -> 중복聚合값, Excel 내보내기용으로만 사용)
  const inboundAvailableByBarcode = useMemo(() => {
    const baseByBarcode = new Map<string, number>();
    const isUnreceivedCsv = uploadInfo?.fileType === 'unreceived_csv';

    for (const line of inboundLines) {
      const bc = String(line.barcode || '').trim();
      if (!bc) continue;


      const base = isUnreceivedCsv
        ? Math.max(0, (line.confirmedQty - line.receivedQty))
        : Math.max(0, line.confirmedQty);

      baseByBarcode.set(bc, (baseByBarcode.get(bc) || 0) + base);
    }

    const out = new Map<string, number>();
    for (const [bc, baseSum] of baseByBarcode.entries()) {
      const item = inventoryMap.get(bc);
      const currentStock = Number(item?.currentStock ?? 0) || 0;

      // 기간 기반 목표 재고 계산
      const avgDailyOutbound = getAvgDailyOutbound(item);
      const targetStock = avgDailyOutbound * periodDays;

      // 현재고 + 발주량으로 목표 재고 대비 부족분 계산 (정수 연산)
      const currentWithOrdered = currentStock + baseSum;
      const needToTarget = Math.max(0, targetStock - currentWithOrdered);

      // 확정수량에서 줄이기만 가능 (증가 불가) - 소수점 버림
      out.set(bc, Math.floor(Math.min(baseSum, Math.max(0, needToTarget))));
    }

    // DEBUG: Log stats
    console.debug('[DEBUG inboundAvailableByBarcode] map size:', out.size);
    console.debug('[DEBUG inboundAvailableByBarcode] sum of all values:', Array.from(out.values()).reduce((s, v) => s + v, 0));

    return out;
  }, [inboundLines, inventoryMap, periodDays, uploadInfo?.fileType]);


  // DEBUG: visibleInboundLines length log (moved after declaration)
  console.debug('[DEBUG visibleInboundLines] length:', visibleInboundLines.length, '| original inboundLines:', inboundLines.length);

  // 입고 가능 수량 합계 (per-row 직접 계산 - aggregate 값 아님)
  const totalInboundAvailable = useMemo(() => {
    let total = 0;
    // DEBUG: collect per-row avgDailyOutbound samples
    const avgSamples: Array<{ bc: string; avg: number; targetStock: number; currentStock: number; qty: number; inboundAvail: number }> = [];
    for (const line of visibleInboundLines) {
      const bc = String(line.barcode || '').trim();
      const qty = editedQuantities.get(bc) ?? line.confirmedQty;
      const item = inventoryMap.get(bc);
      const currentStock = Number(item?.currentStock ?? 0) || 0;
      const avgDailyOutbound = getAvgDailyOutbound(item);
      const targetStock = avgDailyOutbound * periodDays;
      const currentWithOrdered = currentStock + qty;
      const needToTarget = Math.max(0, targetStock - currentWithOrdered);
      const inboundAvail = Math.floor(Math.min(qty, Math.max(0, needToTarget)));
      total += inboundAvail;
      avgSamples.push({ bc, avg: avgDailyOutbound, targetStock, currentStock, qty, inboundAvail });
    }
    // DEBUG: Log calculation breakdown with avgDailyOutbound samples (top 10 by inboundAvail > 0)
    const topSamples = avgSamples.filter(s => s.inboundAvail > 0).slice(0, 10);
    console.debug('[DEBUG totalInboundAvailable] sum:', total, '| visible count:', visibleInboundLines.length);
    console.debug('[DEBUG avgDailyOutbound] top samples (inboundAvail>0):', topSamples);
    console.debug('[DEBUG avgDailyOutbound] avg value stats:', {
      totalRows: avgSamples.length,
      rowsWithAvgGt0: avgSamples.filter(s => s.avg > 0).length,
      rowsWithInboundAvailGt0: avgSamples.filter(s => s.inboundAvail > 0).length,
      avgOfAvg: avgSamples.length > 0 ? Math.round(avgSamples.reduce((s, r) => s + r.avg, 0) / avgSamples.length) : 0,
    });
    return total;
  }, [visibleInboundLines, editedQuantities, inventoryMap, periodDays]);

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
              지원 파일: VF 발주서 업로드.xlsx, 발주서 미입고 물량.csv
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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🎯 기간 및 목표치 선택</h3>

        <div className="space-y-4">
          {/* 기간 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              분석 기간
            </label>
            <div className="flex flex-wrap gap-2">
              {[3, 7, 10, 14, 30].map((days) => (
                <button
                  key={days}
                  onClick={() => setPeriodDays(days)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    periodDays === days
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {days}일
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              기간별 평균 일일 출고량 기반으로 목표 재고를 산출합니다 (기본: 10일)
            </p>
          </div>

          {/* 목표치 선택 */}
          <div className="pt-4 border-t border-gray-200">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              목표 재고 기준
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="targetMode"
                  value="min"
                  checked={targetMode === 'min'}
                  onChange={() => setTargetMode('min')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">적정 재고 (minStock)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="targetMode"
                  value="max"
                  checked={targetMode === 'max'}
                  onChange={() => setTargetMode('max')}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">최대 재고 (maxStock)</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {periodDays}일 기준 목표 재고 = {periodDays}일 × 평균 일일 출고량
            </p>
          </div>
        </div>
      </div>

      {/* 입고 가능 수량 요약 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">📊 {periodDays}일 기준 입고 가능 수량 요약</h3>
        <p className="text-sm text-gray-600 mb-4">
          목표재고({periodDays}일) - 현재고 기준, 확정수량에서 감소한 추천 수량
        </p>
        {/* 계산법 도움말 팝업 */}
        {showCalcHelp && (
          <div className="mb-4 p-4 bg-white border border-blue-200 rounded-lg text-left text-sm">
            <h4 className="font-bold text-blue-800 mb-2">📖 Enhanced 평균일일출고 계산법</h4>
            <ol className="list-decimal list-inside space-y-1 text-gray-700">
              <li><b>월초 가중치:</b> 선택 기간에 1일~5일이 포함되면 이전달 전체 데이터 추가 (가중치 1.0)</li>
              <li><b>최근 추세 가중치:</b> 선택 기간 중 최신 7일 → 가중치 <b>1.5배</b>, 예전 7일 → 가중치 <b>1.0배</b></li>
              <li><b>7일 미만:</b> 전체 가중치 <b>1.5배</b></li>
            </ol>
            <p className="mt-2 text-gray-500 text-xs">
              공식: 평균 = Σ(데이터 × 가중치) ÷ Σ(일수 × 가중치)
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
            📥 확정수량 엑셀로 내보내기
          </button>
        </div>
        <div className="text-center">
          <div className="text-4xl font-bold text-blue-600">
            {totalInboundAvailable.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600 mt-1">총 추천 확정 수량</div>
        </div>
      </div>

      {/* 입고 발주서 데이터 테이블 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">📋 입고 발주서 데이터</h3>
          {visibleInboundLines.length > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              전체 발주 품목 (총 {visibleInboundLines.length}개)
            </p>
          )}
        </div>

        {isLoadingInbound ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-2 text-gray-600">데이터 로딩 중...</p>
          </div>
        ) : visibleInboundLines.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            발주서 데이터가 없습니다. 파일을 업로드해주세요.
          </div>
        ) : (
          <div className="overflow-x-auto min-w-[1200px]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[180px]">상품명</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[70px]">현재고</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[70px]">평균 일일출고 <button onClick={() => setShowCalcHelp((v) => !v)} title="계산법 도움말" className="ml-1 text-blue-500 hover:text-blue-700 text-xs align-middle">?</button></th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[80px]">목표재고<br/>({periodDays}일)</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[80px]">현재고+<br/>발주</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[80px]">발주<br/>수량</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 bg-blue-50 min-w-[90px]">추천<br/>확정수량</th>
                  <th className="px-3 py-3 text-right font-medium text-gray-700 min-w-[110px]">확정수량<br/><span className="text-xs font-normal text-gray-500">(수정가능)</span></th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[200px]">상품바코드</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[90px]">입고예정일</th>
                  <th className="px-3 py-3 text-left font-medium text-gray-700 min-w-[80px]">발주상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleInboundLines.map((line) => {
                  const inventoryItem = inventoryMap.get(line.barcode);
                  const currentStock = Number(inventoryItem?.currentStock ?? 0) || 0;
                  const avgDailyOutbound = getAvgDailyOutbound(inventoryItem);
                  const targetStock = avgDailyOutbound * periodDays;
                  const confirmedQty = line.confirmedQty;
                  const inboundAvailable = (() => {
                    // per-row direct calculation instead of aggregated map
                    const bc = String(line.barcode || '').trim();
                    const item = inventoryMap.get(bc);
                    const currentStock = Number(item?.currentStock ?? 0) || 0;
                    const avgDailyOutbound = getAvgDailyOutbound(item);
                    const targetStock = avgDailyOutbound * periodDays;
                    const confirmedQty = line.confirmedQty;
                    const isUnreceivedCsv = uploadInfo?.fileType === 'unreceived_csv';
                    const base = isUnreceivedCsv
                      ? Math.max(0, (confirmedQty - line.receivedQty))
                      : Math.max(0, confirmedQty);
                    const needToTarget = Math.max(0, targetStock - (currentStock + base));
                    return Math.floor(Math.min(base, needToTarget));
                  })();
                  const currentWithOrdered = currentStock + confirmedQty;

                  return (
                    <tr key={line.id} className="hover:bg-gray-50">
                      <td className="px-3 py-3 text-gray-900 text-xs">{line.productName || '-'}</td>
                      <td className="px-3 py-3 text-right text-gray-900">{currentStock.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-gray-600 min-w-[70px]">{avgDailyOutbound.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-gray-900 font-medium">{Math.round(targetStock).toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{currentWithOrdered.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right text-gray-600">{line.orderedQty.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right font-bold text-blue-700 bg-blue-50">
                        {inboundAvailable > 0 ? inboundAvailable.toLocaleString() : '0'}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          value={editedQuantities.get(String(line.barcode || '').trim()) ?? line.confirmedQty}
                          onChange={(e) => handleConfirmedQtyChange(String(line.barcode || '').trim(), e.target.value)}
                          className="w-20 px-2 py-1 text-right border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
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
        )}
      </div>
    </div>
  );
}
