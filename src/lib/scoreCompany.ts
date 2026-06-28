// =====================================================
// 公司背景评分
// =====================================================
import type { Candidate, CompanyTier, JobProfile, DimensionResult, Company } from '@/types';
import { resolveCompanyTiers } from './match';
import { clamp } from './normalize';

const TIER_SCORE: Record<number, number> = {
  1: 95, // 头部互联网大厂 + AI 原生头部 + 全球科技巨头
  2: 80, // 其他互联网大厂 + 上一代 AI + 自动驾驶 + 明星 AI native
  3: 60, // 中小互联网 + 小型 AI 创业
  4: 35, // 未识别 / 兜底
};

export function scoreCompany(
  candidate: Candidate,
  profile: JobProfile | null,
  companyTiers: CompanyTier[]
): DimensionResult {
  const evidence: string[] = [];
  const matched: string[] = [];
  const missed: string[] = [];

  if (!candidate.workHistory || candidate.workHistory.length === 0) {
    return {
      name: 'company',
      label: '公司背景评分',
      score: 30,
      weight: 0.25,
      evidence: ['未识别到工作经历'],
      matched: [],
      missed: ['知名公司背景'],
      notes: '简历中未能提取到工作信息，无法评估公司背景。',
    };
  }

  const companyNames = candidate.workHistory.map((wh) => wh.company).filter(Boolean);
  const tierMap = resolveCompanyTiers(companyNames, companyTiers);

  // 标注 workHistory.companyTier
  candidate.workHistory.forEach((wh) => {
    const tier = tierMap.get(wh.company);
    if (tier) wh.companyTier = tier;
  });

  // 加权计算: recency + duration
  const sortedHistory = [...candidate.workHistory].sort((a, b) => {
    const aEnd = a.endYear ?? 9999;
    const bEnd = b.endYear ?? 9999;
    return bEnd - aEnd;
  });

  const weightedScores: number[] = [];
  sortedHistory.forEach((wh, idx) => {
    const tier = tierMap.get(wh.company) ?? 4;
    const recencyWeight = 1.0 - idx * 0.15; // 最近工作权重最高
    const durationWeight = Math.min(wh.durationMonths / 36, 1.0); // < 36 月打折
    const tierScore = TIER_SCORE[tier] ?? 35;
    const weighted = tierScore * Math.max(0.3, recencyWeight) * Math.max(0.3, durationWeight);
    weightedScores.push(weighted);

    const years = (wh.durationMonths / 12).toFixed(1);
    evidence.push(`${wh.company} (Tier ${tier}, ${wh.title || ''}, ${years}年)`);
    matched.push(wh.company);
  });

  let baseScore = weightedScores.length > 0
    ? weightedScores.reduce((s, x) => s + x, 0) / weightedScores.length
    : 35;

  // 跳槽惩罚: 8年内 ≥ 4 段且平均 < 18 月
  const totalMonths = candidate.workHistory.reduce((s, wh) => s + wh.durationMonths, 0);
  const totalYears = totalMonths / 12;
  let hopPenalty = 0;
  if (
    candidate.workHistory.length >= 4 &&
    totalYears <= 8 &&
    totalMonths / candidate.workHistory.length < 18
  ) {
    hopPenalty = -10;
    evidence.push(`检测到频繁跳槽 (${candidate.workHistory.length}段/${totalYears.toFixed(1)}年) -10`);
  }

  // 与 Module 3 目标公司 tier 匹配奖励
  if (profile?.targetCompanyTiers && profile.targetCompanyTiers.length > 0) {
    const currentTier = tierMap.get(candidate.currentCompany ?? '') ?? 4;
    if (profile.targetCompanyTiers.includes(currentTier)) {
      baseScore += 5;
      evidence.push(`当前公司 Tier ${currentTier} 匹配画像目标 +5`);
    }
  }

  let score = baseScore + hopPenalty;
  score = clamp(score, 0, 100);

  // 最高 tier 用于点评 (Tier 1-3 是已识别，4 是兜底)
  const tiers = Array.from(tierMap.values()).filter((t) => t <= 3);
  const bestTier = tiers.length > 0 ? Math.min(...tiers) : 4;
  const tierLabel = (t: number) => TIER_SCORE[t] ? `Tier ${t}` : '未识别';

  // 短板
  if (bestTier >= 3) {
    missed.push('顶级/中大型公司经验');
  }

  let notes: string;
  if (score >= 85) {
    notes = `候选人公司背景突出，最高任职于${tierLabel(bestTier)}，${sortedHistory.length}段经历均位于优质公司。`;
  } else if (score >= 70) {
    notes = `候选人公司背景较好，最高任职于${tierLabel(bestTier)}，整体背书足够。`;
  } else if (score >= 55) {
    notes = `候选人公司背景一般，最佳任职于${tierLabel(bestTier)}，缺乏顶级公司背书。`;
  } else {
    notes = `候选人公司背景偏弱，主要任职于小公司或不知名企业，与岗位期待存在差距。`;
  }

  if (hopPenalty < 0) notes += ' 存在频繁跳槽风险。';

  return {
    name: 'company',
    label: '公司背景评分',
    score,
    weight: 0.25,
    evidence,
    matched,
    missed,
    notes,
  };
}