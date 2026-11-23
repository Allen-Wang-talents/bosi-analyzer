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
import { resolveCompanyName, PRODUCT_TO_COMPANY_MAP } from '@/data/productCompanyMap';

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
    // PDF 文本层里残留的控制字符 (U+0000 / U+0001 等) —— 部分简历的自定义字体
    // 会把字形映射到控制码区, 抽出来是 "赵捷"。不清掉的话整行匹配不上
    // 正则, 姓名/公司名全部丢失。保留 \t (0x09) / \n (0x0A)。
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 仅清理零宽字符：U+200B 零宽空格 + U+FEFF BOM。绝不能误伤普通连字符 '-'，
    // 否则日期 "2020.03 - 2023.06" 会被破坏成 "2020.03  2023.06"，所有日期匹配全部失败。
    .replace(/[\u200B\uFEFF]/g, '')
    // 全角数字 → 半角 (Word/PDF 排版常见 "２０２０.０３")。
    // 正则里的 \d 只认半角, 不归一的话整条日期都匹配不上 —— 工作年限直接算错。
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    // 全角小数点: "２０２０．０３" 归一数字后还剩一个全角点, 同样不认
    .replace(/(\d)．(?=\d)/g, '$1.')
    // 中文日期写法归一 (Allen 2026-10-29):
    //   "2024年01月 - 至今" -> "2024.01 - 至今"  —— 原来的 DATE_PATTERNS 不认
    //   "年...月" 这种中间夹汉字的写法, 导致整条工作经历匹配不到日期。
    //   "2024年 - 至今"    -> "2024 - 至今"
    //   "2021 年 2 月"     -> "2021.2"  (数字和"年月"之间常有空格)
    .replace(/(19\d{2}|20\d{2})\s*年\s*(\d{1,2})\s*月/g, '$1.$2')
    .replace(/(19\d{2}|20\d{2})\s*年(?![\d月])/g, '$1')
    // 两位年份: "23年4月-至今" -> "2023.04-至今"
    // 必须要求后面跟区间分隔符, 否则 "13年经验" 会被改成 "2013经验"。
    .replace(/(?<!\d)(\d{2})\s*年\s*(\d{1,2})\s*月(?=\s*[-—–至~～])/g, (m, y, mo) => `${Number(y) >= 70 ? '19' : '20'}${y}.${mo}`)
    .replace(/(?<!\d)(\d{2})\s*年(?=\s*[-—–至~～])/g, (m, y) => `${Number(y) >= 70 ? '19' : '20'}${y}`)
    // 带日粒度: "2025.10.20-2026.3" -> "2025.10-2026.3" (日对工作年限没意义)
    .replace(/(19\d{2}|20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?!\d)/g, '$1.$2')
    // 异体连接号归一: "2021 年 2 月－至今" 里的全角减号 U+FF0D 不在日期正则的
    // 分隔符集合里, 整条日期就匹配不上。
    .replace(/(\d)\s*[－﹣‐‑‒–—―−~〜]+\s*(?=\d|至今|现在|present|now)/gi, '$1 - ')
    // 缺分隔符: "2024.04至今" -> "2024.04 - 至今"
    .replace(/(19\d{2}|20\d{2})[.\-/](\d{1,2})(?=\s*(?:至今|现在|present|now))/gi, '$1.$2 - ')
    // 双横线日期 "--" -> 单横线 ("2019/09 -- 2023/01" / "2022年11月--至今")
    .replace(/(\d)\s*--+\s*(?=\d|至今|现在|present|now)/gi, '$1 - ')
    // 斜杠后又跟一个斜杠: "2025/08/-至今" / "2024/03/-2025/07/"
    .replace(/(\d{4}[.\-/]\d{1,2})[.\-/]+\s*(?=\d|至今|现在|present|now)/g, '$1 - ')
    // 月/年顺序: "01/2022 - 至今" -> "2022.01 - 至今" (月必须在 01-12, 避免误伤 "2022/01")
    .replace(/\b(0[1-9]|1[0-2])\/(\d{4})\b/g, '$2.$1')
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

const SECTION_TITLE_BLACKLIST = /^(教育|工作|项目|技能|实习|个人|求职|联系方式|基本信息|个人简介|工作经历|教育经历|项目经验|专业技能|工作内容|任职|Employment|Education|Work|Project|Skills?|Experience|Profile|Summary|Career|Objective)/i;

// 常见的"标签词", 出现在行首时不能当人名。
// "民族：汉族" / "期望城市：北京" 这类行首 2 个字很容易被误当成名字。
const NAME_LABEL_WORDS = new Set([
  '民族', '年龄', '性别', '学历', '籍贯', '电话', '邮箱', '地址', '现居', '出生',
  '意向', '城市', '期望', '行业', '部门', '职位', '岗位', '当前', '在职', '离职',
  '求职', '毕业', '院校', '专业', '方向', '核心', '个人', '工作', '教育', '项目',
  '技能', '自我', '联系', '基本', '求职', '职业', '擅长', '熟悉', '熟练', '具备',
  '负责', '参与', '主导', '独立', '曾任', '现任', '主要', '担任', '公司简介',
  '拥有', '掌握', '从事', '深入', '持续', '良好', '优秀', '丰富', '扎实', '敏锐',
  '高效', '强烈', '以及', '并且', '通过', '基于', '根据', '目前', '现在', '最近',
  '曾经', '过去', '未来', '良好', '高度', '完成', '推动', '支持', '协助', '组织',
  '开展', '搭建', '建立', '制定', '维护', '分析', '设计', '开发', '运营', '销售',
  '市场', '品牌', '用户', '客户', '产品', '技术', '算法', '数据', '商务', '财务',
  // 学术/学历/出版类词 —— "学术发表（谷歌学术已破千引）" "文学学士（中文系）"
  // 这种行首 4 字会被"行首是人名"的规则抽走 (Allen 2026-10-29)
  '学术', '文学', '学位', '学历', '毕业', '发表', '论文', '期刊', '会议', '书籍',
  '专利', '获奖', '荣誉', '证书', '语言', '兴趣', '爱好', '研究', '课程', '培训',
  '竞赛', '奖项', '教材', '翻译', '著述',
  // 技能动词 —— "精通Python" / "熟练使用Excel" 行首会被中英混排规则命中
  '精通', '使用', '运用', '英文', '中文',
]);

