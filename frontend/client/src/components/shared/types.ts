// 공통 타입 - production-plan.tsx 공용

export interface ProductionItem {
  id: number;
  date: string;
  machine_number: string;
  user_name: string | null;
  product_name: string;
  product_name_eng: string;
  mold_number: string;
  color1: string;
  color2: string;
  unit: string;
  quantity: number;
  unit_quantity: number;
  total: number;
  status: 'pending' | 'started' | 'ended' | 'stopped';
  ai_reason: string;
  startTime?: string;
  endTime?: string;
  outbound_data: OutboundData | null;
  created_at: string;
}

export interface OutboundData {
  daily_outbound: number;
  trend_percent: number;
  trend_direction: string;
  avg_production: number;
  recent_qty_list: number[];
}

export interface ProductionDraft {
  date: string;
  machine_number: string;
  mold_number: string;
  product_name: string;
  product_name_eng?: string;
  color1?: string;
  color2?: string;
  unit?: string;
  quantity?: number;
  unit_quantity?: number;
  total?: number;
  status?: 'pending' | 'started' | 'ended' | 'stopped';
}

export interface MachineInfo {
  machine_number: string;
  product_name: string;
  status: string;
}
