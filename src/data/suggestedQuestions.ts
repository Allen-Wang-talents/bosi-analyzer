// =====================================================
// Chat 面板建议问题 (Allen 可在设置中扩展)
// =====================================================

export type SuggestedQuestion = {
  id: string;
  text: string;
  intent: 'education' | 'company' | 'projects' | 'fit' | 'summary' | 'recompute' | 'general';
  icon?: string;
};

export const DEFAULT_SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  {
    id: 'why-education',
    text: '为什么学历评分是这个分数？',
    intent: 'education',
    icon: '🎓',
  },
  {
    id: 'why-company',
    text: '公司背景具体是怎么评的？',
    intent: 'company',
    icon: '🏢',
  },
  {
    id: 'top-projects',
    text: '列出候选人最具亮点的 3 个项目',
    intent: 'projects',
    icon: '⭐',
  },
  {
    id: 'skill-gap',
    text: '哪些 must-have 技能没有匹配上？',
    intent: 'fit',
    icon: '🎯',
  },
  {
    id: 'weak-points',
    text: '候选人最大的短板是什么？',
    intent: 'summary',
    icon: '⚠️',
  },
  {
    id: 'highlight',
    text: '候选人最大的亮点是什么？',
    intent: 'summary',
    icon: '✨',
  },
  {
    id: 'recommendation',
    text: '是否适合推荐给客户？给出依据。',
    intent: 'summary',
    icon: '📋',
  },
  {
    id: 'recompute',
    text: '重新计算（应用最新权重）',
    intent: 'recompute',
    icon: '🔄',
  },
];

export function getQuestionByIntent(intent: string): SuggestedQuestion[] {
  return DEFAULT_SUGGESTED_QUESTIONS.filter((q) => q.intent === intent);
}