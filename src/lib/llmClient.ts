// =====================================================
// LLM 客户端 - 改为调用 Vercel 后端 /api/chat
// 后端持有 MiniMax M3 API Key，前端不再直连
// =====================================================
import type { ScoreResult, Company, JD, JobProfile, Candidate } from '@/types';
import { serializeForLLM } from './formatReport';
import { resolveCompanyName } from '@/data/productCompanyMap';
import { extractTotalYears, parseResumeText } from './parseResume';

const SYSTEM_PROMPT = `你是博思AI人才评荐网的 AI 助手，服务于资深猎头顾问。你将收到一份结构化的候选人匹配分析数据，包括公司信息、岗位 JD、岗位画像、候选人简历解析、以及 4 个维度的评分与依据。

请基于这些数据回答顾问的问题。回答要求：
1. 使用中文，专业猎头口吻，简洁有力
2. 必须引用具体数据（分数、匹配项、缺失项、公司名、学校名等）
3. 不超过 250 字，除非顾问明确要求展开
4. 不要编造分析中不存在的事实，遇到信息不足时坦诚说明
5. 如果顾问问的是建议类问题，给出明确观点（推荐 / 谨慎 / 不推荐）+ 依据
6. 适当使用换行增强可读性`;

// 简历解析 prompt - 唯一解析入口
// 设计: LLM 一次性从简历原文提取完整 Candidate JSON，覆盖所有字段
// 铁律: 严禁编造简历中不存在的事实；不确定就留空
const RESUME_PARSE_SYSTEM_PROMPT = `你是博思AI人才评荐网的资深猎头顾问助理，专精从候选人简历文本中精准提取结构化信息，服务资深猎头做人才评估。

你的输入是一份简历的【原始文本】（可能含中英文混排、多种排版格式）。
你的任务是从中提取一份完整、干净的 JSON 对象，供猎头顾问直接用于匹配评分。

铁律（不可违反）：
1. 严禁编造简历中没有的公司名、学校名、职位、技能、年限、项目、姓名、电话、邮箱
2. 不确定的字段留空（null 或空数组），绝不主观补全
3. 公司名归一为母公司/集团全称（"抖音"→"字节跳动"，"蚂蚁支付宝团队"→"蚂蚁集团"，"阿里"→"阿里巴巴"）
   3.1 严禁把简历中出现的【项目名 / 产品名 / 团队名】作为公司名直接返回：
        "抖音电商后端"、"豆包大模型团队"、"蚂蚁支付宝团队"、"腾讯视频小程序团队" → 必须归一为 "字节跳动"/"蚂蚁集团"/"腾讯"，不要把 "抖音电商" / "豆包" / "支付宝" 当作公司名
   3.2 若某 token 命中下方【产品→母公司】映射表，必须用映射后的母公司名
   3.3 若不确定是公司名还是产品名，宁可返回 null 让用户手动补全，不要猜
   3.4 命中纯产品词但不在映射表（"推荐系统"、"广告系统"、"业务中台"、"电商系统" 等），必须返回 null
4. 学校名归一为官方全称（如"清华"→"清华大学"，"MIT"→"麻省理工学院"）
5. 学位只取五选一："博士" / "硕士" / "本科" / "专科" / "其他"
6. 工作年限 (totalYears) 计算优先级（严格按顺序，结果保留 1 位小数）：
   (a) 简历明文 "X 年经验" / "X 年以上工作经验" → 直接用
   (b) 已工作段最早 startYear → 当前年（最可靠）
   (c) 最高学历 endYear → 当前年（适用于应届/在校未工作但有实习）
   (d) 兜底为 0
   6.1 严禁把"本科入学年"或"教育 section 中出现的最早年份"当作工作年限。
       反例：候选人 2014 本科入学 → 2018 硕士 → 2020 硕士毕业 → 2022 入职 → 2026 工龄应为 4 年 (2026-2022)，不是 12 年 (2026-2014)
   6.2 候选人博士在读 / 硕士在读 → totalYears = 0（不要把本科入学年算进来）
7. 技能列表保留【可识别的核心技术词】（如 React、TypeScript、Python、Kubernetes、MySQL），避免过度泛化（"沟通"、"学习能力"、"认真负责"不要写）
8. 职位名保留原简历用词，可补全前缀（"前端工程师"→"高级前端工程师" 若简历明文写）
9. 当前公司 (currentCompany) = 最近一段仍在职的工作的公司；endYear=null 表示至今
10. 当前职位 (currentTitle) = 最近一段仍在职的工作的职位

【产品→母公司】高频映射表（命中即替换）：
  抖音 → 字节跳动
  今日头条 → 字节跳动
  西瓜视频 → 字节跳动
  番茄小说 → 字节跳动
  剪映 → 字节跳动
  飞书 → 字节跳动
  Lark → 字节跳动
  火山引擎 → 字节跳动
  豆包 → 字节跳动
  TikTok → 字节跳动
  淘宝 → 阿里巴巴
  天猫 → 阿里巴巴
  支付宝 → 蚂蚁集团
  蚂蚁 → 蚂蚁集团
  钉钉 → 阿里巴巴
  菜鸟 → 阿里巴巴
  饿了么 → 阿里巴巴
  高德 → 阿里巴巴
  优酷 → 阿里巴巴
  盒马 → 阿里巴巴
  阿里云 → 阿里巴巴
  通义 → 阿里巴巴
  微信 → 腾讯
  QQ → 腾讯
  王者荣耀 → 腾讯
  腾讯视频 → 腾讯
  腾讯会议 → 腾讯
  美团 → 美团
  大众点评 → 美团
  京东 → 京东
  百度 → 百度
  百度网盘 → 百度
  拼多多 → 拼多多
  小红书 → 小红书
  快手 → 快手
  哔哩哔哩 → 哔哩哔哩
  小米 → 小米
  华为 → 华为
  滴滴 → 滴滴
  蔚来 → 蔚来
  理想 → 理想汽车
  小鹏 → 小鹏汽车

输出格式（严格遵守）：
- 纯 JSON 对象，不要代码块、不要任何前言/后语、不要解释、不要 markdown
- 字段全部必填，缺失值用 null 或 []
- 结构示例：
{
  "name": "张三",
  "phone": "13800138000",
  "email": "zhangsan@example.com",
  "location": "北京",
  "birthYear": 1995,
  "totalYears": 6.0,
  "currentTitle": "高级前端工程师",
  "currentCompany": "字节跳动",
  "education": [
    {
      "school": "清华大学",
      "degree": "本科",
      "major": "软件工程",
      "startYear": 2014,
      "endYear": 2018
    }
  ],
  "workHistory": [
    {
      "company": "字节跳动",
      "title": "高级前端工程师",
      "startYear": 2020,
      "endYear": null,
      "description": "负责抖音电商前端架构升级，主导营销活动系统从 0 到 1 搭建"
    }
  ],
  "projects": [
    {
      "name": "抖音商城改版",
      "description": "主导前端架构升级，首屏渲染速度提升 30%"
    }
  ],
  "skills": ["React", "TypeScript", "Node.js", "Webpack"]
}

约束：
- phone/email 必须是 11 位手机号 / 标准邮箱格式
- 年份必须是 4 位数字，缺失就 null
- "至今"/"现在"/"present" → endYear: null
- description 字段保留关键职责、量化成果、关键技术栈，去除冗余
- skills 数组去重，单个技能 2-30 字符
- 工作经历按时间倒序（最近的在最前）
- 若简历内容完全无法识别，输出空对象 {}
`;

