# -*- coding: utf-8 -*-
"""One-shot patch: inventory row edit icon + shared SpecEditDialog wiring."""
from pathlib import Path

ROOT = Path(r"E:/coding/VF-new/frontend/client/src")

# --- inventory-table.tsx ---
p = ROOT / "components/inventory/inventory-table.tsx"
t = p.read_text(encoding="utf-8")

if "onEditSpec" not in t:
    t = t.replace(
        "import { useState, useMemo } from 'react';\n"
        "import { useQuery } from '@tanstack/react-query';\n"
        "import { UnifiedInventoryResponseEnhanced } from '../../types/enhanced-inventory';\n"
        "import { matchesSearchInFields } from '@/lib/searchMatch';\n",
        "import { useState, useMemo } from 'react';\n"
        "import { useQuery } from '@tanstack/react-query';\n"
        "import { Edit } from 'lucide-react';\n"
        "import { UnifiedInventoryResponseEnhanced } from '../../types/enhanced-inventory';\n"
        "import { matchesSearchInFields } from '@/lib/searchMatch';\n",
    )
    t = t.replace(
        "  /** 품목명 클릭 → 출고/현재고 리포트 팝업 */\n"
        "  onProductClick?: (item: UnifiedInventoryResponseEnhanced['data'][number]) => void;\n"
        "}\n",
        "  /** 품목명 클릭 → 출고/현재고 리포트 팝업 */\n"
        "  onProductClick?: (item: UnifiedInventoryResponseEnhanced['data'][number]) => void;\n"
        "  /** 우측 수정 아이콘 → 제품 마스터 수정 다이얼로그 (masterSpecId 필요) */\n"
        "  onEditSpec?: (item: UnifiedInventoryResponseEnhanced['data'][number]) => void;\n"
        "}\n",
    )
    t = t.replace(
        "  onToggleStockStatus,\n"
        "  onProductClick,\n"
        "}: InventoryTableProps) {\n",
        "  onToggleStockStatus,\n"
        "  onProductClick,\n"
        "  onEditSpec,\n"
        "}: InventoryTableProps) {\n",
    )
    t = t.replace(
        '                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">업데이트일</th>\n'
        "              </tr>\n"
        "            </thead>\n",
        '                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">업데이트일</th>\n'
        '                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50">수정</th>\n'
        "              </tr>\n"
        "            </thead>\n",
    )
    old_cell = (
        '                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\n'
        "                    {item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString('ko-KR') : '-'}\n"
        "                  </td>\n"
        "                </tr>\n"
    )
    new_cell = (
        '                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">\n'
        "                    {item.lastUpdated ? new Date(item.lastUpdated).toLocaleDateString('ko-KR') : '-'}\n"
        "                  </td>\n"
        '                  <td className="px-6 py-4 whitespace-nowrap text-center sticky right-0 bg-white">\n'
        "                    <button\n"
        '                      type="button"\n'
        "                      title={\n"
        "                        (item as any).masterSpecId\n"
        "                          ? '제품 마스터 수정 (마스터 페이지와 동일)'\n"
        "                          : '마스터 미연결 품목'\n"
        "                      }\n"
        "                      disabled={!(item as any).masterSpecId || !onEditSpec}\n"
        "                      onClick={(e) => {\n"
        "                        e.stopPropagation();\n"
        "                        if ((item as any).masterSpecId) onEditSpec?.(item);\n"
        "                      }}\n"
        "                      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border ${\n"
        "                        (item as any).masterSpecId\n"
        "                          ? 'border-violet-200 text-violet-700 hover:bg-violet-50'\n"
        "                          : 'border-gray-200 text-gray-300 cursor-not-allowed'\n"
        "                      }`}\n"
        "                    >\n"
        '                      <Edit className="h-4 w-4" />\n'
        "                    </button>\n"
        "                  </td>\n"
        "                </tr>\n"
    )
    if old_cell not in t:
        raise SystemExit("row cell not found in inventory-table")
    t = t.replace(old_cell, new_cell, 1)
    p.write_text(t, encoding="utf-8")
    print("inventory-table ok")
else:
    print("inventory-table already patched")

# --- enhanced-inventory-page.tsx ---
ep = ROOT / "components/inventory/enhanced-inventory-page.tsx"
et = ep.read_text(encoding="utf-8")

