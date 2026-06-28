// =====================================================
// 学历评分
// =====================================================
import type { Candidate, SchoolTier, DimensionResult, JD } from '@/types';
import { resolveSchoolTiers } from './match';
import { clamp } from './normalize';

// Allen 8 级学校 tier 体系 - 等级 1 最高，等级 8 最低
const TIER_BASE_SCORE: Record<number, number> = {
  1: 95,  // 清北姚班/图灵班 + QS50 CS 强校
  2: 88,  // 华东五校
  3: 80,  // C9（清北华五之外）
  4: 70,  // 计算机强校 985
  5: 60,  // 两电一邮
  6: 50,  // 新型顶尖院校
  7: 40,  // 其他 985/211
  8: 25,  // 普通本科
  9: 20,  // 未识别（兜底）
};

const DEGREE_BONUS: Record<string, number> = {
  博士: 5,
  硕士: 3,
  本科: 0,
  专科: -10,
  其他: 0,
};

export function scoreEducation(
  candidate: Candidate,
  jd: JD | null,
  schoolTiers: SchoolTier[]
): DimensionResult {
  const evidence: string[] = [];
  const matched: string[] = [];
  const missed: string[] = [];

  if (!candidate.education || candidate.education.length === 0) {
    return {
      name: 'education',
      label: '学历评分',
      score: 30,
      weight: 0.2,
      evidence: ['未识别到教育经历'],
      matched: [],
      missed: ['最高学历', '毕业院校'],
      notes: '简历中未能提取到教育信息，建议人工补充。',
    };
  }

  const schoolNames = candidate.education.map((e) => e.school).filter(Boolean);
  const tierMap = resolveSchoolTiers(schoolNames, schoolTiers);

  // 更新 candidates 的 schoolTier
  candidate.education.forEach((edu) => {
    const tier = tierMap.get(edu.school);
    if (tier) edu.schoolTier = tier;
  });

  // 取最高 tier (数字最小)
  const tiers = Array.from(tierMap.values());
  const bestTier = tiers.length > 0 ? Math.min(...tiers) : 9;

  // 取最高学位
  const degrees = candidate.education.map((e) => e.degree);
  const degreeOrder: Record<string, number> = { '博士': 4, '硕士': 3, '本科': 2, '专科': 1, '其他': 0 };
  const bestDegree = degrees.reduce((best, cur) =>
    (degreeOrder[cur] ?? 0) > (degreeOrder[best] ?? 0) ? cur : best,
    '其他'
  );

  const baseScore = TIER_BASE_SCORE[bestTier] ?? TIER_BASE_SCORE[9];
  const degreeBonus = DEGREE_BONUS[bestDegree] ?? 0;

  // 行业相关性 (专业匹配 JD 行业)
  let relevanceBonus = 0;
  let relevantMajor: string | null = null;
  if (jd?.industry) {
    const jdIndustryLower = jd.industry.toLowerCase();
    for (const edu of candidate.education) {
      if (!edu.major) continue;
      const majorLower = edu.major.toLowerCase();
      // 简单关键词匹配: 计算机/软件/CS/互联网 → 计算机
      if (
        (jdIndustryLower.includes('互联网') || jdIndustryLower.includes('it') || jdIndustryLower.includes('软件') || jdIndustryLower.includes('科技')) &&
        (majorLower.includes('计算机') || majorLower.includes('软件') || majorLower.includes('信息') || majorLower.includes('cs') || majorLower.includes('电子'))
      ) {
        relevanceBonus = 5;
        relevantMajor = edu.major;
        break;
      }
      if (jdIndustryLower.includes('金融') && majorLower.includes('金融')) {
        relevanceBonus = 5;
        relevantMajor = edu.major;
        break;
      }
    }
  }

  let score = baseScore + degreeBonus + relevanceBonus;
  score = clamp(score, 0, 100);

  // 证据
  candidate.education.forEach((edu) => {
    if (!edu.school) return;
    const tier = tierMap.get(edu.school);
    const tierLabel = tier ? `${edu.school} (Tier ${tier})` : edu.school;
    evidence.push(`${edu.school} · ${edu.degree}${edu.major ? ' · ' + edu.major : ''}`);
    matched.push(tierLabel);
  });

  if (relevantMajor) {
    evidence.push(`专业 ${relevantMajor} 与岗位行业相关 (+5)`);
  }

  if (bestDegree === '博士') evidence.push('博士学位 (+5)');
  else if (bestDegree === '硕士') evidence.push('硕士学位 (+3)');
  else if (bestDegree === '专科') evidence.push('专科学历 (-10)');

  // 期望学校 (如果 JD 指定了目标学校 tier 但候选人不匹配)
  if (jd?.industry) {
    if (bestTier >= 4) {
      missed.push('顶尖/头部院校背景');
    }
  }

  let notes: string;
  if (score >= 85) {
    notes = `候选人学历层次突出（${bestDegree} / Tier ${bestTier}），符合甚至超出岗位预期。`;
  } else if (score >= 70) {
    notes = `候选人学历达到基本要求（${bestDegree} / Tier ${bestTier}），${relevanceBonus ? '专业与岗位高度匹配' : '专业相关度一般'}。`;
  } else if (score >= 55) {
    notes = `候选人学历基本符合（${bestDegree} / Tier ${bestTier}），但院校或专业相关性略有不足。`;
  } else {
    notes = `候选人学历层次偏低（${bestDegree} / Tier ${bestTier}），与岗位要求存在差距。`;
  }

  return {
    name: 'education',
    label: '学历评分',
    score,
    weight: 0.2,
    evidence,
    matched,
    missed,
    notes,
  };
}