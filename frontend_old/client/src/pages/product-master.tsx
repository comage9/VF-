import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Edit, Wand2, Package, CheckCircle, PauseCircle, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useEffect, useState } from "react";

// Types
interface Spec {
  id: number;
  product_name: string;
  product_name_eng?: string;
  mold_number?: string;
  color1?: string;
  color2?: string;
  default_quantity?: number;
}

interface SpecDraft extends Omit<Spec, 'id'> {}

// API Hooks
const useGetSpecs = () => useQuery<Spec[]>({
  queryKey: ["/api/master/specs"],
  queryFn: async () => {
    const res = await fetch("/api/master/specs");
    if (!res.ok) throw new Error("Failed to fetch specs");
    return res.json();
  },
});

const useExtractSpecs = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/master/extract", { method: "POST" });
      if (!res.ok) {
          const errorData = await res.json().catch(() => ({ message: 'Extraction failed without details' }));
          throw new Error(errorData.message || 'Failed to extract specs');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/specs"] });
      const added = data?.added ?? 0;
      const updated = data?.updated ?? 0;
      alert(`스펙 추출 완료: ${added}개 추가, ${updated}개 보완됨.`);
    },
    onError: (error) => {
        alert(`스펙 추출 실패: ${error.message}`);
    }
  });
};

const useCreateSpec = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (newSpec: SpecDraft) => fetch("/api/master/specs", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newSpec),
        }).then(res => res.json()),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["/api/master/specs"]});
        }
    });
}

