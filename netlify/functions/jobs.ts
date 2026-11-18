// =====================================================
// Netlify Function - 岗位池 (国内可访问的镜像部署)
//
// 业务逻辑与 Vercel 那套共用 server/jobsService.ts, 这里只做 req/res 的适配。
// =====================================================
import { getJobsPayload } from '../../server/jobsService.ts';

// 拉飞书最多允许跑 60 秒 —— 默认的 10 秒上限不够 8 张表分页读完
export const config = { timeout: 60 };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const force = new URL(req.url).searchParams.get('refresh') === '1';
  const payload = await getJobsPayload({
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    force,
  });

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
