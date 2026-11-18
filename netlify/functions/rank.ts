// =====================================================
// Netlify Function - 岗位精排 (国内可访问的镜像部署)
//
// 业务逻辑与 Vercel 那套共用 server/rankService.ts, 这里只做 req/res 的适配。
// =====================================================
import { rankJobs, BATCH_SIZE } from '../../server/rankService.ts';
import { createRateLimiter } from '../../server/minimax.ts';

// 精排要跑大模型, 默认的 10 秒上限不够
export const config = { timeout: 60 };

const checkRateLimit = createRateLimiter(60_000, 10);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const ip = req.headers.get('x-nf-client-connection-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const rl = checkRateLimit(ip);
  const rateHeaders = {
    'X-RateLimit-Limit': '10',
    'X-RateLimit-Remaining': String(rl.remaining),
    'X-RateLimit-Reset': String(Math.ceil(rl.resetIn / 1000)),
  };
  if (!rl.allowed) return json({ error: '精排请求过于频繁，请稍后再试' }, 429, rateHeaders);

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return json(
      { results: [], degraded: true, error: '服务端未配置 MINIMAX_API_KEY, 只返回本地排序结果。' },
      200,
      rateHeaders,
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    candidate?: Parameters<typeof rankJobs>[0]['candidate'];
    jobs?: Parameters<typeof rankJobs>[0]['jobs'];
  };

  if (!body.candidate || !Array.isArray(body.jobs) || !body.jobs.length) {
    return json({ error: '请求缺少 candidate 或 jobs' }, 400, rateHeaders);
  }
  if (body.jobs.length > BATCH_SIZE) {
    return json({ error: `一次最多精排 ${BATCH_SIZE} 个岗位` }, 400, rateHeaders);
  }

  const payload = await rankJobs({ apiKey, candidate: body.candidate, jobs: body.jobs });
  return json(payload, 200, rateHeaders);
}
