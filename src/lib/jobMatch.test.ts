// =====================================================
// 岗位匹配引擎测试
//
// 重点覆盖三类坑:
//   1. 词误命中 —— "Go" 命中 "Google" / "logo", "AI" 命中普通英文单词
//   2. 空数据  —— 岗位没 JD / 没画像时, 维度必须置空并把权重摊给别的维度, 不能算假低分
//   3. 商业字段 —— 薪资带宽 / 合同点位 / 客户层级 不许影响分数
// =====================================================
import { describe, it, expect } from 'vitest';
import type { Candidate } from '@/types';
import type { JobPosition } from '../../shared/jobs.ts';
import { termHit, matchAllJobs, selectTopMatches, buildContext, termsInJob, trackAffinities } from './jobMatch';
import { extractConstraints, mergeConstraints } from './jobText';

function job(p: Partial<JobPosition> & { id: string }): JobPosition {
  return {
    track: 'algo',
    trackLabel: '算法岗',
    client: '某公司',
    title: '岗位',
    location: '北京',
    jdText: '',
    profileText: '',
    salaryBand: '',
    feePoint: '',
    clientTier: '',
    priority: '',
    owner: '',
    startDate: '',
    remarks: '',
    ...p,
  };
}

const candidate: Candidate = {
  rawText: '',
  name: '张三',
  birthYear: 1997,
  totalYears: 6,
  currentTitle: '高级算法工程师',
  currentCompany: '字节跳动',
  education: [
    { school: '清华大学', degree: '硕士', major: '计算机', startYear: 2016, endYear: 2019 },
  ],
  workHistory: [
    {
      company: '字节跳动',
      title: '高级算法工程师',
      startYear: 2020,
      endYear: null,
      durationMonths: 36,
      description: '负责大模型后训练, 做过 SFT 与 RLHF, 负责多模态模型评测体系搭建',
    },
    {
      company: '腾讯',
      title: '算法工程师',
      startYear: 2018,
      endYear: 2020,
      durationMonths: 24,
      description: '搭建 RAG 检索增强链路与向量数据库',
    },
  ],
  projects: [
    {
      name: 'LLM Agent 平台',
      description: '基于 Agent 的工作流编排, Prompt 工程与效果评测',
      highlights: ['推理优化 P99 降低 40%'],
    },
  ],
  skills: ['Python', 'PyTorch', '大模型', 'SFT', 'RLHF', 'Agent', '评测'],
};

const algoJob = job({
  id: 'algo-1',
  track: 'algo',
  trackLabel: '算法岗',
  client: '月之暗面',
  title: '大模型算法工程师',
  jdText: '负责大模型后训练, 需要 SFT、RLHF 经验, 熟悉多模态与评测体系, 3年以上',
  profileText: '对标字节3-1, 35岁以内, 硕士及以上, 来自大厂',
  priority: 'P0',
});

const devJob = job({
  id: 'dev-1',
  track: 'dev',
  trackLabel: '开发岗',
  client: '某电商',
  title: '高级后端工程师',
  jdText: '负责高并发服务治理, 熟悉 Kafka、Redis, 需要分布式系统经验, 5年以上',
  profileText: '本科及以上, 3年以上',
});

const emptyJdJob = job({
  id: 'inv-1',
  track: 'investment',
  trackLabel: '投资岗',
  client: '某基金',
  title: '投资经理',
  jdText: '',
  profileText: '硕士及以上, 5年以上一级市场经验, 硬科技赛道',
});

describe('词命中: 误命中防护', () => {
  it('短 ASCII 词必须大小写敏感 + 词边界', () => {
    expect(termHit('熟练使用 Go 语言', 'Go')).toBe(true);
    expect(termHit('Google 是搜索引擎', 'Go')).toBe(false);
    expect(termHit('公司 logo 设计', 'Go')).toBe(false);
    expect(termHit('golang 开发', 'Go')).toBe(false);
  });

  it('2 字符 ASCII 词不区分大小写会误命中 —— 所以保持敏感', () => {
    expect(termHit('熟悉 AI 应用', 'AI')).toBe(true);
    expect(termHit('detail page', 'AI')).toBe(false);
  });

  it('长 ASCII 词忽略大小写但仍要词边界', () => {
    expect(termHit('python and pytorch', 'Python')).toBe(true);
    expect(termHit('cpython 编程', 'Python')).toBe(false);
  });

  it('中文词直接子串匹配', () => {
    expect(termHit('负责大模型后训练', '后训练')).toBe(true);
    expect(termHit('负责商业化增长', '微调')).toBe(false);
  });

  it('正则元字符不会被当成正则', () => {
    expect(termHit('熟练 C++ 开发', 'C++')).toBe(true);
    expect(termHit('熟悉 Node.js 全栈', 'Node.js')).toBe(true);
  });
});

