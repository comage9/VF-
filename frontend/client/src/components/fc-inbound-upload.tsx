import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FileUploadRecord {
  id: string;
  file_name: string;
  upload_date: string;
  records_processed: number;
  records_created: number;
  records_skipped: number;
  records_duplicate: number;
  status: string;
}

interface FCInboundUploadProps {
  onUploadComplete?: () => void;
}

/** 호버 1초 후 표시 — 파일 업로드 안내 (본문 장문 제거) */
function UploadHelpBody() {
  return (
    <div className="space-y-2 text-left text-xs leading-relaxed max-w-sm">
      <p className="font-semibold text-sm">FC 입고 · 단가 업로드</p>
      <p>
        <b>파일:</b> Coupang_Stocked_Data_List (.xlsx / .xls)
        <br />
        한 번에 <b>입고 실적 + 마스터 단가</b> 반영. 마스터·생산 계획에 다시 올릴 필요 없음.
      </p>
      <p>
        <b>필수 컬럼:</b> SKU번호, SKU명, 입고/반출시각, 물류센터, 수량
        <br />
        (+ 단가 컬럼 권장)
      </p>
      <p className="text-amber-200">
        <b>여기 올리지 말 것:</b>
        <br />
        · inventory_unified CSV → 전산 재고 수량
        <br />
        · 발주서 xlsx → 입고 가능 탭
        <br />
        · 생산 계획 파일 → 생산 계획
      </p>
      <p className="text-white/80">중복 키: SKU + 입고일 + 물류센터 (+ 수량·품명)</p>
    </div>
  );
}

