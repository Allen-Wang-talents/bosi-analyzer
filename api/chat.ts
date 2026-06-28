// =====================================================
// Vercel Serverless Function - MiniMax M3 代理
// 把 API Key 从前端移到后端环境变量，避免 key 暴露
// =====================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/chat/completions';
const DEFAULT_MODEL = 'MiniMax-M3';
const MAX_TOKENS_LIMIT = 2000;

// 简单的 IP 限流（防止滥用 - in-memory，仅同实例有效）
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 分钟
const RATE_LIMIT_MAX = 30;            // 每分钟 30 次

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }
  entry.count++;
  const allowed = entry.count <= RATE_LIMIT_MAX;
  return {
    allowed,
    remaining: Math.max(0, RATE_LIMIT_MAX - entry.count),
    resetIn: entry.resetAt - now,
  };
}

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
  res.setHeader('X-RateLimit-Limit', String(RATE_LIMIT_MAX));
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
    const upstream = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: body.model || DEFAULT_MODEL,
        max_tokens: maxTokens,
        temperature,
        messages,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.error(`[chat] MiniMax 上游错误 ${upstream.status}:`, errText.slice(0, 500));
      let userMsg = `上游服务错误 (${upstream.status})`;
      if (upstream.status === 401) userMsg = 'API Key 无效或已过期，请联系管理员';
      else if (upstream.status === 429) userMsg = '上游服务繁忙，请稍后再试';
      else if (upstream.status === 402) userMsg = '账户余额不足，请联系管理员充值';
      return res.status(upstream.status).json({ error: userMsg });
    }

    const data = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: unknown;
      model?: string;
    };
    const content = data?.choices?.[0]?.message?.content?.trim() ?? '';
    return res.status(200).json({
      content: stripThinkingTags(content),
      usage: data.usage,
      model: data.model,
    });
  } catch (err) {
    console.error('[chat] 转发失败:', err);
    return res.status(502).json({ error: '无法连接到上游 AI 服务' });
  }
}

// 去除 MiniMax M3 的 推理块
function stripThinkingTags(text: string): string {
  return text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/g, '')
    .trim();
}