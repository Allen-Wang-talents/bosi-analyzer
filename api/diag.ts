// =====================================================
// 临时诊断端点 —— 查部署包里到底带上了哪些文件
// 用完即删。只暴露「文件在不在 / 环境变量配没配 / 飞书通不通」, 不回显任何密钥内容。
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

async function probe(path: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const mod = await import(/* @vite-ignore */ path);
    return { ok: true, detail: Object.keys(mod).slice(0, 8).join(',') };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, detail: msg.split('\n')[0].slice(0, 200) };
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const out: Record<string, unknown> = {
    node: process.version,
    now: new Date().toISOString(),
    env: {
      FEISHU_APP_ID: Boolean(process.env.FEISHU_APP_ID),
      FEISHU_APP_SECRET: Boolean(process.env.FEISHU_APP_SECRET),
      MINIMAX_API_KEY: Boolean(process.env.MINIMAX_API_KEY),
    },
    probes: {
      'server/feishu.ts': await probe('../server/feishu.ts'),
      'shared/jobs.ts': await probe('../shared/jobs.ts'),
      'shared/rankParse.ts': await probe('../shared/rankParse.ts'),
    },
  };

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (appId && appSecret) {
    const t0 = Date.now();
    try {
      const mod = await import('../server/feishu.ts');
      const result = await mod.fetchAllJobs(appId, appSecret);
      out.fetch = { ok: true, count: result.jobs.length, failedTables: result.failedTables, ms: Date.now() - t0 };
    } catch (err) {
      out.fetch = {
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 300) : String(err),
        ms: Date.now() - t0,
      };
    }
  }

  return res.status(200).json(out);
}
