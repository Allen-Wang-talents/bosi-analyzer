// =====================================================
// 岗位池服务 —— Vercel 和 Netlify 两套部署共用这一份
//
// 只管「拿数据 + 组响应」, 不碰 req/res。
// =====================================================
import type { JobPosition } from '../shared/jobs.ts';
import { fetchAllJobs } from './feishu.ts';

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { jobs: JobPosition[]; fetchedAt: number; failedTables: string[] } | null = null;

export type JobsPayload = {
  jobs: JobPosition[];
  fetchedAt: number;
  source: 'live' | 'fallback';
  count: number;
  degraded: boolean;
  error?: string;
};

export async function getJobsPayload(opts: {
  appId?: string;
  appSecret?: string;
  userAccessToken?: string;
  userRefreshToken?: string;
  force?: boolean;
}): Promise<JobsPayload> {
  const { appId, appSecret, userAccessToken, userRefreshToken, force } = opts;

  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    // 部分分表失败的结果也要如实标 degraded —— 缓存命中时当成"全量成功"返回,
    // 等于把故障藏了 5 分钟, 前端也不会提示岗位库缺了几张表的数据。
    return {
      jobs: cache.jobs,
      fetchedAt: cache.fetchedAt,
      source: 'live',
      count: cache.jobs.length,
      degraded: cache.failedTables.length > 0,
      ...(cache.failedTables.length > 0
        ? { error: `以下分表读取失败: ${cache.failedTables.join('、')}` }
        : {}),
    };
  }

  if (!userAccessToken && !userRefreshToken && (!appId || !appSecret)) {
    return {
      jobs: [],
      fetchedAt: Date.now(),
      source: 'fallback',
      count: 0,
      degraded: true,
      error:
        '服务端未配置飞书凭证（FEISHU_APP_ID / FEISHU_APP_SECRET 或 FEISHU_USER_ACCESS_TOKEN），岗位库暂不可用。',
    };
  }

  try {
    const { jobs, failedTables } = await fetchAllJobs({
      appId,
      appSecret,
      userAccessToken,
      userRefreshToken,
    });
    cache = { jobs, fetchedAt: Date.now(), failedTables };
    return {
      jobs,
      fetchedAt: cache.fetchedAt,
      source: 'live',
      count: jobs.length,
      degraded: failedTables.length > 0,
      ...(failedTables.length > 0
        ? { error: `以下分表读取失败: ${failedTables.join('、')}` }
        : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[jobs] 拉取岗位失败:', err);
    return {
      jobs: cache?.jobs ?? [],
      fetchedAt: cache?.fetchedAt ?? Date.now(),
      source: cache ? 'live' : 'fallback',
      count: cache?.jobs.length ?? 0,
      degraded: true,
      error: message,
    };
  }
}