// 摘要润色专用 prompt - 对前端生成的结构化骨架做二次润色
// 目标: 保留所有事实证据不变，提升可读性与顾问交付质量
const POLISH_SYSTEM_PROMPT = `你是博思AI人才评荐网的资深猎头顾问助理，专精候选人履历匹配度分析润色。

你的输入是一份【结构化骨架】，由本地规则引擎基于 JD 必须/加分技能、岗位画像一票否决项与加分项、候选人项目经验与技能点命中明细客观生成。
你的任务是对骨架做【二次润色】，输出最终交付给猎头顾问的"履历匹配度分析"。

铁律（不可违反）：
1. 严禁新增骨架中没有的事实、数字、技能名、公司名、项目名、年限
2. 严禁删除骨架中的关键命中/未命中证据
3. 严禁改动分数、命中数、未命中数
4. 必须保留【整体定位】/【匹配亮点】/【关键差距】三段结构（顺序不可调换）
5. 必须保留每条要点前的 "- " 列表符号（亮点/差距段）
6. 命中一票否决项（deal-breaker）的句子必须显眼保留，不可弱化
7. 遇到信息不足/未识别的字段，保持骨架的客观措辞，不要主观补全

润色方向：
- 把机械拼接改为自然猎头口吻，去除冗余词
- 同义事实可合并表述，但要点数量不增不减
- 数字、英文术语、项目名、公司名原样保留
- 整体长度不超过原骨架的 1.2 倍

输出格式：
- 纯文本，不要代码块、不要 JSON
- 直接给出润色后的最终摘要，不要任何前言/后语`;

