import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Edit, Wand2, Package, Search, CheckSquare, X, ArrowUp, ArrowDown, ArrowUpDown, Download, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState, useMemo, useRef } from "react";
import { ProductOutboundChartDialog } from "@/components/master/product-outbound-chart-dialog";
import {
  SpecEditDialog,
  CategoryPickField,
  FINISH_FINISHED,
  FINISH_NEEDS_PACKAGING,
} from "@/components/master/spec-edit-dialog";
import { matchesSearchInFields } from "@/lib/searchMatch";

// Types
interface Spec {
  id: number;
  product_name: string;
  product_name_eng?: string;
  /** 제품 번호 (백엔드 제공) — null 가능 */
  product_number?: number | null;
  mold_number?: string;
  color1?: string;
  color2?: string;
  default_quantity?: number;
  sku_id?: string;
  barcode?: string;
  /** BarcodeMaster.location 조인 (SoT) — 수동 저장 시 BM 자동 등록 */
  location?: string;
  category_lg?: string;
  category_md?: string;
  price?: number;
  prev_price?: number;
  price_changed_at?: string;
  lot_number?: string;
  components?: string;
  /** 제품 비고 — 목록 제품명 호버 시 표시 */
  notes?: string;
  image_url?: string;
  is_discontinued?: boolean; // 추가: 단종 여부
  /**
   * 상태열 3개월 미출고.
   * VF: 90일 실출고 없음 · 비VF: 90일 FC 입고(센터 납품) 없음
   */
  is_no_outbound_3m?: boolean;
  is_vf_item?: boolean; // VF 창고 운영 품목
  /** finished=완제품, needs_packaging=포장 필요, ''=미지정 */
  finish_type?: string;
  /** 최근 90일 실출고 여부 (예측 제외). VF 카드 SoT */
  has_outbound_3m?: boolean;
  /** 전산 현재고 (VF 목록 API에서 제공) */
  current_stock?: number;
  /** VF 품목 카드 (실출고 또는 등록 유예) */
  is_vf_active?: boolean;
  /** VF 출고없음 카드 (실출고 없음) */
  is_vf_no_outbound?: boolean;
  /** VF 지정일 YYYY-MM-DD (쿠팡 발주서 CSV 등록 일자 등) */
  vf_registered_at?: string | null;
}

interface SpecDraft extends Omit<Spec, 'id'> {}

/**
 * VF 등록일(vf_registered_at)이 기준일 기준 N개월 이내인지.
 * 달 단위 (일 클램프) — 백엔드 add_months 와 동일 의도.
 * 등록일이 없으면 false (출고없음 확인 대상 가능).
 */
function isVfRegisteredWithinMonths(
  spec: Pick<Spec, "vf_registered_at">,
  months: number = 3,
  asOf: Date = new Date()
): boolean {
  const raw = (spec.vf_registered_at || "").toString().slice(0, 10);
  if (!raw || raw.length < 8) return false;
  const parts = raw.split("-").map((x) => parseInt(x, 10));
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return false;
  const [y, m, d] = parts;
  const reg = new Date(y, m - 1, d);
  if (Number.isNaN(reg.getTime())) return false;
  const asOfLocal = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  // asOf - months
  const since = new Date(asOfLocal);
  since.setMonth(since.getMonth() - months);
  // 말일 클램프: setMonth 가 넘어가면 자동 보정되므로 비교만 수행
  return reg >= since && reg <= asOfLocal;
}

/**
 * VF KPI 카드 분할 (백엔드 vf_classification 과 동일 의도)
 *
 * 기준(SoT): is_vf_item 만 = VF 전체 건수 (엑셀 865).
 * 아래 함수는 그 안에서의 **상태 분할**만 담당. is_vf 를 켜거나 끄지 않음.
 *
 * VF 출고(활성):
 *   is_vf + 비단종 + (등록 3개월 미만 OR 3개월 실출고)
 * VF 출고없음:
 *   is_vf + 3개월 실출고 없음 (등록 3개월 미만 유예는 출고 카드)
 *
 * API 가 is_vf_active / is_vf_no_outbound 를 주면 우선 사용.
 */
function isVfCardActive(spec: Spec): boolean {
  if (!spec.is_vf_item) return false;
  if (typeof spec.is_vf_active === "boolean") return spec.is_vf_active;
  if (spec.is_discontinued) return false;
  // 재고 0이어도 출고(또는 등록 유예)면 VF 품목
  if (isVfRegisteredWithinMonths(spec, 3)) return true;
  return !!(spec.has_outbound_3m ?? false);
}

function isVfCardNoOutboundNeedCheck(spec: Spec): boolean {
  if (!spec.is_vf_item) return false;
  if (typeof spec.is_vf_no_outbound === "boolean") return spec.is_vf_no_outbound;
  // VF 중 3개월 실출고 없는 제품만 (등록 3개월 미만은 VF 품목)
  if (isVfRegisteredWithinMonths(spec, 3)) return false;
  return !(spec.has_outbound_3m ?? false);
}

/** 선택적: FE stock map 연동용 (기본 null) */
let stockFallbackGet: ((bc: string) => number | undefined) | null = null;

type MasterSortKey =
  | "image"
  | "product_name"
  | "is_vf_item"
  | "barcode"
  | "sku_id"
  | "product_number"
  | "location"
  | "current_stock"
  | "finish_type"
  | "lot_number"
  | "price"
  | "tier_count"
  | "pack_count"
  | "category_lg"
  | "category_md"
  | "status";

/** 헤더 정렬 공통 비교 (VF 뷰·일반 탭 동일) */
function compareSpecsForSort(
  a: Spec,
  b: Spec,
  sortKey: MasterSortKey,
  sortDir: "asc" | "desc",
  stockByBarcode: Record<string, number>
): number {
  const dir = sortDir === "asc" ? 1 : -1;
  const statusRank = (s: Spec) => {
    if (s.is_discontinued) return 2;
    if (s.is_no_outbound_3m) return 1;
    return 0;
  };
  let cmp = 0;
  switch (sortKey) {
    case "image": {
      cmp = (a.image_url ? 1 : 0) - (b.image_url ? 1 : 0);
      break;
    }
    case "is_vf_item": {
      cmp = (a.is_vf_item ? 1 : 0) - (b.is_vf_item ? 1 : 0);
      break;
    }
    case "price":
      cmp = (a.price || 0) - (b.price || 0);
      break;
    case "status":
      cmp = statusRank(a) - statusRank(b);
      break;
    case "product_name":
      cmp = (a.product_name || "").localeCompare(b.product_name || "", "ko");
      break;
    case "barcode":
      cmp = (a.barcode || "").localeCompare(b.barcode || "", "ko");
      break;
    case "sku_id":
      cmp = (a.sku_id || "").localeCompare(b.sku_id || "", "ko", { numeric: true });
      break;
    case "product_number": {
      // null 은 항상 뒤로 (정렬 방향과 무관하게 하단)
      const pnA = a.product_number;
      const pnB = b.product_number;
      if (pnA == null && pnB == null) cmp = 0;
      else if (pnA == null) return 1;
      else if (pnB == null) return -1;
      else cmp = Number(pnA) - Number(pnB);
      break;
    }
    case "location":
      cmp = (a.location || "").localeCompare(b.location || "", "ko", { numeric: true });
      break;
    case "current_stock": {
      const bcA = (a.barcode || "").trim();
      const bcB = (b.barcode || "").trim();
      // 미조회(-1) 는 항상 뒤로 (정렬 방향과 무관하게 하단)
      const hasA = bcA && stockByBarcode[bcA] != null;
      const hasB = bcB && stockByBarcode[bcB] != null;
      if (!hasA && !hasB) cmp = 0;
      else if (!hasA) return 1;
      else if (!hasB) return -1;
      else cmp = Number(stockByBarcode[bcA]) - Number(stockByBarcode[bcB]);
      break;
    }
    case "finish_type": {
      // 미지정은 항상 뒤. 완제품(1) / 포장 필요(2).
      const rank = (s: Spec) => {
        const t = (s.finish_type || "").trim();
        if (t === "finished") return 1;
        if (t === "needs_packaging") return 2;
        return 0;
      };
      const ra = rank(a);
      const rb = rank(b);
      if (ra === 0 && rb === 0) cmp = 0;
      else if (ra === 0) return 1;
      else if (rb === 0) return -1;
      else cmp = ra - rb;
      break;
    }
    case "lot_number":
      cmp = (a.lot_number || "").localeCompare(b.lot_number || "", "ko");
      break;
    case "tier_count": {
      cmp = (getTierCount(a) ?? -1) - (getTierCount(b) ?? -1);
      break;
    }
    case "pack_count": {
      cmp = (getPackCount(a) ?? -1) - (getPackCount(b) ?? -1);
      break;
    }
    case "category_lg":
      cmp = (a.category_lg || "").localeCompare(b.category_lg || "", "ko");
      break;
    case "category_md":
      cmp = (a.category_md || "").localeCompare(b.category_md || "", "ko");
      break;
    default:
      cmp = 0;
  }
  if (cmp === 0) {
    return (a.product_name || "").localeCompare(b.product_name || "", "ko");
  }
  return cmp * dir;
}

function _isOpenStepProduct(spec: Pick<Spec, "product_name" | "product_name_eng" | "category_lg">): boolean {
  const blob = `${spec.product_name || ""} ${spec.product_name_eng || ""} ${spec.category_lg || ""}`;
  return /오픈\s*스텝|Open\s*step\s*basket/i.test(blob);
}

/**
 * 단수: 품명 "N단" 또는 오픈스텝(영문 basket N / default_quantity).
 * 예: R001022730002 → 1 (1단). 레브 2P 등 포장 품목에는 쓰지 않음.
 */