describe('岗位文本约束抽取', () => {
  it('年限: N年以上 与 N-M年 区间', () => {
    const a = extractConstraints('要求 3年以上经验');
    expect(a.minYears).toBe(3);
    expect(a.maxYears).toBeNull();

    const b = extractConstraints('3-5年相关经验');
    expect(b.minYears).toBe(3);
    expect(b.maxYears).toBe(5);
  });

  it('年龄上限', () => {
    expect(extractConstraints('35岁以内').maxAge).toBe(35);
    expect(extractConstraints('年龄25-35岁').maxAge).toBe(35);
    expect(extractConstraints('年龄25-35岁').minAge).toBe(25);
  });

  it('学历取最高门槛', () => {
    expect(extractConstraints('硕士及以上学历').degree).toBe('硕士');
    expect(extractConstraints('本科及以上, 硕士优先').degree).toBe('硕士');
    expect(extractConstraints('博士学历').degree).toBe('博士');
  });

  it('对标字节职级换算成档位', () => {
    const c = extractConstraints('对标字节2-1');
    expect(c.levelTier).toBe(3);
    expect(c.levelHint).toBe('对标字节2-1');
  });

  it('否定项与硬性要求', () => {
    const c = extractConstraints('不要有大厂背景的人, 必须熟悉 SFT');
    expect(c.dealBreakers.length).toBeGreaterThan(0);
    expect(c.hardRequirements.length).toBeGreaterThan(0);
  });

  it('合并约束时取更严格的一边', () => {
    const jd = extractConstraints('3年以上');
    const profile = extractConstraints('5年以上, 30岁以内');
    const merged = mergeConstraints(jd, profile);
    expect(merged.minYears).toBe(5);
    expect(merged.maxAge).toBe(30);
  });
});

describe('岗位匹配: 排序', () => {
  const results = matchAllJobs(candidate, [algoJob, devJob, emptyJdJob]);

  it('匹配的岗位排在前面', () => {
    expect(results[0].job.id).toBe('algo-1');
  });

  it('命中岗位要求词', () => {
    const top = results[0];
    expect(top.matchedTerms).toContain('后训练');
    expect(top.matchedTerms).toContain('SFT');
    expect(top.matchedTerms).toContain('RLHF');
    expect(top.matchedTerms).toContain('多模态');
  });

  it('分数分层合理 (strong / recommend / try / skip)', () => {
    expect(['strong', 'recommend', 'try', 'skip']).toContain(results[0].tier);
  });
});

