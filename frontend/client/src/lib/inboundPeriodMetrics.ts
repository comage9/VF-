/**
 * 입고 기간 메트릭 — 단일 공식 (SoT)
 *
 * 사용처:
 * - 입고 가능 탭 (`inbound-availability-tab.tsx`)
 * - 바코드 스캐너 (`public/js/inbound-period-metrics.js` 와 동일 로직 유지)
 *
 * 일평균 출고:
 *   base   = 최근 90일(≈3개월) 일평균 우선
 *   recent = 14일(없으면 30일) — 급증 가산용
 *   최근이 base보다 크면: base + (recent−base)×TREND_WEIGHT
 *   (하락 시 3개월 평균 유지 — 보수적으로 재고 목표 유지)
 *
 * 보유·입고:
 *   hold     = round(avg × N)  (raw < 0.5 → 0)
 *   gap      = max(0, hold − stock)
 *   available=
 *     - 전산 stock === 0 이고 확정 orderIn > 0 → orderIn
 *       (재고 0인데 입고가능이 0으로 사라지는 문제 방지 — 스캐너/입고탭 공통)
 *     - orderIn > 0 → min(gap, orderIn)
 *     - 그 외 → gap
 *   extraOrder = max(0, hold − stock − orderIn)
 */

export type AvgStockFields = {
  avgDailyOutbound14d?: number | null;
  avgDailyOutbound30d?: number | null;
  avgDailyOutbound60d?: number | null;
  /** 최근 90일(≈3개월) 일평균 — 입고 가능 기준 */
  avgDailyOutbound90d?: number | null;
};

/** 급증분 반영 비중: (recent − base)의 40%를 base에 가산 */
export const OUTBOUND_TREND_WEIGHT = 0.4;

/**
 * 3개월 일평균 + 최근 급증 가중.
 * N일 보유 목표의 일속도 — 기간(N)과 무관하게 동일 일평균 사용.
 */
export function resolveAvgDailyFromUnified(
  stock: AvgStockFields | null | undefined,
  _days?: number
): { avg: number; source: string } {
  if (!stock) return { avg: 0, source: '' };

  const a14 = Number(stock.avgDailyOutbound14d) || 0;
  const a30 = Number(stock.avgDailyOutbound30d) || 0;
  const a60 = Number(stock.avgDailyOutbound60d) || 0;
  const a90 = Number(stock.avgDailyOutbound90d) || 0;

  // 3개월 우선, 없으면 60→30→14 폴백
  let base = 0;
  let baseSrc = '';
  if (a90 > 0) {
    base = a90;
    baseSrc = '90d';
  } else if (a60 > 0) {
    base = a60;
    baseSrc = '60d';
  } else if (a30 > 0) {
    base = a30;
    baseSrc = '30d';
  } else if (a14 > 0) {
    base = a14;
    baseSrc = '14d';
  }

  if (base <= 0) return { avg: 0, source: '' };

  // 최근 동향: 14일 우선, 없으면 30일
  const recent = a14 > 0 ? a14 : a30 > 0 ? a30 : 0;
  const recentSrc = a14 > 0 ? '14d' : a30 > 0 ? '30d' : '';

  if (recent > base && recentSrc) {
    const boosted = base + (recent - base) * OUTBOUND_TREND_WEIGHT;
    return {
      avg: boosted,
      source: `${baseSrc}+surge(${recentSrc})`,
    };
  }

  return { avg: base, source: baseSrc };
}

/** N일 보유 목표 */
export function calcHoldQty(avg: number, days: number): number {
  const d = Math.max(1, parseInt(String(days), 10) || 10);
  const rawHold = (Number(avg) || 0) * d;
  // 일평균 표기 0.0 수준 노이즈로 hold=1 되는 것 방지
  return rawHold < 0.5 ? 0 : Math.round(rawHold);
}

export type InboundPeriodInput = {
  currentStock: number;
  days: number;
  /** 명시 일평균. 없으면 stockFields로 산출 */
  avgDaily?: number | null;
  stockFields?: AvgStockFields | null;
  /**
   * 확정/발주 수량.
   * 0 또는 미지정 → 상한 없음 (available = gap = 권장 입고)
   */
  orderIn?: number | null;
};

export type InboundPeriodResult = {
  avg: number;
  avgSource: string;
  days: number;
  stock: number;
  hold: number;
  gap: number;
  orderIn: number;
  /** 화면 입고가능 / 권장 */
  available: number;
  extraOrder: number;
};

export function calcInboundPeriodMetrics(
  input: InboundPeriodInput
): InboundPeriodResult {
  const days = Math.max(1, parseInt(String(input.days), 10) || 10);

  let avg = 0;
  let avgSource = '';
  if (input.avgDaily != null && Number.isFinite(Number(input.avgDaily))) {
    avg = Number(input.avgDaily) || 0;
    avgSource = 'explicit';
  } else {
    const r = resolveAvgDailyFromUnified(input.stockFields, days);
    avg = r.avg;
    avgSource = r.source;
  }

  const stock = Math.max(0, Number(input.currentStock) || 0);
  const orderIn = Math.max(0, Number(input.orderIn) || 0);
  const hold = calcHoldQty(avg, days);
  const gap = Math.max(0, hold - stock);
  // 전산 0 + 확정 있음 → 입고가능 = 확정 (hold/gap이 0이어도 표기)
  let available: number;
  if (stock === 0 && orderIn > 0) {
    available = orderIn;
  } else if (orderIn > 0) {
    available = Math.min(gap, orderIn);
  } else {
    available = gap;
  }
  const extraOrder = Math.max(0, hold - stock - orderIn);

  return {
    avg,
    avgSource,
    days,
    stock,
    hold,
    gap,
    orderIn,
    available,
    extraOrder,
  };
}
