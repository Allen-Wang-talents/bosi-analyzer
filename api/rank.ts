// =====================================================
// Vercel Serverless Function - 岗位精排 (POST /api/rank)
//
// 只对本地粗排出来的 top 10 做精排, 并给每个岗位写推荐理由。
//
// 为什么单独开一个端点, 不复用 /api/chat:
//   /api/chat 的 max_tokens 被硬夹在 2000。10 个岗位 × 150 字 ≈ 2500~3000 token,
//   夹住必被截断, JSON 必然解析失败。
//
// 保密边界 (硬性):
//   - 候选人不发 rawText / 联系方式 / 生日
//   - 岗位不发 合同点位 / 预计收费 / 薪资带宽 / 客户层级 —— 这些跟人岗契合无关,
//     发了模型会顺手按薪资排, 顾问没法解释
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { parseRankItems, type RankItem } from '../shared/rankParse.ts';

const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/chat/completions';
const DEFAULT_MODEL = 'MiniMax-M3';
const MAX_TOKENS = 8000;
const BATCH_SIZE = 10;

// 限流比 /api/chat 严 —— 精排是重活
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }
  entry.count++;
  return {
    allowed: entry.count <= RATE_LIMIT_MAX,
    remaining: Math.max(0, RATE_LIMIT_MAX - entry.count),
    resetIn: entry.resetAt - now,
  };
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// =====================================================
// 类型
// =====================================================

export type CandidateBrief = {
  title?: string;
  company?: string;
  years?: number;
  age?: number | null;
  skills?: string[];
  education?: Array<{ school?: string; degree?: string; major?: string }>;
  work?: Array<{ company?: string; title?: string; highlights?: string[] }>;
  projects?: Array<{ name?: string; description?: string }>;
};

export type JobBrief = {
  id: string;
  title?: string;
  client?: string;
  track?: string;
  location?: string;
  jd?: string;
  profile?: string;
};

// =====================================================
// Prompt
// =====================================================

const SYSTEM_PROMPT = `你是资深猎头顾问, 正在从一批在招岗位里, 为一位候选人挑出最值得推荐给客户的岗位, 并写出推荐理由。

判断标准只有一条: 人岗契合度。
不要评价薪资高低、客户层级、合同点位 —— 那些不是你的判断范围。

输出要求:
- 只输出一个 JSON 数组, 不要任何解释文字、不要 markdown 代码块
- 数组每个元素形如 {"id": "岗位id", "score": 87, "reason": "60-120字", "gaps": ["差距"]}
- score 是 0-100 的整数, 表示你对这个岗位的推荐信心
- reason 必须做到两件事: (a) 说明为什么匹配, 要引用岗位描述里的原词; (b) 点出一个差距或风险
- gaps 写具体的差距 (例如「没有多模态经验」「未体现过万卡集群训练」), 没有就写空数组
- 必须为输入里的每一个岗位都输出一项, id 必须原样照抄`;

function buildUserPrompt(candidate: CandidateBrief, jobs: JobBrief[]): string {
  const c = {
    当前职位: candidate.title ?? '未提供',
    当前公司: candidate.company ?? '未提供',
    工作年限: candidate.years ?? 0,
    年龄: candidate.age ?? null,
    技能: candidate.skills ?? [],
    教育: candidate.education ?? [],
    工作经历: candidate.work ?? [],
    项目: candidate.projects ?? [],
  };

  const j = jobs.map((job, i) => ({
    序号: i + 1,
    id: job.id,
    职位名称: job.title ?? '',
    客户: job.client ?? '',
    方向: job.track ?? '',
    地点: job.location ?? '',
    岗位JD: (job.jd ?? '').slice(0, 1500),
    人才画像: (job.profile ?? '').slice(0, 800),
  }));

  return `候选人信息:\n${JSON.stringify(c, null, 2)}\n\n岗位列表:\n${JSON.stringify(j, null, 2)}\n\n请输出 JSON 数组。`;
}

// =====================================================
// 调用
// =====================================================

async function callMiniMax(
  apiKey: string,
  candidate: CandidateBrief,
  jobs: JobBrief[]
): Promise<{ items: RankItem[]; finishReason: string | null }> {
  const upstream = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(candidate, jobs) },
      ],
    }),
  });

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    throw new Error(`上游 ${upstream.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await upstream.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const choice = data?.choices?.[0];
  const content = choice?.message?.content ?? '';
  return {
    items: parseRankItems(content),
    finishReason: choice?.finish_reason ?? null,
  };
}

/**
 * 精排一批岗位。
 * 一次问不下 (被截断 / JSON 解析失败) 就对半分再问, 最多拆两轮。
 */
async function rankBatch(
  apiKey: string,
  candidate: CandidateBrief,
  jobs: JobBrief[],
  depth = 0
): Promise<RankItem[]> {
  const { items, finishReason } = await callMiniMax(apiKey, candidate, jobs);

  const truncated = finishReason === 'length';
  if (items.length === 0 && (truncated || jobs.length > 1) && depth < 2) {
    const mid = Math.ceil(jobs.length / 2);
    const [a, b] = [jobs.slice(0, mid), jobs.slice(mid)];
    const left = await rankBatch(apiKey, candidate, a, depth + 1);
    const right = await rankBatch(apiKey, candidate, b, depth + 1);
    return [...left, ...right];
  }

  return items;
}

// =====================================================
// Handler
// =====================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown';
  const rl = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  if (!rl.allowed) {
    return res.status(429).json({ error: '精排请求过于频繁，请稍后再试' });
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      results: [],
      degraded: true,
      error: '服务端未配置 MINIMAX_API_KEY, 只返回本地排序结果。',
    });
  }

  const body = (req.body || {}) as { candidate?: CandidateBrief; jobs?: JobBrief[] };
  const candidate = body.candidate;
  const jobs = Array.isArray(body.jobs) ? body.jobs : [];

  if (!candidate || !jobs.length) {
    return res.status(400).json({ error: '请求缺少 candidate 或 jobs' });
  }
  if (jobs.length > BATCH_SIZE) {
    return res.status(400).json({ error: `一次最多精排 ${BATCH_SIZE} 个岗位` });
  }

  try {
    const results = await rankBatch(apiKey, candidate, jobs);
    return res.status(200).json({ results, degraded: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rank] 精排失败:', message);
    // 失败也返回 200 —— 前端保留本地排序, 只提示「AI 复核未完成」
    return res.status(200).json({ results: [], degraded: true, error: message });
  }
}
