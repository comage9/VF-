/**
 * 안전한 숫자 포맷팅 유틸리티
 * toLocaleString 호출 시 타입 가드를 제공합니다
 */

/**
 * 숫자를 안전하게 로케일 문자열로 변환
 * @param value - 변환할 값 (number, string, 또는 any)
 * @param defaultValue - 변환 실패 시 반환할 기본값
 * @returns 포맷된 숫자 문자열
 */
export function safeToLocaleString(value: any, defaultValue: string = '0'): string {
  // null, undefined 체크
  if (value == null) {
    return defaultValue;
  }

  // 이미 문자열이고 숫자가 아닌 경우
  if (typeof value === 'string' && isNaN(Number(value))) {
    return value;
  }

  // 숫자로 변환 시도
  const numValue = typeof value === 'number' ? value : Number(value);
  
  // NaN 또는 Infinity 체크
  if (isNaN(numValue) || !isFinite(numValue)) {
    return defaultValue;
  }

  return numValue.toLocaleString();
}

/**
 * 백분율을 안전하게 포맷팅
 * @param value - 변환할 값
 * @param decimals - 소수점 자릿수 (기본값: 1)
 * @returns 포맷된 백분율 문자열
 */
export function safeToPercentage(value: any, decimals: number = 1): string {
  const numValue = typeof value === 'number' ? value : Number(value);
  
  if (isNaN(numValue) || !isFinite(numValue)) {
    return '0%';
  }

  return `${numValue.toFixed(decimals)}%`;
}

/**
 * 통화 형식으로 안전하게 포맷팅
 * @param value - 변환할 값
 * @param currency - 통화 코드 (기본값: 'KRW')
 * @returns 포맷된 통화 문자열
 */
export function safeToCurrency(value: any, currency: string = 'KRW'): string {
  const numValue = typeof value === 'number' ? value : Number(value);
  
  if (isNaN(numValue) || !isFinite(numValue)) {
    return '₩0';
  }

  try {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: currency
    }).format(numValue);
  } catch (error) {
    // Intl 실패 시 기본 포맷 사용
    return `₩${numValue.toLocaleString()}`;
  }
}

/**
 * 소수점이 있는 숫자를 안전하게 포맷팅
 * @param value - 변환할 값
 * @param decimals - 소수점 자릿수 (기본값: 2)
 * @returns 포맷된 소수점 숫자 문자열
 */
export function safeToFixed(value: any, decimals: number = 2): string {
  const numValue = typeof value === 'number' ? value : Number(value);
  
  if (isNaN(numValue) || !isFinite(numValue)) {
    return '0.00';
  }

  return numValue.toFixed(decimals);
}

/**
 * 단위가 있는 숫자를 안전하게 포맷팅 (K, M, B 단위)
 * @param value - 변환할 값
 * @param decimals - 소수점 자릿수 (기본값: 1)
 * @returns 단위가 포함된 포맷된 문자열
 */
export function safeToCompactNumber(value: any, decimals: number = 1): string {
  const numValue = typeof value === 'number' ? value : Number(value);
  
  if (isNaN(numValue) || !isFinite(numValue)) {
    return '0';
  }

  if (numValue >= 1000000000) {
    return `${(numValue / 1000000000).toFixed(decimals)}B`;
  } else if (numValue >= 1000000) {
    return `${(numValue / 1000000).toFixed(decimals)}M`;
  } else if (numValue >= 1000) {
    return `${(numValue / 1000).toFixed(decimals)}K`;
  }

  return numValue.toLocaleString();
}