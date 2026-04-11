// 공통 API hooks - production-plan.tsx 공용

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ProductionItem, ProductionDraft } from "./types";

const API_BASE = "/api";

// 생산계획 목록
export function useProductionPlans(date?: string) {
  return useQuery({
    queryKey: ["production-plans", date],
    queryFn: async () => {
      const url = date ? `${API_BASE}/production?date=${date}` : `${API_BASE}/production`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
}

// 생산계획 생성
export function useCreateProduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ProductionDraft) => {
      const res = await fetch(`${API_BASE}/production`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-plans"] });
    },
  });
}

// 생산계획 수정
export function useUpdateProduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ProductionDraft> }) => {
      const res = await fetch(`${API_BASE}/production/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-plans"] });
    },
  });
}

// 생산계획 삭제
export function useDeleteProduction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/production/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-plans"] });
    },
  });
}

// 재고 목록
export function useInventory() {
  return useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/inventory/`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
}

// 재고 수정
export function useUpdateInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { current_stock: number } }) => {
      const res = await fetch(`${API_BASE}/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
  });
}

// 출고 통계 (최근 7일)
export interface OutboundStatsSummary {
  totalCount: number;
  totalQuantity: number;
  totalSalesAmount: number;
}

export interface OutboundProductStat {
  product_name: string;
  quantity: number;
  sales_amount: number;
}

export interface OutboundStatsData {
  summary: OutboundStatsSummary;
  daily_trend: Array<{ date: string; quantity: number; sales_amount: number }>;
  by_product: OutboundProductStat[];
}

export function useOutboundStats(days: number = 7) {
  return useQuery({
    queryKey: ["outbound-stats", days],
    queryFn: async () => {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const res = await fetch(`${API_BASE}/outbound/stats?start=${start}&end=${end}&groupBy=day`);
      if (!res.ok) throw new Error("출고 통계를 불러오지 못했습니다.");
      return res.json() as Promise<OutboundStatsData>;
    },
    staleTime: 10 * 60 * 1000,
  });
}

// AI 추천
export function useAiRecommend() {
  return useQuery({
    queryKey: ["ai-recommend"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/ai/production-recommend`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });
}
