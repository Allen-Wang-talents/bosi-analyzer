// =====================================================
// 加权汇总 - 5 维度 → 综合评分 (学历/公司/项目/履历匹配/年龄)
// =====================================================
import type { DimensionResult, ScoreResult, Weights, Recommendation, ScoringInput } from '@/types';
import { recommend } from './recommend';
import { scoreEducation } from './scoreEducation';
import { scoreCompany } from './scoreCompany';
import { scoreProjects } from './scoreProjects';
import { scoreFit } from './scoreFit';
import { scoreAge } from './scoreAge';

export function aggregateScore(
  dimensions: DimensionResult[],
  weights: Weights,
  summary: string
): ScoreResult {
  const totalWeight = weights.education + weights.company + weights.projects + weights.fit + (weights.age ?? 0);
  if (Math.abs(totalWeight - 100) > 0.5) {
    console.warn(`权重总和不为 100: ${totalWeight}`);
  }

  // 归一化权重 (0-1)
  const w = {
    education: weights.education / 100,
    company: weights.company / 100,
    projects: weights.projects / 100,
    fit: weights.fit / 100,
    age: (weights.age ?? 0) / 100,
  };

  // 更新 dimension 的 weight 字段
  dimensions.forEach((d) => {
    d.weight = w[d.name];
  });

  const total = dimensions.reduce((s, d) => s + d.score * w[d.name], 0);
  const roundedTotal = Math.round(total * 10) / 10;

  const recommendation = recommend(roundedTotal);

  return {
    total: roundedTotal,
    dimensions,
    recommendation,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

// 主入口: 给定完整输入，跑全套评分
export function runFullScoring(input: ScoringInput): ScoreResult {
  const { candidate, jd, profile, schoolTiers, companyTiers, weights } = input;

  const dims = [
    scoreEducation(candidate, jd, schoolTiers),
    scoreCompany(candidate, profile, companyTiers),
    scoreProjects(candidate, jd, profile),
    scoreFit(candidate, jd),
    scoreAge(candidate),
  ];

  const summary = generateSummary(dims);
  return aggregateScore(dims, weights, summary);
}

// 综合 4 维度 notes 生成自然语言摘要
function generateSummary(dims: DimensionResult[]): string {
  const sorted = [...dims].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];

  const lines: string[] = [];

  lines.push(`候选人综合表现${top.score >= 80 ? '优秀' : top.score >= 65 ? '良好' : '一般'}，最强维度为「${top.label}」（${top.score.toFixed(0)} 分），相对薄弱的是「${bottom.label}」（${bottom.score.toFixed(0)} 分）。`);

  const highlights = sorted.filter((d) => d.score >= 80).map((d) => d.notes);
  if (highlights.length > 0) {
    lines.push(`核心亮点：${highlights[0]}`);
  }

  const weaknesses = sorted.filter((d) => d.score < 65).map((d) => d.notes);
  if (weaknesses.length > 0) {
    lines.push(`关键短板：${weaknesses[0]}`);
  }

  return lines.join('\n\n');
}