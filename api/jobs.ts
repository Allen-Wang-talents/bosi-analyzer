// =====================================================
// Vercel Serverless Function - 岗位池 (GET /api/jobs)
//
// 从飞书多维表格「北京AI岗位汇总」拉全部在招岗位, 带 5 分钟服务端缓存。
// 拉不到时返回 HTTP 200 + degraded:true —— 前端据此显示降级提示,
// 但「深度评鉴」页完全不受影响。
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchAllJobs } from '../server/feishu.ts';
import type { JobPosition } from '../shared/jobs.ts';

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { jobs: JobPosition[]; fetchedAt: number } | null = null;

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const force = String(req.query?.refresh ?? '') === '1';
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return res.status(200).json({
      jobs: cache.jobs,
      fetchedAt: cache.fetchedAt,
      source: 'live',
      count: cache.jobs.length,
      degraded: false,
    });
  }

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    return res.status(200).json({
      jobs: [],
      fetchedAt: Date.now(),
      source: 'fallback',
      count: 0,
      degraded: true,
      error: '服务端未配置 FEISHU_APP_ID / FEISHU_APP_SECRET，岗位库暂不可用。',
    });
  }

  try {
    const jobs = await fetchAllJobs(appId, appSecret);
    cache = { jobs, fetchedAt: Date.now() };
    return res.status(200).json({
      jobs,
      fetchedAt: cache.fetchedAt,
      source: 'live',
      count: jobs.length,
      degraded: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[jobs] 拉取岗位失败:', message);
    return res.status(200).json({
      jobs: cache?.jobs ?? [],
      fetchedAt: cache?.fetchedAt ?? Date.now(),
      source: cache ? 'live' : 'fallback',
      count: cache?.jobs.length ?? 0,
      degraded: true,
      error: message,
    });
  }
}
