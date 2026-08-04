import { useState, useMemo, useRef } from "react";
import { differenceInDays, parseISO, format } from "date-fns";
import {
  Plus,
  Trash2,
  Loader2,
  Edit,
  Upload,
  Truck,
  Wallet,
  FileText,
  TrendingUp,
  Image as ImageIcon,
  Camera,
  ImagePlus,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  useTruckFreights,
  useFreightSummary,
  useCreateFreight,
  useUpdateFreight,
  useDeleteFreight,
  useImportFreight,
  useUploadFreightPhoto,
  useDeleteFreightPhoto,
  UNIT_OPTIONS,
  INVOICE_OPTIONS,
  PAYMENT_OPTIONS,
  type TruckFreight,
  type TruckFreightDraft,
} from "@/components/shared/truck-freight-api";

// 빈 폼 기본값
const EMPTY_DRAFT: TruckFreightDraft = {
  date: new Date().toISOString().slice(0, 10),
  destination: "",
  quantity: 0,
  unit: "파렛트",
  freight_fee: 0,
  driver_name: "",
  phone: "",
  invoice_type: "",
  account_number: "",
  payment_status: "",
  note: "",
};

// 금액 포맷
function won(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(n) + "원";
}

// 계산서 종류별 색상 클래스
function invoiceColor(inv: string): string {
  if (inv.includes("유원피에스") && !inv.includes("보노하우스")) return "text-teal-700 font-semibold";
  if (inv.includes("보노하우스")) return "text-red-600 font-semibold";
  if (inv.startsWith("일반")) return "text-blue-600 font-semibold";
  return "";
}

// 입금 상태 배지 색상
function paymentVariant(status: string) {
  if (status === "입금") return "default" as const;
  if (status === "미입금") return "destructive" as const;
  if (status === "확인중") return "secondary" as const;
  return "outline" as const;
}

// 등록 후 7일(일주일) 이내 여부 → NEW 배지 표시
const NEW_BADGE_DAYS = 7;
function isNewRecord(createdAt?: string): boolean {
  if (!createdAt) return false;
  try {
    const diff = differenceInDays(new Date(), parseISO(createdAt));
    return diff < NEW_BADGE_DAYS; // 0~6일 → true, 7일 이상 → false
  } catch {
    return false;
  }
}

function formatCreatedAt(iso?: string): string {
  if (!iso) return "-";
  try {
    return format(parseISO(iso), "yyyy-MM-dd HH:mm");
  } catch {
    return iso;
  }
}

