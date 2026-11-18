// =====================================================
// 岗位推荐状态 - Zustand
//
// 与 useAnalysisStore 分开: 一个管「老的手填 JD 评鉴」, 一个管「新的岗位推荐」,
// 两边互不干扰, 也不往已经很长的 useAnalysisStore 里塞。
//
// 持久化策略:
//   - 岗位池 (~200KB, 会过期) → sessionStorage, 30 分钟 TTL, 不进 localStorage
//   - top10 结果 + AI 理由 (~8KB) → localStorage, 刷新页面不丢 AI 理由
// =====================================================
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { JobPosition, JobTrack } from '../../shared/jobs.ts';
import type { Company, JD, JobProfile } from '@/types';
import {
  matchAllJobs,
  selectTopMatches,
  termsInJob,
  type JobMatchResult,
  type JobMatchTier,
} from '@/lib/jobMatch';
import { extractConstraints } from '@/lib/jobText';
import { fetchJobs } from '@/lib/jobsApi';
import { rankJobs } from '@/lib/rankClient';
import { useAnalysisStore } from './useAnalysisStore';

export type AppView = 'match' | 'review';

export type LlmReason = {
  reason: string;
  gaps: string[];
  score: number | null;
};

/** 持久化到 localStorage 的那一条结果 */
export type SavedResult = {
  id: string;
  score: number;
  tier: JobMatchTier;
  reason: string;
  gaps: string[];
  savedAt: number;
};

export type JobFilters = {
  tracks: JobTrack[];
  keyword: string;
  client: string;
  onlyComplete: boolean;
};

export const TOP_N = 10;
const STORAGE_KEY = 'bosi:jobs:v1';

const EMPTY_FILTERS: JobFilters = {
  tracks: [],
  keyword: '',
  client: '',
  onlyComplete: false,
};

type State = {
  view: AppView;

  // 岗位池
  jobs: JobPosition[];
  jobsStatus: 'idle' | 'loading' | 'ready' | 'error';
  jobsError: string | null;
  jobsDegraded: boolean;
  jobsFetchedAt: number | null;

  // 匹配结果
  matches: JobMatchResult[];
  topMatches: JobMatchResult[];
  matching: boolean;

  // LLM 精排
  llmStatus: 'idle' | 'ranking' | 'done' | 'error';
  llmError: string | null;
  llmReasons: Record<string, LlmReason>;

  // 交互
  filters: JobFilters;
  selectedJobId: string | null;

  // 持久化
  savedResults: SavedResult[];
};

type Actions = {
  setView: (v: AppView) => void;
  loadJobs: (force?: boolean) => Promise<void>;
  runMatch: () => void;
  rankTop: () => Promise<void>;
  setFilters: (patch: Partial<JobFilters>) => void;
  resetFilters: () => void;
  selectJob: (id: string | null) => void;
  openInReview: (jobId: string) => void;
  clearSaved: () => void;
};

