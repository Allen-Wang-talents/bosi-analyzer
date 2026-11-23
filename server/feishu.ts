// =====================================================
// 飞书多维表格读取 —— 两条通道, 谁能用用谁
//
// 通道 A (机器人身份, 首选)
//   tenant_access_token + bitable/v1 records/search
//   需要应用身份权限 bitable:app:readonly, 且应用是该多维表格的协作者
//
// 通道 B (用户身份, 兜底)
//   user_access_token + base/v3 records list
//   权限跟着登录用户走, 不需要把应用加成协作者;
//   但 user_access_token 只有 2 小时, 靠 refresh_token 续期
//
// 环境变量:
//   FEISHU_APP_ID / FEISHU_APP_SECRET          两种通道都用得上(换 token 用)
//   FEISHU_USER_ACCESS_TOKEN                   用户令牌(可选, 2 小时有效)
//   FEISHU_USER_REFRESH_TOKEN                  用户刷新令牌(可选, 30 天可续)
// =====================================================
import {
  FEISHU_BASE_APP_TOKEN,
  FEISHU_TABLES,
  TRACK_LABEL,
  mapRecord,
  type JobPosition,
} from '../shared/jobs.ts';

const AUTH_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
// 刷新用户令牌走 accounts 域的 oauth 端点, 且必须带 client_id/client_secret
const USER_REFRESH_URL = 'https://accounts.feishu.cn/oauth/v3/token';
const BITABLE_URL = 'https://open.feishu.cn/open-apis/bitable/v1/apps';
const BASE_V3_URL = 'https://open.feishu.cn/open-apis/base/v3/bases';
const PAGE_SIZE = 500;

// 单次请求超时 —— 飞书从境外节点偶尔会卡住, 不设上限的话函数会撞上
// Vercel 的执行时长上限, 变成 FUNCTION_INVOCATION_FAILED (500), 连降级提示都出不来。
const AUTH_TIMEOUT_MS = 5_000;
const RECORD_TIMEOUT_MS = 8_000;

// token 缓存: 过期前 5 分钟失效
let cachedToken: { token: string; expiresAt: number } | null = null;
// refreshed 标记这次令牌是不是「刚刚刷新出来的」—— 只有刚刷出来的才允许写回存储,
// 否则老实例会拿旧令牌把新的盖掉
let cachedUser: { token: string; expiresAt: number; refreshToken?: string; refreshed: boolean } | null = null;

export class FeishuError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'FeishuError';
    this.code = code;
  }
}

export type FeishuOpts = {
  appId?: string;
  appSecret?: string;
  userAccessToken?: string;
  userRefreshToken?: string;
};

async function getTenantToken(appId: string, appSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAt) return cachedToken.token;

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });
  const data = (await res.json()) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
    expire?: number;
  };
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new FeishuError(
      `获取 tenant_access_token 失败: ${data.msg ?? '未知错误'} (code=${data.code ?? '?'})`,
      data.code ?? -1,
    );
  }
  const expireSec = data.expire ?? 7200;
  cachedToken = {
    token: data.tenant_access_token,
    expiresAt: now + Math.max(60, expireSec - 300) * 1000,
  };
  return cachedToken.token;
}


/** 从 JWT 里读过期时间 —— 只用来判断令牌还能用多久, 不做签名校验 */
function jwtExpiry(token: string): number | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf-8')) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * 拿一个能用的用户令牌。
 * 优先用缓存 —— 其次用环境变量里的 —— 最后拿刷新令牌换新的。
 */
