import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProducts, useProductStatistics, addProduct, updateStockStandard, deleteProduct, importVfCsv } from "../hooks/useProducts";

interface Product {
  id: number;
  sku_id: string;
  barcode: string;
  product_name: string;
  category: string;
  brand: string;
  location: string;
  min_stock: number;
  max_stock: number;
  reorder_point: number;
  safety_stock: number;
}

export default function ProductMasterTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const queryClient = useQueryClient();

  // 제품 목록 조회
  const { data: productsData, isLoading } = useProducts({
    search: searchQuery,
    category: selectedCategory,
    brand: selectedBrand,
    limit: 100
  });

  // 제품 통계 조회
  const { data: statsData } = useProductStatistics();

  const products = productsData?.data || [];
  const stats = statsData?.data;

  // VF CSV 재임포트 mutation
  const importMutation = useMutation({
    mutationFn: importVfCsv,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product-statistics'] });
      setIsImporting(false);
      alert('VF 제품 데이터를 성공적으로 재임포트했습니다.');
    },
    onError: (error) => {
      setIsImporting(false);
      alert('VF CSV 재임포트에 실패했습니다: ' + error.message);
    }
  });

  // 재고 기준 업데이트 mutation
  const updateStockMutation = useMutation({
    mutationFn: ({ skuId, standards }: { skuId: string; standards: any }) => 
      updateStockStandard(skuId, standards),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock-items'] });
      setEditingProduct(null);
      alert('재고 기준이 성공적으로 업데이트되었습니다.');
    },
    onError: (error) => {
      alert('재고 기준 업데이트에 실패했습니다: ' + error.message);
    }
  });

  const handleImportVfCsv = () => {
    if (confirm('VF CSV 데이터를 재임포트하시겠습니까? 기존 데이터가 업데이트됩니다.')) {
      setIsImporting(true);
      importMutation.mutate();
    }
  };

  const handleEditStock = (product: Product) => {
    setEditingProduct(product);
  };

  const handleUpdateStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    const formData = new FormData(e.target as HTMLFormElement);
    const standards = {
      minStock: parseInt(formData.get('minStock') as string) || 0,
      maxStock: parseInt(formData.get('maxStock') as string) || null,
      reorderPoint: parseInt(formData.get('reorderPoint') as string) || null,
      safetyStock: parseInt(formData.get('safetyStock') as string) || null,
    };

    updateStockMutation.mutate({
      skuId: editingProduct.sku_id,
      standards
    });
  };

  // 카테고리 및 브랜드 옵션
  const categoryOptions = stats?.categories.map((cat: any) => cat.category) || [];
  const brandOptions = stats?.brands.map((brand: any) => brand.brand) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-muted-foreground">제품 데이터를 로딩중...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 및 통계 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">제품 마스터 관리</h2>
          <p className="text-muted-foreground">
            총 {stats?.totalProducts || 0}개 제품 등록됨
          </p>
        </div>
        <button
          onClick={handleImportVfCsv}
          disabled={isImporting}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isImporting ? '임포트 중...' : 'VF CSV 재임포트'}
        </button>
      </div>

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card rounded-lg border p-4">
            <h3 className="font-semibold text-sm text-muted-foreground">카테고리별 분포</h3>
            <div className="mt-2 space-y-1">
              {stats.categories.slice(0, 4).map((cat: any) => (
                <div key={cat.category} className="flex justify-between text-sm">
                  <span>{cat.category}</span>
                  <span className="font-medium">{cat.count}개</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-card rounded-lg border p-4">
            <h3 className="font-semibold text-sm text-muted-foreground">브랜드별 분포</h3>
            <div className="mt-2 space-y-1">
              {stats.brands.slice(0, 4).map((brand: any) => (
                <div key={brand.brand} className="flex justify-between text-sm">
                  <span>{brand.brand}</span>
                  <span className="font-medium">{brand.count}개</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-lg border p-4">
            <h3 className="font-semibold text-sm text-muted-foreground">재고 기준 설정</h3>
            <div className="mt-2">
              <div className="text-2xl font-bold">{stats.totalProducts}</div>
              <div className="text-sm text-muted-foreground">총 제품 수</div>
            </div>
          </div>
        </div>
      )}

      {/* 필터 및 검색 */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="제품명, SKU ID, 바코드로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 border border-input rounded-md"
          />
        </div>
        
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 border border-input rounded-md"
        >
          <option value="">모든 카테고리</option>
          {categoryOptions.map((cat: string) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <select
          value={selectedBrand}
          onChange={(e) => setSelectedBrand(e.target.value)}
          className="px-3 py-2 border border-input rounded-md"
        >
          <option value="">모든 브랜드</option>
          {brandOptions.map((brand: string) => (
            <option key={brand} value={brand}>{brand}</option>
          ))}
        </select>
      </div>

      {/* 제품 목록 테이블 */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">SKU ID</th>
                <th className="text-left p-3 font-medium">제품명</th>
                <th className="text-left p-3 font-medium">카테고리</th>
                <th className="text-left p-3 font-medium">브랜드</th>
                <th className="text-left p-3 font-medium">최소재고</th>
                <th className="text-left p-3 font-medium">위치</th>
                <th className="text-left p-3 font-medium">작업</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product: Product) => (
                <tr key={product.id} className="border-t">
                  <td className="p-3 font-mono text-sm">{product.sku_id}</td>
                  <td className="p-3">{product.product_name}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                      {product.category}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                      {product.brand}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="font-semibold">{product.min_stock}</span>
                    {product.max_stock && (
                      <span className="text-muted-foreground">/{product.max_stock}</span>
                    )}
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{product.location}</td>
                  <td className="p-3">
                    <button
                      onClick={() => handleEditStock(product)}
                      className="px-3 py-1 text-sm bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                    >
                      재고기준
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 재고 기준 편집 모달 */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg border p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">재고 기준 편집</h3>
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">{editingProduct.product_name}</p>
              <p className="text-xs text-muted-foreground">SKU: {editingProduct.sku_id}</p>
            </div>
            
            <form onSubmit={handleUpdateStock} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">최소 재고 *</label>
                <input
                  type="number"
                  name="minStock"
                  defaultValue={editingProduct.min_stock}
                  min="0"
                  required
                  className="w-full px-3 py-2 border border-input rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">최대 재고</label>
                <input
                  type="number"
                  name="maxStock"
                  defaultValue={editingProduct.max_stock || ''}
                  min="0"
                  className="w-full px-3 py-2 border border-input rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">재주문 시점</label>
                <input
                  type="number"
                  name="reorderPoint"
                  defaultValue={editingProduct.reorder_point || ''}
                  min="0"
                  className="w-full px-3 py-2 border border-input rounded-md"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">안전 재고</label>
                <input
                  type="number"
                  name="safetyStock"
                  defaultValue={editingProduct.safety_stock || ''}
                  min="0"
                  className="w-full px-3 py-2 border border-input rounded-md"
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 text-sm border border-input rounded-md hover:bg-accent"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={updateStockMutation.isPending}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {updateStockMutation.isPending ? '저장 중...' : '저장'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}