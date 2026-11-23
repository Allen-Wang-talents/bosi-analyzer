// =====================================================
// 岗位池接口 (前端侧)
//
// 岗位池 ≈ 200KB 且会过期, 所以:
//   - 不进 localStorage (持久化的是 top10 结果 + AI 理由, 约 8KB)
//   - 进 sessionStorage, 30 分钟 TTL —— 刷新页面不重新拉, 但换个标签页/过半小时就过期
// =====================================================
import type { JobPosition } from '../../shared/jobs.ts';

export type JobsResponse = {
  jobs: JobPosition[];
  count: number;
  fetchedAt: number;
  source: 'live' | 'fallback';
  degraded: boolean;
  error?: string;
};

const SESSION_KEY = 'bosi:jobs:pool';
const TTL_MS = 30 * 60 * 1000;

type CachedPool = { savedAt: number; data: JobsResponse };

export function readCachedJobs(): JobsResponse | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedPool;
    if (!cached?.data || Date.now() - cached.savedAt > TTL_MS) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function writeCachedJobs(data: JobsResponse) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // 存不下就算了, 只是会多拉一次
  }
}

/**
 * 拉岗位池。永远不抛异常 —— 拉不到就返回 degraded 结果, UI 显示提示,
 * 「深度评鉴」页完全不受影响。
 */
export async function fetchJobs(force = false): Promise<JobsResponse> {
  if (!force) {
    const cached = readCachedJobs();
    if (cached) return cached;
  }

  try {
    const res = await fetch(`/api/jobs${force ? '?refresh=1' : ''}`);
    if (!res.ok) throw new Error(`岗位库返回 HTTP ${res.status}`);
    const data = (await res.json()) as JobsResponse;
    // 服务端降级 + 一条岗位都没返回 → 别把屏幕上已有的岗位池清空。
    // 以前直接把空数组丢回去, 用户看着岗位列表"全没了", 而 sessionStorage 里
    // 其实还有 30 分钟内的好数据。
    if (data.degraded && (!data.jobs || data.jobs.length === 0)) {
      const cached = readCachedJobs();
      if (cached) {
        return {
          ...cached,
          degraded: true,
          error: data.error ?? '岗位库暂时读不到，当前显示的是 30 分钟内的缓存数据。',
        };
      }
    }
    if (!data.degraded && data.jobs?.length) writeCachedJobs(data);
    return data;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const cached = readCachedJobs();
    if (cached) {
      return { ...cached, degraded: true, error: `岗位库刷新失败 (${message}), 当前显示的是 30 分钟内的缓存数据。` };
    }
    return {
      jobs: [],
      count: 0,
      fetchedAt: Date.now(),
      source: 'fallback',
      degraded: true,
      error: `岗位库不可用: ${message}`,
    };
  }
}
