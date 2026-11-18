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
  mapRecord,
  type JobPosition,
} from '../shared/jobs.ts';

const AUTH_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
const BITABLE_URL = 'https://open.feishu.cn/open-apis/bitable/v1/apps';
const PAGE_SIZE = 500;

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

/**
 * 拉全部 8 张表的岗位。
 * @param appId 应用 App ID
 * @param appSecret 应用 App Secret
 */
export async function fetchAllJobs(appId: string, appSecret: string): Promise<JobPosition[]> {
  let token = await getTenantToken(appId, appSecret);

  const readAll = async (): Promise<JobPosition[]> => {
    // 并发读 8 张表
    const results = await Promise.all(
      FEISHU_TABLES.map(async ({ track, tableId }) => {
        const items = await readTable(token, tableId);
        return items.map((raw) => mapRecord(track, raw));
      }),
    );
    return results.flat();
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
