import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import OutboundDashboardUnified from "./outbound-dashboard-unified";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "./ui/button";
import { RefreshCw, Package, ArrowDownToLine } from "lucide-react";

export type OutboundTabKey = 'vf-outbound' | 'fc-inbound';
export type DataSource = 'vf' | 'fc';

interface OutboundTabsProps {
  initialTab?: OutboundTabKey;
  onTabChange?: (tab: OutboundTabKey) => void;
  initialDataSource?: DataSource;
}

export default function OutboundTabs({ initialTab = 'vf-outbound', onTabChange, initialDataSource = 'vf' }: OutboundTabsProps = {}) {
  console.log('🔥🔥🔥 OutboundTabs RENDERING!!!', { initialTab, initialDataSource });
  const [location] = useLocation();

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

  // URL 파라미터에서 초기 dataSource 읽기
  const getInitialDataSourceFromUrl = (): DataSource => {
    const tabParam = getInitialTabFromUrl();
    return tabParam === 'fc-inbound' ? 'fc' : 'vf';
  };

  const [dataSource, setDataSource] = useState<DataSource>(getInitialDataSourceFromUrl());

  const updateDataSourceBasedOnTab = (tab: OutboundTabKey) => {
    if (tab === 'vf-outbound') {
      setDataSource('vf');
    } else if (tab === 'fc-inbound') {
      setDataSource('fc');
    }
  };

  const [activeTab, setActiveTab] = useState<OutboundTabKey>(getInitialTabFromUrl());
  const [isSyncing, setIsSyncing] = useState(false);
  const [uploadDate, setUploadDate] = useState(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const outboundQueryPredicate = (query: any) => {
    const key = query?.queryKey;
    return Array.isArray(key) && typeof key[0] === 'string' && (
      key[0].startsWith('/api/outbound') || key[0].startsWith('/api/fc-inbound')
    );
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('date', uploadDate);

    setIsSyncing(true);
    try {
      const response = await fetch('/api/outbound/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`업로드 실패: ${response.status}`);
      }

      const result = await response.json();
      console.log('업로드 결과:', result);

      toast({
        title: '업로드 성공',
        description: `총 ${result.count}개 레코드가 처리되었습니다.`,
      });

      // 관련 쿼리 무효화
      queryClient.invalidateQueries({ predicate: outboundQueryPredicate });
    } catch (error) {
      console.error('파일 업로드 오류:', error);
      toast({
        title: '업로드 실패',
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
      // 파일 입력 초기화
      event.target.value = '';
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/outbound/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ date: uploadDate }),
      });

      if (!response.ok) {
        throw new Error(`동기화 실패: ${response.status}`);
      }

      const result = await response.json();
      console.log('동기화 결과:', result);

      toast({
        title: '동기화 성공',
        description: `총 ${result.synced}개 레코드가 동기화되었습니다.`,
      });

      // 관련 쿼리 무효화
      queryClient.invalidateQueries({ predicate: outboundQueryPredicate });
    } catch (error) {
      console.error('동기화 오류:', error);
      toast({
        title: '동기화 실패',
        description: error instanceof Error ? error.message : '알 수 없는 오류',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleTabChange = (tab: OutboundTabKey) => {
    setActiveTab(tab);
    updateDataSourceBasedOnTab(tab);
    onTabChange?.(tab);

    // URL 업데이트
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };

  // URL 변경 감지
  useEffect(() => {
    const handleUrlChange = () => {
      const newTab = getInitialTabFromUrl();
      if (newTab !== activeTab) {
        setActiveTab(newTab);
        updateDataSourceBasedOnTab(newTab);
      }
    };

    // 초기 로드 시 URL 확인
    handleUrlChange();

    // URL 변경 감지 (간단한 폴링)
    const interval = setInterval(handleUrlChange, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {activeTab === 'vf-outbound' ? 'VF 출고 대시보드' : 'FC 입고 대시보드'}
          </h1>
          <p className="text-muted-foreground">
            {activeTab === 'vf-outbound' 
              ? 'Google Sheets에서 VF 출고 데이터를 실시간으로 확인하고 분석합니다.' 
              : 'FC 입고 데이터를 확인하고 관리합니다.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="uploadDate" className="text-sm font-medium">
              데이터 날짜:
            </label>
            <input
              id="uploadDate"
              type="date"
              value={uploadDate}
              onChange={(e) => setUploadDate(e.target.value)}
              className="px-3 py-1 border rounded-md text-sm"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? '동기화 중...' : '동기화'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <label htmlFor="file-upload" className="cursor-pointer">
              <Package className="h-4 w-4 mr-2" />
              파일 업로드
              <input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isSyncing}
              />
            </label>
          </Button>
        </div>
      </div>

      <div className="border-b">
        <nav className="flex space-x-4">
          <button
            onClick={() => handleTabChange('vf-outbound')}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'vf-outbound'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            VF 출고
          </button>
          <button
            onClick={() => handleTabChange('fc-inbound')}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'fc-inbound'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            FC 입고
          </button>
        </nav>
      </div>

      <OutboundDashboardUnified dataSource={dataSource} />
    </div>
  );
}