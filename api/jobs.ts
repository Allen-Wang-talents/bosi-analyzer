// =====================================================
// Vercel Serverless Function - 岗位池 (GET /api/jobs)
//
// 从飞书多维表格「北京AI岗位汇总」拉全部在招岗位, 带 5 分钟服务端缓存。
// 拉不到时返回 HTTP 200 + degraded:true —— 前端据此显示降级提示,
// 但「深度评鉴」页完全不受影响。
//
// 本机 (Vercel) 还没配飞书凭证, 但国内镜像站 (Netlify) 走的是「刷新令牌存 Blobs」
// 那条通道, 数据是活的。所以这边没凭证时直接向镜像站借数据 —— 令牌只有镜像站那一份,
// 两边同时刷新会互相把一次性刷新令牌用掉, 所以只借不刷。
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';

// 拉飞书最多允许跑 60 秒 —— 默认的 10 秒上限不够 8 张表分页读完
export const config = { maxDuration: 60 };

// 服务模块用动态载入 —— 万一文件没进部署包, 也只是降级, 不会整个函数 500
let serviceModule: Promise<typeof import('../server/jobsService.ts')> | null = null;

function loadService(): Promise<typeof import('../server/jobsService.ts')> {
  if (!serviceModule) {
    serviceModule = import('../server/jobsService.ts').catch((err) => {
      serviceModule = null;
      throw err;
    });
  }
  return serviceModule;
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const MIRROR_URL = process.env.JOBS_MIRROR_URL ?? 'https://bosi-analyzer.netlify.app';
const MIRROR_TTL_MS = 5 * 60 * 1000;
let mirrorCache: { payload: unknown; fetchedAt: number } | null = null;

/** 向国内镜像站借一份岗位池 (只读, 不碰刷新令牌) */
async function fromMirror(force: boolean): Promise<unknown | null> {
  if (!force && mirrorCache && Date.now() - mirrorCache.fetchedAt < MIRROR_TTL_MS) {
    return mirrorCache.payload;
  }
  try {
    const res = await fetch(`${MIRROR_URL}/api/jobs`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const payload = await res.json();
    const jobs = (payload as { jobs?: unknown[] } | null)?.jobs;
    if (!Array.isArray(jobs) || jobs.length === 0) return null;
    mirrorCache = { payload, fetchedAt: Date.now() };
    return payload;
  } catch (err) {
    console.error('[jobs] 镜像站取数失败:', err);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const force = String(req.query?.refresh ?? '') === '1';

  const hasFeishu = Boolean(
    process.env.FEISHU_APP_ID ||
      process.env.FEISHU_APP_SECRET ||
      process.env.FEISHU_USER_ACCESS_TOKEN ||
      process.env.FEISHU_USER_REFRESH_TOKEN,
  );

  // 没配飞书凭证 → 借镜像站的数据
  if (!hasFeishu) {
    const mirrored = await fromMirror(force);
    if (mirrored) return res.status(200).json(mirrored);
    return res.status(200).json({
      jobs: [],
      fetchedAt: Date.now(),
      source: 'fallback',
      count: 0,
      degraded: true,
      error: '岗位库暂时读不到（飞书未授权，镜像站也不可达），稍后重试。',
    });
  }

  try {
    const { getJobsPayload } = await loadService();
    const payload = await getJobsPayload({
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET,
      userAccessToken: process.env.FEISHU_USER_ACCESS_TOKEN,
      userRefreshToken: process.env.FEISHU_USER_REFRESH_TOKEN,
      force,
    });
    return res.status(200).json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[jobs] 岗位池服务不可用:', err);
    return res.status(200).json({
      jobs: [],
      fetchedAt: Date.now(),
      source: 'fallback',
      count: 0,
      degraded: true,
      error: `岗位池服务不可用: ${message}`,
    });
  }
}
