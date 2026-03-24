import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
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

export function IntegratedInventoryTab() {
  const [data, setData] = useState<IntegratedInventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim());
      }
      if (statusFilter) {
        params.append('stockStatus', statusFilter);
      }

      const response = await fetch(`/api/inventory/integrated?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('❌ 통합 재고 데이터 로드 실패:', err);
      setError(err instanceof Error ? err.message : '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSearch = () => {
    loadData();
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status === statusFilter ? '' : status);
  };

  useEffect(() => {
    if (statusFilter !== '' || searchTerm === '') {
      loadData();
    }
  }, [statusFilter]);

  const handleFileUpload = async () => {
    if (!uploadFiles || uploadFiles.length === 0) {
      alert('업로드할 파일을 선택해주세요.');
      return;
    }

    const formData = new FormData();
    Array.from(uploadFiles).forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await fetch('/api/inventory/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        alert('파일이 성공적으로 업로드되었습니다.');
        setShowUpload(false);
        setUploadFiles(null);
        loadData(); // 데이터 새로고침
      } else {
        const error = await response.text();
        alert(`업로드 실패: ${error}`);
      }
    } catch (error) {
      alert(`업로드 중 오류 발생: ${error}`);
    }
  };

  const getStatusBadge = (status: string, isOrderRequired: boolean) => {
    if (isOrderRequired) {
      return <Badge variant="destructive" className="flex items-center gap-1">
        <ShoppingCart className="w-3 h-3" />
        발주필요
      </Badge>;
    }

    switch (status) {
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

  const getReliabilityBadge = (reliability: number) => {
    if (reliability >= 80) {
      return <Badge className="bg-green-100 text-green-800">높음 {reliability}%</Badge>;
    } else if (reliability >= 60) {
      return <Badge className="bg-yellow-100 text-yellow-800">보통 {reliability}%</Badge>;
    } else if (reliability > 0) {
      return <Badge className="bg-red-100 text-red-800">낮음 {reliability}%</Badge>;
    } else {
      return <Badge variant="outline">미설정</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span>통합 재고 데이터를 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="m-4">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          오류: {error}
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

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">통합 재고 관리</h1>
          <p className="text-gray-600">바코드 마스터와 인벤토리 데이터가 통합된 재고 현황</p>
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
          <Button onClick={loadData} className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            새로고침
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">전체 제품</p>
                <p className="text-2xl font-bold">{data.summary.totalItems}</p>
              </div>
              <Package className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">발주 필요</p>
                <p className="text-2xl font-bold text-red-600">{data.summary.orderRequired}</p>
              </div>
              <ShoppingCart className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">위험/부족 재고</p>
                <p className="text-2xl font-bold text-orange-600">
                  {data.summary.criticalStock + data.summary.lowStock}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">바코드 미등록</p>
                <p className="text-2xl font-bold text-purple-600">{data.summary.withoutBarcode}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-purple-500" />
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
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="flex gap-2">
                <Input
                  placeholder="제품명, 카테고리, 위치로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
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
                variant={statusFilter === 'no_barcode' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleStatusFilterChange('no_barcode')}
              >
                바코드미등록
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 데이터 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>
            통합 재고 현황 ({data.items.filter(item => item.location && item.location.trim() !== '' && item.location !== '-').length}개)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">제품명</th>
                  <th className="text-left p-3 font-medium">바코드</th>
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
                {data.items
                  .filter(item => item.location && item.location.trim() !== '' && item.location !== '-')
                  .map((item, index) => (
                  <tr key={item.id} className={`border-b hover:bg-gray-50 ${
                    item.isOrderRequired ? 'bg-red-50' : ''
                  }`}>
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{item.productName}</span>
                        {item.category && (
                          <span className="text-xs text-gray-500">{item.category}</span>
                        )}
                        {item.hasBarcodeMaster === false && (
                          <Badge variant="outline" className="text-xs">바코드 미등록</Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3 font-mono text-sm text-gray-600">
                      {item.barcode || '-'}
                    </td>
                    <td className="p-3 text-center font-mono">
                      <span className={item.currentStock === 0 ? 'text-red-600 font-bold' : ''}>
                        {item.currentStock.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-3 text-center font-mono">{item.minStock.toLocaleString()}</td>
                    <td className="p-3 text-center font-mono">
                      {item.maxStock > 0 ? item.maxStock.toLocaleString() : '-'}
                    </td>
                    <td className="p-3 text-center">
                      {getStatusBadge(item.stockStatus, item.isOrderRequired)}
                    </td>
                    <td className="p-3 text-center">
                      {getReliabilityBadge(item.reliability)}
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
                            {new Date(item.lastUpdated).toLocaleDateString()}
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

            {data.items.filter(item => item.location && item.location.trim() !== '' && item.location !== '-').length === 0 && (
              <div className="text-center py-8 text-gray-500">
                위치 정보가 있는 재고 데이터가 없습니다.
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
                  Excel 파일 선택
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
                  }}
                >
                  취소
                </Button>
                <Button onClick={handleFileUpload} disabled={!uploadFiles}>
                  <FileText className="w-4 h-4 mr-2" />
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