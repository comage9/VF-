/**
 * 생산 계획 페이지 우측 통계 패널
 * - 상태별 / 기계별 / 품목 Top 집계 (displayRows 기준)
 */
import { useMemo } from "react";
import { BarChart3, Factory } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const NUMBER_FMT = new Intl.NumberFormat("ko-KR");

export type ProductionStatRow = {
  id: number;
  machineNumber?: string;
  productName?: string;
  quantity?: number | null;
  unitQuantity?: number | null;
  status?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  started: "시작",
  ended: "종료",
  stopped: "중지",
};

type Props = {
  rows: ProductionStatRow[];
  onMachineClick?: (machineNumber: string) => void;
  className?: string;
};

function outputOf(r: ProductionStatRow) {
  return (Number(r.unitQuantity) || 0) * (Number(r.quantity) || 0);
}

export function ProductionStatsPanel({ rows, onMachineClick, className }: Props) {
  const stats = useMemo(() => {
    const byStatusMap = new Map<
      string,
      { status: string; count: number; quantity: number; output: number }
    >();
    const byMachineMap = new Map<
      string,
      {
        machineNumber: string;
        count: number;
        quantity: number;
        unitQuantity: number;
        output: number;
        activeCount: number;
        endedCount: number;
      }
    >();
    const byProductMap = new Map<
      string,
      { productName: string; count: number; quantity: number; output: number }
    >();

    for (const r of rows) {
      const st = String(r.status || "pending");
      const q = Number(r.quantity) || 0;
      const uq = Number(r.unitQuantity) || 0;
      const out = uq * q;
      const machine = String(r.machineNumber || "미분류").trim() || "미분류";
      const product = String(r.productName || "미지정").trim() || "미지정";

      const s = byStatusMap.get(st) || {
        status: st,
        count: 0,
        quantity: 0,
        output: 0,
      };
      s.count += 1;
      s.quantity += q;
      s.output += out;
      byStatusMap.set(st, s);

      const m = byMachineMap.get(machine) || {
        machineNumber: machine,
        count: 0,
        quantity: 0,
        unitQuantity: 0,
        output: 0,
        activeCount: 0,
        endedCount: 0,
      };
      m.count += 1;
      m.quantity += q;
      m.unitQuantity += uq;
      m.output += out;
      if (st === "ended") m.endedCount += 1;
      else m.activeCount += 1;
      byMachineMap.set(machine, m);

      const p = byProductMap.get(product) || {
        productName: product,
        count: 0,
        quantity: 0,
        output: 0,
      };
      p.count += 1;
      p.quantity += q;
      p.output += out;
      byProductMap.set(product, p);
    }

    const statusOrder = ["pending", "started", "stopped", "ended"];
    const byStatus = Array.from(byStatusMap.values()).sort(
      (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
    );
    const byMachine = Array.from(byMachineMap.values()).sort((a, b) =>
      a.machineNumber.localeCompare(b.machineNumber, "ko", { numeric: true })
    );
    const byProductTop = Array.from(byProductMap.values())
      .sort((a, b) => b.output - a.output || b.quantity - a.quantity)
      .slice(0, 10);

    const totals = {
      count: rows.length,
      quantity: rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0),
      unitQuantity: rows.reduce((s, r) => s + (Number(r.unitQuantity) || 0), 0),
      output: rows.reduce((s, r) => s + outputOf(r), 0),
    };

    return { byStatus, byMachine, byProductTop, totals };
  }, [rows]);

  return (
    <div className={`space-y-3 ${className || ""}`}>
      <Card className="border-indigo-100 shadow-sm overflow-hidden">
        <CardHeader className="py-2.5 px-3 bg-gradient-to-r from-indigo-50 to-sky-50 border-b border-indigo-100">
          <CardTitle className="text-sm font-bold text-indigo-900 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            생산 통계
            <Badge variant="secondary" className="ml-auto text-[10px] font-normal">
              {NUMBER_FMT.format(stats.totals.count)}건
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* 상태별 */}
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-[10px] font-semibold text-indigo-700 mb-1">상태별</p>
            <div className="overflow-x-auto rounded border border-indigo-50">
              <table className="w-full text-[11px]">
                <thead className="bg-indigo-50/80 text-indigo-800">
                  <tr>
                    <th className="text-left py-1.5 px-2 font-medium">상태</th>
                    <th className="text-right py-1.5 px-2 font-medium">건수</th>
                    <th className="text-right py-1.5 px-2 font-medium">수량</th>
                    <th className="text-right py-1.5 px-2 font-medium">생산량</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byStatus.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400">
                        데이터 없음
                      </td>
                    </tr>
                  ) : (
                    stats.byStatus.map((s) => (
                      <tr key={s.status} className="border-t border-slate-100">
                        <td className="py-1.5 px-2">{STATUS_LABEL[s.status] || s.status}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {NUMBER_FMT.format(s.count)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {NUMBER_FMT.format(s.quantity)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {NUMBER_FMT.format(s.output)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 기계별 */}
          <div className="px-3 pt-2 pb-1">
            <p className="text-[10px] font-semibold text-indigo-700 mb-1 flex items-center gap-1">
              <Factory className="w-3 h-3" />
              기계별
            </p>
            <div className="overflow-auto max-h-[220px] rounded border border-indigo-50">
              <table className="w-full text-[11px]">
                <thead className="bg-indigo-50/80 text-indigo-800 sticky top-0 z-[1]">
                  <tr>
                    <th className="text-left py-1.5 px-2 font-medium">기계</th>
                    <th className="text-right py-1.5 px-2 font-medium">건</th>
                    <th className="text-right py-1.5 px-2 font-medium">수량</th>
                    <th className="text-right py-1.5 px-2 font-medium">생산량</th>
                    <th className="text-right py-1.5 px-2 font-medium">진행/완료</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byMachine.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400">
                        데이터 없음
                      </td>
                    </tr>
                  ) : (
                    stats.byMachine.map((m) => (
                      <tr
                        key={m.machineNumber}
                        className={`border-t border-slate-100 ${
                          onMachineClick
                            ? "cursor-pointer hover:bg-indigo-50/60"
                            : ""
                        }`}
                        onClick={() => onMachineClick?.(m.machineNumber)}
                        title={onMachineClick ? "클릭: 이 기계로 필터" : undefined}
                      >
                        <td className="py-1.5 px-2 font-medium text-slate-800">
                          {m.machineNumber}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {NUMBER_FMT.format(m.count)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {NUMBER_FMT.format(m.quantity)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {NUMBER_FMT.format(m.output)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">
                          {m.activeCount}/{m.endedCount}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {stats.byMachine.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-indigo-100 bg-slate-50 font-semibold">
                      <td className="py-1.5 px-2">합계</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        {NUMBER_FMT.format(stats.totals.count)}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        {NUMBER_FMT.format(stats.totals.quantity)}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">
                        {NUMBER_FMT.format(stats.totals.output)}
                      </td>
                      <td className="py-1.5 px-2" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* 품목 Top 10 */}
          <div className="px-3 pt-2 pb-3">
            <p className="text-[10px] font-semibold text-indigo-700 mb-1">품목 Top 10 (생산량)</p>
            <div className="overflow-auto max-h-[180px] rounded border border-indigo-50">
              <table className="w-full text-[11px]">
                <thead className="bg-indigo-50/80 text-indigo-800 sticky top-0 z-[1]">
                  <tr>
                    <th className="text-left py-1.5 px-2 font-medium w-8">#</th>
                    <th className="text-left py-1.5 px-2 font-medium">제품명</th>
                    <th className="text-right py-1.5 px-2 font-medium">수량</th>
                    <th className="text-right py-1.5 px-2 font-medium">생산량</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byProductTop.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400">
                        데이터 없음
                      </td>
                    </tr>
                  ) : (
                    stats.byProductTop.map((p, i) => (
                      <tr key={p.productName} className="border-t border-slate-100">
                        <td className="py-1.5 px-2 text-slate-500">{i + 1}</td>
                        <td className="py-1.5 px-2 max-w-[9rem] truncate" title={p.productName}>
                          {p.productName}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {NUMBER_FMT.format(p.quantity)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          {NUMBER_FMT.format(p.output)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