function getTierCount(
  spec: Pick<Spec, "product_name" | "product_name_eng" | "category_lg" | "default_quantity">
): number | null {
  const name = spec.product_name || "";
  const eng = spec.product_name_eng || "";
  const fromName = name.match(/(\d+)\s*단/);
  if (fromName) {
    const n = parseInt(fromName[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (_isOpenStepProduct(spec)) {
    const fromEng = eng.match(/basket(?:\s*\([^)]*\))?\s*(\d+)/i);
    if (fromEng) {
      const n = parseInt(fromEng[1], 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const dq = Number(spec.default_quantity || 0);
    if (dq > 0) return dq;
  }
  return null;
}

/**
 * 포장갯수: "N개" / "NP"(2P) / 영문 세트 수량 / (단수 품목이 아닐 때) default_quantity.
 * 예: BOX_레브… 2P → 2, 로코스 … 6개 → 6.
 */
function getPackCount(
  spec: Pick<Spec, "product_name" | "product_name_eng" | "category_lg" | "default_quantity">
): number | null {
  const name = spec.product_name || "";
  const eng = spec.product_name_eng || "";

  const fromGae = name.match(/(\d+)\s*개/);
  if (fromGae) {
    const n = parseInt(fromGae[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // 2P, 4P 등
  const fromP = name.match(/(\d+)\s*P\b/i) || eng.match(/(\d+)\s*P\b/i);
  if (fromP) {
    const n = parseInt(fromP[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  // Rev Storage M 2 NAVY-GRAY
  const fromEngSet = eng.match(/\b(?:M|L|S|XS)\s+(\d+)\s+/i);
  if (fromEngSet) {
    const n = parseInt(fromEngSet[1], 10);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // 단수(오픈스텝) 품목: default_quantity는 단수용 → 포장으로 쓰지 않음
  if (getTierCount(spec) != null || _isOpenStepProduct(spec) || /\d+\s*단/.test(name)) {
    return null;
  }

  const dq = Number(spec.default_quantity || 0);
  if (dq > 0) return dq;
  return null;
}

/**
 * 포장 상세: 예) NAVY-GRAY + 2개 → navy1-1개,gray1-1개
 */
function getPackDetail(
  spec: Pick<Spec, "product_name" | "product_name_eng" | "category_lg" | "default_quantity" | "color1" | "color2" | "components">
): string | null {
  if ((spec.components || "").trim()) {
    return (spec.components || "").trim();
  }
  const pack = getPackCount(spec);
  if (pack == null || pack <= 0) return null;

  const raw = (spec.color1 || "").trim() || (spec.color2 || "").trim();
  if (!raw) return null;
  const colors = raw
    .split(/[+\-\/,]/)
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c) => !/^\d+$/.test(c));
  if (colors.length < 2) return null;
  if (pack % colors.length !== 0) return null;
  const each = pack / colors.length;
  // navy1-1개,gray1-1개 형식
  return colors.map((c) => `${c.toLowerCase()}${each}-${each}개`).join(",");
}

// API Hooks
const useGetSpecs = () =>
  useQuery<Spec[]>({
    queryKey: ["/api/master/specs", "compact"],
    queryFn: async () => {
      // compact=1: 목록 필드만·빈 키 생략 (GZip 시 ~70KB, 전체 대비 대폭 축소)
      const res = await fetch("/api/master/specs?compact=1");
      if (!res.ok) throw new Error("Failed to fetch specs");
      return res.json();
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

const useSyncOutboundStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/master/specs/sync-outbound-status", { method: "POST" });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: '출고 상태 갱신 실패' }));
        throw new Error(errorData.message || 'Failed to sync outbound status');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/specs"] });
      alert(data.message || "최근 3개월 출고 상태 수동 갱신이 완료되었습니다.");
    },
    onError: (error: any) => {
      alert(`상태 갱신 실패: ${error.message}`);
    }
  });
};

const useCreateSpec = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (newSpec: SpecDraft) => fetch("/api/master/specs", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSpec),
        }).then(res => {
            if (!res.ok) throw new Error("제품 등록 실패");
            return res.json();
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["/api/master/specs"]});
            queryClient.invalidateQueries({queryKey: ["enhanced-inventory-overview"]});
            queryClient.invalidateQueries({queryKey: ["inventory-barcode-master"]});
        }
    });
}

const useUpdateSpec = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...updatedSpec }: Spec) => fetch(`/api/master/specs/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedSpec),
        }).then(async res => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || "제품 수정 실패");
            return data;
        }),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["/api/master/specs"]});
            queryClient.invalidateQueries({queryKey: ["enhanced-inventory-overview"]});
            queryClient.invalidateQueries({queryKey: ["inventory-barcode-master"]});
        }
    });
}

const useDeleteSpec = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => fetch(`/api/master/specs/${id}`, { method: 'DELETE' }),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["/api/master/specs"]});
            queryClient.invalidateQueries({queryKey: ["enhanced-inventory-overview"]});
            queryClient.invalidateQueries({queryKey: ["inventory-barcode-master"]});
        }
    });
}

// 벌크 업데이트 훅 (is_discontinued 및 is_no_outbound_3m 필드 지원)
const useBulkUpdateSpecs = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (payload: { ids: number[]; category_lg?: string; category_md?: string; color1?: string; color2?: string; location?: string; is_discontinued?: boolean; is_no_outbound_3m?: boolean; is_vf_item?: boolean; finish_type?: string }) => fetch("/api/master/specs/bulk-update", {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).then(res => {
            if (!res.ok) throw new Error("일괄 수정 실패");
            return res.json();
        }),
        onSuccess: (data) => {
            queryClient.invalidateQueries({queryKey: ["/api/master/specs"]});
            queryClient.invalidateQueries({queryKey: ["enhanced-inventory-overview"]});
            queryClient.invalidateQueries({queryKey: ["inventory-barcode-master"]});
            const loc = data.location_updated != null
              ? `\n· 로케이션 등록/수정: ${data.location_updated}건`
              : "";
            const skip = data.location_skipped_no_barcode
              ? `\n· 바코드 없음 스킵: ${data.location_skipped_no_barcode}건`
              : "";
            const vfSet =
              data.vf_set != null && data.vf_set > 0
                ? `\n· VF 지정: ${data.vf_set}건`
                : "";
            const vfUnset =
              data.vf_unset != null && data.vf_unset > 0
                ? `\n· VF 해제: ${data.vf_unset}건`
                : "";
            alert(
              `일괄 수정 완료: 마스터 필드 ${data.updated_count ?? 0}건` +
                vfSet +
                vfUnset +
                loc +
                skip
            );
        },
        onError: (err: any) => {
            alert(`일괄 수정 오류: ${err.message}`);
        }
    });
}

const PAGE_SIZE = 50;

// Component
export default function ProductMasterPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<Spec | null>(null);
  /** 품목명 클릭 → 출고 수량 그래프 (조회 전용) */
  const [reportSpec, setReportSpec] = useState<Spec | null>(null);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const openOutboundReport = (spec: Spec) => {
    setReportSpec(spec);
    setIsReportOpen(true);
  };

  // 일괄 선택 및 필터링 관련 상태
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterCategoryLg, setFilterCategoryLg] = useState<string>("all");
  const [filterCategoryMd, setFilterCategoryMd] = useState<string>("all");
  /** 제품 형태 필터: all | finished | needs_packaging */
  const [filterFinishType, setFilterFinishType] = useState<string>("all");

  /** 테이블 헤더 정렬: 컬럼 클릭 시 토글 */
  type SortKey = MasterSortKey;
  const bulkImportInputRef = useRef<HTMLInputElement | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  
  // 신설: 운영 품목(출고 진행) vs 3개월 미출고 vs 단종 품목 탭 상태
  const [activeTab, setActiveTab] = useState<'active' | 'no_outbound_3m' | 'discontinued'>('active');
  /** KPI 카드 선택 상태 — 카드 클릭 시 해당 범위 품목 표시 */
  const [kpiFocus, setKpiFocus] = useState<
    | "all"
    | "active"
    | "no_outbound_3m"
    | "discontinued"
    | "selected"
    | "vf"
    | "vf_no_outbound"
  >("all");
  const listSectionRef = useRef<HTMLDivElement | null>(null);

  const queryClient = useQueryClient();
  const { data: specs = [], isLoading } = useGetSpecs();
  const syncOutboundStatusMutation = useSyncOutboundStatus();
  const createMutation = useCreateSpec();
  const updateMutation = useUpdateSpec();
  const deleteMutation = useDeleteSpec();
  const bulkUpdateMutation = useBulkUpdateSpecs();

  /** 바코드 → 전산 현재고 (목록 페이지 단위 조회) */
  const [stockByBarcode, setStockByBarcode] = useState<Record<string, number>>({});

  /** VF 품목 카드: 실출고 있음 OR 등록 3개월 미만(신규 유예). 재고 0 포함 */
  const vfWithOutboundCount = useMemo(
    () => specs.filter((s) => isVfCardActive(s)).length,
    [specs]
  );
  /** VF 출고없음 확인: VF 중 3개월 실출고 없음만 (재고 무관) */
  const vfNoOutboundCount = useMemo(
    () => specs.filter((s) => isVfCardNoOutboundNeedCheck(s)).length,
    [specs]
  );
  const vfCount = useMemo(
    () => specs.filter((s) => s.is_vf_item).length,
    [specs]
  );
  const vfOnly = kpiFocus === "vf" || kpiFocus === "vf_no_outbound";

  // 1. 대분류 목록 추출 (현재 KPI/탭 범위)
  const uniqueCategoriesLg = useMemo(() => {
    const categories = new Set<string>();
    specs.forEach((s) => {
      if (kpiFocus === "all" || kpiFocus === "selected") {
        // 전체·선택: 제한 없음
      } else if (kpiFocus === "vf") {
        if (!isVfCardActive(s)) return;
      } else if (kpiFocus === "vf_no_outbound") {
        if (!isVfCardNoOutboundNeedCheck(s)) return;
      } else {
        const isDiscontinued = s.is_discontinued ?? false;
        const isNoOutbound3m = s.is_no_outbound_3m ?? false;
        const matchTab =
          activeTab === "discontinued"
            ? isDiscontinued
            : activeTab === "no_outbound_3m"
              ? !isDiscontinued && isNoOutbound3m && !s.is_vf_item
              : !isDiscontinued && !isNoOutbound3m && !s.is_vf_item;
        if (!matchTab) return;
      }
      if (s.category_lg) categories.add(s.category_lg);
    });
    return ["all", ...Array.from(categories).sort((a, b) => a.localeCompare(b, "ko"))];
  }, [specs, activeTab, kpiFocus]);

  // 2. 중분류 목록 추출
  const uniqueCategoriesMd = useMemo(() => {
    const categories = new Set<string>();
    specs.forEach((s) => {
      if (kpiFocus === "all" || kpiFocus === "selected") {
        // no card filter
      } else if (kpiFocus === "vf") {
        if (!isVfCardActive(s)) return;
      } else if (kpiFocus === "vf_no_outbound") {
        if (!isVfCardNoOutboundNeedCheck(s)) return;
      } else {
        const isDiscontinued = s.is_discontinued ?? false;
        const isNoOutbound3m = s.is_no_outbound_3m ?? false;
        const matchTab =
          activeTab === "discontinued"
            ? isDiscontinued
            : activeTab === "no_outbound_3m"
              ? !isDiscontinued && isNoOutbound3m && !s.is_vf_item
              : !isDiscontinued && !isNoOutbound3m && !s.is_vf_item;
        if (!matchTab) return;
      }
      if (!s.category_md) return;
      if (filterCategoryLg === "all" || s.category_lg === filterCategoryLg) {
        categories.add(s.category_md);
      }
    });
    return ["all", ...Array.from(categories).sort((a, b) => a.localeCompare(b, "ko"))];
  }, [specs, activeTab, kpiFocus, filterCategoryLg]);

  // 편집/일괄 수정용: 전체 마스터 기준 대·중분류 + localStorage 커스텀
  const [customCatTick, setCustomCatTick] = useState(0);
  const masterCategoryOptions = useMemo(() => {
    const lg = new Set<string>();
    const md = new Set<string>();
    const mdByLg: Record<string, Set<string>> = {};
    specs.forEach((s) => {
      const cl = (s.category_lg || "").trim();
      const cm = (s.category_md || "").trim();
      if (cl) {
        lg.add(cl);
        if (!mdByLg[cl]) mdByLg[cl] = new Set();
      }
      if (cm) {
        md.add(cm);
        if (cl) mdByLg[cl].add(cm);
      }
    });
    for (const c of loadCustomCategories("lg")) lg.add(c);
    for (const c of loadCustomCategories("md")) md.add(c);
    const mdByLgArr: Record<string, string[]> = {};
    Object.entries(mdByLg).forEach(([k, set]) => {
      mdByLgArr[k] = Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
    });
    return {
      lg: Array.from(lg).sort((a, b) => a.localeCompare(b, "ko")),
      md: Array.from(md).sort((a, b) => a.localeCompare(b, "ko")),
      mdByLg: mdByLgArr,
    };
    // customCatTick: localStorage 갱신 후 재계산
  }, [specs, customCatTick]);

  const rememberCategoryInputs = (lg?: string, md?: string) => {
    const dbLg = new Set(
      specs.map((s) => (s.category_lg || "").trim()).filter(Boolean)
    );
    const dbMd = new Set(
      specs.map((s) => (s.category_md || "").trim()).filter(Boolean)
    );
    let changed = false;
    if (lg && rememberCustomCategory("lg", lg, dbLg)) changed = true;
    if (md && rememberCustomCategory("md", md, dbMd)) changed = true;
    if (changed) setCustomCatTick((t) => t + 1);
  };

  const resetFilters = () => {
    setSearchQuery("");
    setFilterCategoryLg("all");
    setFilterCategoryMd("all");
    setFilterFinishType("all");
    if (kpiFocus === "vf" || kpiFocus === "vf_no_outbound") {
      setKpiFocus("all");
    }
    setCurrentPage(1);
  };

  const enableVfView = (mode: "vf" | "vf_no_outbound" = "vf") => {
    setSelectedIds(new Set());
    setKpiFocus(mode);
    setSortKey("location");
    setSortDir("asc");
    setFilterCategoryLg("all");
    setFilterCategoryMd("all");
    setSearchQuery("");
    setCurrentPage(1);
    setActiveTab("active");
  };
  const enableVfOnlyView = () => enableVfView("vf");

  const totalSpecsCount = specs.length;

  // 탭 필터링 + 대분류/중분류 필터링 + 검색 필터링 조합
  const filteredSpecs = useMemo(() => {
    let result = specs;

    // KPI: 전체 품목
    if (kpiFocus === "all") {
      if (filterCategoryLg !== "all") {
        result = result.filter((s) => (s.category_lg || "미분류") === filterCategoryLg);
      }
      if (filterCategoryMd !== "all") {
        result = result.filter((s) => s.category_md === filterCategoryMd);
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim();
        result = result.filter((s) =>
          matchesSearchInFields(
            [s.product_name, s.sku_id, s.barcode, s.product_number != null ? String(s.product_number) : undefined, s.location, s.category_lg, s.category_md],
            q
          )
        );
        // 제품번호 정확 일치 최상단
        const numQ = /^\d+$/.test(q) ? parseInt(q, 10) : null;
        if (numQ !== null) {
          result = [...result].sort((a, b) => {
            const am = a.product_number === numQ ? 0 : 1;
            const bm = b.product_number === numQ ? 0 : 1;
            return am - bm;
          });
        }
      }
      // 제품 형태 필터 (완제품 / 포장 필요)
      if (filterFinishType !== "all") {
        result = result.filter((s) => (s.finish_type || "") === filterFinishType);
      }
      if (sortKey) {
        result = [...result].sort((a, b) =>
          compareSpecsForSort(a, b, sortKey, sortDir, stockByBarcode)
        );
      }
      return result;
    }

    // KPI: 선택된 품목만 보기 (탭 무시)
    if (kpiFocus === 'selected') {
      result = result.filter((s) => selectedIds.has(s.id));
      if (searchQuery.trim()) {
        result = result.filter((s) =>
          matchesSearchInFields(
            [s.product_name, s.sku_id, s.barcode, s.product_number != null ? String(s.product_number) : undefined, s.location],
            searchQuery
          )
        );
      }
      if (filterFinishType !== "all") {
        result = result.filter((s) => (s.finish_type || "") === filterFinishType);
      }
      return result;
    }

    // KPI: VF 품목 / VF 출고없음 확인
    // - 실출고 있음 → VF 품목 (재고 0이어도)
    // - 실출고 없어도 등록 3개월 미만 → VF 품목 (신규 유예)
    // - 실출고 없고 등록 3개월+ (또는 등록일 없음) → VF 출고없음 확인
    // 재고 0 단독으로는 출고없음에 넣지 않음
    if (kpiFocus === "vf" || kpiFocus === "vf_no_outbound") {
      // 출고 카드 = active / 없음 카드 = no_outbound (합 = VF 전체 865)
      result = result.filter((s) =>
        kpiFocus === "vf_no_outbound"
          ? isVfCardNoOutboundNeedCheck(s)
          : isVfCardActive(s)
      );
      if (filterCategoryLg !== "all") {
        result = result.filter((s) => (s.category_lg || "미분류") === filterCategoryLg);
      }
      if (filterCategoryMd !== "all") {
        result = result.filter((s) => s.category_md === filterCategoryMd);
      }
      if (searchQuery.trim()) {
        result = result.filter((s) =>
          matchesSearchInFields(
            [s.product_name, s.sku_id, s.barcode, s.product_number != null ? String(s.product_number) : undefined, s.location, s.category_lg, s.category_md],
            searchQuery
          )
        );
      }
      if (filterFinishType !== "all") {
        result = result.filter((s) => (s.finish_type || "") === filterFinishType);
      }
      // VF 뷰도 헤더 정렬 공통 로직 사용 (보유 재고·단가 등 포함)
      if (sortKey) {
        result = [...result].sort((a, b) =>
          compareSpecsForSort(a, b, sortKey, sortDir, stockByBarcode)
        );
      } else {
        result = [...result].sort((a, b) => {
          const cmp = (a.location || "").localeCompare(b.location || "", "ko", { numeric: true });
          if (cmp === 0) return (a.product_name || "").localeCompare(b.product_name || "", "ko");
          return cmp;
        });
      }
      return result;
    }

    // 1. 탭 필터링 (출고 진행 vs 3개월 미출고 vs 단종)
    // 출고 진행·3개월 미출고: 비VF만 (VF는 VF 카드). 단종: 전체
    result = result.filter((s) => {
      const isDiscontinued = s.is_discontinued ?? false;
      const isNoOutbound3m = s.is_no_outbound_3m ?? false;
      const isVf = !!s.is_vf_item;
      if (activeTab === "discontinued") return isDiscontinued;
      if (isVf) return false;
      if (activeTab === "no_outbound_3m") return !isDiscontinued && isNoOutbound3m;
      return !isDiscontinued && !isNoOutbound3m;
    });

    // 2. 대분류 필터링
    if (filterCategoryLg !== "all") {
      result = result.filter(s => s.category_lg === filterCategoryLg);
    }

    // 3. 중분류 필터링
    if (filterCategoryMd !== "all") {
      result = result.filter(s => s.category_md === filterCategoryMd);
    }

    // 4. 검색 쿼리 필터링 (단어 순서 무시 AND)
    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      result = result.filter((s) =>
        matchesSearchInFields(
          [
            s.product_name,
            s.sku_id,
            s.barcode,
            s.product_number != null ? String(s.product_number) : undefined,
            s.location,
            s.category_lg,
            s.category_md,
            s.product_name_eng,
          ],
          q
        )
      );
      // 제품번호 정확 일치 최상단 (573 → 573번 먼저, 573453 등은 뒤로)
      const numQ = /^\d+$/.test(q) ? parseInt(q, 10) : null;
      if (numQ !== null) {
        result = [...result].sort((a, b) => {
          const am = a.product_number === numQ ? 0 : 1;
          const bm = b.product_number === numQ ? 0 : 1;
          return am - bm;
        });
      }
    }

    // 5. 제품 형태 필터 (완제품 / 포장 필요)
    if (filterFinishType !== "all") {
      result = result.filter((s) => (s.finish_type || "") === filterFinishType);
    }

    // 6. 헤더 정렬
    if (sortKey) {
      result = [...result].sort((a, b) =>
        compareSpecsForSort(a, b, sortKey, sortDir, stockByBarcode)
      );
    }

    return result;
  }, [specs, activeTab, filterCategoryLg, filterCategoryMd, searchQuery, kpiFocus, selectedIds, sortKey, sortDir, vfOnly, stockByBarcode, filterFinishType]);

  const handleSort = (key: SortKey) => {
    // 기본 방향: 재고·VF·사진 = 내림차순, 그 외 = 오름차순
    const startsDesc =
      key === "is_vf_item" || key === "image" || key === "current_stock";

    if (sortKey === key) {
      // 같은 컬럼 재클릭: 반대 방향 → 해제
      // startsDesc: desc → asc → 해제
      // startsAsc:  asc  → desc → 해제
      if (startsDesc) {
        if (sortDir === "desc") {
          setSortDir("asc"); // 재고 작은 순 (0,1,2…)
        } else {
          setSortKey(null);
          setSortDir("asc");
        }
      } else if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir(startsDesc ? "desc" : "asc");
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) {
      return <ArrowUpDown className="w-3 h-3 opacity-40 inline-block ml-0.5" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-indigo-600 inline-block ml-0.5" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600 inline-block ml-0.5" />
    );
  };

  const thSortClass =
    "cursor-pointer select-none hover:bg-muted/60 transition-colors user-select-none";

  // 페이지네이션
  const totalPages = Math.ceil(filteredSpecs.length / PAGE_SIZE) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const pagedSpecs = filteredSpecs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // 현재 페이지 바코드 — 또는 재고 정렬 시 필터 전체(배치) 현재고 조회
  const stockBarcodesToFetch = useMemo(() => {
    const source =
      sortKey === "current_stock" ? filteredSpecs : pagedSpecs;
    return Array.from(
      new Set(
        source
          .map((s) => (s.barcode || "").trim())
          .filter(Boolean)
      )
    ).sort();
  }, [pagedSpecs, filteredSpecs, sortKey]);

  useEffect(() => {
    if (stockBarcodesToFetch.length === 0) return;
    let cancelled = false;
    const load = async () => {
      // API 1회 최대 500개 — 재고 정렬 시 전체 목록을 청크로 조회
      const chunkSize = 500;
      const merged: Record<string, number> = {};
      for (let i = 0; i < stockBarcodesToFetch.length; i += chunkSize) {
        const chunk = stockBarcodesToFetch.slice(i, i + chunkSize);
        try {
          const res = await fetch(
            `/api/master/specs/current-stock?barcodes=${encodeURIComponent(chunk.join(","))}`
          );
          if (!res.ok) continue;
          const data = await res.json();
          if (cancelled) return;
          Object.assign(merged, data?.stocks || {});
        } catch {
          /* ignore chunk */
        }
      }
      if (cancelled) return;
      if (Object.keys(merged).length > 0) {
        setStockByBarcode((prev) => ({ ...prev, ...merged }));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [stockBarcodesToFetch.join(",")]);

  // 필터, 탭 및 검색 변경 시 페이지 리셋 (선택 유지 — 선택 품목 카드와 충돌 방지)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCategoryLg, filterCategoryMd, filterFinishType, activeTab, kpiFocus, sortKey, sortDir]);

  // 탭 전환 시에만 체크 선택 초기 (선택 품목 보기 제외)
  useEffect(() => {
    if (kpiFocus === 'selected') return;
    setSelectedIds(new Set());
  }, [activeTab]);

  // KPI 통계 (전체 품목 카운팅)
  // 출고 진행 / 3개월 미출고 탭: 비VF 중심 표시용 카운트 (VF는 VF 카드 사용)
  // 탭 필터에는 VF도 포함될 수 있으나, KPI 숫자는 비VF 기준으로 읽기 쉽게
  const activeCount = useMemo(
    () =>
      specs.filter(
        (s) => !s.is_discontinued && !s.is_vf_item && !s.is_no_outbound_3m
      ).length,
    [specs]
  );
  const noOutbound3mCount = useMemo(
    () =>
      specs.filter(
        (s) => !s.is_discontinued && !s.is_vf_item && s.is_no_outbound_3m
      ).length,
    [specs]
  );
  const discontinuedCount = useMemo(() => specs.filter(s => s.is_discontinued).length, [specs]);

  const scrollToList = () => {
    requestAnimationFrame(() => {
      listSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleKpiCardClick = (
    focus:
      | "all"
      | "active"
      | "no_outbound_3m"
      | "discontinued"
      | "selected"
      | "vf"
      | "vf_no_outbound"
  ) => {
    if (focus === 'selected') {
      if (selectedIds.size === 0) {
        alert("선택된 품목이 없습니다. 목록에서 체크박스로 품목을 선택한 뒤 다시 클릭하세요.");
        return;
      }
      setKpiFocus('selected');
      setCurrentPage(1);
      scrollToList();
      return;
    }

    // 선택 보기 외 카드/탭으로 이동 시 체크 선택 초기화
    setSelectedIds(new Set());

    if (focus === "all") {
      setKpiFocus("all");
      setFilterCategoryLg("all");
      setFilterCategoryMd("all");
      setSearchQuery("");
      setCurrentPage(1);
      scrollToList();
      return;
    }

    if (focus === "vf" || focus === "vf_no_outbound") {
      enableVfView(focus);
      scrollToList();
      return;
    }

    // FC 출고 / FC 3개월 미출고 / 단종
    setKpiFocus(focus);
    setActiveTab(focus);
    setFilterCategoryLg("all");
    setFilterCategoryMd("all");
    setSearchQuery("");
    setCurrentPage(1);
    scrollToList();
  };

  const handleTabClick = (tab: 'active' | 'no_outbound_3m' | 'discontinued') => {
    setSelectedIds(new Set());
    setKpiFocus(tab);
    setActiveTab(tab);
    setKpiFocus(tab);
    setFilterCategoryLg("all");
    setFilterCategoryMd("all");
  };

  // 헤더 체크박스 ("전체 선택")
  // **반드시 현재 페이지(pagedSpecs)에 보이는 품목만** 선택/해제한다.
  // 전체 filteredSpecs(773건 등)를 절대 선택하지 않는다. 한 페이지 = 최대 50개.
  const handleSelectAll = (checked: boolean) => {
    // pagedSpecs 변수가 렌더에서 이미 계산한 "현재 페이지에 보이는 정확한 목록"이다.
    // 이걸 그대로 사용하면 50개만 선택된다는 보장이 가장 확실하다.
    const pageIds = pagedSpecs.map((s) => s.id);

    if (checked) {
      // 헤더 체크박스 클릭 시: 이 페이지에 보이는 품목 **정확히 50개(또는 마지막 페이지 개수)** 만 선택
      // 다른 페이지에서 선택했던 것은 모두 버리고 현재 페이지만으로 교체
      setSelectedIds(new Set(pageIds));
    } else {
      // 현재 페이지 품목만 해제 (다른 페이지 선택 유지)
      const newSelected = new Set(selectedIds);
      pageIds.forEach((id) => newSelected.delete(id));
      setSelectedIds(newSelected);
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  // 헤더 체크박스: 현재 페이지의 모든 품목이 선택되었는지
  const isAllSelected = useMemo(() => {
    if (pagedSpecs.length === 0) return false;
    return pagedSpecs.every(s => selectedIds.has(s.id));
  }, [pagedSpecs, selectedIds]);

  // 현재 페이지에 선택된 개수 (디버그/표시용)
  const selectedOnCurrentPage = useMemo(() => {
    return pagedSpecs.filter(s => selectedIds.has(s.id)).length;
  }, [pagedSpecs, selectedIds]);

  const handleOpenDialog = async (spec: Spec | null = null) => {
    if (!spec) {
      setEditingSpec(null);
      setIsDialogOpen(true);
      return;
    }
    // 목록은 compact 응답 → 편집 시 전체 필드(components 등) GET
    try {
      const res = await fetch(`/api/master/specs/${spec.id}`);
      if (res.ok) {
        const full = (await res.json()) as Spec;
        // Normalize finish_type so dialog buttons always have a concrete string value
        if (full && (full as any).finish_type == null) (full as any).finish_type = '';
        setEditingSpec(full);
      } else {
        const s = { ...spec };
        if ((s as any).finish_type == null) (s as any).finish_type = '';
        setEditingSpec(s);
      }
    } catch {
      const s = { ...spec };
      if ((s as any).finish_type == null) (s as any).finish_type = '';
      setEditingSpec(s);
    }
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm("정말로 이 항목을 삭제하시겠습니까?")) {
        deleteMutation.mutate(id);
    }
  };

  /**
   * 현재 선택된 KPI 카드(=목록 필터) 기준 양식 다운로드.
   * 카드 scope 와 서버 export scope 1:1 매핑.
   */
  const handleExportBulkForm = () => {
    // 선택·카테고리·검색·제품형태가 걸린 목록은 화면과 동일하게 id 목록으로 다운로드
    const useIds =
      kpiFocus === "selected" ||
      searchQuery.trim() !== "" ||
      filterCategoryLg !== "all" ||
      filterCategoryMd !== "all" ||
      filterFinishType !== "all";

    if (useIds) {
      if (filteredSpecs.length === 0) {
        alert("다운로드할 품목이 없습니다.");
        return;
      }
      // URL 길이 한도 대비: 800개 초과 시 scope 폴백 안내 후 분할은 단순 scope 사용
      if (filteredSpecs.length > 800) {
        // 대량: 서버 scope 우선 (검색 필터는 무시될 수 있음 → 확인)
        const ok = window.confirm(
          `현재 목록 ${filteredSpecs.length}건입니다.\n` +
            `검색/분류 필터가 있으면 서버 카드 scope로 대체 다운로드합니다.\n계속할까요?`
        );
        if (!ok) return;
      } else {
        const ids = filteredSpecs.map((s) => s.id).join(",");
        window.open(
          `/api/master/specs/export.xlsx?scope=ids&ids=${encodeURIComponent(ids)}`,
          "_blank"
        );
        return;
      }
    }

    let scope = "all";
    if (kpiFocus === "all") scope = "all";
    else if (kpiFocus === "vf") scope = "vf_active";
    else if (kpiFocus === "vf_no_outbound") scope = "vf_no_outbound";
    else if (kpiFocus === "active") scope = "fc_active";
    else if (kpiFocus === "no_outbound_3m") scope = "fc_no_outbound";
    else if (kpiFocus === "discontinued") scope = "discontinued";
    else scope = "all";

    window.open(`/api/master/specs/export.xlsx?scope=${scope}`, "_blank");
  };

  const handleImportBulkForm = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/master/specs/import-bulk", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "양식 업로드 실패");
      }
      alert(
        `일괄 반영 완료\n` +
          `· 마스터 필드: ${data.updated_specs ?? 0}건\n` +
          `· VF 설정/해제: ${data.updated_vf ?? 0}건\n` +
          `· 로케이션(BarcodeMaster): ${data.updated_locations ?? 0}건\n` +
          `· 바코드 없음 스킵: ${data.skipped_no_barcode ?? 0}건\n` +
          `· id 없음/오류: ${(data.skipped_no_id ?? 0) + (data.error_count ?? 0)}건`
      );
      queryClient.invalidateQueries({ queryKey: ["/api/master/specs"] });
    } catch (err: any) {
      alert(`양식 업로드 실패: ${err?.message || err}`);
    }
  };

  const handleSave = async (formData: SpecDraft | Spec) => {
    const mutation = 'id' in formData && formData.id ? updateMutation : createMutation;
    try {
      await mutation.mutateAsync(formData as any);
      rememberCategoryInputs(formData.category_lg, formData.category_md);
      setIsDialogOpen(false);
    } catch (e: any) {
      alert(`저장 실패: ${e?.message || 'unknown error'}`);
    }
  };

  // 일괄 수정 저장 핸들러 (로케이션 포함 — BM 자동 등록)
  const handleBulkSave = async (data: {
    category_lg?: string;
    category_md?: string;
    color1?: string;
    color2?: string;
    location?: string;
    is_discontinued?: boolean;
    is_no_outbound_3m?: boolean;
    is_vf_item?: boolean;
    finish_type?: string;
  }) => {
    const ids = Array.from(selectedIds);
    try {
      await bulkUpdateMutation.mutateAsync({ ids, ...data });
      rememberCategoryInputs(data.category_lg, data.category_md);
      setIsBulkDialogOpen(false);
      setSelectedIds(new Set());
    } catch (e: any) {
      // 훅의 onError에서 처리
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Overview — 가로 +30% · 순서: 전체 → VF → VF출고없음 → FC → FC미출고 → 단종 */}
      {!isLoading && specs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => handleKpiCardClick("all")}
            onKeyDown={(e) => e.key === "Enter" && handleKpiCardClick("all")}
            className={`w-[12.35rem] shrink-0 bg-gradient-to-br from-slate-50 to-slate-100 border cursor-pointer hover:shadow-md transition-shadow ${
              kpiFocus === "all" ? "border-slate-600 ring-2 ring-slate-300" : "border-slate-200"
            }`}
          >
            <CardContent className="px-3 py-3">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700 uppercase">전체 품목</p>
                  <h3 className="text-2xl font-bold text-slate-900 tabular-nums leading-none mt-1">
                    {totalSpecsCount.toLocaleString()}
                  </h3>
                  <p className="text-xs text-slate-600 mt-1 truncate">VF+FC+단종 전체</p>
                </div>
                <Package className="w-7 h-7 shrink-0 text-slate-600 bg-white rounded-full p-1.5" />
              </div>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => handleKpiCardClick("vf")}
            onKeyDown={(e) => e.key === "Enter" && handleKpiCardClick("vf")}
            className={`w-[12.35rem] shrink-0 bg-gradient-to-br from-violet-50 to-violet-100 border cursor-pointer hover:shadow-md transition-shadow ${
              kpiFocus === "vf" ? "border-violet-600 ring-2 ring-violet-300" : "border-violet-200"
            }`}
          >
            <CardContent className="px-3 py-3">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-violet-700 uppercase leading-snug">
                    VF 출고 진행
                  </p>
                  <h3 className="text-2xl font-bold text-violet-900 tabular-nums leading-none mt-1">
                    {vfWithOutboundCount.toLocaleString()}
                  </h3>
                  <p className="text-xs text-violet-600 mt-1 truncate">
                    총 VF 품목 {vfCount.toLocaleString()}
                  </p>
                </div>
                <Package className="w-7 h-7 shrink-0 text-violet-600 bg-white rounded-full p-1.5" />
              </div>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => handleKpiCardClick("vf_no_outbound")}
            onKeyDown={(e) => e.key === "Enter" && handleKpiCardClick("vf_no_outbound")}
            className={`w-[12.35rem] shrink-0 bg-gradient-to-br from-fuchsia-50 to-orange-50 border cursor-pointer hover:shadow-md transition-shadow ${
              kpiFocus === "vf_no_outbound"
                ? "border-fuchsia-600 ring-2 ring-fuchsia-300"
                : "border-fuchsia-200"
            }`}
          >
            <CardContent className="px-3 py-3">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-fuchsia-800 uppercase leading-snug">
                    VF 3개월 출고 없음
                  </p>
                  <h3 className="text-2xl font-bold text-fuchsia-900 tabular-nums leading-none mt-1">
                    {vfNoOutboundCount.toLocaleString()}
                  </h3>
                </div>
                <Package className="w-7 h-7 shrink-0 text-fuchsia-600 bg-white rounded-full p-1.5" />
              </div>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => handleKpiCardClick("active")}
            onKeyDown={(e) => e.key === "Enter" && handleKpiCardClick("active")}
            className={`w-[12.35rem] shrink-0 bg-gradient-to-br from-indigo-50 to-indigo-100 border cursor-pointer hover:shadow-md transition-shadow ${
              kpiFocus === "active" ? "border-indigo-500 ring-2 ring-indigo-300" : "border-indigo-200"
            }`}
          >
            <CardContent className="px-3 py-3">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-indigo-700 uppercase">FC 출고 품목</p>
                  <h3 className="text-2xl font-bold text-indigo-900 tabular-nums leading-none mt-1">
                    {activeCount.toLocaleString()}
                  </h3>
                  <p className="text-xs text-indigo-600 mt-1 truncate">
                    총 FC 품목 {(activeCount + noOutbound3mCount).toLocaleString()}
                  </p>
                </div>
                <Package className="w-7 h-7 shrink-0 text-indigo-600 bg-white rounded-full p-1.5" />
              </div>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => handleKpiCardClick("no_outbound_3m")}
            onKeyDown={(e) => e.key === "Enter" && handleKpiCardClick("no_outbound_3m")}
            className={`w-[12.35rem] shrink-0 bg-gradient-to-br from-amber-50 to-amber-100 border cursor-pointer hover:shadow-md transition-shadow ${
              kpiFocus === "no_outbound_3m"
                ? "border-amber-500 ring-2 ring-amber-300"
                : "border-amber-200"
            }`}
          >
            <CardContent className="px-3 py-3">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-amber-700 uppercase">FC 3개월 미출고</p>
                  <h3 className="text-2xl font-bold text-amber-900 tabular-nums leading-none mt-1">
                    {noOutbound3mCount.toLocaleString()}
                  </h3>
                </div>
                <Package className="w-7 h-7 shrink-0 text-amber-600 bg-white rounded-full p-1.5" />
              </div>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => handleKpiCardClick("discontinued")}
            onKeyDown={(e) => e.key === "Enter" && handleKpiCardClick("discontinued")}
            className={`w-[12.35rem] shrink-0 bg-gradient-to-br from-red-50 to-red-100 border cursor-pointer hover:shadow-md transition-shadow ${
              kpiFocus === "discontinued" ? "border-red-500 ring-2 ring-red-300" : "border-red-200"
            }`}
          >
            <CardContent className="px-3 py-3">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-red-700 uppercase">단종</p>
                  <h3 className="text-2xl font-bold text-red-900 tabular-nums leading-none mt-1">
                    {discontinuedCount.toLocaleString()}
                  </h3>
                  <p className="text-xs text-red-600 mt-1 truncate">클릭 · 목록</p>
                </div>
                <X className="w-7 h-7 shrink-0 text-red-600 bg-white rounded-full p-1.5" />
              </div>
            </CardContent>
          </Card>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => handleKpiCardClick("selected")}
            onKeyDown={(e) => e.key === "Enter" && handleKpiCardClick("selected")}
            className={`w-[12.35rem] shrink-0 bg-gray-50 border cursor-pointer hover:shadow-md transition-shadow ${
              kpiFocus === "selected" ? "border-indigo-500 ring-2 ring-indigo-300" : "border-gray-200"
            }`}
          >
            <CardContent className="px-3 py-3">
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-600 uppercase">선택</p>
                  <h3 className="text-2xl font-bold text-indigo-700 tabular-nums leading-none mt-1">
                    {selectedIds.size.toLocaleString()}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1 truncate">선택만 보기</p>
                </div>
                <CheckSquare className="w-7 h-7 shrink-0 text-indigo-500 bg-white rounded-full p-1.5" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 신설: 토스 디자인 스타일의 양방향 상태 탭 컨트롤 */}
      <div ref={listSectionRef} className="flex border-b border-gray-200 bg-white rounded-t-lg scroll-mt-4">
        <button
          onClick={() => handleTabClick('active')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all ${
            kpiFocus !== 'selected' && !vfOnly && activeTab === 'active'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          FC 출고 품목 ({activeCount})
        </button>
        <button
          onClick={() => handleTabClick('no_outbound_3m')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all ${
            kpiFocus !== 'selected' && !vfOnly && activeTab === 'no_outbound_3m'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          FC 3개월 미출고 ({noOutbound3mCount})
        </button>
        <button
          onClick={() => handleTabClick('discontinued')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all ${
            kpiFocus !== 'selected' && !vfOnly && activeTab === 'discontinued'
              ? 'border-red-500 text-red-500'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          단종 품목 ({discontinuedCount})
        </button>
      </div>

      {/* 목록 제목 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-indigo-700">
          {kpiFocus === "all"
            ? `전체 품목 (${filteredSpecs.length}개)`
            : kpiFocus === "vf"
            ? `VF 출고 진행 (${filteredSpecs.length}개)`
            : kpiFocus === "vf_no_outbound"
            ? `VF 3개월 출고 없음 (${filteredSpecs.length}개)`
            : kpiFocus === "selected"
            ? `선택된 품목 관리 (${selectedIds.size}개)`
            : activeTab === "active"
            ? "FC 출고 품목 관리 (쿠팡 센터 납품)"
            : activeTab === "no_outbound_3m"
            ? "FC 3개월 미출고 품목 관리"
            : "단종 품목 관리"}
        </h2>
        <span className="text-xs text-muted-foreground">
          {filteredSpecs.length.toLocaleString()}건 · {safePage}/{totalPages}페이지
          {vfOnly && sortKey === "location" ? " · 로케이션↑" : ""}
        </span>
      </div>

      {/* Outbound 스타일 sticky 필터 바 */}
      <div className="sticky top-0 z-30 px-3 py-3 rounded-xl border-2 border-indigo-200/90 bg-gradient-to-r from-indigo-100 via-sky-50 to-violet-100 shadow-[0_8px_28px_-6px_rgba(49,46,129,0.28)] ring-1 ring-indigo-300/50 flex flex-col gap-3 relative before:absolute before:inset-x-0 before:bottom-0 before:h-0.5 before:bg-gradient-to-r before:from-indigo-500 before:via-blue-500 before:to-violet-500">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between relative z-[1]">
          {/* 필터 컨트롤 */}
          <div className="flex flex-col md:flex-row flex-wrap gap-2 md:gap-3 items-stretch md:items-center flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-indigo-800 whitespace-nowrap">대분류</span>
              <select
                id="filter-lg"
                value={filterCategoryLg}
                onChange={(e) => {
                  setFilterCategoryLg(e.target.value);
                  setFilterCategoryMd("all");
                }}
                className="h-9 min-w-[140px] max-w-[220px] rounded-md border border-indigo-200/80 bg-white px-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="all">전체 대분류</option>
                {uniqueCategoriesLg.filter((c) => c !== "all").map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-indigo-800 whitespace-nowrap">중분류</span>
              <select
                id="filter-md"
                value={filterCategoryMd}
                onChange={(e) => setFilterCategoryMd(e.target.value)}
                className="h-9 min-w-[140px] max-w-[220px] rounded-md border border-indigo-200/80 bg-white px-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
                disabled={filterCategoryLg === "all" && uniqueCategoriesMd.length <= 1}
              >
                <option value="all">전체 중분류</option>
                {uniqueCategoriesMd.filter((c) => c !== "all").map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="relative w-full md:w-[280px] lg:w-[320px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400 z-10" />
              <Input
                placeholder="제품명, 바코드, SKU ID, 제품번호(573) 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 text-sm bg-white border-indigo-200/80 shadow-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
                  title="검색 지우기"
                >
                  ✕
                </button>
              )}
            </div>

            {/* 제품 형태 필터: 완제품 / 포장 필요 (초기화 버튼 바로 옆) */}
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-indigo-800 whitespace-nowrap">제품 형태</span>
              <select
                value={filterFinishType}
                onChange={(e) => setFilterFinishType(e.target.value)}
                className="h-9 min-w-[110px] rounded-md border border-indigo-200/80 bg-white px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                title="완제품 또는 포장 필요 필터"
              >
                <option value="all">전체</option>
                <option value="finished">완제품</option>
                <option value="needs_packaging">포장 필요</option>
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={resetFilters}
              className="h-9 bg-white border-indigo-200 text-indigo-700 hover:bg-indigo-50 hover:text-indigo-900 shadow-sm"
              title="필터 초기화"
            >
              🔄 초기화
            </Button>
          </div>

          {/* 액션 */}
          <div className="flex flex-wrap gap-2 items-center shrink-0">
            <Button size="sm" className="h-9" onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-1.5" />
              신규 추가
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-amber-300 bg-white/80 hover:bg-amber-50 text-amber-800"
              onClick={() => syncOutboundStatusMutation.mutate()}
              disabled={syncOutboundStatusMutation.isPending}
              title="VF=실출고 · 비VF=FC입고(센터 납품) 기준 상태 재계산"
            >
              {syncOutboundStatusMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Wand2 className="w-4 h-4 mr-1.5" />
              )}
              미출고 갱신
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-emerald-300 bg-white/80 hover:bg-emerald-50 text-emerald-800"
              onClick={handleExportBulkForm}
              title="현재 선택 카드(목록)에 해당하는 품목만 양식 다운로드"
            >
              <Download className="w-4 h-4 mr-1.5" />
              양식 다운로드
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-sky-300 bg-white/80 hover:bg-sky-50 text-sky-800"
              onClick={() => bulkImportInputRef.current?.click()}
              title="마스터 일괄 수정 양식 전용. 쿠팡 FC 입고·단가 파일은 출고→FC 입고·단가 탭에 올리세요."
            >
              <Upload className="w-4 h-4 mr-1.5" />
              양식 업로드
            </Button>
            <input
              ref={bulkImportInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportBulkForm}
            />
            {selectedIds.size > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-violet-300 bg-violet-50 hover:bg-violet-100 text-violet-900"
                  disabled={bulkUpdateMutation.isPending}
                  onClick={async () => {
                    const n = selectedIds.size;
                    if (
                      !confirm(
                        `선택 ${n}건을 VF 품목으로 지정할까요?\n(현재 DB 기준 · 출고 자동 규칙은 건드리지 않음)`
                      )
                    ) {
                      return;
                    }
                    try {
                      await bulkUpdateMutation.mutateAsync({
                        ids: Array.from(selectedIds),
                        is_vf_item: true,
                      });
                      setSelectedIds(new Set());
                    } catch {
                      /* onError */
                    }
                  }}
                >
                  VF 지정 ({selectedIds.size})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800"
                  disabled={bulkUpdateMutation.isPending}
                  onClick={async () => {
                    const n = selectedIds.size;
                    if (
                      !confirm(
                        `선택 ${n}건의 VF 품목 지정을 해제할까요?\n(현재 DB 기준 · 이후 카드 수량에서 제외)`
                      )
                    ) {
                      return;
                    }
                    try {
                      await bulkUpdateMutation.mutateAsync({
                        ids: Array.from(selectedIds),
                        is_vf_item: false,
                      });
                      setSelectedIds(new Set());
                    } catch {
                      /* onError */
                    }
                  }}
                >
                  VF 해제 ({selectedIds.size})
                </Button>
                <Button
                  size="sm"
                  className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => setIsBulkDialogOpen(true)}
                >
                  <Edit className="w-4 h-4 mr-1.5" />
                  일괄 수정 ({selectedIds.size})
                </Button>
              </>
            )}
          </div>
        </div>

        {/* 상태 뱃지 */}
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 relative z-[1]">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-indigo-100">
            표시 {filteredSpecs.length.toLocaleString()}건
            {(searchQuery || filterCategoryLg !== "all" || filterCategoryMd !== "all" || filterFinishType !== "all") && (
              <span className="text-indigo-600 font-medium">· 필터 적용 중</span>
            )}
          </span>
          {selectedIds.size > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-medium">
              {selectedIds.size}개 선택됨
            </span>
          )}
          {kpiFocus === 'selected' && (
            <button
              type="button"
              className="text-indigo-700 underline font-medium"
              onClick={() => handleKpiCardClick(activeTab)}
            >
              전체 목록으로
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="mt-6">
            {/* 검색 결과 정보 */}
            <div className="flex justify-between items-center text-sm text-muted-foreground mb-3">
              <div>
                {searchQuery || filterCategoryLg !== "all" || filterCategoryMd !== "all" || filterFinishType !== "all" ? (
                  <span>{filteredSpecs.length.toLocaleString()}건 필터링됨 (현재 탭 {filteredSpecs.length.toLocaleString()}건)</span>
                ) : (
                  <span>현재 탭 전체 {filteredSpecs.length.toLocaleString()}건</span>
                )}
                <span> · {safePage}/{totalPages}페이지</span>
              </div>
            </div>

            {/* 데스크탑 뷰 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="bg-muted/40 whitespace-nowrap text-xs font-semibold text-muted-foreground border-b">
                  <tr>
                    <th className="p-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        title="현재 페이지 전체 선택 (최대 50개)"
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                    </th>
                    <th
                      className={`p-4 w-16 text-center ${thSortClass}`}
                      onClick={() => handleSort("image")}
                      title="사진 유무 정렬"
                    >
                      사진
                      <SortIcon col="image" />
                    </th>
                    <th
                      className={`p-4 ${thSortClass}`}
                      onClick={() => handleSort("product_name")}
                      title="제품명 정렬"
                    >
                      제품명
                      <SortIcon col="product_name" />
                    </th>
                    <th
                      className={`p-3 w-16 text-center ${thSortClass}`}
                      onClick={() => handleSort("is_vf_item")}
                      title="VF 품목 우선 정렬"
                    >
                      VF
                      <SortIcon col="is_vf_item" />
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort("barcode")}
                      title="바코드 정렬"
                    >
                      바코드
                      <SortIcon col="barcode" />
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort("sku_id")}
                      title="SKU ID 정렬"
                    >
                      SKU ID
                      <SortIcon col="sku_id" />
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort("product_number")}
                      title="제품 번호 정렬"
                    >
                      제품 번호
                      <SortIcon col="product_number" />
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort("location")}
                      title="로케이션 정렬 (BarcodeMaster)"
                    >
                      로케이션
                      <SortIcon col="location" />
                    </th>
                    <th
                      className={`${thSortClass} text-right`}
                      onClick={() => handleSort("current_stock")}
                      title="전산 현재고 정렬 (보유 재고)"
                    >
                      보유 재고
                      <SortIcon col="current_stock" />
                    </th>
                    <th
                      className={`${thSortClass} text-center whitespace-nowrap`}
                      onClick={() => handleSort("finish_type")}
                      title="제품 형태 정렬 (완제품 / 포장 필요)"
                    >
                      제품 형태
                      <SortIcon col="finish_type" />
                    </th>
                    <th>색상</th>
                    <th
                      className={`${thSortClass} hidden`}
                      onClick={() => handleSort("lot_number")}
                      title="로트 번호 정렬 (목록 숨김)"
                    >
                      로트 번호
                      <SortIcon col="lot_number" />
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort("price")}
                      title="단가 정렬"
                    >
                      단가
                      <SortIcon col="price" />
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort("tier_count")}
                      title="단수 (품명 N단 또는 기본수량)"
                    >
                      단수
                      <SortIcon col="tier_count" />
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort("pack_count")}
                      title="포장갯수 (품명 N개)"
                    >
                      포장갯수
                      <SortIcon col="pack_count" />
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort("category_lg")}
                      title="대분류 정렬"
                    >
                      대분류
                      <SortIcon col="category_lg" />
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort("category_md")}
                      title="중분류 정렬"
                    >
                      중분류
                      <SortIcon col="category_md" />
                    </th>
                    <th
                      className={thSortClass}
                      onClick={() => handleSort("status")}
                      title="상태 정렬"
                    >
                      상태
                      <SortIcon col="status" />
                    </th>
                    <th>구성품</th>
                    <th className="text-center w-20">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSpecs.map((spec) => (
                    <tr key={spec.id} className={`border-b hover:bg-muted/20 align-middle ${selectedIds.has(spec.id) ? 'bg-indigo-50/20 hover:bg-indigo-50/30' : ''}`}>
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(spec.id)}
                          onChange={(e) => handleSelectOne(spec.id, e.target.checked)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="p-2 text-center">
                        {spec.image_url ? (
                          <div className="w-12 h-12 rounded border bg-muted overflow-hidden flex items-center justify-center mx-auto cursor-pointer" onClick={() => window.open(spec.image_url, '_blank')}>
                            <img
                              src={spec.image_url}
                              alt={spec.product_name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded border bg-muted/40 flex items-center justify-center mx-auto text-muted-foreground/60 text-xs">
                            -
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-medium max-w-xs truncate">
                        <button
                          type="button"
                          onClick={() => openOutboundReport(spec)}
                          className="text-left w-full group"
                          title={
                            (spec.notes || "").trim()
                              ? `비고: ${(spec.notes || "").trim()}\n\n클릭: 출고 수량 그래프 보기`
                              : "클릭: 출고 수량 그래프 보기"
                          }
                        >
                          <div className="font-semibold text-gray-900 group-hover:text-indigo-700 group-hover:underline underline-offset-2 decoration-indigo-300 transition-colors inline-flex items-center gap-1 max-w-full">
                            <span className="truncate">{spec.product_name}</span>
                            {(spec.notes || "").trim() ? (
                              <span
                                className="shrink-0 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1"
                                title={`비고: ${(spec.notes || "").trim()}`}
                              >
                                비고
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-muted-foreground">{spec.product_name_eng || ''}</div>
                        </button>
                      </td>
                      <td className="p-3 text-center">
                        {spec.is_vf_item ? (
                          <span
                            className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800 border border-violet-200"
                            title="VF 품목 (등록일은 품목 클릭 시 확인)"
                          >
                            VF
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40 text-xs">-</span>
                        )}
                      </td>
                      <td className="font-mono text-xs whitespace-nowrap">{spec.barcode || '-'}</td>
                      <td className="font-mono text-xs">{spec.sku_id || '-'}</td>
                      <td className="font-mono text-xs whitespace-nowrap">
                        {spec.product_number != null ? (
                          <span className="text-gray-800">{spec.product_number}</span>
                        ) : (
                          <span className="text-muted-foreground/50">-</span>
                        )}
                      </td>
                      <td className="font-mono text-xs whitespace-nowrap" title={spec.location || ''}>
                        {spec.location ? (
                          <span className="text-gray-800">{spec.location}</span>
                        ) : (
                          <span className="text-muted-foreground/50">-</span>
                        )}
                      </td>
                      <td className="text-xs text-right tabular-nums whitespace-nowrap px-2">
                        {spec.barcode && stockByBarcode[spec.barcode] != null ? (
                          <span className={stockByBarcode[spec.barcode] <= 0 ? "text-red-600 font-semibold" : "text-gray-900 font-medium"}>
                            {Number(stockByBarcode[spec.barcode]).toLocaleString()}
                          </span>
                        ) : spec.barcode ? (
                          <span className="text-muted-foreground/40">…</span>
                        ) : (
                          <span className="text-muted-foreground/50">-</span>
                        )}
                      </td>
                      <td className="text-xs text-center whitespace-nowrap px-2">
                        {spec.finish_type === "finished" ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                            완제품
                          </span>
                        ) : spec.finish_type === "needs_packaging" ? (
                          <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-800 border border-orange-200">
                            포장 필요
                          </span>
                        ) : null}
                      </td>
                      <td className="text-xs">
                        {spec.color1 || spec.color2 ? (
                          <span>
                            {spec.color1 || '-'}
                            {spec.color2 ? ` / ${spec.color2}` : ''}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="text-xs font-mono hidden">{spec.lot_number || '-'}</td>
                      <td className="text-xs py-2">
                        {spec.prev_price && spec.prev_price !== spec.price ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <span className="font-bold text-gray-900">{spec.price ? `${spec.price.toLocaleString()}원` : '0원'}</span>
                              {spec.price > spec.prev_price ? (
                                <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1 rounded">
                                  ▲ {(spec.price - spec.prev_price).toLocaleString()}원
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1 rounded">
                                  ▼ {(spec.prev_price - spec.price).toLocaleString()}원
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                              {spec.prev_price.toLocaleString()}원 ➔ {spec.price.toLocaleString()}원
                            </div>
                            {spec.price_changed_at && (
                              <div className="text-[9px] text-gray-400">
                                변동: {new Date(spec.price_changed_at).toLocaleDateString('ko-KR')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="font-semibold text-gray-900">
                            {spec.price ? `${spec.price.toLocaleString()}원` : '0원'}
                          </div>
                        )}
                      </td>
                      <td className="text-center text-sm font-semibold text-gray-800 whitespace-nowrap">
                        {(() => {
                          const tier = getTierCount(spec);
                          // 1 또는 1단 둘 다 의미 동일 — "1단" 표기
                          return tier != null ? (
                            <span title={`단수 ${tier} (default_quantity=${spec.default_quantity ?? 0})`}>
                              {tier}단
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50 font-normal">-</span>
                          );
                        })()}
                      </td>
                      <td className="text-center text-sm font-semibold text-gray-800">
                        {(() => {
                          const pack = getPackCount(spec);
                          const detail = getPackDetail(spec);
                          if (pack == null) {
                            return <span className="text-muted-foreground/50 font-normal">-</span>;
                          }
                          return (
                            <div className="leading-tight" title={detail || `${pack}개`}>
                              <div>{pack}개</div>
                              {detail ? (
                                <div className="text-[10px] font-normal text-muted-foreground mt-0.5 max-w-[9rem] mx-auto break-all">
                                  {detail}
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="font-medium text-gray-700">{spec.category_lg || '-'}</td>
                      <td className="text-gray-600">{spec.category_md || '-'}</td>
                      <td className="text-xs">
                        {spec.is_discontinued ? (
                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 font-semibold text-[10px] border border-red-200">
                            단종
                          </span>
                        ) : spec.is_no_outbound_3m ? (
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[10px] border border-amber-200">
                            {spec.is_vf_item ? "3개월 미출고" : "FC 3개월 미출고"}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 font-semibold text-[10px] border border-green-200">
                            {spec.is_vf_item ? "출고 진행" : "FC 출고 품목"}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[150px] truncate text-xs text-muted-foreground" title={spec.components}>
                        {spec.components || '-'}
                      </td>
                      <td className="p-4 flex justify-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(spec)}>
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => handleDelete(spec.id)} disabled={deleteMutation.isPending && deleteMutation.variables === spec.id}>
                          {deleteMutation.isPending && deleteMutation.variables === spec.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {pagedSpecs.length === 0 && (
                    <tr>
                      <td colSpan={20} className="text-center py-10 text-muted-foreground">
                        {searchQuery || filterCategoryLg !== "all" || filterCategoryMd !== "all" || filterFinishType !== "all" ? "조건에 맞는 검색 결과가 없습니다." : "등록된 제품이 없습니다."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 모바일 뷰 (카드 리스트) */}
            <div className="md:hidden space-y-4">
              {pagedSpecs.map((spec) => (
                <div key={spec.id} className={`bg-card border rounded-lg p-4 shadow-sm flex flex-col gap-2 relative ${selectedIds.has(spec.id) ? 'border-indigo-400 bg-indigo-50/10' : 'border-border'}`}>
                  <div className="absolute top-4 left-4 z-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(spec.id)}
                      onChange={(e) => handleSelectOne(spec.id, e.target.checked)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                  </div>

                  <div className="flex gap-3 pl-7">
                    {spec.image_url ? (
                      <div className="w-16 h-16 rounded border bg-muted overflow-hidden shrink-0" onClick={() => window.open(spec.image_url, '_blank')}>
                        <img
                          src={spec.image_url}
                          alt={spec.product_name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded border bg-muted/40 flex items-center justify-center shrink-0 text-muted-foreground/60 text-xs">
                        사진없음
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openOutboundReport(spec)}
                              className="text-left"
                              title={
                                (spec.notes || "").trim()
                                  ? `비고: ${(spec.notes || "").trim()}\n\n클릭: 출고 수량 그래프 보기`
                                  : "클릭: 출고 수량 그래프 보기"
                              }
                            >
                              <h4 className="font-semibold text-base break-words text-gray-900 hover:text-indigo-700 hover:underline underline-offset-2 decoration-indigo-300">
                                {spec.product_name}
                                {(spec.notes || "").trim() ? (
                                  <span className="ml-1.5 align-middle text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">
                                    비고
                                  </span>
                                ) : null}
                              </h4>
                            </button>
                            {spec.is_vf_item && (
                              <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold text-violet-800 border border-violet-200">
                                VF
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono">{spec.barcode || '-'}</p>
                          <p className="text-xs text-muted-foreground font-mono">
                            로케이션 {spec.location || '-'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            보유 재고{" "}
                            <span className="font-semibold tabular-nums text-gray-800">
                              {spec.barcode && stockByBarcode[spec.barcode] != null
                                ? Number(stockByBarcode[spec.barcode]).toLocaleString()
                                : "-"}
                            </span>
                            {spec.finish_type === "finished" ? (
                              <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-200">
                                완제품
                              </span>
                            ) : spec.finish_type === "needs_packaging" ? (
                              <span className="ml-2 inline-flex items-center rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800 border border-orange-200">
                                포장 필요
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(spec)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => handleDelete(spec.id)} disabled={deleteMutation.isPending && deleteMutation.variables === spec.id}>
                            {deleteMutation.isPending && deleteMutation.variables === spec.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs mt-2 bg-muted/30 p-2 rounded-md pl-7">
                    <div>
                      <span className="text-muted-foreground block mb-0.5">단가</span>
                      {spec.prev_price && spec.prev_price !== spec.price ? (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 font-semibold">
                            <span className="text-gray-900">{spec.price ? `${spec.price.toLocaleString()}원` : '0원'}</span>
                            {spec.price > spec.prev_price ? (
                              <span className="text-[9px] text-red-600 bg-red-50 px-1 rounded">
                                ▲ {(spec.price - spec.prev_price).toLocaleString()}원
                              </span>
                            ) : (
                              <span className="text-[9px] text-blue-600 bg-blue-50 px-1 rounded">
                                ▼ {(spec.prev_price - spec.price).toLocaleString()}원
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground block">
                            {spec.prev_price.toLocaleString()}원 ➔ {spec.price.toLocaleString()}원
                          </span>
                          {spec.price_changed_at && (
                            <span className="text-[9px] text-gray-400 block">
                              변동: {new Date(spec.price_changed_at).toLocaleDateString('ko-KR')}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="font-semibold text-gray-900">
                          {spec.price ? `${spec.price.toLocaleString()}원` : '0원'}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">상태</span>
                      {spec.is_discontinued ? (
                        <span className="text-red-600 font-semibold">단종</span>
                      ) : spec.is_no_outbound_3m ? (
                        <span className="text-amber-600 font-semibold">3개월 미출고</span>
                      ) : (
                        <span className="text-green-600 font-semibold">FC 출고 품목</span>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">대분류 / 중분류</span>
                      <span className="font-medium text-gray-700">{spec.category_lg || '-'} / {spec.category_md || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">단수</span>
                      <span className="font-semibold text-gray-900">
                        {getTierCount(spec) != null ? `${getTierCount(spec)}단` : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">포장갯수</span>
                      <span className="font-semibold text-gray-900">
                        {getPackCount(spec) != null ? `${getPackCount(spec)}개` : '-'}
                      </span>
                      {getPackDetail(spec) ? (
                        <span className="block text-[10px] text-muted-foreground mt-0.5">
                          {getPackDetail(spec)}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <span className="text-muted-foreground block mb-0.5">색상</span>
                      <span className="font-medium">
                        {spec.color1 || spec.color2 ? `${spec.color1 || '-'}${spec.color2 ? ` / ${spec.color2}` : ''}` : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {pagedSpecs.length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  {searchQuery || filterCategoryLg !== "all" || filterCategoryMd !== "all" || filterFinishType !== "all" ? "조건에 맞는 검색 결과가 없습니다." : "등록된 제품이 없습니다."}
                </div>
              )}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  이전
                </Button>
                <span className="text-sm text-muted-foreground px-2">
                  {safePage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  다음
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 개별 추가/수정 다이얼로그 */}
      <SpecEditDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        spec={editingSpec}
        onSave={handleSave}
        isSaving={createMutation.isPending || updateMutation.isPending}
        categoryLgOptions={masterCategoryOptions.lg}
        categoryMdOptions={masterCategoryOptions.md}
        categoryMdByLg={masterCategoryOptions.mdByLg}
      />

      {/* 일괄 수정 다이얼로그 */}
      <BulkEditDialog
        isOpen={isBulkDialogOpen}
        onOpenChange={setIsBulkDialogOpen}
        selectedCount={selectedIds.size}
        onSave={handleBulkSave}
        isSaving={bulkUpdateMutation.isPending}
        categoryLgOptions={masterCategoryOptions.lg}
        categoryMdOptions={masterCategoryOptions.md}
        categoryMdByLg={masterCategoryOptions.mdByLg}
      />

      {/* 품목 클릭 → 출고 수량 그래프 (조회 전용) */}
      <ProductOutboundChartDialog
        open={isReportOpen}
        onOpenChange={(open) => {
          setIsReportOpen(open);
          if (!open) setReportSpec(null);
        }}
        spec={reportSpec}
      />
    </div>
  );
}

// FINISH_* / SpecEditDialog / CategoryPickField → @/components/master/spec-edit-dialog

const CUSTOM_CAT_LG_KEY = "vf_master_custom_category_lg";
const CUSTOM_CAT_MD_KEY = "vf_master_custom_category_md";

function loadCustomCategories(kind: "lg" | "md"): string[] {
  try {
    const key = kind === "lg" ? CUSTOM_CAT_LG_KEY : CUSTOM_CAT_MD_KEY;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => String(x || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** DB에 아직 없는 직접 입력 분류를 다음 팝업용으로 기억 */
function rememberCustomCategory(
  kind: "lg" | "md",
  value: string,
  knownFromDb: Set<string>
): boolean {
  const v = (value || "").trim();
  if (!v || knownFromDb.has(v)) return false;
  const key = kind === "lg" ? CUSTOM_CAT_LG_KEY : CUSTOM_CAT_MD_KEY;
  const prev = loadCustomCategories(kind);
  if (prev.includes(v)) return false;
  try {
    localStorage.setItem(key, JSON.stringify([...prev, v].slice(-200)));
    return true;
  } catch {
    return false;
  }
}

const selectFieldClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// Sub-component for Dialog (일괄 수정)
interface BulkEditDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedCount: number;
  onSave: (data: {
    category_lg?: string;
    category_md?: string;
    color1?: string;
    color2?: string;
    location?: string;
    is_discontinued?: boolean;
    is_no_outbound_3m?: boolean;
    is_vf_item?: boolean;
    finish_type?: string;
  }) => void;
  isSaving: boolean;
  categoryLgOptions?: string[];
  categoryMdOptions?: string[];
  categoryMdByLg?: Record<string, string[]>;
}

const BulkEditDialog = ({
  isOpen,
  onOpenChange,
  selectedCount,
  onSave,
  isSaving,
  categoryLgOptions = [],
  categoryMdOptions = [],
  categoryMdByLg = {},
}: BulkEditDialogProps) => {
  const [formData, setFormData] = useState<{
    category_lg: string;
    category_md: string;
    color1: string;
    color2: string;
    location: string;
  }>({
    category_lg: "",
    category_md: "",
    color1: "",
    color2: "",
    location: "",
  });
  
  // 신설: 일괄 전환용 상태 상태 ('keep' | 'active' | 'no_outbound_3m' | 'discontinued')
  const [bulkStatusMode, setBulkStatusMode] = useState<'keep' | 'active' | 'no_outbound_3m' | 'discontinued'>('keep');
  const [bulkVfMode, setBulkVfMode] = useState<'keep' | 'set' | 'unset'>('keep');
  const [bulkFinishMode, setBulkFinishMode] = useState<
    "keep" | "finished" | "needs_packaging" | "unset"
  >("keep");

  const bulkMdOptions = useMemo(() => {
    const lg = (formData.category_lg || "").trim();
    if (lg && categoryMdByLg[lg]?.length) {
      const set = new Set([...categoryMdByLg[lg], ...categoryMdOptions]);
      return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
    }
    return categoryMdOptions;
  }, [formData.category_lg, categoryMdByLg, categoryMdOptions]);

  useEffect(() => {
    if (isOpen) {
      setFormData({ category_lg: "", category_md: "", color1: "", color2: "", location: "" });
      setBulkStatusMode('keep');
      setBulkVfMode('keep');
      setBulkFinishMode("keep");
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    const cleanData: any = {};
    Object.entries(formData).forEach(([key, val]) => {
      if (val.trim()) {
        cleanData[key] = val.trim();
      }
    });
    
    // 상태 일괄 전환 값 적용
    if (bulkStatusMode === 'active') {
      cleanData['is_discontinued'] = false;
      cleanData['is_no_outbound_3m'] = false;
    } else if (bulkStatusMode === 'no_outbound_3m') {
      cleanData['is_discontinued'] = false;
      cleanData['is_no_outbound_3m'] = true;
    } else if (bulkStatusMode === 'discontinued') {
      cleanData['is_discontinued'] = true;
      cleanData['is_no_outbound_3m'] = false;
    }

    if (bulkVfMode === 'set') {
      cleanData['is_vf_item'] = true;
    } else if (bulkVfMode === 'unset') {
      cleanData['is_vf_item'] = false;
    }

    if (bulkFinishMode === "finished") {
      cleanData["finish_type"] = FINISH_FINISHED;
    } else if (bulkFinishMode === "needs_packaging") {
      cleanData["finish_type"] = FINISH_NEEDS_PACKAGING;
    } else if (bulkFinishMode === "unset") {
      cleanData["finish_type"] = "";
    }
    
    onSave(cleanData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>마스터 정보 일괄 수정</DialogTitle>
          <p className="text-xs text-muted-foreground">
            선택하신 <strong>{selectedCount}개</strong> 품목의 정보를 일괄적으로 수정합니다.<br/>
            수정할 항목에만 값을 입력해 주세요. 입력하지 않은 필드는 기존 정보가 유지됩니다.
          </p>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* 신설: 일괄 상태 변경 옵션 라디오 컨트롤 */}
          <div className="space-y-2 border-b pb-4">
            <Label className="font-semibold block mb-2 text-gray-700">품목 상태 일괄 전환</Label>
            <p className="text-[10px] text-muted-foreground -mt-1 mb-2">
              단종 지정/해제는 수동(이 화면)에서만 가능합니다. 미출고 자동 갱신은 단종 품목을 건드리지 않습니다.
            </p>
            <div className="flex flex-wrap gap-2 bg-muted/40 p-1.5 rounded-md border border-input">
              <button
                type="button"
                onClick={() => setBulkStatusMode('keep')}
                className={`flex-1 min-w-[70px] py-1 text-xs font-semibold rounded transition-all ${
                  bulkStatusMode === 'keep'
                    ? 'bg-white shadow text-gray-800 border'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                상태 유지
              </button>
              <button
                type="button"
                onClick={() => setBulkStatusMode('active')}
                className={`flex-1 min-w-[70px] py-1 text-xs font-semibold rounded transition-all ${
                  bulkStatusMode === 'active'
                    ? 'bg-green-50 border border-green-300 text-green-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                FC 출고 품목
              </button>
              <button
                type="button"
                onClick={() => setBulkStatusMode('no_outbound_3m')}
                className={`flex-1 min-w-[70px] py-1 text-xs font-semibold rounded transition-all ${
                  bulkStatusMode === 'no_outbound_3m'
                    ? 'bg-amber-50 border border-amber-300 text-amber-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                FC 3개월 미출고
              </button>
              <button
                type="button"
                onClick={() => setBulkStatusMode('discontinued')}
                className={`flex-1 min-w-[70px] py-1 text-xs font-semibold rounded transition-all ${
                  bulkStatusMode === 'discontinued'
                    ? 'bg-red-50 border border-red-300 text-red-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                단종
              </button>
            </div>
          </div>

          <div className="space-y-2 border-b pb-4">
            <Label className="font-semibold block mb-2 text-gray-700">
              VF 품목 지정 / 해제
            </Label>
            <p className="text-[10px] text-muted-foreground mb-1.5">
              현재 DB가 기준입니다. 지정·해제 후 카드 수량(출고 진행 / 3개월 없음)이 바로 반영됩니다.
            </p>
            <div className="flex flex-wrap gap-2 bg-muted/40 p-1.5 rounded-md border border-input">
              <button
                type="button"
                onClick={() => setBulkVfMode('keep')}
                className={`flex-1 min-w-[70px] py-1 text-xs font-semibold rounded transition-all ${
                  bulkVfMode === 'keep'
                    ? 'bg-white shadow text-gray-800 border'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                변경 안 함
              </button>
              <button
                type="button"
                onClick={() => setBulkVfMode('set')}
                className={`flex-1 min-w-[70px] py-1 text-xs font-semibold rounded transition-all ${
                  bulkVfMode === 'set'
                    ? 'bg-violet-50 border border-violet-300 text-violet-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                VF 지정
              </button>
              <button
                type="button"
                onClick={() => setBulkVfMode('unset')}
                className={`flex-1 min-w-[70px] py-1 text-xs font-semibold rounded transition-all ${
                  bulkVfMode === 'unset'
                    ? 'bg-slate-200 border border-slate-400 text-slate-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                VF 해제
              </button>
            </div>
          </div>
          <div className="space-y-2 border-b pb-4">
            <Label className="font-semibold block mb-2 text-gray-700">
              제품 형태 (완제품 / 포장 필요)
            </Label>
            <div className="flex flex-wrap gap-2 bg-muted/40 p-1.5 rounded-md border border-input">
              <button
                type="button"
                onClick={() => setBulkFinishMode("keep")}
                className={`flex-1 min-w-[70px] py-1 text-xs font-semibold rounded transition-all ${
                  bulkFinishMode === "keep"
                    ? "bg-white shadow text-gray-800 border"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                변경 안 함
              </button>
              <button
                type="button"
                onClick={() => setBulkFinishMode("finished")}
                className={`flex-1 min-w-[70px] py-1 text-xs font-semibold rounded transition-all ${
                  bulkFinishMode === "finished"
                    ? "bg-emerald-50 border border-emerald-300 text-emerald-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                완제품
              </button>
              <button
                type="button"
                onClick={() => setBulkFinishMode("needs_packaging")}
                className={`flex-1 min-w-[70px] py-1 text-xs font-semibold rounded transition-all ${
                  bulkFinishMode === "needs_packaging"
                    ? "bg-orange-50 border border-orange-300 text-orange-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                포장 필요
              </button>
              <button
                type="button"
                onClick={() => setBulkFinishMode("unset")}
                className={`flex-1 min-w-[70px] py-1 text-xs font-semibold rounded transition-all ${
                  bulkFinishMode === "unset"
                    ? "bg-slate-200 border border-slate-400 text-slate-800 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                미지정
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-location">로케이션</Label>
            <Input
              id="bulk-location"
              name="location"
              placeholder="예: 320-A1-1-23 (비워두면 유지, 저장 시 바코드 마스터 등록)"
              value={formData.location}
              onChange={handleChange}
              className="font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              바코드가 있는 품목만 로케이션이 BarcodeMaster에 자동 저장됩니다.
            </p>
          </div>
          <CategoryPickField
            id="bulk-category_lg"
            label="대분류"
            value={formData.category_lg}
            onChange={(v) => setFormData((prev) => ({ ...prev, category_lg: v }))}
            options={categoryLgOptions}
            emptyOptionLabel="— 선택 (변경 안 함) —"
            inputPlaceholder="예: 초대형 · 비우면 유지 · 직접 입력 가능"
            hint="기존 대분류 목록에서 고르거나 새 분류를 입력하세요."
          />
          <CategoryPickField
            id="bulk-category_md"
            label="중분류"
            value={formData.category_md}
            onChange={(v) => setFormData((prev) => ({ ...prev, category_md: v }))}
            options={bulkMdOptions}
            emptyOptionLabel="— 선택 (변경 안 함) —"
            inputPlaceholder="예: 9장팩 · 비우면 유지 · 직접 입력 가능"
            hint="대분류를 고르면 관련 중분류가 우선 표시됩니다."
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bulk-color1">색상1</Label>
              <Input
                id="bulk-color1"
                name="color1"
                placeholder="예: GRAY2"
                value={formData.color1}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-color2">색상2</Label>
              <Input
                id="bulk-color2"
                name="color2"
                placeholder="비워두면 기존값 유지"
                value={formData.color2}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">취소</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            일괄 수정 적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
