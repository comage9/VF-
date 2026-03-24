import { useState, useCallback } from 'react';
import { Trash2, Loader2 } from 'lucide-react';

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

export default function FCInboundUpload({ onUploadComplete }: FCInboundUploadProps) {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [uploads, setUploads] = useState<FileUploadRecord[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            setFile(selected);
            setMessage(null);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setMessage({ type: 'error', text: '파일을 선택해주세요' });
            return;
        }

        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            setMessage({ type: 'error', text: '엑셀 파일만 업로드 가능합니다 (.xlsx, .xls)' });
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

            const data = await response.json();

            if (response.ok && data.success) {
                setMessage({
                    type: 'success',
                    text: `업로드 완료! ${data.recordsCreated}건 생성, ${data.recordsDuplicate}건 중복, ${data.recordsSkipped}건 건너뜀`
                });
                setFile(null);
                if (onUploadComplete) onUploadComplete();
                await fetchUploads();
            } else {
                setMessage({
                    type: 'error',
                    text: data.error || '업로드 실패'
                });
            }
        } catch (error) {
            setMessage({
                type: 'error',
                text: '업로드 중 오류가 발생했습니다'
            });
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteAll = async () => {
        if (!confirm('정말 모든 FC 입고 데이터를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
            return;
        }

        setDeleting(true);
        setMessage(null);

        try {
            const response = await fetch('/api/fc-inbound/delete-all', {
                method: 'DELETE',
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setMessage({
                    type: 'success',
                    text: `${data.deleted}건의 데이터가 삭제되었습니다`
                });
                if (onUploadComplete) onUploadComplete();
            } else {
                setMessage({
                    type: 'error',
                    text: data.error || '삭제 실패'
                });
            }
        } catch (error) {
            setMessage({
                type: 'error',
                text: '삭제 중 오류가 발생했습니다'
            });
        } finally {
            setDeleting(false);
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
        <div className="mb-6 p-4 bg-white rounded-lg shadow">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-800">FC 입고 데이터 관리</h3>
                <button
                    onClick={toggleHistory}
                    className="text-sm text-blue-600 hover:text-blue-800"
                >
                    {showHistory ? '숨기기' : '업로드 이력'}
                </button>
            </div>

            {/* 엑셀 업로드 */}
            <div className="flex items-center gap-3">
                <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    disabled={uploading}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
                />
                <button
                    onClick={handleUpload}
                    disabled={!file || uploading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                >
                    {uploading ? '업로드 중...' : '엑셀 업로드'}
                </button>
            </div>

            {message && (
                <div className={`mt-3 p-3 rounded-md text-sm ${
                    message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
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

            <div className="mt-3 text-xs text-gray-500">
                <p className="font-semibold mb-1">📥 구글 시트 연동:</p>
                <p>• 구글 시트에서 자동으로 데이터를 가져옵니다</p>
                <p>• 중복 체크: SKU번호 + 입고일자 + 물류센터</p>
                <p>• 기존 데이터는 덮어쓰기됩니다</p>
                <p className="font-semibold mt-2 mb-1">📂 엑셀 업로드:</p>
                <p>• 지원 형식: .xlsx, .xls</p>
                <p>• 필수 컬럼: SKU번호, SKU명, 입고/반출시각, 물류센터, 수량, 총공급가액</p>
            </div>
        </div>
    );
}
