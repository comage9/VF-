import React, { useState, useEffect } from 'react';

interface Stats {
  total_records: number;
  unique_dates: number;
  before_stock: number;
  [key: string]: any;
}

interface LogEntry {
  time: string;
  message: string;
}

interface AnalysisResult {
  success: boolean;
  message: string;
  data?: any;
}

const InventoryBacoTab: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<{ message: string; type: string } | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [resultContent, setResultContent] = useState('');
  const [selectedDataType, setSelectedDataType] = useState('before_stock');
  const [analysisDate, setAnalysisDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewAnalysisDate, setViewAnalysisDate] = useState(new Date().toISOString().split('T')[0]);
  const [isUploading, setIsUploading] = useState(false);

  const API_BASE = '/api/baco';

  // 유틸리티 함수들
  const log = (message: string) => {
    const now = new Date().toLocaleTimeString();
    setLogs(prev => [{ time: now, message }, ...prev.slice(0, 49)]);
  };

  const showStatus = (message: string, type: string = 'info') => {
    setStatus({ message, type });
    log(message);
    setTimeout(() => setStatus(null), 3000);
  };

  // Base64 파일 변환 헬퍼
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = error => reject(error);
    });
  };

  // 오프라인 큐 동기화 핵심 함수
  const syncOfflineBacoData = async () => {
    if (!navigator.onLine) return;

    // 1. 대기 중인 업로드 동기화
    let uploadsQueue: any[] = [];
    try {
      const raw = localStorage.getItem('offline-baco-uploads');
      if (raw) uploadsQueue = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse offline baco uploads:', e);
    }

    let uploadSuccessCount = 0;
    let failedUploads = [];

    if (uploadsQueue.length > 0) {
      log(`[동기화] 대기 중인 바코드 업로드 ${uploadsQueue.length}건을 감지했습니다.`);
      for (const item of uploadsQueue) {
        try {
          const byteCharacters = atob(item.fileData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: item.fileType });
          const file = new File([blob], item.fileName, { type: item.fileType });

          const uploadFormData = new FormData();
          uploadFormData.append('file', file);
          uploadFormData.append('dataType', item.dataType);

          const response = await fetch(`${API_BASE}/upload-classified`, {
            method: 'POST',
            body: uploadFormData
          });

          if (response.ok) {
            uploadSuccessCount++;
          } else {
            failedUploads.push(item);
          }
        } catch (err) {
          console.error('Error syncing baco upload:', err);
          failedUploads.push(item);
          break; // 통신 끊기면 루프 중단
        }
      }

      try {
        if (failedUploads.length > 0) {
          localStorage.setItem('offline-baco-uploads', JSON.stringify(failedUploads));
        } else {
          localStorage.removeItem('offline-baco-uploads');
        }
      } catch (e) {
        console.error(e);
      }
    }

    // 2. 대기 중인 분석 실행 동기화
    let analysisQueue: string[] = [];
    try {
      const raw = localStorage.getItem('offline-baco-analysis');
      if (raw) analysisQueue = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse offline baco analysis:', e);
    }

    let analysisSuccessCount = 0;
    let failedAnalysis = [];

    if (analysisQueue.length > 0) {
      log(`[동기화] 대기 중인 바코드 분석 실행 ${analysisQueue.length}건을 감지했습니다.`);
      for (const date of analysisQueue) {
        try {
          const response = await fetch(`${API_BASE}/analysis/${date}`);
          if (response.ok) {
            analysisSuccessCount++;
          } else {
            failedAnalysis.push(date);
          }
        } catch (err) {
          console.error('Error syncing baco analysis:', err);
          failedAnalysis.push(date);
          break;
        }
      }

      try {
        if (failedAnalysis.length > 0) {
          localStorage.setItem('offline-baco-analysis', JSON.stringify(failedAnalysis));
        } else {
          localStorage.removeItem('offline-baco-analysis');
        }
      } catch (e) {
        console.error(e);
      }
    }

    if (uploadSuccessCount > 0 || analysisSuccessCount > 0) {
      showStatus(`[동기화 완료] 바코드 업로드 ${uploadSuccessCount}건, 분석 ${analysisSuccessCount}건이 반영되었습니다.`, 'success');
      await loadStats();
    }
  };

  // 업로드 큐 저장
  const queueOfflineUpload = async (file: File, dataType: string) => {
    try {
      const base64Data = await fileToBase64(file);
      let queue: any[] = [];
      const raw = localStorage.getItem('offline-baco-uploads');
      if (raw) queue = JSON.parse(raw);

      queue.push({
        fileData: base64Data,
        fileName: file.name,
        fileType: file.type,
        dataType,
        timestamp: Date.now()
      });

      localStorage.setItem('offline-baco-uploads', JSON.stringify(queue));
      showStatus('⚠️ [오프라인 저장] 바코드 파일이 임시 보존되었습니다. 인터넷 연결 시 자동 전송됩니다.', 'warning');
      log(`[오프라인] 파일 임시 보존됨: ${file.name}`);
    } catch (err) {
      console.error(err);
      alert('오프라인 임시 저장 실패: 파일 용량이 브라우저 제한을 초과했습니다.');
    }
  };

  // 분석 큐 저장
  const queueOfflineAnalysis = (date: string) => {
    try {
      let queue: string[] = [];
      const raw = localStorage.getItem('offline-baco-analysis');
      if (raw) queue = JSON.parse(raw);

      if (!queue.includes(date)) {
        queue.push(date);
        localStorage.setItem('offline-baco-analysis', JSON.stringify(queue));
      }
      showStatus(`⚠️ [오프라인 저장] ${date} 분석 실행이 예약되었습니다. 인터넷 연결 시 자동 반영됩니다.`, 'warning');
      log(`[오프라인] 분석 예약됨: ${date}`);
    } catch (err) {
      console.error(err);
    }
  };

  // 온라인 복구 리스너 마운트
  useEffect(() => {
    const handleOnline = () => {
      console.log('🌐 Internet connected. Syncing baco offline data...');
      syncOfflineBacoData();
    };
    window.addEventListener('online', handleOnline);

    const timer = setTimeout(() => {
      syncOfflineBacoData();
    }, 1500);

    return () => {
      window.removeEventListener('online', handleOnline);
      clearTimeout(timer);
    };
  }, []);

  // 통계 로드
  const loadStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/stats`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Stats API Error:', response.status, errorText);
        throw new Error(`통계 로드 실패: ${response.status} - ${errorText}`);
      }

      const statsData = await response.json();
      setStats(statsData);
      log('통계가 성공적으로 로드되었습니다.');
    } catch (error) {
      console.error('loadStats error:', error);
      showStatus(`통계 로드 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, 'error');
      // 기본 통계 데이터 설정
      setStats({ total_records: 0, unique_dates: 0, before_stock: 0 });
    }
  };

  // 파일 업로드
  const handleFileUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const file = formData.get('file') as File;
    const dataType = formData.get('dataType') as string;

    if (!file) {
      alert('파일을 선택해주세요.');
      return;
    }

    // 폼 즉시 리셋 (오프라인/온라인 공통)
    const currentForm = event.currentTarget;

    // 오프라인 상태일 경우 큐에 임시 보존
    if (!navigator.onLine) {
      await queueOfflineUpload(file, dataType);
      currentForm.reset();
      return;
    }

    setIsUploading(true);
    showStatus('파일 업로드 중...', 'loading');

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('dataType', dataType);

      const response = await fetch(`${API_BASE}/upload-classified`, {
        method: 'POST',
        body: uploadFormData
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error || '업로드 실패');

      showStatus('업로드 완료', 'success');
      await loadStats();
      currentForm.reset();
    } catch (error) {
      console.error('Upload failed, falling back to offline queue:', error);
      await queueOfflineUpload(file, dataType);
      currentForm.reset();
    } finally {
      setIsUploading(false);
    }
  };

  // 분석 실행
  const runAnalysis = async () => {
    if (!viewAnalysisDate) {
      alert('날짜를 선택해주세요.');
      return;
    }

    // 오프라인 상태일 경우 큐에 임시 보존
    if (!navigator.onLine) {
      queueOfflineAnalysis(viewAnalysisDate);
      return;
    }
    
    showStatus('분석 실행 중...', 'loading');
    try {
      const response = await fetch(`${API_BASE}/analysis/${viewAnalysisDate}`);
      const result = await response.json();
      
      if (!response.ok) throw new Error(result.error || '분석 실패');
      
      setShowResults(true);
      setResultContent(`
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 class="font-semibold text-green-600 mb-2">✅ 분석 완료 (${viewAnalysisDate})</h3>
          <div class="text-sm space-y-2">
            <p><strong>상태:</strong> ${result.success ? '성공' : '실패'}</p>
            <p><strong>메시지:</strong> ${result.message || '분석이 완료되었습니다.'}</p>
            ${result.data ? `<div class="mt-3 p-2 bg-white rounded border"><pre class="text-xs overflow-auto">${JSON.stringify(result.data, null, 2)}</pre></div>` : ''}
          </div>
        </div>
      `);
      
      showStatus('분석 완료', 'success');
    } catch (error) {
      showStatus(`분석 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, 'error');
    }
  };

  // 데이터 다운로드
  const downloadData = async (dataType: string) => {
    showStatus('다운로드 준비 중...', 'loading');
    try {
      const response = await fetch(`${API_BASE}/download/${dataType}`);
      
      if (!response.ok) throw new Error('다운로드 실패');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dataType}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      showStatus('다운로드 완료', 'success');
    } catch (error) {
      showStatus(`다운로드 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, 'error');
    }
  };

  // 분석 결과 다운로드
  const downloadAnalysis = async () => {
    if (!analysisDate) {
      alert('날짜를 선택해주세요.');
      return;
    }
    
    showStatus('분석 다운로드 중...', 'loading');
    try {
      const response = await fetch(`${API_BASE}/download/analysis/${analysisDate}`);
      
      if (!response.ok) throw new Error('분석 다운로드 실패');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analysis_${analysisDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      showStatus('분석 다운로드 완료', 'success');
    } catch (error) {
      showStatus(`분석 다운로드 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, 'error');
    }
  };

  // 전체 삭제
  const clearAllData = async () => {
    if (!confirm('정말로 모든 데이터를 영구적으로 삭제하시겠습니까?')) return;
    
    showStatus('전체 삭제 중...', 'loading');
    try {
      const response = await fetch(`${API_BASE}/clear-all-data`, { method: 'DELETE' });
      const result = await response.json();
      
      if (!response.ok) throw new Error(result.error || '전체 삭제 실패');
      
      showStatus('전체 삭제 완료', 'success');
      await loadStats();
    } catch (error) {
      showStatus(`전체 삭제 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, 'error');
    }
  };

  // 데이터 테이블 표시
  const showDataTable = async () => {
    showStatus('데이터 테이블 로드 중...', 'loading');
    try {
      const response = await fetch(`${API_BASE}/all-data?limit=100`);
      const result = await response.json();
      
      if (!response.ok) throw new Error('데이터 로드 실패');
      
      if (!result.data || result.data.length === 0) {
        throw new Error('데이터가 없습니다.');
      }
      
      setShowResults(true);
      const headers = Object.keys(result.data[0]);
      setResultContent(`
        <div>
          <h3 class="font-semibold mb-3">🗃️ 데이터 테이블 (최근 ${result.data.length}개)</h3>
          <div class="overflow-x-auto max-h-96 border rounded-lg">
            <table class="min-w-full bg-white text-sm">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  ${headers.map(key => `<th class="px-3 py-2 border text-left font-medium">${key}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${result.data.slice(0, 20).map((row: any) => `
                  <tr class="border-t hover:bg-gray-50">
                    ${Object.values(row).map(value => `<td class="px-3 py-2 border text-sm">${value || '-'}</td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div class="mt-3 text-sm text-gray-600">
            <p>총 ${result.pagination.total}개 항목 중 ${Math.min(20, result.data.length)}개 표시</p>
            <p>페이지: ${result.pagination.page} / ${result.pagination.pages}</p>
          </div>
        </div>
      `);
      
      showStatus('데이터 테이블 로드 완료', 'success');
    } catch (error) {
      showStatus(`데이터 테이블 로드 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, 'error');
      setShowResults(true);
      setResultContent(`<div class="text-red-600">❌ 데이터 테이블 로드 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}</div>`);
    }
  };

  // 일별 통계 생성
  const generateDailyStats = async () => {
    showStatus('일별 통계 생성 중...', 'loading');
    try {
      const response = await fetch(`${API_BASE}/generate-daily-stats`);
      const result = await response.json();
      
      if (!response.ok) throw new Error(result.error || '일별 통계 생성 실패');
      
      setShowResults(true);
      setResultContent(`
        <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 class="font-semibold text-purple-600 mb-2">📊 일별 통계 생성 완료</h3>
          <div class="text-sm space-y-2">
            <p><strong>메시지:</strong> ${result.message}</p>
            ${result.data ? `<div class="mt-3 p-2 bg-white rounded border"><pre class="text-xs overflow-auto max-h-40">${JSON.stringify(result.data, null, 2)}</pre></div>` : ''}
          </div>
        </div>
      `);
      
      showStatus('일별 통계 생성 완료', 'success');
    } catch (error) {
      showStatus(`일별 통계 생성 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`, 'error');
    }
  };

  // 초기 로드
  useEffect(() => {
    log('바코드 관리 시스템이 시작되었습니다.');
    loadStats();
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* 헤더 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">📦 바코드 관리 시스템</h1>
            <p className="text-gray-600 mt-2">데이터 업로드, 분석 및 관리</p>
          </div>
          <div className="text-sm text-gray-500">
            버전: 2.0 | 마지막 업데이트: 2025-10-04
          </div>
        </div>
      </div>

      {/* 업로드 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">📤 데이터 업로드</h2>
        <form onSubmit={handleFileUpload} className="space-y-4">
          <div>
            <label htmlFor="dataType" className="block text-sm font-medium text-gray-700 mb-2">데이터 분류 선택</label>
            <select 
              name="dataType" 
              value={selectedDataType}
              onChange={(e) => setSelectedDataType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="before_stock">Before Stock (입고전 재고)</option>
              <option value="after_stock">After Stock (입고후 재고)</option>
              <option value="daily_outbound">Daily Outbound (일별 출고)</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="file" className="block text-sm font-medium text-gray-700 mb-2">CSV 파일 선택</label>
            <input 
              type="file" 
              name="file"
              accept=".csv"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <button 
            type="submit"
            disabled={isUploading}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white py-2 px-4 rounded-md transition-colors"
          >
            {isUploading ? '업로드 중...' : '업로드'}
          </button>
        </form>
      </div>

      {/* 통계 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">📈 데이터 통계</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {stats ? Object.entries(stats).map(([key, value]) => (
            <div key={key} className="bg-gray-50 p-4 rounded-lg text-center hover:bg-gray-100 transition-colors">
              <div className="text-2xl font-bold text-blue-600">
                {typeof value === 'number' ? value.toLocaleString() : value}
              </div>
              <div className="text-sm text-gray-600">
                {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </div>
            </div>
          )) : (
            <div className="col-span-full text-center text-gray-500 p-4">
              통계 로딩 중...
            </div>
          )}
        </div>
      </div>

      {/* 분석 및 관리 섹션 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">🔍 분석 및 관리</h2>
        
        {/* 분석 실행 */}
        <div className="mb-4">
          <h3 className="text-md font-medium mb-3 text-blue-600">📊 분석 실행</h3>
          <div className="flex gap-2">
            <input 
              type="date" 
              value={viewAnalysisDate}
              onChange={(e) => setViewAnalysisDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
            <button 
              onClick={runAnalysis}
              className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-md text-sm transition-colors"
            >
              분석 실행
            </button>
          </div>
        </div>

        {/* 데이터 다운로드 */}
        <div className="mb-4">
          <h3 className="text-md font-medium mb-3 text-green-600">💾 데이터 다운로드</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => downloadData('before_stock')} className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-md text-sm transition-colors">Before Stock</button>
            <button onClick={() => downloadData('after_stock')} className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-md text-sm transition-colors">After Stock</button>
            <button onClick={() => downloadData('daily_outbound')} className="bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-md text-sm transition-colors">Daily Outbound</button>
          </div>
        </div>

        {/* 분석 다운로드 */}
        <div className="mb-4">
          <h3 className="text-md font-medium mb-3 text-purple-600">📊 분석 결과 다운로드</h3>
          <div className="flex gap-2">
            <input 
              type="date" 
              value={analysisDate}
              onChange={(e) => setAnalysisDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md"
            />
            <button 
              onClick={downloadAnalysis}
              className="bg-purple-500 hover:bg-purple-600 text-white py-2 px-4 rounded-md text-sm transition-colors"
            >
              분석 결과 다운로드
            </button>
          </div>
        </div>

        {/* 고급 기능 */}
        <div className="mb-4">
          <h3 className="text-md font-medium mb-3 text-gray-600">⚙️ 고급 기능</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={showDataTable} className="bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-md text-sm transition-colors">데이터 테이블 보기</button>
            <button onClick={generateDailyStats} className="bg-indigo-500 hover:bg-indigo-600 text-white py-2 px-4 rounded-md text-sm transition-colors">일별 통계 생성</button>
            <button onClick={loadStats} className="bg-yellow-500 hover:bg-yellow-600 text-white py-2 px-4 rounded-md text-sm transition-colors">캐시 새로고침</button>
            <button onClick={clearAllData} className="bg-red-500 hover:bg-red-600 text-white py-2 px-4 rounded-md text-sm transition-colors">전체 삭제</button>
          </div>
        </div>
      </div>

      {/* 결과 표시 */}
      {showResults && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">📋 결과</h2>
            <button 
              onClick={() => setShowResults(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <div dangerouslySetInnerHTML={{ __html: resultContent }} />
        </div>
      )}

      {/* 로그 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">📝 시스템 로그</h2>
        <div className="max-h-64 overflow-y-auto bg-gray-50 p-4 rounded border">
          {logs.map((log, index) => (
            <div key={index} className="text-sm py-1 border-b border-gray-200">
              <span className="text-gray-500">{log.time}</span> <span className="text-gray-800">{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-gray-500 text-sm">로그가 없습니다.</div>
          )}
        </div>
      </div>

      {/* 상태 표시 */}
      {status && (
        <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-md text-white z-50 shadow-lg ${
          status.type === 'success' ? 'bg-green-600' :
          status.type === 'error' ? 'bg-red-600' :
          status.type === 'loading' ? 'bg-blue-600' : 'bg-gray-600'
        }`}>
          {status.message}
        </div>
      )}
    </div>
  );
};

export default InventoryBacoTab;
