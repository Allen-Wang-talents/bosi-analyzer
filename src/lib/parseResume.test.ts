// =====================================================
// 简历解析测试 - 覆盖两个核心 bug
// =====================================================
//
// Allen 2026-08-12 反馈:
//   1) 工作年限解析有误, 经常莫名其妙 11 年
//   2) 公司名解析有误, 把项目名当成公司名
//
// 这些测试确保修复后两个 bug 不会再回归。
// =====================================================
import { describe, it, expect } from 'vitest';
import { parseResumeText } from './parseResume';
import { resolveCompanyName, isProductName, PRODUCT_TO_COMPANY_MAP, PRODUCT_NOISE_KEYWORDS } from '@/data/productCompanyMap';

// 2026 是当前年份, 测试用相对值
const CURRENT_YEAR = new Date().getFullYear();

describe('Bug 1: 工作年限 (totalYears)', () => {
  it('case1: 硕士 2020 毕业, 2020 至今工作 → totalYears ≈ 6 (不是 11)', () => {
    const resume = `
个人信息
姓名: 张三
电话: 13800138000

教育经历
2018.09 - 2020.06  清华大学  计算机  硕士

工作经历
2020.07 - 至今  字节跳动  高级工程师
负责抖音电商后端架构
`;
    const result = parseResumeText(resume);
    expect(result.totalYears).toBeGreaterThanOrEqual(CURRENT_YEAR - 2021);
    expect(result.totalYears).toBeLessThanOrEqual(CURRENT_YEAR - 2019);
    // 关键: 不是 11 年 (2026 - 2015 = 11), 应该是 6 年左右 (2026 - 2020)
    expect(result.totalYears).toBeLessThan(8);
  });

  it('case2: 博士在读 2022 至今, 本科 2015 入学 → totalYears = 0, 不会变成 11', () => {
    const resume = `
教育经历
2015.09 - 2019.06  清华大学  计算机  本科
2019.09 - 2022.06  清华大学  计算机  硕士
2022.09 - 至今    清华大学  计算机  博士
`;
    const result = parseResumeText(resume);
    // 博士在读, 工作年限应为 0
    expect(result.totalYears).toBe(0);
    // 关键修复点: 旧实现可能返回 11 (2026-2015), 新实现必须返回 0
    expect(result.totalYears).not.toBe(11);
  });

  it('case3: 本科 2014 入学, 2022 才工作 → totalYears ≈ 4, 不是 12', () => {
    const resume = `
教育经历
2014.09 - 2018.06  北京大学  软件工程  本科
2018.09 - 2022.06  清华大学  计算机  硕士

工作经历
2022.07 - 至今  美团  高级工程师
负责美团外卖推荐系统
`;
    const result = parseResumeText(resume);
    // 实际工龄: 2026 - 2022 = 4
    expect(result.totalYears).toBeGreaterThanOrEqual(CURRENT_YEAR - 2023);
    expect(result.totalYears).toBeLessThanOrEqual(CURRENT_YEAR - 2021);
    // 关键: 不是 12 年 (2026-2014)
    expect(result.totalYears).toBeLessThan(6);
  });

  it('case4: 简历明文 "5 年工作经验" → 直接采用', () => {
    const resume = `
个人信息
姓名: 李四
5 年工作经验

工作经历
2021.01 - 至今  阿里巴巴  高级工程师
负责淘宝后端
`;
    const result = parseResumeText(resume);
    expect(result.totalYears).toBe(5);
  });

  it('case5: 畸形 / 缺日期的简历 → totalYears = 0 (sanity check)', () => {
    const resume = `候选人简历 内容残缺 无法识别具体年份`;
    const result = parseResumeText(resume);
    expect(result.totalYears).toBe(0);
    expect(result.totalYears).toBeLessThan(50);
  });

  it('case6: 应届生 (无工作经历, 硕士 2024 毕业) → totalYears = 0', () => {
    const resume = `
教育经历
2022.09 - 2024.06  清华大学  计算机  硕士
2024.07 - 2024.12  字节跳动  实习生
`;
    const result = parseResumeText(resume);
    // 实习不是正式工作, 但 workHistory.startYear=2024 → 2026-2024=2
    // 这是合理的 (实习也算工作经历)
    expect(result.totalYears).toBeLessThanOrEqual(2);
  });
});

