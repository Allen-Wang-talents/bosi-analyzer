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
const FETCH_TIMEOUT_MS = 15000;

/** 会话 token 永远是 32 字节随机数的 hex —— 只认这一种形状 */
const TOKEN_RE = /^[0-9a-f]{64}$/;

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
// 限流 —— 每个函数实例一份, 拦得住常见的暴力尝试
// =====================================================
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_ATTEMPTS = 10; // 每 IP 每分钟
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_MAX = 5; // 每 IP 每小时最多注册几个号

const attemptHits = new Map<string, number[]>();
const registerHits = new Map<string, number[]>();

function hit(map: Map<string, number[]>, key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const list = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    map.set(key, list);
    return false;
  }
  list.push(now);
  map.set(key, list);
  // 顺手清掉过期的桶, 免得 Map 无限长
  if (map.size > 5000) {
    for (const [k, v] of map) {
      const kept = v.filter((t) => now - t < windowMs);
      if (kept.length === 0) map.delete(k);
      else map.set(k, kept);
    }
  }
  return true;
}

function clientIp(req: Request): string {
  const headers = req.headers;
  // Netlify 自己注入的连接 IP 最可信;
  // x-forwarded-for 是代理转发过来的, 取最后一段(客户端改不了前面那几段)
  const forwarded = headers.get('x-forwarded-for');
  const lastForwarded = forwarded
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  return (
    headers.get('x-nf-client-connection-ip') ??
    lastForwarded ??
    headers.get('cf-connecting-ip') ??
    'unknown'
  );
}

// =====================================================
// Blobs 读写
// =====================================================
function blobUrl(key: string): string {
  const siteID = process.env.SITE_ID ?? process.env.NETLIFY_SITE_ID;
  // key 一律转义 —— 就算哪里漏了校验, 也只是个奇怪的 blob 名, 不会变成路径穿越
  return `https://api.netlify.com/api/v1/blobs/${siteID}/${BLOB_STORE}/${encodeURIComponent(key)}`;
}

type BlobRead<T> =
  | { status: 'ok'; value: T }
  | { status: 'missing' }
  | { status: 'error'; message: string };

