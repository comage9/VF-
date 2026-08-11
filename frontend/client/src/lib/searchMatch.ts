/**
 * 로케이션 검색 유틸 — 모든 페이지에서 공유
 *
 * 로케이션 패턴 예시:
 *   320-A1-1-164, 310-A1-E-32, 320-B2-45, TEST-F3-01
 *
 * 조건: 6자 이상, 대시(-)로 구분된 3~4개 세그먼트 (숫자+알파벳 혼합)
 */
export function isLocationPattern(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length < 6) return false;
  // 대시로 구분된 3~4개 세그먼트, 각 세그먼트는 숫자와 알파벳 포함
  const segs = trimmed.split(/[-\s]+/);
  if (segs.length < 3 || segs.length > 5) return false;
  return segs.every((s) => s.length >= 1 && /^[A-Za-z0-9]+$/.test(s));
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