export async function getUserToken(opts: FeishuOpts): Promise<string> {
  const now = Date.now();
  if (cachedUser && now < cachedUser.expiresAt) return cachedUser.token;

  if (opts.userAccessToken) {
    const exp = jwtExpiry(opts.userAccessToken);
    // 令牌还有效才用 —— 过了期的必须往下走去刷新, 否则拿着废令牌去读表必然 401
    if (exp === null || exp > now + 60_000) {
      cachedUser = {
        token: opts.userAccessToken,
        expiresAt: exp ?? now + 90 * 60 * 1000,
        refreshToken: cachedUser?.refreshToken ?? opts.userRefreshToken,
        refreshed: false,
      };
      return cachedUser.token;
    }
    // 过期且没有刷新令牌 —— 只能硬着头皮用这个, 读表会失败
    if (!opts.userRefreshToken && !cachedUser?.refreshToken) {
      cachedUser = {
        token: opts.userAccessToken,
        expiresAt: exp,
        refreshToken: cachedUser?.refreshToken,
        refreshed: false,
      };
      return cachedUser.token;
    }
  }

  const { appId, appSecret } = opts;
  const refreshToken = cachedUser?.refreshToken ?? opts.userRefreshToken;
  if (!refreshToken) throw new FeishuError('没有可用的飞书用户令牌', -1);
  if (!appId || !appSecret) {
    throw new FeishuError('刷新用户令牌需要 FEISHU_APP_ID / FEISHU_APP_SECRET', -1);
  }

  // 刷新端点在 accounts 域, 用 client_id/client_secret 换 —— open-apis 域的
  // authen/refresh 系列对这个刷新令牌一律报 "refresh token not found"。
  const res = await fetch(USER_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: appId,
      client_secret: appSecret,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
  });
  const data = (await res.json()) as {
    code?: number;
    error?: string;
    error_description?: string;
    message?: string;
    msg?: string;
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };
  const token = data.access_token;
  if (data.code !== 0 || !token) {
    throw new FeishuError(
      `刷新用户令牌失败: ${data.error_description ?? data.message ?? data.msg ?? '未知错误'} (code=${data.code ?? '?'})`,
      data.code ?? -1,
    );
  }
  cachedUser = {
    token,
    expiresAt: now + Math.max(60, (data.expires_in ?? 7200) - 300) * 1000,
    // 飞书的刷新令牌是一次性的 —— 用一次就换新的, 旧的立即作废
    refreshToken: data.refresh_token ?? refreshToken,
    refreshed: true,
  };
  return token;
}

/**
 * 当前用户令牌的快照 —— 刷新之后新的刷新令牌只存在这里,
 * 上层要把它存到别处(Netlify Blobs), 否则函数一冷启动就没了。
 *
 * refreshed=true 才代表「这是刚换出来的令牌」, 只有这种才允许写回存储。
 */
export function getUserTokenSnapshot(): {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshed: boolean;
} {
  if (!cachedUser) return { refreshed: false };
  return {
    accessToken: cachedUser.token,
    refreshToken: cachedUser.refreshToken,
    expiresAt: cachedUser.expiresAt,
    refreshed: cachedUser.refreshed,
  };
}

/** 丢掉缓存的用户令牌 —— 刷新失败后重新读一次存储里的令牌时用 */
export function clearUserTokenCache(): void {
  cachedUser = null;
}

/**
 * 一次请求开始时调用 —— 清掉上一轮的「刚刚刷新过」标记。
 *
 * 飞书的刷新令牌是一次性的, 全网只有一份。旧实例如果不带这个标记就写回,
 * 会把自己手里那份(可能已经被别的实例换掉的)旧刷新令牌写回存储, 把新的盖掉 →
 * 下次冷启动必然 "refresh token revoked", 岗位池彻底拉不到数据。
 * 所以只有「本次请求真的刷新出了新令牌」才允许写回。
 */
export function beginTokenRequest(): void {
  if (cachedUser) cachedUser.refreshed = false;
}

type RawItem = Record<string, unknown>;

