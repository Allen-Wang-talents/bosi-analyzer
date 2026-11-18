// =====================================================
// 临时诊断端点 —— 查 /api/jobs 为什么 500
// 用完即删。只暴露「环境变量有没有配 / 模块能不能加载 / 飞书通不通」,
// 不回显任何密钥内容。
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const out: Record<string, unknown> = {
    node: process.version,
    now: new Date().toISOString(),
    env: {
      FEISHU_APP_ID: Boolean(process.env.FEISHU_APP_ID),
      FEISHU_APP_SECRET: Boolean(process.env.FEISHU_APP_SECRET),
      MINIMAX_API_KEY: Boolean(process.env.MINIMAX_API_KEY),
    },
  };

  const t0 = Date.now();
  try {
    const mod = await import('../server/feishu.ts');
    out.importOk = true;
    out.exports = Object.keys(mod);
    out.importMs = Date.now() - t0;
  } catch (err) {
    out.importOk = false;
    out.importError = err instanceof Error ? (err.stack ?? err.message) : String(err);
    return res.status(200).json(out);
  }

  if (process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET) {
    const t1 = Date.now();
    try {
      const result = await (await import('../server/feishu.ts')).fetchAllJobs(
        process.env.FEISHU_APP_ID,
        process.env.FEISHU_APP_SECRET,
      );
      out.fetchOk = true;
      out.count = result.jobs.length;
      out.failedTables = result.failedTables;
      out.fetchMs = Date.now() - t1;
    } catch (err) {
      out.fetchOk = false;
      out.fetchError = err instanceof Error ? (err.stack ?? err.message) : String(err);
      out.fetchMs = Date.now() - t1;
    }
  }

  return res.status(200).json(out);
}
