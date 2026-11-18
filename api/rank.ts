// =====================================================
// Vercel Serverless Function - 岗位精排 (POST /api/rank)
//
// 只对本地粗排出来的 top 10 做精排, 并给每个岗位写推荐理由。
//
// 为什么单独开一个端点, 不复用 /api/chat:
//   /api/chat 的 max_tokens 被硬夹在 2000。10 个岗位 × 150 字 ≈ 2500~3000 token,
//   夹住必被截断, JSON 必然解析失败。
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { CandidateBrief, JobBrief } from '../server/rankService.ts';

// 精排要跑大模型 + 可能拆两轮, 10 秒的默认上限不够
export const config = { maxDuration: 60 };

// 服务模块用动态载入 —— 万一文件没进部署包, 也只是降级, 不会整个函数 500
let serviceModule: Promise<typeof import('../server/rankService.ts')> | null = null;
let minimaxModule: Promise<typeof import('../server/minimax.ts')> | null = null;
// 限流表必须是模块级的 —— 每次请求新建就等于没有限流
let rateLimiter: ((ip: string) => { allowed: boolean; remaining: number; resetIn: number }) | null = null;

function loadService(): Promise<typeof import('../server/rankService.ts')> {
  if (!serviceModule) {
    serviceModule = import('../server/rankService.ts').catch((err) => {
      serviceModule = null;
      throw err;
    });
  }
  return serviceModule;
}

async function loadMinimax(): Promise<typeof import('../server/minimax.ts')> {
  if (!minimaxModule) {
    minimaxModule = import('../server/minimax.ts').catch((err) => {
      minimaxModule = null;
      throw err;
    });
  }
  const mod = await minimaxModule;
  if (!rateLimiter) rateLimiter = mod.createRateLimiter(60_000, 10);
  return mod;
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown';

  try {
    await loadMinimax();
    const rl = rateLimiter!(ip);
    res.setHeader('X-RateLimit-Limit', '10');
    res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(rl.resetIn / 1000)));
    if (!rl.allowed) {
      return res.status(429).json({ error: '精排请求过于频繁，请稍后再试' });
    }
  } catch (err) {
    console.error('[rank] 限流模块不可用:', err);
    return res.status(200).json({ results: [], degraded: true, error: '精排服务不可用' });
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

  if (!body.candidate || !Array.isArray(body.jobs) || !body.jobs.length) {
    return res.status(400).json({ error: '请求缺少 candidate 或 jobs' });
  }

  try {
    const { rankJobs, BATCH_SIZE } = await loadService();
    if (body.jobs.length > BATCH_SIZE) {
      return res.status(400).json({ error: `一次最多精排 ${BATCH_SIZE} 个岗位` });
    }
    const payload = await rankJobs({ apiKey, candidate: body.candidate, jobs: body.jobs });
    return res.status(200).json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rank] 精排服务不可用:', err);
    return res.status(200).json({ results: [], degraded: true, error: message });
  }
}