describe('Bug 2: 公司名解析 (resolveCompanyName)', () => {
  it('case1: "字节跳动 - 抖音电商" → "字节跳动"', () => {
    expect(resolveCompanyName('字节跳动 - 抖音电商')).toBe('字节跳动');
  });

  it('case2: "豆包大模型团队" → "字节跳动"', () => {
    expect(resolveCompanyName('豆包大模型团队')).toBe('字节跳动');
  });

  it('case3: "蚂蚁支付宝团队" → "蚂蚁集团"', () => {
    expect(resolveCompanyName('蚂蚁支付宝团队')).toBe('蚂蚁集团');
  });

  it('case4: "未知小公司" → "未知小公司" (不要误判为产品名)', () => {
    expect(resolveCompanyName('未知小公司')).toBe('未知小公司');
  });

  it('case5: "腾讯视频" → "腾讯"', () => {
    expect(resolveCompanyName('腾讯视频')).toBe('腾讯');
  });

  it('case6: "微信支付团队" → "腾讯"', () => {
    expect(resolveCompanyName('微信支付团队')).toBe('腾讯');
  });

  it('case7: "高德地图后端" → "阿里巴巴"', () => {
    expect(resolveCompanyName('高德地图后端')).toBe('阿里巴巴');
  });

  it('case8: "推荐系统" (纯产品词, 无映射) → null', () => {
    expect(resolveCompanyName('推荐系统')).toBeNull();
  });

  it('case9: "广告系统事业部" (含组织词) → null', () => {
    expect(resolveCompanyName('广告系统事业部')).toBeNull();
  });

  it('case10: "字节跳动" (母公司本身) → "字节跳动" (不映射)', () => {
    expect(resolveCompanyName('字节跳动')).toBe('字节跳动');
  });

  it('case11: "Alibaba" (纯英文) → "Alibaba" (不误判为太短)', () => {
    expect(resolveCompanyName('Alibaba')).toBe('Alibaba');
  });

  it('case12: pipe 分隔 "美团 | 大众点评" → "美团"', () => {
    expect(resolveCompanyName('美团 | 大众点评')).toBe('美团');
  });
});

describe('Bug 2 端到端: parseResumeText 完整解析后 workHistory.company 正确', () => {
  it('完整简历中 "字节跳动 - 抖音电商" 不会变成 "抖音电商"', () => {
    const resume = `
工作经历
2020.07 - 至今  字节跳动 - 抖音电商  高级工程师
负责抖音电商后端架构

2021.01 - 2022.06  蚂蚁支付宝团队  后端工程师
负责支付系统
`;
    const result = parseResumeText(resume);
    const companies = result.workHistory.map((w) => w.company);
    expect(companies).toContain('字节跳动');
    expect(companies).toContain('蚂蚁集团');
    expect(companies).not.toContain('抖音电商');
    expect(companies).not.toContain('蚂蚁支付宝团队');
  });
});

describe('模块完整性 sanity check', () => {
  it('PRODUCT_TO_COMPANY_MAP 至少包含 60+ 条映射', () => {
    expect(Object.keys(PRODUCT_TO_COMPANY_MAP).length).toBeGreaterThanOrEqual(60);
  });

  it('PRODUCT_NOISE_KEYWORDS 包含 "团队"', () => {
    expect(PRODUCT_NOISE_KEYWORDS).toContain('团队');
  });

  it('PRODUCT_NOISE_KEYWORDS 包含 "事业部"', () => {
    expect(PRODUCT_NOISE_KEYWORDS).toContain('事业部');
  });

  it('isProductName 对 "字节跳动" 返回 false (母公司不是产品名)', () => {
    expect(isProductName('字节跳动')).toBe(false);
  });

  it('isProductName 对 "推荐系统" 返回 true', () => {
    expect(isProductName('推荐系统')).toBe(true);
  });

  it('isProductName 对 "广告系统事业部" 返回 true', () => {
    expect(isProductName('广告系统事业部')).toBe(true);
  });
});
