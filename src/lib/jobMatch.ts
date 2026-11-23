// =====================================================
// 岗位匹配引擎 —— 本地规则粗排
//
// 为什么不用现有 5 维评鉴引擎 (aggregate.ts):
//   aggregateScore 每个维度保底 50 分, 拿来排 241 个岗位, 所有岗位都会挤在 50~75 分,
//   排序失去意义。这里另起一套, 不带保底分, 且空维度会把权重摊给别人。
//
// 四个维度:
//   D1 能力/领域匹配 38%  岗位要求词覆盖 + TF-IDF 语义相似
//   D2 人才画像契合 24%  画像里的硬约束 (年龄/学历/职级/公司背景/否定项)
//   D3 经验年限     14%  候选人年限 vs 岗位要求年限
//   D4 职能方向+职级 24%  候选人当前方向 vs 表格分类, 职位名解析出的职级
//
// 明确不进分数的东西: 薪资带宽 / 合同点位 / 客户层级 —— 那是商业吸引力不是人岗契合。
//   它们只做展示、筛选、排序。优先级 P0/P1 只做 0~5 分的 tie-break 加分。
// =====================================================
import type { Candidate } from '@/types';
import type { JobPosition, JobTrack } from '../../shared/jobs.ts';
import { keywordGroupsFor, trackKeywordsFor } from '../data/jobKeywords.ts';
import { DEFAULT_COMPANY_TIERS } from '../data/tierTemplate.ts';
import { titleLevel, levelMatchByTier } from './titleLevel.ts';
import { estimateAgeWithConfidence } from './ageUtil.ts';
import { extractConstraints, mergeConstraints, type JobConstraints } from './jobText.ts';
import {
  buildTfidfIndex,
  cosine,
  l2normalize,
  tfidfVector,
  tokenize,
  type TfidfIndex,
} from './tfidf.ts';

export type MatchDimensionKey = 'capability' | 'profile' | 'years' | 'direction';

export type MatchDimension = {
  key: MatchDimensionKey;
  label: string;
  /** null = 该维度无法评估 (岗位信息不全), 权重摊给其他维度 */
  score: number | null;
  /** 原始权重 */
  weight: number;
  /** 归一化后的实际权重 */
  effectiveWeight: number;
  detail: string;
  matched: string[];
  missed: string[];
};

export type JobMatchTier = 'strong' | 'recommend' | 'try' | 'skip';

export type JobMatchResult = {
  job: JobPosition;
  score: number;
  tier: JobMatchTier;
  dimensions: MatchDimension[];
  /** 岗位要求里被满足的词 */
  matchedTerms: string[];
  /** 岗位要求里没被满足的词 */
  missingTerms: string[];
  /** 候选人不满足的否定项 */
  violations: string[];
  /** 本地生成的一句话理由 */
  reason: string;
  /** 岗位信息不全 (JD 或画像为空) */
  incomplete: boolean;
  /** 优先级加分 */
  priorityBonus: number;
  /** 证据覆盖率 (0.5~1), 低说明这个岗位没多少可评估的信息 */
  confidence: number;
  /** 实际参与打分的维度数 */
  evaluatedDimensions: number;
};

/** 各维度原始权重 (加起来 = 1) */
export const DIMENSION_WEIGHTS: Record<MatchDimensionKey, number> = {
  capability: 0.38,
  profile: 0.24,
  years: 0.14,
  direction: 0.24,
};

/** 优先级 tie-break 加分, 可调 (0~5) */
export const PRIORITY_BONUS: Record<string, number> = { P0: 3, P1: 1.5 };

const DIMENSION_LABEL: Record<MatchDimensionKey, string> = {
  capability: '能力/领域匹配',
  profile: '人才画像契合',
  years: '经验年限',
  direction: '职能方向与职级',
};

// ------------------------------------------------------------
// 词命中
// ------------------------------------------------------------

