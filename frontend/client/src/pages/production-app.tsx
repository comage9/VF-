import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, Plus, Sparkles, LogOut, Trash2, Send } from "lucide-react";
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
  employee_number?: string;
  machines?: string[];
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

// 사원번호 + PIN 입력 화면
function EmployeeLogin({
  onLogin,
  isLoading,
  error,
}: {
  onLogin: (employeeNumber: string, pin: string) => void;
  isLoading: boolean;
  error: string;
}) {
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [pin, setPin] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (employeeNumber && pin.length >= 4) {
      onLogin(employeeNumber, pin);
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
          <p className="text-gray-500 mt-1">사원번호와 PIN을 입력하세요</p>
        </div>

        <Card className="mb-4">
          <CardContent className="p-4">
            <Label className="text-sm font-medium mb-3 block">사원번호</Label>
            <Input
              type="text"
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              placeholder="예: 1, 2, 3, 8, 12..."
              className="text-center text-lg font-bold"
            />
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
          disabled={!employeeNumber || pin.length < 4 || isLoading}
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
  const [showAIChat, setShowAIChat] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<MachinePlan | null>(null);
  const [chatMessages, setChatMessages] = useState<{role: string; content: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
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

  // 계획 생성 mutation
  const createMutation = useMutation({
    mutationFn: async (plan: Record<string, unknown>) => {
      const res = await fetch("/api/machine/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...plan,
          machine_number: machineNumber,
          date: defaultDate,
          total: ((plan.unit_quantity as number) || 0) * ((plan.quantity as number) || 0),
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

  // AI 챗 제출
  const handleChatSubmit = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    try {
      const response = await fetch("/api/ai/production-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          machine_number: machineNumber,
          date: defaultDate,
        }),
      });

      const data = await response.json();

      if (data.success && data.action === 'created') {
        // 계획이 생성됨
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ "${data.plan.product_name}" 계획을 추가했습니다!\n\n` +
            `- 수량: ${data.plan.quantity}박스 × ${data.plan.unit_quantity}개 = ${data.plan.total}개\n` +
            `- 색상: ${data.plan.color1} ${data.plan.color2 ? '/ ' + data.plan.color2 : ''}\n\n` +
            `"적용" 버튼을 누르면 생산 계획에 등록됩니다.`
        }]);
        queryClient.invalidateQueries({ queryKey: ["/api/machine/plans"] });
      } else if (data.success && data.action === 'info') {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: data.message || '알 수 없는 응답입니다.' }]);
      }
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '서버 연결 실패. 다시 시도해주세요.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

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
            <p>오늘의 계획이 없습니다.</p>
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
                        onClick={() => { setPlanToDelete(plan); setShowDeleteConfirm(true); }}
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
            onClick={() => setShowAIChat(true)}
          >
            <Sparkles className="w-4 h-4 mr-1" />
            AI 추천
          </Button>
        </div>
      </div>

      {/* 새 계획 Dialog */}
      <Dialog open={showNewPlan} onOpenChange={setShowNewPlan}>
        <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-slate-100 shadow-2xl">
          <DialogHeader className="border-b border-slate-800 pb-4 mb-4">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-blue-400" />
              새 생산 계획
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label className="text-slate-400 text-sm font-semibold ml-1">제품명</Label>
              <Input
                value={newPlan.product_name}
                onChange={(e) => setNewPlan({ ...newPlan, product_name: e.target.value })}
                placeholder="제품명을 입력하세요"
                className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20 h-11"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-400 text-sm font-semibold ml-1">색상1</Label>
                <Input
                  value={newPlan.color1}
                  onChange={(e) => setNewPlan({ ...newPlan, color1: e.target.value })}
                  placeholder="색상 입력"
                  className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400 text-sm font-semibold ml-1">색상2</Label>
                <Input
                  value={newPlan.color2}
                  onChange={(e) => setNewPlan({ ...newPlan, color2: e.target.value })}
                  placeholder="(선택)"
                  className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 h-11"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-400 text-sm font-semibold ml-1">박스 수</Label>
                <Input
                  type="number"
                  value={newPlan.quantity}
                  onChange={(e) => setNewPlan({ ...newPlan, quantity: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800/50 border-slate-700 text-white focus:border-blue-500 h-11"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-400 text-sm font-semibold ml-1">개/박스</Label>
                <Input
                  type="number"
                  value={newPlan.unit_quantity}
                  onChange={(e) => setNewPlan({ ...newPlan, unit_quantity: parseInt(e.target.value) || 0 })}
                  className="bg-slate-800/50 border-slate-700 text-white focus:border-blue-500 h-11"
                />
              </div>
            </div>
          </div>
          <div className="pt-4 mt-2">
            <Button
              className="w-full py-6 text-lg font-bold bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all"
              onClick={() => createMutation.mutate(newPlan)}
              disabled={!newPlan.product_name || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "저장하기"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI 챗bots Dialog */}
      <Dialog open={showAIChat} onOpenChange={setShowAIChat}>
        <DialogContent className="h-[90vh] sm:max-w-[500px] flex flex-col p-0 bg-slate-900 border-slate-800 shadow-2xl">
          <DialogHeader className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm">
            <DialogTitle className="text-xl font-bold flex items-center gap-2 text-white">
              <Sparkles className="w-5 h-5 text-purple-400" />
              AI 생산 계획 도우미
            </DialogTitle>
          </DialogHeader>

          {/* 챗 메시지 영역 */}
          <div className="flex-1 overflow-y-auto space-y-4 p-4 scroll-smooth">
            {chatMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-8">
                <div className="w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center mb-4">
                  <Sparkles className="w-8 h-8 text-purple-500" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">무엇을 도와드릴까요?</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  "4번 기계에 토이 아이보리 추가해줘"와 같이<br />자연어로 지시하면 AI가 최적의 수량을 추천합니다.
                </p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm
                    ${msg.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none' 
                      : 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700'
                    }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 border border-slate-700 p-3 rounded-2xl rounded-tl-none flex items-center gap-3">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce"></span>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">AI가 분석 중...</span>
                </div>
              </div>
            )}
          </div>

          {/* 챗 입력 영역 */}
          <div className="p-4 border-t border-slate-800 bg-slate-900/50">
            <div className="relative">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="예: 4번 기계에 토이 아이보리 추가해줘"
                autoFocus
                className="bg-slate-800/80 border-slate-700 text-white pr-12 py-6 rounded-xl placeholder:text-slate-500 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isChatLoading && chatInput.trim()) {
                    handleChatSubmit();
                  }
                }}
              />
              <Button 
                onClick={handleChatSubmit} 
                className="absolute right-1.5 top-1.5 w-10 h-10 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:opacity-50 transition-all"
                disabled={isChatLoading || !chatInput.trim()}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 text-center">
              AI는 마스터 데이터와 과거 실적을 기반으로 수량을 제안합니다.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* 삭제确认 Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-[325px] bg-slate-900 border-slate-800 text-slate-100 shadow-2xl">
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl font-bold text-white">
              계획 삭제
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center">
            <p className="text-slate-300 mb-4">
              다음 계획을 삭제하시겠습니까?
            </p>
            {planToDelete && (
              <div className="bg-slate-800 p-3 rounded-lg text-left">
                <p className="font-bold text-white">{planToDelete.product_name}</p>
                <p className="text-sm text-slate-400">
                  {planToDelete.color1} | {planToDelete.quantity} × {planToDelete.unit_quantity} = {planToDelete.quantity * planToDelete.unit_quantity}개
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              className="flex-1 bg-slate-700 hover:bg-slate-600"
              onClick={() => { setShowDeleteConfirm(false); setPlanToDelete(null); }}
            >
              취소
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (planToDelete) {
                  deleteMutation.mutate(planToDelete.id);
                }
                setShowDeleteConfirm(false);
                setPlanToDelete(null);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// 메인 컴포넌트
export default function ProductionApp() {
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [userName, setUserName] = useState("");
  const [machines, setMachines] = useState<string[]>([]);
  const [selectedMachine, setSelectedMachine] = useState("");
  const [showMachineSelect, setShowMachineSelect] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // 로컬 스토리지에서 세션 복원
  useEffect(() => {
    const saved = localStorage.getItem("vf_machine_session");
    if (saved) {
      try {
        const session = JSON.parse(saved);
        if (session.employeeNumber && session.machineNumber) {
          setEmployeeNumber(session.employeeNumber);
          setUserName(session.userName);
          setSelectedMachine(session.machineNumber);
        }
      } catch (e) {
        // invalid JSON
      }
    }
  }, []);

  const handleLogin = async (empNo: string, pin: string) => {
    setIsLoading(true);
    setError("");

    try {
      const res = await fetch("/api/machine/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_number: empNo, pin }),
      });
      const data: LoginResponse = await res.json();

      if (data.success) {
        setEmployeeNumber(data.employee_number || empNo);
        setUserName(data.user_name || "");
        setMachines(data.machines || []);

        // 복수 기계면 선택 화면으로, 단일 기계면 바로 진행
        if (data.machines && data.machines.length > 1) {
          setShowMachineSelect(true);
        } else if (data.machines && data.machines.length === 1) {
          setSelectedMachine(data.machines[0]);
          localStorage.setItem(
            "vf_machine_session",
            JSON.stringify({
              employeeNumber: data.employee_number,
              machineNumber: data.machines[0],
              userName: data.user_name
            })
          );
        }
      } else {
        setError(data.message || "로그인 실패");
      }
    } catch (e) {
      setError("서버 연결 실패");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMachineSelect = (machine: string) => {
    setSelectedMachine(machine);
    localStorage.setItem(
      "vf_machine_session",
      JSON.stringify({
        employeeNumber,
        machineNumber: machine,
        userName
      })
    );
    setShowMachineSelect(false);
  };

  const handleLogout = () => {
    setEmployeeNumber("");
    setUserName("");
    setMachines([]);
    setSelectedMachine("");
    setShowMachineSelect(false);
    localStorage.removeItem("vf_machine_session");
  };

  // 기계 선택 화면 (복수 기계 보유 시)
  if (showMachineSelect && machines.length > 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4">
        <div className="max-w-sm mx-auto">
          <div className="text-center mb-8 pt-8">
            <h1 className="text-2xl font-bold text-gray-900">기계 선택</h1>
            <p className="text-gray-500 mt-1">{userName}님, 사용할 기계를 선택하세요</p>
          </div>

          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-3">
                {machines.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleMachineSelect(m)}
                    className="p-4 rounded-lg border-2 text-center hover:border-blue-500 hover:bg-blue-50 transition-all"
                  >
                    <span className="text-xl font-bold">{m}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" className="w-full mt-4" onClick={handleLogout}>
            로그아웃
          </Button>
        </div>
      </div>
    );
  }

  if (!selectedMachine) {
    return <EmployeeLogin onLogin={handleLogin} isLoading={isLoading} error={error} />;
  }

  return <MachineDashboard machineNumber={selectedMachine} userName={userName} onLogout={handleLogout} />;
}