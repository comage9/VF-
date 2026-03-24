import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { 
  AlertTriangle, 
  Package, 
  TrendingUp, 
  TrendingDown, 
  Search,
  Filter,
  BarChart3,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Clock,
  Warehouse,
  AlertCircle,
  Upload,
  FileText
} from 'lucide-react';

interface IntegratedInventoryItem {
  id: string;
  productName: string;
  barcode?: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  stockStatus: 'critical' | 'low' | 'normal' | 'high';
  reliability: number;
  location: string;
  category: string;
  lastUpdated: string | null;
  orderRecommendation: string;
  isOrderRequired: boolean;
  hasInventoryData: boolean;
  inventoryId: string | null;
  hasBarcodeMaster?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface IntegratedInventorySummary {
  totalItems: number;
  filteredItems: number;
  orderRequired: number;
  criticalStock: number;
  lowStock: number;
  highStock: number;
  withoutBarcode: number;
  withInventoryData: number;
}

interface IntegratedInventoryResponse {
  items: IntegratedInventoryItem[];
  summary: IntegratedInventorySummary;
  message: string;
}

export default function ImprovedInventoryPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'status'>('status');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [inventoryDate, setInventoryDate] = useState(() => {
    // 기본값을 오늘 날짜로 설정
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const { data, isLoading, error, refetch } = useQuery<IntegratedInventoryResponse>({
    queryKey: ['integrated-inventory', searchTerm, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.append('search', searchTerm.trim());
      if (statusFilter) params.append('stockStatus', statusFilter);

      const response = await fetch(`/api/inventory/integrated?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: 30000, // 30초
  });

  const handleSearch = () => {
    refetch();
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status === statusFilter ? '' : status);
  };

  const handleFileUpload = async () => {
    if (isUploading) return;
    if (!uploadFiles || uploadFiles.length === 0) {
      alert('업로드할 파일을 선택해주세요.');
      return;
    }

    if (!inventoryDate) {
      alert('재고 기준일을 입력해주세요.');
      return;
    }

    const formData = new FormData();
    Array.from(uploadFiles).forEach((file) => {
      formData.append('files', file);
    });
    
    // 재고 기준일 추가
    formData.append('inventoryDate', inventoryDate);
    
    // 디버깅: 값 확인
    console.log('🔍 inventoryDate 값:', inventoryDate);
    console.log('🔍 inventoryDate 타입:', typeof inventoryDate);
    console.log('🔍 파일 개수:', uploadFiles.length);

    try {
      setIsUploading(true);
      const response = await fetch('/api/inventory/baseline-upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json().catch(() => ({} as any));
        alert(`파일이 성공적으로 업로드되었습니다.\n처리된 바코드: ${result.rowsProcessed || result.imported || '알 수 없음'}`);
        setShowUpload(false);
        setUploadFiles(null);
        refetch(); // 데이터 새로고침
      } else {
        const text = await response.text();
        let msg = text;
        try {
          const json = JSON.parse(text);
          msg = json?.message || json?.error || text;
          if (json?.errorId) {
            msg = `${msg} (errorId=${json.errorId})`;
          }
        } catch (_e) {
          // ignore
        }
        alert(`업로드 실패(HTTP ${response.status}): ${msg || '알 수 없는 오류'}`);
      }
    } catch (error) {
      alert(`업로드 중 오류 발생: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const getStatusBadge = (item: IntegratedInventoryItem) => {
    if (item.isOrderRequired) {
      return <Badge variant="destructive" className="flex items-center gap-1">
        <ShoppingCart className="w-3 h-3" />
        발주필요
      </Badge>;
    }

    switch (item.stockStatus) {
      case 'critical':
        return <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="w-3 h-3" />
          위험
        </Badge>;
      case 'low':
        return <Badge variant="secondary" className="flex items-center gap-1">
          <TrendingDown className="w-3 h-3" />
          부족
        </Badge>;
      case 'high':
        return <Badge variant="outline" className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          과재고
        </Badge>;
      default:
        return <Badge variant="default" className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          정상
        </Badge>;
    }
  };

  const getReliabilityColor = (reliability: number) => {
    if (reliability >= 80) return 'text-green-600 bg-green-50';
    if (reliability >= 60) return 'text-yellow-600 bg-yellow-50';
    if (reliability > 0) return 'text-red-600 bg-red-50';
    return 'text-gray-600 bg-gray-50';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span>재고 데이터를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="m-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          오류: {error instanceof Error ? error.message : '데이터를 불러오는 중 오류가 발생했습니다.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) {
    return (
      <Alert className="m-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          데이터를 불러올 수 없습니다.
        </AlertDescription>
      </Alert>
    );
  }

  // 위치 정보가 있는 항목만 필터링하고 정렬
  const sortedItems = [...data.items]
    .filter(item => item.location && item.location.trim() !== '') // 위치 정보가 있는 항목만
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.productName.localeCompare(b.productName);
        case 'stock':
          return b.currentStock - a.currentStock;
        case 'status':
        default:
          // 발주 필요 → 위험 → 부족 → 정상 → 과재고 순서
          const statusPriority = { critical: 0, low: 1, normal: 2, high: 3 };
          if (a.isOrderRequired !== b.isOrderRequired) {
            return b.isOrderRequired ? 1 : -1;
          }
        return (statusPriority[a.stockStatus] ?? 99) - (statusPriority[b.stockStatus] ?? 99);
    }
  });

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">재고 현황</h1>
          <p className="text-gray-600">바코드 마스터와 연동된 실시간 재고 관리</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowUpload(true)} 
            variant="outline"
            className="flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            데이터 업로드
          </Button>
          <Button onClick={() => refetch()} className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            새로고침
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">전체 재고</p>
                <p className="text-3xl font-bold text-gray-900">{data.summary.totalItems}</p>
                <p className="text-xs text-gray-500 mt-1">등록된 전체 제품</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-full">
                <Warehouse className="w-8 h-8 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">부족 재고</p>
                <p className="text-3xl font-bold text-red-600">{data.summary.orderRequired}</p>
                <p className="text-xs text-gray-500 mt-1">발주 필요 제품</p>
              </div>
              <div className="p-3 bg-red-50 rounded-full">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">과잉 재고</p>
                <p className="text-3xl font-bold text-orange-600">{data.summary.highStock}</p>
                <p className="text-xs text-gray-500 mt-1">최대재고 초과</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-full">
                <TrendingUp className="w-8 h-8 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">위험 재고</p>
                <p className="text-3xl font-bold text-purple-600">{data.summary.criticalStock}</p>
                <p className="text-xs text-gray-500 mt-1">재고 0개 또는 임계</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-full">
                <AlertTriangle className="w-8 h-8 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 검색 및 필터 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            검색 및 필터
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="flex gap-2">
                <Input
                  placeholder="제품명, 바코드, 카테고리, 위치로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="flex-1"
                />
                <Button onClick={handleSearch} variant="outline">
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={statusFilter === 'order_required' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusFilterChange('order_required')}
              >
                발주필요
              </Button>
              <Button
                variant={statusFilter === 'critical' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusFilterChange('critical')}
              >
                위험
              </Button>
              <Button
                variant={statusFilter === 'low' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusFilterChange('low')}
              >
                부족
              </Button>
              <Button
                variant={statusFilter === 'high' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusFilterChange('high')}
              >
                과재고
              </Button>
            </div>
            <div className="flex gap-2">
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as 'name' | 'stock' | 'status')}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="status">상태순</option>
                <option value="name">이름순</option>
                <option value="stock">재고순</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 재고 현황 테이블 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              재고 현황 ({data.summary.filteredItems}개)
            </CardTitle>
            <div className="text-sm text-gray-500">
              바코드 등록: {data.summary.totalItems - data.summary.withoutBarcode}개 | 
              미등록: {data.summary.withoutBarcode}개
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-3 font-medium">제품명</th>
                  <th className="text-center p-3 font-medium">바코드</th>
                  <th className="text-center p-3 font-medium">현재고</th>
                  <th className="text-center p-3 font-medium">최소재고</th>
                  <th className="text-center p-3 font-medium">최대재고</th>
                  <th className="text-center p-3 font-medium">상태</th>
                  <th className="text-center p-3 font-medium">신뢰도</th>
                  <th className="text-left p-3 font-medium">발주권장</th>
                  <th className="text-left p-3 font-medium">위치</th>
                  <th className="text-center p-3 font-medium">업데이트</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr key={item.id} className={`border-b hover:bg-gray-50 transition-colors ${
                    item.isOrderRequired ? 'bg-red-50 border-red-200' : ''
                  }`}>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-sm">{item.productName}</span>
                        {item.category && (
                          <span className="text-xs text-gray-500">{item.category}</span>
                        )}
                        {item.hasBarcodeMaster === false && (
                          <Badge variant="outline" className="text-xs w-fit">바코드 미등록</Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {item.barcode ? (
                        <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                          {item.barcode}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`font-mono text-lg font-semibold ${
                        item.currentStock === 0 ? 'text-red-600' : 
                        item.currentStock <= item.minStock ? 'text-orange-600' : 
                        'text-gray-900'
                      }`}>
                        {item.currentStock.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono text-gray-600">
                      {item.minStock.toLocaleString()}
                    </td>
                    <td className="p-3 text-center font-mono text-gray-600">
                      {item.maxStock > 0 ? item.maxStock.toLocaleString() : '-'}
                    </td>
                    <td className="p-3 text-center">
                      {getStatusBadge(item)}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full ${getReliabilityColor(item.reliability)}`}>
                        {item.reliability > 0 ? `${item.reliability}%` : '-'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`text-sm ${
                        item.isOrderRequired ? 'text-red-600 font-medium' : 'text-gray-600'
                      }`}>
                        {item.orderRecommendation}
                      </span>
                    </td>
                    <td className="p-3 text-sm text-gray-600">{item.location || '-'}</td>
                    <td className="p-3 text-center">
                      {item.lastUpdated ? (
                        <div className="flex items-center justify-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-xs text-gray-500">
                            {new Date(item.lastUpdated).toLocaleDateString('ko-KR')}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {sortedItems.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg">조건에 맞는 재고 데이터가 없습니다.</p>
                <p className="text-sm">다른 검색 조건을 시도해보세요.</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 성공 메시지 */}
      {data.message && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            {data.message}
          </AlertDescription>
        </Alert>
      )}

      {/* 업로드 모달 */}
      {showUpload && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                재고 데이터 업로드
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  재고 기준일 *
                </label>
                <input
                  type="date"
                  value={inventoryDate}
                  onChange={(e) => setInventoryDate(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  업로드할 재고 데이터의 기준 날짜를 선택해주세요.
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Excel 파일 선택 *
                </label>
                <input
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setUploadFiles(e.target.files)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Excel (.xlsx, .xls) 또는 CSV 파일만 업로드 가능합니다.
                </p>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-md">
                <h4 className="font-medium text-sm text-gray-700 mb-2">업로드 가능한 파일 형식:</h4>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li>• 재고 데이터 (재고량, 제품명, 바코드 등)</li>
                  <li>• 바코드 마스터 데이터</li>
                  <li>• 제품 위치 정보</li>
                </ul>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowUpload(false);
                    setUploadFiles(null);
                    // 재고 기준일은 초기화하지 않음 (사용자 편의성)
                  }}
                >
                  취소
                </Button>
                <Button 
                  onClick={handleFileUpload} 
                  disabled={!uploadFiles || !inventoryDate}
                  className="flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  업로드
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}