describe('岗位匹配: 空数据不产生假低分', () => {
  const results = matchAllJobs(candidate, [emptyJdJob]);
  const r = results[0];

  it('JD 为空 → 能力维度置 null', () => {
    const cap = r.dimensions.find((d) => d.key === 'capability');
    expect(cap?.score).toBeNull();
    expect(cap?.effectiveWeight).toBe(0);
  });

  it('有效权重之和为 1 (空维度的权重摊给了别人)', () => {
    const sum = r.dimensions.reduce((s, d) => s + d.effectiveWeight, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('卡片标记为「岗位信息不全」', () => {
    expect(r.incomplete).toBe(true);
  });
});

describe('岗位匹配: 商业字段不进分数', () => {
  it('薪资带宽 / 合同点位 / 客户层级 不影响匹配分', () => {
    const base = matchAllJobs(candidate, [algoJob])[0].score;
    const fat = matchAllJobs(candidate, [
      { ...algoJob, salaryBand: '80-120K', feePoint: '30%', clientTier: 'S级' },
    ])[0].score;
    expect(fat).toBe(base);
  });

  it('优先级只做小幅加分 (默认 P0 +3)', () => {
    const noPriority = matchAllJobs(candidate, [{ ...algoJob, priority: '' }], {
      usePriorityBonus: false,
    })[0].score;
    const withP0 = matchAllJobs(candidate, [{ ...algoJob, priority: 'P0' }])[0].score;
    expect(withP0).toBeGreaterThan(noPriority);
    expect(withP0 - noPriority).toBeLessThanOrEqual(3.01);
  });
});

describe('岗位匹配: 过滤与选择', () => {
  it('暂停/停止的岗位默认不出现在结果里', () => {
    const paused = { ...devJob, id: 'dev-paused', priority: '暂停' };
    const results = matchAllJobs(candidate, [paused, algoJob]);
    expect(results.map((r) => r.job.id)).not.toContain('dev-paused');
  });

  it('includePaused 时可以带出来', () => {
    const paused = { ...devJob, id: 'dev-paused', priority: '暂停' };
    const results = matchAllJobs(candidate, [paused], { includePaused: true });
    expect(results.map((r) => r.job.id)).toContain('dev-paused');
  });

  it('单个客户在 top N 里有上限', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      job({ id: `c-${i}`, client: '大客户', title: `岗位${i}`, track: 'algo', jdText: '大模型评测' })
    );
    const others = Array.from({ length: 4 }, (_, i) =>
      job({ id: `d-${i}`, client: `小客户${i}`, title: `岗位${i}`, track: 'algo', jdText: '大模型评测' })
    );
    const results = matchAllJobs(candidate, [...many, ...others]);
    const top = selectTopMatches(results, 6, 3);
    const bigCount = top.filter((r) => r.job.client === '大客户').length;
    expect(bigCount).toBeLessThanOrEqual(3);
  });
});

describe('上下文与词表', () => {
  it('要求词只从本方向的词表里取', () => {
    const terms = termsInJob(devJob);
    expect(terms).toContain('Kafka');
    expect(terms).not.toContain('RLHF');
  });

  it('buildContext 会缓存每个岗位的要求词', () => {
    const ctx = buildContext(candidate, [algoJob, devJob]);
    expect(ctx.jobTerms.get('algo-1')?.length).toBeGreaterThan(0);
    expect(ctx.jobTerms.get('dev-1')?.length).toBeGreaterThan(0);
  });

  it('互为子串的词只留最长的 (后训练 在场时不再单独算 训练)', () => {
    const j = job({ id: 'x', track: 'algo', jdText: '负责大模型后训练与训练数据' });
    const terms = termsInJob(j);
    expect(terms).toContain('后训练');
    expect(terms).not.toContain('训练');
  });
});

describe('证据不足的岗位不能靠「方向对」排第一', () => {
  it('无 JD 无画像的岗位置信度明显更低', () => {
    const bare = job({ id: 'bare', track: 'algo', title: '算法专家' });
    const full = matchAllJobs(candidate, [algoJob])[0];
    const thin = matchAllJobs(candidate, [bare])[0];
    expect(thin.confidence).toBeLessThan(full.confidence);
    expect(thin.evaluatedDimensions).toBeLessThan(full.evaluatedDimensions);
    expect(thin.score).toBeLessThan(full.score);
  });

  it('置信度在 0.5 ~ 1 之间', () => {
    for (const r of matchAllJobs(candidate, [algoJob, devJob, emptyJdJob])) {
      expect(r.confidence).toBeGreaterThanOrEqual(0.5);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });
});

describe('大厂背景识别', () => {
  const withCompany = (company: string) =>
    buildContext({ ...candidate, currentCompany: company, workHistory: [] }, []);

  it('产品名归一到公司规范名 (飞书 → 字节跳动)', () => {
    expect(withCompany('飞书').bigTech).toContain('字节跳动');
  });

  it('英文名归一到中文规范名 (Google → 谷歌)', () => {
    expect(withCompany('Google').bigTech).toContain('谷歌');
  });

  it('梯队配置里的公司算大厂 (取自 tierTemplate)', () => {
    expect(withCompany('DeepSeek').bigTech).toContain('DeepSeek');
    expect(withCompany('面壁智能').bigTech).toContain('面壁智能');
  });

  it('普通公司不算大厂', () => {
    expect(withCompany('某某不知名公司').bigTech).toEqual([]);
  });
});

describe('方向亲和度', () => {
  it('通用职位词不该把别的方向抬上来 (算法候选人 vs 开发岗)', () => {
    const aff = trackAffinities(candidate);
    expect(aff.algo).toBeGreaterThan(aff.dev);
    expect(aff.dev).toBeLessThan(0.35);
  });

  it('八个方向都要有值', () => {
    const aff = trackAffinities(candidate);
    for (const v of Object.values(aff)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
