// =====================================================
// 健康检查 - 是否配置了 MINIMAX_API_KEY
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json({
    serverKeyConfigured: Boolean(process.env.MINIMAX_API_KEY),
    model: 'MiniMax-M3',
    timestamp: new Date().toISOString(),
  });
}