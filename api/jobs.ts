// =====================================================
// Vercel Serverless Function - 岗位池 (GET /api/jobs)
//
// 从飞书多维表格「北京AI岗位汇总」拉全部在招岗位, 带 5 分钟服务端缓存。
// 拉不到时返回 HTTP 200 + degraded:true —— 前端据此显示降级提示,
// 但「深度评鉴」页完全不受影响。
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getJobsPayload } from '../server/jobsService.ts';

// 拉飞书最多允许跑 60 秒 —— 默认的 10 秒上限不够 8 张表分页读完
export const config = { maxDuration: 60 };

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
  const payload = await getJobsPayload({
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    force,
  });
  return res.status(200).json(payload);
}
