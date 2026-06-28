// =====================================================
// 维度详情卡片 - 展开看依据
// =====================================================
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn, Card } from './Card';
import { ScoreBar } from './ScoreBar';
import type { DimensionResult } from '@/types';

type Props = {
  dimension: DimensionResult;
  defaultExpanded?: boolean;
};

export function DimensionCard({ dimension, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Card className="overflow-hidden">
      <ScoreBar
        label={dimension.label}
        score={dimension.score}
        weight={dimension.weight}
        onClick={() => setExpanded((e) => !e)}
      />
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-3 pb-3 -mt-1 flex items-center justify-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors"
      >
        <span>{expanded ? '收起' : '查看依据'}</span>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border bg-bg-base/30">
              {dimension.notes && (
                <p className="text-sm text-fg leading-relaxed">{dimension.notes}</p>
              )}

              {dimension.evidence.length > 0 && (
                <Section title="评分依据" items={dimension.evidence} variant="bullet" />
              )}

              {dimension.matched.length > 0 && (
                <Section title="已匹配" items={dimension.matched} variant="chip-positive" />
              )}

              {dimension.missed.length > 0 && (
                <Section title="未命中" items={dimension.missed} variant="chip-negative" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function Section({ title, items, variant }: { title: string; items: string[]; variant: 'bullet' | 'chip-positive' | 'chip-negative' }) {
  return (
    <div>
      <h5 className="text-xs font-medium text-fg-muted mb-2">{title}</h5>
      {variant === 'bullet' ? (
        <ul className="space-y-1.5">
          {items.slice(0, 8).map((item, idx) => (
            <li key={idx} className="text-xs text-fg-muted flex gap-2 leading-relaxed">
              <span className="text-accent-gold mt-0.5">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.slice(0, 12).map((item, idx) => (
            <span
              key={idx}
              className={cn(
                'inline-flex items-center px-2 py-0.5 text-xs rounded-md border',
                variant === 'chip-positive'
                  ? 'bg-status-green/10 text-status-green border-status-green/30'
                  : 'bg-status-red/10 text-status-red border-status-red/30'
              )}
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}