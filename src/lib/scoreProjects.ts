// =====================================================
// 明星项目经验评分
// =====================================================
//
// Allen 2026-08-21 重写评分逻辑:
//   - 没有明星项目经验 (没 projects) → 50 分兜底
//   - 有项目但无明星项目命中 → 50 + JD/影响力酌情, 上限 70
//   - 有明星项目命中 → 60 + 含金量 + 参与贡献度 + 规模 酌情, 上限 100
//
//   含金量 (基于 STAR_PROJECTS):
//     - 校招/实习明星计划 (program='校招'/'实习'): +15/个, 顶级
//     - Tier 1 公司明星项目: +8/个
//     - 其他公司明星项目: +5/个
//     上限 25
//
//   参与贡献度 (基于项目文本):
//     - 主导/从0到1/技术负责人/Owner/架构师: +10 (项目最强级)
//     - 核心成员/核心贡献/技术负责人: +5
//     - 参与/负责: +2
//     上限 10
//
//   规模信号:
//     - 亿级/千万级 DAU: +5
//     - 百万级 DAU: +3
//
//   Deal-breaker 惩罚保留: 每个 -15
// =====================================================
import type { Candidate, JD, JobProfile, DimensionResult } from '@/types';
import { findMatches } from './match';
import { clamp, normalize } from './normalize';
import { IMPACT_SIGNAL_KEYWORDS } from '@/data/defaultKeywords';
import { STAR_PROJECTS, findCompanyByProduct, getAllStarKeywords } from '@/data/starProjects';

// Tier 1 公司 (匹配 scoreCompany.ts 中 TIER_SCORE=95 的公司, 仅取国内常见)
const TIER1_STAR_COMPANIES = new Set([
  '字节跳动', '阿里巴巴', '腾讯', '百度', '华为', '美团', '京东', '小米', '快手',
  'DeepSeek', '深度求索', 'Kimi', '月之暗面', 'MiniMax', '阶跃星辰', '智谱',
  '谷歌', 'Google', 'Meta', 'OpenAI', 'Anthropic', '微软', 'Microsoft',
  '苹果', 'Apple', '亚马逊', 'Amazon', 'AWS',
]);

// 参与贡献度判定 (按优先级匹配最强级别)
const CONTRIBUTION_PATTERNS: Array<{ re: RegExp; bonus: number; label: string }> = [
  { re: /(主导|从\s*0\s*到\s*1|0\s*到\s*1|0-1|0→1|技术\s*负责人|Tech\s*Lead|架构师|Owner|项目\s*Owner)/i, bonus: 10, label: '主导/技术负责人' },
  { re: /(核心\s*成员|核心\s*贡献|核心\s*开发|技术\s*Owner|核心\s*Owner)/i, bonus: 5, label: '核心成员/核心贡献' },
  { re: /(参与|负责|协助|开发|实现)/i, bonus: 2, label: '参与/负责' },
];

