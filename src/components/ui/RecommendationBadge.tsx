// =====================================================
// 推荐档位徽章
// =====================================================
import { Badge } from './Card';
import type { Recommendation } from '@/types';

export function RecommendationBadge({ recommendation, size = 'md' }: { recommendation: Recommendation; size?: 'sm' | 'md' | 'lg' }) {
  const { tier, label, color } = recommendation;

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5 font-semibold',
  };

  return (
    <Badge
      color={color as 'red' | 'green' | 'yellow' | 'gray'}
      variant="soft"
      className={sizeClasses[size]}
    >
      {tierIcon(tier)} {label}
    </Badge>
  );
}

function tierIcon(tier: Recommendation['tier']): string {
  switch (tier) {
    case 'strong': return '🔥';
    case 'recommend': return '✅';
    case 'try': return '⚡';
    case 'skip': return '⛔';
  }
}