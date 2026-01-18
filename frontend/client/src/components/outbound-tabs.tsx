import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import OutboundDashboardUnified from "./outbound-dashboard-unified";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "./ui/button";
import { RefreshCw, PieChart, Package, ArrowDownToLine } from "lucide-react";

export type OutboundTabKey = 'vf-outbound' | 'fc-inbound';
export type DataSource = 'vf' | 'fc';

interface OutboundTabsProps {
  initialTab?: OutboundTabKey;
  onTabChange?: (tab: OutboundTabKey) => void;
  initialDataSource?: DataSource;
}

export default function OutboundTabs({ initialTab = 'vf-outbound', onTabChange, initialDataSource = 'vf' }: OutboundTabsProps = {}) {
  const [location] = useLocation();

  const [dataSource, setDataSource] = useState<DataSource>(initialDataSource);

  const updateDataSourceBasedOnTab = (tab: OutboundTabKey) => {
    if (tab === 'vf-outbound') {
      setDataSource('vf');
    } else if (tab === 'fc-inbound') {
      setDataSource('fc');
    }
  };

  // URL 파라미터에서 초기 탭 상태 읽기
  const getInitialTabFromUrl = (): OutboundTabKey => {
    try {
      const url = new URL(window.location.href);
      const tabParam = url.searchParams.get('tab');
      if (tabParam && ['vf-outbound', 'fc-inbound'].includes(tabParam)) {
        return tabParam as OutboundTabKey;
      }
    } catch (error) {
      console.warn('URL 파라미터 읽기 실패:', error);
    }
    return initialTab;
  };

  const [activeTab, setActiveTab] = useState<OutboundTabKey>(getInitialTabFromUrl());
  const [isSyncing, setIsSyncing] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const outboundQueryPredicate = (query: any) => {
    const key = query?.queryKey;
    return Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/api/outbound');
  };

  const normalizeGoogleSheetUrlToCsv = (input: string) => {
    const raw = (input || '').trim();
    if (!raw) return '';

    try {
      const u = new URL(raw);
      // Published CSV links look like:
      // /spreadsheets/d/e/<publishedId>/pub?...&output=csv
      // They are already consumable by pandas.read_csv, so keep as-is.
      if (u.hostname.includes('docs.google.com') && u.pathname.includes('/spreadsheets/d/e/')) {
        return raw;
      }

      // Regular edit links look like:
      // /spreadsheets/d/<sheetId>/edit#gid=0
      const m = u.pathname.match(/\/spreadsheets\/d\/(?!e\/)([a-zA-Z0-9-_]+)/);
      if (u.hostname.includes('docs.google.com') && m && m[1]) {
        const sheetId = m[1];
        const gidFromQuery = u.searchParams.get('gid');
        const gidFromHash = u.hash?.match(/gid=(\d+)/)?.[1];
        const gid = gidFromQuery || gidFromHash || '0';
        return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
      }
      return raw;
    } catch {
      return raw;
    }
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      let result: any = null;

      let refreshWarning: string | null = null;
      let dsUrl: string | null = null;

      try {
        const dsRes = await fetch('/api/data-sources');
        if (dsRes.ok) {
          const dataSources = await dsRes.json();
          const outboundGoogleSheets = Array.isArray(dataSources)
            ? dataSources.find((ds: any) => {
                const name = String(ds?.name || '').toLowerCase();
                const isActive = Boolean(ds?.isActive ?? ds?.is_active);
                return ds?.type === 'google_sheets' && isActive && name.includes('outbound');
              })
            : null;

          const dsId = outboundGoogleSheets?.id;
          dsUrl = outboundGoogleSheets?.url ? String(outboundGoogleSheets.url) : null;

          // Try refresh first (requires GOOGLE_SHEETS_API_KEY). Even if it fails,
          // we should still attempt CSV sync using ds.url.
          if (dsId) {
            const refreshRes = await fetch(`/api/google-sheets/refresh/${dsId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            const refreshJson = await refreshRes.json().catch(() => ({}));
            if (!refreshRes.ok) {
              refreshWarning = String(refreshJson?.message || refreshJson?.error || 'Google Sheets refresh failed');
            } else {
              result = refreshJson;
            }
          }

          // Always try outbound sync when we have a URL (works without API key)
          if (!result && dsUrl) {
            const url = normalizeGoogleSheetUrlToCsv(dsUrl);
            const res = await fetch('/api/outbound/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
              throw new Error(json?.error || json?.message || 'Sync failed');
            }
            result = json;
          }
        }
      } catch (e) {
        // If we had a data source URL, do NOT fall back to env-based sync.
        // Surface the real error instead of confusing "OUTBOUND_GOOGLE_SHEET_URL is not set".
        if (dsUrl) throw e;
        // Otherwise, fall through to legacy sync endpoint below
      }

      if (!result) {
        // As a safe fallback, try syncing using server-side OUTBOUND_GOOGLE_SHEET_URL.
        // Do NOT use browser-native prompt/alert, because it breaks refresh UX.
        const res = await fetch('/api/outbound/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const message = json?.error || json?.message || 'Sync failed';
          throw new Error(
            `${message}\n(구글 시트 연결이 필요합니다: 데이터 소스에서 outbound Google Sheets를 연결하거나 서버 환경변수 OUTBOUND_GOOGLE_SHEET_URL을 설정하세요.)`
          );
        }
        result = json;
      }

      // Invalidate ALL outbound-related queries so charts/tables update without a hard refresh.
      // Many components use keys like ['/api/outbound/stats', ...], ['/api/outbound/pivot', ...], etc.
      await queryClient.invalidateQueries({ predicate: outboundQueryPredicate });
      await queryClient.refetchQueries({ predicate: outboundQueryPredicate, type: 'active' as any });
      const updated = result?.updated ?? result?.rowsProcessed ?? result?.synced ?? 0;
      toast({
        title: "성공",
        description: refreshWarning
          ? `데이터가 성공적으로 갱신되었습니다. (${updated}건)\n(Google Sheets 새로고침 실패: ${refreshWarning})`
          : `데이터가 성공적으로 갱신되었습니다. (${updated}건)`,
      });
    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: "오류",
        description: `데이터 갱신에 실패했습니다. ${(error as Error)?.message || ''}`.trim(),
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // URL 변경 시 탭 상태 동기화
  useEffect(() => {
    const urlTab = getInitialTabFromUrl();
    if (urlTab !== activeTab) {
      setActiveTab(urlTab);
    }
  }, [location, activeTab]);

  const handleTabChange = (tab: OutboundTabKey) => {
    setActiveTab(tab);
    onTabChange?.(tab);

    updateDataSourceBasedOnTab(tab);

    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState(null, '', url.toString());
  };

  const handleDataSourceChange = (newDataSource: DataSource) => {
    setDataSource(newDataSource);
  };

  const tabs = [
    {
      key: 'vf-outbound' as OutboundTabKey,
      label: 'VF 출고',
      icon: Package,
      description: 'VF 출고 데이터 분석 대시보드'
    },
    {
      key: 'fc-inbound' as OutboundTabKey,
      label: 'FC 입고',
      icon: ArrowDownToLine,
      description: 'FC 입고 데이터 분석 대시보드'
    }
  ];

  const renderContent = () => {
    return <OutboundDashboardUnified dataSource={dataSource} activeTab={activeTab} />;
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 탭 네비게이션 */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.key}
                variant={activeTab === tab.key ? 'default' : 'outline'}
                onClick={() => handleTabChange(tab.key)}
                className="flex items-center gap-2"
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Button>
            );
          })}
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-600 hidden md:block">
            {tabs.find(tab => tab.key === activeTab)?.description}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? '갱신 중...' : '최신 데이터 가져오기'}
          </Button>
        </div>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="flex-1 min-h-0">
        {renderContent()}
      </div>
    </div>
  );
}
