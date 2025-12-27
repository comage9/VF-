import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';

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

  const inboundLines = inboundData?.data || [];
  const uploadInfo = inboundData?.uploadInfo;

  // 입고 가능 수량 계산 (바코드별 예상입고 합산 후 목표재고 부족분으로 캡)
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
      const rawTarget = targetMode === 'min' ? item?.minStock : item?.maxStock;
      const targetStock = Number(rawTarget ?? 0) || 0;
      const base = Math.max(0, baseSum);
      const needToTarget = targetStock > 0 ? Math.max(0, targetStock - currentStock) : base;
      out.set(bc, Math.min(base, needToTarget));
    }
    return out;
  }, [inboundLines, inventoryMap, targetMode, uploadInfo?.fileType]);

  // 입고 가능 수량이 있는 바코드만 필터링
  const includedBarcodeSet = useMemo(() => {
    const set = new Set<string>();
    for (const [bc, qty] of inboundAvailableByBarcode.entries()) {
      if (qty > 0) set.add(bc);
    }
    return set;
  }, [inboundAvailableByBarcode]);

  const visibleInboundLines = useMemo(() => {
    if (inboundLines.length === 0) return [];
    return inboundLines.filter((line) => includedBarcodeSet.has(String(line.barcode || '').trim()));
  }, [inboundLines, includedBarcodeSet]);

  // 입고 가능 수량 합계
  const totalInboundAvailable = useMemo(() => {
    let total = 0;
    for (const v of inboundAvailableByBarcode.values()) total += v;
    return total;
  }, [inboundAvailableByBarcode]);

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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">🎯 목표치 선택</h3>

        <div className="space-y-4">
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

          <p className="text-sm text-gray-600">
            {targetMode === 'min'
              ? '현재 적정 재고(minStock)를 목표치로 사용합니다.'
              : '현재 최대 재고(maxStock)를 목표치로 사용합니다.'}
          </p>
        </div>
      </div>

      {/* 입고 가능 수량 요약 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">📊 입고 가능 수량 요약</h3>
        <div className="text-center">
          <div className="text-4xl font-bold text-blue-600">
            {totalInboundAvailable.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600 mt-1">총 입고 가능 수량</div>
        </div>
      </div>

      {/* 입고 발주서 데이터 테이블 */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">📋 입고 발주서 데이터</h3>
          {visibleInboundLines.length > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              입고 가능수량이 있는 바코드만 표시 (총 {visibleInboundLines.length}개 발주 항목)
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
            입고 가능 수량이 있는 항목이 없습니다. 파일을 업로드하거나 데이터를 확인해주세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">상품명</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">발주수량</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">확정수량</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">입고수량</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">현재고</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">발주번호(바코드)</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">상품바코드(바코드)</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">로케이션(바코드)</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">입고가능수량(바코드)</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">입고예정일</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">발주상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleInboundLines.map((line) => {
                  const inventoryItem = inventoryMap.get(line.barcode);
                  const currentStock = inventoryItem?.currentStock ?? 0;
                  const location = String((inventoryItem as any)?.location || '').trim();
                  const inboundAvailable = inboundAvailableByBarcode.get(String(line.barcode || '').trim()) || 0;

                  return (
                    <tr key={line.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-900">{line.productName || '-'}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{line.orderedQty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-900 font-medium">{line.confirmedQty.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {line.receivedQty > 0 ? line.receivedQty.toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">{currentStock.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-900"><BarcodeCell value={line.orderNo} /></td>
                      <td className="px-4 py-3 text-gray-900"><BarcodeCell value={line.barcode} /></td>
                      <td className="px-4 py-3 text-gray-900"><BarcodeCell value={location || '-'} /></td>
                      <td className="px-4 py-3 text-gray-900"><BarcodeCell value={String(inboundAvailable)} /></td>
                      <td className="px-4 py-3 text-gray-600">
                        {line.expectedDate ? new Date(line.expectedDate).toLocaleDateString('ko-KR') : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{line.orderStatus || '-'}</td>
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
