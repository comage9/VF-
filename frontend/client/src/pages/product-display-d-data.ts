/**
 * D동 배치 데이터 (2026-08-16)
 * - 레이아웃: 엑셀 d동.xlsx 그대로 (상단 8 + 중앙1 8 + 중앙2 8 + 우측1 6 + 우측2 6 + 하단 5 = 41칸)
 * - 배치: 아직 없음 (사용자 지시 대기)
 */
export type D_PnumInfo = {
  name: string; lg: string; md: string; dansu: string; stock: number | null; barcode: string;
};
export const D_PNUM_INFO: Record<string, D_PnumInfo> = {};

export const D_RANK_PLACEMENT: Record<string, string> = {};
