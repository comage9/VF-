import { Avatar } from '@/components/ui/avatar';
import { User, Bot } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

interface ChatMessageProps {
  message: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  };
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <Avatar className={`w-8 h-8 ${isUser ? 'bg-blue-500' : 'bg-purple-500'}`}>
        {isUser ? (
          <User className="w-5 h-5 text-white p-1" />
        ) : (
          <Bot className="w-5 h-5 text-white p-1" />
        )}
      </Avatar>

      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[80%]`}>
        <div
          className={`px-4 py-2 rounded-2xl ${
            isUser
              ? 'bg-blue-500 text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-bl-sm'
          }`}
        >
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <span className="text-[10px] text-gray-400 mt-1">
          {formatDistanceToNow(message.timestamp, { addSuffix: true, locale: ko })}
        </span>
      </div>
    </div>
  );
}