if "SpecEditDialog" not in et:
    # import
    inserted_import = False
    for line in [
        "import InventoryTable from './inventory-table';",
        'import InventoryTable from "./inventory-table";',
    ]:
        if line in et:
            et = et.replace(
                line,
                line
                + "\nimport {\n"
                + "  SpecEditDialog,\n"
                + "  type Spec,\n"
                + "  type SpecDraft,\n"
                + "} from '@/components/master/spec-edit-dialog';\n",
                1,
            )
            inserted_import = True
            print("import ok")
            break
    if not inserted_import:
        raise SystemExit("InventoryTable import not found")

    if "editingSpec" not in et:
        et = et.replace(
            "  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());\n",
            "  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());\n"
            "  const [isSpecDialogOpen, setIsSpecDialogOpen] = useState(false);\n"
            "  const [editingSpec, setEditingSpec] = useState<Spec | null>(null);\n"
            "  const [isSavingSpec, setIsSavingSpec] = useState(false);\n",
            1,
        )
        print("state ok")

    if "openSpecEditFromInventory" not in et:
        insert_after = "  const handleInventoryMasterBulk"
        i = et.find(insert_after)
        if i < 0:
            raise SystemExit("handleInventoryMasterBulk not found")
        j = et.find("\n  const ", i + 10)
        if j < 0:
            raise SystemExit("next const after handleInventoryMasterBulk not found")
        handlers = r'''
  /** 전산재고 행 → 제품 마스터 수정 다이얼로그 (마스터 페이지와 동일 UI/API) */
  const openSpecEditFromInventory = async (
    item: (typeof inventoryItems)[number]
  ) => {
    const specId = Number((item as any).masterSpecId);
    if (!Number.isFinite(specId) || specId <= 0) {
      alert('제품 마스터에 연결되지 않은 품목입니다.');
      return;
    }
    try {
      const res = await fetch(`/api/master/specs/${specId}`);
      if (res.ok) {
        setEditingSpec((await res.json()) as Spec);
      } else {
        setEditingSpec({
          id: specId,
          product_name: String((item as any).productName || ''),
          barcode: String((item as any).barcode || ''),
          sku_id: String((item as any).skuId || (item as any).externalSkuId || ''),
          location: String((item as any).location || ''),
          is_vf_item: (item as any).is_vf_item !== false,
          is_discontinued: !!(item as any).is_discontinued,
          is_no_outbound_3m: !!(item as any).is_no_outbound_3m,
          price: Number((item as any).price || 0),
        });
      }
    } catch {
      setEditingSpec({
        id: specId,
        product_name: String((item as any).productName || ''),
        barcode: String((item as any).barcode || ''),
      });
    }
    setIsSpecDialogOpen(true);
  };

  const handleSaveSpecFromInventory = async (data: Spec | SpecDraft) => {
    const id = Number((data as Spec).id || editingSpec?.id);
    if (!Number.isFinite(id) || id <= 0) {
      alert('저장할 마스터 ID가 없습니다.');
      return;
    }
    setIsSavingSpec(true);
    try {
      const res = await fetch(`/api/master/specs/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as any).message || '제품 수정 실패');
      setIsSpecDialogOpen(false);
      setEditingSpec(null);
      handleRefreshInventory();
      queryClient.invalidateQueries({ queryKey: ['/api/master/specs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/master/specs', 'compact'] });
    } catch (e: unknown) {
      console.error(e);
      alert(e instanceof Error ? e.message : '제품 수정 실패');
    } finally {
      setIsSavingSpec(false);
    }
  };

'''
        et = et[:j] + handlers + et[j:]
        print("handlers ok")

    if "onEditSpec=" not in et:
        et = et.replace(
            "                      onProductClick={(item) => openProductReport(item)}\n"
            "                    />\n",
            "                      onProductClick={(item) => openProductReport(item)}\n"
            "                      onEditSpec={(item) => openSpecEditFromInventory(item)}\n"
            "                    />\n",
            1,
        )
        print("prop ok")

    if "<SpecEditDialog" not in et:
        marker = "<ProductOutboundChartDialog"
        if marker in et:
            i = et.find(marker)
            dialog = (
                "            <SpecEditDialog\n"
                "              isOpen={isSpecDialogOpen}\n"
                "              onOpenChange={(open) => {\n"
                "                setIsSpecDialogOpen(open);\n"
                "                if (!open) setEditingSpec(null);\n"
                "              }}\n"
                "              spec={editingSpec}\n"
                "              onSave={handleSaveSpecFromInventory}\n"
                "              isSaving={isSavingSpec}\n"
                "            />\n"
            )
            et = et[:i] + dialog + et[i:]
            print("dialog ok")
        else:
            raise SystemExit("ProductOutboundChartDialog not found")

    ep.write_text(et, encoding="utf-8")
    print("enhanced page written")
else:
    print("enhanced page already has SpecEditDialog")

# sanity
it = (ROOT / "components/inventory/inventory-table.tsx").read_text(encoding="utf-8")
en = (ROOT / "components/inventory/enhanced-inventory-page.tsx").read_text(encoding="utf-8")
pm = (ROOT / "pages/product-master.tsx").read_text(encoding="utf-8")
sd = (ROOT / "components/master/spec-edit-dialog.tsx").read_text(encoding="utf-8")
print(
    "sanity",
    "onEditSpec" in it,
    "openSpecEditFromInventory" in en,
    "SpecEditDialog" in pm,
    "export function SpecEditDialog" in sd,
    "function CategoryPickField" not in pm,
)
