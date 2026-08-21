// =====================================================
// Allen 2026-08-21: 解析失败 / 关键字段缺失 → 兜底分统一为 50 (不评 0 分)
//   + 所有评分维度下限 50 (aggregate 层统一 floor)
//   + candidate 信息稀疏 → 阻止评分, 强制手动补充
//
// 覆盖:
//   - scoreCompany: 无工作经历 → 50
//   - scoreEducation: 无教育经历 → 50
//   - scoreFit: 完全未解析 (5 字段全空) → 50
//   - scoreFit: 部分缺失 (有 totalYears 但无其他) → 仍走公式
//   - aggregateScore: 任何维度分数 < 50 → floor 到 50
//   - isCandidateSparse: 4 关键字段 ≥ 3 缺失 → true
// =====================================================
import { describe, it, expect } from 'vitest';
import { scoreCompany } from './scoreCompany';
import { scoreEducation } from './scoreEducation';
import { scoreFit } from './scoreFit';
import { scoreAge } from './scoreAge';
import { scoreProjects } from './scoreProjects';
import { aggregateScore } from './aggregate';
import { isCandidateSparse, getSparseCount } from './candidateValid';
import type { Candidate, JD, CompanyTier, SchoolTier, DimensionResult, Weights } from '@/types';

function baseCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    rawText: '',
    totalYears: 0,
    education: [],
    workHistory: [],
    projects: [],
    skills: [],
    ...overrides,
  };
}

const baseJd: JD = {
  rawText: '',
  title: '高级算法工程师',
  responsibilities: [],
  mustHaveSkills: ['Python', 'PyTorch'],
  niceToHaveSkills: ['LLM'],
  minYears: 3,
  location: '北京',
};

const emptyCompanyTiers: CompanyTier[] = [];
const emptySchoolTiers: SchoolTier[] = [];

describe('Allen 2026-08-21: scoreCompany 解析失败兜底', () => {
  it('空工作经历 → score = 50 (旧值是 30)', () => {
    const c = baseCandidate();
    const result = scoreCompany(c, null, emptyCompanyTiers);
    expect(result.score).toBe(50);
    expect(result.evidence[0]).toContain('基础分 50');
    expect(result.notes).toMatch(/建议人工补充/);
  });

  it('空工作经历 + 有工作经历但缺字段 → 仍为 50', () => {
    const c = baseCandidate({
      name: '张三',
      totalYears: 5,
      currentTitle: '工程师',
      currentCompany: '某公司',
      skills: ['Python'],
    });
    const result = scoreCompany(c, null, emptyCompanyTiers);
    expect(result.score).toBe(50); // workHistory 仍是 []
  });
});

describe('Allen 2026-08-21: scoreEducation 解析失败兜底', () => {
  it('空教育经历 → score = 50 (旧值是 30)', () => {
    const c = baseCandidate();
    const result = scoreEducation(c, null, emptySchoolTiers);
    expect(result.score).toBe(50);
    expect(result.evidence[0]).toContain('基础分 50');
    expect(result.notes).toMatch(/建议人工补充/);
  });

  it('空教育经历 + 有其他字段 → 仍为 50', () => {
    const c = baseCandidate({
      name: '张三',
      totalYears: 8,
      currentTitle: '工程师',
      currentCompany: '字节跳动',
      workHistory: [
        { company: '字节跳动', title: '工程师', description: '负责后端', startYear: 2020, endYear: 2024, durationMonths: 48 },
      ],
      skills: ['Python'],
    });
    const result = scoreEducation(c, null, emptySchoolTiers);
    expect(result.score).toBe(50); // education 仍是 []
  });
});

describe('Allen 2026-08-21: scoreFit 完全未解析兜底', () => {
  it('5 字段全空 (无 education/workHistory/skills/currentTitle/totalYears) → score = 50', () => {
    const c = baseCandidate();
    const result = scoreFit(c, baseJd);
    expect(result.score).toBe(50);
    expect(result.evidence[0]).toMatch(/未解析|基础分 50/);
    expect(result.notes).toMatch(/建议人工补充/);
  });

  it('有 totalYears 但无其他 → 仍为 50 (完全未解析判定)', () => {
    const c = baseCandidate({ totalYears: 5 });
    const result = scoreFit(c, baseJd);
    expect(result.score).toBe(50);
  });

  it('有 currentTitle 但无其他 → 仍为 50', () => {
    const c = baseCandidate({ currentTitle: '工程师' });
    const result = scoreFit(c, baseJd);
    expect(result.score).toBe(50);
  });

  it('JD 为 null 时 → score = 0 + 提示必填 JD (这是原有行为, 不回归)', () => {
    const c = baseCandidate({
      totalYears: 5,
      currentTitle: '工程师',
      skills: ['Python'],
    });
    const result = scoreFit(c, null);
    expect(result.score).toBe(0);
    expect(result.notes).toMatch(/请先填写/);
  });
});

