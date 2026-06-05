/**
 * VF Outbound 탭 환경변수 처리 모듈
 *
 * Google Sheet URL을 안전하게 처리합니다.
 * 환경변수가 있으면 직접 사용, 없으면 백엔드 API를 통해 접근합니다.
 */

interface OutboundConfig {
  googleSheetUrl: string;
  useBackendProxy: boolean;
}

// 기본 Google Sheets URL (CSV 출력)
const DEFAULT_OUTBOUND_GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv';

/**
 * Google Sheet URL을 안전하게 가져옵니다.
 *
 * @returns Google Sheet URL 문자열
 */
export function getOutboundGoogleSheetUrl(): string {
  // 환경변수가 있는 경우 직접 사용
  const envUrl = typeof process !== 'undefined' && process.env ? process.env.OUTBOUND_GOOGLE_SHEET_URL : '';
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }
  
  // 환경변수가 없는 경우 백엔드 API를 통해 기본 URL 사용
  // 백엔드 API가 Google Sheets에 접근하여 데이터를 반환
  return '/api/google-sheets/proxy?url=' + encodeURIComponent(DEFAULT_OUTBOUND_GOOGLE_SHEET_URL);
}

/**
 * Outbound 탭 설정을 가져옵니다.
 *
 * @returns OutboundConfig 객체
 */
export function getOutboundConfig(): OutboundConfig {
  try {
    const envUrl = typeof process !== 'undefined' && process.env ? process.env.OUTBOUND_GOOGLE_SHEET_URL : '';
    const hasEnvVariable = !!(envUrl && envUrl.trim());
    
    const googleSheetUrl = getOutboundGoogleSheetUrl();
    const useBackendProxy = !hasEnvVariable;
    
    return {
      googleSheetUrl,
      useBackendProxy,
    };
  } catch (error) {
    throw error;
  }
}



/**
 * Outbound 데이터를 가져옵니다.
 * 백엔드 API를 통해 Google Sheets 데이터에 접근합니다.
 *
 * @returns Promise<unknown>
 */
export async function fetchOutboundData(): Promise<unknown> {
  try {
    const config = getOutboundConfig();

    if (config.googleSheetUrl) {
      const response = await fetch(config.googleSheetUrl);

      if (!response.ok) {
        throw new Error(`Google Sheet 데이터 fetch 실패: ${response.status} ${response.statusText}`);
      }

      // 백엔드 API는 항상 JSON 응답을 반환
      const jsonData = await response.json();
      return jsonData;
    }

    throw new Error('데이터를 가져올 수 있는 소스가 없습니다.');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Outbound 데이터를 가져오는 중 오류 발생: ${error.message}`);
    }
    throw new Error('Outbound 데이터를 가져오는 중 알 수 없는 오류가 발생했습니다.');
  }
}

/**
 * 환경변수 설정 상태를 확인합니다.
 *
 * @returns 상태 객체
 */
export function checkOutboundConfigStatus(): {
  hasEnvVariable: boolean;
  hasLocalFile: boolean;
  usingSource: 'env' | 'default' | 'none';
  url?: string;
} {
  const envUrl = typeof process !== 'undefined' && process.env ? process.env.OUTBOUND_GOOGLE_SHEET_URL : '';
  const hasEnvVariable = !!(envUrl && envUrl.trim());

  const hasLocalFile = false; // 브라우저 환경에서는 로컬 파일 확인 불가
  let usingSource: 'env' | 'default' | 'none';
  let url: string | undefined;

  if (hasEnvVariable) {
    usingSource = 'env';
    url = envUrl?.trim();
  } else if (DEFAULT_OUTBOUND_GOOGLE_SHEET_URL) {
    usingSource = 'default';
    url = DEFAULT_OUTBOUND_GOOGLE_SHEET_URL;
  } else {
    usingSource = 'none';
  }

  return {
    hasEnvVariable,
    hasLocalFile,
    usingSource,
    url,
  };
}
