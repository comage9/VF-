// 트럭 운송비 API hooks - TanStack Query 기반

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const API_BASE = "/truck-freight/api";

export interface TruckFreight {
  id: number;
  date: string | null;
  destination: string;
  quantity: number;
  unit: string;
  freight_fee: number;
  driver_name: string;
  phone: string;
  invoice_type: string;
  account_number: string;
  payment_status: string;
  note: string;
  /** 증빙 사진 URL (MEDIA) */
  photo_url?: string | null;
  has_photo?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type TruckFreightDraft = Omit<TruckFreight, "id" | "created_at" | "updated_at">;

export interface FreightMonthlyItem {
  month: string;
  count: number;
  fee: number;
}

export interface FreightInvoiceItem {
  invoice_type: string;
  count: number;
  fee: number;
  ratio: number;
}

export interface FreightSummary {
  monthly: FreightMonthlyItem[];
  by_invoice: FreightInvoiceItem[];
  total_count: number;
  total_fee: number;
  recent_new_count?: number;
}

// 드롭다운 옵션 상수
export const UNIT_OPTIONS = ["파렛트", "박스"];
export const INVOICE_OPTIONS = [
  "전자 계산서(유원피에스)",
  "전자 계산서(보노하우스)",
  "일반(유원피에스)",
];
export const PAYMENT_OPTIONS = ["입금", "미입금", "확인중"];

// 운송비 목록 조회
export function useTruckFreights(year?: number) {
  return useQuery<TruckFreight[]>({
    queryKey: ["truck-freights", year],
    queryFn: async () => {
      const url = year ? `${API_BASE}/list?year=${year}` : `${API_BASE}/list`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("운송비 목록을 불러오지 못했습니다.");
      const json = await res.json();
      return json.data as TruckFreight[];
    },
  });
}

// 요약 통계 조회
export function useFreightSummary() {
  return useQuery<FreightSummary>({
    queryKey: ["truck-freight-summary"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/summary`);
      if (!res.ok) throw new Error("운송비 통계를 불러오지 못했습니다.");
      return res.json();
    },
    staleTime: 30 * 1000,
  });
}

// 운송비 생성
export function useCreateFreight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: TruckFreightDraft) => {
      const res = await fetch(`${API_BASE}/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "생성 실패" }));
        throw new Error(err.error || "운송비 생성에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["truck-freights"] });
      queryClient.invalidateQueries({ queryKey: ["truck-freight-summary"] });
    },
  });
}

// 운송비 수정
export function useUpdateFreight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TruckFreightDraft> }) => {
      const res = await fetch(`${API_BASE}/detail/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "수정 실패" }));
        throw new Error(err.error || "운송비 수정에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["truck-freights"] });
      queryClient.invalidateQueries({ queryKey: ["truck-freight-summary"] });
    },
  });
}

// 운송비 삭제
export function useDeleteFreight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/detail/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "삭제 실패" }));
        throw new Error(err.error || "운송비 삭제에 실패했습니다.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["truck-freights"] });
      queryClient.invalidateQueries({ queryKey: ["truck-freight-summary"] });
    },
  });
}

// 엑셀 일괄 import
export function useImportFreight() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/import`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "import 실패" }));
        throw new Error(err.error || "엑셀 import에 실패했습니다.");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["truck-freights"] });
      queryClient.invalidateQueries({ queryKey: ["truck-freight-summary"] });
    },
  });
}

/** 증빙 사진 업로드 */
export function useUploadFreightPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch(`${API_BASE}/detail/${id}/photo`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "사진 업로드 실패" }));
        throw new Error(err.error || "사진 업로드에 실패했습니다.");
      }
      return res.json() as Promise<{ ok: boolean; data: TruckFreight }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["truck-freights"] });
    },
  });
}

/** 증빙 사진 삭제 */
export function useDeleteFreightPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/detail/${id}/photo`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "사진 삭제 실패" }));
        throw new Error(err.error || "사진 삭제에 실패했습니다.");
      }
      return res.json() as Promise<{ ok: boolean; data: TruckFreight }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["truck-freights"] });
    },
  });
}
