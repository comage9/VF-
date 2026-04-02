import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';

interface QuickQuestion {
  label: string;
  query: string;
}

interface QuickQuestionsProps {
  questions: QuickQuestion[];
  onQuestionClick: (query: string) => void;
  compact?: boolean;
}

export default function QuickQuestions({ questions, onQuestionClick, compact }: QuickQuestionsProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {questions.slice(0, 4).map((q, i) => (
          <Button
            key={i}
            variant="outline"
            size="sm"
            onClick={() => onQuestionClick(q.query)}
            className="text-xs h-7 border-purple-200 text-purple-700 hover:bg-purple-50"
          >
            {q.label}
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
        <MessageSquare className="w-3 h-3" />
        빠른 질문
      </p>
      <div className="grid grid-cols-2 gap-2">
        {questions.map((q, i) => (
          <Button
            key={i}
            variant="outline"
            size="sm"
            onClick={() => onQuestionClick(q.query)}
            className="text-xs justify-start h-auto py-2 px-3 border-purple-200 text-purple-700 hover:bg-purple-50"
          >
            {q.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
