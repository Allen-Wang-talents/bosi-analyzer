// =====================================================
// 评分条 - 展示单个维度分数
// =====================================================
import { motion } from 'framer-motion';
import { cn } from './Card';

type ScoreBarProps = {
  label: string;
  score: number;
  weight?: number;
  onClick?: () => void;
  className?: string;
};

export function ScoreBar({ label, score, weight, onClick, className }: ScoreBarProps) {
  const safeScore = Math.max(0, Math.min(100, score));
  const color = getBarColor(safeScore);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left group p-3 rounded-lg transition-all duration-150',
        'hover:bg-bg-elevated',
        className
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg">{label}</span>
          {weight !== undefined && (
            <span className="text-[10px] text-fg-subtle tabular-nums">权重 {(weight * 100).toFixed(0)}%</span>
          )}
        </div>
        <span className="text-sm font-bold tabular-nums text-fg">{Math.round(safeScore)}</span>
      </div>
      <div className="relative h-1.5 bg-bg-base rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${safeScore}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </button>
  );
}

function getBarColor(score: number): string {
  if (score >= 85) return 'linear-gradient(90deg, #10B981, #34D399)';
  if (score >= 70) return 'linear-gradient(90deg, #C9A961, #E8D4A0)';
  if (score >= 55) return 'linear-gradient(90deg, #F59E0B, #FBBF24)';
  return 'linear-gradient(90deg, #6B7280, #9CA3AF)';
}