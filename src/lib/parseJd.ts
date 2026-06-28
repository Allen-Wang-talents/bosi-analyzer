// =====================================================
// JD 文本解析 - 从原始文本中提取结构化字段
// =====================================================
import type { JD } from '@/types';
import { TECH_KEYWORDS_SEED } from '@/data/defaultKeywords';

export function parseJd(rawText: string): JD | null {
  const text = (rawText ?? '').trim();
  if (!text) return null;

  const result: JD = {
    rawText: text,
    title: '',
    responsibilities: [],
    mustHaveSkills: [],
    niceToHaveSkills: [],
    minYears: 0,
    location: '',
  };

  // 1. 标题 (通常在前 200 字内)
  result.title = extractTitle(text);

  // 2. 经验年限
  result.minYears = extractMinYears(text);

  // 3. 地点
  result.location = extractLocation(text);

  // 4. 薪资
  result.compRange = extractComp(text);

  // 5. 行业
  result.industry = extractIndustry(text);

  // 6. 技能 (must/nice)
  const skills = extractSkills(text);
  result.mustHaveSkills = skills.must;
  result.niceToHaveSkills = skills.nice;

  // 7. 职责
  result.responsibilities = extractResponsibilities(text);

  return result;
}

function extractTitle(text: string): string {
  // 优先匹配 "职位: xxx" / "岗位: xxx" / "招聘: xxx"
  const labelMatch = text.match(/(?:职位|岗位|招聘|标题|Position|Title)[:：]\s*([^\n]+)/i);
  if (labelMatch) return labelMatch[1].trim().slice(0, 50);

  // 否则取第一行非空内容
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 5)) {
    // 跳过太短或带特殊字符的行
    if (line.length < 2 || line.length > 60) continue;
    if (/^[#\-\*]/.test(line)) continue;
    return line.slice(0, 50);
  }
  return '';
}

function extractMinYears(text: string): number {
  // 匹配 "X 年以上" / "X+ years" / "X-Y 年"
  const patterns = [
    /(\d+)\s*年以上/,
    /至少\s*(\d+)\s*年/,
    /(\d+)\s*\+\s*years?/i,
    /(\d+)\s*-\s*\d+\s*年/, // 取下限
    /(\d+)\s*years?\s+of/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return 0;
}

function extractLocation(text: string): string {
  // 匹配 "工作地点: xxx" / "地点: xxx" / "Location: xxx" / "Base: xxx"
  const patterns = [
    /(?:工作地点|地点|Location|工作地|Base)[:：]\s*([^\n]+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim().slice(0, 60);
  }

  // 兜底: 找 "北京/上海/深圳/杭州/广州/成都/..."
  const cities = ['北京', '上海', '深圳', '广州', '杭州', '成都', '南京', '武汉', '苏州', '西安', '重庆', '厦门', '长沙', '青岛'];
  for (const c of cities) {
    if (text.includes(c)) return c;
  }
  return '';
}

function extractComp(text: string): JD['compRange'] | undefined {
  // 匹配 "30-50K" / "30k-50k" / "30-50k" / "薪资: 30-50K"
  const patterns = [
    /(?:薪资|薪酬|Salary|Comp)[:：]?\s*(\d+)\s*[-~到至]\s*(\d+)\s*([Kk]?)/i,
    /(\d+)\s*[-~到至]\s*(\d+)\s*([Kk])/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const min = parseInt(m[1], 10);
      const max = parseInt(m[2], 10);
      const unit = m[3] ? 1000 : 1; // K = 千
      return { min: min * unit, max: max * unit, currency: 'CNY' };
    }
  }
  return undefined;
}

function extractIndustry(text: string): string {
  const industries = [
    '互联网', '电商', '金融', '科技', '教育', '医疗', '游戏',
    '广告', '营销', '传媒', '汽车', '物流', '出行', '本地生活',
    '社交', '内容', '工具', '企业服务', 'SaaS', '硬件', '半导体',
    'AI', '人工智能', '大数据', '云计算', '区块链',
  ];
  for (const ind of industries) {
    if (text.includes(ind)) return ind;
  }
  return '';
}

function extractSkills(text: string): { must: string[]; nice: string[] } {
  const must = new Set<string>();
  const nice = new Set<string>();

  // 必须技能关键词 - 通常出现在 "任职要求" / "Requirements" / "必备" 段落
  const mustSectionPatterns = [
    /(?:任职要求|岗位要求|Requirements?|必备|必须)[:：]?\s*([\s\S]+?)(?=(?:加分|优先|Nice|PREFERRED|我们提供|$))/i,
  ];

  let mustSection = '';
  for (const p of mustSectionPatterns) {
    const m = text.match(p);
    if (m) {
      mustSection = m[1];
      break;
    }
  }

  // 加分技能 - "加分项" / "Nice to have" / "优先" 段落
  const niceSectionPatterns = [
    /(?:加分项|优先|Nice\s*to\s*have|Preferred)[:：]?\s*([\s\S]+?)$/i,
  ];
  let niceSection = '';
  for (const p of niceSectionPatterns) {
    const m = text.match(p);
    if (m) niceSection = m[1];
  }

  // 从 mustSection 提取技能
  for (const kw of TECH_KEYWORDS_SEED) {
    if (mustSection.includes(kw)) must.add(kw);
  }
  // 全文兜底
  for (const kw of TECH_KEYWORDS_SEED) {
    if (text.includes(kw)) {
      if (niceSection.includes(kw)) nice.add(kw);
      else if (!must.has(kw)) must.add(kw);
    }
  }

  return { must: Array.from(must), nice: Array.from(nice) };
}

function extractResponsibilities(text: string): string[] {
  // 匹配 "工作职责" / "Responsibilities" / "你将负责" 段落的列表项
  const patterns = [
    /(?:工作职责|岗位职责|Responsibilities|你将负责|工作内容)[:：]?\s*([\s\S]+?)(?=(?:任职要求|岗位要求|Requirements|必备|必须|加分|优先|$))/i,
  ];

  let section = '';
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      section = m[1];
      break;
    }
  }

  if (!section) return [];

  // 拆分行/编号
  const lines = section.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const responsibilities: string[] = [];
  for (const line of lines) {
    // 去掉列表前缀 "1." / "•" / "-" / "、" / "（1）"
    const cleaned = line.replace(/^[\d]+[.、)）]\s*/, '').replace(/^[•\-\*]\s*/, '').trim();
    if (cleaned.length >= 4 && cleaned.length <= 200) {
      responsibilities.push(cleaned);
    }
  }

  return responsibilities.slice(0, 12);
}