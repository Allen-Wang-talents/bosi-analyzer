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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const upstream = await fetch(`${MIRROR_URL}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}),
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