const ASCII_TERM = /^[A-Za-z0-9][A-Za-z0-9+#._\- ]*$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 词是否出现在文本里。
 *
 * ASCII 词必须带词边界, 否则 "Go" 会命中 "Google" / "logo"。
 * 3 字符以内的 ASCII 词还必须大小写敏感 —— "AI" 不该命中 "ai" 这种普通词。
 * 中文词直接子串匹配 (中文没有词边界问题)。
 */
export function termHit(text: string, term: string): boolean {
  if (!text || !term) return false;
  if (ASCII_TERM.test(term)) {
    const t = term.trim();
    if (!t) return false;
    const flags = t.length < 3 ? '' : 'i';
    return new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(t)}(?![A-Za-z0-9])`, flags).test(text);
  }
  return text.includes(term);
}

/** 词的区分度权重: 越长越具体, 权重越高 */
function termBaseWeight(term: string): number {
  const len = term.trim().length;
  if (len <= 2) return 1.0;
  if (len <= 4) return 1.15;
  if (len <= 6) return 1.3;
  return 1.45;
}

// ------------------------------------------------------------
// 候选人证据
// ------------------------------------------------------------

export type EvidenceSegment = {
  text: string;
  weight: number;
  source: string;
};

/**
 * 把候选人拆成加权证据段。
 * skills 1.0 / 工作描述 0.9 (最近 2 段满权, 更早 0.6) / 项目 0.9 / rawText 0.5 (仅兜底)
 */
export function buildEvidence(candidate: Candidate): EvidenceSegment[] {
  const segs: EvidenceSegment[] = [];
  const skills = candidate.skills ?? [];
  for (const s of skills) {
    if (s && s.trim()) segs.push({ text: s, weight: 1.0, source: 'skills' });
  }

  const history = candidate.workHistory ?? [];
  history.forEach((w, i) => {
    const recency = i < 2 ? 1.0 : 0.6;
    const text = [w.title, w.company, w.description].filter(Boolean).join(' ');
    if (text.trim()) {
      segs.push({ text, weight: 0.9 * recency, source: `work:${w.company || i}` });
    }
  });

  for (const p of candidate.projects ?? []) {
    const text = [p.name, p.role, p.description, ...(p.highlights ?? [])]
      .filter(Boolean)
      .join(' ');
    if (text.trim()) segs.push({ text, weight: 0.9, source: 'project' });
  }

  // rawText 只在没有 skills 时兜底 (LLM 解析失败的情形)
  if (skills.length === 0 && candidate.rawText?.trim()) {
    segs.push({ text: candidate.rawText, weight: 0.5, source: 'rawText' });
  }

  return segs;
}

type TermHit = { hit: boolean; weight: number; sources: string[] };

function findTermHit(term: string, segs: EvidenceSegment[]): TermHit {
  let best = 0;
  const sources: string[] = [];
  for (const seg of segs) {
    if (!termHit(seg.text, term)) continue;
    if (seg.weight > best) best = seg.weight;
    const tag = seg.source.startsWith('work:') ? 'work' : seg.source;
    if (!sources.includes(tag)) sources.push(tag);
  }
  if (best === 0) return { hit: false, weight: 0, sources };
  // 只在 skills 清单里出现过 → 打 0.6 折 (技能清单常是「期望会」而不是「真做过」)
  const onlySkills = sources.length === 1 && sources[0] === 'skills';
  return { hit: true, weight: best * (onlySkills ? 0.6 : 1), sources };
}

// ------------------------------------------------------------
// 方向识别
// ------------------------------------------------------------

/** 每个方向在职位名里的识别词
 *
 * 只放能区分方向的词。'工程师'/'技术' 这种通用词不能放 ——
 * 「高级算法工程师」也含「工程师」, 放进 dev 会把算法候选人的开发亲和度抬到 0.5,
 * 方向维度就分不开了。
 */
const TRACK_ROLE_TERMS: Record<JobTrack, string[]> = {
  product: ['产品经理', '产品', '产品线', 'product', 'pm'],
  dev: [
    '开发', '后端', '前端', '全栈', '服务端', '客户端', '基础架构', '架构',
    '运维', '测试', 'swe', 'backend', 'frontend',
  ],
  algo: ['算法', 'research', '研究', '机器学习', '深度学习', 'nlp', 'cv', '大模型'],
  investment: ['投资', '投研', 'fa', 'vc', 'pe', '基金', '募资'],
  growth: ['增长', '运营', '市场', '投放', '商业化', 'bd', '商务'],
  design: ['设计', '美术', 'ui', 'ux', '视觉', '插画'],
  hr: ['hr', '人力', '招聘', '组织', '人才'],
  legal: ['法务', '合规', '律师', '财务', '审计', '税务', '风控'],
};

/** 同一家公司的别称 → 规范名 (梯队配置里没有的, 或写法不同的) */
const BIG_TECH_ALIAS_EXTRA: Array<{ alias: string; canonical: string }> = [
  { alias: '字节', canonical: '字节跳动' },
  { alias: '抖音', canonical: '字节跳动' },
  { alias: '今日头条', canonical: '字节跳动' },
  { alias: 'TikTok', canonical: '字节跳动' },
  { alias: '飞书', canonical: '字节跳动' },
  { alias: '阿里', canonical: '阿里巴巴' },
  { alias: '淘宝', canonical: '阿里巴巴' },
  { alias: '蚂蚁', canonical: '阿里巴巴' },
  { alias: '微信', canonical: '腾讯' },
  { alias: 'Kimi', canonical: '月之暗面' },
  { alias: 'Moonshot', canonical: '月之暗面' },
  { alias: 'Google', canonical: '谷歌' },
  { alias: 'Microsoft', canonical: '微软' },
  { alias: 'Apple', canonical: '苹果' },
  { alias: 'Amazon', canonical: '亚马逊' },
  { alias: 'AWS', canonical: '亚马逊' },
  { alias: 'B站', canonical: '哔哩哔哩' },
  { alias: '深度求索', canonical: 'DeepSeek' },
  { alias: '旷世', canonical: '旷视' },
  { alias: '百川', canonical: '百川智能' },
  { alias: '理想汽车', canonical: '理想' },
  { alias: '蔚来资本', canonical: '蔚来' },
  // 梯队配置里没有、但简历里常见的
  { alias: '滴滴', canonical: '滴滴' },
  { alias: '网易', canonical: '网易' },
  { alias: '携程', canonical: '携程' },
];

/**
 * 一线大厂名 (用于「目标公司背景」这条约束)
 *
 * 规范名取自 tierTemplate 的梯队配置 —— 顾问在设置里调过梯队, 这里自动跟着变,
 * 不用维护两份名单。这张表只补「同一家公司的别称」和梯队里没有的公司。
 */
const BIG_TECH_ALIASES: Array<{ alias: string; canonical: string }> = [
  ...DEFAULT_COMPANY_TIERS.filter((t) => t.tier === 1 || t.tier === 2).flatMap((t) =>
    t.companies.map((name) => ({
      alias: name,
      canonical: BIG_TECH_ALIAS_EXTRA.find((e) => e.alias === name)?.canonical ?? name,
    }))
  ),
  ...BIG_TECH_ALIAS_EXTRA,
];

/** 大厂类通用词 (不指向具体公司) */
const GENERIC_BIG_TECH = ['大厂', '头部公司', '一线互联网', '头部互联网', '知名大厂'];

function candidateCompanies(candidate: Candidate): string[] {
  const names = new Set<string>();
  if (candidate.currentCompany) names.add(candidate.currentCompany);
  for (const w of candidate.workHistory ?? []) if (w.company) names.add(w.company);
  return [...names];
}

function matchBigTech(companies: string[]): string[] {
  const hits: string[] = [];
  for (const c of companies) {
    for (const { alias, canonical } of BIG_TECH_ALIASES) {
      if (c.includes(alias) && !hits.includes(canonical)) hits.push(canonical);
    }
  }
  return hits;
}

/** 候选人在各方向上的亲和度 (0-1) */
export function trackAffinities(candidate: Candidate): Record<JobTrack, number> {
  const history = candidate.workHistory ?? [];
  const recentTitles = [candidate.currentTitle ?? '', ...history.slice(0, 3).map((w) => w.title)]
    .filter(Boolean)
    .join(' ');
  const skillsText = (candidate.skills ?? []).join(' ');

  const result = {} as Record<JobTrack, number>;
  for (const track of Object.keys(TRACK_ROLE_TERMS) as JobTrack[]) {
    const roleTerms = TRACK_ROLE_TERMS[track];
    const roleHits = roleTerms.filter((t) => termHit(recentTitles, t)).length;
    const roleScore = Math.min(1, roleHits / 2);

    const kwTerms = trackKeywordsFor(track).flatMap((g) => g.terms);
    const skillHits = kwTerms.filter((t) => termHit(skillsText, t)).length;
    const skillScore = Math.min(1, skillHits / 4);

    result[track] = 0.62 * roleScore + 0.38 * skillScore;
  }
  return result;
}

// ------------------------------------------------------------
// 上下文 (一次算好, 241 个岗位复用)
// ------------------------------------------------------------

export type MatchContext = {
  candidate: Candidate;
  evidence: EvidenceSegment[];
  /** 候选人的 TF-IDF 向量 (按证据段权重加权) */
  candidateVector: Map<string, number>;
  index: TfidfIndex;
  /** 每个方向内, 各要求词在多少个岗位的 JD 里出现过 */
  termDfByTrack: Map<JobTrack, Map<string, number>>;
  /** 每个方向的岗位数 */
  trackCounts: Map<JobTrack, number>;
  /** 每个岗位的「要求词」缓存 */
  jobTerms: Map<string, string[]>;
  /** 全部岗位数 */
  jobCount: number;
  /** 候选人各方向亲和度 */
  affinities: Record<JobTrack, number>;
  /** 候选人年限 */
  years: number;
  /** 候选人年龄 (取不到 null) */
  age: number | null;
  /** 年龄是不是确切值 —— 推算出来的年龄不能当硬约束用 */
  ageExact: boolean;
  /** 候选人最高学历 */
  degree: '博士' | '硕士' | '本科' | '专科' | '其他' | null;
  /** 候选人大厂背景 */
  bigTech: string[];
  /** 候选人任职过的公司 */
  companies: string[];
};

const DEGREE_ORDER: Record<string, number> = {
  博士: 4, 硕士: 3, 本科: 2, 专科: 1, 其他: 0,
};

export function highestDegree(candidate: Candidate): '博士' | '硕士' | '本科' | '专科' | '其他' | null {
  const edu = candidate.education ?? [];
  if (!edu.length) return null;
  let best: '博士' | '硕士' | '本科' | '专科' | '其他' | null = null;
  for (const e of edu) {
    if (!best || (DEGREE_ORDER[e.degree] ?? 0) > (DEGREE_ORDER[best] ?? 0)) best = e.degree;
  }
  return best;
}

function candidateYears(candidate: Candidate): number {
  if (candidate.totalYears && candidate.totalYears > 0) return candidate.totalYears;
  const months = (candidate.workHistory ?? []).reduce((s, w) => s + (w.durationMonths || 0), 0);
  return months > 0 ? months / 12 : 0;
}

/**
 * 去掉互为子串的词, 只留最长的那个。
 * 「后训练」出现时, 「训练」不该再算一条独立要求 —— 否则覆盖率被重复计算。
 */
export function dedupeOverlapping(terms: string[]): string[] {
  const sorted = [...new Set(terms)].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  for (const t of sorted) {
    if (out.some((k) => k.includes(t))) continue;
    out.push(t);
  }
  return out;
}

/** 某个岗位的 JD 里出现的「要求词」 */
export function termsInJob(job: JobPosition): string[] {
  const text = job.jdText;
  if (!text || !text.trim()) return [];
  const terms = keywordGroupsFor(job.track).flatMap((g) => g.terms);
  const hits: string[] = [];
  for (const t of terms) {
    if (termHit(text, t)) hits.push(t);
  }
  return dedupeOverlapping(hits);
}

/**
 * 建索引: 所有岗位的 TF-IDF + 要求词文档频次。
 * 岗位池为空时也能跑 (只是没有语义相似度)。
 */
export function buildContext(candidate: Candidate, jobs: JobPosition[]): MatchContext {
  const evidence = buildEvidence(candidate);

  const docIds = jobs.map((j) => j.id);
  const docs = jobs.map((j) => `${j.title} ${j.jdText}`);
  const index = buildTfidfIndex(docIds, docs);

  // 候选人向量 = 各证据段的 tf-idf 向量按段权重加权和, 再 L2 归一化
  const candidateVector = new Map<string, number>();
  for (const seg of evidence) {
    const vec = tfidfVector(tokenize(seg.text), index.idf);
    for (const [term, v] of vec) {
      candidateVector.set(term, (candidateVector.get(term) ?? 0) + v * seg.weight);
    }
  }
  l2normalize(candidateVector);

  // 要求词在同方向的岗位里出现过多少次 —— 用它给词降权。
  // 必须按方向分开算: 「训练」在开发岗很常见, 但它对算法岗毫不稀奇, 混在一起算会误判。
  const trackCounts = new Map<JobTrack, number>();
  const termDfByTrack = new Map<JobTrack, Map<string, number>>();
  const jobTerms = new Map<string, string[]>();

  for (const job of jobs) {
    trackCounts.set(job.track, (trackCounts.get(job.track) ?? 0) + 1);
    const terms = termsInJob(job);
    jobTerms.set(job.id, terms);
    let dfMap = termDfByTrack.get(job.track);
    if (!dfMap) {
      dfMap = new Map<string, number>();
      termDfByTrack.set(job.track, dfMap);
    }
    for (const t of terms) dfMap.set(t, (dfMap.get(t) ?? 0) + 1);
  }

  const companies = candidateCompanies(candidate);
  const ageInfo = estimateAgeWithConfidence(candidate);

  return {
    candidate,
    evidence,
    candidateVector,
    index,
    termDfByTrack,
    trackCounts,
    jobTerms,
    jobCount: jobs.length,
    affinities: trackAffinities(candidate),
    years: candidateYears(candidate),
    age: ageInfo.age,
    ageExact: ageInfo.exact,
    degree: highestDegree(candidate),
    bigTech: matchBigTech(companies),
    companies,
  };
}

/** 词的实际权重 = 基础权重 × IDF (在同方向的岗位里出现过多少次) */
function termWeight(ctx: MatchContext, track: JobTrack, term: string): number {
  const df = ctx.termDfByTrack.get(track)?.get(term) ?? 1;
  const n = ctx.trackCounts.get(track) ?? ctx.jobCount;
  const idf = Math.log((n + 1) / (df + 1));
  return termBaseWeight(term) * Math.max(0, idf);
}

// ------------------------------------------------------------
// 四个维度
// ------------------------------------------------------------

function scoreCapability(
  job: JobPosition,
  ctx: MatchContext,
  simRel: number
): { score: number | null; matched: string[]; missed: string[]; detail: string } {
  if (!job.jdText || !job.jdText.trim()) {
    return { score: null, matched: [], missed: [], detail: '岗位无 JD, 能力项无法评估' };
  }

  const terms = ctx.jobTerms.get(job.id) ?? termsInJob(job);
  let totalWeight = 0;
  let hitWeight = 0;
  const matched: string[] = [];
  const missed: string[] = [];

  for (const t of terms) {
    const w = termWeight(ctx, job.track, t);
    totalWeight += w;
    const hit = findTermHit(t, ctx.evidence);
    if (hit.hit) {
      hitWeight += w * hit.weight;
      matched.push(t);
    } else {
      missed.push(t);
    }
  }

  const coverage = totalWeight > 0 ? hitWeight / totalWeight : 0;
  const semantic = simRel;

  const score = totalWeight > 0
    ? 0.75 * coverage * 100 + 0.25 * semantic * 100
    : semantic * 100;

  const detail = totalWeight > 0
    ? `岗位要求 ${terms.length} 项, 候选人覆盖 ${matched.length} 项 (权重覆盖 ${(coverage * 100).toFixed(0)}%), 语义相似 ${(semantic * 100).toFixed(0)}%`
    : `JD 未匹配到词表要求, 仅按语义相似 ${(semantic * 100).toFixed(0)}% 评估`;

  return { score, matched, missed, detail };
}

function scoreProfile(
  job: JobPosition,
  ctx: MatchContext,
  constraints: JobConstraints
): { score: number | null; matched: string[]; missed: string[]; detail: string; violations: string[] } {
  if (!job.profileText || !job.profileText.trim()) {
    return { score: null, matched: [], missed: [], detail: '岗位无人才画像, 该维度无法评估', violations: [] };
  }

  const matched: string[] = [];
  const missed: string[] = [];
  const violations: string[] = [];
  const parts: Array<{ w: number; v: number; label: string }> = [];

  // 年龄
  if (constraints.maxAge !== null && ctx.age !== null) {
    const over = ctx.age - constraints.maxAge;
    if (ctx.ageExact) {
      // 简历里直接写了出生年 —— 年龄是准的, 可以当硬约束判
      const ok = over <= 0;
      const v = ok ? 100 : Math.max(0, 100 - over * 18);
      parts.push({ w: 0.28, v, label: `年龄 ${ctx.age} vs 上限 ${constraints.maxAge}` });
      (ok ? matched : missed).push(`年龄≤${constraints.maxAge}`);
    } else {
      // 推算的年龄 (按"22 岁起工作"反推), 误差有好几岁 ——
      // 拿它去判「30 岁以内」这种硬约束会误杀真人 (超 1 岁就扣 18 分)。
      // 所以只当弱信号, 不进 matched/missed。
      const v = over <= 0 ? 100 : Math.max(50, 100 - over * 6);
      parts.push({ w: 0.1, v, label: `年龄(推算) ${ctx.age} vs 上限 ${constraints.maxAge}` });
    }
  }

  // 学历
  if (constraints.degree && ctx.degree) {
    const need = DEGREE_ORDER[constraints.degree] ?? 0;
    const have = DEGREE_ORDER[ctx.degree] ?? 0;
    const v = have >= need ? 100 : 35;
    parts.push({ w: 0.22, v, label: `学历 ${ctx.degree} vs 要求 ${constraints.degree}` });
    (have >= need ? matched : missed).push(`学历≥${constraints.degree}`);
  }

  // 职级 (只有画像里明确写了目标职级才评估)
  if (constraints.levelTier !== null && ctx.candidate.currentTitle) {
    const candTier = titleLevel(ctx.candidate.currentTitle);
    const v = levelMatchByTier(candTier, constraints.levelTier) * 100;
    parts.push({ w: 0.2, v, label: `职级 ${ctx.candidate.currentTitle} vs ${constraints.levelHint ?? '目标职级'}` });
    if (v >= 85) matched.push(constraints.levelHint ?? '职级匹配');
    else missed.push(constraints.levelHint ?? '职级匹配');
  }

  // 目标公司背景
  if (constraints.companyHints.length > 0) {
    const generic = constraints.companyHints.some((h) => GENERIC_BIG_TECH.includes(h));
    const specific = constraints.companyHints.filter((h) => !GENERIC_BIG_TECH.includes(h));
    const hitSpecific = specific.filter((h) => ctx.bigTech.includes(h) ||
      ctx.companies.some((c) => c.includes(h)));
    if (hitSpecific.length > 0) {
      parts.push({ w: 0.15, v: 100, label: `大厂背景命中 ${hitSpecific.join('、')}` });
      matched.push(`来自${hitSpecific.join('、')}`);
    } else if (generic && ctx.bigTech.length > 0) {
      parts.push({ w: 0.15, v: 85, label: `大厂背景 ${ctx.bigTech.join('、')}` });
      matched.push('大厂背景');
    } else if (generic) {
      parts.push({ w: 0.15, v: 50, label: '要求大厂背景, 候选人无明确大厂经历' });
      missed.push('大厂背景');
    }
  }

  // 硬性要求
  if (constraints.hardRequirements.length > 0) {
    const hit = constraints.hardRequirements.filter((h) =>
      ctx.evidence.some((s) => termHit(s.text, h)));
    const v = (hit.length / constraints.hardRequirements.length) * 100;
    parts.push({ w: 0.15, v, label: `硬性要求命中 ${hit.length}/${constraints.hardRequirements.length}` });
    hit.forEach((h) => matched.push(h));
    constraints.hardRequirements.filter((h) => !hit.includes(h)).forEach((h) => missed.push(h));
  }

  if (parts.length === 0) {
    return {
      score: null,
      matched,
      missed,
      detail: '画像里没抽到可验证的硬约束',
      violations,
    };
  }

  const totalW = parts.reduce((s, p) => s + p.w, 0);
  let score = parts.reduce((s, p) => s + p.v * (p.w / totalW), 0);

  // 否定项: 命中就是硬伤
  for (const d of constraints.dealBreakers) {
    if (ctx.evidence.some((s) => termHit(s.text, d))) {
      violations.push(d);
      score -= 35;
    }
  }
  score = Math.max(0, Math.min(100, score));

  const detail = parts.map((p) => p.label).join('; ') +
    (violations.length ? `; ⚠ 触发否定项: ${violations.join('、')}` : '');

  return { score, matched, missed, detail, violations };
}

function scoreYears(
  constraints: JobConstraints,
  ctx: MatchContext
): { score: number | null; matched: string[]; missed: string[]; detail: string } {
  const required = constraints.minYears;
  if (required === null || required === undefined) {
    return { score: null, matched: [], missed: [], detail: '岗位未写年限要求', };
  }
  const actual = ctx.years;
  if (actual <= 0) {
    return { score: null, matched: [], missed: [], detail: '候选人年限无法确定', };
  }

  let score = actual >= required ? 100 : 100 * Math.pow(actual / required, 0.6);
  if (constraints.maxYears !== null && actual > constraints.maxYears) {
    score = Math.min(score, 85); // 超出上限, 略微打折 (不是错, 只是可能不匹配)
  }

  const matched = actual >= required ? [`经验 ${actual.toFixed(1)} 年 ≥ ${required} 年`] : [];
  const missed = actual >= required ? [] : [`经验 ${actual.toFixed(1)} 年 < 要求的 ${required} 年`];

  return {
    score: Math.max(0, Math.min(100, score)),
    matched,
    missed,
    detail: `候选人 ${actual.toFixed(1)} 年 vs 岗位要求 ${required} 年`,
  };
}

function scoreDirection(
  job: JobPosition,
  ctx: MatchContext
): { score: number | null; matched: string[]; missed: string[]; detail: string } {
  const aff = ctx.affinities;
  const mine = aff[job.track] ?? 0;
  const best = Math.max(...Object.values(aff));

  let direction: number;
  let directionLabel: string;
  if (best <= 0) {
    direction = 40;
    directionLabel = '未识别候选人方向';
  } else {
    direction = 40 + 60 * (mine / best);
    directionLabel = `方向亲和度 ${(mine * 100).toFixed(0)}% (候选人最强方向 ${(best * 100).toFixed(0)}%)`;
  }

  const jobTier = titleLevel(job.title);
  const candTitle = ctx.candidate.currentTitle ?? '';
  let level: number | null = null;
  if (candTitle) {
    level = levelMatchByTier(titleLevel(candTitle), jobTier) * 100;
  }

  const matched: string[] = [];
  const missed: string[] = [];
  let score: number;
  let detail: string;

  if (level === null) {
    score = direction;
    detail = `${directionLabel}; 候选人职位缺失, 职级未评估`;
    missed.push('当前职位');
  } else {
    score = 0.55 * direction + 0.45 * level;
    detail = `${directionLabel}; 职级 ${candTitle}(${titleLevel(candTitle)}) vs ${job.title}(${jobTier}) → ${level.toFixed(0)}`;
    if (level >= 85) matched.push('职级吻合');
    else missed.push('职级差异');
  }

  return { score, matched, missed, detail };
}

// ------------------------------------------------------------
// 组装
// ------------------------------------------------------------

function tierFor(score: number): JobMatchTier {
  if (score >= 80) return 'strong';
  if (score >= 65) return 'recommend';
  if (score >= 50) return 'try';
  return 'skip';
}

export type MatchOptions = {
  /** 是否包含暂停/停止的岗位, 默认 false */
  includePaused?: boolean;
  /** 是否启用优先级加分, 默认 true */
  usePriorityBonus?: boolean;
};

export function scoreJob(
  job: JobPosition,
  ctx: MatchContext,
  simRel: number,
  usePriorityBonus = true
): JobMatchResult {
  const jdConstraints = extractConstraints(job.jdText);
  const profileConstraints = extractConstraints(job.profileText);
  const constraints = mergeConstraints(jdConstraints, profileConstraints);

  const cap = scoreCapability(job, ctx, simRel);
  const prof = scoreProfile(job, ctx, constraints);
  const yrs = scoreYears(constraints, ctx);
  const dir = scoreDirection(job, ctx);

  const dims: MatchDimension[] = [
    { key: 'capability', label: DIMENSION_LABEL.capability, score: cap.score, weight: DIMENSION_WEIGHTS.capability, effectiveWeight: 0, detail: cap.detail, matched: cap.matched, missed: cap.missed },
    { key: 'profile', label: DIMENSION_LABEL.profile, score: prof.score, weight: DIMENSION_WEIGHTS.profile, effectiveWeight: 0, detail: prof.detail, matched: prof.matched, missed: prof.missed },
    { key: 'years', label: DIMENSION_LABEL.years, score: yrs.score, weight: DIMENSION_WEIGHTS.years, effectiveWeight: 0, detail: yrs.detail, matched: yrs.matched, missed: yrs.missed },
    { key: 'direction', label: DIMENSION_LABEL.direction, score: dir.score, weight: DIMENSION_WEIGHTS.direction, effectiveWeight: 0, detail: dir.detail, matched: dir.matched, missed: dir.missed },
  ];

  // 空维度把权重摊给能评估的维度
  const present = dims.filter((d) => d.score !== null);
  const presentWeight = present.reduce((s, d) => s + d.weight, 0);
  for (const d of dims) {
    d.effectiveWeight = d.score === null ? 0 : presentWeight > 0 ? d.weight / presentWeight : 0;
  }

  let score = present.reduce((s, d) => s + (d.score ?? 0) * d.effectiveWeight, 0);

  // 证据覆盖率惩罚: 摊权重解决的是「别被空项稀释」, 但没解决
  // 「只评估了 24% 的信息却拿了 93 分」。岗位没写 JD 时只能看出方向对不对,
  // 那不能排第一 —— 所以按可评估权重再打个折 (0.5 ~ 1.0)。
  const confidence = 0.5 + 0.5 * presentWeight;
  score *= confidence;

  const priorityBonus = usePriorityBonus ? priorityBonusOf(job) : 0;
  score = Math.max(0, Math.min(100, score + priorityBonus));

  const missingTerms = cap.missed;
  const reason = buildReason(job, cap, prof, dir, constraints);

  return {
    job,
    score: Math.round(score * 10) / 10,
    tier: tierFor(score),
    dimensions: dims,
    matchedTerms: cap.matched,
    missingTerms,
    violations: prof.violations,
    reason,
    incomplete: !job.jdText.trim() || !job.profileText.trim(),
    priorityBonus,
    confidence: Math.round(confidence * 100) / 100,
    evaluatedDimensions: present.length,
  };
}

function priorityBonusOf(job: JobPosition): number {
  const p = (job.priority || '').toUpperCase().replace(/\s/g, '');
  return PRIORITY_BONUS[p] ?? 0;
}

function buildReason(
  job: JobPosition,
  cap: { matched: string[]; missed: string[]; detail: string },
  prof: { detail: string; violations: string[] },
  dir: { detail: string },
  constraints: JobConstraints
): string {
  const bits: string[] = [];
  if (cap.matched.length > 0) {
    bits.push(`命中岗位要求 ${cap.matched.slice(0, 4).join('、')}${cap.matched.length > 4 ? ' 等' : ''}`);
  } else if (cap.matched.length === 0 && cap.missed.length > 0) {
    bits.push('岗位要求项均未在履历中找到直接证据');
  }
  if (constraints.levelHint) bits.push(constraints.levelHint);
  if (prof.violations.length > 0) {
    bits.push(`⚠ 不满足「${prof.violations.join('、')}」`);
  }
  if (bits.length === 0) bits.push(dir.detail);
  return bits.join('; ');
}

/**
 * 对全部岗位打分并排序 (分数高的在前)。
 * 暂停/停止的岗位默认过滤掉。
 */
export function matchAllJobs(
  candidate: Candidate,
  jobs: JobPosition[],
  options: MatchOptions = {}
): JobMatchResult[] {
  const { includePaused = false, usePriorityBonus = true } = options;
  const pool = includePaused ? jobs : jobs.filter((j) => !/暂停|停止|关闭|已下线/.test(j.priority));

  if (!pool.length) return [];

  const ctx = buildContext(candidate, pool);

  // 语义相似度: 相对本批岗位的最高值归一, 让分数有区分度
  const sims = new Map<string, number>();
  let maxSim = 0;
  for (const job of pool) {
    const vec = ctx.index.vectors.get(job.id);
    const sim = vec ? cosine(ctx.candidateVector, vec) : 0;
    sims.set(job.id, sim);
    if (sim > maxSim) maxSim = sim;
  }

  const results = pool.map((job) => {
    const sim = sims.get(job.id) ?? 0;
    const simRel = maxSim > 0 ? Math.min(1, sim / maxSim) : 0;
    return scoreJob(job, ctx, simRel, usePriorityBonus);
  });

  return results.sort((a, b) => b.score - a.score || a.job.client.localeCompare(b.job.client));
}

/**
 * 从排序结果里取前 N 条, 单个客户最多 cap 条。
 * 241 个岗位 / 72 个客户, 不限制的话一个客户能占满整页。
 */
export function selectTopMatches(
  results: JobMatchResult[],
  n: number,
  perClientCap = 3
): JobMatchResult[] {
  const out: JobMatchResult[] = [];
  const perClient = new Map<string, number>();
  const skipped: JobMatchResult[] = [];

  for (const r of results) {
    if (out.length >= n) break;
    const client = r.job.client || '未填客户';
    const used = perClient.get(client) ?? 0;
    if (used >= perClientCap) {
      skipped.push(r);
      continue;
    }
    perClient.set(client, used + 1);
    out.push(r);
  }

  // 客户名额用完但还没凑够 N 条 → 放开限制补齐
  if (out.length < n) {
    for (const r of skipped) {
      if (out.length >= n) break;
      out.push(r);
    }
  }

  return out;
}
