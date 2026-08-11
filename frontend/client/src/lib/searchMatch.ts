/**
 * 로케이션 검색 유틸 — 모든 페이지에서 공유
 *
 * 로케이션 패턴 예시:
 *   320-A1-1-164, 310-A1-E-32, 320-B2-45
 *
 * 조건: 영숫자-영숫자-영숫자-영숫자 형태, 6자 이상
 */
export function isLocationPattern(input: string): boolean {
  const trimmed = input.trim();
  // 최소 6자, 숫자 또는 알파벳 시작, 중간에 대시/공백 포함
  return (
    trimmed.length >= 6 &&
    /^\d+[A-Za-z]+\d*[-\s]?\d*[A-Za-z]?\d*$/.test(trimmed)
  );
}

/**
 * 기존 searchMatch 함수 — isLocationPattern과 함께 사용
 */
export function matchesSearchInFields(
  item: Record<string, any>,
  fields: string[],
  term: string
): boolean {
  if (!term.trim()) return true;
  const lower = term.toLowerCase();
  return fields.some((field) => {
    const value = item[field];
    if (value == null) return false;
    return String(value).toLowerCase().includes(lower);
  });
}
