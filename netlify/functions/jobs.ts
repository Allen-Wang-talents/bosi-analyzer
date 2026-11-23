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
import { getUserTokenSnapshot, clearUserTokenCache, beginTokenRequest } from '../../server/feishu.ts';

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
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as StoredTokens;
  } catch {
    return null;
  }
}

async function writeTokens(data: StoredTokens): Promise<boolean> {
  try {
    const res = await fetch(blobUrl(TOKEN_KEY), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${process.env.NETLIFY_BLOBS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...data, savedAt: Date.now() }),
      signal: AbortSignal.timeout(15_000),
    });
    // 不看 res.ok 的话, 写失败会被静默吞掉 —— 刚刷出来的刷新令牌直接丢了,
    // 下次冷启动只能人工重新授权, 而日志里什么都看不出来
    if (!res.ok) {
      console.error(`[jobs] 令牌写回 Blobs 失败: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[jobs] 令牌写回 Blobs 失败:', err);
    return false;
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
  let stored = await readTokens();

  // 本次请求开始前先清掉「上一轮刷新过」的标记 ——
  // 只有这次请求真的刷出了新令牌, 才允许写回存储。
  beginTokenRequest();

  const load = (s: StoredTokens | null) =>
    getJobsPayload({
      appId: process.env.FEISHU_APP_ID,
      appSecret: process.env.FEISHU_APP_SECRET,
      userAccessToken: s?.accessToken ?? process.env.FEISHU_USER_ACCESS_TOKEN,
      userRefreshToken: s?.refreshToken ?? process.env.FEISHU_USER_REFRESH_TOKEN,
      force,
    });

  // 只在「本次请求刚刚刷新出新令牌」时才写回 —— 飞书的刷新令牌是一次性的,
  // 不存就等于没刷新; 反过来拿旧令牌写回会把新的盖掉, 所以必须以 refreshed 为准。
  //
  // 关键: 这个写回必须发生在「任何」返回之前。拉表失败的时候, 令牌可能
  // 已经刷过了 —— 这时候直接 return, 新令牌就丢了, 下次冷启动拿着一个
  // 已经被用掉的刷新令牌, 岗位池就彻底拉不到数据了。
  const persistRefreshedToken = async () => {
    const snapshot = getUserTokenSnapshot();
    if (!snapshot.refreshed || !snapshot.accessToken || !snapshot.refreshToken) return;
    await writeTokens({
      accessToken: snapshot.accessToken,
      refreshToken: snapshot.refreshToken,
    });
  };

  let payload;
  try {
    payload = await load(stored);
  } catch (err) {
    // 老实例可能攥着已经被换掉的刷新令牌 → 丢掉缓存, 重读一次存储里的令牌再试
    clearUserTokenCache();
    const fresh = await readTokens();
    if (fresh?.accessToken && fresh.accessToken !== stored?.accessToken) {
      console.warn('[jobs] 缓存令牌失效, 用存储里的新令牌重试');
      stored = fresh;
      try {
        payload = await load(fresh);
      } catch (retryErr) {
        console.error('[jobs] 换令牌重试仍然失败:', retryErr);
        await persistRefreshedToken();
        return degraded(retryErr);
      }
    } else {
      // 兜底也要返回 degraded, 不能直接 500 —— 前端要靠这个字段降级显示
      console.error('[jobs] 拉取岗位失败:', err);
      await persistRefreshedToken();
      return degraded(err);
    }
  }

  await persistRefreshedToken();

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

/** 降级响应 —— HTTP 200 + degraded:true, 前端据此显示提示而不是白屏 */
function degraded(err: unknown): Response {
  return new Response(
    JSON.stringify({
      jobs: [],
      fetchedAt: Date.now(),
      source: 'fallback',
      count: 0,
      degraded: true,
      error: err instanceof Error ? err.message : String(err),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...CORS } },
  );
}
