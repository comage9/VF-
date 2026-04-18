/**
 * VF Outbound 탭 환경변수 처리 사용 예시
 */

import {
  getOutboundGoogleSheetUrl,
  getOutboundConfig,
  fetchOutboundData,
  checkOutboundConfigStatus,
} from './outboundConfig';

// 예시 1: Google Sheet URL 가져오기
export async function exampleGetUrl() {
  try {
    const url = getOutboundGoogleSheetUrl();
    console.log('Google Sheet URL:', url);
    return url;
  } catch (error) {
    console.error('URL 가져오기 실패:', error);
    throw error;
  }
}

// 예시 2: Outbound 설정 가져오기
export async function exampleGetConfig() {
  try {
    const config = getOutboundConfig();
    console.log('Outbound Config:', config);
    return config;
  } catch (error) {
    console.error('설정 가져오기 실패:', error);
    throw error;
  }
}

// 예시 3: Outbound 데이터 fetch
export async function exampleFetchData() {
  try {
    const data = await fetchOutboundData();
    console.log('Outbound Data:', data);
    return data;
  } catch (error) {
    console.error('데이터 fetch 실패:', error);
    throw error;
  }
}

// 예시 4: 설정 상태 확인
export async function exampleCheckStatus() {
  const status = checkOutboundConfigStatus();
  console.log('Config Status:', status);

  if (status.usingSource === 'env') {
    console.log('✅ 환경변수 사용 중');
  } else if (status.usingSource === 'local') {
    console.log('⚠️  로컬 JSON 파일 사용 중 (권장하지 않음)');
  } else {
    console.log('❌ 유효한 설정 없음');
  }

  return status;
}

// 예시 5: React 컴포넌트에서 사용
/*
import { useEffect, useState } from 'react';
import { fetchOutboundData, checkOutboundConfigStatus } from './outboundConfig';

export function OutboundTab() {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // 설정 상태 먼저 확인
        const status = checkOutboundConfigStatus();
        console.log('Outbound 데이터 소스:', status.usingSource);

        // 데이터 fetch
        const outboundData = await fetchOutboundData();
        setData(outboundData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '데이터 로드 실패');
        console.error('Outbound 데이터 로드 오류:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return <div>로딩 중...</div>;
  }

  if (error) {
    return (
      <div>
        <p style={{ color: 'red' }}>{error}</p>
        <p>OUTBOUND_GOOGLE_SHEET_URL 환경변수를 확인해주세요.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>Outbound 데이터</h2>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
*/
