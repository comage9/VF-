import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Loader2, Square } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import QuickQuestions from './QuickQuestions';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AIChatWidgetProps {
  pageContext?: {
    name: string;
    type: 'vf-outbound' | 'fc-inbound' | 'inventory' | 'production';
  };
  filters?: Record<string, any>;
}

const DEFAULT_QUICK_QUESTIONS = [
  { label: '오늘 판매량', query: '오늘 판매량이 얼마야?' },
  { label: '최다 판매 품목', query: '가장 많이 판매된 품목은 뭐야?' },
  { label: '특이사항', query: '최근 판매에서 특이사항 있어?' },
  { label: '추이 분석', query: '최근 판매 추이 분석해줘' },
];

export default function AIChatWidget({ pageContext, filters }: AIChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Quick question handler
  const handleQuickQuestion = (query: string) => {
    handleSendMessage(query);
  };

  // Stop button handler
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setIsStreaming(false);
      // Add cancelled message
      const cancelMsg: ChatMessage = {
        id: `msg-${Date.now()}-cancelled`,
        role: 'assistant',
        content: '분석이 취소되었습니다.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, cancelMsg]);
    }
  };

  // Send message handler
  const handleSendMessage = async (content: string) => {
    if (!content.trim()) return;

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    setIsStreaming(true);

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          pageContext,
          filters,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error('Failed to get AI response');

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: data.answer || data.message || '죄송합니다. 응답을 가져오지 못했습니다.',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Already handled by cancel
        return;
      }
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: '죄송합니다. AI 서비스에 연결할 수 없습니다. 다시 시도해주세요.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <>
      {/* FAB Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white p-4 rounded-full shadow-lg transition-all duration-300 hover:scale-110"
          aria-label="AI 챗봇 열기"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {/* Chat Widget */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-6rem)] flex flex-col">
          <Card className="h-full flex flex-col shadow-2xl border-2 border-purple-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-t-lg">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                <h3 className="font-semibold">AI 데이터 어시스턴트</h3>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/20"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm">데이터에 대해 궁금한 것을 물어보세요!</p>
                  <QuickQuestions
                    questions={DEFAULT_QUICK_QUESTIONS}
                    onQuestionClick={handleQuickQuestion}
                  />
                </div>
              ) : (
                <>
                  {messages.map(msg => (
                    <ChatMessage key={msg.id} message={msg} />
                  ))}
                  {isLoading && !isStreaming && (
                    <div className="flex items-center gap-2 text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">분석 중...</span>
                    </div>
                  )}
                  {isStreaming && (
                    <div className="flex items-center gap-2 text-purple-600">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleStop}
                        className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Square className="w-4 h-4 mr-1" />
                        중지
                      </Button>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="p-4 border-t">
              <ChatInput onSend={handleSendMessage} disabled={isLoading} />
              {messages.length === 0 && (
                <QuickQuestions
                  questions={DEFAULT_QUICK_QUESTIONS}
                  onQuestionClick={handleQuickQuestion}
                  compact
                />
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
