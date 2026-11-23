// =====================================================
// 账号接口 (前端侧)
//
// 单接口 + action 区分动作 (register / login / me / logout),
// 两个部署 (Vercel / Netlify) 的路径都是 /api/auth。
// =====================================================
import type { AuthUser } from '../../shared/auth.ts';

export type AuthResult = {
  token: string;
  user: AuthUser;
};

export type RegisterPayload = {
  account: string;
  password: string;
  /** 所在公司名称 —— 注册必填 */
  company: string;
  name?: string;
};

async function post<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  let data: { ok?: boolean; error?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || !data?.ok) {
    const err = new Error(data?.error ?? `账号服务返回 HTTP ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export function registerAccount(payload: RegisterPayload): Promise<AuthResult> {
  return post<AuthResult>({ action: 'register', ...payload });
}

export function loginAccount(account: string, password: string): Promise<AuthResult> {
  return post<AuthResult>({ action: 'login', account, password });
}

export function fetchMe(token: string): Promise<{ user: AuthUser }> {
  return post<{ user: AuthUser }>({ action: 'me', token });
}

export function logoutAccount(token: string): Promise<{ ok: true }> {
  return post<{ ok: true }>({ action: 'logout', token });
}
