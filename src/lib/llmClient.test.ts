import { describe, it, expect } from 'vitest';
import { parseCandidateFromLLM } from './llmClient';

const CURRENT_YEAR = new Date().getFullYear();

describe('LLM 简历解析后处理：工作年限与公司名纠偏', () => {
  it('公司名产品词归一化：抖音电商 → 字节跳动，且 totalYears 按 workHistory 重算', () => {
    const rawText = `
工作经历
2022.07 - 至今  抖音电商  高级工程师
负责抖音电商后端架构
`;
    const llmJson = JSON.stringify({
      name: '张三',
      totalYears: 12,
      currentCompany: '抖音电商',
      currentTitle: '高级工程师',
      education: [],
      workHistory: [
        { company: '抖音电商', title: '高级工程师', startYear: 2022, endYear: null, description: '' },
      ],
      projects: [],
      skills: ['React'],
    });

    const result = parseCandidateFromLLM(llmJson, rawText);

    expect(result).not.toBeNull();
    expect(result?.workHistory.map((w) => w.company)).toContain('字节跳动');
    expect(result?.workHistory.map((w) => w.company)).not.toContain('抖音电商');
    expect(result?.currentCompany).toBe('字节跳动');
    expect(result?.totalYears).toBe(CURRENT_YEAR - 2022);
  });

  it('纯产品噪声公司名被丢弃，回退本地规则恢复真实公司与年限', () => {
    const rawText = `
工作经历
2021.01 - 至今  字节跳动  算法工程师
负责推荐系统
`;
    const llmJson = JSON.stringify({
      totalYears: 9,
      currentCompany: '推荐系统',
      currentTitle: '算法工程师',
      education: [],
      workHistory: [
        { company: '推荐系统', title: '算法工程师', startYear: 2021, endYear: null, description: '' },
      ],
      projects: [],
      skills: [],
    });

    const result = parseCandidateFromLLM(llmJson, rawText);

    expect(result).not.toBeNull();
    expect(result?.workHistory.map((w) => w.company)).toContain('字节跳动');
    expect(result?.currentCompany).toBe('字节跳动');
    expect(result?.totalYears).toBe(CURRENT_YEAR - 2021);
  });

  it('LLM 返回错误 totalYears 时按教育经历重算，不信任模型数值', () => {
    const rawText = `
教育经历
2016.09 - 2020.06  北京大学  计算机  本科
`;
    const llmJson = JSON.stringify({
      totalYears: 15,
      education: [
        { school: '北京大学', degree: '本科', major: '计算机', startYear: 2016, endYear: 2020 },
      ],
      workHistory: [],
      projects: [],
      skills: [],
    });

    const result = parseCandidateFromLLM(llmJson, rawText);

    expect(result).not.toBeNull();
    expect(result?.totalYears).toBe(CURRENT_YEAR - 2020);
  });
});

// =====================================================
// Allen 2026-08-21 回归测试 - 11 年 bug + 项目名误识为公司名
// 真实生产场景: LLM 把教育条目或项目名塞进 workHistory.company 字段
// =====================================================
describe('LLM 路径回归 (2026-08-21): 本地 workHistory 覆盖 LLM 错误输出', () => {
  it('LLM 把教育条目误识为工作段 → 本地覆盖, totalYears 不会变 11 年', () => {
    const rawText = `
个人信息
姓名: 王五
电话: 13800138000

教育经历
2014.09 - 2018.06  北京大学  软件工程  本科
2018.09 - 2020.06  清华大学  计算机  硕士

工作经历
2020.07 - 至今  字节跳动  高级工程师
负责抖音电商后端架构
`;
    // LLM 幻觉: 把教育条目也塞进 workHistory, 起 startYear=2014
    const llmJson = JSON.stringify({
      totalYears: 12,
      currentCompany: '字节跳动',
      currentTitle: '高级工程师',
      education: [
        { school: '北京大学', degree: '本科', major: '软件工程', startYear: 2014, endYear: 2018 },
        { school: '清华大学', degree: '硕士', major: '计算机', startYear: 2018, endYear: 2020 },
      ],
      workHistory: [
        // 错误: 把本科入学塞进 workHistory, 学校被识别成"公司"
        { company: '北京大学', title: '本科生', startYear: 2014, endYear: 2018, description: '' },
        { company: '清华大学', title: '研究生', startYear: 2018, endYear: 2020, description: '' },
        { company: '字节跳动', title: '高级工程师', startYear: 2020, endYear: null, description: '' },
      ],
      projects: [],
      skills: ['React'],
    });

    const result = parseCandidateFromLLM(llmJson, rawText);

    expect(result).not.toBeNull();
    // 关键修复: 本地 extractWorkHistory 会过滤掉 education-shaped 的 workHistory,
    //   所以 workHistory 应该只剩字节跳动一段, earliest startYear=2020
    const companies = result!.workHistory.map((w) => w.company);
    expect(companies).toContain('字节跳动');
    expect(companies).not.toContain('北京大学');
    expect(companies).not.toContain('清华大学');
    // 关键: 不是 11/12 年, 应该是真实工龄
    expect(result!.totalYears).toBe(CURRENT_YEAR - 2020);
    expect(result!.totalYears).toBeLessThan(8);
  });

  it('LLM 把项目名当公司名 (含年份的长尾字符串) → 被丢弃', () => {
    const rawText = `
工作经历
2022.01 - 至今  字节跳动  高级工程师
负责抖音商城改版项目
`;
    // LLM 把项目描述塞进 company 字段
    const llmJson = JSON.stringify({
      totalYears: 5,
      currentCompany: '字节跳动',
      currentTitle: '高级工程师',
      education: [],
      workHistory: [
        // 错误: 长尾字符串含年份, 显然不是公司名
        { company: '2022.01-至今字节跳动抖音商城改版项目后端负责人', title: '高级工程师', startYear: 2022, endYear: null, description: '' },
      ],
      projects: [],
      skills: [],
    });

    const result = parseCandidateFromLLM(llmJson, rawText);

    expect(result).not.toBeNull();
    // 本地 extractWorkHistory 会提取真正的 "字节跳动", 长尾字符串被丢弃
    const companies = result!.workHistory.map((w) => w.company);
    expect(companies).toContain('字节跳动');
    expect(companies).not.toContain('2022.01-至今字节跳动抖音商城改版项目后端负责人');
    expect(result!.currentCompany).toBe('字节跳动');
    expect(result!.totalYears).toBe(CURRENT_YEAR - 2022);
  });

  it('LLM 完全没识别 workHistory → 本地兜底提取, 不丢工作经历', () => {
    const rawText = `
工作经历
2021.05 - 至今  美团  算法工程师
负责外卖推荐系统

2018.07 - 2021.04  腾讯  后端工程师
负责微信支付后端
`;
    // LLM 漏识别 workHistory (典型幻觉)
    const llmJson = JSON.stringify({
      totalYears: 8,
      currentCompany: '美团',
      currentTitle: '算法工程师',
      education: [],
      workHistory: [],
      projects: [],
      skills: ['Python'],
    });

    const result = parseCandidateFromLLM(llmJson, rawText);

    expect(result).not.toBeNull();
    // 本地 extractWorkHistory 会正确提取两段
    const companies = result!.workHistory.map((w) => w.company);
    expect(companies).toContain('美团');
    expect(companies).toContain('腾讯');
    expect(result!.totalYears).toBe(CURRENT_YEAR - 2018);
  });
});
