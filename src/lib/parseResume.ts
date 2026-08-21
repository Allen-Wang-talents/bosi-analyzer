// =====================================================
// 简历解析 - PDF / DOCX / TXT / 图片 OCR / HTML / RTF → Candidate
// =====================================================
//
// 支持格式 (Allen 2026-07-22 增强):
//   1. PDF (含扫描件自动 OCR 兜底)
//   2. DOCX
//   3. TXT / MD
//   4. 图片简历 (JPG / PNG / WebP / HEIC) - 浏览器端 tesseract.js OCR
//   5. HTML / HTM - DOMParser 提取文本
//   6. RTF - 正则去除控制字符
//
// 精度增强:
//   - 学校识别走 SCHOOL_ALIAS_INDEX (含 985/211/双一流 + QS Top 100 + fuzzy)
//   - 专业识别走 MAJOR_ALIAS_INDEX
//   - 日期正则覆盖中英文月份混排
//   - 电话 regex 排除身份证号干扰
//   - 项目名提取更鲁棒（多行、空行、首字符为日期）
// =====================================================
import type { Candidate, Education, WorkHistory, Project } from '@/types';
import { DEGREE_KEYWORDS } from '@/data/defaultKeywords';
import { SCHOOL_ALIAS_INDEX } from '@/data/schoolLibrary';
import { MAJOR_ALIAS_INDEX } from '@/data/majorLibrary';
import { resolveCompanyName } from '@/data/productCompanyMap';

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
  const maxPages = Math.min(pdf.numPages, 30);
  for (let i = 1; i <= maxPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((it: unknown) => {
          const item = it as { str?: string; hasEOL?: boolean };
          return item.str ?? '';
        })
        .join(' ');
      lines.push(pageText);
    } catch (pageErr) {
      console.warn(`PDF 第 ${i} 页解析失败`, pageErr);
    }
  }
  const result = lines.join('\n').trim();
  if (!result) throw new Error('PDF 文本提取为空（可能是扫描件图片 PDF，请改用文本简历或 OCR 后粘贴）');
  return result;
}

// 扫描件 PDF：每页渲染到 canvas，再 OCR
async function readPdfScanned(
  file: File,
  onProgress?: (msg: string) => void
): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data, disableFontFace: true, useSystemFonts: false }).promise;
  const maxPages = Math.min(pdf.numPages, 10); // 扫描件按页 OCR 比较慢，限制 10 页

  const allText: string[] = [];
  for (let i = 1; i <= maxPages; i++) {
    onProgress?.(`OCR 识别第 ${i}/${maxPages} 页...`);
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x 提高 OCR 识别率
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) continue;
    const txt = await ocrImageBlob(blob, onProgress);
    allText.push(txt);
  }
  const merged = allText.join('\n').trim();
  if (!merged) throw new Error('扫描件 PDF OCR 后仍无文本（图片可能太模糊）');
  return merged;
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

