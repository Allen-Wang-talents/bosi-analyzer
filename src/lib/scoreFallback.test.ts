// =====================================================
// Allen 2026-08-21: 解析失败 / 关键字段缺失 → 兜底分统一为 50 (不评 0 分)
//
// 覆盖:
//   - scoreCompany: 无工作经历 → 50
//   - scoreEducation: 无教育经历 → 50
//   - scoreFit: 完全未解析 (5 字段全空) → 50
//   - scoreFit: 部分缺失 (有 totalYears 但无其他) → 仍走公式
// =====================================================
import { describe, it, expect } from 'vitest';
import { scoreCompany } from './scoreCompany';
import { scoreEducation } from './scoreEducation';
import { scoreFit } from './scoreFit';
import type { Candidate, JD, CompanyTier, SchoolTier } from '@/types';

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