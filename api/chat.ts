// =====================================================
// Vercel Serverless Function - MiniMax M3 代理
// 把 API Key 从前端移到后端环境变量，避免 key 暴露
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  callMiniMax,
  createRateLimiter,
  upstreamMessage,
  UpstreamError,
  DEFAULT_MODEL,
} from '../server/minimax.ts';

const MAX_TOKENS_LIMIT = 2000;

// 限流（in-memory，仅同实例有效）
const checkRateLimit = createRateLimiter(60_000, 30);

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 限流
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown';
  const rl = checkRateLimit(ip);
  res.setHeader('X-RateLimit-Limit', '30');
  res.setHeader('X-RateLimit-Remaining', String(rl.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(rl.resetIn / 1000)));
  if (!rl.allowed) {
    return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
  }

  // 检查环境变量
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.error('[chat] MINIMAX_API_KEY 环境变量未设置');
    return res.status(500).json({
      error: '服务端未配置 API Key。请联系管理员在 Vercel 项目设置中添加 MINIMAX_API_KEY 环境变量。',
    });
  }

  // 解析请求体
  const body = (req.body || {}) as {
    messages?: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
    model?: string;
  };

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '请求缺少 messages 字段' });
  }
  if (messages.length > 50) {
    return res.status(400).json({ error: '对话轮次过多（最多 50 条）' });
  }
  // 简单校验
  for (const m of messages) {
    if (!m || typeof m !== 'object' || typeof m.content !== 'string') {
      return res.status(400).json({ error: '消息格式不正确' });
    }
    if (!['system', 'user', 'assistant'].includes(m.role)) {
      return res.status(400).json({ error: '消息角色必须为 system/user/assistant' });
    }
  }

  const maxTokens = Math.min(Math.max(body.max_tokens ?? 800, 16), MAX_TOKENS_LIMIT);
  const temperature = typeof body.temperature === 'number'
    ? Math.min(Math.max(body.temperature, 0), 2)
    : 0.5;

  try {
    const result = await callMiniMax({
      apiKey,
      messages,
      maxTokens,
      temperature,
      model: body.model || DEFAULT_MODEL,
    });
    return res.status(200).json({
      content: result.content,
      usage: result.usage,
      model: result.model,
    });
  } catch (err) {
    if (err instanceof UpstreamError) {
      console.error(`[chat] MiniMax 上游错误 ${err.status}:`, err.message);
      return res.status(err.status).json({ error: upstreamMessage(err.status) });
    }
    console.error('[chat] 转发失败:', err);
    return res.status(502).json({ error: '无法连接到上游 AI 服务' });
  }
}
