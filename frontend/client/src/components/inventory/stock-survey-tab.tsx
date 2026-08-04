import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import JsBarcode from "jsbarcode";
import type { InventoryItem } from "../../types/enhanced-inventory";

/**
 * VF 재고 조사 탭 — scanner 페이지(barcode_scanner.html) UI 차용
 *
 * 레이아웃:
 *   좌측(메인) = 선택 품목의 상품 바코드 + 로케이션 바코드 (큰 카드)
 *   우측(사이드바) = 제품명 리스트 (스크롤, 클릭·키보드 선택)
 *
 * 정렬/모드:
 *   로케이션순 | 로케이션 통합(등록+미등록) | 전체 | 품명순 | 미등록 로케이션
 *
 * 끝번호 정렬 (문자열 사전순, 숫자 크기 아님):
 *   519 → 52 → 520…529 → 53 → 530…539 → 54 …
 */

/** 창고 구간 기준 (대문자 정규화 후 비교) */
const LOCATION_RANGES: { prefix: string; max: number }[] = [
  { prefix: "320-A1-1", max: 999 },
  { prefix: "320-A1-2", max: 199 },
];

/** location | location_merged | all(구 stock) | name | missing_location */
type SortMode =
  | "location"
  | "location_merged"
  | "all"
  | "name"
  | "missing_location";

const SORT_MODES: SortMode[] = [
  "location",
  "location_merged",
  "all",
  "name",
  "missing_location",
];

function normalizeSortMode(raw: unknown): SortMode {
  const s = String(raw || "");
  // 구버전 sessionStorage 호환
  if (s === "stock") return "all";
  if (SORT_MODES.includes(s as SortMode)) return s as SortMode;
  return "location";
}

/** 조사 위치 유지 (새로고침·데이터 재조회 시 선택/스크롤 복원) */
const SURVEY_POS_KEY = "vf-stock-survey-position-v1";

type SurveyPosState = {
  sortBy: SortMode;
  search: string;
  /** surveyRows[].key — 인덱스보다 안정적 */
  selectedKey: string | null;
  listScrollTop: number;
};

function loadSurveyPos(): SurveyPosState {
  const defaults: SurveyPosState = {
    sortBy: "location",
    search: "",
    selectedKey: null,
    listScrollTop: 0,
  };
  try {
    const raw = sessionStorage.getItem(SURVEY_POS_KEY);
    if (!raw) return defaults;
    const p = JSON.parse(raw) as Partial<SurveyPosState>;
    return {
      sortBy: normalizeSortMode(p.sortBy),
      search: typeof p.search === "string" ? p.search : "",
      selectedKey:
        typeof p.selectedKey === "string" && p.selectedKey
          ? p.selectedKey
          : null,
      listScrollTop:
        typeof p.listScrollTop === "number" && p.listScrollTop >= 0
          ? p.listScrollTop
          : 0,
    };
  } catch {
    return defaults;
  }
}

function saveSurveyPos( partial: Partial<SurveyPosState>) {
  try {
    const prev = loadSurveyPos();
    const next: SurveyPosState = { ...prev, ...partial };
    sessionStorage.setItem(SURVEY_POS_KEY, JSON.stringify(next));
  } catch {
    // private mode 등 무시
  }
}

type MissingLocItem = {
  id: string;
  location: string;
  /** 바코드 = 로케이션 문자열 */
  barcode: string;
};

type MasterSpecLite = {
  id?: number;
  barcode?: string;
  is_vf_item?: boolean;
  location?: string;
};