export const useJobStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      view: 'match',
      jobs: [],
      jobsStatus: 'idle',
      jobsError: null,
      jobsDegraded: false,
      jobsFetchedAt: null,
      matches: [],
      topMatches: [],
      matching: false,
      llmStatus: 'idle',
      llmError: null,
      llmReasons: {},
      filters: { ...EMPTY_FILTERS },
      selectedJobId: null,
      savedResults: [],

      setView: (v) => set({ view: v }),

      loadJobs: async (force = false) => {
        set({ jobsStatus: 'loading', jobsError: null });
        const data = await fetchJobs(force);
        set({
          jobs: data.jobs ?? [],
          jobsStatus: data.jobs?.length ? 'ready' : 'error',
          jobsError: data.error ?? null,
          jobsDegraded: data.degraded,
          jobsFetchedAt: data.fetchedAt ?? null,
        });
        // 岗位池更新后重新跑一遍匹配 (新岗位可能更合适)
        if (data.jobs?.length) get().runMatch();
      },

      runMatch: () => {
        const candidate = useAnalysisStore.getState().candidate;
        const { jobs } = get();
        if (!candidate) {
          set({ matches: [], topMatches: [], matching: false });
          return;
        }
        if (!jobs.length) {
          set({ matches: [], topMatches: [], matching: false });
          return;
        }

        set({ matching: true });
        // 让 loading 态先渲染出来, 再跑同步计算
        setTimeout(() => {
          try {
            const results = matchAllJobs(candidate, jobs);
            const top = selectTopMatches(results, TOP_N, 3);
            set({ matches: results, topMatches: top, matching: false });
            void get().rankTop();
          } catch (e) {
            console.error('[jobs] 匹配失败:', e);
            set({ matches: [], topMatches: [], matching: false });
          }
        }, 0);
      },

      rankTop: async () => {
        const candidate = useAnalysisStore.getState().candidate;
        const top = get().topMatches;
        if (!candidate || !top.length) {
          set({ llmStatus: 'idle', llmError: null });
          return;
        }

        set({ llmStatus: 'ranking', llmError: null });

        const { items, degraded, error } = await rankJobs(candidate, top);

        if (!items.length) {
          // 失败降级: 保留本地排序, UI 提示 + 重试按钮
          set({ llmStatus: 'error', llmError: error ?? 'AI 复核未完成' });
          return;
        }

        const reasons: Record<string, LlmReason> = {};
        const savedResults: SavedResult[] = [];
        for (const item of items) {
          reasons[item.id] = { reason: item.reason, gaps: item.gaps, score: item.score };
          const match = top.find((t) => t.job.id === item.id);
          savedResults.push({
            id: item.id,
            score: match?.score ?? item.score,
            tier: match?.tier ?? 'try',
            reason: item.reason,
            gaps: item.gaps,
            savedAt: Date.now(),
          });
        }

        set({
          llmStatus: degraded ? 'error' : 'done',
          llmError: degraded ? error ?? 'AI 复核未完成' : null,
          llmReasons: { ...get().llmReasons, ...reasons },
          savedResults,
        });
      },

      setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
      resetFilters: () => set({ filters: { ...EMPTY_FILTERS } }),
      selectJob: (id) => set({ selectedJobId: id }),

      openInReview: (jobId) => {
        const job = get().jobs.find((j) => j.id === jobId);
        if (!job) return;

        const constraints = extractConstraints(job.jdText);
        const profileConstraints = extractConstraints(job.profileText);

        const jd: JD = {
          rawText: job.jdText,
          title: job.title,
          level: constraints.levelHint ?? profileConstraints.levelHint ?? undefined,
          responsibilities: [],
          mustHaveSkills: termsInJob(job),
          niceToHaveSkills: profileConstraints.hardRequirements,
          minYears: constraints.minYears ?? profileConstraints.minYears ?? 0,
          location: job.location,
          industry: '',
        };

        const profile: JobProfile = {
          dealBreakers: [...constraints.dealBreakers, ...profileConstraints.dealBreakers],
          niceToHaves: profileConstraints.hardRequirements,
          culturalFit: job.profileText,
          targetCompanyTiers: [],
          targetSchoolTiers: [],
          notes: `来自岗位推荐: ${job.client} / ${job.title}`,
        };

        const company: Company = {
          name: job.client,
          industry: '',
          size: '',
          stage: '',
          business: '',
          products: '',
        };

        const analysisStore = useAnalysisStore.getState();
        analysisStore.setCompany(company);
        analysisStore.setJd(jd);
        analysisStore.setProfile(profile);
        analysisStore.runAnalysis();

        set({ view: 'review', selectedJobId: null });
      },

      clearSaved: () => set({ savedResults: [], llmReasons: {} }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        savedResults: state.savedResults,
        view: state.view,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // 把持久化的 AI 理由还原成 llmReasons, 刷新页面不丢
        const reasons: Record<string, LlmReason> = {};
        for (const r of state.savedResults) {
          reasons[r.id] = { reason: r.reason, gaps: r.gaps, score: null };
        }
        state.llmReasons = reasons;
        if (state.savedResults.length) state.llmStatus = 'done';
      },
    }
  )
);

// 候选人变了 → 自动重跑匹配 (不改 ResumeUploadModule, 它有 597 行)
// runAnalysis 的「没有 JD 就不算」守卫保持原样 —— 新流程根本不走它。
useAnalysisStore.subscribe((s, prev) => {
  if (s.candidate !== prev.candidate) {
    useJobStore.getState().runMatch();
  }
});
