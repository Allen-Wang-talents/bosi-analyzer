// =====================================================
// 简历解析 - PDF / DOCX / TXT → Candidate (健壮版本)
// =====================================================
import type { Candidate, Education, WorkHistory, Project } from '@/types';
import { DEGREE_KEYWORDS } from '@/data/defaultKeywords';

// =====================================================
// 文件读取
// =====================================================

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
    reader.readAsText(file, 'utf-8');
  });
}

async function readPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false }).promise;
  } catch (e) {
    throw new Error(`PDF 无法解析（可能已加密或损坏）: ${e instanceof Error ? e.message : String(e)}`);
  }

  const lines: string[] = [];
  const maxPages = Math.min(pdf.numPages, 30); // 防止 50 页大文件 OOM
  for (let i = 1; i <= maxPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // PDF 文本项之间无固定分隔符 - 用空格合并，避免单词黏连
      const pageText = content.items
        .map((it: unknown) => {
          const item = it as { str?: string; hasEOL?: boolean };
          return item.str ?? '';
        })
        .join(' ');
      lines.push(pageText);
    } catch (pageErr) {
      // 单页失败不影响整体
      console.warn(`PDF 第 ${i} 页解析失败`, pageErr);
    }
  }
  const result = lines.join('\n').trim();
  if (!result) throw new Error('PDF 文本提取为空（可能是扫描件图片 PDF，请改用文本简历或 OCR 后粘贴）');
  return result;
}

