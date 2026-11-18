// =====================================================
// 履历匹配程度评分
// =====================================================
import type { Candidate, JD, DimensionResult } from '@/types';
import { clamp, intersection } from './normalize';
import { getSparseCount } from './candidateValid';
import { titleLevelMatch } from './titleLevel';

export function scoreFit(
  candidate: Candidate,
  jd: JD | null
): DimensionResult {
  const evidence: string[] = [];
  const matched: string[] = [];
  const missed: string[] = [];

  if (!jd) {
    return {
      name: 'fit',
      label: '履历匹配程度评分',
      score: 0,
      weight: 0.3,
      evidence: ['尚未输入岗位 JD'],
      matched: [],
      missed: ['JD 必填'],
      notes: '请先填写 Module 2 岗位 JD。',
    };
  }

  // Allen 2026-08-21: candidate 信息残缺到无法跑匹配算法 →
  //   直接给中性基础分 50, 不跑匹配算法 (公式自然衰减到 27.5, 会拖累总分)
  //
  // 判定: 4 个关键信号 (skills / workHistory / currentTitle / totalYears) 中
  //   缺失 ≥ 3 个 → 候选人实质信息不足, 跑公式只会得到噪音低分
  const sparseCount = getSparseCount(candidate);
  if (sparseCount >= 3) {
    return {
      name: 'fit',
      label: '履历匹配程度评分',
      score: 50,
      weight: 0.3,
      evidence: [`候选人关键字段缺失 ${sparseCount}/4, 按基础分 50 计`],
      matched: [],
      missed: jd.mustHaveSkills ?? [],
      notes: '候选人简历信息较稀疏, 按基础分 50 计。建议人工补充核心字段后重新评分。',
    };
  }

  // 1. 技能匹配 (40%)
  const jdSkills = [...jd.mustHaveSkills, ...jd.niceToHaveSkills].filter(Boolean);
  const candidateSkills = candidate.skills;
  const matchedSkills = intersection(jdSkills, candidateSkills);
  const skillRatio = jdSkills.length > 0 ? matchedSkills.length / jdSkills.length : 0;
  const skillScore = skillRatio * 100;
  matched.push(...matchedSkills);
  missed.push(...jdSkills.filter((s) => !matchedSkills.includes(s)));
  evidence.push(`技能匹配: ${matchedSkills.length}/${jdSkills.length} (${(skillRatio * 100).toFixed(0)}%)`);

  // 2. 经验年限 (25%)
  const required = jd.minYears;
  const actual = candidate.totalYears;
  let yearScore: number;
  if (required === 0) {
    yearScore = 80;
  } else if (actual >= required) {
    yearScore = clamp(80 + (actual - required) * 4, 0, 100);
  } else {
    yearScore = clamp(Math.max(20, 80 * (actual / required)), 0, 100);
  }
  evidence.push(`经验年限: 候选人 ${actual.toFixed(1)}年 vs JD 要求 ${required}年 → ${yearScore.toFixed(0)}分`);

  // 3. 行业匹配 (20%)
  let industryScore = 60; // 默认
  if (jd.industry) {
    const jdIndustryStr: string = jd.industry;
    const candidateIndustries = new Set(
      candidate.workHistory.map((wh) => wh.industry).filter(Boolean)
    );
    if (candidateIndustries.size === 0) {
      // 兜底: 用公司名模糊匹配
      const jdIndustryLower = jdIndustryStr.toLowerCase();
      const hit = candidate.workHistory.some((wh) => {
        const companyLower = wh.company.toLowerCase();
        return jdIndustryLower.includes(companyLower) || companyLower.includes(jdIndustryLower);
      });
      industryScore = hit ? 85 : 60;
    } else if (Array.from(candidateIndustries).some((i) => (i ?? '').includes(jdIndustryStr) || jdIndustryStr.includes(i ?? ''))) {
      industryScore = 95;
    } else {
      industryScore = 60;
    }
    evidence.push(`行业匹配: ${industryScore >= 85 ? '命中' : '基本符合/未明确'}`);
  } else {
    evidence.push('行业匹配: JD 未指定行业');
  }

  // 4. 职级匹配 (15%)
  const titleScore = titleLevelMatch(candidate.currentTitle ?? '', jd.title ?? '', jd.level) * 100;
  evidence.push(`职级匹配: ${candidate.currentTitle ?? '未识别'} vs ${jd.title} → ${titleScore.toFixed(0)}分`);

  const score = clamp(
    skillScore * 0.4 + yearScore * 0.25 + industryScore * 0.2 + titleScore * 0.15,
    0,
    100
  );

  let notes: string;
  if (score >= 85) {
    notes = `候选人履历与 JD 高度匹配：技能覆盖率 ${(skillRatio * 100).toFixed(0)}%，年限 ${actual.toFixed(1)}/${required} 年，${titleScore >= 80 ? '职级吻合' : '职级接近'}。`;
  } else if (score >= 70) {
    notes = `候选人履历与 JD 基本匹配${skillRatio < 0.5 ? '，但关键技能覆盖率偏低' : ''}。`;
  } else if (score >= 55) {
    notes = `候选人履历与 JD 存在差距${missed.length > 0 ? '，缺 ' + missed.slice(0, 3).join('、') : ''}。`;
  } else {
    notes = `候选人履历与 JD 匹配度低，建议慎重推荐。`;
  }

  return {
    name: 'fit',
    label: '履历匹配程度评分',
    score,
    weight: 0.3,
    evidence,
    matched,
    missed,
    notes,
  };
}
