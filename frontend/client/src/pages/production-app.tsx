import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, Plus, Sparkles, LogOut, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Types
interface MachinePlan {
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
  status: string;
  ai_reason: string;
  outbound_data: {
    daily_outbound: number;
    trend_percent: number;
    trend_direction: string;
    avg_production: number;
    recent_qty_list: number[];
  } | null;
  created_at: string;
}

interface LoginResponse {
  success: boolean;
  token?: string;
  user_name?: string;
  machine_number?: string;
  message?: string;
}

// PIN 입력 컴포넌트
function PinInput({ value, onChange, length = 4 }: { value: string; onChange: (v: string) => void; length?: number }) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length }).map((_, i) => (
        <div
          key={i}
          className={`w-12 h-14 rounded-lg border-2 flex items-center justify-center text-2xl font-bold
            ${focused ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}
            ${value.length > i ? 'bg-blue-100' : ''}`}
        >
          {value.length > i ? '●' : ''}
        </div>
      ))}
      <input
        type="password"
        maxLength={length}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute opacity-0 cursor-default"
        autoFocus
      />
    </div>
  );
}

// 기계 선택 화면
function MachineLogin({
  onLogin,
  isLoading,
  error,
}: {
  onLogin: (machine: string, pin: string) => void;
  isLoading: boolean;
  error: string;
}) {
  const [selectedMachine, setSelectedMachine] = useState("");
  const [pin, setPin] = useState("");

  const machines = ["M001", "M002", "M003", "M004"];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMachine && pin.length >= 4) {
      onLogin(selectedMachine, pin);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4">
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-8 pt-8">
          <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🏭</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">생산 계획</h1>
          <p className="text-gray-500 mt-1">기계를 선택하고 PIN을 입력하세요</p>
        </div>

        <Card className="mb-4">
          <CardContent className="p-4">
            <Label className="text-sm font-medium mb-3 block">기계 선택</Label>
            <div className="grid grid-cols-2 gap-3">
              {machines.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMachine(m)}
                  className={`p-3 rounded-lg border-2 text-center transition-all
                    ${selectedMachine === m
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <span className="text-lg font-bold">{m}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardContent className="p-4">
            <Label className="text-sm font-medium mb-3 block">PIN (4~6자리)</Label>
            <PinInput value={pin} onChange={setPin} length={6} />
          </CardContent>
        </Card>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center mb-4">
            {error}
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!selectedMachine || pin.length < 4 || isLoading}
          className="w-full py-6 text-lg"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
          로그인
        </Button>
      </div>
    </div>
  );
}

// 메인 대시보드
function MachineDashboard({
  machineNumber,
  userName,
  onLogout,
}: {
  machineNumber: string;
  userName: string;
  onLogout: () => void;
}) {
  const queryClient = useQueryClient();
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [aiProduct, setAiProduct] = useState("");
  const [newPlan, setNewPlan] = useState({
    product_name: "",
    color1: "",
    color2: "",
    quantity: 10,
    unit_quantity: 10,
  });

  // 내일 날짜 기본값
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDate = tomorrow.toISOString().slice(0, 10);

  // 계획 목록 조회
  const { data: plansData, isLoading } = useQuery<{ success: boolean; plans: MachinePlan[]; date: string }>({
    queryKey: ["/api/machine/plans", machineNumber],
    queryFn: async () => {
      const res = await fetch(`/api/machine/plans?machine_number=${machineNumber}&date=${defaultDate}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  // AI 추천 mutation
  const aiMutation = useMutation({
    mutationFn: async (productName: string) => {
      const res = await fetch("/api/ai/production-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machine_number: machineNumber,
          product_name: productName,
          date: defaultDate,
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machine/plans"] });
      setShowAI(false);
      setAiProduct("");
    },
  });

  // 계획 생성 mutation
  const createMutation = useMutation({
    mutationFn: async (plan: any) => {
      const res = await fetch("/api/machine/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...plan,
          machine_number: machineNumber,
          date: defaultDate,
          total: (plan.unit_quantity || 0) * (plan.quantity || 0),
          status: "draft",
        }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machine/plans"] });
      setShowNewPlan(false);
      setNewPlan({ product_name: "", color1: "", color2: "", quantity: 10, unit_quantity: 10 });
    },
  });

  // 적용 mutation
  const applyMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await fetch(`/api/machine/plans/${planId}/apply`, {
        method: "POST",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machine/plans"] });
      alert("생산 계획에 적용되었습니다!");
    },
  });

  // 삭제 mutation
  const deleteMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await fetch(`/api/machine/plans/${planId}`, { method: "DELETE" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/machine/plans"] });
    },
  });

  const plans = plansData?.plans || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "recommended":
        return <Badge className="bg-purple-500">AI 추천</Badge>;
      case "draft":
        return <Badge className="bg-yellow-500">수정중</Badge>;
      case "applied":
        return <Badge className="bg-green-500">적용됨</Badge>;
      case "cancelled":
        return <Badge className="bg-gray-500">취소</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* 헤더 */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold">{machineNumber}</h1>
          <p className="text-sm text-gray-500">{defaultDate} (내일)</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{userName}</span>
          <Button variant="ghost" size="icon" onClick={onLogout}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* 플랜 목록 */}
      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>오늘的计划이 없습니다.</p>
            <p className="text-sm mt-1">AI 추천이나 새 계획을 추가하세요.</p>
          </div>
        ) : (
          plans.map((plan) => (
            <Card key={plan.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-lg">{plan.product_name}</span>
                      {getStatusBadge(plan.status)}
                    </div>
                    <p className="text-sm text-gray-500">
                      {plan.mold_number && `금형: ${plan.mold_number} | `}
                      {plan.color1} {plan.color2 && `/ ${plan.color2}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-600">
                      {plan.quantity * plan.unit_quantity}
                    </p>
                    <p className="text-xs text-gray-500">총계</p>
                  </div>
                </div>

                <div className="text-sm text-gray-600 mb-3 bg-gray-50 p-2 rounded">
                  {plan.quantity}박스 × {plan.unit_quantity}개
                </div>

                {plan.ai_reason && (
                  <div className="text-xs text-purple-600 mb-3 bg-purple-50 p-2 rounded">
                    🤖 {plan.ai_reason}
                  </div>
                )}

                <div className="flex gap-2">
                  {plan.status !== "applied" && (
                    <>
                      <Button
                        size="sm"
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        onClick={() => applyMutation.mutate(plan.id)}
                        disabled={applyMutation.isPending}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        적용
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteMutation.mutate(plan.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  {plan.status === "applied" && (
                    <span className="text-sm text-green-600 flex items-center">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      생산 계획에 등록됨
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 하단 액션 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-3">
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => setShowNewPlan(true)}
          >
            <Plus className="w-4 h-4 mr-1" />
            새 계획
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setShowAI(true)}
          >
            <Sparkles className="w-4 h-4 mr-1" />
            AI 추천
          </Button>
        </div>
      </div>

      {/* 새 계획 Dialog */}
      <Dialog open={showNewPlan} onOpenChange={setShowNewPlan}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 생산 계획</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>제품명</Label>
              <Input
                value={newPlan.product_name}
                onChange={(e) => setNewPlan({ ...newPlan, product_name: e.target.value })}
                placeholder="제품명을 입력하세요"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>색상1</Label>
                <Input
                  value={newPlan.color1}
                  onChange={(e) => setNewPlan({ ...newPlan, color1: e.target.value })}
                  placeholder="색상"
                />
              </div>
              <div>
                <Label>색상2</Label>
                <Input
                  value={newPlan.color2}
                  onChange={(e) => setNewPlan({ ...newPlan, color2: e.target.value })}
                  placeholder="색상2"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>박스 수</Label>
                <Input
                  type="number"
                  value={newPlan.quantity}
                  onChange={(e) => setNewPlan({ ...newPlan, quantity: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>개/박스</Label>
                <Input
                  type="number"
                  value={newPlan.unit_quantity}
                  onChange={(e) => setNewPlan({ ...newPlan, unit_quantity: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => createMutation.mutate(newPlan)}
              disabled={!newPlan.product_name || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              저장
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI 추천 Dialog */}
      <Dialog open={showAI} onOpenChange={setShowAI}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🤖 AI 생산 계획 추천</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              제품을 입력하면 AI가 출고 데이터를 분석하여 적절한 생산량을 추천합니다.
            </p>
            <div>
              <Label>제품명</Label>
              <Input
                value={aiProduct}
                onChange={(e) => setAiProduct(e.target.value)}
                placeholder="예: 토이 아이보리"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => aiMutation.mutate(aiProduct)}
              disabled={!aiProduct || aiMutation.isPending}
            >
              {aiMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  분석 중...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  추천 받기
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 메인 컴포넌트
export default function ProductionApp() {
  const [machineNumber, setMachineNumber] = useState("");
  const [userName, setUserName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // 로컬 스토리지에서 세션 복원
  useEffect(() => {
    const saved = localStorage.getItem("vf_machine_session");
    if (saved) {
      try {
        const session = JSON.parse(saved);
        if (session.machineNumber && session.userName) {
          setMachineNumber(session.machineNumber);
          setUserName(session.userName);
        }
      } catch (e) {
        // invalid JSON
      }
    }
  }, []);

  const handleLogin = async (machine: string, pin: string) => {
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/machine/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ machine_number: machine, pin }),
      });
      const data: LoginResponse = await res.json();

      if (data.success) {
        setMachineNumber(data.machine_number || machine);
        setUserName(data.user_name || "");
        localStorage.setItem(
          "vf_machine_session",
          JSON.stringify({ machineNumber: data.machine_number, userName: data.user_name })
        );
      } else {
        setError(data.message || "로그인 실패");
      }
    } catch (e) {
      setError("서버 연결 실패");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setMachineNumber("");
    setUserName("");
    localStorage.removeItem("vf_machine_session");
  };

  if (!machineNumber) {
    return <MachineLogin onLogin={handleLogin} isLoading={isLoading} error={error} />;
  }

  return <MachineDashboard machineNumber={machineNumber} userName={userName} onLogout={handleLogout} />;
}