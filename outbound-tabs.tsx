/**
 * VF 프로젝트 - 출고 탭 컴포넌트
 *
 * Google Sheet에서 출고 데이터를 가져와서 표시합니다.
 * 환경변수가 없으면 로컬 JSON 파일로 폴백합니다.
 */

import React, { useState, useEffect } from 'react';
import { getOutboundConfig, fetchOutboundData, checkOutboundConfigStatus } from './outboundConfig';

// Tab types
type OutboundTabType = 'default' | 'vf-outbound';

// Tab configuration
const TABS: { id: OutboundTabType; label: string; description: string }[] = [
  { id: 'default', label: '일반 출고', description: '기본 출고 데이터' },
  { id: 'vf-outbound', label: 'VF 출고', description: 'VF 프로젝트 출고 데이터' }
];

// 데이터 타입 정의 (Google Sheets 실제 구조에 맞게 수정)
export interface OutboundItem {
  id: string;
  일자: string;
  바코드: string;
  수량박스: string;
  수량낱개: string;
  품목: string;
  분류: string;
  순번: string;
  단수: string;
  판매금액: string;
  비고: string;
}

export interface OutboundResponse {
  success: boolean;
  data?: OutboundItem[];
  message?: string;
  timestamp: number;
}

export interface OutboundTabsProps {
  /** 추가 클래스 */
  className?: string;
  /** 데이터 로드 완료 콜백 */
  onDataLoad?: (data: OutboundItem[]) => void;
  /** 에러 발생 콜백 */
  onError?: (error: string) => void;
  /** 새로고침 간격 (ms), 기본 5분 */
  refreshInterval?: number;
}

/**
 * 출고 탭 컴포넌트
 */
