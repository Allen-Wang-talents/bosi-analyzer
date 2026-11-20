// =====================================================
// Netlify Function - 岗位池 (国内可访问的镜像部署)
//
// 业务逻辑与 Vercel 那套共用 server/jobsService.ts, 这里只做 req/res 的适配。
//
// 令牌存哪: 飞书用户令牌有 8.5KB, 而 Netlify 环境变量单个值上限 5000 字符 —— 放不进去。
// 所以令牌存在 Netlify Blobs 里, 函数冷启动时读出来用, 刷新后把新的写回去。
// (等飞书的应用身份权限开通后, 就只用 FEISHU_APP_ID/SECRET, 这套可以拆掉)
//
// 为什么不用 @netlify/blobs SDK: 实测它走签名 URL 通道, 写入的 blob 用同一个 API 读不到。
// 直接打 Blobs 的 REST 接口读写是通的, 所以这里手写 fetch。
// =====================================================
import { getJobsPayload } from '../../server/jobsService.ts';
import { getUserTokenSnapshot } from '../../server/feishu.ts';

// 拉飞书最多允许跑 60 秒 —— 默认的 10 秒上限不够 8 张表分页读完
export const config = { timeout: 60 };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const TOKEN_KEY = 'feishu-user-token';
const BLOB_STORE = 'bosi-secrets';

type StoredTokens = {
  accessToken?: string;
  refreshToken?: string;
  savedAt?: number;
};

function blobUrl(key: string): string {
  const siteID = process.env.SITE_ID ?? process.env.NETLIFY_SITE_ID;
  return `https://api.netlify.com/api/v1/blobs/${siteID}/${BLOB_STORE}/${key}`;
}

async function readTokens(): Promise<StoredTokens | null> {
  try {
    const res = await fetch(blobUrl(TOKEN_KEY), {
      headers: { Authorization: `Bearer ${process.env.NETLIFY_BLOBS_TOKEN}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as StoredTokens;
  } catch {
    return null;
  }
}

async function writeTokens(data: StoredTokens): Promise<void> {
  try {
    await fetch(blobUrl(TOKEN_KEY), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${process.env.NETLIFY_BLOBS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...data, savedAt: Date.now() }),
    });
  } catch (err) {
    console.error('[jobs] 令牌写回 Blobs 失败:', err);
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  const force = new URL(req.url).searchParams.get('refresh') === '1';
  const stored = await readTokens();

  const payload = await getJobsPayload({
    appId: process.env.FEISHU_APP_ID,
    appSecret: process.env.FEISHU_APP_SECRET,
    userAccessToken: stored?.accessToken ?? process.env.FEISHU_USER_ACCESS_TOKEN,
    userRefreshToken: stored?.refreshToken ?? process.env.FEISHU_USER_REFRESH_TOKEN,
    force,
  });

  // 刷新过令牌就把新的存回去 —— 飞书的刷新令牌是一次性的, 不存就等于没刷新
  const snapshot = getUserTokenSnapshot();
  if (snapshot.refreshToken && snapshot.refreshToken !== stored?.refreshToken) {
    await writeTokens({
      accessToken: snapshot.accessToken,
      refreshToken: snapshot.refreshToken,
    });
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}
