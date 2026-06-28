// =====================================================
// 评分 → 推荐档位
// =====================================================
import type { Recommendation } from '@/types';

export function recommend(score: number): Recommendation {
  if (score >= 90) {
    return {
      tier: 'strong',
      label: '强烈推荐',
      color: 'red',
      reason: '候选人综合表现非常突出，建议优先推荐给客户。',
    };
  }
  if (score >= 80) {
    return {
      tier: 'recommend',
      label: '建议推荐给客户',
      color: 'green',
      reason: '候选人综合表现良好，达到岗位基本要求。',
    };
  }
  if (score >= 70) {
    return {
      tier: 'try',
      label: '可以推荐试试',
      color: 'yellow',
      reason: '候选人具备一定潜力，但存在短板，建议先和客户对齐预期。',
    };
  }
  return {
    tier: 'skip',
    label: '不建议推荐',
    color: 'gray',
    reason: '候选人综合表现未达岗位基本要求，建议暂不推荐。',
  };
}