export default function FCInboundUpload({ onUploadComplete }: FCInboundUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [uploads, setUploads] = useState<FileUploadRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setMessage(null);
      const name = selected.name.toLowerCase();
      if (name.includes('inventory_unified') || name.endsWith('.csv')) {
        setMessage({
          type: 'error',
          text: name.includes('inventory_unified')
            ? '전산 재고(inventory_unified) 파일입니다. 「전산 재고 수량」에서 기준 재고로 올리세요. 여기에는 Coupang_Stocked_Data_List.xlsx 만 가능합니다.'
            : 'FC 입고는 .xlsx / .xls 만 지원합니다. CSV는 사용할 수 없습니다.',
        });
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage({ type: 'error', text: '파일을 선택해주세요' });
      return;
    }

    const lower = file.name.toLowerCase();
    if (lower.includes('inventory_unified')) {
      setMessage({
        type: 'error',
        text: '전산 재고 export는 FC 입고에 반영되지 않습니다. 전산 재고 수량 → 기준 재고 업로드를 사용하세요.',
      });
      return;
    }

    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setMessage({
        type: 'error',
        text: '엑셀 파일만 업로드 가능합니다 (.xlsx, .xls).',
      });
      return;
    }

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/fc-inbound/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json().catch(() => ({} as any));

      if (response.ok && data.success) {
        const ps = data.priceSync || {};
        const pricePart =
          ps.success === false
            ? `단가 동기화 실패${ps.message ? `: ${ps.message}` : ''}`
            : `단가 동기화 ${ps.priceChanged ?? 0}건 변경 (신규 ${ps.newCreated ?? 0} · 갱신 ${ps.updated ?? 0} · 유지 ${ps.unchanged ?? 0})`;
        const inboundPart = data.alreadyUploaded
          ? '동일 파일 재업로드 — 입고 실적은 건너뛰고 단가만 반영'
          : `입고 ${data.recordsCreated}건 생성, 중복 ${data.recordsDuplicate}건, 건너뜀 ${data.recordsSkipped}건`;
        setMessage({
          type: data.recordsCreated === 0 && !data.alreadyUploaded ? 'error' : 'success',
          text:
            data.recordsCreated === 0 && !data.alreadyUploaded
              ? `업로드는 됐지만 입고 0건 생성(건너뜀 ${data.recordsSkipped}, 중복 ${data.recordsDuplicate}). 컬럼명·수량·일자를 확인하세요. / ${pricePart}`
              : `업로드 완료! ${inboundPart} / ${pricePart}`,
        });
        setFile(null);
        if (onUploadComplete) onUploadComplete();
        await fetchUploads();
      } else {
        const errText = String(data.error || data.detail || '업로드 실패');
        let text = errText;
        if (/Missing required columns|필수 컬럼/i.test(errText)) {
          text = `${errText}\n필수: SKU번호, SKU명, 입고/반출시각, 물류센터, 수량.`;
        }
        setMessage({ type: 'error', text });
      }
    } catch {
      setMessage({ type: 'error', text: '업로드 중 오류가 발생했습니다' });
    } finally {
      setUploading(false);
    }
  };

  const fetchUploads = async () => {
    try {
      const response = await fetch('/api/fc-inbound/uploads?limit=20');
      if (response.ok) {
        const data = await response.json();
        setUploads(data);
      }
    } catch (error) {
      console.error('Failed to fetch uploads:', error);
    }
  };

  const toggleHistory = async () => {
    if (!showHistory && uploads.length === 0) {
      await fetchUploads();
    }
    setShowHistory(!showHistory);
  };

  return (
    <div
      id="fc-inbound-upload-card"
      className="mb-6 p-4 bg-white rounded-lg shadow border border-blue-200"
    >
      <div className="flex items-center justify-between mb-3 gap-2">
        <h3 className="text-base font-semibold text-gray-800">
          FC 입고 · 단가 업로드
        </h3>
        <button
          type="button"
          onClick={toggleHistory}
          className="text-sm text-blue-600 hover:text-blue-800 shrink-0"
        >
          {showHistory ? '이력 숨기기' : '업로드 이력'}
        </button>
      </div>

      {/* 파일 선택 + 업로드 — 1초 호버 시 안내 툴팁 */}
      <TooltipProvider delayDuration={1000} skipDelayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-3 cursor-default">
              <input
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileSelect}
                disabled={uploading}
                className="block w-full min-w-0 text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-100 file:text-blue-800 hover:file:bg-blue-200 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handleUpload}
                disabled={!file || uploading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
              >
                {uploading ? '업로드 중...' : '입고+단가 업로드'}
              </button>
              <span className="hidden sm:inline-flex items-center text-blue-500" aria-hidden>
                <HelpCircle className="h-4 w-4" />
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="bottom"
            align="start"
            className="bg-slate-900 text-slate-50 border-slate-700 p-3 shadow-xl max-w-md"
          >
            <UploadHelpBody />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <p className="mt-2 text-[11px] text-muted-foreground flex items-center gap-1">
        <HelpCircle className="h-3 w-3 shrink-0" />
        업로드 칸에 마우스를 1초 이상 올리면 파일 안내가 표시됩니다.
      </p>

      {file && (
        <p className="mt-2 text-xs text-gray-600">
          선택: <span className="font-medium">{file.name}</span>
        </p>
      )}

      {message && (
        <div
          className={`mt-3 p-3 rounded-md text-sm whitespace-pre-wrap ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800'
              : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {showHistory && uploads.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">최근 업로드 이력</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">파일명</th>
                  <th className="px-3 py-2 text-left">업로드일시</th>
                  <th className="px-3 py-2 text-right">생성</th>
                  <th className="px-3 py-2 text-right">중복</th>
                  <th className="px-3 py-2 text-right">건너뜀</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr key={upload.id} className="border-t">
                    <td className="px-3 py-2">{upload.file_name}</td>
                    <td className="px-3 py-2">
                      {new Date(upload.upload_date).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-3 py-2 text-right text-green-600 font-semibold">
                      {upload.records_created.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-orange-600">
                      {upload.records_duplicate.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-500">
                      {upload.records_skipped.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
