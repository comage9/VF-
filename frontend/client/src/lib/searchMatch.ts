/**
 * 제품/재고 검색: 띄어쓰기(및 일부 구분자)로 나눈 단어가
 * 순서와 관계없이 모두 포함되면 매칭 (AND, order-independent).
 *
 * 예) 쿼리 "로커스 S 두 개 그레이"
 *     품명 "로커스 S 그레이 2개" 등은 각 토큰이 포함되면 매칭
 *     (단, "두"/"개" vs "2개"처럼 표기가 다르면 해당 토큰은 불일치)
 */

/** 검색어를 토큰으로 분리 */
export function splitSearchTokens(query: string): string[] {
  return (query || "")
    .toLowerCase()
    .trim()
    .split(/[\s,./|·•]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * 하나의 문자열(품명 등)에 모든 토큰이 포함되는지
 */
export function matchesSearchTokens(
  haystack: string | null | undefined,
  query: string
): boolean {
  const h = String(haystack || "").toLowerCase();
  const tokens = splitSearchTokens(query);
  if (tokens.length === 0) return true;
  return tokens.every((t) => h.includes(t));
}

/**
 * 여러 필드(품명, 바코드, SKU, 로케이션 등)를 합쳐 검색.
 * 각 토큰은 어느 필드에 있어도 되고, 모든 토큰이 나와야 함.
 */
export function matchesSearchInFields(
  fields: Array<string | null | undefined>,
  query: string
): boolean {
  const tokens = splitSearchTokens(query);
  if (tokens.length === 0) return true;
  const blob = fields
    .map((f) => String(f || "").toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (!blob) return false;
  return tokens.every((t) => blob.includes(t));
}
