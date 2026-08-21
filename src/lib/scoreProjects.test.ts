// =====================================================
// scoreProjects 测试 - 覆盖 Allen 2026-08-21 评分公式重写
//
// 新规则:
//   - 无 projects → 50 分兜底
//   - 有 projects, 无明星项目命中 → 50 + JD/影响力, 上限 70
//   - 有明星项目命中 → 60 + 含金量 + 贡献度 + 规模, 上限 100
//     - 校招/实习明星 (program='校招'/'实习'): +15/个, 顶级
//     - Tier 1 公司明星: +8/个
//     - 其他公司明星: +5/个
//     - 主导/0到1/技术负责人: +10
//     - 核心成员: +5
//     - 参与/负责: +2
//     - 亿级/千万级 DAU: +5
//     - 百万级 DAU: +3
//   - Deal-breaker 命中: 每个 -15
// =====================================================
import { describe, it, expect } from 'vitest';
import { scoreProjects } from './scoreProjects';
import type { Candidate, JD, JobProfile } from '@/types';

function baseCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    rawText: '',
    totalYears: 5,
    education: [],
    workHistory: [],
    projects: [],
    skills: [],
    ...overrides,
  };
}

function baseJd(): JD {
  return {
    rawText: '',
    title: '高级算法工程师',
    responsibilities: [],
    mustHaveSkills: ['Python', 'PyTorch'],
    niceToHaveSkills: ['LLM', 'RAG'],
    minYears: 3,
    location: '北京',
  };
}

describe('Allen 2026-08-21 重写: 基础分与上下限', () => {
  it('case1: 简历无项目 → score = 50 (兜底)', () => {
    const result = scoreProjects(baseCandidate(), null, null);
    expect(result.score).toBe(50);
    expect(result.evidence[0]).toContain('基础分 50');
  });

  it('case2: 有项目但无明星命中 + 无 JD 命中 → score ∈ [50, 70]', () => {
    const candidate = baseCandidate({
      projects: [
        { name: 'XX 电商后端', description: '负责订单系统日常维护和 bug 修复', highlights: [] },
        { name: 'YY 推荐重构', description: '协助团队做代码 review', highlights: [] },
      ],
    });
    const result = scoreProjects(candidate, baseJd(), null);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThanOrEqual(70);
  });

  it('case3: 有明星项目 (字节豆包) → score ∈ [60, 100]', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '豆包大模型项目',
          description: '负责豆包推理优化',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, baseJd(), null);
    // 命中字节跳动·豆包 → Tier 1 +8, base 60, 加上"负责"贡献度 +2 = 70
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('Allen 2026-08-21 重写: 含金量分级', () => {
  it('case4: 校招顶级项目 (top seed) → 含金量 +15, score 应明显高于普通明星', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '字节 Top Seed 校招项目',
          description: '参与豆包大模型校招培训',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, null, null);
    // top seed 是 program='校招' → +15, base 60 → 75 (无贡献度/规模)
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.evidence.join(' ')).toMatch(/校招顶级/);
  });

  it('case5: Tier 1 公司明星 (字节豆包) → 含金量 +8', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '豆包大模型训练项目',
          description: '参与豆包模型训练',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, null, null);
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThanOrEqual(80);
    expect(result.evidence.join(' ')).toMatch(/Tier1 明星/);
  });

  it('case6: 多个明星命中 → 含金量累加, 上限 25', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '豆包 + 飞书',
          description: '主导豆包和飞书两个项目',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, null, null);
    // 命中豆包 + 飞书, 都是字节 Tier 1 → 8+8=16
    expect(result.score).toBeGreaterThanOrEqual(76);
  });

  it('case7: 非 Tier 1 明星命中 → +5', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '可灵视频生成',
          description: '负责可灵模型训练',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, null, null);
    // 快手·可灵, 非 Tier 1 → +5, base 60 → 65
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThanOrEqual(75);
  });
});

