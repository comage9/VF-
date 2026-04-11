// 출고량 통계 패널 - production-plan.tsx 공용

import { useMemo } from "react";
import { TrendingDown, TrendingUp, AlertTriangle, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOutboundStats, useInventory } from "./api";

const NUMBER_FMT = new Intl.NumberFormat("ko-KR");

export function OutboundStatsPanel() {
  const { data: statsData, isLoading: statsLoading, error: statsError } = useOutboundStats(7);
  const { data: inventoryData, isLoading: invLoading } = useInventory();

  const inventoryItems = useMemo(() => {
    const raw = inventoryData?.items || inventoryData?.data || [];
    return raw as Array<{
      id: string;
      product_name: string;
      current_stock: number;
      min_stock: number;
    }>;
  }, [inventoryData]);

  const productOutboundMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!statsData?.by_product) return map;
    for (const p of statsData.by_product) {
      map.set(p.product_name, p.quantity);
    }
    return map;
  }, [statsData]);

  // 재고 부족 제품 계산: 현재 재고 < 최소 보관량 + 일주일 출고량
  const lowStockProducts = useMemo(() => {
    return inventoryItems
      .map((item) => {
        const weeklyOutbound = productOutboundMap.get(item.product_name) || 0;
        const currentStock = item.current_stock ?? 0;
        const minStock = item.min_stock ?? 0;
        const threshold = minStock + weeklyOutbound;
        const deficit = threshold - currentStock;
        return {
          ...item,
          weeklyOutbound,
          threshold,
          deficit,
          isLow: currentStock < threshold,
        };
      })
      .filter((item) => item.isLow)
      .sort((a, b) => b.deficit - a.deficit);
  }, [inventoryItems, productOutboundMap]);

  // AI 추천: 부족한 제품 우선 생산 제안
  const recommendations = useMemo(() => {
    return lowStockProducts.map((item) => {
      const suggestedQty = Math.max(item.deficit, item.min_stock);
      return {
        product_name: item.product_name,
        current_stock: item.current_stock,
        min_stock: item.min_stock,
        weekly_outbound: item.weeklyOutbound,
        deficit: item.deficit,
        suggested_qty: suggestedQty,
        priority: item.deficit > item.min_stock ? "긴급" : "권장",
      };
    });
  }, [lowStockProducts]);

  if (statsLoading || invLoading) {
    return (
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Package className="w-4 h-4 animate-pulse" />
            <span className="text-sm">출고 통계 로딩 중...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (statsError) {
    return null; // 조용히 실패
  }

  const totalWeeklyOutbound = statsData?.summary?.totalQuantity || 0;

  return (
    <div className="space-y-3">
      {/* 일주일 출고량 요약 */}
      <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              <span className="font-semibold text-sm text-orange-800">최근 7일 출고량</span>
            </div>
            <Badge variant="outline" className="text-orange-700 border-orange-300 bg-orange-100">
              {statsData?.daily_trend?.length || 0}일
            </Badge>
          </div>
          <div className="text-2xl font-bold text-orange-900">
            {NUMBER_FMT.format(totalWeeklyOutbound)} <span className="text-sm font-normal text-orange-600">박스</span>
          </div>
          {statsData?.daily_trend && statsData.daily_trend.length > 1 && (
            <div className="mt-2 flex gap-1">
              {statsData.daily_trend.slice(-7).map((d) => (
                <div
                  key={d.date}
                  className="flex-1 bg-orange-200 rounded-sm relative group cursor-default"
                  style={{ height: `${Math.max(8, Math.min(40, (d.quantity / Math.max(...statsData.daily_trend.map(x => x.quantity || 1))) * 40))}px` }}
                  title={`${d.date}: ${NUMBER_FMT.format(d.quantity)}박스`}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {d.date}: {NUMBER_FMT.format(d.quantity)}박스
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* 제품별 출고량 상위 5개 */}
          {statsData?.by_product && statsData.by_product.length > 0 && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-orange-600 font-medium">제품별 출고량 (상위)</p>
              {statsData.by_product.slice(0, 5).map((p) => (
                <div key={p.product_name} className="flex justify-between text-xs">
                  <span className="text-orange-800">{p.product_name}</span>
                  <span className="font-medium text-orange-900">{NUMBER_FMT.format(p.quantity)}박스</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 최소 보관 기준 미달 제품 */}
      {lowStockProducts.length > 0 && (
        <Card className="border-red-200 bg-gradient-to-br from-red-50 to-rose-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="font-semibold text-sm text-red-800">재고 부족 ({lowStockProducts.length}개)</span>
            </div>
            <div className="space-y-2">
              {lowStockProducts.map((item) => (
                <div key={item.id} className="bg-white/60 rounded-lg p-2.5 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm text-red-900">{item.product_name}</span>
                    <Badge className={item.deficit > item.min_stock ? "bg-red-600" : "bg-amber-500"}>
                      {item.deficit > item.min_stock ? "긴급" : "주의"}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-xs text-red-700">
                    <div>
                      <span className="text-red-500">현재</span>
                      <p className="font-bold text-red-900">{NUMBER_FMT.format(item.current_stock)}</p>
                    </div>
                    <div>
                      <span className="text-red-500">최소+주출고</span>
                      <p className="font-bold text-red-900">{NUMBER_FMT.format(item.threshold)}</p>
                    </div>
                    <div>
                      <span className="text-red-500">부족량</span>
                      <p className="font-bold text-red-900">-{NUMBER_FMT.format(item.deficit)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI 생산 추천 */}
      {recommendations.length > 0 && (
        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-5 h-5 text-purple-600" />
              <span className="font-semibold text-sm text-purple-800">생산 우선순위 추천</span>
            </div>
            <div className="space-y-2">
              {recommendations.map((rec, idx) => (
                <div key={rec.product_name} className="bg-white/60 rounded-lg p-2.5">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                      <span className="font-medium text-sm text-purple-900">{rec.product_name}</span>
                    </div>
                    <Badge className={rec.priority === "긴급" ? "bg-red-600" : "bg-purple-500"}>
                      {rec.priority}
                    </Badge>
                  </div>
                  <div className="text-xs text-purple-700 ml-7">
                    추천 생산량: <span className="font-bold text-purple-900">{NUMBER_FMT.format(rec.suggested_qty)}개</span>
                    <span className="text-purple-500 ml-1">(부족: {NUMBER_FMT.format(rec.deficit)}, 주간출고: {NUMBER_FMT.format(rec.weekly_outbound)})</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