async function readBlob<T>(key: string): Promise<BlobRead<T>> {
  try {
    const res = await fetch(blobUrl(key), {
      headers: { Authorization: `Bearer ${process.env.NETLIFY_BLOBS_TOKEN}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'error', message: `读取账号数据失败 (HTTP ${res.status})` };
    try {
      return { status: 'ok', value: (await res.json()) as T };
    } catch {
      return { status: 'error', message: '账号数据格式异常' };
    }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
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
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`写入账号数据失败 (HTTP ${res.status})`);
}

async function deleteBlob(key: string): Promise<boolean> {
  try {
    const res = await fetch(blobUrl(key), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${process.env.NETLIFY_BLOBS_TOKEN}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    // 404 = 已经没了, 同样算删成功
    return res.ok || res.status === 404;
  } catch {
    return false;
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

/** 只删「还是我写的那条」的数据 —— 并发场景下不能把别人的删掉 */
async function deleteIfMine(key: string, salt: string): Promise<void> {
  const cur = await readBlob<StoredUser>(key);
  if (cur.status === 'ok' && cur.value.salt === salt) await deleteBlob(key);
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
  // 读失败 ≠ 账号不存在 —— 否则一次网络抖动就会把别人的账号覆盖掉
  if (existing.status === 'error') {
    return json({ ok: false, error: '账号服务暂时不可用, 请稍后再试' }, 503);
  }
  if (existing.status === 'ok') {
    return json({ ok: false, error: '该手机号/邮箱已注册, 请直接登录' }, 409);
  }

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

  // 回读确认写进去的还是自己这条 —— 并发注册时, 抢输的那个要让位
  const check = await readBlob<StoredUser>(key);
  if (check.status !== 'ok' || check.value.salt !== salt) {
    return json({ ok: false, error: '该手机号/邮箱刚被注册, 请直接登录' }, 409);
  }

  let token: string;
  try {
    token = await issueSession(user.id);
  } catch (err) {
    // 会话没发出去 → 把刚建的用户撤掉, 不留半截账号
    await deleteIfMine(key, salt);
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: `注册失败: ${message}` }, 500);
  }

  return json({ ok: true, token, user: publicUser(user) }, 201);
}

async function login(body: Record<string, unknown>): Promise<Response> {
  const account = normalizeAccount(String(body.account ?? ''));
  if (!account) return json({ ok: false, error: '请填写正确的手机号或邮箱' }, 400);

  const password = String(body.password ?? '');
  const key = userKey(account.key);
  const stored = await readBlob<StoredUser>(key);
  if (stored.status === 'error') {
    return json({ ok: false, error: '账号服务暂时不可用, 请稍后再试' }, 503);
  }
  if (stored.status === 'missing' || !verifyPassword(password, stored.value.salt, stored.value.passwordHash)) {
    return json({ ok: false, error: '账号或密码不对' }, 401);
  }

  stored.value.lastLoginAt = Date.now();
  await writeBlob(key, stored.value);

  const token = await issueSession(stored.value.id);
  return json({ ok: true, token, user: publicUser(stored.value) });
}

async function me(body: Record<string, unknown>): Promise<Response> {
  const token = String(body.token ?? '');
  if (!TOKEN_RE.test(token)) return json({ ok: false, error: '未登录' }, 401);

  const session = await readBlob<StoredSession>(sessionKey(token));
  if (session.status === 'error') {
    return json({ ok: false, error: '账号服务暂时不可用, 请稍后再试' }, 503);
  }
  if (session.status === 'missing') return json({ ok: false, error: '登录已失效, 请重新登录' }, 401);
  if (session.value.expiresAt < Date.now()) {
    await deleteBlob(sessionKey(token));
    return json({ ok: false, error: '登录已过期, 请重新登录' }, 401);
  }

  const user = await readBlob<StoredUser>(session.value.userId);
  if (user.status === 'error') {
    return json({ ok: false, error: '账号服务暂时不可用, 请稍后再试' }, 503);
  }
  if (user.status === 'missing') return json({ ok: false, error: '账号不存在, 请重新登录' }, 401);
  return json({ ok: true, user: publicUser(user.value) });
}

async function logout(body: Record<string, unknown>): Promise<Response> {
  const token = String(body.token ?? '');
  if (!TOKEN_RE.test(token)) return json({ ok: true });
  const deleted = await deleteBlob(sessionKey(token));
  if (!deleted) return json({ ok: false, error: '退出失败, 请稍后再试' }, 500);
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

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json({ ok: false, error: '请求格式不对' }, 400);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return json({ ok: false, error: '请求格式不对' }, 400);
  }
  const body = parsed as Record<string, unknown>;

  const ip = clientIp(req);
  const action = String(body.action ?? '');

  try {
    // 限流: 登录/注册这类带密码的请求收紧一点
    if (action === 'register' || action === 'login') {
      if (!hit(attemptHits, ip, RATE_WINDOW_MS, RATE_MAX_ATTEMPTS)) {
        return json({ ok: false, error: '操作太频繁, 请一分钟后再试' }, 429);
      }
    }
    if (action === 'register') {
      if (!hit(registerHits, ip, REGISTER_WINDOW_MS, REGISTER_MAX)) {
        return json({ ok: false, error: '注册次数过多, 请一小时后再试' }, 429);
      }
    }

    if (action === 'register') return await register(body);
    if (action === 'login') return await login(body);
    if (action === 'me') return await me(body);
    if (action === 'logout') return await logout(body);

    // 健康探针: 只读一个固定的 blob, 用来在 CI 里确认存储凭证是通的 (不写任何数据)
    if (action === 'ping') {
      const probe = await readBlob<unknown>('ping');
      if (probe.status === 'error') return json({ ok: false, error: probe.message }, 503);
      return json({ ok: true, storage: 'ready' });
    }

    return json({ ok: false, error: '未知操作' }, 400);
  } catch (err) {
    console.error('[auth] 处理失败:', err);
    return json({ ok: false, error: '账号服务异常, 请稍后再试' }, 500);
  }
}
