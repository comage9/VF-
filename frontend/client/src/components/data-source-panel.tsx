import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { DataSource } from "@shared/schema";

interface DataSourcePanelProps {
  activeTab: 'outbound' | 'inventory';
}

export default function DataSourcePanel({ activeTab }: DataSourcePanelProps) {
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch data sources
  const { data: dataSources = [] } = useQuery<DataSource[]>({
    queryKey: ['/api/data-sources'],
  });

  // CSV upload mutation
  const csvUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('csv', file);
      formData.append('type', activeTab);
      
      const response = await fetch('/api/upload/csv', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'CSV 업로드에 실패했습니다.');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "성공",
        description: `${data.rowsProcessed}개의 데이터가 성공적으로 업로드되었습니다.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/data-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/outbound'] });
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Google Sheets connection mutation
  const googleSheetsConnectMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest('POST', '/api/google-sheets/connect', {
        url,
        type: activeTab,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "성공",
        description: `구글 시트가 성공적으로 연결되었습니다. ${data.rowsProcessed}개의 데이터를 처리했습니다.`,
      });
      setGoogleSheetsUrl("");
      queryClient.invalidateQueries({ queryKey: ['/api/data-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/outbound'] });
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Refresh data mutation
  const refreshDataMutation = useMutation({
    mutationFn: async (dataSourceId: string) => {
      const response = await apiRequest('POST', `/api/google-sheets/refresh/${dataSourceId}`, {});
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "성공",
        description: "데이터가 성공적으로 새로고침되었습니다.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/data-sources'] });
      queryClient.invalidateQueries({ queryKey: ['/api/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/outbound'] });
    },
    onError: (error: Error) => {
      toast({
        title: "오류",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      csvUploadMutation.mutate(file);
    }
  };

  const handleFileAreaClick = () => {
    fileInputRef.current?.click();
  };

  const handleGoogleSheetsConnect = async () => {
    if (!googleSheetsUrl.trim()) {
      toast({
        title: "오류",
        description: "구글 시트 URL을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    
    setIsConnecting(true);
    try {
      await googleSheetsConnectMutation.mutateAsync(googleSheetsUrl);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRefreshData = async () => {
    const activeDataSource = dataSources.find(
      source => source.type === 'google_sheets' && source.isActive
    );
    
    if (!activeDataSource) {
      toast({
        title: "오류",
        description: "새로고침할 구글 시트 연결을 찾을 수 없습니다.",
        variant: "destructive",
      });
      return;
    }
    
    setIsRefreshing(true);
    try {
      await refreshDataMutation.mutateAsync(activeDataSource.id);
    } finally {
      setIsRefreshing(false);
    }
  };

  const activeGoogleSheetsSource = dataSources.find(
    source => source.type === 'google_sheets' && source.isActive
  );

  return (
    <div className="bg-muted rounded-lg p-4">
      <h3 className="font-medium text-foreground mb-4">데이터 소스</h3>
      
      {/* CSV Upload */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-foreground mb-2">
          CSV 파일 업로드
        </label>
        <div 
          className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer"
          onClick={handleFileAreaClick}
          data-testid="csv-upload-area"
        >
          <i className="fas fa-cloud-upload-alt text-2xl text-muted-foreground mb-2"></i>
          <p className="text-sm text-muted-foreground">
            {csvUploadMutation.isPending ? '업로드 중...' : '파일을 드래그하거나 클릭하여 업로드'}
          </p>
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".csv" 
            className="hidden" 
            onChange={handleFileUpload}
            disabled={csvUploadMutation.isPending}
            data-testid="input-csv-file"
          />
        </div>
      </div>
      
      {/* Google Sheets URL */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-foreground mb-2">
          구글 시트 URL
        </label>
        <div className="flex space-x-2">
          <input 
            type="url" 
            placeholder="https://docs.google.com/spreadsheets/..." 
            value={googleSheetsUrl}
            onChange={(e) => setGoogleSheetsUrl(e.target.value)}
            className="flex-1 px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isConnecting}
            data-testid="input-google-sheets-url"
          />
          <button 
            onClick={handleGoogleSheetsConnect}
            disabled={isConnecting || !googleSheetsUrl.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-connect-google-sheets"
          >
            {isConnecting ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-link"></i>
            )}
          </button>
        </div>
      </div>
      
      {/* Refresh Button */}
      <button 
        onClick={handleRefreshData}
        disabled={isRefreshing || !activeGoogleSheetsSource}
        className="w-full px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/80 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
        data-testid="button-refresh-data"
      >
        <i className={`fas fa-sync-alt mr-2 ${isRefreshing ? 'fa-spin' : ''}`}></i>
        데이터 새로고침
      </button>
      
      {/* Connection Status */}
      {activeGoogleSheetsSource && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
            <span className="text-sm text-green-700" data-testid="connection-status">
              구글 시트 연결됨
            </span>
          </div>
          {activeGoogleSheetsSource.lastSync && (
            <div className="text-xs text-green-600 mt-1">
              마지막 동기화: {new Date(activeGoogleSheetsSource.lastSync).toLocaleString('ko-KR')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