// 图片简历 OCR - 浏览器端 tesseract.js，中英文混合识别
async function readImageText(
  file: File,
  onProgress?: (msg: string) => void
): Promise<string> {
  // 拒绝浏览器/tesseract 不支持的格式
  const unsupported = ['image/heic', 'image/heif', 'image/avif', 'image/tiff'];
  if (unsupported.includes(file.type)) {
    throw new Error(
      `${file.name} 格式 (${file.type}) 当前不支持解码。请先用其他工具转为 JPG/PNG 后再上传`
    );
  }
  onProgress?.('加载 OCR 引擎 (首次约 5-10 秒)...');
  const tesseract = await import('tesseract.js');
  const worker = await tesseract.createWorker(['chi_sim', 'eng'], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.(`OCR 识别中... ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  try {
    const { data } = await worker.recognize(file);
    const text = (data.text ?? '').trim();
    if (!text) throw new Error('图片 OCR 后无文字内容（可能图片太模糊或非简历）');
    return text;
  } finally {
    await worker.terminate();
  }
}

async function ocrImageBlob(
  blob: Blob,
  onProgress?: (msg: string) => void
): Promise<string> {
  onProgress?.('加载 OCR 引擎...');
  const tesseract = await import('tesseract.js');
  const worker = await tesseract.createWorker(['chi_sim', 'eng'], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.(`OCR 识别中... ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  try {
    const { data } = await worker.recognize(blob);
    return (data.text ?? '').trim();
  } finally {
    await worker.terminate();
  }
}

async function readHtmlText(file: File): Promise<string> {
  const raw = await readFileAsText(file);
  return htmlToText(raw);
}

async function readRtfText(file: File): Promise<string> {
  const raw = await readFileAsText(file);
  return rtfToText(raw);
}

function htmlToText(html: string): string {
  // 移除 script/style
  const noScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const doc = new DOMParser().parseFromString(noScripts, 'text/html');
  // block-level 标签后插换行
  const blockTags = /<(p|div|br|h[1-6]|li|tr|td|th|section|article|header|footer)\b[^>]*>/gi;
  const formatted = doc.body.innerHTML.replace(blockTags, '\n');
  const tmp = document.createElement('div');
  tmp.innerHTML = formatted;
  const text = (tmp.textContent ?? '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('HTML 内容为空');
  return text;
}

function rtfToText(rtf: string): string {
  // 简单 RTF 解析：移除控制字符与符号，保留可见文本
  // 去除 group 头 {\rtf1... 之类
  let text = rtf
    .replace(/\\rtf\d+/g, '')
    .replace(/\\ansi|\\ansicpg\d+/g, '')
    .replace(/\\deff?\d+/g, '')
    .replace(/\\fonttbl|\\colortbl|\\stylesheet/g, '')
    // 转义字符：\'hh 还原为单字节（最佳努力）
    .replace(/\\'(\w\w)/g, (_m, hex: string) => {
      const code = parseInt(hex, 16);
      // 跳过 RTF 编码标识区
      if (code < 128) return String.fromCharCode(code);
      return '';
    })
    // 段落分隔
    .replace(/\\par\b/g, '\n')
    .replace(/\\line\b/g, '\n')
    // 表格行
    .replace(/\\row\b/g, '\n')
    // 特殊字符
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .replace(/\\\*\\[a-z]+\d*\s?/g, ' ')
    .replace(/\\[a-z]+\d*\s?/g, ' ')
    // 移除 group braces
    .replace(/[{}]/g, '')
    // 移除多余空白
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
  if (!text) throw new Error('RTF 内容解析为空');
  return text;
}

// =====================================================
// 入口：分发到具体解析器
// =====================================================
export type ParseProgress = (msg: string) => void;

export async function extractResumeText(
  file: File,
  onProgress?: ParseProgress
): Promise<string> {
  const name = file.name.toLowerCase();
  const isImage = name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')
    || name.endsWith('.webp') || name.endsWith('.bmp') || name.endsWith('.gif')
    || name.endsWith('.heic') || name.endsWith('.heif');
  const isPdf = name.endsWith('.pdf');
  const isDocx = name.endsWith('.docx');
  const isHtml = name.endsWith('.html') || name.endsWith('.htm');
  const isRtf = name.endsWith('.rtf');

  if (isImage) return await readImageText(file, onProgress);

  if (isPdf) {
    try {
      return await readPdfText(file);
    } catch (textErr) {
      // 扫描件 PDF：文本提取为空，自动 OCR 兜底
      const msg = textErr instanceof Error ? textErr.message : String(textErr);
      if (msg.includes('文本提取为空') || msg.includes('可能已加密')) {
        onProgress?.('检测到扫描件 PDF，启用 OCR 兜底...');
        return await readPdfScanned(file, onProgress);
      }
      throw textErr;
    }
  }

  if (isDocx) return await readDocxText(file);
  if (isHtml) return await readHtmlText(file);
  if (isRtf) return await readRtfText(file);
  if (name.endsWith('.txt') || name.endsWith('.md')) return await readFileAsText(file);

  // 兜底：先按文本读取
  try {
    return await readFileAsText(file);
  } catch {
    throw new Error(
      `不支持的文件类型: ${file.name}。支持 PDF / DOCX / TXT / MD / 图片(JPG/PNG/WebP) / HTML / RTF`
    );
  }
}

// 剪贴板粘贴入口：支持图片（OCR）或 HTML（提取文本）或纯文本
export async function extractFromClipboardItem(
  item: ClipboardItem,
  onProgress?: ParseProgress
): Promise<string> {
  // 优先图片
  for (const type of item.types) {
    if (type.startsWith('image/')) {
      const blob = item.getType(type);
      if (blob) {
        onProgress?.('检测到剪贴板图片，启动 OCR...');
        const file = new File([await blob], `pasted-${Date.now()}.${type.split('/')[1]}`, { type });
        return await readImageText(file, onProgress);
      }
    }
  }
  // 其次 HTML
  for (const type of item.types) {
    if (type === 'text/html') {
      const blob = await item.getType(type);
      if (blob) {
        const html = await blob.text();
        onProgress?.('检测到剪贴板 HTML，提取文本...');
        return htmlToText(html);
      }
    }
  }
  // 兜底文本
  for (const type of item.types) {
    if (type === 'text/plain') {
      const blob = await item.getType(type);
      if (blob) {
        const text = await blob.text();
        if (text.trim()) return text;
      }
    }
  }
  throw new Error('剪贴板无可识别的内容');
}

// =====================================================
// 文本预处理
// =====================================================

function preprocess(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 仅清理零宽字符：U+200B 零宽空格 + U+FEFF BOM。绝不能误伤普通连字符 '-'，
    // 否则日期 "2020.03 - 2023.06" 会被破坏成 "2020.03  2023.06"，所有日期匹配全部失败。
    .replace(/[\u200B\uFEFF]/g, '')
    // 合并连续空行
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// =====================================================
// 文本 → Candidate 结构化
// =====================================================

export function parseResumeText(text: string): Candidate {
  const normalized = preprocess(text);

  const safe = <T>(fn: () => T, fallback: T): T => {
    try { return fn(); } catch { return fallback; }
  };

  // 注意顺序：education 必须先于 totalYears, workHistory 先于 currentTitle/currentCompany
  const education = safe(() => extractEducation(normalized), []);
  const workHistory = safe(() => extractWorkHistory(normalized), []);

  return {
    rawText: normalized,
    name: safe(() => extractName(normalized), undefined),
    contact: safe(() => extractContact(normalized), {}),
    birthYear: safe(() => extractBirthYear(normalized), undefined),
    totalYears: safe(() => extractTotalYears(normalized, education, workHistory), 0),
    currentTitle: safe(() => extractCurrentTitle(normalized, workHistory), undefined),
    currentCompany: safe(() => extractCurrentCompany(normalized, workHistory), undefined),
    education,
    workHistory,
    projects: safe(() => extractProjects(normalized), []),
    skills: safe(() => extractSkills(normalized), []),
  };
}

// =====================================================
// 通用工具
// =====================================================

// 多种日期格式统一识别（中英月份混排 + 多种连接符）
const DATE_PATTERNS = [
  // 2020.03 - 2023.06 / 2020-03 至 2023-06 / 2020/3 ~ 2023/6
  /(\d{4})[\.\-/年](\d{1,2})?[\s]*[-—–到至~～][\s]*(\d{4}|至今|现在|present|now|Present|Now)/i,
  // 2020 - 2023 / 2020 至今
  /(\d{4})\s*[-—–到至~～]\s*(\d{4}|至今|现在|present|now|Present|Now)/i,
  // Mar 2020 - Jun 2023 / March 2020 ~ Present / Jan 2020 - Present
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\s*[-—–到至~～]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(\d{4}|present|now|Present|Now)/i,
  // 2020 Mar - 2023 Jun（年份在前）
  /(\d{4})\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*[-—–到至~～]\s*(\d{4}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?|present|now|Present|Now)/i,
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
// 产品/项目名 vs 公司名分离
//
// Allen 2026-08-12 反馈:
//   "公司名解析不准确，会把项目名称或产品名称解析为公司名称，
//    而真正的公司名称却未识别，导致评估环节偏差很大。"
//
// 修复策略:
//   1) 引入 PRODUCT_TO_COMPANY_MAP 反向映射（产品名 → 母公司名）
//   2) 引入 PRODUCT_NOISE_KEYWORDS 黑名单（产品/系统/平台特征词）
//   3) extractWorkHistory 各格式识别公司名后过 resolveCompanyName 校验
//   4) 命中产品名 → 用反映射替换为母公司
//   5) 命中纯产品词（无映射）→ 跳过该候选，往下找替代行
//
// Allen 2026-08-12 增强:
//   - 抽出 resolveCompanyName / isProductName 到 src/data/productCompanyMap.ts
//     让 LLM prompt 也能注入精简映射表，避免 LLM 不知道反向规则
//   - resolveCompanyName 增加多分隔符切分逻辑（"字节跳动 - 抖音电商"）
//   - PRODUCT_NOISE_KEYWORDS 增补组织/团队词: 团队 / 事业部 / BU / BG / 实验室
// =====================================================
//
// 本模块所有公司名解析逻辑已迁移到 `@/data/productCompanyMap`，此处直接复用。

function extractBirthYear(text: string): number | undefined {
  const now = new Date();
  const currentYear = now.getFullYear();

  const patterns: Array<{ re: RegExp; offset?: number }> = [
    { re: /(\d{4})\s*年\s*(?:生|出生)/ },
    { re: /(?:出生(?:年月|日期|年)?)[:：\s]+(\d{4})/ },
    { re: /(?:Birthday|DOB|Date\s*of\s*Birth)[:：\s]+(\d{4})/i },
    { re: /(?:年龄|Age)[:：\s]+(\d{1,2})\s*岁?/i },
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

const SECTION_TITLE_BLACKLIST = /^(教育|工作|项目|技能|实习|个人|求职|联系方式|基本信息|个人简介|工作经历|教育经历|项目经验|专业技能|工作内容|Education|Work|Project|Skills?|Experience|Profile|Summary|Career|Objective)/i;

function extractName(text: string): string | undefined {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6);
  for (const line of lines) {
    if (line.length > 30) continue;
    if (SECTION_TITLE_BLACKLIST.test(line)) continue;
    const cn = line.match(/^([一-龥]{2,4})$/);
    if (cn) return cn[1];
    const labeled = line.match(/^(?:姓名|Name|名字)\s*[:：]\s*([一-龥A-Za-z]{2,20})/);
    if (labeled) return labeled[1];
    const en = line.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)$/);
    if (en) return en[1];
    if (lines.indexOf(line) === 0 && line.length <= 10 && /^[一-龥A-Za-z·\s]+$/.test(line)) {
      return line.split(/\s+/)[0];
    }
  }
  return undefined;
}

function extractContact(text: string): Candidate['contact'] {
  // 电话：先排除身份证号（17/18 位，最后一位可能为 X），再匹配手机
  // 排除规则：18 位 ID 中的 11 位连续数字若前 6 位为地区码且后 4 位为顺序+校验，则跳过
  const cleaned = text.replace(/[一-龥]{2,}身份证/g, ' '); // 抹去身份证描述前缀
  // 简单策略：先收集所有候选号码，再过滤掉与身份证号关联的
  const allPhones = Array.from(cleaned.matchAll(/(?<!\d)(1[3-9]\d{9})(?!\d)/g)).map((m) => m[0]);
  // 找身份证号（粗略）：18 位或 17+X，以年份开头
  const idCardRe = /(?<!\d)([1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx])(?!\d)/g;
  const idCards = Array.from(cleaned.matchAll(idCardRe)).map((m) => m[0]);
  let phoneMatch: RegExpMatchArray | null = null;
  for (const phone of allPhones) {
    // 如果这个手机号出现在身份证号邻接位置（前后 5 个字符），视为误识别
    const surrounded = cleaned.includes(`${phone}`) && !idCards.some((id) => id.includes(phone));
    if (surrounded) {
      phoneMatch = phone.match(/(?<!\d)(1[3-9]\d{9})(?!\d)/);
      if (phoneMatch) break;
    }
  }

  const emailMatch = cleaned.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);

  const locationPatterns = [
    /(?:现居|所在地|居住地|Location|地址)[:：]\s*([^\n]+)/i,
    /(?:北京|上海|广州|深圳|杭州|成都|武汉|南京|苏州|西安|重庆|天津|厦门|青岛|长沙|郑州|合肥|福州|济南|昆明|东莞|无锡|宁波|佛山|沈阳|大连|哈尔滨|南昌|贵阳|南宁|太原|石家庄|兰州|海口|乌鲁木齐|贵阳|唐山|徐州|烟台|温州|珠海|泉州|南宁|金华|嘉兴|南通|绍兴|常州|扬州|台州|绍兴|惠州|中山)\s*(?:市)?/,
  ];
  let location: string | undefined;
  for (const p of locationPatterns) {
    const m = cleaned.match(p);
    if (m) { location = m[1]?.trim() || m[0]; break; }
  }

  return {
    phone: phoneMatch?.[0],
    email: emailMatch?.[0],
    location,
  };
}

// 工作年限计算
//
// 优先级 (Allen 2026-08-12 修复):
//   1) workHistory 中最早 startYear → now（最可靠，反映真实工作起始）
//   2) 简历显式标注 "X 年经验"
//   3) 最高学历 endYear → now（适用应届/在校未工作的实习生）
//   4) 兜底 0
//
// 避免错误: 旧实现 step 3 用「全文最早年份」, 把本科入学年算进来, 把
//   2014 本科入学 → 2018 硕士 → 2020 硕士毕业 → 2022 入职 → 2026 工龄应为 4 年 (2026-2022),
//   旧实现返回 12 年 (2026-2014)。
// =====================================================
const DEGREE_LEVEL: Record<Education['degree'], number> = {
  '博士': 4,
  '硕士': 3,
  '本科': 2,
  '专科': 1,
  '其他': 0,
};

function sanitizeYears(y: number): number {
  if (!Number.isFinite(y) || y < 0 || y > 50) return 0;
  return y;
}

export function extractTotalYears(
  text: string,
  education: Education[],
  workHistory: WorkHistory[]
): number {
  const currentYear = new Date().getFullYear();

  // 1) workHistory 中最早 startYear → now（最可靠，反映真实工作起始）
  if (workHistory.length > 0) {
    const validStarts = workHistory
      .map((w) => w.startYear)
      .filter((y): y is number => typeof y === 'number' && y >= 1980 && y <= currentYear);
    if (validStarts.length > 0) {
      const earliest = Math.min(...validStarts);
      const years = sanitizeYears(currentYear - earliest);
      // workHistory 路径通常正确, 但保险起见兜底
      if (years > 0) return years;
    }
  }

  // 2) 简历显式标注 "X 年经验"
  const expMatch = text.match(/(\d+)\s*年(?:以上)?(?:.*?经验|工作经验|工作经历|从业|Work\s*Experience)/i);
  if (expMatch) {
    const y = parseInt(expMatch[1], 10);
    const sanitized = sanitizeYears(y);
    if (sanitized > 0) return sanitized;
  }

  // 3) 最高学历 → now（适用应届/在校未工作的实习生）
  if (education.length > 0) {
    // 按 degree level 降序排, 找最高学历
    const sortedByDegree = [...education].sort(
      (a, b) => (DEGREE_LEVEL[b.degree] ?? 0) - (DEGREE_LEVEL[a.degree] ?? 0)
    );
    const topDegreeLevel = DEGREE_LEVEL[sortedByDegree[0].degree] ?? 0;
    const topDegreeEntries = sortedByDegree.filter(
      (e) => (DEGREE_LEVEL[e.degree] ?? 0) === topDegreeLevel
    );
    // Allen 2026-08-12 修复:
    //   若最高学历中任何一条 in-progress (无 endYear 或 endYear > now),
    //   视为仍在读 → totalYears = 0, 不应该用次低学历的 endYear 兜底,
    //   否则会把博士在读算成本科/硕士毕业后年限 (典型 11 年 bug).
    const hasOngoing = topDegreeEntries.some(
      (e) => !e.endYear || e.endYear > currentYear
    );
    if (hasOngoing) return 0;

    // 否则用已完成的最高学历
    const validEdu = education
      .filter((e) => e.endYear && e.endYear >= 1980 && e.endYear <= currentYear)
      .sort((a, b) => {
        const lvl = (DEGREE_LEVEL[b.degree] ?? 0) - (DEGREE_LEVEL[a.degree] ?? 0);
        if (lvl !== 0) return lvl;
        return (b.endYear ?? 0) - (a.endYear ?? 0);
      });
    if (validEdu[0]?.endYear) {
      return sanitizeYears(currentYear - validEdu[0].endYear);
    }
  }

  return 0;
}

function extractCurrentTitle(_text: string, histories: WorkHistory[]): string | undefined {
  return histories[0]?.title;
}

function extractCurrentCompany(_text: string, histories: WorkHistory[]): string | undefined {
  return histories[0]?.company;
}

// 教育经历
//
// Allen 2026-07-24 修复:
//   之前用 section.split(/\n+/) 把每行当作独立条目，导致多行教育条目（如
//   "2016.09 - 2020.06\n清华大学\n软件工程 本科"）被拆成 3 行：
//   - "2016.09 - 2020.06" 没有 school/degree 被跳过
//   - "清华大学" 没有 endYear 单独入库
//   - "软件工程 本科" 没有 school 单独入库
//   结果：endYear 全是 undefined → totalYears 计算失败回退到最早年份。
//
// 修复策略:
//   1) 按空行（段落）而非单换行切分条目
//   2) 每个条目内部所有行合并后统一提取 year/school/degree/major
//   3) 处理单行紧凑格式 "2018-2020 北大 计算机 硕士" 和多行宽松格式
function extractEducation(text: string): Education[] {
  const edu: Education[] = [];

  const sectionPatterns = [
    /(?:教育经历|教育背景|学历|Education|Academic\s*Background)[:：]?\s*([\s\S]+?)(?=(?:工作经历|工作经验|项目经验|项目经历|工作内容|实习|Work\s*Experience|Projects?|Skills?|$))/i,
  ];

  let section = '';
  for (const p of sectionPatterns) {
    const m = text.match(p);
    if (m) { section = m[1]; break; }
  }

  // Fallback: 全文搜索
  if (!section) {
    const degreeKeywords = DEGREE_KEYWORDS.map((d) => d.keyword).join('|');
    const schoolPattern = /(?:清华|北大|复旦|浙大|交大|南大|中科大|哈工大|西交|华科|武大|北航|电子科技|北邮|西电|南科大|国科大|中科院|大学|学院|University|Institute|MIT|Stanford|Harvard|Berkeley|CMU|Carnegie)/i;
    if (schoolPattern.test(text) && new RegExp(degreeKeywords).test(text)) {
      section = text;
    }
  }

  if (!section) return edu;

  // 切分条目：
  //   1) 先按空行切（多行条目用空行分隔）
  //   2) 切出的段落若包含多个 date range（说明是多个 entry 拼在一段），
  //      进一步按 date 模式切分，避免不同 entry 的 school/degree 串台
  const rawParagraphs = section.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  const paragraphs: string[] = [];
  const dateRe = /\d{4}[\.\-/年]?\d{0,2}\s*[-—–到至~～]\s*(?:\d{4}[\.\-/年]?\d{0,2}|至今|现在|present|now|Present|Now)/i;
  for (const para of rawParagraphs) {
    // 数 date 出现次数
    const matches = Array.from(para.matchAll(new RegExp(dateRe, 'gi')));
    if (matches.length <= 1) {
      paragraphs.push(para);
    } else {
      // 在每个 date 前面切分（保留 date 行作为新段落开头）
      let cursor = 0;
      for (const m of matches) {
        const idx = m.index ?? 0;
        if (idx > cursor) {
          const sub = para.substring(cursor, idx).trim();
          if (sub) paragraphs.push(sub);
        }
        cursor = idx;
      }
      const tail = para.substring(cursor).trim();
      if (tail) paragraphs.push(tail);
    }
  }

  for (const para of paragraphs) {
    const combined = para
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ');

    if (!combined) continue;

    const hasDegree = DEGREE_KEYWORDS.some((d) => combined.includes(d.keyword));
    const hasSchool = extractSchoolName(combined);
    if (!hasDegree && !hasSchool) continue;

    const degree = inferDegree(combined);
    const school = extractSchoolName(combined);
    const major = extractMajor(combined);
    const yearRange = extractYearRange(combined);

    if (school || degree !== '其他') {
      edu.push({
        school: school || '',
        degree,
        major,
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

// 学校识别：使用 SCHOOL_ALIAS_INDEX（含 fuzzy + 长别名优先）
function extractSchoolName(text: string): string {
  // 1) 先查 SCHOOL_ALIAS_INDEX
  for (const { alias, entry } of SCHOOL_ALIAS_INDEX) {
    if (text.includes(alias)) return entry.name;
  }

  // 2) 兜底：通用中文模式
  const cnMatch = text.match(/([一-龥]{2,8}(?:大学|学院|理工|交通大学|科技大学))/);
  if (cnMatch) return cnMatch[1];

  // 3) 兜底：英文模式
  const enMatch = text.match(/(University of [A-Z][a-zA-Z]+|[A-Z][a-z]+\s+University|[A-Z][a-z]+\s+Institute)/);
  if (enMatch) return enMatch[1];

  return '';
}

// 专业识别：使用 MAJOR_ALIAS_INDEX（fuzzy + 长别名优先）
function extractMajor(text: string): string | undefined {
  for (const { alias, entry } of MAJOR_ALIAS_INDEX) {
    // 要求别名紧邻专业相关词（更精确）或独立成词
    if (text.includes(alias)) {
      // 必须避免把大学名误识别为专业（如"金融"在"中央财经大学"中不算专业）
      // 启发式：如果 alias 是单字/双字业务词（如"金融"），要求后面跟着 "专业" / "(" / "（" / "-" / "/" / "方向"
      if (alias.length <= 2 && !/(专业|方向|class|track|concentration|major|specialization|（|\()/i.test(text)) {
        continue;
      }
      return entry.name;
    }
  }

  // 兜底："X 专业" / "X 方向" / "Major: X"
  const cnMatch = text.match(/([一-龥]{2,15})\s*(?:专业|方向)/);
  if (cnMatch) return cnMatch[1];
  const enMatch = text.match(/Major[:：]?\s*([A-Za-z\s&]+)/i);
  if (enMatch) return enMatch[1].trim().split(/\s{2,}/)[0];

  return undefined;
}

// 工作经历
//
// Allen 2026-07-24 重写 (彻底重做):
//   之前 4 个固定 format + resolveCompanyName 漏处理：
//   1) 描述行（如 "- 负责xxx"）被误识别为公司名
//   2) "公司名 部门 职位" 单行无空格分隔无法切分
//   3) 公司在独立行、职位在下一行时 title 为空
//   4) 英文 resume "Company - Title\nDate" 格式完全不工作
//
// 新算法：先按行类型分类（date / header / bullet），再在 header 行里智能切分
//   1) "公司 | 职位"（pipe 分隔）→ 直接切
//   2) "公司 部门 职位" 同行 → 用 title 关键词定位边界
//   3) 单独一行公司，下一行职位 → 顺序匹配
//   4) 整行就是公司名 → 公司=整行，title 留空
//   5) 描述行（"-" / "•" 开头）只进 description，不参与公司识别
// =====================================================

// 标题尾部关键词 (用于切分 "公司 部门 职位")
const TITLE_ENDING_KW = [
  '工程师', '架构师', '研发工程师', '开发工程师', '算法工程师', '测试工程师', '运维工程师',
  '产品经理', '项目经理', '客户经理', '销售经理', '运营经理', '业务经理', '市场经理', '技术经理',
  '总监', '总裁', '副总', '主管', '组长', '负责人',
  'VP', 'CTO', 'CEO', 'COO', 'CFO', 'CMO', 'CIO', 'CHO',
  '顾问', '咨询师', '咨询', '助理', '专员', '代表', '实习',
  '设计师', '科学家', '研究员', '分析师',
  'Engineer', 'Developer', 'Manager', 'Director', 'Lead', 'Head',
  'Chief', 'Architect', 'Designer', 'Analyst', 'Scientist', 'President', 'Officer', 'Associate',
];

// 标题前缀关键词 (用于精确定位 title 起点)
const TITLE_PREFIX_KW = [
  '高级', '资深', '首席', '助理', '实习', '见习', '初级', '中级',
  'Senior', 'Staff', 'Principal', 'Lead', 'Junior', 'Associate', 'Distinguished', 'Fellow',
];

function splitCompanyTitleByKeyword(line: string): { company: string; title: string } | null {
  // 1) 找最后一个标题尾部关键词位置
  let endIdx = -1;
  for (const kw of TITLE_ENDING_KW) {
    const idx = line.lastIndexOf(kw);
    if (idx > endIdx) endIdx = idx;
  }
  if (endIdx === -1) return null;

  // 2) 在 endIdx 之前找最近的标题前缀
  let titleStart = endIdx;
  for (const kw of TITLE_PREFIX_KW) {
    const idx = line.lastIndexOf(kw, endIdx - 1);
    if (idx !== -1) titleStart = Math.min(titleStart, idx);
  }

  // 3) 如果没找到前缀，从 endIdx 向前找真正的公司/标题分隔符
  //    注意：要跳过 title 关键词紧贴的空格（如 "Frontend Engineer" 之间的空格），
  //    否则会把 title 内部空格误判为分隔符
  if (titleStart === endIdx) {
    let i = endIdx - 1;
    while (i > 0 && line[i] === ' ') i--; // 跳过紧贴 title 的空格
    for (; i > 0; i--) {
      const ch = line[i];
      if (ch === ' ' || ch === '　' || ch === '-' || ch === '—' || ch === '–' || ch === '，' || ch === ',' || ch === '、' || ch === '/') {
        titleStart = i + 1;
        break;
      }
    }
    if (titleStart === endIdx) return null;
  }

  const company = line.substring(0, titleStart).trim().replace(/[\s,，、\-—–]+$/, '');
  const title = line.substring(titleStart).trim().replace(/^[\s\-—–]+/, '');

  if (company.length < 2 || title.length < 2) return null;
  return { company, title };
}

// 单行是否只含日期范围（无其他内容）
// 同时识别中英文格式： "2020.03 - 2023.06" / "2020 - 2023" / "Mar 2020 - Jun 2023" / "2020 Mar - 2023 Jun"
function isDateOnlyLine(line: string): boolean {
  const datePatterns = [
    /^\s*(\d{4}[\.\-/年]?\d{0,2}\s*[-—–到至~～]\s*(?:\d{4}[\.\-/年]?\d{0,2}|至今|现在|present|now|Present|Now))/i,
    /^\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\s*[-—–到至~～]\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+)?(?:\d{4}|present|now|Present|Now))/i,
    /^\s*(\d{4}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*[-—–到至~～]\s*(?:\d{4}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?|present|now|Present|Now))/i,
  ];
  for (const re of datePatterns) {
    const m = line.match(re);
    if (m && line.replace(m[1], '').trim() === '') return true;
  }
  return false;
}

function isBulletLine(line: string): boolean {
  return /^[•·\-*▪▫▶►→]\s*/.test(line) || /^\(\d+\)\s*/.test(line);
}

// 行内是否含日期范围 (允许同行有其他文字, 如 "2022.09 - 2024.06  清华大学  计算机  本科")
// Allen 2026-08-12: 用于 extractWorkHistory 的 block 切分, 避免把含日期的教育条目
// 串到含日期的工作条目里导致 yearRange 取错.
const DATE_INLINE_RE = /(\d{4})\s*[\.\-/年]?\s*(\d{1,2})?\s*[-—–到至~～]\s*(?:\d{4}|至今|现在|present|now|Present|Now)/i;
function hasInlineDate(line: string): boolean {
  return DATE_INLINE_RE.test(line);
}

// 是否为简历 section header (教育/技能/项目) — 不应被当作公司名
const SECTION_HEADER_RE = /^(教育经历|教育背景|学历|学历背景|专业技能|技能|技术栈|技能清单|项目经验|项目经历|实习经历|工作经历|工作经验|自我评价|个人简介|个人优势|Education|Academic\s*Background|Skills?|Tech\s*Stack|Projects?|Internship|Work\s*Experience|Profile|Summary|Career|Objective)/i;
function isSectionHeader(s: string): boolean {
  return SECTION_HEADER_RE.test(s.trim());
}

// 是否包含学位/学校关键词 — 提示这一行更像教育而非工作
function looksLikeEducation(text: string): boolean {
  const degreeHit = DEGREE_KEYWORDS.some((d) => text.includes(d.keyword));
  const schoolHit = SCHOOL_ALIAS_INDEX.some(({ alias }) => text.includes(alias));
  return degreeHit || schoolHit;
}

function stripBulletPrefix(line: string): string {
  return line.replace(/^[•·\-*▪▫▶►→]\s*/, '').replace(/^\(\d+\)\s*/, '').trim();
}

// 去掉行首的日期范围前缀（如 "2021.01 - 至今" / "2020 - 2023"），
// 避免 "2021.01 - 至今  字节跳动  算法工程师" 这种同行格式被误当作公司名。
function stripLeadingDateRange(line: string): string {
  return line
    .replace(
      /^\s*(?:\d{4}[\.\-/年]?\s*\d{0,2}\s*[-—–到至~～]\s*(?:\d{4}[\.\-/年]?\s*\d{0,2}|至今|现在|present|now|Present|Now))\s*/i,
      ''
    )
    .trim();
}

// 解析单个工作 block，返回 WorkHistory 或 null
function parseWorkBlock(block: string): WorkHistory | null {
  const allLines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  if (allLines.length === 0) return null;

  const yearRange = extractYearRange(block);
  if (!yearRange) return null;

  // 行分类
  const dateLines: string[] = [];
  const headerLines: string[] = [];
  const bulletLines: string[] = [];

  for (const line of allLines) {
    if (isDateOnlyLine(line)) {
      dateLines.push(line);
    } else if (isBulletLine(line)) {
      bulletLines.push(stripBulletPrefix(line));
    } else {
      headerLines.push(stripLeadingDateRange(line));
    }
  }

  if (headerLines.length === 0) {
    return null;
  }

  let company = '';
  let title = '';
  let headerConsumed = 0;

  // Strategy A: "公司 | 职位" (pipe)
  {
    const m = headerLines[0].match(/^(.+?)\s*[|｜]\s*(.+?)(?:\s*[|｜]\s*|$)/);
    if (m) {
      const resolved = resolveCompanyName(m[1]);
      if (resolved) {
        company = resolved;
        title = m[2].trim();
        headerConsumed = 1;
      }
    }
  }

  // Strategy B: 同行 "公司 部门 职位" (按 title 关键词切分)
  if (!company) {
    const split = splitCompanyTitleByKeyword(headerLines[0]);
    if (split) {
      const resolved = resolveCompanyName(split.company);
      if (resolved) {
        company = resolved;
        title = split.title;
        headerConsumed = 1;
      }
    }
  }

  // Strategy C: 单 token 整行就是公司名，下一行（如果有且非产品名/日期）是职位
  if (!company) {
    const resolved = resolveCompanyName(headerLines[0]);
    if (resolved) {
      company = resolved;
      headerConsumed = 1;
      if (headerLines.length > 1) {
        const next = headerLines[1];
        if (next.length < 50 && !/^\d{4}/.test(next) && !isDateOnlyLine(next)) {
          title = next;
          headerConsumed = 2;
        }
      }
    }
  }

  // Strategy D: 多 token 同行，尝试前 N 个 token 拼接后是公司
  if (!company) {
    const tokens = headerLines[0].split(/\s+/);
    for (let i = Math.min(tokens.length, 3); i >= 1; i--) {
      const candidate = tokens.slice(0, i).join(' ');
      const resolved = resolveCompanyName(candidate);
      if (resolved) {
        company = resolved;
        title = tokens.slice(i).join(' ').trim();
        headerConsumed = 1;
        if (!title && headerLines.length > 1) {
          const next = headerLines[1];
          if (next.length < 50 && !/^\d{4}/.test(next) && !isDateOnlyLine(next)) {
            title = next;
            headerConsumed = 2;
          }
        }
        break;
      }
    }
  }

  if (!company || company.length > 50) return null;

  // Allen 2026-08-12: 拒绝把教育 section header / 含学校或学位的内容当作公司名.
  //   例: 当 fallback 把整个文本当工作 section 时, "教育经历" 行被误识为公司名;
  //       "2022.09 - 2024.06  清华大学  计算机  本科" 这种教育条目也含日期,
  //       会被串到 workHistory, 需要在这里二次过滤.
  if (isSectionHeader(company)) return null;
  if (looksLikeEducation(company)) return null;

  // Description = 剩余 header 行 + bullet 行
  const remainingHeaders = headerLines.slice(headerConsumed);
  const descLines = [...remainingHeaders, ...bulletLines];
  const description = descLines.join('\n').trim();

  const endY = yearRange.endYear ?? new Date().getFullYear();
  const durationMonths = Math.max(0, (endY - yearRange.startYear) * 12);

  return {
    company: company.slice(0, 30),
    title: title.slice(0, 50),
    startYear: yearRange.startYear,
    endYear: yearRange.endYear,
    durationMonths,
    description: description.slice(0, 1000),
  };
}

function extractWorkHistory(text: string): WorkHistory[] {
  const histories: WorkHistory[] = [];

  const sectionPatterns = [
    /(?:工作经历|工作经验|职业经历|从业经历|Employment|Work\s*Experience|Professional\s*Experience)[:：]?\s*([\s\S]+?)(?=(?:项目经验|项目经历|教育|技能|Education|Projects?|Skills?|$))/i,
    /(?:实习经历|Internship|Intern\s*Experience)[:：]?\s*([\s\S]+?)(?=(?:工作经历|项目|教育|技能|$))/i,
  ];

  let section = '';
  for (const p of sectionPatterns) {
    const m = text.match(p);
    if (m) { section = m[1]; break; }
  }

  // Allen 2026-08-12 修复:
  //   旧 fallback 用 `if (hasAnyDate) section = text` 太宽松, 任何含日期范围的
  //   文本都被当作工作 section, 教育条目被错配进 workHistory, 污染
  //   `earliest startYear`, 导致 totalYears 误算 (e.g. 博士在读 → 11 年).
  //
  // 新 fallback: 必须同时满足
  //   1) 有日期范围
  //   2) 含至少一个 title 关键词 (工程师 / Manager / ...) 或 已知公司名
  // 否则视为无工作经历, 返回空数组, 让 totalYears 走教育路径
  if (!section) {
    const hasAnyDate = /(\d{4})\s*[\.\-/年]?\s*(\d{1,2})?\s*[-—–到至~～]\s*(?:\d{4}|至今|现在|present|now)/i.test(text);
    const hasTitleKeyword = /(?:工程师|架构师|研发|开发|算法|测试|运维|产品经理|项目经理|总监|主管|组长|负责人|Engineer|Developer|Manager|Director|Lead|Architect|Designer|Analyst|Scientist|Officer|President|Associate|VP|CTO|CEO|COO|CFO|CMO|CIO|CHO|顾问|咨询|助理|专员|代表|实习)/i.test(text);
    if (hasAnyDate && hasTitleKeyword) section = text;
  }

  if (!section) return histories;

  // 切分策略：
  // 1) 先按空行切，得到"自然段落"
  // 2) 对每个段落，识别所有 date-only line
  // 3) 对每个 date 行，从它往前回看 0-2 行（非日期、非项目符号）作为 header 候选，
  //    往后到下一个 date 或段落末尾作为 description
  // 这样可以同时处理：
  //   - 日期在前："2020.03 - 2023.06\n字节跳动\n..."
  //   - 日期在后："字节跳动 | 高级工程师\n2020.03 - 2023.06"
  //   - 整段只有一个 entry 但没空行
  const paragraphs = section.split(/\n\s*\n+/).map((b) => b.trim()).filter(Boolean);

  for (const para of paragraphs) {
    const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // 找所有 date-only 行
    const dateIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (isDateOnlyLine(lines[i])) dateIndices.push(i);
    }

    if (dateIndices.length === 0) {
      // 段落里没有 date 行 — 尝试把整段当一个 block 解析（极少数情况）
      const item = parseWorkBlock(para);
      if (item) histories.push(item);
      continue;
    }

    // 对每个 date 行构建子 block
    for (let di = 0; di < dateIndices.length; di++) {
      const dIdx = dateIndices[di];
      const nextDateIdx = di + 1 < dateIndices.length ? dateIndices[di + 1] : lines.length;

      // 往前回看 0-2 行：跳过 bullet，遇到 date 行（含同行混排的日期）或段落开头就停
      // Allen 2026-08-12: 用 hasInlineDate 替代 isDateOnlyLine,
      //   避免 "2022.09 - 2024.06  清华大学  计算机  本科" 这种教育条目被串到
      //   "2024.07 - 2024.12  字节跳动  实习生" 工作条目里导致 yearRange 取错
      let startIdx = dIdx;
      let backCount = 0;
      while (startIdx > 0 && backCount < 2) {
        const prev = lines[startIdx - 1];
        if (isDateOnlyLine(prev) || hasInlineDate(prev)) break;
        if (isBulletLine(prev)) break;
        startIdx -= 1;
        backCount += 1;
      }

      const subLines = lines.slice(startIdx, nextDateIdx);
      const subBlock = subLines.join('\n');
      const item = parseWorkBlock(subBlock);
      if (item) histories.push(item);
    }
  }

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

    // 项目名提取（更鲁棒）：
    // 跳过纯日期开头 / 跳过数字编号 / 跳过 【】包裹的标签
    // 跳过空白项目名（"项目经验"等标题行）
    let nameIdx = 0;
    let name = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 跳过空行
      if (!line) continue;
      // 跳过数字编号
      const cleaned = line
        .replace(/^[\d]+[.、)）]\s*/, '')
        .replace(/^【.+?】\s*/, '')
        .trim();
      if (!cleaned) continue;
      // 跳过纯日期行（项目名往往是日期之后的下一行）
      if (/^\d{4}[\.\-/年]?/.test(cleaned) && i < lines.length - 1) {
        continue;
      }
      // 跳过标题行
      if (/^(?:项目|Project\s*Experience)/i.test(cleaned)) continue;
      // 跳过纯标点行
      if (/^[·•\-—]+$/.test(cleaned)) continue;
      name = cleaned.slice(0, 80);
      nameIdx = i;
      break;
    }

    if (!name || name.length < 2) continue;

    const description = lines.slice(nameIdx + 1).join(' ').trim();

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
    /(?:专业技能|技能|技术栈|技术能力|核心技能|Skills?|Tech\s*Stack)[:：]?\s*([\s\S]+?)(?=(?:项目|工作经历|教育|获奖|Projects?|Work|$))/i,
  ];

  let section = '';
  for (const p of patterns) {
    const m = text.match(p);
    if (m) { section = m[1]; break; }
  }

  if (section) {
    const tokens = section.split(/[\s,，、;；。\n•●|·]+/).map((t) => t.trim()).filter(Boolean);
    for (const t of tokens) {
      if (t.length >= 2 && t.length <= 30) skills.add(t);
    }
  } else {
    // Fallback: 全文搜索扩展关键词库
    const techKeywords = [
      // 前端
      'React', 'Vue', 'Angular', 'Svelte', 'Solid', 'TypeScript', 'JavaScript', 'Node.js', 'Next.js', 'Nuxt',
      'Webpack', 'Vite', 'Rollup', 'TailwindCSS', 'Sass', 'Less', 'Redux', 'MobX', 'Zustand',
      // 后端
      'Python', 'Java', 'Go', 'Golang', 'Rust', 'C++', 'C#', '.NET', 'Ruby', 'PHP',
      'Spring', 'Spring Boot', 'Spring Cloud', 'Django', 'Flask', 'FastAPI', 'Express', 'Koa', 'NestJS', 'Rails',
      'GraphQL', 'gRPC', 'REST', 'WebSocket', 'WebAssembly',
      // 数据库
      'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch', 'ClickHouse', 'Memcached', 'Cassandra',
      'Kafka', 'RabbitMQ', 'RocketMQ', 'Pulsar',
      // 云/运维
      'AWS', 'Azure', 'GCP', 'Aliyun', 'Kubernetes', 'K8s', 'Docker', 'Terraform', 'Ansible', 'Pulumi',
      'CI/CD', 'Jenkins', 'GitLab CI', 'GitHub Actions', 'CircleCI',
      // 大数据/AI
      'Hadoop', 'Spark', 'Flink', 'Storm', 'Hive', 'Presto', 'Trino', 'Druid', 'Airflow', 'dbt',
      'TensorFlow', 'PyTorch', 'PaddlePaddle', 'LLM', 'RAG', 'LangChain', 'LlamaIndex',
      'Hugging Face', 'Transformers', 'Stable Diffusion', 'GPT', 'BERT', 'DeepSpeed', 'vLLM',
      // 移动端
      'iOS', 'Android', 'Swift', 'Kotlin', 'Objective-C', 'Flutter', 'React Native', 'Weex',
      '小程序', 'Taro', 'Uni-app', 'HarmonyOS',
      // 业务领域（中文）
      '微服务', '分布式', '高并发', '大数据', '推荐系统', '搜索引擎', '广告系统', '支付系统',
      '电商', '社交', '内容', '游戏', '金融', '医疗', '教育',
      // 通用
      'Git', 'Linux', 'Shell', 'Bash', 'Agile', 'Scrum', 'DevOps', 'SRE', 'TDD',
    ];
    for (const kw of techKeywords) {
      // 转义正则特殊字符
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(?:^|[^一-龥A-Za-z0-9])(${escaped})(?:[^一-龥A-Za-z0-9]|$)`);
      if (re.test(text)) skills.add(kw);
    }
  }

  return Array.from(skills).slice(0, 30);
}

// 公开入口 - LLM 主导解析，本地作为静默兜底
// =====================================================
//
// Allen 2026-07-30: 把简历解析从"本地规则 + LLM 补缺补漏"切换到"LLM 主导解析"。
//
// 流程:
//   1) extractResumeText 把文件转为纯文本（PDF/图片 OCR/DOCX/TXT 等）
//   2) parseResumeWithLLM 把文本丢给大模型，期望返回完整 Candidate JSON
//   3) LLM 失败/超时/无效 JSON 时静默降级到本地 parseResumeText
//
// 进度反馈:
//   - '文件解析中...'
//   - 'AI 智能解析中...'
//   - '解析完成' / 'AI 解析失败，已使用本地规则解析'
//
export async function parseResume(
  file: File,
  onProgress?: ParseProgress
): Promise<Candidate> {
  onProgress?.('文件解析中...');
  const text = await extractResumeText(file, onProgress);
  if (!text.trim()) {
    throw new Error('简历内容为空，请检查文件是否损坏或为空');
  }

  onProgress?.('AI 智能解析中...');
  try {
    const mod = await import('./llmClient');
    const llmResult = await mod.parseResumeWithLLM(text);
    if (llmResult) {
      onProgress?.('解析完成');
      return llmResult;
    }
  } catch (e) {
    console.warn('[parseResume] LLM 解析失败，降级到本地解析:', e);
  }

  onProgress?.('AI 解析失败，已使用本地规则解析');
  return parseResumeText(text);
}