/** 英文单词噪声 —— 简历首行是单个英文单词时, 别把章节/技能词当人名 */
const LATIN_NOISE = new Set([
  'resume', 'summary', 'curriculum', 'vitae', 'cv', 'profile', 'objective',
  'about', 'contact', 'personal', 'information', 'details', 'email', 'phone',
  'linkedin', 'github', 'portfolio', 'education', 'experience', 'skill', 'skills',
  'project', 'projects', 'career', 'awards', 'honors', 'languages', 'interests',
  'python', 'java', 'sql', 'excel', 'powerpoint', 'wordpress', 'sap', 'c++',
]);

/** 拉丁名里带这些词的, 是学校/公司不是人名 —— "Harvard University" */
const LATIN_NOT_NAME =
  /\b(university|college|school|institute|academy|corporation|company|limited|ltd|inc|llc|group|technologies|technology|holdings|partners|labs?|software|solutions)\b/i;

/**
 * 常见姓氏 —— 用来判断抽出来的中文串到底是不是人名。
 *
 * 之前靠"黑名单"挡垃圾名字(学术发表/文学学士/自我评价/基本资料…),
 * 黑名单永远列不全: 简历里任何一个章节标题都可能撞上来。
 * 姓氏是更强的判据 —— 中文人名一定是"姓+名", 姓氏在百家姓里。
 * 前 250 个姓氏覆盖 98% 以上的汉语人口。
 */
const SURNAMES = new Set(
  ('赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章'
    + '云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常'
    + '乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞'
    + '熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍'
    + '虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁'
    + '荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫'
    + '宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙'
    + '池乔阴能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀郏浦尚农温别'
    + '庄晏柴瞿阎充慕连茹习艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃'
    + '利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权'
    + '逯盖益桓公晋楚闫法汝鄢涂钦段百里闻东付麦冼揭阳佟仝慕臧祎励晏冀郜蔺仉翟蒲乜仡'
  ).split(''),
);

/** 复姓 —— 4 字人名只可能是"复姓+双字名" */
const COMPOUND_SURNAMES = new Set([
  '欧阳', '司马', '诸葛', '慕容', '上官', '司徒', '轩辕', '独孤', '澹台', '公孙',
  '南宫', '长孙', '宇文', '夏侯', '令狐', '钟离', '闾丘', '端木', '百里', '呼延',
  '羊舌', '微生', '宰父', '谷梁', '拓跋', '夹谷', '第五', '公羊', '公西', '梁丘',
  '左丘', '东郭', '西门', '仲孙', '太叔', '申屠', '北堂', '南门', '鲜于', '闾闾',
]);

/**
 * 这个中文串像不像人名。
 * 2~3 字 + 首字是常见姓 → 像; 4 字必须是复姓 + 双字名。
 * 行尾的 "男/女" 是简历里常见的性别标注, 去掉再判。
 */
export function looksLikeCnName(s: string): boolean {
  const t = s.replace(/[男女]$/, '');
  if (!/^[一-龥]{2,4}$/.test(t)) return false;
  if (CN_NAME_BLOCK.has(t)) return false;
  if (t.length === 4 && !COMPOUND_SURNAMES.has(t.slice(0, 2))) return false;
  return SURNAMES.has(t[0]) || COMPOUND_SURNAMES.has(t.slice(0, 2));
}

/**
 * 这些词碰巧也是姓氏, 但在简历里出现时一定是词组而不是人名 ——
 * "国内/海外 | 手机:…" 这种行首会被"行首是人名"的规则抽走 (国 是姓氏)。
 */
const CN_NAME_BLOCK = new Set([
  '国内', '国际', '海外', '中国', '全国', '全省', '全市', '全球', '台灣', '台湾',
  '香港', '澳门', '全职', '兼职', '实习', '社招', '校招', '管培', '应届', '海外',
  '性别', '邮箱', '电话', '地址', '微信', '姓名', '出生', '求职', '在职', '离职',
]);

/** 校名黑名单 —— "哈佛大学|环境健康|理学硕士2022年8月" 这种行,
 *  行首 4 个字会被"行首是人名"的规则当成名字抽走。 */
const SCHOOL_NAME_SET = new Set(SCHOOL_ALIAS_INDEX.map((x) => x.alias.replace(/\s+/g, '')));

/** "苗 卉" 这种带空格的中文名 —— 简历排版常把两字名拆开 */
const SPACED_CN_NAME_RE = /^([一-龥])\s+([一-龥])\s*([一-龥])?\s*$/;