function normalizeLocation(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** 선택 위치 유지용 안정 key (검색 on/off·모드 전환 후에도 동일) */
function productRowKey(barcode: string, location: string): string {
  const bc = String(barcode || "").trim();
  const loc = normalizeLocation(location);
  return loc ? `p:${bc}|${loc}` : `p:${bc}`;
}

function missingRowKey(location: string): string {
  return `missing:${normalizeLocation(location)}`;
}

function rowLocation(row: {
  kind: string;
  product?: { location?: string };
  missing?: { location?: string };
}): string {
  if (row.kind === "missing") return String(row.missing?.location || "");
  return String(row.product?.location || "");
}

/** 로케이션 순 목록을 기준 key/칸부터 시작하도록 회전 */
function rotateRowsFromAnchor<T extends { key: string; kind: string; product?: { location?: string }; missing?: { location?: string } }>(
  rows: T[],
  anchorKey: string | null,
  anchorLoc: string | null
): T[] {
  if (!rows.length) return rows;
  let idx = -1;
  if (anchorKey) {
    idx = rows.findIndex((r) => r.key === anchorKey);
    if (idx < 0 && anchorKey.startsWith("p:") && !anchorKey.includes("|")) {
      idx = rows.findIndex((r) => r.key.startsWith(anchorKey + "|"));
    }
  }
  if (idx < 0 && anchorLoc) {
    const want = normalizeLocation(anchorLoc);
    idx = rows.findIndex((r) => normalizeLocation(rowLocation(r)) === want);
  }
  if (idx <= 0) return rows;
  return [...rows.slice(idx), ...rows.slice(0, idx)];
}

/**
 * 구간 전체 칸 순회: 등록 제품 있으면 제품 행, 없으면 미등록 행
 * (검색 결과 클릭 후 "이 칸부터 순차 조사"용)
 */
function buildFullLocationSequence<T extends { barcode?: string; location: string }>(
  productsWithLoc: T[]
): Array<
  | { kind: "product"; key: string; product: T }
  | { kind: "missing"; key: string; missing: MissingLocItem }
> {
  const byLoc = new Map<string, T[]>();
  for (const p of productsWithLoc) {
    const loc = normalizeLocation(p.location);
    if (!loc) continue;
    if (!byLoc.has(loc)) byLoc.set(loc, []);
    byLoc.get(loc)!.push(p);
  }
  const rows: Array<
    | { kind: "product"; key: string; product: T }
    | { kind: "missing"; key: string; missing: MissingLocItem }
  > = [];
  for (const { prefix, max } of LOCATION_RANGES) {
    const pre = normalizeLocation(prefix);
    // 끝번호 사전순: 1,10,100…519,52,520… (숫자 크기 순 아님)
    for (const n of slotOrderLex(max)) {
      const location = `${pre}-${n}`;
      const locN = normalizeLocation(location);
      const at = byLoc.get(locN) || [];
      if (at.length > 0) {
        for (const p of at) {
          rows.push({
            kind: "product",
            key: productRowKey(String(p.barcode || ""), p.location || location),
            product: p,
          });
        }
      } else {
        // 빈 칸도 순차에 포함 (조사 경로 연속)
        const mk = missingRowKey(location);
        rows.push({
          kind: "missing",
          key: mk,
          missing: { id: mk, location, barcode: location },
        });
      }
    }
  }
  return rows;
}

/** "320-A1-1-164" → { prefix: "320-A1-1", slot: 164 } */
function parseLocationSlot(
  loc: string
): { prefix: string; slot: number } | null {
  const n = normalizeLocation(loc);
  const m = n.match(/^(.*)-(\d+)$/);
  if (!m) return null;
  const slot = parseInt(m[2], 10);
  if (!Number.isFinite(slot) || slot < 1) return null;
  return { prefix: m[1], slot };
}

/**
 * 끝번호 문자열 사전순 (숫자 크기 아님).
 * 예: 519 → 52 → 520…529 → 53 → 530…539 → 54
 * JS: "519".localeCompare("52") < 0, "52".localeCompare("520") < 0
 */
function compareSlotLex(a: number, b: number): number {
  return String(a).localeCompare(String(b), "en");
}

/** 로케이션 전체 문자열 비교: prefix 우선 → 끝번호 사전순 */
function compareLocationLex(a: string, b: string): number {
  const pa = parseLocationSlot(a);
  const pb = parseLocationSlot(b);
  if (pa && pb) {
    if (pa.prefix !== pb.prefix) {
      return pa.prefix.localeCompare(pb.prefix, "en");
    }
    return compareSlotLex(pa.slot, pb.slot);
  }
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;
  return normalizeLocation(a).localeCompare(normalizeLocation(b), "en");
}

/** 구간 내 슬롯 번호 1..max 를 끝번호 사전순으로 */
function slotOrderLex(max: number): number[] {
  const slots: number[] = [];
  for (let n = 1; n <= max; n++) slots.push(n);
  slots.sort(compareSlotLex);
  return slots;
}

/** VF에 등록된 로케이션 집합(정규화 문자열) → 미등록 목록 생성 */
function buildMissingLocations(registeredNormLocs: Set<string>): MissingLocItem[] {
  const occupiedByPrefix = new Map<string, Set<number>>();
  for (const loc of registeredNormLocs) {
    const p = parseLocationSlot(loc);
    if (!p) continue;
    if (!occupiedByPrefix.has(p.prefix)) {
      occupiedByPrefix.set(p.prefix, new Set());
    }
    occupiedByPrefix.get(p.prefix)!.add(p.slot);
  }

  const out: MissingLocItem[] = [];
  for (const { prefix, max } of LOCATION_RANGES) {
    const pre = normalizeLocation(prefix);
    const occupied = occupiedByPrefix.get(pre) || new Set<number>();
    for (let n = 1; n <= max; n++) {
      if (occupied.has(n)) continue;
      const location = `${pre}-${n}`;
      out.push({
        id: `missing:${location}`,
        location,
        barcode: location,
      });
    }
  }
  // prefix 순 + 끝번호 사전순
  out.sort((a, b) => compareLocationLex(a.location, b.location));
  return out;
}

// 바코드 SVG 렌더링 — scanner의 renderBarcode 옵션과 동일
function BarcodeSvg({ value, title }: { value: string; title: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const display = String(value || "").trim();

  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    if (!display) return;
    try {
      JsBarcode(svg, display, {
        format: "CODE128",
        displayValue: true,
        fontSize: 18,
        height: 80,
        margin: 10,
        width: 2,
      });
    } catch {
      // 렌더링 실패 무시
    }
  }, [display]);

  return (
    <div className="bg-white rounded-lg p-5 flex flex-col items-center w-full shadow-sm">
      <div className="text-gray-800 font-bold text-base w-full text-center mb-2">{title}</div>
      {display ? (
        <svg ref={ref} className="w-full max-w-[420px]" />
      ) : (
        <div className="text-gray-400 text-sm py-8 w-full text-center">없음</div>
      )}
    </div>
  );
}

