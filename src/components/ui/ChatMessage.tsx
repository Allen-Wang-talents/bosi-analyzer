// =====================================================
// Chat 消息气泡
// =====================================================
import { motion } from 'framer-motion';
import { User, Sparkles, AlertCircle } from 'lucide-react';
import { cn } from './Card';
import type { ChatMessage as ChatMessageType } from '@/types';

export function ChatMessage({ message }: { message: ChatMessageType }) {
  const isUser = message.role === 'user';
  const isError = message.error;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}
    >
      {!isUser && (
        <div className={cn(
          'shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
          isError ? 'bg-status-red/20 text-status-red' : 'bg-accent-gold/20 text-accent-gold'
        )}>
          {isError ? <AlertCircle className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        </div>
      )}

      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'bg-accent-gold/15 text-fg border border-accent-gold/30'
            : isError
            ? 'bg-status-red/10 text-status-red border border-status-red/30'
            : 'bg-bg-elevated text-fg border border-border'
        )}
      >
        {message.pending ? (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 bg-fg-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="inline-block w-1.5 h-1.5 bg-fg-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="inline-block w-1.5 h-1.5 bg-fg-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            <span className="text-xs text-fg-muted ml-1">AI 思考中...</span>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        )}
      </div>

      {isUser && (
        <div className="shrink-0 w-7 h-7 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted">
          <User className="w-4 h-4" />
        </div>
      )}
    </motion.div>
  );
}