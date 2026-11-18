// =====================================================
// 飞书多维表格读取 —— 用应用凭证 (tenant_access_token) 拉岗位池
//
// 依赖环境变量:
//   FEISHU_APP_ID      应用 App ID
//   FEISHU_APP_SECRET  应用 App Secret
//
// 前置条件 (缺一不可):
//   1. 应用已申请并发布 base:record:read (或 bitable:app:readonly) 权限
//   2. 应用已被加为「北京AI岗位汇总」多维表格的只读协作者
// =====================================================
import {
  FEISHU_BASE_APP_TOKEN,
  FEISHU_FIELD_NAMES,
  FEISHU_TABLES,
  TRACK_LABEL,
  mapRecord,
  type JobPosition,
} from '../shared/jobs.ts';

const AUTH_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
const BITABLE_URL = 'https://open.feishu.cn/open-apis/bitable/v1/apps';
const PAGE_SIZE = 500;

// 单次请求超时 —— 飞书从境外节点偶尔会卡住, 不设上限的话函数会撞上
// Vercel 的执行时长上限, 变成 FUNCTION_INVOCATION_FAILED (500), 连降级提示都出不来。
const AUTH_TIMEOUT_MS = 5_000;
const RECORD_TIMEOUT_MS = 6_000;

// token 缓存: 过期前 5 分钟失效
let cachedToken: { token: string; expiresAt: number } | null = null;

export class FeishuError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.name = 'FeishuError';
    this.code = code;
  }
}

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

type RawItem = Record<string, unknown>;

async function readTable(
  token: string,
  tableId: string,
): Promise<RawItem[]> {
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
        field_names: [...FEISHU_FIELD_NAMES],
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

/** 拉岗位的结果 —— 部分分表失败时也返回, 但会标出来 */
export type FetchJobsResult = {
  jobs: JobPosition[];
  /** 读取失败的分表 (人类可读名) —— 空数组表示全成功 */
  failedTables: string[];
};

/**
 * 拉全部 8 张表的岗位。
 * @param appId 应用 App ID
 * @param appSecret 应用 App Secret
 */
export async function fetchAllJobs(appId: string, appSecret: string): Promise<FetchJobsResult> {
  let token = await getTenantToken(appId, appSecret);

  const readAll = async (): Promise<FetchJobsResult> => {
    // 8 张表并发读, 单张表失败不影响其它表 —— 全部失败才抛错
    const settled = await Promise.allSettled(
      FEISHU_TABLES.map(async ({ track, tableId }) => {
        const items = await readTable(token, tableId);
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

  try {
    return await readAll();
  } catch (err) {
    // 99991663 = tenant token 失效, 强制换一次 token 重试
    if (err instanceof FeishuError && (err.code === 99991663 || err.code === 99991668)) {
      cachedToken = null;
      token = await getTenantToken(appId, appSecret);
      return readAll();
    }
    throw err;
  }
}
