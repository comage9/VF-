/**
 * 입고 기간 메트릭 — 스캐너용 SoT 미러
 * 원본: frontend/client/src/lib/inboundPeriodMetrics.ts
 * 로직 변경 시 반드시 TS 파일과 동기화할 것.
 *
 * 일평균:
 *   base = 90일(3개월) 우선 · 급증 시 14d/30d 가산(TREND_WEIGHT=0.4)
 * hold / gap / available — TS 와 동일
 * available: stock===0 && orderIn>0 → orderIn (전산0 입고가능 미표기 방지)
 */
(function (global) {
  'use strict';

  var OUTBOUND_TREND_WEIGHT = 0.4;

  function resolveAvgDailyFromUnified(stock, _days) {
    if (!stock) return { avg: 0, source: '' };
    var a14 = Number(stock.avgDailyOutbound14d) || 0;
    var a30 = Number(stock.avgDailyOutbound30d) || 0;
    var a60 = Number(stock.avgDailyOutbound60d) || 0;
    var a90 = Number(stock.avgDailyOutbound90d) || 0;

    var base = 0;
    var baseSrc = '';
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

    var recent = a14 > 0 ? a14 : a30 > 0 ? a30 : 0;
    var recentSrc = a14 > 0 ? '14d' : a30 > 0 ? '30d' : '';
    if (recent > base && recentSrc) {
      return {
        avg: base + (recent - base) * OUTBOUND_TREND_WEIGHT,
        source: baseSrc + '+surge(' + recentSrc + ')',
      };
    }
    return { avg: base, source: baseSrc };
  }

  function calcHoldQty(avg, days) {
    var d = Math.max(1, parseInt(days, 10) || 10);
    var rawHold = (Number(avg) || 0) * d;
    return rawHold < 0.5 ? 0 : Math.round(rawHold);
  }

  /**
   * @param {{ currentStock:number, days:number, avgDaily?:number, stockFields?:object, orderIn?:number }} input
   */
  function calcInboundPeriodMetrics(input) {
    input = input || {};
    var days = Math.max(1, parseInt(input.days, 10) || 10);
    var avg = 0;
    var avgSource = '';
    if (input.avgDaily != null && isFinite(Number(input.avgDaily))) {
      avg = Number(input.avgDaily) || 0;
      avgSource = 'explicit';
    } else {
      var r = resolveAvgDailyFromUnified(input.stockFields, days);
      avg = r.avg;
      avgSource = r.source;
    }
    var stock = Math.max(0, Number(input.currentStock) || 0);
    var orderIn = Math.max(0, Number(input.orderIn) || 0);
    var hold = calcHoldQty(avg, days);
    var gap = Math.max(0, hold - stock);
    // 전산 0 + 확정 있음 → 입고가능 = 확정 (hold/gap 0이어도 표기)
    var available;
    if (stock === 0 && orderIn > 0) {
      available = orderIn;
    } else if (orderIn > 0) {
      available = Math.min(gap, orderIn);
    } else {
      available = gap;
    }
    var extraOrder = Math.max(0, hold - stock - orderIn);
    return {
      avg: avg,
      avgSource: avgSource,
      days: days,
      stock: stock,
      hold: hold,
      gap: gap,
      orderIn: orderIn,
      available: available,
      extraOrder: extraOrder,
    };
  }

  var api = {
    OUTBOUND_TREND_WEIGHT: OUTBOUND_TREND_WEIGHT,
    resolveAvgDailyFromUnified: resolveAvgDailyFromUnified,
    calcHoldQty: calcHoldQty,
    calcInboundPeriodMetrics: calcInboundPeriodMetrics,
  };

  global.InboundPeriodMetrics = api;
})(typeof window !== 'undefined' ? window : this);
