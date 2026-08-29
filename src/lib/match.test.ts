// =====================================================
// match.ts 测试 - Allen 2026-08-29 公司/学校名变体识别
//
// 根因: 候选人在 "Open AI" (有空格) 工作 24 月 → score 23.3
//   resolveCompanyTiers 用 normalize() 保留空格, "open ai" 不匹配 "openai" entity
//   → 返回 Tier 8 → 走 Tier 4 兜底公式 → 评分 23.3 (偏弱)
//
// 修复: 新增 normalizeEntity() 去空格/标点, 在 resolveCompanyTiers / resolveSchoolTiers
//   / buildEntityTierMap 中替换 normalize()
//
// 覆盖: 公司/学校名常见变体 (空格/大小写/标点/括号/集团/Inc.)
// =====================================================
import { describe, it, expect } from 'vitest';
import { resolveCompanyTiers, resolveSchoolTiers, normalizeEntity, buildEntityTierMap } from './match';
import type { CompanyTier, SchoolTier } from '@/types';

const COMPANY_TIERS: CompanyTier[] = [
  {
    tier: 1,
    label: 'Tier 1',
    companies: [
      'OpenAI', 'Anthropic', 'Google', 'Meta', 'Microsoft', 'Apple', 'Amazon',
      '字节跳动', '阿里巴巴', '腾讯', '百度', 'DeepSeek', 'Kimi',
    ],
  },
  {
    tier: 2,
    label: 'Tier 2',
    companies: ['商汤', '旷视'],
  },
];

const SCHOOL_TIERS: SchoolTier[] = [
  {
    tier: 1,
    label: 'Tier 1',
    schools: ['清华大学', '北京大学', 'MIT', 'Stanford University', '清华', '北大'],
  },
  {
    tier: 2,
    label: 'Tier 2',
    schools: ['复旦大学', '上海交通大学'],
  },
];

describe('Allen 2026-08-29: normalizeEntity() 基础行为', () => {
  it('去 ASCII 空白', () => {
    expect(normalizeEntity('Open AI')).toBe('openai');
    expect(normalizeEntity('  Open   AI  ')).toBe('openai');
  });

  it('去常见英文标点', () => {
    expect(normalizeEntity('Open.AI')).toBe('openai');
    expect(normalizeEntity('Open-AI')).toBe('openai');
    expect(normalizeEntity('Open_AI')).toBe('openai');
    expect(normalizeEntity('Open/AI')).toBe('openai');
    expect(normalizeEntity('Open\\AI')).toBe('openai');
    expect(normalizeEntity('Open|AI')).toBe('openai');
  });

  it('中文括号 + 集团后缀', () => {
    expect(normalizeEntity('字节跳动（中国）')).toBe('字节跳动中国');
    expect(normalizeEntity('字节跳动(中国)')).toBe('字节跳动中国');
    expect(normalizeEntity('阿里巴巴集团')).toBe('阿里巴巴集团');
  });

  it('统一大小写', () => {
    expect(normalizeEntity('OPENAI')).toBe('openai');
    expect(normalizeEntity('OpenAi')).toBe('openai');
    expect(normalizeEntity('oPeNaI')).toBe('openai');
  });
});

describe('Allen 2026-08-29: resolveCompanyTiers 公司名变体识别', () => {
  const cases: Array<[string, number]> = [
    ['OpenAI', 1],
    ['Open AI', 1],      // 旧 bug: Tier 8
    ['openai', 1],
    ['Open.AI', 1],
    ['Open-AI', 1],
    ['OPENAI', 1],
    ['OpenAI Inc.', 1],
    ['字节跳动', 1],
    ['字节跳动（中国）', 1],  // 旧可能漏
    ['字节跳动(中国)', 1],
    ['  字节跳动  ', 1],
    ['Microsoft Corp.', 1],
    ['Apple Inc.', 1],
    ['Google LLC', 1],
    ['Meta Platforms', 1],
  ];

  for (const [input, expectedTier] of cases) {
    it(`"${input}" → Tier ${expectedTier}`, () => {
      const tierMap = resolveCompanyTiers([input], COMPANY_TIERS);
      expect(tierMap.get(input)).toBe(expectedTier);
    });
  }
});

describe('Allen 2026-08-29: resolveSchoolTiers 学校名变体识别', () => {
  const cases: Array<[string, number]> = [
    ['清华大学', 1],
    ['清华', 1],
    ['清华大学（深圳）', 1],
    ['北京大学', 1],
    ['北大', 1],
    ['MIT', 1],
    ['M.I.T.', 1],
    ['Stanford', 1],
    ['Stanford University', 1],
  ];

  for (const [input, expectedTier] of cases) {
    it(`"${input}" → Tier ${expectedTier}`, () => {
      const tierMap = resolveSchoolTiers([input], SCHOOL_TIERS);
      expect(tierMap.get(input)).toBe(expectedTier);
    });
  }
});

describe('Allen 2026-08-29: scoreCompany 端到端 - "Open AI" 场景', () => {
  // 真实场景测试: 简历写 "Open AI" (有空格), 之前被误判 Tier 8 → 23.3 分
  it('"Open AI" 24 月 → score = 88 (旧值 23.3)', async () => {
    const { scoreCompany } = await import('./scoreCompany');
    const candidate = {
      rawText: '',
      totalYears: 2,
      education: [],
      workHistory: [{ company: 'Open AI', title: '工程师', description: '', startYear: 2024, endYear: 2026, durationMonths: 24 }],
      projects: [],
      skills: ['Python'],
    };
    const result = scoreCompany(candidate, null, COMPANY_TIERS);
    expect(result.score).toBe(88);
    expect(result.notes).toMatch(/突出|顶级/);
    expect(result.evidence[0]).toMatch(/Tier 1/);
  });

  it('"字节跳动（中国）" 30 月 → score = 95', async () => {
    const { scoreCompany } = await import('./scoreCompany');
    const candidate = {
      rawText: '',
      totalYears: 2.5,
      education: [],
      workHistory: [{ company: '字节跳动（中国）', title: '工程师', description: '', startYear: 2023, endYear: 2026, durationMonths: 30 }],
      projects: [],
      skills: [],
    };
    const result = scoreCompany(candidate, null, COMPANY_TIERS);
    expect(result.score).toBeGreaterThanOrEqual(88);
  });
});

describe('Allen 2026-08-29: buildEntityTierMap 也用 normalizeEntity', () => {
  it('文本含 "Open AI" → 命中 OpenAI entity', () => {
    const map = buildEntityTierMap('我在 Open AI 工作', COMPANY_TIERS);
    expect(map.get('OpenAI')).toBe(1);
  });
});