/** 通道 A: bitable v1, 一次一页, 用 page_token 翻页 */
async function readTableBitable(token: string, tableId: string): Promise<RawItem[]> {
  const items: RawItem[] = [];
  let pageToken: string | undefined;

  do {
    const res = await fetch(`${BITABLE_URL}/${FEISHU_BASE_APP_TOKEN}/tables/${tableId}/records/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        page_size: PAGE_SIZE,
        ...(pageToken ? { page_token: pageToken } : {}),
      }),
      signal: AbortSignal.timeout(RECORD_TIMEOUT_MS),
    });
    const data = (await res.json()) as {
      code?: number;
      msg?: string;
      data?: { items?: RawItem[]; has_more?: boolean; page_token?: string };
    };
    if (data.code !== 0) {
      throw new FeishuError(
        `读取数据表 ${tableId} 失败: ${data.msg ?? '未知错误'} (code=${data.code ?? '?'})`,
        data.code ?? -1,
      );
    }
    items.push(...(data.data?.items ?? []));
    pageToken = data.data?.has_more ? data.data.page_token : undefined;
  } while (pageToken);

  return items;
}

/** 通道 B: base v3, 返回的是矩阵 —— 列名在 fields, 每行按列顺序对齐 */
async function readTableBaseV3(token: string, tableId: string): Promise<RawItem[]> {
  const items: RawItem[] = [];
  let offset = 0;

  for (;;) {
    const res = await fetch(
      `${BASE_V3_URL}/${FEISHU_BASE_APP_TOKEN}/tables/${tableId}/records?limit=${PAGE_SIZE}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(RECORD_TIMEOUT_MS),
      },
    );
    const data = (await res.json()) as {
      code?: number;
      msg?: string;
      message?: string;
      data?: {
        fields?: string[];
        data?: unknown[][];
        record_id_list?: string[];
        has_more?: boolean;
      };
    };
    if (data.code !== 0) {
      throw new FeishuError(
        `读取数据表 ${tableId} 失败: ${data.message ?? data.msg ?? '未知错误'} (code=${data.code ?? '?'})`,
        data.code ?? -1,
      );
    }
    const fields = data.data?.fields ?? [];
    const rows = data.data?.data ?? [];
    const ids = data.data?.record_id_list ?? [];
    rows.forEach((row, i) => {
      const obj: RawItem = { record_id: ids[i] ?? '' };
      fields.forEach((name, j) => {
        obj[name] = row[j];
      });
      items.push(obj);
    });
    if (!data.data?.has_more || rows.length === 0) break;
    offset += rows.length;
  }

  return items;
}

/** 拉岗位的结果 —— 部分分表失败时也返回, 但会标出来 */
export type FetchJobsResult = {
  jobs: JobPosition[];
  /** 读取失败的分表 (人类可读名) —— 空数组表示全成功 */
  failedTables: string[];
  /** 实际用的通道 —— 出问题时好定位 */
  channel?: 'bot' | 'user';
};

/**
 * 拉全部 8 张表的岗位。
 * 优先走机器人身份; 机器人没有应用身份权限时, 自动退到用户身份。
 */
export async function fetchAllJobs(opts: FeishuOpts): Promise<FetchJobsResult> {
  const { appId, appSecret, userAccessToken, userRefreshToken } = opts;
  const hasUser = Boolean(userAccessToken || userRefreshToken);

  const readAll = async (read: (token: string, tableId: string) => Promise<RawItem[]>, token: string) => {
    // 8 张表并发读, 单张表失败不影响其它表 —— 全部失败才抛错
    const settled = await Promise.allSettled(
      FEISHU_TABLES.map(async ({ track, tableId }) => {
        const items = await read(token, tableId);
        return items.map((raw) => mapRecord(track, raw));
      }),
    );

    const jobs: JobPosition[] = [];
    const failedTables: string[] = [];
    let firstError: unknown = null;
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        jobs.push(...r.value);
      } else {
        failedTables.push(TRACK_LABEL[FEISHU_TABLES[i].track]);
        if (!firstError) firstError = r.reason;
      }
    });

    if (jobs.length === 0 && firstError) throw firstError;
    if (failedTables.length > 0) {
      console.error('[feishu] 部分分表读取失败:', failedTables.join(', '));
    }
    return { jobs, failedTables };
  };

  if (appId && appSecret) {
    try {
      const token = await getTenantToken(appId, appSecret);
      const result = await readAll(readTableBitable, token);
      return { ...result, channel: 'bot' };
    } catch (err) {
      // 99991672 = 应用身份权限没开通 —— 这时退到用户身份
      const scopeDenied = err instanceof FeishuError && err.code === 99991672;
      if (!scopeDenied || !hasUser) throw err;
      console.warn('[feishu] 机器人身份缺应用身份权限, 改用用户身份');
    }
  }

  if (!hasUser) {
    throw new FeishuError(
      '没有可用的飞书凭证: 需要 FEISHU_APP_ID/FEISHU_APP_SECRET(且应用已开通 bitable:app:readonly), 或 FEISHU_USER_ACCESS_TOKEN',
      -1,
    );
  }

  const token = await getUserToken({ appId, appSecret, userAccessToken, userRefreshToken });
  const result = await readAll(readTableBaseV3, token);
  return { ...result, channel: 'user' };
}
