// =====================================================
// Netlify Function - MiniMax M3 代理 (国内可访问的镜像部署)
//
// 业务逻辑与 Vercel 那套共用 server/minimax.ts, 这里只做 req/res 的适配。
// =====================================================
import {
  callMiniMax,
  createRateLimiter,
  upstreamMessage,
  UpstreamError,
  DEFAULT_MODEL,
} from '../../server/minimax.ts';

// 跟 jobs/rank 对齐, 别用平台默认的 10 秒
export const config = { timeout: 60 };

// 简历解析要吐一整份 Candidate JSON —— 2000 token 根本不够(带 5 段工作经历
// + 教育 + 项目就超了), 超了就静默截断 → JSON 解析失败 → 用户拿到的是本地规则的结果。
// 开推理时 reasoning 还要再吃掉 60% 的预算, 所以上限给到 16000。
const MAX_TOKENS_LIMIT = 16000;

const checkRateLimit = createRateLimiter(60_000, 30);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const ip = req.headers.get('x-nf-client-connection-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const rl = checkRateLimit(ip);
  const rateHeaders = {
    'X-RateLimit-Limit': '30',
    'X-RateLimit-Remaining': String(rl.remaining),
    'X-RateLimit-Reset': String(Math.ceil(rl.resetIn / 1000)),
  };
  if (!rl.allowed) return json({ error: '请求过于频繁，请稍后再试' }, 429, rateHeaders);

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.error('[chat] MINIMAX_API_KEY 环境变量未设置');
    return json(
      { error: '服务端未配置 API Key。请联系管理员在 Netlify 环境变量中添加 MINIMAX_API_KEY。' },
      500,
      rateHeaders,
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    messages?: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
    model?: string;
    thinking?: { type?: string };
  };

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: '请求缺少 messages 字段' }, 400, rateHeaders);
  }
  if (messages.length > 50) {
    return json({ error: '对话轮次过多（最多 50 条）' }, 400, rateHeaders);
  }
  for (const m of messages) {
    if (!m || typeof m !== 'object' || typeof m.content !== 'string') {
      return json({ error: '消息格式不正确' }, 400, rateHeaders);
    }
    if (!['system', 'user', 'assistant'].includes(m.role)) {
      return json({ error: '消息角色必须为 system/user/assistant' }, 400, rateHeaders);
    }
  }

  const maxTokens = Math.min(Math.max(body.max_tokens ?? 800, 16), MAX_TOKENS_LIMIT);
  const temperature = typeof body.temperature === 'number'
    ? Math.min(Math.max(body.temperature, 0), 2)
    : 0.5;

  // 思考开关白名单 —— 只认 disabled / adaptive, 其他一律按默认(开推理)处理。
  // 简历解析会传 disabled: 实测关推理后 2.8s / 6.1s, 带推理 16.9s / 24.1s。
  const thinking = body.thinking?.type === 'disabled' ? 'disabled'
    : body.thinking?.type === 'adaptive' ? 'adaptive'
    : undefined;

  try {
    const result = await callMiniMax({
      apiKey,
      messages,
      maxTokens,
      temperature,
      model: body.model || DEFAULT_MODEL,
      thinking,
      // 上游 5xx / 429 / 网络抖动重试一次 —— 单次 25s + 退避, 两次最坏 51s < 平台 60s
      retries: 1,
    });
    return json(
      { content: result.content, usage: result.usage, model: result.model, finishReason: result.finishReason },
      200,
      rateHeaders,
    );
  } catch (err) {
    if (err instanceof UpstreamError) {
      console.error(`[chat] MiniMax 上游错误 ${err.status}:`, err.message);
      return json({ error: upstreamMessage(err.status) }, err.status, rateHeaders);
    }
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      console.error('[chat] 上游超时:', err.message);
      return json({ error: 'AI 服务响应超时，请稍后重试' }, 504, rateHeaders);
    }
    console.error('[chat] 转发失败:', err);
    return json({ error: '无法连接到上游 AI 服务' }, 502, rateHeaders);
  }
}