describe('Allen 2026-08-21: scoreFit 有部分信息时仍走公式', () => {
  it('有工作年限 + 技能 → 走公式 (score 应不等于 50)', () => {
    const c = baseCandidate({
      totalYears: 5,
      skills: ['Python', 'PyTorch'],
    });
    const result = scoreFit(c, baseJd);
    // 满足 "5 字段全空" 任一项就不为真, 走公式
    // skills 有 → 不命中完全未解析
    expect(result.score).not.toBe(50);
    // 公式: skillScore*0.4 + yearScore*0.25 + industryScore*0.2 + titleScore*0.15
    // 技能 2/3 (Python + PyTorch, LLM 必填没命中) = 67%, 年限 5/3 满分=80+8=88
    // industryScore=60 (默认), titleScore=70 (无 currentTitle 信息不足)
    // = 67*0.4 + 88*0.25 + 60*0.2 + 70*0.15 = 26.8 + 22 + 12 + 10.5 = 71.3
    expect(result.score).toBeGreaterThan(55);
    expect(result.score).toBeLessThan(85);
  });
});

describe('Allen 2026-08-21: aggregateScore 评分下限 50 (floor)', () => {
  const defaultWeights: Weights = {
    education: 20, company: 25, projects: 25, fit: 15, age: 15,
  };

  it('任何维度 score < 50 → floor 到 50', () => {
    const dims: DimensionResult[] = [
      { name: 'education', label: '学历', score: 30, weight: 0.2, evidence: [], matched: [], missed: [] },
      { name: 'company',   label: '公司', score: 80, weight: 0.25, evidence: [], matched: [], missed: [] },
      { name: 'projects',  label: '项目', score: 90, weight: 0.25, evidence: [], matched: [], missed: [] },
      { name: 'fit',       label: '匹配', score: 70, weight: 0.15, evidence: [], matched: [], missed: [] },
      { name: 'age',       label: '年龄', score: 8,  weight: 0.15, evidence: [], matched: [], missed: [] },
    ];
    const result = aggregateScore(dims, defaultWeights, 'test');
    expect(result.dimensions.find((d) => d.name === 'education')!.score).toBe(50);
    expect(result.dimensions.find((d) => d.name === 'age')!.score).toBe(50);
    expect(result.dimensions.find((d) => d.name === 'company')!.score).toBe(80);
  });

  it('所有维度 ≥ 50 时 → 分数不变', () => {
    const dims: DimensionResult[] = [
      { name: 'education', label: '学历', score: 70, weight: 0.2,  evidence: [], matched: [], missed: [] },
      { name: 'company',   label: '公司', score: 80, weight: 0.25, evidence: [], matched: [], missed: [] },
      { name: 'projects',  label: '项目', score: 90, weight: 0.25, evidence: [], matched: [], missed: [] },
      { name: 'fit',       label: '匹配', score: 60, weight: 0.15, evidence: [], matched: [], missed: [] },
      { name: 'age',       label: '年龄', score: 75, weight: 0.15, evidence: [], matched: [], missed: [] },
    ];
    const result = aggregateScore(dims, defaultWeights, 'test');
    expect(result.dimensions.every((d) => d.score >= 50)).toBe(true);
    expect(result.dimensions.find((d) => d.name === 'projects')!.score).toBe(90);
  });

  it('deal-breaker 命中 → score < 50 → aggregate floor 50 (但保留证据)', () => {
    // 模拟 scoreProjects 命中 deal-breaker, 原始分被压到 30
    const candidate = baseCandidate({
      skills: ['Python'],
      projects: [{ name: '项目', description: 'P2P 金融业务', highlights: [] }],
    });
    const profile = { dealBreakers: ['P2P 金融'], niceToHaves: [], culturalFit: '', targetCompanyTiers: [], targetSchoolTiers: [] };
    const projDim = scoreProjects(candidate, null, profile);
    expect(projDim.score).toBeLessThan(50); // 命中 -15 后 < 50

    // 喂给 aggregate
    const dims: DimensionResult[] = [
      projDim,
      { name: 'education', label: '学历', score: 70, weight: 0.25, evidence: [], matched: [], missed: [] },
      { name: 'company',   label: '公司', score: 80, weight: 0.25, evidence: [], matched: [], missed: [] },
      { name: 'fit',       label: '匹配', score: 60, weight: 0.15, evidence: [], matched: [], missed: [] },
      { name: 'age',       label: '年龄', score: 75, weight: 0.15, evidence: [], matched: [], missed: [] },
    ];
    const result = aggregateScore(dims, defaultWeights, 'test');
    // 被 floor 到 50
    expect(result.dimensions.find((d) => d.name === 'projects')!.score).toBe(50);
  });

  it('scoreAge 70后 (score=8) → floor 后变 50', () => {
    // 模拟 1955 年生 (70 岁), AGE_SCORE_TABLE 命中 score=8
    const c = baseCandidate({ birthYear: 1955 });
    const ageDim = scoreAge(c);
    expect(ageDim.score).toBeLessThan(50);

    const dims: DimensionResult[] = [
      ageDim,
      { name: 'education', label: '学历', score: 70, weight: 0.2,  evidence: [], matched: [], missed: [] },
      { name: 'company',   label: '公司', score: 80, weight: 0.25, evidence: [], matched: [], missed: [] },
      { name: 'projects',  label: '项目', score: 90, weight: 0.25, evidence: [], matched: [], missed: [] },
      { name: 'fit',       label: '匹配', score: 60, weight: 0.15, evidence: [], matched: [], missed: [] },
    ];
    const result = aggregateScore(dims, defaultWeights, 'test');
    expect(result.dimensions.find((d) => d.name === 'age')!.score).toBe(50);
  });

  it('floor 不影响 total 的正向计算 (其他维度 ≥ 50 时)', () => {
    const dims: DimensionResult[] = [
      { name: 'education', label: '学历', score: 60, weight: 0.2,  evidence: [], matched: [], missed: [] },
      { name: 'company',   label: '公司', score: 80, weight: 0.25, evidence: [], matched: [], missed: [] },
      { name: 'projects',  label: '项目', score: 90, weight: 0.25, evidence: [], matched: [], missed: [] },
      { name: 'fit',       label: '匹配', score: 70, weight: 0.15, evidence: [], matched: [], missed: [] },
      { name: 'age',       label: '年龄', score: 65, weight: 0.15, evidence: [], matched: [], missed: [] },
    ];
    // total = 60*0.2 + 80*0.25 + 90*0.25 + 70*0.15 + 65*0.15 = 12+20+22.5+10.5+9.75 = 74.75
    const result = aggregateScore(dims, defaultWeights, 'test');
    expect(result.total).toBeCloseTo(74.8, 1);
  });
});

