/**
 * 제품 마스터 개별 수정 다이얼로그 (공유)
 * - 제품 마스터 페이지
 * - 전산재고 수량 페이지 (행 우측 수정 아이콘)
 * 저장 API: PUT /api/master/specs/:id (마스터와 동일)
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectFieldClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export const FINISH_FINISHED = "finished";
export const FINISH_NEEDS_PACKAGING = "needs_packaging";

export interface Spec {
  id: number;
  product_name: string;
  product_name_eng?: string;
  product_number?: number | null;
  mold_number?: string;
  color1?: string;
  color2?: string;
  default_quantity?: number;
  sku_id?: string;
  barcode?: string;
  location?: string;
  category_lg?: string;
  category_md?: string;
  price?: number;
  prev_price?: number;
  price_changed_at?: string;
  lot_number?: string;
  components?: string;
  notes?: string;
  image_url?: string;
  is_discontinued?: boolean;
  is_no_outbound_3m?: boolean;
  is_vf_item?: boolean;
  finish_type?: string;
  has_outbound_3m?: boolean;
  current_stock?: number;
  is_vf_active?: boolean;
  is_vf_no_outbound?: boolean;
  vf_registered_at?: string | null;
}

export interface SpecDraft extends Omit<Spec, 'id'> {}

export function CategoryPickField({
  id,
  label,
  required,
  value,
  onChange,
  options,
  emptyOptionLabel,
  inputPlaceholder,
  hint,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  emptyOptionLabel: string;
  inputPlaceholder?: string;
  hint?: string;
}) {
  const v = value || "";
  const opts = useMemo(() => {
    const set = new Set(options);
    if (v.trim()) set.add(v.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [options, v]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <select
        id={`${id}_select`}
        className={selectFieldClass}
        value={opts.includes(v.trim()) ? v.trim() : ""}
        onChange={(e) => {
          const next = e.target.value;
          onChange(next);
        }}
      >
        <option value="">{emptyOptionLabel}</option>
        {opts.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <Input
        id={id}
        name={id}
        value={v}
        onChange={(e) => onChange(e.target.value)}
        placeholder={inputPlaceholder}
      />
      {hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// Sub-component for Dialog (개별 수정)
export interface SpecEditDialogProps {
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
    spec: Spec | null;
    onSave: (data: Spec | SpecDraft) => void;
    isSaving: boolean;
    categoryLgOptions?: string[];
    categoryMdOptions?: string[];
    categoryMdByLg?: Record<string, string[]>;
}

export function SpecEditDialog({
  isOpen,
  onOpenChange,
  spec,
  onSave,
  isSaving,
  categoryLgOptions = [],
  categoryMdOptions = [],
  categoryMdByLg = {},
}: SpecEditDialogProps) {
    const [formData, setFormData] = useState<Partial<Spec>>({});
    const [isUploadingImage, setIsUploadingImage] = useState(false);

    const mdOptionsForLg = useMemo(() => {
      const lg = (formData.category_lg || "").trim();
      if (lg && categoryMdByLg[lg]?.length) {
        const set = new Set([...categoryMdByLg[lg], ...categoryMdOptions]);
        return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
      }
      return categoryMdOptions;
    }, [formData.category_lg, categoryMdByLg, categoryMdOptions]);

    useEffect(() => {
        if (isOpen) {
            setFormData(spec || { is_discontinued: false });
        }
    }, [isOpen, spec]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    }

    const handleSelectChange = (name: string, value: any) => {
        setFormData(prev => ({ ...prev, [name]: value }));
    }

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const uploadData = new FormData();
        uploadData.append("image", file);

        setIsUploadingImage(true);
        try {
            const res = await fetch("/api/master/specs/upload-image", {
                method: "POST",
                body: uploadData,
            });
            if (!res.ok) throw new Error("이미지 업로드에 실패했습니다.");
            const data = await res.json();
            setFormData(prev => ({ ...prev, image_url: data.image_url }));
        } catch (err: any) {
            alert(err.message || "이미지 업로드 실패");
        } finally {
            setIsUploadingImage(false);
        }
    };

    const handleSubmit = () => {
        if (!(formData.product_name || '').trim()) {
            alert('제품명은 필수입니다.');
            return;
        }
        // 신규 등록 시 대분류 필수 (사용자 지정)
        if (!spec && !(formData.category_lg || '').trim()) {
            alert('대분류를 입력해 주세요. (필수)');
            return;
        }
        onSave(formData as Spec | SpecDraft);
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{spec ? '제품 정보 수정' : '신규 제품 추가'}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto px-1">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 col-span-2">
                            <Label htmlFor="product_name">제품명 *</Label>
                            <Input id="product_name" name="product_name" value={formData.product_name || ''} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="barcode">바코드</Label>
                            <Input id="barcode" name="barcode" value={formData.barcode || ''} onChange={handleChange} className="font-mono" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="sku_id">SKU ID</Label>
                            <Input id="sku_id" name="sku_id" value={formData.sku_id || ''} onChange={handleChange} className="font-mono" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="location">로케이션</Label>
                        <Input
                          id="location"
                          name="location"
                          value={formData.location || ''}
                          onChange={handleChange}
                          className="font-mono"
                          placeholder="예: 320-A1-1-23"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          저장 시 BarcodeMaster에 자동 등록됩니다. 바코드가 있어야 로케이션을 저장할 수 있습니다.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label className="block mb-1">VF 품목 (지정 / 해제)</Label>
                        <p className="text-[10px] text-muted-foreground mb-1">
                          저장 시 DB 반영. 자동 출고 규칙으로 다시 바뀌지 않습니다.
                        </p>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => handleSelectChange('is_vf_item', true)}
                                className={`flex-1 py-1.5 text-[11px] font-semibold rounded border transition-all ${
                                    formData.is_vf_item
                                        ? 'bg-violet-50 border-violet-500 text-violet-800'
                                        : 'bg-white border-input text-muted-foreground hover:bg-muted/40'
                                }`}
                            >
                                VF 지정
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectChange('is_vf_item', false)}
                                className={`flex-1 py-1.5 text-[11px] font-semibold rounded border transition-all ${
                                    !formData.is_vf_item
                                        ? 'bg-slate-100 border-slate-400 text-slate-800'
                                        : 'bg-white border-input text-muted-foreground hover:bg-muted/40'
                                }`}
                            >
                                VF 해제
                            </button>
                        </div>
                        {formData.is_vf_item && (
                          <div className="rounded-md border border-violet-200 bg-violet-50/60 px-3 py-2 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <Label
                                htmlFor="vf_registered_at"
                                className="text-xs font-semibold text-violet-900"
                              >
                                VF 품목 등록일
                              </Label>
                              {formData.vf_registered_at ? (
                                <button
                                  type="button"
                                  className="text-[10px] text-violet-600 underline underline-offset-2 hover:text-violet-900"
                                  onClick={() =>
                                    handleSelectChange("vf_registered_at", null)
                                  }
                                >
                                  일자 비우기
                                </button>
                              ) : (
                                <span className="text-[10px] text-violet-500">
                                  미등록 · 저장 시 오늘로 자동 지정될 수 있음
                                </span>
                              )}
                            </div>
                            <Input
                              id="vf_registered_at"
                              name="vf_registered_at"
                              type="date"
                              value={
                                formData.vf_registered_at
                                  ? String(formData.vf_registered_at).slice(0, 10)
                                  : ""
                              }
                              onChange={handleChange}
                              className="font-mono bg-white h-9"
                            />
                            <p className="text-[10px] text-violet-700/80 leading-snug">
                              수동으로 등록일을 지정·수정할 수 있습니다. (예: 쿠팡 발주 등록일)
                            </p>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                            수동 설정/해제 가능. VF CSV 전체 재동기화 시 값이 덮일 수 있습니다.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label className="block mb-1">제품 형태</Label>
                        <p className="text-[10px] text-muted-foreground mb-1">
                          완제품인지, 포장을 해야 하는 제품인지 구분합니다. (대분류와 무관)
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectChange("finish_type", FINISH_FINISHED)
                            }
                            className={`flex-1 py-1.5 text-[11px] font-semibold rounded border transition-all ${
                              formData.finish_type === FINISH_FINISHED
                                ? "bg-emerald-50 border-emerald-500 text-emerald-800"
                                : "bg-white border-input text-muted-foreground hover:bg-muted/40"
                            }`}
                          >
                            완제품
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleSelectChange(
                                "finish_type",
                                FINISH_NEEDS_PACKAGING
                              )
                            }
                            className={`flex-1 py-1.5 text-[11px] font-semibold rounded border transition-all ${
                              formData.finish_type === FINISH_NEEDS_PACKAGING
                                ? "bg-orange-50 border-orange-500 text-orange-800"
                                : "bg-white border-input text-muted-foreground hover:bg-muted/40"
                            }`}
                          >
                            포장 필요
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectChange("finish_type", "")}
                            className={`flex-1 py-1.5 text-[11px] font-semibold rounded border transition-all ${
                              !formData.finish_type
                                ? "bg-slate-100 border-slate-400 text-slate-800"
                                : "bg-white border-input text-muted-foreground hover:bg-muted/40"
                            }`}
                          >
                            미지정
                          </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-2 col-span-2">
                            <Label htmlFor="price">최신 단가(원)</Label>
                            <Input id="price" name="price" type="number" value={formData.price || 0} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="prev_price">이전 단가(원)</Label>
                            <Input id="prev_price" name="prev_price" type="number" value={formData.prev_price || 0} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="price_changed_at">단가 변동일</Label>
                            <Input id="price_changed_at" name="price_changed_at" type="date" value={formData.price_changed_at || ''} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 items-center">
                        <div className="space-y-2 col-span-2">
                            <Label htmlFor="lot_number">로트 번호</Label>
                            <Input id="lot_number" name="lot_number" value={formData.lot_number || ''} onChange={handleChange} className="font-mono" />
                        </div>
                        {/* 신설: 양방향 상태(출고 진행 vs 단종) 편집 라디오 */}
                        {/* 신설: 양방향 상태(출고 진행 vs 3개월 미출고 vs 단종) 편집 라디오 */}
                        <div className="space-y-2 col-span-2">
                            <Label className="block mb-1">상태</Label>
                            <p className="text-[10px] text-muted-foreground -mt-1 mb-1">
                                단종은 수동 지정/해제만 가능합니다. 출고·입고 자동 배치로는 단종 상태가 바뀌지 않습니다.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleSelectChange('is_discontinued', false);
                                        handleSelectChange('is_no_outbound_3m', false);
                                    }}
                                    className={`flex-1 py-1.5 text-[11px] font-semibold rounded border transition-all ${
                                        !formData.is_discontinued && !formData.is_no_outbound_3m
                                            ? 'bg-green-50 border-green-500 text-green-700'
                                            : 'bg-white border-input text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    FC 출고 품목
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleSelectChange('is_discontinued', false);
                                        handleSelectChange('is_no_outbound_3m', true);
                                    }}
                                    className={`flex-1 py-1.5 text-[11px] font-semibold rounded border transition-all ${
                                        !formData.is_discontinued && formData.is_no_outbound_3m
                                            ? 'bg-amber-50 border-amber-500 text-amber-700'
                                            : 'bg-white border-input text-gray-500 hover:bg-gray-50'
                                    }`}
                                >
                                    FC 3개월 미출고
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleSelectChange('is_discontinued', true);
                                        handleSelectChange('is_no_outbound_3m', false);
                                    }}
                                    className={`flex-1 py-1.5 text-[11px] font-semibold rounded border transition-all ${
                                        formData.is_discontinued
                                            ? 'bg-red-50 border-red-500 text-red-700'
                                            : 'bg-white border-input text-gray-500 hover:bg-gray-50'
                                    }`}
                                    title="단종은 수동으로만 지정·해제됩니다"
                                >
                                    단종
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="color1">색상1</Label>
                            <Input id="color1" name="color1" value={formData.color1 || ''} onChange={handleChange} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="color2">색상2</Label>
                            <Input id="color2" name="color2" value={formData.color2 || ''} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <CategoryPickField
                          id="category_lg"
                          label="대분류"
                          required={!spec}
                          value={formData.category_lg || ""}
                          onChange={(v) => handleSelectChange("category_lg", v)}
                          options={categoryLgOptions}
                          emptyOptionLabel="— 대분류 선택 —"
                          inputPlaceholder={!spec ? "필수 · 목록 선택 또는 직접 입력" : "목록 선택 또는 직접 입력"}
                          hint="기존 분류를 고르거나 새 이름을 직접 입력할 수 있습니다."
                        />
                        <CategoryPickField
                          id="category_md"
                          label="중분류"
                          value={formData.category_md || ""}
                          onChange={(v) => handleSelectChange("category_md", v)}
                          options={mdOptionsForLg}
                          emptyOptionLabel="— 중분류 선택 —"
                          inputPlaceholder="목록 선택 또는 직접 입력"
                          hint="대분류에 묶인 중분류가 있으면 우선 표시됩니다."
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="default_quantity">단수 / 포장 기본값</Label>
                            <Input
                              id="default_quantity"
                              name="default_quantity"
                              type="number"
                              min={0}
                              value={formData.default_quantity || 0}
                              onChange={handleChange}
                              title="오픈스텝 등: 단수(1단→1). 2P 세트 등: 포장갯수(2개→2)"
                            />
                            <p className="text-[10px] text-muted-foreground">
                              오픈스텝: 단수(1). 레브 2P: 포장 2
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="mold_number">금형번호</Label>
                            <Input id="mold_number" name="mold_number" value={formData.mold_number || ''} onChange={handleChange} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="product_name_eng">영문명</Label>
                        <Input id="product_name_eng" name="product_name_eng" value={formData.product_name_eng || ''} onChange={handleChange} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="components">구성품 품목 명세</Label>
                        <textarea
                            id="components"
                            name="components"
                            value={formData.components || ''}
                            onChange={handleChange}
                            placeholder="제품에 포함되는 세부 부품/구성품들을 쉼표(,) 등으로 나열하여 작성하세요."
                            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="notes">비고</Label>
                        <textarea
                            id="notes"
                            name="notes"
                            value={formData.notes || ""}
                            onChange={handleChange}
                            placeholder="작업 메모, 주의사항 등. 목록에서 제품명에 마우스를 올리면 표시됩니다."
                            className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          저장 후 목록 제품명 위에 마우스를 올리면 비고 내용이 툴팁으로 보입니다.
                        </p>
                    </div>
                    <div className="space-y-2 border p-3 rounded-md bg-muted/20">
                        <Label className="font-semibold block mb-2">제품 사진 업로드</Label>
                        <div className="flex items-center gap-4">
                            {formData.image_url ? (
                                <div className="relative w-24 h-24 border rounded-md overflow-hidden bg-muted flex items-center justify-center shrink-0">
                                    <img src={formData.image_url} alt="미리보기" className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        className="absolute top-1 right-1 bg-red-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold hover:bg-red-700 shadow"
                                        onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                                    >
                                        &times;
                                    </button>
                                </div>
                            ) : (
                                <div className="w-24 h-24 border-2 border-dashed rounded-md flex items-center justify-center text-muted-foreground/60 bg-muted/40 text-xs shrink-0 font-medium">
                                    사진 없음
                                </div>
                            )}
                            <div className="flex-1 space-y-1">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                    disabled={isUploadingImage}
                                    className="cursor-pointer"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    {isUploadingImage ? (
                                        <span className="text-blue-600 font-semibold">사진 업로드 중... 잠시만 기다려 주세요.</span>
                                    ) : (
                                        "JPEG, PNG 등 이미지 파일을 선택하면 자동으로 백엔드 서버에 업로드됩니다."
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">취소</Button>
                    </DialogClose>
                    <Button onClick={handleSubmit} disabled={isSaving || isUploadingImage}>
                        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        저장
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