const OutboundTabs: React.FC<OutboundTabsProps> = ({
  className = '',
  onDataLoad,
  onError,
  refreshInterval = 5 * 60 * 1000, // 기본 5분
}) => {
  const [data, setData] = useState<OutboundItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [configStatus, setConfigStatus] = useState<ReturnType<typeof checkOutboundConfigStatus>>();
  const [activeTab, setActiveTab] = useState<OutboundTabType>('default');

  // URL parameter handling
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as OutboundTabType;
    if (tabParam === 'vf-outbound' || tabParam === 'default') {
      setActiveTab(tabParam);
    }
  }, []);

  // 데이터 동기화 함수
  const handleSync = async (showLoading = true): Promise<OutboundResponse> => {
    if (showLoading) {
      setLoading(true);
      setError('');
    }

    const response: OutboundResponse = {
      success: false,
      timestamp: Date.now(),
    };

    try {
      // 환경변수 상태 확인
      const status = checkOutboundConfigStatus();
      setConfigStatus(status);

      // 데이터 소스가 없는 경우
      if (status.usingSource === 'none') {
        // 브라우저 환경에서는 직접 파일 시스템 접근 불가
        // API 호출이나 다른 방법으로 데이터를 가져와야 함
        const errorMsg = 'Google Sheet URL 환경변수가 없습니다. 관리자에게 OUTBOUND_GOOGLE_SHEET_URL 설정을 요청하세요.';
        setError(errorMsg);
        response.message = errorMsg;

        if (showLoading && onError) {
          onError(errorMsg);
        }

        setLoading(false);
        return response;
      }

      // 데이터 가져오기
      const result = await fetchOutboundData();

      // 데이터 형식 검증
      if (!result) {
        throw new Error('데이터가 없습니다.');
      }

      // 데이터가 배열인지 확인
      let outboundData: OutboundItem[];

      if (Array.isArray(result)) {
        outboundData = result as OutboundItem[];
      } else if (typeof result === 'object' && 'data' in result && Array.isArray((result as any).data)) {
        outboundData = (result as any).data;
      } else if (typeof result === 'object' && 'outbound' in result && Array.isArray((result as any).outbound)) {
        outboundData = (result as any).outbound;
      } else {
        // 로컬 JSON 파일에서 데이터 추출
        const keys = Object.keys(result);
        if (keys.length === 0) {
          throw new Error('데이터 형식이 올바르지 않습니다.');
        }

        // 첫 번째 키의 데이터가 배열인지 확인
        const firstKeyData = result[keys[0]];
        if (Array.isArray(firstKeyData)) {
          outboundData = firstKeyData as OutboundItem[];
        } else {
          throw new Error('데이터 형식이 올바르지 않습니다. 배열 형태의 데이터가 필요합니다.');
        }
      }

      // 데이터 유효성 검증
      if (outboundData.length === 0) {
        console.warn('출고 데이터가 없습니다.');
        setData([]);

        response.success = true;
        response.data = [];
        response.message = '데이터가 없습니다.';

        if (showLoading && onDataLoad) {
          onDataLoad([]);
        }

        setLastSync(new Date());
        setLoading(false);
        return response;
      }

      // 데이터 검증 (실제 필드에 맞게 수정)
      const validatedData = outboundData.filter(item => {
        if (!item || typeof item !== 'object') return false;
        const hasId = item.id && String(item.id).trim();
        const hasProductName = item.품목 && String(item.품목).trim();
        const hasCategory = item.분류 && String(item.분류).trim();

        // 적어도 하나의 필드가 있으면 유효한 데이터로 간주
        return hasId || hasProductName || hasCategory;
      });

      if (validatedData.length !== outboundData.length) {
        console.warn(`${outboundData.length - validatedData.length}개의 유효하지 않은 데이터가 필터링되었습니다.`);
      }

      setData(validatedData);
      setLastSync(new Date());

      response.success = true;
      response.data = validatedData;
      response.message = `${validatedData.length}개의 데이터가 로드되었습니다.`;

      if (showLoading && onDataLoad) {
        onDataLoad(validatedData);
      }

      if (showLoading && status.usingSource === 'local') {
        console.log('로컬 JSON 파일을 사용하고 있습니다. 구글 시트 URL 설정을 권장합니다.');
      }

      setLoading(false);
      return response;

    } catch (err) {
      let errorMsg = '데이터를 불러오는 중 오류가 발생했습니다.';

      if (err instanceof Error) {
        errorMsg = err.message;
      }

      console.error('Outbound 데이터 로드 오류:', err);
      setError(errorMsg);

      response.message = errorMsg;

      if (showLoading && onError) {
        onError(errorMsg);
      }

      setLoading(false);
      return response;
    }
  };

  // 컴포넌트 마운트 시 데이터 로드
  useEffect(() => {
    handleSync();
  }, []);

  // 주기적 데이터 새로고침
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const intervalId = setInterval(() => {
      handleSync(false);
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [refreshInterval]);

  // 수동 새로고침 핸들러
  const handleRefresh = () => {
    handleSync();
  };

  // 탭 변경 핸들러
  const handleTabChange = (tabId: OutboundTabType) => {
    setActiveTab(tabId);
    // Update URL without page reload
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    window.history.pushState({}, '', url.toString());
    // Reload data when tab changes
    handleSync();
  };

  return (
    <div className={`outbound-tabs ${className}`}>
      {/* 헤더 섹션 */}
      <div className="outbound-header">
        <h2 className="outbound-title">출고 관리</h2>

        {/* 탭 네비게이션 */}
        <div className="tab-navigation">
          {TABS.map(tab => (
            <button
              key={tab.id}
              data-tab={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 설정 상태 표시 */}
        {configStatus && (
          <div className="config-status">
            <span className={`status-indicator ${configStatus.usingSource}`}>
              {configStatus.usingSource === 'env' && '✓ 구글 시트'}
              {configStatus.usingSource === 'default' && '✓ 기본 구글 시트'}
              {configStatus.usingSource === 'local' && '⚠ 로컬 데이터'}
              {configStatus.usingSource === 'none' && '✗ 데이터 없음'}
            </span>
          </div>
        )}

        {/* 새로고침 버튼 */}
        <button
          onClick={handleRefresh}
          disabled={loading}
          className={`refresh-button ${loading ? 'loading' : ''}`}
        >
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </div>

      {/* 마지막 동기화 시간 */}
      {lastSync && (
        <div className="sync-time">
          마지막 동기화: {lastSync.toLocaleString('ko-KR')}
        </div>
      )}

      {/* 에러 메시지 */}
      {error && (
        <div className="error-message">
          <strong>오류:</strong> {error}
          <button onClick={handleRefresh} className="retry-button">
            다시 시도
          </button>
        </div>
      )}

      {/* 로딩 상태 */}
      {loading && (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>데이터를 불러오는 중...</p>
        </div>
      )}

      {/* 데이터 테이블 */}
      {!loading && !error && data.length > 0 && (
        <div className="data-container">
          <table className="outbound-table">
            <thead>
              <tr>
                <th>일자</th>
                <th>바코드</th>
                <th>품목</th>
                <th>분류</th>
                <th>수량(박스)</th>
                <th>수량(낱개)</th>
                <th>판매금액</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.id}>
                  <td>{item.일자}</td>
                  <td>{item.바코드}</td>
                  <td>{item.품목}</td>
                  <td>{item.분류}</td>
                  <td>{item.수량박스}</td>
                  <td>{item.수량낱개}</td>
                  <td>{item.판매금액}</td>
                  <td>{item.비고}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 데이터가 없는 경우 */}
      {!loading && !error && data.length === 0 && (
        <div className="no-data">
          <p>출고 데이터가 없습니다.</p>
          {configStatus?.usingSource === 'default' && (
            <p className="info-text">
              현재 기본 구글 시트 URL을 사용하고 있습니다. OUTBOUND_GOOGLE_SHEET_URL 환경변수를 설정하여 사용자 정의 URL을 사용할 수 있습니다.
            </p>
          )}
          {configStatus?.usingSource === 'local' && (
            <p className="info-text">
              현재 로컬 데이터를 사용하고 있습니다. 구글 시트 URL을 설정하면 실시간 데이터를 사용할 수 있습니다.
            </p>
          )}
        </div>
      )}

      <style jsx>{`
        .outbound-tabs {
          background-color: #FFFFFF;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          padding: 20px;
          width: 100%;
        }

        .outbound-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          flex-wrap: wrap;
          gap: 12px;
        }

        .outbound-title {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          color: #333333;
        }

        .tab-navigation {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }

        .tab-button {
          padding: 10px 20px;
          background-color: #F3F4F6;
          color: #6B7280;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab-button:hover:not(.active) {
          background-color: #E5E7EB;
        }

        .tab-button.active {
          background-color: #4F46E5;
          color: white;
          font-weight: 600;
        }

        .config-status {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .status-indicator {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
        }

        .status-indicator.env {
          background-color: #ECFDF5;
          color: #10B981;
        }

        .status-indicator.default {
          background-color: #EFF6FF;
          color: #3B82F6;
        }

        .status-indicator.local {
          background-color: #FFFBEB;
          color: #F59E0B;
        }

        .status-indicator.none {
          background-color: #FEF2F2;
          color: #EF4444;
        }

        .refresh-button {
          padding: 8px 16px;
          background-color: #4F46E5;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .refresh-button:hover:not(:disabled) {
          background-color: #4338CA;
        }

        .refresh-button:disabled,
        .refresh-button.loading {
          background-color: #9CA3AF;
          cursor: not-allowed;
        }

        .sync-time {
          font-size: 12px;
          color: #6B7280;
          margin-bottom: 12px;
        }

        .error-message {
          background-color: #FEF2F2;
          border: 1px solid #FCA5A5;
          border-radius: 6px;
          padding: 12px;
          margin-bottom: 16px;
          color: #DC2626;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .retry-button {
          padding: 6px 12px;
          background-color: #DC2626;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        }

        .retry-button:hover {
          background-color: #B91C1C;
        }

        .loading-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          gap: 16px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #E5E7EB;
          border-top-color: #4F46E5;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .loading-container p {
          color: #6B7280;
          margin: 0;
        }

        .data-container {
          overflow-x: auto;
        }

        .outbound-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        .outbound-table thead {
          background-color: #F9FAFB;
        }

        .outbound-table th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 2px solid #E5E7EB;
        }

        .outbound-table td {
          padding: 12px;
          border-bottom: 1px solid #E5E7EB;
          color: #4B5563;
        }

        .outbound-table tbody tr:hover {
          background-color: #F9FAFB;
        }

        .no-data {
          text-align: center;
          padding: 40px 20px;
          color: #6B7280;
        }

        .no-data p {
          margin: 0 0 8px 0;
          font-size: 16px;
        }

        .info-text {
          font-size: 13px;
          color: #9CA3AF;
        }

        /* 모바일 반응형 */
        @media (max-width: 768px) {
          .outbound-tabs {
            padding: 16px;
            border-radius: 0;
            box-shadow: none;
          }

          .outbound-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }

          .outbound-title {
            font-size: 20px;
          }

          .tab-navigation {
            flex-wrap: wrap;
            gap: 6px;
          }

          .tab-button {
            padding: 8px 16px;
            font-size: 13px;
            flex: 1;
            min-width: 100px;
          }

          .data-container {
            overflow-x: auto;
          }

          .outbound-table {
            font-size: 12px;
          }

          .outbound-table th,
          .outbound-table td {
            padding: 8px;
            white-space: nowrap;
          }
        }
      `}</style>
    </div>
  );
};

export default OutboundTabs;