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
  const [location] = useLocation();

  // URL ?Œë¼ë¯¸í„°?ì„œ ì´ˆê¸° ???íƒœ ?½ê¸°
  const getInitialTabFromUrl = (): OutboundTabKey => {
    try {
      const url = new URL(window.location.href);
      const tabParam = url.searchParams.get('tab');
      if (tabParam && ['vf-outbound', 'fc-inbound'].includes(tabParam)) {
        return tabParam as OutboundTabKey;
      }
    } catch (error) {
      console.warn('URL ?Œë¼ë¯¸í„° ?½ê¸° ?¤íŒ¨:', error);
    }
    return initialTab;
  };

  // URL ?Œë¼ë¯¸í„°?ì„œ ì´ˆê¸° dataSource ?½ê¸°
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
    // VF ì¶œê³  ?°ì´?°ëŠ” ?´ì œê¹Œì?ê°€ ìµœì‹ , ?¤ëŠ˜ ?°ì´?°ëŠ” ì¶œê³  ?„ë£Œ ???…ë¡œ??
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
      const response = await fetch('/api/outbound/upload-excel', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`?…ë¡œ???¤íŒ¨: ${response.status}`);
      }

      const result = await response.json();

      toast({
        title: '?…ë¡œ???±ê³µ',
        description: `ì´?${result.count}ê°??ˆì½”?œê? ì²˜ë¦¬?˜ì—ˆ?µë‹ˆ??`,
      });

      // ê´€??ì¿¼ë¦¬ ë¬´íš¨??
      queryClient.invalidateQueries({ predicate: outboundQueryPredicate });
    } catch (error) {
      console.error('?Œì¼ ?…ë¡œ???¤ë¥˜:', error);
      toast({
        title: '?…ë¡œ???¤íŒ¨',
        description: error instanceof Error ? error.message : '?????†ëŠ” ?¤ë¥˜',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
      // ?Œì¼ ?…ë ¥ ì´ˆê¸°??
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
        body: JSON.stringify({ 
          date: uploadDate,
          url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQwqI0BG-d2aMrql7DK4fQQTjvu57VtToSLAkY_nq92a4Cg5GFVbIn6_IR7Fq6_O-2TloFSNlXT8ZWC/pub?gid=1152588885&single=true&output=csv'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('???™ê¸°???¤íŒ¨ ?ì„¸:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText
        });
        throw new Error(`?™ê¸°???¤íŒ¨: ${response.status} - ${errorText.substring(0, 100)}`);
      }

      const result = await response.json();

      toast({
        title: '?™ê¸°???±ê³µ',
        description: `ì´?${result.synced}ê°??ˆì½”?œê? ?™ê¸°?”ë˜?ˆìŠµ?ˆë‹¤.`,
      });

      // ê´€??ì¿¼ë¦¬ ë¬´íš¨??
      queryClient.invalidateQueries({ predicate: outboundQueryPredicate });
    } catch (error) {
      console.error('?™ê¸°???¤ë¥˜:', error);
      toast({
        title: '?™ê¸°???¤íŒ¨',
        description: error instanceof Error ? error.message : '?????†ëŠ” ?¤ë¥˜',
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

    // URL ?…ë°?´íŠ¸
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());
  };

  // URL ë³€ê²?ê°ì?
  useEffect(() => {
    const handleUrlChange = () => {
      const newTab = getInitialTabFromUrl();
      if (newTab !== activeTab) {
        setActiveTab(newTab);
        updateDataSourceBasedOnTab(newTab);
      }
    };

    // ì´ˆê¸° ë¡œë“œ ??URL ?•ì¸
    handleUrlChange();

    // URL ë³€ê²?ê°ì? (ê°„ë‹¨???´ë§)
    const interval = setInterval(handleUrlChange, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {activeTab === 'vf-outbound' ? 'VF ì¶œê³  ?€?œë³´?? : 'FC ?…ê³  ?€?œë³´??}
          </h1>
          <p className="text-muted-foreground">
            {activeTab === 'vf-outbound' 
              ? 'Google Sheets?ì„œ VF ì¶œê³  ?°ì´?°ë? ?¤ì‹œê°„ìœ¼ë¡??•ì¸?˜ê³  ë¶„ì„?©ë‹ˆ??' 
              : 'FC ?…ê³  ?°ì´?°ë? ?•ì¸?˜ê³  ê´€ë¦¬í•©?ˆë‹¤.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <label htmlFor="uploadDate" className="text-sm font-medium">
              ?°ì´??? ì§œ:
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
            {isSyncing ? '?™ê¸°??ì¤?..' : '?™ê¸°??}
          </Button>

          <Button
            variant="outline"
            size="sm"
            asChild
          >
            <label htmlFor="file-upload" className="cursor-pointer">
              <Package className="h-4 w-4 mr-2" />
              ?Œì¼ ?…ë¡œ??
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
            VF ì¶œê³ 
          </button>
          <button
            onClick={() => handleTabChange('fc-inbound')}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === 'fc-inbound'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            FC ?…ê³ 
          </button>
        </nav>
      </div>

      <OutboundDashboardUnified dataSource={dataSource} />
    </div>
  );
}
