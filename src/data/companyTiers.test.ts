// =====================================================
// 公司 Tier 名单 + 别名识别测试 (Allen 2026-11-25)
//
// 两个保证:
//   1) 同一家公司的不同写法 (字节/抖音/ByteDance) 都落到同一个 tier
//   2) 简历上写的是产品名 (可灵/文心一言/星火/Kimi) 时, 也能认出真正的雇主
// =====================================================
import { describe, it, expect } from 'vitest';
import { DEFAULT_COMPANY_TIERS } from './tierTemplate';
import { resolveCompanyName } from './productCompanyMap';
import { resolveCompanyTiers } from '@/lib/match';

function tierOf(company: string): number {
  const map = resolveCompanyTiers([company], DEFAULT_COMPANY_TIERS);
  return map.get(company) ?? 8;
}

describe('公司 Tier 名单: 第一梯队', () => {
  const tier1 = [
    '字节跳动', '字节', '抖音', '今日头条', 'TikTok', 'ByteDance',
    '阿里巴巴', '阿里', '蚂蚁集团', '蚂蚁', '淘宝', '天猫', '阿里云', '钉钉',
    '腾讯', '微信', 'QQ', '腾讯科技',
    'DeepSeek', '深度求索',
    'Kimi', '月之暗面', 'Moonshot',
    'MiniMax', '稀宇科技', '海螺AI',
    '阶跃星辰', 'StepFun',
    '智谱', '智谱AI', 'Zhipu',
    '谷歌', 'Google', 'Alphabet',
    'Meta', 'Facebook',
    'OpenAI',
    'Anthropic', 'Claude',
    '微软', 'Microsoft', 'Azure',
    '苹果', 'Apple',
    '亚马逊', 'Amazon', 'AWS',
  ];

  it.each(tier1)('「%s」命中 Tier 1', (name) => {
    expect(tierOf(name)).toBe(1);
  });
});

describe('公司 Tier 名单: 第二梯队', () => {
  const tier2 = [
    '小红书', 'RedNote', 'Xiaohongshu',
    '百度', 'Baidu', '华为', 'Huawei', '小米', 'Xiaomi', '快手', 'Kuaishou',
    '美团', '京东', 'JD', 'B站', '哔哩哔哩', 'bilibili', '米哈游', 'miHoYo',
    'Temu', '拼多多', 'PDD',
    '商汤', 'SenseTime', '旷世', '旷视', '依图', '云从', '第四范式',
    '科大讯飞', 'iFlytek', '昆仑万维', '天工', '出门问问',
    '蔚来', 'NIO', '小鹏', '理想', '小马智行', 'Pony.ai', 'Momenta', '文远智行',
    '面壁智能', '百川智能', '零一万物', '01.AI', '智象未来', 'Hidream',
    'Manus', 'Genspark', 'Lovart', 'Liblib', 'Vidu', '生数科技',
    'PixVerse', '爱诗科技', 'HeyGen', 'MiroMind', 'Anuttacon', 'Sand.ai',
    'VAST', 'Meshy', 'Plaud', 'Looki',
    'vivix', '灵动时刻', 'Today.AI', '此间无限', 'loopit', '涌跃智能',
    '自然选择', 'EVE', 'Elys',
  ];

  it.each(tier2)('「%s」命中 Tier 2', (name) => {
    expect(tierOf(name)).toBe(2);
  });
});

describe('公司 Tier 名单: 第三梯队', () => {
  it.each(['携程', '陌陌', '知乎'])('「%s」命中 Tier 3', (name) => {
    expect(tierOf(name)).toBe(3);
  });
});

describe('同一公司不同名字都能识别', () => {
  it('字节系的多种写法都是 Tier 1', () => {
    for (const name of ['字节跳动', '字节', '抖音', '抖音电商', '北京字节跳动科技有限公司', 'TikTok']) {
      expect(tierOf(name)).toBe(1);
    }
  });

  it('工商全称 / 带后缀的写法也能命中', () => {
    expect(tierOf('北京月之暗面科技有限公司')).toBe(1);
    expect(tierOf('上海阶跃星辰人工智能科技有限公司')).toBe(1);
    expect(tierOf('北京智谱华章科技股份有限公司')).toBe(1);
  });

  it('自动驾驶三家不串味', () => {
    expect(tierOf('蔚来')).toBe(2);
    expect(tierOf('小鹏汽车')).toBe(2);
    expect(tierOf('理想汽车')).toBe(2);
  });
});

describe('产品名/英文名 → 母公司 → Tier', () => {
  const cases: [string, string, number][] = [
    ['可灵', '快手', 2],
    ['Kling', '快手', 2],
    ['文心一言', '百度', 2],
    ['星火', '科大讯飞', 2],
    ['混元', '腾讯', 1],
    ['千问', '阿里巴巴', 1],
    ['豆包', '字节跳动', 1],
    ['Kimi', '月之暗面', 1],
    ['DeepSeek', '深度求索', 1],
    ['日日新', '商汤', 2],
    ['天工', '昆仑万维', 2],
    ['StepFun', '阶跃星辰', 1],
    ['GLM', '智谱', 1],
    ['Vidu', '生数科技', 2],
    ['PixVerse', '爱诗科技', 2],
    ['Lovart', 'Liblib', 2],
    ['Monica', 'Manus', 2],
    ['Claude', 'Anthropic', 1],
    ['ChatGPT', 'OpenAI', 1],
    ['Gemini', '谷歌', 1],
    ['AWS', '亚马逊', 1],
    ['Elys', '自然选择', 2],
    ['Today.AI', '此间无限', 2],
    ['vivix', '灵动时刻', 2],
    ['loopit', '涌跃智能', 2],
  ];

  it.each(cases)('「%s」→ %s → Tier %i', (raw, parent, tier) => {
    const resolved = resolveCompanyName(raw);
    expect(resolved).toBe(parent);
    expect(tierOf(resolved as string)).toBe(tier);
  });
});
