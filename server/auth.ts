// =====================================================
// 账号服务 —— 注册 / 登录 / 会话
//
// 数据存在 Netlify Blobs 里, 一个用户一个 blob、一个会话一个 blob ——
// 不做「读整个文件 → 改 → 写回」, 免得两个人同时注册把对方挤掉。
//
// 密码: scrypt 加盐哈希, 不存明文。
// 会话: 32 字节随机 token, 30 天过期, 前端存 localStorage (所以默认就是登录态)。
//
// 存哪: Netlify 的 Blobs (国内镜像站那套已经跑通了 REST 读写)。
// Vercel 那边没配 Blobs 凭证, 所以 api/auth.ts 走代理转发到镜像站。
// =====================================================
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { normalizeAccount, type AuthUser } from '../shared/auth.ts';

const BLOB_STORE = process.env.AUTH_BLOB_STORE ?? 'bosi-users';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** 存了密码哈希的完整用户记录 */
type StoredUser = AuthUser & {
  salt: string;
  passwordHash: string;
};

type StoredSession = {
  userId: string;
  expiresAt: number;
};

// =====================================================
// Blobs 读写
// =====================================================
function blobUrl(key: string): string {
  const siteID = process.env.SITE_ID ?? process.env.NETLIFY_SITE_ID;
  return `https://api.netlify.com/api/v1/blobs/${siteID}/${BLOB_STORE}/${key}`;
}

async function readBlob<T>(key: string): Promise<T | null> {
  try {
    const res = await fetch(blobUrl(key), {
      headers: { Authorization: `Bearer ${process.env.NETLIFY_BLOBS_TOKEN}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function writeBlob(key: string, value: unknown): Promise<void> {
  const res = await fetch(blobUrl(key), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.NETLIFY_BLOBS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`账号数据写入失败 (HTTP ${res.status})`);
}

async function deleteBlob(key: string): Promise<void> {
  try {
    await fetch(blobUrl(key), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.NETLIFY_BLOBS_TOKEN}` },
    });
  } catch {
    // 删不掉就等它自己过期
  }
}

// =====================================================
// 密码
// =====================================================
function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, expected: string): boolean {
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const want = Buffer.from(expected, 'hex');
  if (actual.length !== want.length) return false;
  return timingSafeEqual(actual, want);
}

// =====================================================
// 键名 —— 账号哈希后当键, 不把邮箱明文塞进 URL
// =====================================================
function userKey(account: string): string {
  return `u-${createHash('sha256').update(account).digest('hex').slice(0, 32)}`;
}

function sessionKey(token: string): string {
  return `s-${token}`;
}

function publicUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    account: user.account,
    accountType: user.accountType,
    phone: user.phone,
    email: user.email,
    name: user.name,
    company: user.company,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

// =====================================================
// 会话
// =====================================================
async function issueSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await writeBlob(sessionKey(token), { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

// =====================================================
// 四个动作
// =====================================================
async function register(body: Record<string, unknown>): Promise<Response> {
  const account = normalizeAccount(String(body.account ?? ''));
  if (!account) return json({ ok: false, error: '请填写正确的手机号或邮箱' }, 400);

  const password = String(body.password ?? '');
  if (password.length < 6) return json({ ok: false, error: '密码至少 6 位' }, 400);

  const company = String(body.company ?? '').trim();
  if (!company) return json({ ok: false, error: '请填写所在公司名称' }, 400);

  const name = String(body.name ?? '').trim();

  const key = userKey(account.key);
  const existing = await readBlob<StoredUser>(key);
  if (existing) return json({ ok: false, error: '该手机号/邮箱已注册, 请直接登录' }, 409);

  const salt = randomBytes(16).toString('hex');
  const user: StoredUser = {
    id: key,
    account: account.key,
    accountType: account.type,
    phone: account.type === 'phone' ? account.key : undefined,
    email: account.type === 'email' ? account.key : undefined,
    name: name || undefined,
    company,
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  };
  await writeBlob(key, user);

  const token = await issueSession(user.id);
  return json({ ok: true, token, user: publicUser(user) }, 201);
}

async function login(body: Record<string, unknown>): Promise<Response> {
  const account = normalizeAccount(String(body.account ?? ''));
  if (!account) return json({ ok: false, error: '请填写正确的手机号或邮箱' }, 400);

  const password = String(body.password ?? '');
  const key = userKey(account.key);
  const stored = await readBlob<StoredUser>(key);
  if (!stored || !verifyPassword(password, stored.salt, stored.passwordHash)) {
    return json({ ok: false, error: '账号或密码不对' }, 401);
  }

  stored.lastLoginAt = Date.now();
  await writeBlob(key, stored);

  const token = await issueSession(stored.id);
  return json({ ok: true, token, user: publicUser(stored) });
}

async function me(body: Record<string, unknown>): Promise<Response> {
  const token = String(body.token ?? '');
  if (!token) return json({ ok: false, error: '未登录' }, 401);

  const session = await readBlob<StoredSession>(sessionKey(token));
  if (!session) return json({ ok: false, error: '登录已失效, 请重新登录' }, 401);
  if (session.expiresAt < Date.now()) {
    await deleteBlob(sessionKey(token));
    return json({ ok: false, error: '登录已过期, 请重新登录' }, 401);
  }

  const user = await readBlob<StoredUser>(session.userId);
  if (!user) return json({ ok: false, error: '账号不存在, 请重新登录' }, 401);
  return json({ ok: true, user: publicUser(user) });
}

async function logout(body: Record<string, unknown>): Promise<Response> {
  const token = String(body.token ?? '');
  if (token) await deleteBlob(sessionKey(token));
  return json({ ok: true });
}

// =====================================================
// 入口
// =====================================================
function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export async function handleAuthRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: '请求格式不对' }, 400);
  }

  const action = String(body.action ?? '');
  try {
    if (action === 'register') return await register(body);
    if (action === 'login') return await login(body);
    if (action === 'me') return await me(body);
    if (action === 'logout') return await logout(body);
    return json({ ok: false, error: '未知操作' }, 400);
  } catch (err) {
    console.error('[auth] 处理失败:', err);
    return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}