async function readDocxText(file: File): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (!result.value?.trim()) throw new Error('DOCX 内容为空');
    return result.value;
  } catch (e) {
    throw new Error(`DOCX 解析失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// 入口
export async function extractResumeText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return await readPdfText(file);
  if (name.endsWith('.docx')) return await readDocxText(file);
  if (name.endsWith('.txt') || name.endsWith('.md')) return await readFileAsText(file);
  // 兜底：先按文本读取，失败提示
  try {
    return await readFileAsText(file);
  } catch {
    throw new Error(`不支持的文件类型: ${file.name}（仅支持 PDF / DOCX / TXT / MD）`);
  }
}

// =====================================================
// 文本预处理
// =====================================================

function preprocess(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 各种特殊空格归一化为普通空格
    .replace(/[​-‍﻿]/g, '')
    // 合并连续空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// =====================================================
// 文本 → Candidate 结构化
// =====================================================

export function parseResumeText(text: string): Candidate {
  const normalized = preprocess(text);

  // 安全提取每个字段，单字段失败不影响整体
  const safe = <T>(fn: () => T, fallback: T): T => {
    try { return fn(); } catch { return fallback; }
  };

  return {
    rawText: normalized,
    name: safe(() => extractName(normalized), undefined),
    contact: safe(() => extractContact(normalized), {}),
    birthYear: safe(() => extractBirthYear(normalized), undefined),
    totalYears: safe(() => extractTotalYears(normalized), 0),
    currentTitle: safe(() => extractCurrentTitle(normalized), undefined),
    currentCompany: safe(() => extractCurrentCompany(normalized), undefined),
    education: safe(() => extractEducation(normalized), []),
    workHistory: safe(() => extractWorkHistory(normalized), []),
    projects: safe(() => extractProjects(normalized), []),
    skills: safe(() => extractSkills(normalized), []),
  };
}

// =====================================================
// 通用工具
// =====================================================

// 多种日期格式统一识别
const DATE_PATTERNS = [
  // 2020.03 - 2023.06 / 2020-03 至 2023-06 / 2020/3 ~ 2023/6
  /(\d{4})[\.\-/年](\d{1,2})?[\s]*[-—–到至~～][\s]*(\d{4}|至今|现在|present|now|Present|Now)/i,
  // 2020 - 2023 / 2020 至今
  /(\d{4})\s*[-—–到至~～]\s*(\d{4}|至今|现在|present|now|Present|Now)/i,
  // Mar 2020 - Jun 2023 / March 2020 ~ Present
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\s*[-—–到至~～]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(\d{4}|present|now|Present|Now)/i,
];

function extractYearRange(text: string): { startYear: number; endYear: number | null } | null {
  for (const pat of DATE_PATTERNS) {
    const m = text.match(pat);
    if (m) {
      const startYear = parseInt(m[1], 10);
      const endStr = m[m.length - 1];
      const endYear = (endStr === '至今' || endStr === '现在' || /present|now/i.test(endStr))
        ? null
        : parseInt(endStr, 10);
      if (startYear >= 1970 && startYear <= new Date().getFullYear()) {
        return { startYear, endYear };
      }
    }
  }
  return null;
}

// =====================================================
// 字段提取
// =====================================================

// 出生年份
function extractBirthYear(text: string): number | undefined {
  const now = new Date();
  const currentYear = now.getFullYear();

  const patterns: Array<{ re: RegExp; offset?: number }> = [
    { re: /(\d{4})\s*年\s*(?:生|出生)/ },                              // 1995 年生
    { re: /(?:出生(?:年月|日期|年)?)[:：\s]+(\d{4})/ },               // 出生年月: 1995
    { re: /(?:Birthday|DOB|Date\s*of\s*Birth)[:：\s]+(\d{4})/i },     // DOB: 1995
    { re: /(?:年龄|Age)[:：\s]+(\d{1,2})\s*岁?/i },                   // 年龄: 27
  ];

  for (const { re } of patterns) {
    const m = text.match(re);
    if (!m) continue;
    if (re.source.includes('年龄') || re.source.includes('Age')) {
      const age = parseInt(m[1], 10);
      if (age >= 16 && age <= 70) return currentYear - age;
    } else {
      const y = parseInt(m[1], 10);
      if (y >= 1940 && y <= currentYear) return y;
    }
  }

  return undefined;
}

// 名字 - 通常在前 5 行
const SECTION_TITLE_BLACKLIST = /^(教育|工作|项目|技能|实习|个人|求职|联系方式|基本信息|个人简介|工作经历|教育经历|项目经验|专业技能|工作内容|Education|Work|Project|Skills?|Experience|Profile|Summary|Career|Objective)/i;

function extractName(text: string): string | undefined {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6);
  for (const line of lines) {
    if (line.length > 30) continue;
    if (SECTION_TITLE_BLACKLIST.test(line)) continue; // 跳过 section 标题行
    // 中文姓名 (2-4 字)
    const cn = line.match(/^([一-龥]{2,4})$/);
    if (cn) return cn[1];
    // "姓名: 张三" / "Name: 张三"
    const labeled = line.match(/^(?:姓名|Name|名字)\s*[:：]\s*([一-龥A-Za-z]{2,20})/);
    if (labeled) return labeled[1];
    // 英文姓名 "First Last"
    const en = line.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/);
    if (en) return en[1];
    // 第一行直接当名字的兜底（短文本）
    if (lines.indexOf(line) === 0 && line.length <= 10 && /^[一-龥A-Za-z·\s]+$/.test(line)) {
      return line.split(/\s+/)[0];
    }
  }
  return undefined;
}

// 联系方式
function extractContact(text: string): Candidate['contact'] {
  const phoneMatch = text.match(/(?<!\d)(1[3-9]\d{9})(?!\d)/);
  const emailMatch = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
  // 多种 location 写法
  const locationPatterns = [
    /(?:现居|所在地|居住地|Location|地址)[:：]\s*([^\n]+)/i,
    /(?:北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|重庆|天津|厦门|青岛|长沙|郑州)\s*(?:市)?/,
  ];
  let location: string | undefined;
  for (const p of locationPatterns) {
    const m = text.match(p);
    if (m) { location = m[1]?.trim() || m[0]; break; }
  }
  return {
    phone: phoneMatch?.[0],
    email: emailMatch?.[0],
    location,
  };
}

// 总工作年限
function extractTotalYears(text: string): number {
  // 直接匹配 "X 年经验" / "X years experience"
  const expMatch = text.match(/(\d+)\s*年(?:以上)?(?:.*?经验|工作经验|工作经历|从业|Work\s*Experience)/i);
  if (expMatch) {
    const y = parseInt(expMatch[1], 10);
    if (y >= 0 && y <= 50) return y;
  }

  // 否则从工作经历最早开始时间推算
  const allMatches = Array.from(text.matchAll(/(\d{4})\s*[\.\-/年]?\s*(\d{1,2})?\s*[-—–到至~～]\s*(?:\d{4}|至今|现在|present|now)/gi));
  if (allMatches.length === 0) return 0;

  const years = allMatches.map((m) => parseInt(m[1], 10)).filter((y) => y >= 1980 && y <= new Date().getFullYear());
  if (years.length === 0) return 0;

  const earliest = Math.min(...years);
  return Math.max(0, new Date().getFullYear() - earliest);
}

function extractCurrentTitle(text: string): string | undefined {
  const histories = extractWorkHistory(text);
  return histories[0]?.title;
}

function extractCurrentCompany(text: string): string | undefined {
  const histories = extractWorkHistory(text);
  return histories[0]?.company;
}

// 教育经历
function extractEducation(text: string): Education[] {
  const edu: Education[] = [];

  // 找教育段 - 支持更多标题
  const sectionPatterns = [
    /(?:教育经历|教育背景|学历|Education|Academic\s*Background)[:：]?\s*([\s\S]+?)(?=(?:工作经历|工作经验|项目经验|项目经历|工作内容|实习|Work\s*Experience|Projects?|Skills?|$))/i,
  ];

  let section = '';
  for (const p of sectionPatterns) {
    const m = text.match(p);
    if (m) { section = m[1]; break; }
  }

  // Fallback: 全文搜索 (没有标题的简历)
  if (!section) {
    const degreeKeywords = DEGREE_KEYWORDS.map((d) => d.keyword).join('|');
    const schoolPattern = /(?:清华|北大|复旦|浙大|交大|南大|中科大|哈工大|西交|华科|武大|北航|电子科技|北邮|西电|南科大|国科大|中科院|大学|学院|University|Institute|MIT|Stanford|Harvard|Berkeley|CMU|Carnegie)/i;
    if (schoolPattern.test(text) && new RegExp(degreeKeywords).test(text)) {
      section = text; // 用全文
    }
  }

  if (!section) return edu;

  const entries = section.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  for (const entry of entries) {
    // 必须包含学历或学校关键词才视为有效教育段
    const hasDegree = DEGREE_KEYWORDS.some((d) => entry.includes(d.keyword));
    const hasSchool = /(大学|学院|University|Institute|MIT|Stanford|Harvard|Berkeley|CMU|清华|北大|复旦|浙大|交大|南大|中科大|哈工大|西交|华科|武大|北航|电子科技|北邮|西电|南科大|国科大)/.test(entry);
    if (!hasDegree && !hasSchool) continue;

    const degree = inferDegree(entry);
    const school = extractSchoolName(entry);
    const yearRange = extractYearRange(entry);

    if (school || degree !== '其他') {
      edu.push({
        school: school || '',
        degree,
        major: extractMajor(entry),
        startYear: yearRange?.startYear,
        endYear: yearRange?.endYear ?? undefined,
      });
    }
  }

  return edu;
}

function inferDegree(text: string): Education['degree'] {
  for (const { keyword, level } of DEGREE_KEYWORDS) {
    if (text.includes(keyword)) return level;
  }
  return '其他';
}

function extractSchoolName(text: string): string {
  // 国内外常见高校 (含简称)
  const patterns: Array<[RegExp, string]> = [
    [/(清华(?:大学)?|清华姚班)/, '清华'],
    [/(北大(?:大学)?|北大图灵班)/, '北大'],
    [/(复旦(?:大学)?)/, '复旦'],
    [/((?:上海交|上交)(?:大|通大学|通大)(?:ACM班)?|上海交通(?:大学)?|上海交大ACM班)/, '上交'],
    [/(浙大|浙江大学)/, '浙大'],
    [/(南大|南京大学)/, '南大'],
    [/(中科大|中国科学技术大学)/, '中科大'],
    [/(人大|中国人民大学)/, '人大'],
    [/(北航|北京航空航天(?:大学)?)/, '北航'],
    [/(华科|华中科技(?:大学)?)/, '华科'],
    [/(武大|武汉大学)/, '武大'],
    [/(西交(?:大)?|西安交通(?:大学)?)/, '西交'],
    [/(哈工大|哈尔滨工业(?:大学)?)/, '哈工大'],
    [/(北邮|北京邮电(?:大学)?)/, '北邮'],
    [/(西电|西安电子科技(?:大学)?)/, '西电'],
    [/(电子科技(?:大学)?|电子科大|成电)/, '电子科大'],
    [/(南科大|南方科技(?:大学)?)/, '南科大'],
    [/(国科大|中国科学院大学|中科院大学)/, '国科大'],
    [/(西工大|西北工业(?:大学)?)/, '西工大'],
    [/(东大|东南大学|东北大学)/, '东大'],
    [/(天大|天津大学)/, '天大'],
    [/(山大|山东大学)/, '山大'],
    [/(川大|四川大学)/, '川大'],
    [/(吉大|吉林大学)/, '吉大'],
    [/(重大|重庆大学)/, '重大'],
    [/(湖大|湖南大学)/, '湖大'],
    [/(中南(?:大学)?)/, '中南'],
    [/(华南理工(?:大学)?)/, '华工'],
    [/(大连理工(?:大学)?)/, '大工'],
    [/(兰大|兰州大学)/, '兰大'],
    [/(中山(?:大学)?)/, '中大'],
    [/(厦大|厦门大学)/, '厦大'],
    [/(同济(?:大学)?)/, '同济'],
    [/(北理工|北京理工(?:大学)?)/, '北理工'],
    [/(Stanford|斯坦福)/, 'Stanford'],
    [/(MIT|麻省理工)/, 'MIT'],
    [/(Harvard|哈佛)/, 'Harvard'],
    [/(Cambridge|剑桥)/, 'Cambridge'],
    [/(Oxford|牛津)/, 'Oxford'],
    [/(Princeton|普林斯顿)/, 'Princeton'],
    [/(Yale|耶鲁)/, 'Yale'],
    [/(Berkeley|伯克利|UCB|UC Berkeley)/, 'Berkeley'],
    [/(Carnegie Mellon|卡内基梅隆|CMU)/, 'CMU'],
  ];

  for (const [re, _label] of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }

  // 兜底: 中文 "X 大学" / "X 学院"
  const cnMatch = text.match(/([一-龥]{2,8}(?:大学|学院|理工|交通大学|科技大学))/);
  if (cnMatch) return cnMatch[1];

  // 英文兜底
  const enMatch = text.match(/(University of [A-Z][a-zA-Z]+|[A-Z][a-z]+\s+University|[A-Z][a-z]+\s+Institute)/);
  if (enMatch) return enMatch[1];

  return '';
}

function extractMajor(text: string): string | undefined {
  const cnMatch = text.match(/([一-龥]{2,15})\s*专业/);
  if (cnMatch) return cnMatch[1];
  const enMatch = text.match(/Major[:：]?\s*([A-Za-z\s]+)/i);
  if (enMatch) return enMatch[1].trim().split(/\s{2,}/)[0]; // 截到第一个空白组
  return undefined;
}

// 工作经历
function extractWorkHistory(text: string): WorkHistory[] {
  const histories: WorkHistory[] = [];

  // 支持更多标题 (含实习)
  const sectionPatterns = [
    /(?:工作经历|工作经验|职业经历|从业经历|Employment|Work\s*Experience|Professional\s*Experience)[:：]?\s*([\s\S]+?)(?=(?:项目经验|项目经历|教育|技能|Education|Projects?|Skills?|$))/i,
    /(?:实习经历|Internship|Intern\s*Experience)[:：]?\s*([\s\S]+?)(?=(?:工作经历|项目|教育|技能|$))/i,
  ];

  let section = '';
  for (const p of sectionPatterns) {
    const m = text.match(p);
    if (m) { section = m[1]; break; }
  }

  // Fallback: 全文搜索带日期范围的段
  if (!section) {
    const hasAnyDate = /(\d{4})\s*[\.\-/年]?\s*(\d{1,2})?\s*[-—–到至~～]\s*(?:\d{4}|至今|现在|present|now)/i.test(text);
    if (hasAnyDate) section = text;
  }

  if (!section) return histories;

  // 拆段 - 优先按空行拆; 如果整段只有 1-2 行，再用日期模式切分
  let blocks = section.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length <= 1) {
    // 单段时按"日期开头"模式切分: 找出所有日期范围起点
    const dateStartRe = /(?=\b\d{4}[\.\-/年]?\d{0,2}\s*[-—–到至~～]\s*(?:\d{4}[\.\-/年]?\d{0,2}?|至今|现在|present|now))/gi;
    blocks = section.split(dateStartRe).map((b) => b.trim()).filter(Boolean);
  }

  for (const block of blocks) {
    const yearRange = extractYearRange(block);
    if (!yearRange) continue;

    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = lines[0] ?? '';

    // 提取公司名和职位 - 多种格式
    let company = '';
    let title = '';

    // 格式 1: "公司名 | 职位" / "公司名 | 职位 | 地点"
    const pipeMatch = firstLine.match(/^([^|\n]+?)\s*[|｜]\s*([^|\n]+)/);
    if (pipeMatch) {
      company = pipeMatch[1].trim();
      title = pipeMatch[2].trim();
    } else {
      // 格式 2: "公司名  职位" (多个空格分隔)
      const spaceMatch = firstLine.match(/^(.+?)\s{2,}(.+)$/);
      if (spaceMatch) {
        company = spaceMatch[1].trim();
        title = spaceMatch[2].trim();
      } else if (firstLine.includes('-') || firstLine.includes('—')) {
        // 格式 3: 单行 "2020.03-2023.06 公司名 职位" (日期在前面)
        const dateFirst = firstLine.match(/^\d{4}[\.\-/年]?\d{1,2}?\s*[-—–到至~～]\s*(?:\d{4}[\.\-/年]?\d{1,2}?|至今|现在|present|now)\s+(.+)$/i);
        if (dateFirst) {
          const rest = dateFirst[1];
          const tokens = rest.split(/\s{2,}|\s+(?=[一-龥]{2,}[a-zA-Z])|(?<=[一-龥])\s+(?=[A-Z])/);
          if (tokens.length >= 2) {
            company = tokens[0].trim();
            title = tokens.slice(1).join(' ').trim();
          } else {
            company = rest;
          }
        }
      }
      // 格式 4: 兜底 - 第一行整行当公司名
      if (!company) {
        // 清理掉纯日期前缀
        const cleaned = firstLine.replace(/^\d{4}[\.\-/年]?\d{0,2}\s*[-—–到至~～]\s*(?:\d{4}[\.\-/年]?\d{0,2}?|至今|现在|present|now)\s*/i, '').trim();
        company = cleaned || firstLine;
      }
    }

    if (!company || company.length > 50) continue;

    // 时长
    const endY = yearRange.endYear ?? new Date().getFullYear();
    const durationMonths = Math.max(0, (endY - yearRange.startYear) * 12);

    histories.push({
      company: company.slice(0, 30),
      title: title.slice(0, 50),
      startYear: yearRange.startYear,
      endYear: yearRange.endYear,
      durationMonths,
      description: lines.slice(1).join(' ').trim(),
    });
  }

  // 按时间倒序 (最新在前)
  return histories
    .sort((a, b) => {
      const aEnd = a.endYear ?? 9999;
      const bEnd = b.endYear ?? 9999;
      return bEnd - aEnd;
    })
    .slice(0, 10);
}

// 项目经验
function extractProjects(text: string): Project[] {
  const projects: Project[] = [];

  const sectionPatterns = [
    /(?:项目经验|项目经历|项目|Projects?|Project\s*Experience)[:：]?\s*([\s\S]+?)(?=(?:教育|技能|工作经历|获奖|Education|Skills?|Work|$))/i,
  ];

  let section = '';
  for (const p of sectionPatterns) {
    const m = text.match(p);
    if (m) { section = m[1]; break; }
  }

  // Fallback: 全文搜索项目关键词 ("负责"/"主导"/"开发了")
  if (!section) {
    const projectKw = /(?:负责|主导|设计|开发|实现|搭建|优化)[\s\S]{0,200}/;
    if (projectKw.test(text) && /\d{4}/.test(text)) {
      section = text;
    }
  }

  if (!section) return projects;

  const blocks = section.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // 项目名 - 通常第一行（去掉数字编号）
    let name = lines[0]
      .replace(/^[\d]+[.、)）]\s*/, '')
      .replace(/^【.+?】\s*/, '')
      .slice(0, 80);

    // 如果第一行只是日期，跳过
    if (/^\d{4}[\.\-/年]?/.test(name) && lines.length > 1) {
      name = lines[1].replace(/^[\d]+[.、)）]\s*/, '').slice(0, 80);
    }

    if (!name || name.length < 2) continue;
    // 过滤纯标题行（"项目经验"等）
    if (/^(?:项目|Project)/i.test(name)) continue;

    const description = lines.slice(1).join(' ').trim();

    projects.push({
      name,
      description: description.slice(0, 1000),
    });
  }

  return projects.slice(0, 10);
}

// 技能
function extractSkills(text: string): string[] {
  const skills = new Set<string>();

  const patterns = [
    /(?:专业技能|技能|技术栈|Skills?|Tech\s*Stack)[:：]?\s*([\s\S]+?)(?=(?:项目|工作经历|教育|获奖|Projects?|Work|$))/i,
  ];

  let section = '';
  for (const p of patterns) {
    const m = text.match(p);
    if (m) { section = m[1]; break; }
  }

  if (section) {
    // 拆 token
    const tokens = section.split(/[\s,，、;；。\n•●]+/).map((t) => t.trim()).filter(Boolean);
    for (const t of tokens) {
      if (t.length >= 2 && t.length <= 30) skills.add(t);
    }
  } else {
    // Fallback: 从全文抓常见技术词
    const techKeywords = [
      'React', 'Vue', 'Angular', 'TypeScript', 'JavaScript', 'Node.js', 'Python', 'Java', 'Go', 'Rust', 'C\\+\\+',
      'Kubernetes', 'Docker', 'AWS', 'GCP', 'Azure', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis',
      'PyTorch', 'TensorFlow', 'LLM', 'GPT', 'BERT', 'Transformer', 'RAG',
      'React Native', 'Flutter', 'Swift', 'Kotlin',
      '微服务', '分布式', '高并发', '大数据', '推荐系统', '搜索', '广告',
    ];
    for (const kw of techKeywords) {
      const re = new RegExp(`(?:^|[^一-龥A-Za-z])(${kw})(?:[^一-龥A-Za-z]|$)`);
      if (re.test(text)) skills.add(kw.replace(/\\\\/g, ''));
    }
  }

  return Array.from(skills).slice(0, 30);
}

// 公开入口
export async function parseResume(file: File): Promise<Candidate> {
  const text = await extractResumeText(file);
  return parseResumeText(text);
}
