// =====================================================
// 明星项目经验评分
// =====================================================
import type { Candidate, JD, JobProfile, DimensionResult } from '@/types';
import { findMatches, matchRatio } from './match';
import { clamp, normalize } from './normalize';
import { IMPACT_SIGNAL_KEYWORDS } from '@/data/defaultKeywords';
import { STAR_PROJECTS, findCompanyByProduct, getAllStarKeywords } from '@/data/starProjects';

export function scoreProjects(
  candidate: Candidate,
  jd: JD | null,
  profile: JobProfile | null
): DimensionResult {
  const evidence: string[] = [];
  const matched: string[] = [];
  const missed: string[] = [];

  // 收集关键词集
  const mustKeywords = new Set<string>();
  const bonusKeywords = new Set<string>();

  if (jd) {
    jd.mustHaveSkills.forEach((s) => mustKeywords.add(s));
    jd.niceToHaveSkills.forEach((s) => mustKeywords.add(s)); // nice 进 must 权重
    jd.responsibilities.forEach((s) => bonusKeywords.add(s));
  }
  if (profile) {
    profile.niceToHaves.forEach((s) => mustKeywords.add(s));
    profile.dealBreakers.forEach((s) => mustKeywords.add(s)); // deal-breaker 也参与匹配识别
  }

  const mustArr = Array.from(mustKeywords).filter(Boolean);
  const bonusArr = Array.from(bonusKeywords).filter(Boolean);

  if (!candidate.projects || candidate.projects.length === 0) {
    return {
      name: 'projects',
      label: '明星项目经验评分',
      score: 40,
      weight: 0.25,
      evidence: ['未识别到项目经验'],
      matched: [],
      missed: ['项目经验'],
      notes: '简历中未能提取到项目信息，建议人工补充项目细节。',
    };
  }

  // 对每个项目做命中分析
  const projectHits: Array<{
    project: typeof candidate.projects[0];
    matchedCount: number;
    hits: string[];
    impactScore: number;
    starHits: Array<{ product: string; company: string }>;
  }> = [];

  const starKeywords = getAllStarKeywords();

  for (const proj of candidate.projects) {
    const text = `${proj.name} ${proj.role ?? ''} ${proj.description} ${(proj.highlights ?? []).join(' ')}`;
    const normText = normalize(text);

    const mustHits = findMatches(text, mustArr);
    const bonusHits = findMatches(text, bonusArr);
    const allHits = [...mustHits, ...bonusHits];

    // 明星项目命中 (Allen 提供的产品/校招种子词)
    const starHits: Array<{ product: string; company: string }> = [];
    const seenStar = new Set<string>();
    for (const sp of STAR_PROJECTS) {
      const allNames = [sp.product, ...(sp.aliases ?? [])];
      for (const name of allNames) {
        if (!name) continue;
        if (normText.includes(normalize(name)) && !seenStar.has(sp.product)) {
          seenStar.add(sp.product);
          starHits.push({ product: sp.product, company: sp.company });
          break;
        }
      }
    }

    // 影响力信号
    let impactScore = 0;
    const impactHits: string[] = [];
    for (const sig of IMPACT_SIGNAL_KEYWORDS) {
      if (text.includes(sig)) {
        impactHits.push(sig);
        impactScore += 1.5;
      }
    }

    projectHits.push({
      project: proj,
      matchedCount: allHits.length + starHits.length,
      hits: allHits,
      impactScore,
      starHits,
    });
  }

  // 计算总分
  let totalScore = 0;
  let totalPossible = mustArr.length * 2.0 + bonusArr.length * 1.0;

  if (totalPossible === 0) {
    totalPossible = candidate.projects.length * 3; // 兜底
  }

  for (const ph of projectHits) {
    const mustCount = ph.hits.filter((h) => mustArr.includes(h)).length;
    const bonusCount = ph.hits.filter((h) => bonusArr.includes(h)).length;
    const projectScore = mustCount * 2.0 + bonusCount * 1.0 + ph.impactScore + ph.starHits.length * 3.0;
    totalScore += projectScore;
  }

  let baseScore = totalPossible > 0 ? (totalScore / totalPossible) * 100 : 0;
  baseScore = clamp(baseScore, 0, 100);

  // 明星项目加成 (基于 JD 关键词命中)
  const starProjects = projectHits.filter((ph) => ph.matchedCount >= 2);
  let starBonus = 0;
  if (starProjects.length >= 2) starBonus = 8;
  else if (starProjects.length >= 1) starBonus = 4;

  // 行业明星项目额外加成 (Allen 种子词)
  const totalStarHits = projectHits.reduce((s, ph) => s + ph.starHits.length, 0);
  let industryStarBonus = 0;
  if (totalStarHits >= 3) industryStarBonus = 10;
  else if (totalStarHits >= 1) industryStarBonus = 5;

  // Deal-breaker 惩罚
  let dealBreakerPenalty = 0;
  if (profile?.dealBreakers && profile.dealBreakers.length > 0) {
    const fullText = candidate.projects.map((p) => `${p.name} ${p.description}`).join(' ');
    for (const db of profile.dealBreakers) {
      if (fullText.includes(db)) {
        dealBreakerPenalty -= 15;
        evidence.push(`命中 deal-breaker: ${db} -15`);
      }
    }
  }

  let score = baseScore + starBonus + industryStarBonus + dealBreakerPenalty;
  score = clamp(score, 0, 100);

  // 证据
  if (starProjects.length > 0) {
    evidence.push(`识别到 ${starProjects.length} 个明星项目（命中 ≥2 关键词）`);
  }
  if (totalStarHits > 0) {
    const starList = projectHits
      .flatMap((ph) => ph.starHits.map((s) => `${s.company} · ${s.product}`))
      .join('、');
    evidence.push(`行业明星项目命中 ${totalStarHits} 个：${starList}（+${industryStarBonus}）`);
  }
  const allImpactHits = projectHits.flatMap((ph) => ph.impactScore > 0 ? [`${ph.project.name}: 影响力信号`] : []);
  if (allImpactHits.length > 0) {
    evidence.push(`影响力信号：${allImpactHits.length} 个项目有规模/主导等关键信号`);
  }

  // 收集所有匹配/未匹配
  const matchedSet = new Set<string>();
  for (const ph of projectHits) {
    for (const h of ph.hits) matchedSet.add(h);
  }
  matched.push(...Array.from(matchedSet));

  if (jd) {
    const jdMatched = findMatches(candidate.projects.map((p) => p.description).join(' '), jd.mustHaveSkills);
    const jdUnmatched = jd.mustHaveSkills.filter((s) => !jdMatched.includes(s));
    missed.push(...jdUnmatched);
  }

  let notes: string;
  if (score >= 80) {
    notes = `项目经验与岗位高度匹配，${starProjects.length >= 1 ? `识别到 ${starProjects.length} 个亮点项目` : ''}。`;
  } else if (score >= 65) {
    notes = `项目经验与岗位基本匹配，${starProjects.length >= 1 ? '有亮点项目' : '亮点项目较少'}。`;
  } else if (score >= 50) {
    notes = `项目经验与岗位匹配度一般，${missed.length > 0 ? `缺少 ${missed.slice(0, 2).join('、')} 等核心关键词命中` : '需补充项目细节'}。`;
  } else {
    notes = `项目经验与岗位匹配度低，${missed.length > 0 ? `未命中 ${missed.slice(0, 3).join('、')} 等关键要求` : '建议人工复核'}。`;
  }

  if (dealBreakerPenalty < 0) notes += ' 检测到 deal-breaker 命中，请人工复核。';

  return {
    name: 'projects',
    label: '明星项目经验评分',
    score,
    weight: 0.25,
    evidence,
    matched,
    missed,
    notes,
  };
}