const useUpdateSpec = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...updatedSpec }: Spec) => fetch(`/api/master/specs/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedSpec),
        }).then(res => res.json()),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["/api/master/specs"]});
        }
    });
}

const useDeleteSpec = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => fetch(`/api/master/specs/${id}`, { method: 'DELETE' }),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["/api/master/specs"]});
        }
    });
}

// Component
export default function ProductMasterPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSpec, setEditingSpec] = useState<Spec | null>(null);

  const { data: specs = [], isLoading } = useGetSpecs();
  const extractMutation = useExtractSpecs();
  const createMutation = useCreateSpec();
  const updateMutation = useUpdateSpec();
  const deleteMutation = useDeleteSpec();

  const handleOpenDialog = (spec: Spec | null = null) => {
    setEditingSpec(spec);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (window.confirm("정말로 이 스펙을 삭제하시겠습니까?")) {
        deleteMutation.mutate(id);
    }
  };

  const handleSave = async (formData: SpecDraft | Spec) => {
    const mutation = 'id' in formData && formData.id ? updateMutation : createMutation;
    try {
      await mutation.mutateAsync(formData as any);
      setIsDialogOpen(false);
    } catch (e: any) {
      alert(`저장 실패: ${e?.message || 'unknown error'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Overview - Z-Layout 기반 (2x2 그리드) */}
      {!isLoading && specs.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {/* 1순위: 총 제품 수 - 강조 */}
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-700 uppercase">총 제품 수</p>
                  <h3 className="text-xl font-bold text-blue-900">{specs.length}</h3>
                  <p className="text-xs text-blue-700 mt-1">등록된 스펙</p>
                </div>
                <Package className="w-8 h-8 text-blue-600 bg-white rounded-full p-1.5" />
              </div>
            </CardContent>
          </Card>

          {/* 2순위: 활성 상태 - 강조 */}
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-emerald-700 uppercase">활성 상태</p>
                  <h3 className="text-xl font-bold text-emerald-900">{specs.length}</h3>
                  <p className="text-xs text-emerald-700 mt-1">사용 가능 스펙</p>
                </div>
                <CheckCircle className="w-8 h-8 text-emerald-600 bg-white rounded-full p-1.5" />
              </div>
            </CardContent>
          </Card>

          {/* 3순위: 최근 추출 건 */}
          <Card className="bg-gray-50 border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600 uppercase">자동 추출</p>
                  <h3 className="text-xl font-bold text-gray-900">사용 가능</h3>
                  <p className="text-xs text-gray-500 mt-1">생산 로그 기반</p>
                </div>
                <Wand2 className="w-8 h-8 text-purple-500 bg-white rounded-full p-1.5" />
              </div>
            </CardContent>
          </Card>

          {/* 4순위: 관리 기능 */}
          <Card className="bg-gray-50 border border-gray-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-600 uppercase">데이터 관리</p>
                  <h3 className="text-xl font-bold text-gray-900">CRUD</h3>
                  <p className="text-xs text-gray-500 mt-1">추가/수정/삭제</p>
                </div>
                <Edit className="w-8 h-8 text-gray-500 bg-white rounded-full p-1.5" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>제품 마스터 관리</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            신규 스펙 추가
          </Button>
          <Button variant="outline" onClick={() => extractMutation.mutate()} disabled={extractMutation.isPending}>
            {extractMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
            기존 로그에서 추출
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="mt-6">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-4">제품명</th>
                  <th>영문명</th>
                  <th>금형번호</th>
                  <th>색상1</th>
                  <th>색상2</th>
                  <th className="text-right">기본수량</th>
                  <th className="text-center w-32">작업</th>
                </tr>
              </thead>
              <tbody>
                {specs.map((spec) => (
                  <tr key={spec.id} className="border-b">
                    <td className="p-4 font-medium">{spec.product_name}</td>
                    <td>{spec.product_name_eng}</td>
                    <td>{spec.mold_number}</td>
                    <td>{spec.color1}</td>
                    <td>{spec.color2}</td>
                    <td className="text-right">{spec.default_quantity}</td>
                    <td className="p-4 flex justify-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(spec)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(spec.id)} disabled={deleteMutation.isPending && deleteMutation.variables === spec.id}>
                        {deleteMutation.isPending && deleteMutation.variables === spec.id ? <Loader2 className="w-4 h-4 animate-spin"/> : <Trash2 className="w-4 h-4" />}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <SpecEditDialog 
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        spec={editingSpec}
        onSave={handleSave}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

// Sub-component for Dialog
interface SpecEditDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    spec: Spec | null;
    onSave: (data: Spec | SpecDraft) => void;
    isSaving: boolean;
}

const SpecEditDialog = ({ isOpen, onOpenChange, spec, onSave, isSaving }: SpecEditDialogProps) => {
    const [formData, setFormData] = useState<Partial<Spec>>({});

    // Reset form when dialog opens or spec changes
    useEffect(() => {
        if (isOpen) {
            setFormData(spec || {});
        }
    }, [isOpen, spec]);
    
    // Using an effect to sync state when spec prop changes
    // This is safer than using the state initializer alone
    useEffect(() => {
        setFormData(spec || { product_name: '', product_name_eng: '', mold_number: '', color1: '', color2: '', default_quantity: 0 });
    }, [spec]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    }

    const handleSubmit = () => {
        onSave(formData as Spec | SpecDraft);
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{spec ? '스펙 수정' : '신규 스펙 추가'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="product_name" className="text-right">제품명</Label>
                        <Input id="product_name" name="product_name" value={formData.product_name || ''} onChange={handleChange} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="product_name_eng" className="text-right">영문명</Label>
                        <Input id="product_name_eng" name="product_name_eng" value={formData.product_name_eng || ''} onChange={handleChange} className="col-span-3" />
                    </div>
                     <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="mold_number" className="text-right">금형번호</Label>
                        <Input id="mold_number" name="mold_number" value={formData.mold_number || ''} onChange={handleChange} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="color1" className="text-right">색상1</Label>
                        <Input id="color1" name="color1" value={formData.color1 || ''} onChange={handleChange} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="color2" className="text-right">색상2</Label>
                        <Input id="color2" name="color2" value={formData.color2 || ''} onChange={handleChange} className="col-span-3" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="default_quantity" className="text-right">기본수량</Label>
                        <Input id="default_quantity" name="default_quantity" type="number" value={formData.default_quantity || 0} onChange={handleChange} className="col-span-3" />
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">취소</Button>
                    </DialogClose>
                    <Button onClick={handleSubmit} disabled={isSaving}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        저장
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}