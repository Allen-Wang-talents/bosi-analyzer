// =====================================================
// 健康检查 - 是否配置了 MINIMAX_API_KEY
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';

// 服务模块用动态载入 —— 万一文件没进部署包, 健康检查也只是报默认型号,
// 不会整个函数 500 (健康检查挂了, 监控反而瞎了)
let minimaxModule: Promise<typeof import('../server/minimax.ts')> | null = null;

function loadMinimax(): Promise<typeof import('../server/minimax.ts')> {
  if (!minimaxModule) {
    minimaxModule = import('../server/minimax.ts').catch((err) => {
      minimaxModule = null;
      throw err;
    });
  }
  return minimaxModule;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 从真正发请求的那个模块里取型号 —— 写死字符串的话, 换模型之后
  // 健康检查还在报旧型号, 排查的人会被带偏
  let model = 'MiniMax-M3';
  try {
    model = (await loadMinimax()).DEFAULT_MODEL;
  } catch (err) {
    console.error('[health] 模型信息读取失败, 用默认值:', err);
  }

  return res.status(200).json({
    serverKeyConfigured: Boolean(process.env.MINIMAX_API_KEY),
    model,
    timestamp: new Date().toISOString(),
  });
}
