import { useEffect, useRef, useState } from "react";

const NUMBER_FORMATTER = new Intl.NumberFormat("ko-KR");
const FALLBACK_PORTS = [5174, 5173, 5176, 5177, 5178, 5179, 5180];

function StatCard({
  title,
  icon,
  valueId,
  defaultValue,
  subtitleId,
  defaultSubtitle,
}: {
  title: string;
  icon: string;
  valueId: string;
  defaultValue: string;
  subtitleId: string;
  defaultSubtitle: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-2 shadow-sm flex items-start">
      <div className="flex-1">
        <p className="text-xs text-muted-foreground mb-0.5">{title}</p>
        <p className="text-lg font-semibold text-foreground leading-tight" id={valueId}>
          {defaultValue}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1" id={subtitleId}>
          {defaultSubtitle}
        </p>
      </div>
      <div className="ml-2 text-primary/80">
        <i className={`fas ${icon} text-lg`} aria-hidden />
      </div>
    </div>
  );
}

function BarcodeStatsPanel() {
  const [stats, setStats] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(["ALL"]));
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'count', direction: 'desc' });
  const filterRef = useRef<HTMLDivElement>(null);

  // Close filter popup when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/baco/transfer-stats');
      const json = await res.json();
      if (json.success && json.data) {
        setStats(json.data);
        setLastUpdated(json.timestamp ? new Date(json.timestamp).toLocaleTimeString() : null);
      } else {
        setStats([]);
        setLastUpdated(null);
      }
    } catch (err) {
      console.error("Failed to fetch barcode stats:", err);
    }
  };

  const handleReset = async () => {
    if (!confirm("정말로 모든 출고 내역 데이터를 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) return;

    try {
      const res = await fetch('/api/baco/transfer-stats', { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setStats([]);
        setLastUpdated(null);
        alert("데이터가 초기화되었습니다.");
      } else {
        alert("초기화 실패: " + json.error);
      }
    } catch (err) {
      console.error("Failed to reset stats:", err);
      alert("오류가 발생했습니다.");
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, []);

  const categories = Array.from(new Set(stats.map(s => s.category || '-'))).sort();

  const filteredStats = stats.filter((item) => {
    // Category Filter
    if (!selectedCategories.has("ALL") && !selectedCategories.has(item.category)) {
      return false;
    }

    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const target = (item.productName + " " + item.category).toLowerCase();

    // OR logic (&)
    if (term.includes("&")) {
      const parts = term.split("&").map((s) => s.trim()).filter(Boolean);
      return parts.some((part) => target.includes(part));
    }
    // AND logic (+)
    if (term.includes("+")) {
      const parts = term.split("+").map((s) => s.trim()).filter(Boolean);
      return parts.every((part) => target.includes(part));
    }
    // Default: simple includes
    return target.includes(term);
  });

  // Sorting Logic
  const sortedStats = [...filteredStats].sort((a, b) => {
    if (sortConfig.key === 'count') {
      const valA = Number(a.count) || 0;
      const valB = Number(b.count) || 0;
      return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
    } else {
      const valA = String(a[sortConfig.key] || '').toLowerCase();
      const valB = String(b[sortConfig.key] || '').toLowerCase();
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    }
  });

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? '▲' : '▼';
  };

  const toggleCategory = (cat: string) => {
    const newSet = new Set(selectedCategories);
    if (cat === "ALL") {
      newSet.clear();
      newSet.add("ALL");
    } else {
      if (newSet.has("ALL")) newSet.delete("ALL");

      if (newSet.has(cat)) {
        newSet.delete(cat);
      } else {
        newSet.add(cat);
      }

      if (newSet.size === 0) {
        newSet.add("ALL");
      }
    }
    setSelectedCategories(newSet);
  };

  const totalCount = filteredStats.reduce((sum, item) => sum + (Number(item.count) || 0), 0);

  return (
    <div className="bg-card border border-border rounded-lg shadow-sm h-full flex flex-col">
      <div className="p-4 border-b border-border bg-muted/20 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <i className="fas fa-barcode text-primary"></i>
              출고 내역
            </h3>
            <p className="text-xs text-muted-foreground">
              전체 기록 {lastUpdated && `(${lastUpdated})`}
            </p>
          </div>
          <div className="text-right flex items-center gap-3">
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors"
              title="데이터 초기화"
            >
              <i className="fas fa-trash-alt"></i> 초기화
            </button>
            <div>
              <span className="text-lg font-bold text-primary">{NUMBER_FORMATTER.format(totalCount)}</span>
              <span className="text-xs text-muted-foreground ml-1">개</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 relative" ref={filterRef}>
          <button
            className="btn btn-sm btn-outline text-xs px-2 min-h-0 h-8 gap-1"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            대분류 필터 ▼
          </button>

          {isFilterOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50 p-2 max-h-60 overflow-y-auto">
              <label className="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 rounded cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={selectedCategories.has("ALL")}
                  onChange={() => toggleCategory("ALL")}
                  className="checkbox checkbox-xs"
                />
                <span>전체 보기</span>
              </label>
              <div className="my-1 border-t border-border"></div>
              {categories.map(cat => (
                <label key={cat} className="flex items-center gap-2 px-2 py-1 hover:bg-muted/50 rounded cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(cat)}
                    onChange={() => toggleCategory(cat)}
                    className="checkbox checkbox-xs"
                  />
                  <span>{cat}</span>
                </label>
              ))}
            </div>
          )}

          <input
            type="text"
            placeholder="검색 (예: 모던&템바)"
            className="input input-sm input-bordered w-full text-xs h-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {stats.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
            <i className="fas fa-inbox text-3xl mb-2 opacity-20"></i>
            <p className="text-sm">데이터가 없습니다</p>
            <p className="text-xs mt-1">바코드 생성 페이지에서<br />'전송' 버튼을 눌러주세요</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left table-fixed">
            <thead className="text-xs text-muted-foreground bg-muted/50 sticky top-0 z-10">
              <tr>
                <th
                  className="px-3 py-2 font-medium w-[60%] cursor-pointer hover:bg-muted/80 transition-colors select-none"
                  onClick={() => requestSort('productName')}
                >
                  제품명 <span className="text-[10px] ml-1">{getSortIcon('productName')}</span>
                </th>
                <th
                  className="px-3 py-2 font-medium w-[25%] cursor-pointer hover:bg-muted/80 transition-colors select-none"
                  onClick={() => requestSort('category')}
                >
                  분류 <span className="text-[10px] ml-1">{getSortIcon('category')}</span>
                </th>
                <th
                  className="px-3 py-2 font-medium w-[15%] text-right cursor-pointer hover:bg-muted/80 transition-colors select-none"
                  onClick={() => requestSort('count')}
                >
                  수량 <span className="text-[10px] ml-1">{getSortIcon('count')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedStats.map((item, idx) => (
                <tr key={idx} className="hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-normal break-words" title={item.productName}>
                    {item.productName || item.barcode}
                  </td>
                  <td className="px-3 py-2 truncate text-muted-foreground text-xs" title={item.category}>
                    {item.category}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {NUMBER_FORMATTER.format(item.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const loadScript = (src: string, opts?: { async?: boolean }) =>
  new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[data-dashboard-src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = opts?.async ?? true;
    script.dataset.dashboardSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

async function ensureChartScripts() {
  if (!(window as any).Chart) {
    await loadScript("https://cdn.jsdelivr.net/npm/chart.js@3.9.1");
  }
  if (!(window as any).ChartDataLabels) {
    await loadScript("https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0");
  }
}

async function resolveApiBase(): Promise<string> {
  const host = window.location.hostname || "localhost";
  const isLocalhost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0";

  const probeHost = host === "localhost" ? "127.0.0.1" : host;

  if (!isLocalhost) {
    return window.location.origin;
  }
  const candidates: string[] = [];
  if (window.location.origin) {
    candidates.push(window.location.origin);
  }
  FALLBACK_PORTS.forEach((port) => {
    const base = `${window.location.protocol}//${probeHost}:${port}`;
    if (!candidates.includes(base)) candidates.push(base);
  });

  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/api/delivery/hourly?days=1`, { cache: "no-store" });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.success) return base;
    } catch (err) {
      console.warn("API probing failed for", base, err);
    }
  }

  if (/^https?:/.test(window.location.protocol)) {
    return window.location.origin;
  }
  return "";
}

function DeliveryOverview() {
  const dashboardRef = useRef<any>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    // In React dev StrictMode, effects can run mount -> cleanup -> mount.
    // If we permanently guard with a ref, the second (effective) mount can skip
    // initialization and event handlers (e.g. upload button) won't be attached.
    if (initializedRef.current) return;
    initializedRef.current = true;

    let mounted = true;

    const initialize = async () => {
      try {
        await ensureChartScripts();
        // NOTE: dashboard.js에는 top-level let/const 전역 바인딩이 있어
        // SPA 재진입 시 스크립트를 재주입/재실행하면 SyntaxError로 평가가 중단될 수 있다.
        // 따라서 세션당 1회만 로드하고 이후에는 전역(window.Dashboard)을 재사용한다.
        const w = window as any;
        if (!w.__deliveryDashboardScriptPromise) {
          w.__deliveryDashboardScriptPromise = (async () => {
            if (typeof w.Dashboard === 'function') return;
            await loadScript(`/js/dashboard.js?v=${Date.now()}`, { async: false });
          })();
        }
        await w.__deliveryDashboardScriptPromise;

        await loadScript("/js/ab-testing-framework.js");
        await loadScript("/js/rollback-system.js");

        const DashboardClass = (window as any).Dashboard as
          | (new (...args: any[]) => any)
          | undefined;

        if (!DashboardClass) {
          throw new Error("Dashboard class not available."
          );
        }

        const apiBase = await resolveApiBase();
        if (!mounted) return;

        const dashboard = new DashboardClass(null, "hourly-chart", {
          useApi: !!apiBase,
          apiBase,
        });
        (window as any).dashboard = dashboard;
        dashboardRef.current = dashboard;
        await dashboard.init();
        dashboard.startAutoRefresh(600000);
        console.log("Dashboard initialized for /sales/delivery", apiBase || "(same origin)");
      } catch (error) {
        console.error("대시보드 초기화 실패:", error);
        alert("대시보드 초기화에 실패했습니다: " + (error as Error).message);
      }
    };

    initialize();

    return () => {
      mounted = false;
      if (dashboardRef.current?.stopAutoRefresh) {
        dashboardRef.current.stopAutoRefresh();
      }
      dashboardRef.current = null;
      initializedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const selectors = [".tabs", "#delivery-tab", "#production-tab", "#sales-tab"];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => el instanceof HTMLElement && el.remove());
    });
  }, []);

  const closeDialog = (id: string) => {
    const dialog = document.getElementById(id) as HTMLDialogElement | null;
    dialog?.close();
  };

  return (
    <div className="space-y-6">
      <main className="w-full px-4 py-6 space-y-6">
        <div className="hidden">
          <span
            id="status-badge"
            className="badge badge-success sr-only"
            aria-label="연결 상태"
          >
            연결됨
          </span>
          <button className="btn btn-sm btn-ghost" id="refresh-btn" aria-label="새로고침">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              ></path>
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6 items-start">
          <div className="bg-card border border-border rounded-lg p-5 shadow-sm space-y-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                시간별 출고 현황 (최근 3일)
              </h2>
              <p className="text-sm text-muted-foreground">
                0시부터 23시까지 누적 출고량, 예측 포함
              </p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-2">
                <input id="start-date" type="date" className="input input-sm input-bordered" />
                <span className="text-sm text-muted-foreground">~</span>
                <input id="end-date" type="date" className="input input-sm input-bordered" />
                <button id="range-search-btn" className="btn btn-sm">
                  기간 조회
                </button>
                <button id="range-clear-btn" className="btn btn-sm btn-ghost">
                  해제
                </button>
                <span id="range-result" className="text-xs text-muted-foreground"></span>
              </div>
              <div className="flex items-center gap-2">
                <button id="export-excel-btn" className="btn btn-sm">
                  엑셀 내보내기
                </button>
                <button
                  id="upload-btn"
                  className="btn btn-sm btn-primary"
                  data-react-upload="1"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const nativeEvent = (e as any)?.nativeEvent;
                    if (nativeEvent?.stopImmediatePropagation) {
                      nativeEvent.stopImmediatePropagation();
                    }
                    const input = document.getElementById("file-input") as HTMLInputElement | null;
                    input?.click();
                  }}
                >
                  데이터 업로드
                </button>
                <input
                  id="file-input"
                  type="file"
                  accept=".json,.csv,.txt,.xlsx,.xls"
                  className="hidden"
                />
              </div>
            </div>
          </div>

              <div className="space-y-6">
            <div className="h-[750px] min-w-0 bg-card border border-border rounded-lg shadow-sm p-4 relative">
              <canvas id="hourly-chart" className="w-full h-full" />
            </div>
            <BarcodeStatsPanel />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-end">
              <button id="toggle-aux-stats" className="btn btn-sm">
                증감/편차 보기
              </button>
            </div>
            <div id="aux-stats-body" className="hidden space-y-4">
              <div className="bg-muted/40 border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  금일/전일/최근7일 시간별 증감
                </h3>
                <div id="table-diff-day" className="overflow-x-auto text-sm" />
              </div>
              <div className="bg-muted/40 border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-foreground mb-3">
                  최근 7일 시간별 평균 증감
                </h3>
                <div id="table-weekly-hourly" className="overflow-x-auto text-sm" />
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-1">
            <p>• 0시부터 23시까지 시간별 누적 출고량입니다 (23시가 하루 최종값)</p>
            <p>• 오늘 데이터는 실선, 어제는 점선, 그저께는 긴 점선으로 표시됩니다</p>
            <p>• 오늘 데이터의 각 포인트에 값 라벨이 표시되며 예측은 * 로 강조됩니다</p>
            <p>
              • 마지막 업데이트: <span id="last-update">-</span>
            </p>
          </div>

          <details className="bg-muted/30 border border-border rounded-lg p-4">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              예측 모델 정보 보기
            </summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
              <div>
                <h4 className="font-semibold mb-2">적용된 예측 모델</h4>
                <ul className="space-y-1">
                  <li>• 요일별 패턴 분석 (25%)</li>
                  <li>• 시간대별 성장 패턴 (20%)</li>
                  <li>• 최근 트렌드 분석 (25%)</li>
                  <li>• 계절성 패턴 (15%)</li>
                  <li>• 지수 평활법 (15%)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">예측 정확도 개선 요소</h4>
                <ul className="space-y-1">
                  <li>• 같은 요일 과거 데이터 활용</li>
                  <li>• 시간대별 고유 증가 패턴</li>
                  <li>• 최근 3시간 트렌드 반영</li>
                  <li>• 주말/평일 구분 적용</li>
                  <li>• 다중 모델 가중 평균</li>
                </ul>
              </div>
            </div>
            <div className="mt-3 p-3 bg-info/10 rounded text-xs text-info-content">
              <strong>참고:</strong> 예측값은 과거 데이터 패턴을 기반으로 계산되며 실제 결과와 차이가 있을 수 있습니다. 더 많은
              과거 데이터가 축적될수록 예측 정확도가 향상됩니다.
            </div>
          </details>

          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                title="오늘 누적 출고"
                icon="fa-truck-loading"
                valueId="today-total"
                defaultValue={NUMBER_FORMATTER.format(0)}
                subtitleId="today-desc"
                defaultSubtitle="현재까지"
              />
              <StatCard
                title="어제 최종 출고"
                icon="fa-history"
                valueId="yesterday-last"
                defaultValue={NUMBER_FORMATTER.format(0)}
                subtitleId="yesterday-desc"
                defaultSubtitle="최종 기록"
              />
              <StatCard
                title="오늘 예상 출고"
                icon="fa-chart-line"
                valueId="max-hourly"
                defaultValue={NUMBER_FORMATTER.format(0)}
                subtitleId="max-hourly-desc"
                defaultSubtitle="23시 예상값"
              />
              <StatCard
                title="평균 시간당 출고"
                icon="fa-stopwatch"
                valueId="avg-hourly"
                defaultValue={NUMBER_FORMATTER.format(0)}
                subtitleId="avg-hourly-desc"
                defaultSubtitle="이전 3일 평균"
              />
            </div>

            {/* AI Insight Section */}
            <div id="ai-insight-container" className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white rounded-full shadow-sm text-indigo-600">
                  <i className="fas fa-robot text-xl"></i>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-indigo-900 mb-1 flex items-center gap-2">
                    AI 배송 예측 분석
                    <span className="text-[10px] px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">GLM4.7</span>
                  </h3>
                  <div id="ai-insight-content" className="text-sm text-indigo-800 leading-relaxed whitespace-pre-line">
                    데이터 분석 중...
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-3 shadow-sm">
              <h2 className="text-base font-semibold text-foreground mb-3">오늘자 시간별 데이터 입력</h2>
              <div className="h-[170px] overflow-y-auto pr-1">
                <div
                  id="dynamic-data-entry-container"
                  className="space-y-2 text-sm text-muted-foreground"
                ></div>
              </div>
              <div id="form-feedback" className="mt-2 text-xs text-primary"></div>
            </div>

            <div className="bg-card border border-border rounded-lg p-3 shadow-sm">
              <h2 className="text-base font-semibold text-foreground mb-3">특이사항 입력</h2>
              <form id="special-note-form" className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input id="special-note-product" type="text" className="input input-sm input-bordered" placeholder="제품명" />
                  <input id="special-note-barcode" type="text" className="input input-sm input-bordered" placeholder="바코드" />
                  <input id="special-note-sku" type="text" className="input input-sm input-bordered" placeholder="SKU" />
                  <input id="special-note-qty" type="number" className="input input-sm input-bordered" placeholder="수량" />
                </div>
                <input id="special-note-datetime" type="datetime-local" className="input input-sm input-bordered w-full" />
                <textarea id="special-note-memo" className="textarea textarea-bordered textarea-sm w-full" rows={3} placeholder="행사/이슈/특이사항 메모 (텍스트)"></textarea>
                <button type="submit" className="btn btn-primary btn-sm w-full">저장</button>
                <div id="special-note-feedback" className="text-xs text-primary"></div>
              </form>
              <div className="mt-3">
                <div className="text-xs text-muted-foreground mb-2">오늘 등록된 특이사항</div>
                <div id="special-notes-list" className="space-y-2 text-sm text-muted-foreground"></div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <dialog id="loading-modal" className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg">데이터 로딩 중...</h3>
          <div className="py-4">
            <progress className="progress progress-primary w-full"></progress>
          </div>
          <p className="text-sm text-base-content/70">데이터를 가져오고 있습니다.</p>
        </div>
      </dialog>

      <dialog id="error-modal" className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg text-error">오류 발생</h3>
          <p className="py-4" id="error-message">
            알 수 없는 오류가 발생했습니다.
          </p>
          <div className="modal-action">
            <button className="btn" onClick={() => closeDialog("error-modal")}>
              확인
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

export default DeliveryOverview;