describe('Allen 2026-08-21: isCandidateSparse / getSparseCount', () => {
  it('null candidate → true / 4', () => {
    expect(isCandidateSparse(null)).toBe(true);
    expect(getSparseCount(null)).toBe(4);
  });

  it('完全空 candidate (4 关键字段全空) → true', () => {
    const c = baseCandidate();
    expect(isCandidateSparse(c)).toBe(true);
    expect(getSparseCount(c)).toBe(4);
  });

  it('仅 totalYears 有值 → 3 缺失 → true', () => {
    const c = baseCandidate({ totalYears: 5 });
    expect(isCandidateSparse(c)).toBe(true);
    expect(getSparseCount(c)).toBe(3);
  });

  it('totalYears + skills → 2 缺失 → false (不稀疏)', () => {
    const c = baseCandidate({ totalYears: 5, skills: ['Python'] });
    expect(isCandidateSparse(c)).toBe(false);
    expect(getSparseCount(c)).toBe(2);
  });

  it('totalYears + skills + currentTitle → 1 缺失 → false', () => {
    const c = baseCandidate({ totalYears: 5, skills: ['Python'], currentTitle: '工程师' });
    expect(isCandidateSparse(c)).toBe(false);
    expect(getSparseCount(c)).toBe(1);
  });

  it('4 关键字段都有 → false / 0', () => {
    const c = baseCandidate({
      totalYears: 5,
      skills: ['Python'],
      currentTitle: '工程师',
      workHistory: [{ company: '字节', title: '工程师', description: '开发', startYear: 2020, endYear: 2024, durationMonths: 48 }],
    });
    expect(isCandidateSparse(c)).toBe(false);
    expect(getSparseCount(c)).toBe(0);
  });

  it('有 education/projects 但 4 关键字段空 → 仍 true (只看 4 关键)', () => {
    const c = baseCandidate({
      education: [{ school: '清华', degree: '本科', major: 'CS', startYear: 2015, endYear: 2019 }],
      projects: [{ name: 'X', description: 'Y', highlights: [] }],
    });
    expect(isCandidateSparse(c)).toBe(true);
  });
});