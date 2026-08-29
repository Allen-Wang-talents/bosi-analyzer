// =====================================================
// scoreCompany 测试 - Allen 2026-08-29 bug 修复
//
// 旧 bug: 候选人在 OpenAI (Tier 1, score=95) 仅 24 月
//   weighted = 95 * 1.0 * max(0.3, 24/36) = 95 * 0.667 = 63.3
//   → score=63.3 → "公司背景一般, 缺乏顶级公司背书"
//   → 完全荒谬: OpenAI 本身就是顶级公司背书
//
// 修复: 最高 tier 锚定
//   bestTier=1 → floor 88 (突出)
//   bestTier=2 → floor 75 (较好)
//   bestTier=3 → floor 65 (中性)
//   bestTier=4 → 无 floor (走原始加权)
// =====================================================
import { describe, it, expect } from 'vitest';
import { scoreCompany } from './scoreCompany';
import type { Candidate, CompanyTier, JobProfile } from '@/types';

const DEFAULT_TIERS: CompanyTier[] = [
  {
    tier: 1,
    label: 'Tier 1 头部',
    companies: [
      '字节跳动', '阿里巴巴', '腾讯', '百度', '华为', '美团', '京东', '小米', '快手',
      'DeepSeek', '深度求索', 'Kimi', '月之暗面', 'MiniMax', '阶跃星辰', '智谱',
      '谷歌', 'Google', 'Meta', 'OpenAI', 'Anthropic', '微软', 'Microsoft',
      '苹果', 'Apple', '亚马逊', 'Amazon', 'AWS',
    ],
  },
  {
    tier: 2,
    label: 'Tier 2 明星',
    companies: ['商汤', '旷视', '依图', '云从', '科大讯飞', '网易', '携程', '拼多多', '哔哩哔哩'],
  },
  {
    tier: 3,
    label: 'Tier 3 中型',
    companies: ['小红书', '知乎', '微博', 'Keep', '猿辅导', '作业帮'],
  },
];

function wh(company: string, durationMonths: number, title = '工程师', endYear = 2026) {
  return { company, title, description: '', startYear: endYear - Math.ceil(durationMonths / 12), endYear, durationMonths };
}

function candidate(workHistory: Candidate['workHistory']): Candidate {
  return {
    rawText: '',
    totalYears: workHistory.reduce((s, w) => s + w.durationMonths, 0) / 12,
    education: [],
    workHistory,
    projects: [],
    skills: ['Python'],
  };
}

describe('Allen 2026-08-29 bug 修复: Tier 1 锚定', () => {
  it('OpenAI 单段 24 月 → score ≥ 88 (旧值 63.3 → 错评"公司背景一般")', () => {
    const c = candidate([wh('OpenAI', 24)]);
    const result = scoreCompany(c, null, DEFAULT_TIERS);
    expect(result.score).toBeGreaterThanOrEqual(88);
    expect(result.notes).not.toMatch(/公司背景一般|缺乏顶级公司背书/);
    expect(result.notes).toMatch(/突出|顶级/);
  });

  it('OpenAI 单段 6 月 → score ≥ 88 但 notes 提示在职时间短', () => {
    const c = candidate([wh('OpenAI', 6)]);
    const result = scoreCompany(c, null, DEFAULT_TIERS);
    expect(result.score).toBeGreaterThanOrEqual(88);
    expect(result.notes).toMatch(/突出|顶级/);
    expect(result.notes).toMatch(/在职.*0\.5.*年|较短/);
  });

  it('OpenAI 36 月+ → score = 95 满分级', () => {
    const c = candidate([wh('OpenAI', 48)]);
    const result = scoreCompany(c, null, DEFAULT_TIERS);
    // weighted = 95 * 1.0 * 1.0 = 95, floor 88 → 95
    expect(result.score).toBe(95);
  });

  it('字节跳动 (Tier 1) 单段 → score ≥ 88', () => {
    const c = candidate([wh('字节跳动', 18)]);
    const result = scoreCompany(c, null, DEFAULT_TIERS);
    expect(result.score).toBeGreaterThanOrEqual(88);
  });

  it('Anthropic / Google / Meta 等其他 Tier 1 全球巨头 → score ≥ 88', () => {
    const giants = ['Google', 'Meta', 'Anthropic', '微软', 'Apple', 'Amazon', 'DeepSeek', 'Kimi', 'MiniMax'];
    for (const g of giants) {
      const c = candidate([wh(g, 24)]);
      const result = scoreCompany(c, null, DEFAULT_TIERS);
      expect(result.score, `${g} 应 ≥ 88`).toBeGreaterThanOrEqual(88);
    }
  });
});

