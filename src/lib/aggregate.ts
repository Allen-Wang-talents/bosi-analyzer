// =====================================================
// 加权汇总 - 5 维度 → 综合评分 (学历/公司/项目/履历匹配/年龄)
// =====================================================
import type {
  DimensionResult, ScoreResult, Weights, ScoringInput,
} from '@/types';
import { recommend } from './recommend';
import { scoreEducation } from './scoreEducation';
import { scoreCompany } from './scoreCompany';
import { scoreProjects } from './scoreProjects';
import { scoreFit } from './scoreFit';
import { scoreAge } from './scoreAge';

// Allen 2026-08-21: 评分下限 — 任何维度的分数不得低于 50 (兜底分).
//   即使 deal-breaker / 年龄过大 / 信息残缺导致原始分低于 50,
//   也强制 floor 到 50, 保证推荐档位不为"不推荐".
const MIN_DIMENSION_SCORE = 50;

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

  // Floor 50: 任何维度原始分 < 50 强制拉到 50
  const flooredDims: DimensionResult[] = dimensions.map((d) => {
    if (d.score < MIN_DIMENSION_SCORE) {
      return { ...d, score: MIN_DIMENSION_SCORE };
    }
    return d;
  });

  // 更新 dimension 的 weight 字段
  flooredDims.forEach((d) => {
    d.weight = w[d.name];
  });

  const total = flooredDims.reduce((s, d) => s + d.score * w[d.name], 0);
  const roundedTotal = Math.round(total * 10) / 10;

  const recommendation = recommend(roundedTotal);

  return {
    total: roundedTotal,
    dimensions: flooredDims,
    recommendation,
    summary,
    summarySource: 'raw',
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

  const summary = generateSummary(input, dims);
  return aggregateScore(dims, weights, summary);
}