// 端点（同源部署时为空，相对路径）
const CHAT_ENDPOINT = '/api/chat';
const HEALTH_ENDPOINT = '/api/health';

export type ApiKeyGetter = () => string | null;

let keyGetter: ApiKeyGetter = () => null;

export function setApiKeyGetter(fn: ApiKeyGetter) {
  keyGetter = fn;
}

export class ApiKeyMissingError extends Error {
  constructor(message = '服务端未配置 AI 能力，请联系管理员') {
    super(message);
    this.name = 'ApiKeyMissingError';
  }
}

export type AskContext = {
  analysis: ScoreResult;
  company?: Company | null;
  jd?: JD | null;
  profile?: JobProfile | null;
  candidate?: Candidate | null;
};

// 健康检查 - 服务器是否就绪
export async function checkServerHealth(): Promise<{
  available: boolean;
  model?: string;
  error?: string;
}> {
  try {
    const res = await fetch(HEALTH_ENDPOINT, { method: 'GET' });
    if (!res.ok) return { available: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return {
      available: Boolean(data?.serverKeyConfigured),
      model: data?.model,
    };
  } catch (e) {
    return {
      available: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// 验证用户自己提供的 API Key（直连 MiniMax - 用于 override 场景）
export async function validateApiKey(key: string): Promise<boolean> {
  if (!key) return false;
  try {
    const response = await fetch('https://api.minimaxi.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'MiniMax-M3',
        max_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    return response.ok;
  } catch (e) {
    console.error('API Key 验证失败:', e);
    return false;
  }
}

// =====================================================
// 简历解析 (LLM 主导) - 唯一权威入口
// =====================================================
//
// Allen 2026-07-30: 把简历解析从"本地规则 + LLM 补缺补漏"切换到"LLM 主导解析"。
// 理由: LLM 一次性返回完整 Candidate，解析质量上限更高，能处理非典型格式。
// 失败/超时/服务不可用时静默降级到本地 parseResumeText。
//
// 设计要点:
//   - RESUME_PARSE_SYSTEM_PROMPT 强约束：禁编造、字段必填、缺失用 null/[]
//   - 25s 超时降级 (Promise.race)
//   - parseCandidateFromLLM 严格白名单 + 类型校验，过滤无效数据
//   - 返回的对象保证字段类型正确，缺字段用空值兜底
//

// 单条输入上限，避免超长简历撑爆 token
const RESUME_TEXT_LIMIT = 8000;
// LLM 调用超时：超过该时间仍未响应则降级到本地解析，避免阻塞用户
const PARSE_TIMEOUT_MS = 25_000;

const VALID_DEGREES = new Set(['博士', '硕士', '本科', '专科', '其他']);

/**
 * 用 LLM 主导解析简历原文，返回完整 Candidate。
 * 失败/超时/返回无效 JSON 时返回 null，调用方应降级到本地 parseResumeText。
 */
export async function parseResumeWithLLM(rawText: string): Promise<Candidate | null> {
  // 截断超长简历
  const trimmed = rawText.length > RESUME_TEXT_LIMIT
    ? rawText.slice(0, RESUME_TEXT_LIMIT) + '\n...(已截断)...'
    : rawText;

  const userPrompt = `请从以下简历文本中提取结构化 JSON。\n\n# 简历文本\n${trimmed}`;

  const messages = [
    { role: 'system' as const, content: RESUME_PARSE_SYSTEM_PROMPT },
    { role: 'user' as const, content: userPrompt },
  ];

  // 用户自定义 Key → 直连；否则走后端中转
  const userKey = keyGetter();
  try {
    const raw = await Promise.race([
      userKey
        ? directCall(userKey, messages, { maxTokens: 2000, temperature: 0.1 })
        : proxiedCall(messages, { maxTokens: 2000, temperature: 0.1 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('LLM 调用超时，已降级到本地解析')), PARSE_TIMEOUT_MS)
      ),
    ]);
    return parseCandidateFromLLM(raw, trimmed);
  } catch (e) {
    console.warn('[llmClient] LLM 解析失败，降级到本地解析:', e);
    return null;
  }
}

function buildResumeParsePrompt(rawText: string): string {
  return `请从以下简历文本中提取结构化 JSON。\n\n# 简历文本\n${rawText}`;
}

// 归一化 LLM 返回的公司名：
//   - 命中产品→母公司映射时替换（"抖音电商" → "字节跳动"）
//   - 命中纯产品/团队/系统词时返回 null（丢弃无效公司条目）
function normalizeCompanyNameForCandidate(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const resolved = resolveCompanyName(trimmed);
  if (!resolved) return null;
  return resolved.slice(0, 30);
}

// 从 LLM 输出构造完整 Candidate (严格白名单 + 类型校验)
export function parseCandidateFromLLM(raw: string, rawText: string): Candidate | null {
  if (!raw) return null;

  // 容错：剥离 <think> 块（部分模型返回推理过程）
  let s = raw.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/g, '').trim();

  // 容错：去除 markdown 代码块包裹
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  // 找第一个 { 与最后一个 }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  s = s.slice(start, end + 1);

  let parsed: any;
  try {
    parsed = JSON.parse(s);
  } catch (e) {
    console.warn('[llmClient] 解析 LLM 返回的 JSON 失败:', e);
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  // 解析 contact (合并 phone/email/location)
  const phone = typeof parsed.phone === 'string' && /^\d{11}$/.test(parsed.phone.trim())
    ? parsed.phone.trim()
    : undefined;
  const email = typeof parsed.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.email.trim())
    ? parsed.email.trim().toLowerCase()
    : undefined;
  const location = typeof parsed.location === 'string' && parsed.location.trim()
    ? parsed.location.trim().slice(0, 50)
    : undefined;
  const contact: Candidate['contact'] = (phone || email || location)
    ? { phone, email, location }
    : {};

  // 解析 education
  const llmEducation: Candidate['education'] = Array.isArray(parsed.education)
    ? parsed.education
        .filter((e: unknown) => e && typeof e === 'object')
        .map((e: any) => {
          if (typeof e.school !== 'string' || !e.school.trim()) return null;
          return {
            school: e.school.trim().slice(0, 40),
            degree: VALID_DEGREES.has(e.degree) ? e.degree : '其他',
            major: typeof e.major === 'string' && e.major.trim() ? e.major.trim().slice(0, 30) : undefined,
            startYear: typeof e.startYear === 'number' ? e.startYear : undefined,
            endYear: typeof e.endYear === 'number' ? e.endYear : undefined,
          };
        })
        .filter(Boolean)
    : [];

  // 解析 workHistory：公司名先归一化，产品/团队噪声直接丢弃
  // 注意: 这里 llmWorkHistory 仅作为本地 workHistory 为空时的兜底, 详见下方
  const llmWorkHistory: Candidate['workHistory'] = Array.isArray(parsed.workHistory)
    ? parsed.workHistory
        .filter((w: unknown) => w && typeof w === 'object')
        .map((w: any) => {
          if (typeof w.company !== 'string') return null;
          const company = normalizeCompanyNameForCandidate(w.company);
          if (!company) return null;
          if (typeof w.title !== 'string' || !w.title.trim()) return null;
          if (typeof w.startYear !== 'number' || w.startYear < 1970 || w.startYear > 2030) return null;
          const endYear = w.endYear === null
            ? null
            : (typeof w.endYear === 'number' && w.endYear >= 1970 && w.endYear <= 2030 ? w.endYear : null);
          const startYear = w.startYear as number;
          const endY = endYear ?? new Date().getFullYear();
          return {
            company,
            title: w.title.trim().slice(0, 50),
            startYear,
            endYear,
            durationMonths: Math.max(0, (endY - startYear) * 12),
            description: typeof w.description === 'string' ? w.description.trim().slice(0, 1000) : '',
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          const aEnd = a.endYear ?? 9999;
          const bEnd = b.endYear ?? 9999;
          return bEnd - aEnd;
        })
        .slice(0, 10)
    : [];

  // 本地确定性解析兜底：LLM 漏提工作经历/教育时补回
  let localCandidate: Candidate | null | undefined;
  const getLocalCandidate = (): Candidate => {
    if (localCandidate === undefined) {
      try {
        localCandidate = parseResumeText(rawText);
      } catch (e) {
        console.warn('[llmClient] 本地兜底解析失败:', e);
        localCandidate = null;
      }
    }
    if (!localCandidate) {
      return {
        rawText,
        totalYears: 0,
        education: [],
        workHistory: [],
        projects: [],
        skills: [],
      };
    }
    return localCandidate;
  };

  // Allen 2026-08-21 修复 (Bug 1 + Bug 2):
  //   LLM 给的 workHistory 经常出现两类致命错误:
  //     a) 把教育条目 (e.g. "2015.09 - 2019.06 北京大学") 当成工作段
  //        → 学校名漏过 PRODUCT_TO_COMPANY_MAP + 黑名单 → 当成公司名 → earliest startYear=2015
  //        → extractTotalYears 算出 11 年 (典型 11 年 bug).
  //     b) 把项目/产品/部门名 (e.g. "抖音商城改版项目") 当成公司名
  //        → resolveCompanyName 偶尔漏判 → 流到 scoreCompany → Tier 4 → 评分 35.
  //   本地 extractWorkHistory 已在 parseResume.test.ts 25 个测试全过, 含
  //     - section header 拦截 (isSectionHeader)
  //     - looksLikeEducation 二次过滤
  //     - 多种策略切分公司 / 标题
  //     所以 workHistory 完全用本地结果作为权威, LLM 给的仅在本地为空时兜底.
  //   education 仍优先 LLM (学校归一 LLM 更准), 但用本地补强学校/学位识别.
  const localWorkHistory = getLocalCandidate().workHistory;
  const workHistory: Candidate['workHistory'] = localWorkHistory.length > 0
    ? localWorkHistory
    : llmWorkHistory;

  const education: Candidate['education'] = llmEducation.length > 0
    ? llmEducation
    : getLocalCandidate().education;

  // 总年限：不信任 LLM 直接返回的 totalYears，改用统一规则重算，避免模型算错
  const totalYears = extractTotalYears(rawText, education, workHistory);

  // 当前公司/职位：优先仍在职的最近一段；否则退回 LLM 给出的有效值
  const ongoing = workHistory.find((w) => w.endYear === null);
  const latest = ongoing ?? workHistory[0];
  const resolvedLlmCompany = typeof parsed.currentCompany === 'string'
    ? normalizeCompanyNameForCandidate(parsed.currentCompany)
    : null;
  const resolvedLlmTitle = typeof parsed.currentTitle === 'string'
    ? parsed.currentTitle.trim().slice(0, 50)
    : undefined;
  const currentCompany = latest?.company ?? resolvedLlmCompany ?? undefined;
  const currentTitle = latest?.title ?? resolvedLlmTitle;

  // 解析 projects
  const projects: Candidate['projects'] = Array.isArray(parsed.projects)
    ? parsed.projects
        .filter((p: unknown) => p && typeof p === 'object')
        .map((p: any) => {
          if (typeof p.name !== 'string' || !p.name.trim()) return null;
          return {
            name: p.name.trim().slice(0, 80),
            description: typeof p.description === 'string' ? p.description.trim().slice(0, 1000) : '',
          };
        })
        .filter(Boolean)
        .slice(0, 10)
    : [];

  // 解析 skills
  const skills: string[] = Array.isArray(parsed.skills)
    ? parsed.skills
        .filter((x: unknown) => typeof x === 'string')
        .map((x: string) => x.trim())
        .filter((x: string) => x.length >= 2 && x.length <= 30)
        .slice(0, 30)
    : [];

  return {
    rawText,
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 20) : undefined,
    contact,
    birthYear: typeof parsed.birthYear === 'number' && parsed.birthYear >= 1940 && parsed.birthYear <= new Date().getFullYear()
      ? parsed.birthYear
      : undefined,
    totalYears,
    currentTitle,
    currentCompany,
    education,
    workHistory,
    projects,
    skills,
  };
}

// =====================================================
// 摘要润色（AI 二次润色结构化骨架）
// 复用 /api/chat，仅切换 system prompt；前端不需新端点
// =====================================================
export async function polishSummary(rawSummary: string, ctx: AskContext): Promise<string> {
  const userPrompt = buildPolishPrompt(rawSummary, ctx);
  const messages = [
    { role: 'system' as const, content: POLISH_SYSTEM_PROMPT },
    { role: 'user' as const, content: userPrompt },
  ];

  const userKey = keyGetter();
  if (userKey) {
    return directCall(userKey, messages, { maxTokens: 1200, temperature: 0.4 });
  }

  return proxiedCall(messages, { maxTokens: 1200, temperature: 0.4 });
}

function buildPolishPrompt(rawSummary: string, ctx: AskContext): string {
  const parts: string[] = [];
  parts.push('# 待润色骨架（本地规则生成）');
  parts.push(rawSummary);
  parts.push('');

  // 附上下文，便于 LLM 在不偏离事实的前提下做轻量润色
  parts.push('# 上下文参考（仅供润色，不可新增事实）');
  if (ctx.jd) {
    parts.push('## 岗位 JD');
    parts.push(`职位: ${ctx.jd.title}`);
    if (ctx.jd.minYears) parts.push(`经验要求: ${ctx.jd.minYears}+ 年`);
    if (ctx.jd.mustHaveSkills.length) parts.push(`必须技能: ${ctx.jd.mustHaveSkills.join('、')}`);
    if (ctx.jd.niceToHaveSkills.length) parts.push(`加分技能: ${ctx.jd.niceToHaveSkills.join('、')}`);
    parts.push('');
  }
  if (ctx.profile) {
    parts.push('## 岗位画像补充');
    if (ctx.profile.dealBreakers.length) parts.push(`一票否决: ${ctx.profile.dealBreakers.join('、')}`);
    if (ctx.profile.niceToHaves.length) parts.push(`加分项: ${ctx.profile.niceToHaves.join('、')}`);
    if (ctx.profile.culturalFit) parts.push(`文化契合: ${ctx.profile.culturalFit}`);
    parts.push('');
  }
  if (ctx.candidate) {
    parts.push('## 候选人');
    if (ctx.candidate.currentTitle) {
      parts.push(`当前职位: ${ctx.candidate.currentTitle}${ctx.candidate.currentCompany ? ' @ ' + ctx.candidate.currentCompany : ''}`);
    }
    parts.push(`工作年限: ${ctx.candidate.totalYears.toFixed(1)} 年`);
    if (ctx.candidate.skills.length) parts.push(`技能: ${ctx.candidate.skills.slice(0, 15).join('、')}`);
    parts.push('');
  }
  parts.push('# 综合评分参考');
  parts.push(`总分 ${ctx.analysis.total.toFixed(1)} / 100 (${ctx.analysis.recommendation.label})`);
  return parts.join('\n');
}

export async function askAboutAnalysis(question: string, ctx: AskContext): Promise<string> {
  const userPrompt = buildUserPrompt(question, ctx);
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: userPrompt },
  ];

  // 用户自定义 Key - 走直连（高级用户 override）
  const userKey = keyGetter();
  if (userKey) {
    return directCall(userKey, messages);
  }

  // 默认 - 走后端中转
  return proxiedCall(messages);
}

async function proxiedCall(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        max_tokens: options?.maxTokens ?? 800,
        temperature: options?.temperature ?? 0.5,
      }),
    });
  } catch (e) {
    throw new ApiKeyMissingError(
      `无法连接到服务器: ${e instanceof Error ? e.message : '网络错误'}`
    );
  }

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: response.statusText }));
    const msg = errBody?.error || `HTTP ${response.status}`;
    if (response.status === 429) throw new Error('请求过于频繁，请稍后再试');
    if (response.status === 500) throw new ApiKeyMissingError(msg);
    throw new Error(msg);
  }

  const data = await response.json();
  return (data?.content ?? '').trim();
}