describe('Allen 2026-08-29 bug 修复: Tier 2/3 锚定', () => {
  it('商汤 (Tier 2) 单段 24 月 → score ≥ 75', () => {
    const c = candidate([wh('商汤', 24)]);
    const result = scoreCompany(c, null, DEFAULT_TIERS);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.notes).toMatch(/较好|明星/);
  });

  it('小红书 (Tier 3) 单段 24 月 → score ≥ 65', () => {
    const c = candidate([wh('小红书', 24)]);
    const result = scoreCompany(c, null, DEFAULT_TIERS);
    expect(result.score).toBeGreaterThanOrEqual(65);
  });
});

describe('Allen 2026-08-29 bug 修复: bestTier=4 不做 floor', () => {
  it('只有未识别的小公司 → 走原始加权, 不强制 floor', () => {
    const c = candidate([wh('某不知名公司', 12)]);
    const result = scoreCompany(c, null, DEFAULT_TIERS);
    // weighted = 95 * 1.0 * max(0.3, 12/36) = 95 * 0.333 = 31.7
    // bestTier=4, floor=0 → score 31.7
    expect(result.score).toBeLessThan(50);
    expect(result.notes).toMatch(/偏弱|一般/);
  });
});

describe('Allen 2026-08-29 bug 修复: 多段混合 (旧 bug 的极端情形)', () => {
  it('OpenAI 24 月 + 3 段小公司 → score 仍 ≥ 88 (旧值会被平均到 ~21)', () => {
    const c = candidate([
      wh('OpenAI', 24, '高级工程师', 2026),
      wh('某创业公司A', 24, '工程师', 2024),  // 长于 18 月, 不触发 hopPenalty
      wh('某创业公司B', 24, '工程师', 2022),
      wh('某创业公司C', 24, '工程师', 2020),
    ]);
    const result = scoreCompany(c, null, DEFAULT_TIERS);
    // weighted 平均: (63.3 + 35*0.85*0.667 + 35*0.7*0.667 + 35*0.55*0.667) / 4
    //              = (63.3 + 19.8 + 16.3 + 12.8) / 4 = 28.1
    // bestTier=1, floor=88 → 88 (no hopPenalty: avg 24mo > 18mo)
    expect(result.score).toBeGreaterThanOrEqual(88);
    expect(result.notes).not.toMatch(/公司背景一般|缺乏顶级公司背书/);
  });

  it('小红书 18 月 + 2 段小公司 → score ≥ 65 (Tier 3 floor)', () => {
    const c = candidate([
      wh('小红书', 18, '工程师', 2026),
      wh('某A', 12, '工程师', 2024),
      wh('某B', 8, '工程师', 2023),
    ]);
    const result = scoreCompany(c, null, DEFAULT_TIERS);
    expect(result.score).toBeGreaterThanOrEqual(65);
  });
});

describe('Allen 2026-08-29 bug 修复: 跳槽惩罚仍生效', () => {
  it('Tier 1 + 频繁跳槽 → 88 - 10 = 78', () => {
    const c = candidate([
      wh('OpenAI', 6, '工程师', 2026),
      wh('Google', 5, '工程师', 2025),
      wh('Meta', 4, '工程师', 2024),
      wh('Microsoft', 3, '工程师', 2023),
    ]);
    const result = scoreCompany(c, null, DEFAULT_TIERS);
    // bestTier=1 → floor 88, hopPenalty -10 → 78
    expect(result.score).toBe(78);
    expect(result.notes).toMatch(/频繁跳槽/);
  });
});

describe('Allen 2026-08-29 bug 修复: profile.targetCompanyTiers 奖励', () => {
  it('Tier 1 当前公司 + 画像目标 Tier 1 → 加成后仍 ≥ 88', () => {
    const c = candidate([wh('OpenAI', 24, '工程师', 2026)]);
    c.currentCompany = 'OpenAI';
    const profile: JobProfile = {
      dealBreakers: [],
      niceToHaves: [],
      culturalFit: '',
      targetCompanyTiers: [1],
      targetSchoolTiers: [],
    };
    const result = scoreCompany(c, profile, DEFAULT_TIERS);
    expect(result.score).toBeGreaterThanOrEqual(88);
  });
});