function extractName(text: string): string | undefined {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);

  const badCn = (s: string): boolean =>
    NAME_LABEL_WORDS.has(s.slice(0, 2)) || SCHOOL_NAME_SET.has(s);

  for (const [idx, line] of lines.entries()) {
    if (line.length > 60) continue;
    if (SECTION_TITLE_BLACKLIST.test(line)) continue;

    // 1) 标注式: "姓名: X" / "姓 名: X" / "Name: X" / "基本信息 | - 姓名 Maggie Yin"
    const labeled = line.match(
      /(?:^|[\s|｜\-·•])(?:姓\s*名|Name|名字)\s*[:：]?\s*([一-龥]{2,4}|[A-Za-z][A-Za-z\s.'-]{1,24})/,
    );
    if (labeled) {
      const v = labeled[1].trim();
      if (v.length >= 2) {
        if (/^[一-龥]/.test(v)) {
          if (looksLikeCnName(v)) return v;
          continue;
        }
        return v;
      }
    }

    // 2) 整行就是中文名 (可能是"苗 卉"这种拆开的写法)
    const cn = line.match(/^([一-龥]{2,4})$/);
    if (cn) {
      if (SCHOOL_NAME_SET.has(cn[1])) continue;
      if (looksLikeCnName(cn[1])) return cn[1];
      continue;
    }
    const spaced = line.match(SPACED_CN_NAME_RE);
    if (spaced && !SCHOOL_NAME_SET.has(spaced[1] + spaced[2])) {
      const joined = spaced[1] + spaced[2] + (spaced[3] ?? '');
      if (looksLikeCnName(joined)) return joined;
    }

    // 3) 整行就是英文名 —— 两词及以上任何位置都认, 单个英文单词只在
    //    前两行认 ("Owen" 单独一行是简历抬头, 但正文里的 "Python" 不算人名)
    const en = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})$/);
    if (en && !LATIN_NOT_NAME.test(en[1])) return en[1];
    // 3b) 带括号/全大写姓氏的英文名 —— "Rumi (Xiaohan) Wu" / "Norah HE"
    const paren = line.match(/^([A-Z][a-z]+)\s*\(([A-Za-z][A-Za-z\s.'-]{1,20})\)\s*([A-Z][A-Za-z]+)$/);
    if (paren) return `${paren[2].trim()} ${paren[3]}`;
    const caps = line.match(/^([A-Z][a-z]+)\s+([A-Z]{2,3})$/);
    if (caps) return `${caps[1]} ${caps[2][0]}${caps[2].slice(1).toLowerCase()}`;
    if (idx < 2) {
      const single = line.match(/^([A-Z][a-z]{1,19})$/);
      if (single && !LATIN_NOISE.has(single[1].toLowerCase())) return single[1];
    }

    // 4) 中英混排: "刘鸿樟Alpha" / "程阳CHENGYANG" / "杨鑫 AlexYang"
    //    中文名后面直接跟拉丁字母, 中间没有分隔符
    for (const len of [4, 3, 2]) {
      const m = line.match(new RegExp(`^([一-龥]{${len}})(?=[A-Za-z])`));
      if (m && !badCn(m[1]) && looksLikeCnName(m[1])) return m[1];
    }
    //    反过来: 拉丁名后面直接跟中文 —— "Elena朱琳"
    //    要求第二个字母是小写 —— 否则 "AI产品经理" 会抽出 "AI"
    const mixed = line.match(/^([A-Z][a-z][A-Za-z]{1,18})(?=[一-龥])/);
    if (mixed) return mixed[1];

    // 5) 行首是人名, 后面跟年龄/分隔符/职位:
    //    "王艺31岁女" / "闵洁| AI数据专家" / "丁菡（For AI 产品经理）"
    //
    //    注意要从长往短试: "具备从0到1推进…" 里 "具备从" 三个字是跨词的,
    //    但 "具备" 本身在黑名单里, 所以先试 4 字再试 3 字再试 2 字,
    //    只要前两个字命中黑名单就整条放弃 —— 否则会抽出 "具备从" 这种垃圾名字。
    for (const len of [4, 3, 2]) {
      const m = line.match(new RegExp(`^([一-龥]{${len}})(?=[\\d|｜·•/（(【\\[]|\\s)`));
      if (m && !badCn(m[1]) && looksLikeCnName(m[1])) return m[1];
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

  // 2b) 标签在前的写法: "工作年限：6 年"
  //     博思重制版式的简历抬头就带这个字段, 数字在标签后面 —— 上一条正则抓不到,
  //     结果整份简历的工作年限算成 0, 人被年限门槛直接筛掉。
  const labeledYears = text.match(
    /(?:工作年限|工作经验年限|累计工作年限|工作经验)\s*[:：]?\s*(\d{1,2})\s*年/i,
  );
  if (labeledYears) {
    const y = parseInt(labeledYears[1], 10);
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

/**
 * 当前雇主 —— 取「至今」的那一条, 不是文档里的第一条。
 *
 * 文档顺序 ≠ 时间顺序: 有的简历先写当前岗位再写历史, 有的反过来。而且
 * 历史上某条解析失败被丢弃时, 第一条就可能变成历史岗位 —— 报告里就会出现
 * "当前:北京月之暗面科技有限公司" 而这人其实在智谱。
 */
function currentEntry(histories: WorkHistory[]): WorkHistory | undefined {
  if (!histories.length) return undefined;
  return histories.find((h) => h.endYear === null) ?? histories[0];
}

function extractCurrentTitle(_text: string, histories: WorkHistory[]): string | undefined {
  return currentEntry(histories)?.title;
}

function extractCurrentCompany(_text: string, histories: WorkHistory[]): string | undefined {
  return currentEntry(histories)?.company;
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
    // 结束标志必须在行首 —— 正文里出现 "专业技能"、"项目经历" 这类词很常见,
    // 按子串匹配会把教育 section 提前截断。
    /(?:教育经历|教育背景|学历|Education|Academic\s*Background)[:：]?\s*([\s\S]+?)(?=(?<![^\n])\s*(?:工作经历|工作经验|任职经历|项目经验|项目经历|工作内容|实习|Work\s*Experience|Work\s*History|Employment|Projects?|Skills?)|$)/i,
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
  // 职能岗的职位常不带"经理/总监"后缀: "产品运营""市场品牌运营""增长运营"
  '运营',
  'VP', 'CTO', 'CEO', 'COO', 'CFO', 'CMO', 'CIO', 'CHO',
  '顾问', '咨询师', '咨询', '助理', '专员', '代表', '实习',
  '设计师', '科学家', '研究员', '分析师', '专家',
  'Engineer', 'Developer', 'Manager', 'Director', 'Lead', 'Head',
  'Chief', 'Architect', 'Designer', 'Analyst', 'Scientist', 'President', 'Officer', 'Associate',
];

// 标题前缀关键词 (用于精确定位 title 起点)
const TITLE_PREFIX_KW = [
  '高级', '资深', '首席', '助理', '实习', '见习', '初级', '中级',
  'Senior', 'Staff', 'Principal', 'Lead', 'Junior', 'Associate', 'Distinguished', 'Fellow',
];

/**
 * 每行每个位置的括号深度。
 *
 * 简历里 "（澳洲Top20上市公司，实习）" 这种括号包起来的说明文字不是职位,
 * 更不是公司名 —— 里面的"实习"会被当成职位关键词、"公司"会被当成工商后缀,
 * 切分就会错位。深度 > 0 的位置一律不算关键词。
 */
function bracketDepths(line: string): number[] {
  const depth = new Array<number>(line.length + 1).fill(0);
  let d = 0;
  for (let i = 0; i < line.length; i++) {
    depth[i] = d;
    const ch = line[i];
    if (ch === '（' || ch === '(' || ch === '【' || ch === '[') d++;
    else if (ch === '）' || ch === ')' || ch === '】' || ch === ']') d = Math.max(0, d - 1);
  }
  depth[line.length] = d;
  return depth;
}

/** 从 fromStart 往左找 kw 最后一次出现的位置, 跳过括号内的。 */
function lastIndexOutsideBrackets(
  line: string,
  kw: string,
  depth: number[],
  fromStart?: number,
): number {
  let idx = fromStart === undefined ? line.lastIndexOf(kw) : line.lastIndexOf(kw, fromStart);
  while (idx > 0 && depth[idx] > 0) {
    idx = line.lastIndexOf(kw, idx - 1);
  }
  return idx;
}

/**
 * 切开后接的字 —— 这些字开头说明切在了句子中间, 不是"公司名 + 职位"。
 * 职位名不会以"的""和""或"开头。
 */
const PARTICLE_AFTER_CUT = /^[的了和与及或是为以由而并也就都还要有无不该其此这那将把被从对向给过]/;

/**
 * 职位味 —— 比 TITLE_ENDING_KW 宽一档。
 *
 * TITLE_ENDING_KW 是"这一行里有职位关键词", 用来找切点;
 * 这里判的是"工商全称后面挂的这段话像不像职位", 是另一个问题:
 *   "…有限公司战略投资部投资经理北京" → 职位 ✓
 *   "…有限公司-蓝云事业部"            → 部门, 不是职位 ✗
 *   "…有限公司北京/华东区域"          → 地点, 不是职位 ✗
 * 判错的代价: 把地点当职位, 职位就丢了(职位在下一行)。
 */
const TITLE_LIKE_CN =
  /(?:经理|总监|主管|负责人|组长|专员|顾问|助理|代表|工程师|架构师|设计师|分析师|研究员|专家|运营|开发|实习|总裁|合伙人|律师|教练|编辑|记者|设计|视觉|前端|后端|算法|技术|商务|销售|市场|品牌|产品|增长|策划|培训)/;
const TITLE_LIKE_EN = /\b(?:PM|VP|BD|CEO|CTO|COO|CFO|CMO|CIO|TPM|HRBP|HRD|Sales|Manager|Engineer|Director|Lead|Head|Officer|Consultant|Analyst|Designer|Developer|Architect|Scientist|Partner)\b/;

function isTitleLike(s: string): boolean {
  const t = s.trim();
  if (t.length < 2 || t.length > 40) return false;
  return TITLE_LIKE_CN.test(t) || TITLE_LIKE_EN.test(t);
}

/**
 * 工商全称 → 公司名前缀 + 后面挂的尾巴。
 *
 * "联想（北京）有限公司北京"               → { prefix: "联想（北京）有限公司", rest: "北京" }
 * "北京三快网络科技有限公司（美团）中国，北京" → { prefix: "…有限公司（美团）", rest: "中国，北京" }
 *
 * 紧跟工商后缀的括号说明单独摘出来 —— 它可能是品牌别名("（美团）"),
 * 也可能是上市说明("（美股上市公司）"), 得让上层自己挑。
 */
function legalEntityPrefix(line: string): { prefix: string; rest: string; note: string } | null {
  const depth = bracketDepths(line);
  const suffixRe = /(?:有限责任公司|股份有限公司|有限公司|集团公司)/g;
  let m: RegExpExecArray | null;
  let end = -1;
  while ((m = suffixRe.exec(line)) !== null) {
    if (depth[m.index] > 0) continue;
    end = m.index + m[0].length;
  }
  if (end < 0) return null;

  const tail = line.substring(end);
  const noteMatch = tail.match(/^\s*[（(][^）)]*[）)]/);
  const note = noteMatch ? noteMatch[0].trim() : '';
  const rest = (noteMatch ? tail.substring(noteMatch[0].length) : tail).trim();
  return { prefix: line.substring(0, end).trim(), rest, note };
}

/**
 * 工商主体后缀当公司/职位的分界线, 返回职位起点; 不适用时返回 null。
 *
 * "北京月之暗面科技有限公司产品运营" 这种写法没有空格分隔, 靠分隔符切不开 ——
 * 整串被当成公司名("…有限公司产品运营"), 报告里的"当前公司"就带着职位后缀。
 * 但工商全称是公司名最强的信号: 公司到"有限公司"为止, 后面就是职位。
 *
 * 括号里的说明("（正职)""(全职)")不算职位, 跳过; "上市公司"里的"公司"
 * 也不是工商后缀 —— 它前面是"上市", 跟的是行情不是主体。
 */
function legalEntityBoundary(
  line: string,
  titleEndIdx: number,
  depth: number[],
  strongOnly = false,
): number | null {
  const suffixRe = strongOnly
    ? /(?:有限责任公司|股份有限公司|有限公司|集团公司)/g
    : /(?:有限责任公司|股份有限公司|有限公司|集团公司|集团|公司|控股|工作室)/g;
  let m: RegExpExecArray | null;
  let best = -1;
  while ((m = suffixRe.exec(line)) !== null) {
    const end = m.index + m[0].length;
    // 只认在职位关键词之前的那个工商主体 —— "运营总监 XX有限公司" 不是公司+职位
    if (end > titleEndIdx) continue;
    // 括号里的说明文字不是公司名
    if (depth[m.index] > 0) continue;
    // "上市公司" —— 前面是"上市", 不是工商主体后缀
    if (m[0] === '公司' && line.slice(Math.max(0, m.index - 2), m.index) === '上市') continue;
    best = end;
  }
  if (best < 0) return null;

  let i = best;
  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ' || ch === '\u3000') { i++; continue; }
    if (ch === '\uFF08' || ch === '(') {
      const close = ch === '\uFF08' ? line.indexOf('\uFF09', i) : line.indexOf(')', i);
      if (close < 0) break;
      i = close + 1;
      continue;
    }
    break;
  }
  // 切开后接的应该是职位 —— 如果接的是"的""和"这种字, 说明切在了句子中间:
  // "游戏工作室的核心创始人和CTO" 里的"工作室"不是公司名的结尾。
  if (PARTICLE_AFTER_CUT.test(line.slice(i, i + 1))) return null;
  return i > best ? i : best;
}

function splitCompanyTitleByKeyword(line: string): Array<{ company: string; title: string }> {
  const depth = bracketDepths(line);

  // 1) 找最后一个标题尾部关键词位置 (括号里的说明文字不算)
  let endIdx = -1;
  for (const kw of TITLE_ENDING_KW) {
    const idx = lastIndexOutsideBrackets(line, kw, depth);
    if (idx > endIdx) endIdx = idx;
  }
  // 一个都没有时, 才退回"括号里也算" —— "腾讯科技（北京）有限公司-数据产品
  // （暑期实习后转正）" 这行只有括号里的"实习"像职位, 丢掉它整行就切不开。
  if (endIdx === -1) {
    for (const kw of TITLE_ENDING_KW) {
      const idx = line.lastIndexOf(kw);
      if (idx > endIdx) endIdx = idx;
    }
  }
  if (endIdx === -1) {
    // 整行没有职位关键词 —— 工商全称本身能定界:
    // "北京市商汤科技开发有限公司大模型技术TPM" → 公司到"有限公司"为止, 后面是职位。
    // 但尾巴是地点/部门时不能切("联想（北京）有限公司北京"、"世纪互联数据中心有限公司-蓝云事业部"),
    // 那种排版的职位在下一行, 留给 Strategy C。
    const legal = legalEntityPrefix(line);
    if (!legal || !isTitleLike(legal.rest)) return [];
    const company = legal.prefix.replace(/[\s,，、\-—–]+$/, '');
    const title = legal.rest.replace(/^[\s\-—–·]+/, '').replace(/[\s,，、]+$/, '');
    if (company.length < 2 || title.length < 2) return [];
    return [{ company, title }];
  }

  // 2) 收集候选切点 —— 三种边界都可能对, 交给上层挑能解析成公司名的那个。
  //
  //    a) 标题前缀: "高级产品专家" 的"高级" —— 职位的起点。
  //    b) 分隔符: "月之暗面，用户产品专家" —— 分隔符是排版作者自己划的界。
  //       但分隔符常常落在职位内部("品牌产品，产品经理/产品专家"、"负责人、高级技术专家"),
  //       这时候切出来的公司名会过长或标点过多, 解析不过 → 落到 c)。
  //    c) 工商主体: "BOE 京东方科技集团股份有限公司-品牌产品，……" / "第四范式（北京）技术有限公司智能外呼产线负责人、……"
  //       公司到"有限公司"为止, 后面全是职位。
  const cuts: number[] = [];

  let prefixIdx = endIdx;
  for (const kw of TITLE_PREFIX_KW) {
    const idx = lastIndexOutsideBrackets(line, kw, depth, endIdx - 1);
    if (idx !== -1) prefixIdx = Math.min(prefixIdx, idx);
  }
  if (prefixIdx < endIdx) cuts.push(prefixIdx);

  // 分隔符切: 要跳过紧贴 title 关键词的空格（如 "Frontend Engineer" 之间的空格）,
  // 否则会把 title 内部空格误判为分隔符
  let sepStart = -1;
  let i = endIdx - 1;
  while (i > 0 && line[i] === ' ') i--;
  for (; i > 0; i--) {
    const ch = line[i];
    if (ch === ' ' || ch === '　' || ch === '-' || ch === '—' || ch === '–' || ch === '，' || ch === ',' || ch === '、' || ch === '/') {
      sepStart = i + 1;
      break;
    }
  }
  if (sepStart !== -1 && sepStart < endIdx) cuts.push(sepStart);

  const legalEnd = legalEntityBoundary(line, endIdx, depth);
  if (legalEnd !== null && !cuts.includes(legalEnd)) cuts.push(legalEnd);

  if (cuts.length === 0) return [];
  return cuts.map((cut) => makeSplit(line, cut));
}

function makeSplit(line: string, titleStart: number): { company: string; title: string } {
  const company = line.substring(0, titleStart).trim().replace(/[\s,，、\-—–]+$/, '');
  const title = line.substring(titleStart).trim().replace(/^[\s\-—–·]+/, '').replace(/[\s,，、]+$/, '');
  if (company.length < 2 || title.length < 2) return { company: '', title: '' };
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
  if (/^[•·\-*▪▫▶►→]\s*/.test(line) || /^\(\d+\)\s*/.test(line)) return true;
  // PDF 转出来的一级项目符号常是 Wingdings 字母: "o参与商业尽调" / "v 全面负责公司……"
  // 不认的话这些描述行会被当成公司行, 切出 "o协助撰写投委会报告" 这种垃圾经历。
  // 要求字母后面紧跟中文, 免得误伤 "Voxcraft_设计负责人" / "oppo" 这类真公司名。
  return /^[oOvV]\s*(?=[一-龥])/.test(line);
}

/**
 * 公司抬头常见的地名尾巴 —— "…科技北京"、"…投资上海，中国"、"Amazon.com（Alexa AI部门）西雅图"。
 */
const CITY_TAIL =
  /(?:北京|上海|深圳|广州|杭州|南京|苏州|成都|武汉|西安|厦门|青岛|长沙|香港|台北|中国|美国|纽约|西雅图|旧金山|洛杉矶|波士顿|东京|新加坡|首尔|伦敦|悉尼|多伦多)(?:市|区)?$/;

/** 公司名里常见的词根 —— "云启资本"、"…网络"、"…科技" */
const COMPANY_WORD =
  /(?:资本|集团|科技|网络|信息|传媒|数据|证券|银行|保险|投资|实业|控股|有限|股份|研究院|University|Inc|Ltd|LLC|Corp|Group|Holdings|Technologies|Labs)/i;

/** 以这些字开头的一定是句子碎片, 不是公司名 —— "的数据结构建议"、"和客户激励，…" */
const NOT_COMPANY_START = /^[的了和与及或在是代也就都还更最不没将把被给从向对为以其该本]/;

/** 品牌词 —— 行里出现这些, 就说明这行跟公司有关 */
const BRAND_TOKENS = Object.keys(PRODUCT_TO_COMPANY_MAP)
  .filter((t) => t.length >= 2)
  .sort((a, b) => b.length - a.length);

/**
 * 这一行像不像公司抬头 —— 用来判断"公司名在不在这一行"。
 *
 * 公司抬头也带逗号("路威凯腾（L Catterton Asia）北京，中国"、"北京三快网络科技有限公司（美团）中国，北京"),
 * 所以不能只看有没有句读, 得看结尾 —— 城市或工商后缀收尾的是抬头, 句读收尾的是描述句。
 */
function looksLikeCompanyHeader(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // 品牌词最硬 —— "TikTok商业化（GMPT）创意AI Data Infra PM：重点负责…" 这种
  // 长句也是公司行, 靠品牌词认。
  if (BRAND_TOKENS.some((tok) => t.includes(tok))) return true;
  if (/[。！？；：:]/.test(t)) return false;
  if (NOT_COMPANY_START.test(t)) return false;
  if (/(?:有限责任公司|股份有限公司|有限公司|集团公司|集团|公司|银行|研究院|事务所)$/.test(t)) return true;
  if (CITY_TAIL.test(t)) return true;
  const lastSeg = t.split(/[，,、]/).pop()?.trim() ?? '';
  if (CITY_TAIL.test(lastSeg)) return true;
  if (COMPANY_WORD.test(t)) return true;
  // 短的专有名词 —— "小红书"、"字节跳动"、"增长黑盒"
  return t.length <= 12 && !/[0-9%]/.test(t);
}

/** 已知母公司 —— 出现在这里说明公司名认得出来 */
const KNOWN_COMPANIES = new Set(Object.values(PRODUCT_TO_COMPANY_MAP));

/**
 * 公司名质量分 —— 描述句当公司名要扣分, 认得出的真公司名加分。
 * 用来在几个候选切法里挑最好的那个。
 */
function companyQuality(name: string): number {
  if (!name) return -100;
  let s = 0;
  if (/[。！？；：:]/.test(name)) s -= 10;
  if (NOT_COMPANY_START.test(name)) s -= 10;
  if (name.length > 22) s -= 4;
  if (name.length <= 2) s -= 4;
  if (/(?:有限责任公司|股份有限公司|有限公司|集团公司)$/.test(name)) s += 5;
  if (KNOWN_COMPANIES.has(name)) s += 6;
  else if (BRAND_TOKENS.some((t) => name.includes(t))) s += 4;
  if (CITY_TAIL.test(name)) s += 3;
  if (COMPANY_WORD.test(name)) s += 2;
  return s;
}

/** 一条工作经历整体的质量分 */
function workItemScore(item: WorkHistory): number {
  let s = companyQuality(item.company);
  if (item.title) {
    if (/[。！？；]/.test(item.title)) s -= 5;
    if (item.title.length > 45) s -= 3;
  } else {
    s -= 1;
  }
  if (!item.startYear) s -= 5;
  return s;
}

// 行内是否含日期范围 (允许同行有其他文字, 如 "2022.09 - 2024.06  清华大学  计算机  本科")
// Allen 2026-08-12: 用于 extractWorkHistory 的 block 切分, 避免把含日期的教育条目
// 串到含日期的工作条目里导致 yearRange 取错.
// Allen 2026-10-29: 结束日期也要吃掉月份精度, 否则 "2023.03 - 2023.09" 只匹配到
// "2023.03 - 2023", 剩下的 ".09" 被当成"日期后面还有内容", 导致这一行不被
// 识别成时间锚点 —— 整段工作经历被并进上一条的 description。
const DATE_INLINE_RE = /(\d{4})\s*[\.\-/年]?\s*(\d{1,2})?\s*[-—–到至~～]\s*(?:\d{4}\s*[\.\-/年]?\s*(\d{1,2})?|至今|现在|present|now|Present|Now)/i;
function hasInlineDate(line: string): boolean {
  return DATE_INLINE_RE.test(line);
}

// 是否为简历 section header (教育/技能/项目) — 不应被当作公司名
const SECTION_HEADER_RE = /^(教育经历|教育背景|学历|学历背景|专业技能|技能|技术栈|技能清单|项目经验|项目经历|实习经历|工作经历|工作经验|工作履历|任职经历|任职履历|自我评价|个人简介|个人优势|Education|Academic\s*Background|Skills?|Tech\s*Stack|Projects?|Internship|Work\s*Experience|Work\s*History|Employment|Career\s*History|Profile|Summary|Career|Objective)/i;
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

// 日期范围出现在行内任意位置(开头或结尾)时都剥掉。
//
// Allen 2026-10-29: 中文简历里"公司 + 时间"写在同一行是极常见的排版 ——
//   "北京西云数据科技有限公司2024年01月 - 至今"
//   "2024.5-至今商汤科技—研究院（日日新大模型多模态团队）多模态产品负责人"
// 只剥开头的话, 公司名会连着年份一起进 resolveCompanyName,
// 而 looksObviouslyNotCompany 见到年份直接 reject → 这条工作经历整条丢失。
// 在 287 份人才库实测: 剥之前只有 47.7% 的简历解析出工作经历, 剥之后大幅回升。
const DATE_RANGE_ANY_RE =
  /(?:\d{4})\s*[\.\-/年]?\s*(\d{1,2})?\s*[-—–到至~～]\s*(?:(?:\d{4})\s*[\.\-/年]?\s*(\d{1,2})?|至今|现在|present|now|Present|Now)/i;

function stripDateRangeAnywhere(line: string): string {
  return line.replace(DATE_RANGE_ANY_RE, ' ').replace(/\s{2,}/g, ' ').trim();
}

// 行是不是"时间锚点行"—— 用来切分工作经历的 block。
//
// 除整行只有日期的情况外,还认"日期在行首或行尾"的头行(公司 + 时间)。
// 日期夹在句子中间的是正文时间状语,不算锚点;剩余文本过长的多半是描述句,也不算。
function isDateAnchorLine(line: string): boolean {
  if (isDateOnlyLine(line)) return true;
  if (isBulletLine(line)) return false;
  const m = line.match(DATE_INLINE_RE);
  if (!m || m.index === undefined) return false;

  const before = line.slice(0, m.index).trim();
  // 日期后面挂的括号备注不算正文: "2025.10.20-2026.3（公司管线调整领补偿离职）"
  const after = line.slice(m.index + m[0].length).replace(/[（(【[].*$/, '').trim();
  if (before.length > 0 && after.length > 0) return false;

  const rest = before || after;
  return rest.length <= 60;
}

// 解析单个工作 block，返回 WorkHistory 或 null
/**
 * 一条工作经历的候选起点 —— 日期行本身, 以及往前 1~2 行。
 * 往回看时遇到日期行(上一条经历)或项目符号(上一段的正文)就停。
 */
function candidateStarts(dIdx: number, lines: string[]): number[] {
  const starts = [dIdx];
  for (let back = 1; back <= 2; back++) {
    const i = dIdx - back;
    if (i < 0) break;
    const line = lines[i];
    if (isDateOnlyLine(line) || hasInlineDate(line)) break;
    if (isBulletLine(line)) break;
    starts.push(i);
  }
  return starts;
}

function parseWorkBlock(block: string): WorkHistory | null {
  const allLines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  if (allLines.length === 0) return null;

  const yearRange = extractYearRange(block);
  if (!yearRange) return null;

  // 行分类
  const dateLines: string[] = [];
  const headerLines: string[] = [];
  const bulletLines: string[] = [];

  // PDF 里一条项目符号经常折行, 续行不带符号:
  //   "·1）搭建类 agent 原型…完成A2A社区互动的原"
  //   "型验证。（捏Agent，…）"
  // 续行不是新的公司/职位行, 认成 header 会把公司名解析成半句话。
  //
  // 但公司行本身也可能紧跟在 bullet 后面("…项目成果：…\nAmazon.com（Alexa AI部门）西雅图\n研发工程师2020.06 – 2021.07"),
  // 所以紧挨着"带日期的行"、而且自己像个公司名的那一行算公司行, 不当续行。
  const lineHasDate = allLines.map((l) => hasInlineDate(l));
  let afterBullet = false;
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    if (isDateOnlyLine(line)) {
      dateLines.push(line);
      afterBullet = false;
    } else if (isBulletLine(line)) {
      bulletLines.push(stripBulletPrefix(line));
      afterBullet = true;
    } else if (
      afterBullet &&
      !lineHasDate[i] &&
      !(i + 1 < allLines.length && lineHasDate[i + 1] && looksLikeCompanyHeader(line))
    ) {
      bulletLines.push(line);
    } else {
      headerLines.push(stripDateRangeAnywhere(line));
      afterBullet = false;
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
    for (const split of splitCompanyTitleByKeyword(headerLines[0])) {
      if (!split.company || !split.title) continue;
      const resolved = resolveCompanyName(split.company);
      if (resolved) {
        company = resolved;
        title = split.title;
        headerConsumed = 1;
        break;
      }
    }
  }

  // Strategy C': "工商全称 + 职位/地点" 排版 —— 公司名到工商后缀为止。
  //   "北京百度网讯科技有限公司技术产品经理（TPM）" → 职位在同一行;
  //   "中国惠普有限公司北京/华东区域"             → 职位在下一行。
  // 整行当公司名会把职位或地点也吃进公司名。
  if (!company) {
    const legal = legalEntityPrefix(headerLines[0]);
    const next = headerLines[1];
    if (legal && legal.rest) {
      // 括号说明可能是品牌别名("（美团）")—— 带上它能命中公司库, 优先用
      const withNote = legal.note ? `${legal.prefix}${legal.note}` : legal.prefix;
      let resolved = withNote !== legal.prefix ? resolveCompanyName(withNote) : null;
      if (!resolved || resolved === withNote) resolved = resolveCompanyName(legal.prefix);
      if (resolved) {
        if (isTitleLike(legal.rest)) {
          company = resolved;
          title = legal.rest.replace(/^[\s\-—–·]+/, '').replace(/[\s,，、]+$/, '').trim();
          headerConsumed = 1;
        } else if (next && isTitleLike(next)) {
          company = resolved;
          title = next;
          headerConsumed = 2;
        }
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

  // Strategy E: "职位 + 日期" 在上、"公司" 在下("设计负责人2023-至今\n北京生数科技有限公司")
  if (!company) {
    const first = headerLines[0];
    const second = headerLines[1];
    if (second && isTitleLike(first) && looksLikeCompanyHeader(second)) {
      const resolved = resolveCompanyName(second);
      if (resolved) {
        company = resolved;
        title = first;
        headerConsumed = 2;
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
    // 头部后面不能跟逗号 —— "工作经验，熟练掌握数据分析…" 是自我评价里的句子,
    // 不是章节标题, 认成标题会把整段自我评价当成工作经历 section。
    //
    // 结束标志必须在行首 —— 正文里出现 "项目经验沉淀"、"技能提升" 这类词很常见,
    // 按子串匹配会在第一条中间就把 section 截断, 后面的经历整段丢失。
    // 长标题必须排在短标题前面 —— 'Employment' 排在 'Employment History' 前面的话,
    // 匹配到 'Employment' 就停了, 剩下的 "History" 被当成 section 的第一行内容。
    //
    // 「任职经历」「Work History」这类写法以前不在名单里 → 整段文本被当成工作 section,
    // 教育条目的年份混进 workHistory, totalYears 直接算多 (实测 11 年 vs 实际 7 年)。
    /(?:工作经历|工作经验|职业经历|从业经历|工作[&＆和与、,，]\s*实习经历|专业经历|工作履历|任职经历|任职履历|职业历程|Employment\s*History|Employment|Work\s*Experience|Work\s*History|Professional\s*Experience|Professional\s*History|Career\s*History|Job\s*History|(?<![A-Za-z])WORKS\b)(?![,，、])[:：]?\s*([\s\S]+?)(?=(?<![^\n])\s*(?:项目经验|项目经历|教育|技能|Education|Projects?|Skills?|(?<![A-Za-z])WORKS\b)|$)/i,
    // 实习 section 的结束标志不能是裸 "项目" —— "全球化战略运营项目实习生" 这种
    // 职位名里就带 "项目", 会把实习 section 在第一条中间截断, 整段实习经历丢失。
    /(?:实习经历|Internship|Intern\s*Experience)(?![,，、])[:：]?\s*([\s\S]+?)(?=(?<![^\n])\s*(?:工作经历|项目经历|项目经验|教育|技能)|$)/i,
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

    // 找所有 date-only 行 / "公司 + 时间" 头行
    const dateIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (isDateAnchorLine(lines[i])) dateIndices.push(i);
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
      //
      // Allen 2026-10-29: 判断"要不要回看"不再看"这行是不是纯日期", 而是看
      //   "这行去掉日期后能不能解析成公司名":
      //   - "华为技术有限公司2023年03月 - 2023年09月" → 能解析成公司 → 不回看,
      //     否则会把上一段的描述行当成公司名, 整条经历解析成乱码公司。
      //   - "软件产品经理2024年04月 - 至今" (公司写在上一行) → 解析不出公司 →
      //     往前回看, 把 "联想（北京）有限公司北京" 捞进来。
      //
      // Allen 2026-11-02: 公司名的位置不统一 —— 可能在日期行同行、上一行、
      //   或者上两行("峰瑞资本·FreeS Fund\n品牌经理/机构内容·全链路品牌建设\n2026.01 —PRESENT")。
      //   与其用一套启发式规则赌哪种排版, 不如把几个起点都试一遍, 挑公司名最像公司的那个。
      let best: WorkHistory | null = null;
      let bestScore = -Infinity;
      for (const startIdx of candidateStarts(dIdx, lines)) {
        const item = parseWorkBlock(lines.slice(startIdx, nextDateIdx).join('\n'));
        if (!item) continue;
        const s = workItemScore(item);
        if (s > bestScore) {
          bestScore = s;
          best = item;
        }
      }
      if (best) histories.push(best);
    }
  }

  return histories
    .sort((a, b) => {
      const aEnd = a.endYear ?? 9999;
      const bEnd = b.endYear ?? 9999;
      return bEnd - aEnd;
    })
    .slice(0, 15);
}

// 项目经验
function extractProjects(text: string): Project[] {
  const projects: Project[] = [];

  const sectionPatterns = [
    /(?:项目经验|项目经历|项目|Projects?|Project\s*Experience)[:：]?\s*([\s\S]+?)(?=(?<![^\n])\s*(?:教育|技能|工作经历|获奖|Education|Skills?|Work)|$)/i,
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
  onProgress?: ParseProgress,
  onWarn?: (message: string) => void,
): Promise<Candidate> {
  onProgress?.('文件解析中...');
  const text = await extractResumeText(file, onProgress);
  if (!text.trim()) {
    throw new Error('简历内容为空，请检查文件是否损坏或为空');
  }

  onProgress?.('AI 智能解析中...');
  try {
    const mod = await import('./llmClient');
    const { candidate, truncated } = await mod.parseResumeWithLLM(text);
    if (candidate) {
      if (truncated) {
        onWarn?.('这份简历内容太长, AI 输出被截断了 —— 解析结果可能缺一些字段, 建议手动核对并补充。');
      }
      onProgress?.('解析完成');
      return candidate;
    }
  } catch (e) {
    console.warn('[parseResume] LLM 解析失败，降级到本地解析:', e);
  }

  onWarn?.('AI 解析没成功, 已改用本地规则解析 —— 结果可能不如 AI 完整, 建议核对一下。');
  onProgress?.('AI 解析失败，已使用本地规则解析');
  return parseResumeText(text);
}