// 规模信号
const SCALE_PATTERNS: Array<{ re: RegExp; bonus: number; label: string }> = [
  { re: /(亿级|千万级|亿\s*DAU|千万\s*DAU|亿\s*用户|千万\s*用户)/i, bonus: 5, label: '亿级/千万级' },
  { re: /(百万级|百万\s*DAU|百万\s*用户)/i, bonus: 3, label: '百万级' },
];

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
    profile.dealBreakers.forEach((s) => mustKeywords.add(s));
  }

  const mustArr = Array.from(mustKeywords).filter(Boolean);
  const bonusArr = Array.from(bonusKeywords).filter(Boolean);

  // Allen 2026-08-21: 无项目经验 → 50 分兜底 (Allen 明确要求, 之前是 40)
  if (!candidate.projects || candidate.projects.length === 0) {
    return {
      name: 'projects',
      label: '明星项目经验评分',
      score: 50,
      weight: 0.25,
      evidence: ['简历未识别到项目经验, 按基础分 50 计'],
      matched: [],
      missed: [],
      notes: '简历中未识别到项目经验, 按基础分 50 计。建议人工补充项目细节后重新评分。',
    };
  }

  // 对每个项目做命中分析
  const projectHits: Array<{
    project: typeof candidate.projects[0];
    matchedCount: number;
    hits: string[];
    impactScore: number;
    starHits: Array<{ product: string; company: string; program?: '校招' | '实习' | null }>;
  }> = [];

  const starKeywords = getAllStarKeywords();

  for (const proj of candidate.projects) {
    const text = `${proj.name} ${proj.role ?? ''} ${proj.description} ${(proj.highlights ?? []).join(' ')}`;
    const normText = normalize(text);

    const mustHits = findMatches(text, mustArr);
    const bonusHits = findMatches(text, bonusArr);
    const allHits = [...mustHits, ...bonusHits];

    // 明星项目命中 (Allen 提供的产品/校招种子词)
    const starHits: Array<{ product: string; company: string; program?: '校招' | '实习' | null }> = [];
    const seenStar = new Set<string>();
    for (const sp of STAR_PROJECTS) {
      const allNames = [sp.product, ...(sp.aliases ?? [])];
      for (const name of allNames) {
        if (!name) continue;
        if (normText.includes(normalize(name)) && !seenStar.has(sp.product)) {
          seenStar.add(sp.product);
          starHits.push({ product: sp.product, company: sp.company, program: sp.program ?? null });
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

  // 聚合命中统计
  const totalStarHits = projectHits.reduce((s, ph) => s + ph.starHits.length, 0);
  const totalMustHits = projectHits.reduce(
    (s, ph) => s + ph.hits.filter((h) => mustArr.includes(h)).length, 0
  );
  const totalBonusHits = projectHits.reduce(
    (s, ph) => s + ph.hits.filter((h) => bonusArr.includes(h)).length, 0
  );
  const totalImpactScore = projectHits.reduce((s, ph) => s + ph.impactScore, 0);

  // ========== 评分公式 (Allen 2026-08-21 重写) ==========
  let score: number;
  let level: 'star' | 'normal' = 'normal';
  const starHitDetails: string[] = [];

  if (totalStarHits === 0) {
    // 普通项目经验: 50 + JD/影响力酌情, 上限 70
    const jdBoost = clamp(totalMustHits * 4 + totalBonusHits * 2, 0, 12);
    const impactBoost = clamp(totalImpactScore, 0, 8);
    score = clamp(50 + jdBoost + impactBoost, 50, 70);
    evidence.push('无明星项目命中, 按普通项目经验评分 50-70');
  } else {
    // 明星项目经验: 60 + 含金量 + 参与贡献度 + 规模酌情, 上限 100
    level = 'star';

    // 含金量: 校招/实习 +15, Tier 1 公司 +8, 其他 +5 (上限 25)
    let qualityBonus = 0;
    for (const ph of projectHits) {
      for (const sh of ph.starHits) {
        let perHit: number;
        let label: string;
        if (sh.program === '校招' || sh.program === '实习') {
          perHit = 15;
          label = '校招顶级';
        } else if (TIER1_STAR_COMPANIES.has(sh.company)) {
          perHit = 8;
          label = 'Tier1 明星';
        } else {
          perHit = 5;
          label = '明星';
        }
        qualityBonus = Math.min(qualityBonus + perHit, 25);
        starHitDetails.push(`${sh.company} · ${sh.product} (${label})`);
      }
    }
    qualityBonus = clamp(qualityBonus, 0, 25);

    // 参与贡献度: 按最强级别计 (上限 10)
    let contributionBonus = 0;
    let contributionLabel = '';
    for (const ph of projectHits) {
      const text = `${ph.project.name} ${ph.project.role ?? ''} ${ph.project.description} ${(ph.project.highlights ?? []).join(' ')}`;
      for (const pat of CONTRIBUTION_PATTERNS) {
        if (pat.re.test(text)) {
          if (pat.bonus > contributionBonus) {
            contributionBonus = pat.bonus;
            contributionLabel = pat.label;
          }
          break; // 一个项目取最强贡献度
        }
      }
    }
    contributionBonus = clamp(contributionBonus, 0, 10);

    // 规模信号: 取最高 (上限 5)
    const fullText = candidate.projects
      .map((p) => `${p.name} ${p.role ?? ''} ${p.description} ${(p.highlights ?? []).join(' ')}`)
      .join(' ');
    let scaleBonus = 0;
    let scaleLabel = '';
    for (const pat of SCALE_PATTERNS) {
      if (pat.re.test(fullText)) {
        scaleBonus = pat.bonus;
        scaleLabel = pat.label;
        break;
      }
    }

    score = clamp(60 + qualityBonus + contributionBonus + scaleBonus, 60, 100);

    evidence.push(`命中明星项目 ${totalStarHits} 个: ${starHitDetails.join('、')} → 含金量 +${qualityBonus}`);
    if (contributionBonus > 0) {
      evidence.push(`参与贡献度: ${contributionLabel} → +${contributionBonus}`);
    }
    if (scaleBonus > 0) {
      evidence.push(`规模信号: ${scaleLabel} → +${scaleBonus}`);
    }
  }

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

  score = clamp(score + dealBreakerPenalty, 0, 100);

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

  // 通用证据
  if (totalMustHits > 0 || totalBonusHits > 0) {
    evidence.push(`JD 关键词命中: must ${totalMustHits} 个, bonus ${totalBonusHits} 个`);
  }
  if (totalImpactScore > 0) {
    evidence.push(`影响力信号累计 +${totalImpactScore.toFixed(1)}`);
  }

  // notes
  let notes: string;
  if (level === 'star' && score >= 90) {
    notes = `候选人有顶级明星项目经验 (含金量+贡献度+规模均突出)，与岗位高度匹配。`;
  } else if (level === 'star' && score >= 75) {
    notes = `候选人命中明星项目，参与度高，项目经验与岗位匹配度较好。`;
  } else if (level === 'star') {
    notes = `候选人命中明星项目，但参与贡献度或规模信号较弱，建议人工复核项目细节。`;
  } else if (score >= 60) {
    notes = `候选人无明星项目命中，但项目经验与岗位有一定匹配度，需人工补充项目含金量信息。`;
  } else {
    notes = `候选人无明星项目命中，项目经验与岗位匹配度一般 (基础分 50)。`;
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