// =====================================================
// 履历匹配度分析（结构化骨架）
//
// 设计原则 (Allen 2026-07-16):
//   1. 必须结合 JD (must/nice) + JobProfile (dealBreakers/niceToHaves) + 候选人项目/技能
//   2. 综合分析候选人项目经验与技能点，不空话
//   3. 每条断言必须可追溯到 matched / missed / evidence 中的具体实体
//   4. 客观优先，避免主观形容词；缺失数据时跳过对应段
//
// 输出三段：整体定位 / 匹配亮点 / 关键差距
// 由 UI 触发「AI 润色」按钮后可被 LLM 二次润色 (summarySource='llm')
// =====================================================
function generateSummary(input: ScoringInput, dims: DimensionResult[]): string {
  const { candidate, jd, profile } = input;

  const totalWeight = (input.weights.education + input.weights.company + input.weights.projects + input.weights.fit + (input.weights.age ?? 0)) || 100;
  const w = {
    education: input.weights.education / totalWeight,
    company: input.weights.company / totalWeight,
    projects: input.weights.projects / totalWeight,
    fit: input.weights.fit / totalWeight,
    age: (input.weights.age ?? 0) / totalWeight,
  };
  const total = dims.reduce((s, d) => s + d.score * w[d.name], 0);
  const roundedTotal = Math.round(total * 10) / 10;
  const rec = recommend(roundedTotal);

  const fitDim = dims.find((d) => d.name === 'fit');
  const projDim = dims.find((d) => d.name === 'projects');
  const compDim = dims.find((d) => d.name === 'company');
  const eduDim = dims.find((d) => d.name === 'education');

  const sections: string[] = [];

  // ===========================================
  // 段一：整体定位
  // ===========================================
  const sorted = [...dims].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const positionParts: string[] = [
    `综合 ${roundedTotal.toFixed(1)} 分（${rec.label}）`,
  ];
  if (top) {
    positionParts.push(`最强维度「${top.label}」${top.score.toFixed(0)} 分`);
  }
  if (bottom && bottom !== top) {
    positionParts.push(`主要短板「${bottom.label}」${bottom.score.toFixed(0)} 分`);
  }
  if (jd?.title) {
    positionParts.push(`对标岗位「${jd.title}」`);
  }
  if (jd?.minYears) {
    positionParts.push(`JD 要求 ${jd.minYears}+ 年，候选人 ${candidate.totalYears.toFixed(1)} 年`);
  }
  sections.push(`【整体定位】\n${positionParts.join('，')}。`);

  // ===========================================
  // 段二：匹配亮点（客观命中事实）
  // ===========================================
  const highlights: string[] = [];

  // JD 必须技能命中
  const mustSkills = jd?.mustHaveSkills ?? [];
  const fitMatched = fitDim?.matched ?? [];
  if (mustSkills.length > 0) {
    const mustHits = mustSkills.filter((s) => fitMatched.includes(s));
    if (mustHits.length > 0) {
      highlights.push(
        `JD 必须技能命中 ${mustHits.length}/${mustSkills.length}：${mustHits.slice(0, 6).join('、')}`
      );
    }
  }

  // JD 加分技能命中
  const niceSkills = jd?.niceToHaveSkills ?? [];
  if (niceSkills.length > 0) {
    const niceHits = niceSkills.filter((s) => fitMatched.includes(s));
    if (niceHits.length > 0) {
      highlights.push(
        `JD 加分技能命中 ${niceHits.length}/${niceSkills.length}：${niceHits.slice(0, 4).join('、')}`
      );
    }
  }

  // 岗位画像加分项命中（来自项目维度 evidence / matched）
  const profileNiceHaves = profile?.niceToHaves ?? [];
  if (profileNiceHaves.length > 0 && projDim) {
    const projectMatched = projDim.matched ?? [];
    const profileHits = profileNiceHaves.filter((s) => projectMatched.includes(s));
    if (profileHits.length > 0) {
      highlights.push(
        `岗位画像加分项命中 ${profileHits.length}/${profileNiceHaves.length}：${profileHits.slice(0, 4).join('、')}`
      );
    }
  }

  // 行业匹配命中
  const industryEvidence = (fitDim?.evidence ?? []).find((e) => e.startsWith('行业匹配'));
  if (industryEvidence && industryEvidence.includes('命中') && jd?.industry) {
    highlights.push(`行业经历命中 JD 行业（${jd.industry}）`);
  }

  // 项目明星 / 影响力信号
  const projectStarEv = (projDim?.evidence ?? []).filter(
    (e) => e.includes('明星项目') || e.includes('影响力信号')
  );
  if (projectStarEv.length > 0) {
    // 保留第一条最具信息量的，去掉末尾的数字标记（如"+10"）
    highlights.push(projectStarEv[0].replace(/\s*[+-]?\d+\s*$/, '').trim());
  }

  // 当前公司 Tier 命中画像目标
  const tierEv = (compDim?.evidence ?? []).find((e) => e.includes('画像目标'));
  if (tierEv) {
    highlights.push(tierEv.replace(/\s*[+-]?\d+\s*$/, '').trim());
  }

  // 学历/学校 tier 突出
  if (eduDim?.score && eduDim.score >= 80) {
    highlights.push(`学历背景：${eduDim.notes ?? ''}`);
  }

  if (highlights.length > 0) {
    sections.push(`【匹配亮点】\n${highlights.slice(0, 5).map((h) => `- ${h}`).join('\n')}`);
  }

  // ===========================================
  // 段三：关键差距（客观未命中事实）
  // ===========================================
  const gaps: string[] = [];

  // JD 必须技能缺失
  if (mustSkills.length > 0) {
    const mustMissed = mustSkills.filter((s) => !fitMatched.includes(s));
    if (mustMissed.length > 0) {
      gaps.push(
        `JD 必须技能未命中 ${mustMissed.length}/${mustSkills.length}：${mustMissed.slice(0, 5).join('、')}`
      );
    }
  }

  // Deal-breaker 命中（一票否决，最高优先级，必须明示）
  const dealBreakerHits = (projDim?.evidence ?? []).filter((e) => e.includes('deal-breaker'));
  if (dealBreakerHits.length > 0) {
    gaps.push(
      `命中岗位一票否决项：${dealBreakerHits
        .map((h) => h.replace(/[+-]?\d+\s*$/, '').replace(/命中 deal-breaker:\s*/, '').trim())
        .join('；')}`
    );
  }

  // 项目维度短板
  if (projDim && projDim.score < 65 && projDim.missed.length > 0) {
    gaps.push(
      `项目维度命中偏少（${projDim.score.toFixed(0)} 分），核心未识别：${projDim.missed.slice(0, 4).join('、')}`
    );
  }

  // 岗位画像加分项均未体现
  if (profileNiceHaves.length > 0 && projDim) {
    const projectMatched = projDim.matched ?? [];
    const profileHits = profileNiceHaves.filter((s) => projectMatched.includes(s));
    if (profileHits.length === 0) {
      gaps.push(`岗位画像加分项均未体现：${profileNiceHaves.slice(0, 4).join('、')}`);
    }
  }

  // 经验年限差距（不足）
  const yearEvidence = (fitDim?.evidence ?? []).find((e) => e.startsWith('经验年限'));
  if (yearEvidence) {
    const m = yearEvidence.match(/候选人\s*([\d.]+)\s*年\s*vs\s*JD\s*要求\s*(\d+)\s*年/);
    if (m && parseFloat(m[1]) < parseFloat(m[2])) {
      gaps.push(`经验年限不足：${m[1]} 年 vs JD 要求 ${m[2]} 年`);
    }
  }

  // 频繁跳槽
  const hopEvidence = (compDim?.evidence ?? []).find((e) => e.includes('频繁跳槽'));
  if (hopEvidence) {
    gaps.push(hopEvidence.replace(/\s*-?\d+\s*$/, '').trim());
  }

  // 学历短板
  if (eduDim?.score && eduDim.score < 60) {
    gaps.push(`学历层次未达预期：${eduDim.notes ?? ''}`);
  }

  // 行业不匹配（来自 evidence 的反例）
  const industryMismatch = (fitDim?.evidence ?? []).find(
    (e) => e.startsWith('行业匹配') && (e.includes('基本符合') || e.includes('未明确'))
  );
  if (industryMismatch && jd?.industry) {
    gaps.push(`行业经历与 JD 行业（${jd.industry}）匹配度偏低`);
  }

  if (gaps.length > 0) {
    sections.push(`【关键差距】\n${gaps.slice(0, 6).map((g) => `- ${g}`).join('\n')}`);
  } else {
    sections.push(`【关键差距】\n- 当前未识别到客观短板（不代表候选人完全匹配，建议人工核对细节）。`);
  }

  return sections.join('\n\n');
}