// =====================================================
// MiniMax M3 调用 —— Vercel 和 Netlify 两套部署共用这一份
//
// 框架无关: 只收发普通对象, 不碰 req/res。
// =====================================================

import { stripThinkingTags } from '../shared/rankParse.ts';

export const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/chat/completions';
export const DEFAULT_MODEL = 'MiniMax-M3';

export type ChatMessage = { role: string; content: string };

export type MiniMaxResult = {
  content: string;
  usage?: unknown;
  model?: string;
  finishReason: string | null;
};

/** 上游报错时带上门来的状态码, 让各端自己决定怎么提示 */
export class UpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

/** 上游状态码 → 用户看得懂的话 */
export function upstreamMessage(status: number): string {
  if (status === 401) return 'API Key 无效或已过期，请联系管理员';
  if (status === 429) return '上游服务繁忙，请稍后再试';
  if (status === 402) return '账户余额不足，请联系管理员充值';
  return `上游服务错误 (${status})`;
}

/** 去除 MiniMax M3 的 推理块 */
export { stripThinkingTags };

/** 简单的 IP 限流（in-memory，仅同实例有效） */
export function createRateLimiter(windowMs: number, max: number) {
  const map = new Map<string, { count: number; resetAt: number }>();
  return function check(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
    const now = Date.now();
    const entry = map.get(ip);
    if (!entry || now > entry.resetAt) {
      map.set(ip, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: max - 1, resetIn: windowMs };
    }
    entry.count++;
    return {
      allowed: entry.count <= max,
      remaining: Math.max(0, max - entry.count),
      resetIn: entry.resetAt - now,
    };
  };
}

/** 调一次 MiniMax, 失败抛 UpstreamError */
export async function callMiniMax(opts: {
  apiKey: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  model?: string;
}): Promise<MiniMaxResult> {
  const upstream = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model || DEFAULT_MODEL,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      messages: opts.messages,
    }),
    // 上游挂住就把函数挂到平台上限 —— 必须自己设超时
    signal: AbortSignal.timeout(45_000),
  });

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => '');
    throw new UpstreamError(
      `上游 ${upstream.status}: ${errText.slice(0, 200)}`,
      upstream.status,
    );
  }

  const data = (await upstream.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: unknown;
    model?: string;
  };
  const choice = data?.choices?.[0];
  return {
    content: stripThinkingTags(choice?.message?.content ?? ''),
    usage: data?.usage,
    model: data?.model,
    finishReason: choice?.finish_reason ?? null,
  };
}
