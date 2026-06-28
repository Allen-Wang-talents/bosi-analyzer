// =====================================================
// Chat 面板 - 用户与 LLM 对话
// =====================================================
import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { cn, Button } from './Card';
import { ChatMessage } from './ChatMessage';
import { DEFAULT_SUGGESTED_QUESTIONS } from '@/data/suggestedQuestions';
import type { ChatMessage as ChatMessageType } from '@/types';

type Props = {
  messages: ChatMessageType[];
  onSend: (question: string) => void;
  onClear?: () => void;
  isSending: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

export function ChatPanel({ messages, onSend, onClear, isSending, disabled, disabledReason }: Props) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || isSending) return;
    onSend(q);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-gold" />
          <h4 className="text-sm font-semibold text-fg">AI 助手</h4>
          <span className="text-[10px] text-fg-subtle">MiniMax M3</span>
        </div>
        {onClear && messages.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-fg-muted hover:text-fg flex items-center gap-1 px-2 py-1 rounded hover:bg-bg-elevated"
          >
            <X className="w-3 h-3" /> 清空
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-[240px] max-h-[400px]">
        {messages.length === 0 ? (
          <div className="text-center text-fg-muted text-xs py-8">
            <p>向 AI 助手提问关于候选人匹配的任何问题</p>
            <p className="mt-1 text-fg-subtle">AI 会基于当前分析数据回答</p>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}
      </div>

      {/* Suggested questions */}
      {messages.length === 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {DEFAULT_SUGGESTED_QUESTIONS.slice(0, 5).map((q) => (
            <button
              key={q.id}
              onClick={() => handleSend(q.text)}
              disabled={disabled || isSending}
              className="text-xs px-2.5 py-1.5 rounded-full bg-bg-elevated border border-border text-fg-muted hover:text-fg hover:border-accent-gold/40 transition-all disabled:opacity-50"
            >
              {q.icon && <span className="mr-1">{q.icon}</span>}
              {q.text}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border p-3">
        {disabled && disabledReason && (
          <p className="text-xs text-status-yellow mb-2">{disabledReason}</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? '请先配置 API Key' : '输入你的问题...'}
            disabled={disabled || isSending}
            className={cn(
              'flex-1 h-10 px-3 text-sm bg-bg-input text-fg border border-border rounded-lg',
              'placeholder:text-fg-subtle',
              'focus:outline-none focus:border-accent-gold/50 focus:ring-1 focus:ring-accent-gold/30',
              'disabled:opacity-50'
            )}
          />
          <Button
            onClick={() => handleSend()}
            disabled={disabled || isSending || !input.trim()}
            size="md"
            loading={isSending}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}