export default function StockSurveyTab() {
  const { data, isLoading } = useQuery<{ data: InventoryItem[] }>({
    queryKey: ["enhanced-inventory-overview"],
    queryFn: async () => {
      const res = await fetch("/api/inventory/unified");
      if (!res.ok) throw new Error("재고 데이터를 불러올 수 없습니다.");
      return res.json();
    },
  });

  // VF 마스터 로케이션 (보강용 — 실패해도 재고 목록은 표시)
  const {
    data: masterSpecs,
    isLoading: masterLoading,
    isError: masterError,
  } = useQuery<MasterSpecLite[]>({
    queryKey: ["master-specs-for-survey-locations"],
    queryFn: async () => {
      const res = await fetch("/api/master/specs");
      if (!res.ok) throw new Error("마스터를 불러올 수 없습니다.");
      const json = await res.json();
      return Array.isArray(json) ? json : json?.data || json?.results || [];
    },
    staleTime: 60_000,
    retry: 1,
  });

  // 초기값: 세션에 저장된 조사 위치 (F5·탭 재진입 시 유지)
  const initialPosRef = useRef<SurveyPosState | null>(null);
  if (initialPosRef.current === null) {
    initialPosRef.current = loadSurveyPos();
  }
  const [search, setSearch] = useState(() => initialPosRef.current!.search);
  const [sortBy, setSortBy] = useState<SortMode>(
    () => initialPosRef.current!.sortBy
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  /** 복원 대상 row key (데이터 도착 후 surveyRows에서 인덱스 찾음) */
  const selectedKeyRef = useRef<string | null>(
    initialPosRef.current!.selectedKey
  );
  const listScrollRestoreRef = useRef(initialPosRef.current!.listScrollTop);
  const skipNextScrollIntoViewRef = useRef(true); // 첫 복원 시 부드러운 점프 방지 여부
  const filterDirtyRef = useRef(false); // 사용자가 정렬을 바꾼 직후
  /**
   * 검색 결과 클릭 후: 이 key/로케이션부터 로케이션 순 전체 순회
   * (검색창 비움 + 목록 회전)
   */
  const [listAnchorKey, setListAnchorKey] = useState<string | null>(null);
  const [listAnchorLoc, setListAnchorLoc] = useState<string | null>(null);

  const isMissingMode = sortBy === "missing_location";
  const isMergedMode = sortBy === "location_merged";

  const handleSortBy = useCallback((key: SortMode) => {
    // 정렬 모드 변경 → 앵커 해제, 맨 앞
    filterDirtyRef.current = true;
    selectedKeyRef.current = null;
    setListAnchorKey(null);
    setListAnchorLoc(null);
    setSortBy(key);
    setCurrentIndex(0);
    saveSurveyPos({ sortBy: key, selectedKey: null, listScrollTop: 0 });
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    // 검색어 입력 중에는 앵커 유지하지 않음(새 검색). 선택 key는 유지 가능
    if (value.trim()) {
      setListAnchorKey(null);
      setListAnchorLoc(null);
    }
    filterDirtyRef.current = false;
    setSearch(value);
    saveSurveyPos({
      search: value,
      selectedKey: selectedKeyRef.current,
    });
  }, []);

  /** 목록 행 클릭 — 검색 중이면 검색 해제 + 해당 칸부터 로케이션 순차 */
  const selectSurveyRow = useCallback(
    (row: { key: string; kind: string; product?: { location?: string }; missing?: { location?: string } }, idx: number) => {
      selectedKeyRef.current = row.key;
      const loc = rowLocation(row);

      if (search.trim()) {
        // 검색 결과에서 선택 → 검색 비우고 로케이션 통합 순, 이 칸부터 이어서
        filterDirtyRef.current = false;
        setListAnchorKey(row.key);
        setListAnchorLoc(loc || null);
        setSearch("");
        setSortBy("location_merged");
        setCurrentIndex(0);
        skipNextScrollIntoViewRef.current = false;
        saveSurveyPos({
          search: "",
          sortBy: "location_merged",
          selectedKey: row.key,
          listScrollTop: 0,
        });
        return;
      }

      // 검색 아님: 그냥 선택
      setCurrentIndex(idx);
      saveSurveyPos({ selectedKey: row.key });
    },
    [search]
  );

  /** barcode → 마스터 로케이션 (재고 location 비어 있을 때 보강) */
  const locationByBarcode = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of masterSpecs || []) {
      const bc = String(s.barcode || "").trim();
      const loc = String(s.location || "").trim();
      if (bc && loc) m.set(bc, loc);
    }
    return m;
  }, [masterSpecs]);

  const resolveLocation = useCallback(
    (it: InventoryItem) => {
      const fromInv = String(it.location || "").trim();
      if (fromInv) return fromInv;
      const bc = String(it.barcode || "").trim();
      return (bc && locationByBarcode.get(bc)) || "";
    },
    [locationByBarcode]
  );

  /**
   * 이 탭 전용 로케이션 검색
   * - 숫자만 입력: 끝 슬롯 번호가 **정확히 동일**할 때만 (121 → …-121, …-1121 제외)
   * - 그 외: 전체 로케이션 문자열 일치/부분일치 (대소문자 무시)
   */
  const locationMatchesQuery = useCallback((location: string, rawQuery: string) => {
    const loc = normalizeLocation(location);
    if (!loc) return false;
    const q = rawQuery.trim();
    if (!q) return true;
    // 숫자만 → 슬롯 번호 완전 일치만
    if (/^\d+$/.test(q)) {
      const slot = parseInt(q, 10);
      const parsed = parseLocationSlot(loc);
      return !!parsed && parsed.slot === slot;
    }
    const qNorm = normalizeLocation(q);
    return loc === qNorm || loc.includes(qNorm);
  }, []);

  /** VF 품목에 한 번이라도 붙은 로케이션(정규화) */
  const registeredVfLocations = useMemo(() => {
    const set = new Set<string>();
    const specs = masterSpecs || [];
    for (const s of specs) {
      if (!s.is_vf_item) continue;
      const loc = normalizeLocation(s.location || "");
      if (loc) set.add(loc);
    }
    // 마스터 location 비어 있어도 재고 쪽 로케이션 보강
    for (const it of data?.data || []) {
      if (it.is_vf_item === false) continue;
      const loc = normalizeLocation(it.location || resolveLocation(it));
      if (loc) set.add(loc);
    }
    return set;
  }, [masterSpecs, data, resolveLocation]);

  const missingItems = useMemo(() => {
    let list = buildMissingLocations(registeredVfLocations);
    if (search.trim()) {
      list = list.filter((m) => locationMatchesQuery(m.location, search));
    }
    return list;
  }, [registeredVfLocations, search, locationMatchesQuery]);

  type ProductWithLoc = InventoryItem & { location: string };
  type SurveyRow =
    | { kind: "product"; key: string; product: ProductWithLoc }
    | { kind: "missing"; key: string; missing: MissingLocItem };

  const productsWithLoc = useMemo((): ProductWithLoc[] => {
    return (data?.data || [])
      .map((it) => ({
        ...it,
        location: resolveLocation(it) || String(it.location || "").trim(),
      }))
      .filter((it) => String(it.barcode || "").trim());
  }, [data, resolveLocation]);

  /**
   * 우측 목록 행 구성
   * - 미등록: 미등록 칸만 (끝번호 사전순)
   * - 로케이션 통합: 등록+미등록 전체 칸 (끝번호 사전순)
   * - 로케이션순: 등록 제품만 (끝번호 사전순)
   * - 전체: 등록 제품 전부 (로케이션 사전순)
   * - 품명순: 등록 제품 품명
   * - 검색 클릭 앵커: 통합 순회 + 선택 칸부터 회전
   */
  const surveyRows = useMemo((): SurveyRow[] => {
    if (isMissingMode) {
      return missingItems.map((m) => ({
        kind: "missing" as const,
        key: missingRowKey(m.location),
        missing: { ...m, id: missingRowKey(m.location) },
      }));
    }

    const q = search.trim();

    // 검색 결과 클릭 후 / 통합 모드 앵커: 전체 칸 순회 + 선택 칸부터 회전
    if (
      (sortBy === "location_merged" || sortBy === "location") &&
      !q &&
      listAnchorKey
    ) {
      const seq = buildFullLocationSequence(productsWithLoc);
      return rotateRowsFromAnchor(seq, listAnchorKey, listAnchorLoc);
    }

    // 로케이션 통합 (등록+미등록) — 검색 없으면 전체 칸
    if (sortBy === "location_merged" && !q) {
      return buildFullLocationSequence(productsWithLoc);
    }

    // 로케이션순/통합 + 순수 숫자 검색 → 칸 단위 (등록·미등록)
    if (
      (sortBy === "location" || sortBy === "location_merged") &&
      /^\d+$/.test(q)
    ) {
      const slot = parseInt(q, 10);
      const rows: SurveyRow[] = [];
      for (const { prefix, max } of LOCATION_RANGES) {
        if (slot < 1 || slot > max) continue;
        const pre = normalizeLocation(prefix);
        const location = `${pre}-${slot}`;
        const atLoc = productsWithLoc.filter(
          (it) => normalizeLocation(it.location) === location
        );
        if (atLoc.length > 0) {
          for (const p of atLoc) {
            rows.push({
              kind: "product",
              key: productRowKey(String(p.barcode || ""), p.location || location),
              product: p,
            });
          }
        } else {
          const mk = missingRowKey(location);
          rows.push({
            kind: "missing",
            key: mk,
            missing: { id: mk, location, barcode: location },
          });
        }
      }
      // 구간(prefix) 순 — 동일 끝번호면 A1-1 이 A1-2 보다 앞
      rows.sort((a, b) =>
        compareLocationLex(rowLocation(a), rowLocation(b))
      );
      return rows;
    }

    // 품목 필터
    const filtered = productsWithLoc.filter((it) => {
      if (!q) return true;
      if (/^\d+$/.test(q)) {
        return locationMatchesQuery(it.location, q);
      }
      const qLower = q.toLowerCase();
      const nameHit = (it.productName || "").toLowerCase().includes(qLower);
      const bcHit = String(it.barcode || "").toLowerCase().includes(qLower);
      const locHit = locationMatchesQuery(it.location, q);
      return nameHit || bcHit || locHit;
    });

    let sorted = filtered;
    if (sortBy === "name") {
      sorted = [...filtered].sort((a, b) =>
        String(a.productName || "").localeCompare(String(b.productName || ""), "ko")
      );
    } else if (sortBy === "all") {
      // 전체: 등록 제품 전부, 끝번호 사전순
      sorted = [...filtered].sort((a, b) =>
        compareLocationLex(a.location, b.location)
      );
    } else {
      // 로케이션순 (등록 제품만) — 끝번호 사전순
      sorted = [...filtered].sort((a, b) => {
        const la = String(a.location || "").trim();
        const lb = String(b.location || "").trim();
        if (!la && !lb) return 0;
        if (!la) return 1;
        if (!lb) return -1;
        return compareLocationLex(la, lb);
      });
    }

    const rows: SurveyRow[] = sorted.map((p) => ({
      kind: "product" as const,
      key: productRowKey(String(p.barcode || ""), p.location),
      product: p,
    }));

    // 로케이션/통합 모드에서 문자 검색 시 미등록 칸도 노출
    if (
      q &&
      (sortBy === "location" || sortBy === "location_merged") &&
      !/^\d+$/.test(q)
    ) {
      for (const m of missingItems) {
        if (locationMatchesQuery(m.location, q)) {
          const mk = missingRowKey(m.location);
          rows.push({
            kind: "missing",
            key: mk,
            missing: { ...m, id: mk },
          });
        }
      }
      rows.sort((a, b) =>
        compareLocationLex(rowLocation(a), rowLocation(b))
      );
    }
    return rows;
  }, [
    isMissingMode,
    missingItems,
    sortBy,
    search,
    productsWithLoc,
    locationMatchesQuery,
    listAnchorKey,
    listAnchorLoc,
  ]);

  const listLength = surveyRows.length;

  // 데이터/목록 재구성 후: 저장된 key 로 위치 복원
  // (새로고침 · refetch · 검색창 비우기 후 512 항목 유지)
  useEffect(() => {
    if (listLength === 0) return;

    // 정렬 모드만 사용자가 바꿈 → 맨 앞
    if (filterDirtyRef.current) {
      filterDirtyRef.current = false;
      selectedKeyRef.current = surveyRows[0]?.key ?? null;
      setCurrentIndex(0);
      return;
    }

    // 검색 클릭 앵커: 회전 후 항상 0번이 선택 칸
    if (
      listAnchorKey &&
      (sortBy === "location" || sortBy === "location_merged") &&
      !search.trim()
    ) {
      selectedKeyRef.current = surveyRows[0]?.key ?? listAnchorKey;
      setCurrentIndex(0);
      return;
    }

    const wantKey = selectedKeyRef.current;
    if (wantKey) {
      let idx = surveyRows.findIndex((r) => r.key === wantKey);
      // 구버전 key(p:barcode only) 호환: 접두 일치
      if (idx < 0 && wantKey.startsWith("p:") && !wantKey.includes("|")) {
        idx = surveyRows.findIndex(
          (r) => r.kind === "product" && r.key.startsWith(wantKey + "|")
        );
        if (idx < 0) {
          idx = surveyRows.findIndex(
            (r) => r.kind === "product" && r.key === wantKey
          );
        }
      }
      if (idx >= 0) {
        setCurrentIndex((prev) => (prev === idx ? prev : idx));
        selectedKeyRef.current = surveyRows[idx].key;
        return;
      }
    }
    if (currentIndex >= listLength) {
      setCurrentIndex(listLength - 1);
    }
  }, [surveyRows, listLength, listAnchorKey, sortBy, search]); // currentIndex 의도적 제외

  const totalStock = useMemo(
    () =>
      productsWithLoc.reduce((sum, it) => sum + (it.currentStock || 0), 0),
    [productsWithLoc]
  );

  const safeIndex = listLength === 0 ? 0 : Math.min(currentIndex, listLength - 1);
  const currentRow = surveyRows[safeIndex];
  const currentProduct =
    currentRow?.kind === "product" ? currentRow.product : undefined;
  const currentMissing =
    currentRow?.kind === "missing" ? currentRow.missing : undefined;
  const showingMissingRow = currentRow?.kind === "missing";

  /** 목록 한 화면에 보이는 대략 개수 → PageUp/PageDown 점프 폭 */
  const PAGE_STEP = 10;

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (listLength === 0 ? 0 : Math.min(i + 1, listLength - 1)));
  }, [listLength]);
  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (listLength === 0 ? 0 : Math.max(i - 1, 0)));
  }, [listLength]);
  const goPageNext = useCallback(() => {
    setCurrentIndex((i) =>
      listLength === 0 ? 0 : Math.min(i + PAGE_STEP, listLength - 1)
    );
  }, [listLength]);
  const goPagePrev = useCallback(() => {
    setCurrentIndex((i) =>
      listLength === 0 ? 0 : Math.max(i - PAGE_STEP, 0)
    );
  }, [listLength]);
  const goFirst = useCallback(() => {
    // 앵커 순회 중 "처음" = 앵커 시작(목록 0번). 앵커 해제 후 전체 맨 앞은 정렬 버튼으로.
    setCurrentIndex(0);
  }, []);
  const goLast = useCallback(() => {
    setCurrentIndex(listLength === 0 ? 0 : listLength - 1);
  }, [listLength]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mainPanelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // 선택 key · 스크롤 위치 세션 저장
  useEffect(() => {
    const key = currentRow?.key ?? null;
    if (key) selectedKeyRef.current = key;
    saveSurveyPos({
      sortBy,
      search,
      selectedKey: key,
      listScrollTop: listRef.current?.scrollTop ?? listScrollRestoreRef.current,
    });
  }, [safeIndex, sortBy, search, currentRow?.key]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      // PageDown / PageUp — 목록 페이지 단위 이동
      if (e.code === "PageDown") {
        e.preventDefault();
        goPageNext();
        return;
      }
      if (e.code === "PageUp") {
        e.preventDefault();
        goPagePrev();
        return;
      }
      if (e.code === "Home") {
        e.preventDefault();
        goFirst();
        return;
      }
      if (e.code === "End") {
        e.preventDefault();
        goLast();
        return;
      }
      if (e.code === "Space" || e.code === "ArrowRight" || e.code === "ArrowDown") {
        e.preventDefault();
        goNext();
      } else if (e.code === "ArrowLeft" || e.code === "ArrowUp") {
        e.preventDefault();
        goPrev();
      }
    },
    [goNext, goPrev, goPageNext, goPagePrev, goFirst, goLast]
  );

  /** 메인 카드 영역 휠 → 항목 이동 (Shift+휠 = 페이지 단위) */
  const onMainWheel = useCallback(
    (e: React.WheelEvent) => {
      // 세로 스크롤 의도일 때만 (가로 무시)
      if (Math.abs(e.deltaY) < 2) return;
      e.preventDefault();
      if (e.shiftKey) {
        if (e.deltaY > 0) goPageNext();
        else goPagePrev();
      } else {
        if (e.deltaY > 0) goNext();
        else goPrev();
      }
    },
    [goNext, goPrev, goPageNext, goPagePrev]
  );

  // 재고(unified)만 필수. 마스터는 로케이션 보강·미등록 칸용 — 실패 시에도 목록 표시
  const loading = isLoading;
  const masterPending = masterLoading && !masterSpecs;

  // 목록 스크롤 위치 1회 복원 (새로고침 직후 · 데이터 로드 완료 시)
  useEffect(() => {
    if (loading || !listRef.current || listLength === 0) return;
    const top = listScrollRestoreRef.current;
    if (top > 0) {
      listRef.current.scrollTop = top;
      listScrollRestoreRef.current = 0;
      skipNextScrollIntoViewRef.current = true;
    }
  }, [listLength, loading]);

  // 선택 항목이 우측 리스트에 보이도록 스크롤
  useEffect(() => {
    if (!listRef.current) return;
    if (skipNextScrollIntoViewRef.current) {
      skipNextScrollIntoViewRef.current = false;
      // 복원 직후: nearest 로 한 번 보정 (부드럽게 맨 위로 튀지 않게)
      const active = listRef.current.querySelector(
        '[data-active="true"]'
      ) as HTMLElement | null;
      if (active) active.scrollIntoView({ behavior: "auto", block: "nearest" });
      return;
    }
    const active = listRef.current.querySelector(
      '[data-active="true"]'
    ) as HTMLElement | null;
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [safeIndex, surveyRows]);

  useEffect(() => {
    // 메인 카드 상단으로 스크롤 (페이지 점프 후 큰 바코드가 보이도록)
    // 단, 최초 복원 직후 한 번은 스킵 (조사 중 시야 유지)
    if (mainPanelRef.current && !skipNextScrollIntoViewRef.current) {
      mainPanelRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [safeIndex]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const onListScroll = useCallback(() => {
    if (!listRef.current) return;
    const top = listRef.current.scrollTop;
    listScrollRestoreRef.current = top;
    saveSurveyPos({ listScrollTop: top });
  }, []);
  const empty = listLength === 0;
  const isNumericLocSearch =
    (sortBy === "location" || sortBy === "location_merged") &&
    /^\d+$/.test(search.trim());

  const sortButtons: { key: SortMode; label: string; activeClass: string }[] = [
    { key: "location", label: "로케이션 순", activeClass: "bg-blue-600 text-white" },
    {
      key: "location_merged",
      label: "로케이션 통합",
      activeClass: "bg-violet-600 text-white",
    },
    { key: "all", label: "전체", activeClass: "bg-blue-600 text-white" },
    { key: "name", label: "품명 순", activeClass: "bg-blue-600 text-white" },
    {
      key: "missing_location",
      label: "미등록 로케이션",
      activeClass: "bg-red-600 text-white",
    },
  ];

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="space-y-4 outline-none"
    >
      {/* 상단: 검색(축소) + 정렬 + 통계 */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={isMissingMode ? "로케이션 검색..." : "품명 / 바코드 / 로케이션"}
          className="w-44 sm:w-52 shrink-0 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {sortButtons.map(({ key, label, activeClass }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSortBy(key)}
              title={
                key === "location_merged"
                  ? "등록+미등록 로케이션 통합 · 끝번호 사전순(519→52→520…)"
                  : key === "location" || key === "all"
                    ? "끝번호 사전순(519→52→520…529→53…)"
                    : undefined
              }
              className={`px-2.5 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                sortBy === key
                  ? activeClass
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-sm text-gray-500 whitespace-nowrap ml-auto">
          {isMissingMode ? (
            <>
              미등록{" "}
              <b className="text-amber-800">{missingItems.length.toLocaleString()}</b>칸
              <span className="text-gray-400 ml-1">
                (320-A1-1:1~999 · 320-A1-2:1~199)
              </span>
            </>
          ) : isNumericLocSearch ? (
            <>
              로케이션 검색 결과{" "}
              <b className="text-gray-700">{listLength}</b>건
              <span className="text-gray-400 ml-1">(끝번호 {search.trim()})</span>
            </>
          ) : (
            <>
              총 <b className="text-gray-700">{listLength}</b>개 · 재고 합계{" "}
              <b className="text-gray-700">{totalStock.toLocaleString()}</b>
            </>
          )}
        </div>
      </div>

      {(isMissingMode ||
        isMergedMode ||
        isNumericLocSearch ||
        (listAnchorKey && !search.trim())) && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {listAnchorKey && !search.trim() && !isMissingMode ? (
            <>
              <b>{listAnchorLoc || "선택 칸"}</b> 부터 끝번호 사전순으로 이어서 표시합니다
              (519→52→520… · 등록·미등록 포함 · 검색 비움).{" "}
              <button
                type="button"
                className="underline text-blue-700 font-medium"
                onClick={() => {
                  setListAnchorKey(null);
                  setListAnchorLoc(null);
                  filterDirtyRef.current = true;
                  setCurrentIndex(0);
                }}
              >
                전체 처음부터
              </button>
            </>
          ) : isMergedMode && !search.trim() ? (
            <>
              <b>로케이션 통합</b>: 등록 제품 + 미등록 칸을 한 목록에 표시. 끝번호는{" "}
              <b>문자열 사전순</b> (예: 519 → 52 → 520…529 → 53 → 530…).{" "}
              <span className="text-red-600 font-semibold">빨강=미등록</span>
              {" · "}
              <span className="text-blue-700 font-semibold">파랑=등록</span>
            </>
          ) : isNumericLocSearch ? (
            <>
              숫자 검색은 끝 번호가 <b>정확히 {search.trim()}</b> 인 칸만 표시합니다
              (예: 320-A1-1-{search.trim()}, 320-A1-2-{search.trim()}).{" "}
              <span className="text-red-600 font-semibold">빨간 글씨 = 미등록</span>
              {" · "}
              <span className="text-blue-700 font-semibold">파란 글씨 = 등록 제품</span>
              . 항목을 <b>클릭</b>하면 검색이 지워지고 그 칸부터 순차 조사합니다.
            </>
          ) : (
            <>
              VF 품목에 로케이션이 한 번도 안 붙은 칸만 표시합니다.{" "}
              <span className="text-red-600 font-semibold">빨간 글씨 = 미등록</span>
              . 바코드 값 = 로케이션 번호. 끝번호 사전순 정렬.
            </>
          )}
        </p>
      )}

      {(masterPending || masterError) && !loading && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
          {masterPending
            ? "마스터 로케이션 보강 로딩 중… (재고 목록은 먼저 표시)"
            : "마스터 API 연결 실패 — 재고 데이터만 표시합니다. 미등록 로케이션/로케이션 보강이 부정확할 수 있습니다."}
        </p>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-500">데이터 로딩 중...</div>
      ) : empty ? (
        <div className="text-center py-16 text-gray-500">
          {search.trim()
            ? "검색 결과가 없습니다."
            : isMissingMode
              ? "미등록 로케이션이 없습니다. (구간 내 모두 등록됨)"
              : "표시할 재고 품목(바코드 등록)이 없습니다."}
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 lg:h-[70vh]">
          {/* 좌측 메인 */}
          <div
            ref={mainPanelRef}
            onWheel={onMainWheel}
            className="lg:flex-1 lg:min-h-0 min-h-[60vh] bg-white border border-gray-200 rounded-lg p-6 overflow-y-auto flex flex-col items-center order-1 overscroll-contain"
          >
            <div className="w-full max-w-[420px] flex flex-col gap-2 mb-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={safeIndex === 0}
                  className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ◀ 이전
                </button>
                <span className="text-gray-600 font-medium tabular-nums">
                  {safeIndex + 1} / {listLength}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={safeIndex === listLength - 1}
                  className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  다음 ▶
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={goPagePrev}
                  disabled={safeIndex === 0}
                  title="Page Up — 10개 이전"
                  className="px-3 py-1.5 rounded-md bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                >
                  ⏫ 페이지↑
                </button>
                <button
                  type="button"
                  onClick={goFirst}
                  disabled={safeIndex === 0}
                  title="Home — 맨 앞"
                  className="px-2 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                >
                  처음
                </button>
                <button
                  type="button"
                  onClick={goLast}
                  disabled={safeIndex === listLength - 1}
                  title="End — 맨 끝"
                  className="px-2 py-1.5 rounded-md text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                >
                  끝
                </button>
                <button
                  type="button"
                  onClick={goPageNext}
                  disabled={safeIndex === listLength - 1}
                  title="Page Down — 10개 다음"
                  className="px-3 py-1.5 rounded-md bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
                >
                  페이지↓ ⏬
                </button>
              </div>
            </div>

            {showingMissingRow && currentMissing ? (
              <>
                <div className="w-full max-w-[420px] mb-4 rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3">
                  <div className="text-xs text-red-700 font-bold mb-1">미등록 로케이션</div>
                  <div className="text-2xl font-bold text-red-600 font-mono tracking-tight">
                    {currentMissing.location}
                  </div>
                  <div className="mt-1 text-xs text-red-600/80">
                    제품 미배정 · 바코드 = 로케이션
                  </div>
                </div>
                <BarcodeSvg value={currentMissing.barcode} title="로케이션 바코드" />
                <div className="mt-4 text-xs text-gray-400 text-center leading-relaxed">
                  ⌨️ Space · → · ↓ : 다음 · ← · ↑ : 이전
                  <br />
                  Page↓ / Page↑ : 10개 점프 · Home / End : 처음·끝
                  <br />
                  메인 영역 휠 : 이전/다음 · Shift+휠 : 페이지 점프
                </div>
              </>
            ) : currentProduct ? (
              <>
                <div className="w-full max-w-[420px] mb-4">
                  <div className="text-xs text-gray-500 font-medium mb-1">제품명</div>
                  <div
                    className="text-lg font-bold text-gray-900 break-words"
                    title={currentProduct.productName || ""}
                  >
                    {currentProduct.productName || "-"}
                  </div>
                  {currentProduct.location ? (
                    <div className="mt-1 text-sm font-mono text-gray-600">
                      로케이션 {currentProduct.location}
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-xs text-gray-500 font-medium">현재고</span>
                    <span
                      className={`text-2xl font-bold ${
                        (currentProduct.currentStock || 0) <= 0
                          ? "text-red-600"
                          : (currentProduct.currentStock || 0) <= 10
                            ? "text-amber-600"
                            : "text-blue-700"
                      }`}
                    >
                      {(currentProduct.currentStock || 0).toLocaleString()}
                    </span>
                    <span className="text-sm text-gray-500">BOX</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2 pt-2 border-t border-gray-100">
                    <span className="text-xs text-gray-500 font-medium">전체 총수량 합계</span>
                    <span className="text-lg font-bold text-gray-900">
                      {totalStock.toLocaleString()}
                    </span>
                    <span className="text-xs text-gray-500">BOX</span>
                  </div>
                </div>
                <BarcodeSvg
                  value={String(currentProduct.barcode || "").trim()}
                  title="상품 바코드"
                />
                <div className="mt-4 w-full max-w-[420px]">
                  <BarcodeSvg
                    value={String(currentProduct.location || "").trim()}
                    title="로케이션"
                  />
                </div>
                <div className="mt-4 text-xs text-gray-400 text-center leading-relaxed">
                  ⌨️ Space · → · ↓ : 다음 · ← · ↑ : 이전
                  <br />
                  Page↓ / Page↑ : 10개 점프 · Home / End : 처음·끝
                  <br />
                  메인 영역 휠 : 이전/다음 · Shift+휠 : 페이지 점프
                </div>
              </>
            ) : (
              <div className="text-gray-400">항목을 선택하세요.</div>
            )}
          </div>

          {/* 우측 리스트 */}
          <div className="lg:w-[320px] lg:shrink-0 lg:min-h-0 min-h-[40vh] bg-gray-50 border border-gray-200 rounded-lg p-3 flex flex-col order-2">
            <div className="flex items-center justify-between mb-2 px-1 gap-1">
              <span className="text-sm font-semibold text-gray-700">
                {isMissingMode
                  ? "미등록 로케이션"
                  : isMergedMode || (listAnchorKey && !search.trim())
                    ? "로케이션 통합"
                    : isNumericLocSearch
                      ? "로케이션 검색"
                      : sortBy === "all"
                        ? "전체 제품"
                        : "제품명 목록"}
              </span>
              <span className="text-xs text-gray-500 tabular-nums shrink-0">
                {safeIndex + 1} / {listLength}
              </span>
            </div>
            <div className="flex gap-1 mb-2 px-0.5">
              <button
                type="button"
                onClick={goPagePrev}
                disabled={safeIndex === 0}
                className="flex-1 py-1 text-[11px] rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                Pg↑
              </button>
              <button
                type="button"
                onClick={goPageNext}
                disabled={safeIndex === listLength - 1}
                className="flex-1 py-1 text-[11px] rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-40"
              >
                Pg↓
              </button>
            </div>
            <ul
              ref={listRef}
              onScroll={onListScroll}
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-2 list-none p-0 m-0 scroll-smooth"
            >
              {surveyRows.map((row, idx) => {
                const active = idx === safeIndex;
                if (row.kind === "missing") {
                  const it = row.missing;
                  return (
                    <li
                      key={row.key}
                      data-active={active}
                      onClick={() => selectSurveyRow(row, idx)}
                      title={it.location}
                      className={`p-2.5 rounded-md cursor-pointer border-2 transition-colors flex flex-col gap-0.5 ${
                        active
                          ? "border-red-500 bg-red-50"
                          : "border-red-100 bg-red-50/60 hover:border-red-300"
                      }`}
                    >
                      <div className="text-xs text-red-600 font-bold">
                        #{idx + 1} · 미등록
                      </div>
                      <div className="text-sm font-mono font-bold text-red-600">
                        {it.location}
                      </div>
                      <div className="text-[10px] text-red-500/80 font-mono truncate">
                        바코드 {it.barcode}
                      </div>
                    </li>
                  );
                }
                const it = row.product;
                const stock = it.currentStock || 0;
                return (
                  <li
                    key={row.key}
                    data-active={active}
                    onClick={() => selectSurveyRow(row, idx)}
                    title={it.productName || ""}
                    className={`p-2.5 rounded-md cursor-pointer border-2 transition-colors flex flex-col gap-0.5 ${
                      active
                        ? "border-blue-500 bg-blue-50"
                        : "border-transparent bg-white hover:border-blue-200"
                    }`}
                  >
                    <div className="text-xs text-blue-600 font-medium">
                      #{idx + 1} · 등록
                      {it.location ? (
                        <span className="ml-1.5 text-blue-700 font-mono">
                          · {String(it.location).trim()}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm text-blue-900 truncate font-medium">
                      {it.productName || "-"}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-bold ${
                          stock <= 0
                            ? "text-red-600"
                            : stock <= 10
                              ? "text-amber-600"
                              : "text-blue-700"
                        }`}
                      >
                        {stock.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-gray-400">BOX</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
