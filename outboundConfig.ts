/**
 * VF Outbound 탭 환경변수 처리 모듈
 *
 * Google Sheet URL을 안전하게 처리하고, 환경변수가 없는 경우
 * 기본 URL을 사용합니다.
 */

interface OutboundConfig {
  googleSheetUrl: string;
}

interface OutboundData {
  [key: string]: unknown;
}

// 기본 Google Sheets URL (CSV 출력) - CORS 프록시 사용
const DEFAULT_OUTBOUND_GOOGLE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv';

// CORS 프록시 URL (로컬 프록시 서버 또는 백엔드 API 사용)
// 옵션 1: 로컬 CORS 프록시 서버 (cors-proxy-server.js)
const CORS_PROXY_URL = 'http://127.0.0.1:3001/';
// 옵션 2: 백엔드 API 프록시 (Vite 설정 필요)
// const CORS_PROXY_URL = '/api/proxy/google-sheets?url=';

// 현재 사용할 프록시 선택
const USE_LOCAL_PROXY = true; // true: 로컬 프록시, false: 백엔드 API

/**
 * Google Sheet URL을 안전하게 가져옵니다.
 *
 * @returns Google Sheet URL 문자열
 */
export function getOutboundGoogleSheetUrl(): string {
  // 환경변수가 있는 경우 우선 사용
  const envUrl = typeof process !== 'undefined' && process.env ? process.env.OUTBOUND_GOOGLE_SHEET_URL : '';

  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }

  // 환경변수가 없는 경우 프록시를 통해 기본 URL 사용
  if (USE_LOCAL_PROXY) {
    console.log('환경변수 OUTBOUND_GOOGLE_SHEET_URL이 설정되지 않았습니다. 로컬 CORS 프록시를 통해 기본 URL을 사용합니다.');
    // 로컬 프록시: URL을 직접 연결
    return CORS_PROXY_URL + DEFAULT_OUTBOUND_GOOGLE_SHEET_URL.replace('https://docs.google.com/', '');
  } else {
    console.log('환경변수 OUTBOUND_GOOGLE_SHEET_URL이 설정되지 않았습니다. 백엔드 API 프록시를 통해 기본 URL을 사용합니다.');
    // 백엔드 API: URL을 인코딩하여 전달
    return CORS_PROXY_URL + encodeURIComponent(DEFAULT_OUTBOUND_GOOGLE_SHEET_URL);
  }
}

/**
 * Outbound 탭 설정을 가져옵니다.
 * 환경변수만 사용합니다.
 *
 * @returns OutboundConfig 객체
 */
export function getOutboundConfig(): OutboundConfig {
  try {
    const googleSheetUrl = getOutboundGoogleSheetUrl();
    return {
      googleSheetUrl,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * CSV 문자열을 JSON 객체 배열로 파싱합니다.
 * 쉼표가 포함된 필드를 올바르게 처리합니다.
 *
 * @param csvString CSV 형식의 문자열
 * @returns 파싱된 JSON 객체 배열
 */
function parseCSV(csvString: string): any[] {
  const lines = csvString.split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    return [];
  }

  // 헤더 파싱
  const headers = lines[0].split(',').map(header => header.trim().replace(/^"|"$/g, ''));

  // 데이터 파싱 - 쉼표가 포함된 필드 처리
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 쉼표가 포함된 필드 처리를 위한 파싱
    const values = [];
    let currentValue = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];

      if (char === '"') {
        if (inQuotes && j + 1 < line.length && line[j + 1] === '"') {
          // 따옴표 안의 따옴표 처리
          currentValue += '"';
          j++; // 다음 따옴표 건너뛰기
        } else {
          // 따옴표 시작/종료
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // 따옴표 밖의 쉼표는 구분자
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // 마지막 값 추가
    values.push(currentValue.trim());

    // 필드 개수 검증
    if (values.length === headers.length) {
      const row: any = {};
      headers.forEach((header, index) => {
        let value = values[index] || '';

        // 따옴표 제거
        value = value.replace(/^"|"$/g, '');

        // 불필요한 공백 제거
        value = value.trim();

        row[header] = value;
      });
      data.push(row);
    }
  }

  return data;
}

/**
 * Outbound 데이터를 가져옵니다.
 * Google Sheet URL에서 CSV 데이터를 fetch하고 파싱합니다.
 *
 * @returns Promise<unknown>
 */
export async function fetchOutboundData(): Promise<unknown> {
  try {
    const config = getOutboundConfig();

    // Google Sheet URL에서 데이터 fetch
    if (config.googleSheetUrl) {
      const response = await fetch(config.googleSheetUrl);

      if (!response.ok) {
        throw new Error(`Google Sheet 데이터 fetch 실패: ${response.status} ${response.statusText}`);
      }

      const csvText = await response.text();

      // CSV 파싱
      const parsedData = parseCSV(csvText);

      if (parsedData.length === 0) {
        console.warn('파싱된 데이터가 없습니다.');
        return [];
      }

      return parsedData;
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