async function directCall(
  userKey: string,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const response = await fetch('https://api.minimaxi.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userKey}`,
    },
    body: JSON.stringify({
      model: 'MiniMax-M3',
      max_tokens: options?.maxTokens ?? 800,
      temperature: options?.temperature ?? 0.5,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    let msg = `API ${response.status}: ${errText || response.statusText}`;
    if (response.status === 401) msg = 'API Key 无效或已过期，请检查设置';
    else if (response.status === 429) msg = '请求过于频繁，请稍后再试';
    else if (response.status === 402) msg = '账户余额不足，请充值';
    throw new Error(msg);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content?.trim() ?? '';
  return stripThinkingTags(rawContent);
}

function stripThinkingTags(text: string): string {
  return text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/g, '')
    .trim();
}

function buildUserPrompt(question: string, ctx: AskContext): string {
  const parts: string[] = [];

  parts.push('# 当前分析上下文');
  parts.push('');

  if (ctx.company) {
    parts.push(`## 客户公司\n${ctx.company.name} · ${ctx.company.industry} · ${ctx.company.size}人 · ${ctx.company.stage}\n主营: ${ctx.company.business}\n产品: ${ctx.company.products}`);
    parts.push('');
  }

  if (ctx.jd) {
    parts.push(`## 岗位 JD\n职位: ${ctx.jd.title}\n地点: ${ctx.jd.location || '未指定'}\n经验要求: ${ctx.jd.minYears}+ 年\n薪资: ${ctx.jd.compRange ? `${ctx.jd.compRange.min/1000}K-${ctx.jd.compRange.max/1000}K` : '未指定'}\n行业: ${ctx.jd.industry || '未指定'}`);
    parts.push(`必须技能: ${ctx.jd.mustHaveSkills.join('、') || '无'}`);
    parts.push(`加分技能: ${ctx.jd.niceToHaveSkills.join('、') || '无'}`);
    if (ctx.jd.responsibilities.length > 0) {
      parts.push(`主要职责:\n${ctx.jd.responsibilities.slice(0, 6).map((r) => `  - ${r}`).join('\n')}`);
    }
    parts.push('');
  }

  if (ctx.profile) {
    parts.push('## 顾问补充画像');
    if (ctx.profile.dealBreakers.length) parts.push(`一票否决: ${ctx.profile.dealBreakers.join('、')}`);
    if (ctx.profile.niceToHaves.length) parts.push(`加分项: ${ctx.profile.niceToHaves.join('、')}`);
    if (ctx.profile.culturalFit) parts.push(`文化契合: ${ctx.profile.culturalFit}`);
    if (ctx.profile.targetCompanyTiers.length) parts.push(`目标公司 tier: ${ctx.profile.targetCompanyTiers.join(', ')}`);
    parts.push('');
  }

  if (ctx.candidate) {
    parts.push('## 候选人');
    if (ctx.candidate.name) parts.push(`姓名: ${ctx.candidate.name}`);
    if (ctx.candidate.currentTitle) parts.push(`当前职位: ${ctx.candidate.currentTitle}${ctx.candidate.currentCompany ? ' @ ' + ctx.candidate.currentCompany : ''}`);
    parts.push(`工作年限: ${ctx.candidate.totalYears.toFixed(1)} 年`);
    if (ctx.candidate.skills.length) parts.push(`技能: ${ctx.candidate.skills.slice(0, 15).join('、')}`);

    if (ctx.candidate.education.length > 0) {
      parts.push('教育:');
      ctx.candidate.education.slice(0, 3).forEach((e) => {
        parts.push(`  - ${e.school} · ${e.degree}${e.major ? ' · ' + e.major : ''}${e.schoolTier ? ` (Tier ${e.schoolTier})` : ''}`);
      });
    }

    if (ctx.candidate.workHistory.length > 0) {
      parts.push('工作经历:');
      ctx.candidate.workHistory.slice(0, 4).forEach((w) => {
        parts.push(`  - ${w.company}${w.companyTier ? ` (Tier ${w.companyTier})` : ''} · ${w.title} · ${w.startYear}-${w.endYear ?? '至今'} (${(w.durationMonths / 12).toFixed(1)}年)`);
      });
    }
    parts.push('');
  }

  parts.push(serializeForLLM(ctx.analysis));

  parts.push('');
  parts.push('# 顾问的问题');
  parts.push(question);

  return parts.join('\n');
}