describe('Allen 2026-08-21 重写: 参与贡献度', () => {
  it('case8: 主导/0到1/技术负责人 → +10', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '豆包项目',
          description: '主导项目从 0 到 1 搭建, 作为技术负责人推进落地',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, null, null);
    // 60 base + 8 含金量 + 10 主导 = 78
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.evidence.join(' ')).toMatch(/主导/);
  });

  it('case9: 核心成员 → +5', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '豆包项目',
          description: '作为核心成员参与项目开发',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, null, null);
    // 60 + 8 + 5 = 73
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.score).toBeLessThanOrEqual(85);
  });

  it('case10: 仅"参与/负责" → +2', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '豆包项目',
          description: '参与模型训练工作',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, null, null);
    // 60 + 8 + 2 = 70
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThanOrEqual(75);
  });

  it('case11: 无任何贡献度信号 → 0', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '豆包项目',
          description: '豆包大模型推理优化',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, null, null);
    // 60 + 8 = 68 (无贡献度)
    expect(result.score).toBeLessThanOrEqual(72);
  });
});

describe('Allen 2026-08-21 重写: 规模信号', () => {
  it('case12: 亿级/千万级 DAU → +5', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '豆包项目',
          description: '支撑亿级 DAU 在线推理',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, null, null);
    // 60 + 8 + 2 (默认参与) + 5 = 75
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.evidence.join(' ')).toMatch(/规模|亿级|千万级/);
  });

  it('case13: 百万级 → +3', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '豆包项目',
          description: '支撑百万 DAU',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, null, null);
    // 60 + 8 + 2 + 3 = 73
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.score).toBeLessThanOrEqual(80);
  });
});

describe('Allen 2026-08-21 重写: 完整高分场景', () => {
  it('case14: 顶级明星 + 主导 + 亿级 DAU → 应该接近 100', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '字节 Top Seed 项目',
          description: '主导项目从 0 到 1 搭建, 作为技术负责人推进, 支撑亿级 DAU',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, null, null);
    // top seed 校招 +15, 主导 +10, 亿级 +5 → 60+15+10+5 = 90
    expect(result.score).toBeGreaterThanOrEqual(85);
  });
});

describe('Allen 2026-08-21 重写: Deal-breaker 惩罚保留', () => {
  it('case15: 命中 deal-breaker → score -15', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: '豆包项目',
          description: '主导豆包, 涉及 P2P 金融业务',
          highlights: [],
        },
      ],
    });
    const profile: JobProfile = {
      dealBreakers: ['P2P 金融'],
      niceToHaves: [],
      culturalFit: '',
      targetCompanyTiers: [],
      targetSchoolTiers: [],
    };
    const result = scoreProjects(candidate, null, profile);
    // 60 + 8 + 10 + 2 - 15 = 65
    expect(result.score).toBeLessThanOrEqual(70);
    expect(result.evidence.join(' ')).toContain('deal-breaker');
  });
});

describe('Allen 2026-08-21 重写: JD 匹配对普通项目有加分', () => {
  it('case16: 无明星但 JD 命中多个 must 技能 → score 应 > 50', () => {
    const candidate = baseCandidate({
      projects: [
        {
          name: 'XX 电商系统',
          description: '基于 Python 和 PyTorch 构建推荐, 集成 LLM 做 RAG',
          highlights: [],
        },
      ],
    });
    const result = scoreProjects(candidate, baseJd(), null);
    // 普通项目 50 + JD must 命中(Python, PyTorch) ×4 + nice(LLM, RAG) ×2 = 50+8+4 = 62
    expect(result.score).toBeGreaterThan(50);
    expect(result.score).toBeLessThanOrEqual(70);
  });
});

describe('边界 sanity check', () => {
  it('score 永远在 [0, 100]', () => {
    // 即便有严重 deal-breaker,也不应低于 0
    const candidate = baseCandidate({
      projects: [
        {
          name: 'XX',
          description: 'bad bad bad',
          highlights: [],
        },
      ],
    });
    const profile: JobProfile = {
      dealBreakers: ['bad'],
      niceToHaves: [],
      culturalFit: '',
      targetCompanyTiers: [],
      targetSchoolTiers: [],
    };
    const result = scoreProjects(candidate, null, profile);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});