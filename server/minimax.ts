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

/**
 * 思考开关。MiniMax-M3 省略 thinking 时默认开推理, 推理 token 计入 max_tokens
 * 且占输出的 60% 左右 —— 对「从简历里抽字段」这种不需要推理的任务, 白付这份钱
 * 还把正文预算挤爆 (实测 max_tokens=1500 时正文被掐成半截 JSON)。
 *
 *   disabled → 直接作答, 实测 2.8s / 6.1s (带推理是 16.9s / 24.1s)
 *   adaptive → 开推理 (M3 默认行为)
 *
 * 注意: M3.1-Flash 不允许 disabled (会 400), 所以模型仍用 M3。
 */
export type ThinkingMode = 'disabled' | 'adaptive';

/** 单次尝试的上游超时。两次尝试 + 退避 = 51s, 仍在平台 60s 之内 */
const ATTEMPT_TIMEOUT_MS = 25_000;
/** 退避间隔 (第 1 次失败等 1s, 第 2 次等 2s) */
const RETRY_BACKOFF_MS = [1000, 2000];

/** 该状态码可以重试 —— 上游临时问题, 不是请求本身有问题 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 408 || status >= 500;
}

/** 调一次 MiniMax, 失败抛 UpstreamError */
export async function callMiniMax(opts: {
  apiKey: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  model?: string;
  /** 思考开关。不传 = 保持 MiniMax 默认 (开推理) */
  thinking?: ThinkingMode;
  /** 额外重试次数。默认 0 —— 精排是批量调用, 重试会成倍放大耗时 */
  retries?: number;
}): Promise<MiniMaxResult> {
  const attempts = Math.max(0, opts.retries ?? 0) + 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await callOnce(opts);
    } catch (err) {
      lastError = err;
      const retryable =
        err instanceof UpstreamError
          ? isRetryableStatus(err.status)
          : true; // 网络错误 / 超时 → 可重试
      if (!retryable || attempt === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt] ?? 2000));
    }
  }
  throw lastError;
}

async function callOnce(opts: {
  apiKey: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  model?: string;
  thinking?: ThinkingMode;
}): Promise<MiniMaxResult> {
  const body: Record<string, unknown> = {
    model: opts.model || DEFAULT_MODEL,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    messages: opts.messages,
  };
  if (opts.thinking) body.thinking = { type: opts.thinking };

  const upstream = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
    // 上游挂住就把函数挂到平台上限 —— 必须自己设超时
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
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
