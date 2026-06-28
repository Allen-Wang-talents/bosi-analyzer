// =====================================================
// 评分环 - 动画展示综合评分
// =====================================================
import { motion } from 'framer-motion';
import { cn } from './Card';

type ScoreRingProps = {
  score: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
};

export function ScoreRing({ score, size = 160, strokeWidth = 12, showLabel = true, className }: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeScore = Math.max(0, Math.min(100, score));
  const offset = circumference - (safeScore / 100) * circumference;

  const color = getScoreColor(safeScore);

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color.start} />
            <stop offset="100%" stopColor={color.end} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(201, 169, 97, 0.1)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#ringGradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            className="text-4xl font-bold tabular-nums text-fg"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, duration: 0.3 }}
            key={safeScore}
          >
            {Math.round(safeScore)}
          </motion.div>
          <div className="text-xs text-fg-muted mt-0.5">综合评分</div>
        </div>
      )}
    </div>
  );
}

function getScoreColor(score: number): { start: string; end: string } {
  if (score >= 90) return { start: '#EF4444', end: '#F87171' };      // 强烈推荐 - 红
  if (score >= 80) return { start: '#10B981', end: '#34D399' };      // 建议推荐 - 绿
  if (score >= 70) return { start: '#F59E0B', end: '#FBBF24' };      // 可以试试 - 黄
  return { start: '#6B7280', end: '#9CA3AF' };                       // 不建议 - 灰
}