export default function TruckFreightPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TruckFreightDraft>(EMPTY_DRAFT);
  const [yearFilter, setYearFilter] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** 행 클릭 상세 팝업 */
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<TruckFreight | null>(null);
  /** 앨범/파일에서 선택 (capture 없음 → 갤러리·기존 사진) */
  const photoGalleryInputRef = useRef<HTMLInputElement>(null);
  /** 카메라 촬영 (capture=environment) */
  const photoCameraInputRef = useRef<HTMLInputElement>(null);

  const yearNum = yearFilter ? parseInt(yearFilter) : undefined;
  const { data: freights = [], isLoading } = useTruckFreights(yearNum);
  const { data: summary } = useFreightSummary();
  const createMut = useCreateFreight();
  const updateMut = useUpdateFreight();
  const deleteMut = useDeleteFreight();
  const importMut = useImportFreight();
  const uploadPhotoMut = useUploadFreightPhoto();
  const deletePhotoMut = useDeleteFreightPhoto();

  // 목록 갱신 시 상세 팝업 데이터 동기화
  const detailLive = useMemo(() => {
    if (!detailRow) return null;
    return freights.find((f) => f.id === detailRow.id) ?? detailRow;
  }, [freights, detailRow]);

  // 연도 목록 (데이터 기반)
  const years = useMemo(() => {
    const set = new Set<number>();
    freights.forEach((f) => {
      if (f.date) set.add(parseInt(f.date.slice(0, 4)));
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [freights]);

  // 새 추가 다이얼로그 열기
  const openCreate = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setDialogOpen(true);
  };

  // 수정 다이얼로그 열기
  const openEdit = (f: TruckFreight) => {
    setDraft({
      date: f.date || "",
      destination: f.destination,
      quantity: f.quantity,
      unit: f.unit,
      freight_fee: f.freight_fee,
      driver_name: f.driver_name,
      phone: f.phone,
      invoice_type: f.invoice_type,
      account_number: f.account_number,
      payment_status: f.payment_status,
      note: f.note,
    });
    setEditingId(f.id);
    setDialogOpen(true);
  };

  // 저장 (생성 또는 수정)
  const handleSave = async () => {
    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, data: draft });
      } else {
        await createMut.mutateAsync(draft);
      }
      setDialogOpen(false);
    } catch (e) {
      alert(`저장 실패: ${(e as Error).message}`);
    }
  };

  // 삭제
  const handleDelete = async (id: number) => {
    if (!confirm("이 운송비 기록을 삭제하시겠습니까?")) return;
    try {
      await deleteMut.mutateAsync(id);
      if (detailRow?.id === id) {
        setDetailOpen(false);
        setDetailRow(null);
      }
    } catch (e) {
      alert(`삭제 실패: ${(e as Error).message}`);
    }
  };

  const openDetail = (f: TruckFreight) => {
    setDetailRow(f);
    setDetailOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const inputEl = e.target;
    if (!file || !detailLive) {
      inputEl.value = "";
      return;
    }
    try {
      const res = await uploadPhotoMut.mutateAsync({ id: detailLive.id, file });
      if (res?.data) setDetailRow(res.data);
    } catch (err) {
      alert(`사진 업로드 실패: ${(err as Error).message}`);
    }
    // 동일 파일 재선택 가능하도록 초기화 (촬영·갤러리 입력 공통)
    inputEl.value = "";
  };

  const handlePhotoDelete = async () => {
    if (!detailLive) return;
    if (!confirm("첨부 사진을 삭제하시겠습니까?")) return;
    try {
      const res = await deletePhotoMut.mutateAsync(detailLive.id);
      if (res?.data) setDetailRow(res.data);
    } catch (err) {
      alert(`사진 삭제 실패: ${(err as Error).message}`);
    }
  };

  // 엑셀 import
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importMut.mutateAsync(file);
      alert(`import 완료: ${result.created}건 추가, ${result.skipped}건 건너뜀`);
    } catch (err) {
      alert(`import 실패: ${(err as Error).message}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 운송비</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{won(summary?.total_fee ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 건수</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.total_count ?? 0}건</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">건당 평균</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary && summary.total_count > 0
                ? won(Math.round(summary.total_fee / summary.total_count))
                : "0원"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">계산서 종류</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.by_invoice.length ?? 0}종</div>
          </CardContent>
        </Card>
      </div>

      {/* 월별 추이 + 계산서 종류별 */}
      {summary && summary.monthly.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">월별 운송비 추이</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {summary.monthly.map((m) => (
                  <div key={m.month} className="flex items-center justify-between text-sm py-1">
                    <span className="text-muted-foreground w-20">{m.month}</span>
                    <div className="flex-1 mx-3 h-4 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-[#721FE5] rounded"
                        style={{
                          width: `${summary.total_fee > 0 ? (m.fee / summary.total_fee) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="w-24 text-right">{won(m.fee)}</span>
                    <span className="w-12 text-right text-muted-foreground">{m.count}건</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">계산서 종류별 현황</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {summary.by_invoice.map((inv) => (
                  <div key={inv.invoice_type} className="flex items-center justify-between text-sm py-1">
                    <span className={`flex-1 ${invoiceColor(inv.invoice_type)}`}>
                      {inv.invoice_type}
                    </span>
                    <span className="w-24 text-right">{won(inv.fee)}</span>
                    <span className="w-16 text-right text-muted-foreground">
                      {inv.ratio.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 데이터 테이블 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">운송비 내역</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={yearFilter || "all"} onValueChange={(v) => setYearFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="전체 연도" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 연도</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={importMut.isPending}
            >
              {importMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-1" />
              )}
              엑셀 가져오기
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              추가
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : freights.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              운송비 데이터가 없습니다. "추가" 버튼으로 새 기록을 입력하거나 "엑셀 가져오기"로 기존 데이터를 불러오세요.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">일자</TableHead>
                    <TableHead>납품처</TableHead>
                    <TableHead className="w-20 text-right">수량</TableHead>
                    <TableHead className="text-right">운송비</TableHead>
                    <TableHead className="w-24">기사명</TableHead>
                    <TableHead>계산서 종류</TableHead>
                    <TableHead className="w-20">입금</TableHead>
                    <TableHead>비고</TableHead>
                    <TableHead className="w-20 text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {freights.map((f) => (
                    <TableRow
                      key={f.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openDetail(f)}
                    >
                      <TableCell className="whitespace-nowrap text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          {f.date || "-"}
                          {isNewRecord(f.created_at) && (
                            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] px-1.5 py-0 h-4 font-bold">
                              ✨ NEW
                            </Badge>
                          )}
                          {(f.has_photo || f.photo_url) && (
                            <span title="사진 첨부됨" className="inline-flex">
                              <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{f.destination || "-"}</TableCell>
                      <TableCell className="text-right text-sm">
                        {f.quantity} {f.unit}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        {won(f.freight_fee)}
                      </TableCell>
                      <TableCell className="text-sm">{f.driver_name || "-"}</TableCell>
                      <TableCell className={`text-sm ${invoiceColor(f.invoice_type)}`}>
                        {f.invoice_type || "-"}
                      </TableCell>
                      <TableCell>
                        {f.payment_status ? (
                          <Badge variant={paymentVariant(f.payment_status)}>{f.payment_status}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {f.note || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEdit(f)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(f.id)}
                            disabled={deleteMut.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 입력/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "운송비 수정" : "운송비 추가"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="date">일자</Label>
              <Input
                id="date"
                type="date"
                value={draft.date || ""}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="destination">납품처(입고처)</Label>
              <Input
                id="destination"
                value={draft.destination}
                onChange={(e) => setDraft({ ...draft, destination: e.target.value })}
                placeholder="예: 쿠팡 안성4"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quantity">수량</Label>
              <Input
                id="quantity"
                type="number"
                value={draft.quantity}
                onChange={(e) => setDraft({ ...draft, quantity: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>단위</Label>
              <Select
                value={draft.unit}
                onValueChange={(v) => setDraft({ ...draft, unit: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="freight_fee">운송비(원)</Label>
              <Input
                id="freight_fee"
                type="number"
                value={draft.freight_fee}
                onChange={(e) => setDraft({ ...draft, freight_fee: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="driver_name">기사명</Label>
              <Input
                id="driver_name"
                value={draft.driver_name}
                onChange={(e) => setDraft({ ...draft, driver_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">연락처</Label>
              <Input
                id="phone"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="010-0000-0000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>계산서 종류</Label>
              <Select
                value={draft.invoice_type || undefined}
                onValueChange={(v) => setDraft({ ...draft, invoice_type: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {INVOICE_OPTIONS.map((inv) => (
                    <SelectItem key={inv} value={inv}>{inv}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>입금확인</Label>
              <Select
                value={draft.payment_status || undefined}
                onValueChange={(v) => setDraft({ ...draft, payment_status: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="account_number">계좌번호</Label>
              <Input
                id="account_number"
                value={draft.account_number}
                onChange={(e) => setDraft({ ...draft, account_number: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label htmlFor="note">비고</Label>
              <Input
                id="note"
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">취소</Button>
            </DialogClose>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingId ? "수정" : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 행 클릭 상세 팝업 + 사진 */}
      <Dialog
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetailRow(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              운송비 상세
              {detailLive && isNewRecord(detailLive.created_at) && (
                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] px-1.5 py-0 h-4 font-bold">
                  ✨ NEW
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailLive && (
            <div className="space-y-4 py-1">
              <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">일자</dt>
                <dd className="font-medium">{detailLive.date || "-"}</dd>
                <dt className="text-muted-foreground">납품처</dt>
                <dd>{detailLive.destination || "-"}</dd>
                <dt className="text-muted-foreground">수량</dt>
                <dd>
                  {detailLive.quantity} {detailLive.unit}
                </dd>
                <dt className="text-muted-foreground">운송비</dt>
                <dd className="font-semibold text-[#721FE5]">{won(detailLive.freight_fee)}</dd>
                <dt className="text-muted-foreground">기사명</dt>
                <dd>{detailLive.driver_name || "-"}</dd>
                <dt className="text-muted-foreground">연락처</dt>
                <dd>{detailLive.phone || "-"}</dd>
                <dt className="text-muted-foreground">계산서</dt>
                <dd className={invoiceColor(detailLive.invoice_type)}>
                  {detailLive.invoice_type || "-"}
                </dd>
                <dt className="text-muted-foreground">계좌번호</dt>
                <dd className="break-all">{detailLive.account_number || "-"}</dd>
                <dt className="text-muted-foreground">입금확인</dt>
                <dd>
                  {detailLive.payment_status ? (
                    <Badge variant={paymentVariant(detailLive.payment_status)}>
                      {detailLive.payment_status}
                    </Badge>
                  ) : (
                    "-"
                  )}
                </dd>
                <dt className="text-muted-foreground">비고</dt>
                <dd className="whitespace-pre-wrap">{detailLive.note || "-"}</dd>
                <dt className="text-muted-foreground">등록 시각</dt>
                <dd className="text-muted-foreground">{formatCreatedAt(detailLive.created_at)}</dd>
              </dl>

              <div className="border-t pt-4 space-y-3">
                <Label className="text-sm font-medium">증빙 사진</Label>
                <p className="text-xs text-muted-foreground">
                  스마트폰: <b>촬영</b>으로 바로 찍거나, <b>앨범</b>에서 기존 사진을 선택하세요.
                </p>
                {/* 갤러리: capture 없음 → 기존 사진/파일 선택 */}
                <input
                  ref={photoGalleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                {/* 카메라: capture → 촬영 후 업로드 */}
                <input
                  ref={photoCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="flex-1 min-w-[7.5rem]"
                    onClick={() => photoCameraInputRef.current?.click()}
                    disabled={uploadPhotoMut.isPending}
                  >
                    {uploadPhotoMut.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4 mr-1" />
                    )}
                    촬영
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 min-w-[7.5rem]"
                    onClick={() => photoGalleryInputRef.current?.click()}
                    disabled={uploadPhotoMut.isPending}
                  >
                    {uploadPhotoMut.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4 mr-1" />
                    )}
                    앨범에서 선택
                  </Button>
                  {detailLive.photo_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={handlePhotoDelete}
                      disabled={deletePhotoMut.isPending}
                    >
                      <X className="h-4 w-4 mr-1" />
                      삭제
                    </Button>
                  )}
                </div>
                {detailLive.photo_url ? (
                  <a
                    href={detailLive.photo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg border overflow-hidden bg-muted/30"
                  >
                    <img
                      src={detailLive.photo_url}
                      alt="증빙 사진"
                      className="w-full max-h-72 object-contain"
                    />
                  </a>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-muted-foreground text-sm">
                    <ImageIcon className="h-8 w-8 opacity-50" />
                    <span>첨부된 사진이 없습니다</span>
                    <span className="text-xs">촬영 또는 앨범에서 선택</span>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => {
                    setDetailOpen(false);
                    openEdit(detailLive);
                  }}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  수정
                </Button>
                <DialogClose asChild>
                  <Button variant="secondary">닫기</Button>
                </DialogClose>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
