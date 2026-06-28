// =====================================================
// 履历匹配程度评分
// =====================================================
import type { Candidate, JD, DimensionResult } from '@/types';
import { findMatches } from './match';
import { clamp, intersection } from './normalize';

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

// 职级匹配: 0-1 系数
function titleLevelMatch(candidateTitle: string, jdTitle: string, jdLevel?: string): number {
  if (!candidateTitle || !jdTitle) return 0.7; // 信息不足默认中性
  const c = candidateTitle.toLowerCase();
  const j = jdTitle.toLowerCase();

  // 职级层级映射 (高 -> 低)
  const levelMap: Array<[string, number]> = [
    ['cto', 7], ['ceo', 7], ['vp', 7], ['副总裁', 7],
    ['总监', 6], ['director', 6],
    ['架构师', 5], ['architect', 5], ['tech lead', 5], ['技术负责人', 5],
    ['资深', 4], ['senior', 4], ['高级', 4], ['staff', 4],
    ['leader', 4], ['主管', 4],
    ['中级', 3], ['intermediate', 3],
    ['初级', 2], ['junior', 2],
    ['助理', 1], ['intern', 1], ['实习', 1],
  ];

  function getLevel(title: string): number {
    const tl = title.toLowerCase();
    for (const [kw, lvl] of levelMap) {
      if (tl.includes(kw.toLowerCase())) return lvl;
    }
    return 3; // 未知默认中级
  }

  const cLevel = getLevel(candidateTitle);
  const jLevel = jdLevel ? getLevel(jdLevel) : getLevel(jdTitle);
  const diff = Math.abs(cLevel - jLevel);

  if (diff === 0) return 1.0;
  if (diff === 1) return 0.85;
  if (diff === 2) return 0.65;
  if (diff === 3) return 0.45;
  return 0.25;
}