// =====================================================
// Vercel Serverless Function - 账号 (POST /api/auth)
//
// Vercel 这边没配 Netlify Blobs 的凭证 (加环境变量得走 Vercel 后台, 本机改不了),
// 而账号数据是存在 Blobs 里的 —— 所以这里只做转发, 把请求原样发给国内镜像站。
// 和 /api/jobs 一个套路: 镜像站才是真正干活的。
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const MIRROR_URL = process.env.JOBS_MIRROR_URL ?? 'https://bosi-analyzer.netlify.app';

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * 取真实客户端 IP。
 * x-forwarded-for 是一串, 客户端可以自己塞一段在前面 ——
 * 所以最后一段才是平台追加的可信值。
 */
function clientIp(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const chain = (Array.isArray(xff) ? xff.join(',') : (xff ?? ''))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length) return chain[chain.length - 1];
  const real = req.headers['x-real-ip'];
  return (Array.isArray(real) ? real[0] : real) ?? 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const upstream = await fetch(`${MIRROR_URL}/api/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 镜像站按来源 IP 限流。不透传的话, 所有 Vercel 用户共用 Vercel 出口 IP
        // 这一个桶 —— 一个人用满登录次数, 所有人一起被锁。
        'X-Forwarded-For': clientIp(req),
      },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(25_000),
    });
    const text = await upstream.text();

    res.status(upstream.status);
    res.setHeader('Content-Type', 'application/json');
    return res.end(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[auth] 镜像站不可达:', err);
    return res.status(502).json({ ok: false, error: `账号服务暂时不可用: ${message}` });
  }
}
