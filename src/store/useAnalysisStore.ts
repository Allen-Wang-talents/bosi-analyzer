// =====================================================
// 全局状态管理 - Zustand + localStorage persist
// =====================================================
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Company, JD, JobProfile, Candidate, ScoreResult,
  ChatMessage, HistoryRecord, Weights, SchoolTier, CompanyTier,
  ApiKeyStatus, TierConfigExport,
} from '@/types';
import { DEFAULT_SCHOOL_TIERS, DEFAULT_COMPANY_TIERS, DEFAULT_WEIGHTS } from '@/data/tierTemplate';
import { runFullScoring } from '@/lib/aggregate';
import { isCandidateSparse } from '@/lib/candidateValid';
import { askQuestion } from '@/lib/qaEngine';
import { setApiKeyGetter, ApiKeyMissingError, checkServerHealth, polishSummary } from '@/lib/llmClient';

const HISTORY_LIMIT = 50;
const STORAGE_KEY = 'bosi:analyzer:v1';

/**
 * 校验导入的权重 —— 五个维度都得是有限的非负数。
 * 少一个 / 是字符串 / 是负数 / 是 NaN → 整个导入作废。
 * (age 允许缺失, 按 0 处理 —— 早期导出的配置里没有这一项)
 */
function sanitizeWeights(raw: unknown): Weights | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;
  const out: Partial<Weights> = {};
  for (const key of ['education', 'company', 'projects', 'fit'] as const) {
    const n = Number(src[key]);
    if (src[key] === undefined || src[key] === null || !Number.isFinite(n) || n < 0) return null;
    out[key] = n;
  }
  const age = src.age === undefined || src.age === null ? 0 : Number(src.age);
  if (!Number.isFinite(age) || age < 0) return null;
  out.age = age;
  return out as Weights;
}

// =====================================================
// State
// =====================================================
type State = {
  // 当前分析
  company: Company | null;
  jd: JD | null;
  profile: JobProfile | null;
  candidate: Candidate | null;
  analysis: ScoreResult | null;

  // 历史
  history: HistoryRecord[];

  // 设置
  settings: {
    anthropicApiKey: string;
    weights: Weights;
    schoolTiers: SchoolTier[];
    companyTiers: CompanyTier[];
  };

  // Chat
  chat: ChatMessage[];
  chatSending: boolean;
  summaryPolishing: boolean;

  // API 状态
  apiKeyStatus: ApiKeyStatus;
  serverAvailable: boolean;       // 后端 /api/chat 是否可用
  serverModel: string | null;     // 后端报告的模型名
};

type Actions = {
  setCompany: (v: Company | null) => void;
  setJd: (v: JD | null) => void;
  setProfile: (v: JobProfile | null) => void;
  setCandidate: (v: Candidate | null) => void;

  runAnalysis: () => void;
  clearCurrent: () => void;
  saveToHistory: (label?: string) => void;
  loadFromHistory: (id: string) => void;
  removeFromHistory: (id: string) => void;
  clearHistory: () => void;

  updateSettings: (patch: Partial<State['settings']>) => void;
  importTierConfig: (data: TierConfigExport) => boolean;
  exportTierConfig: () => void;
  setApiKeyStatus: (s: ApiKeyStatus) => void;
  validateApiKeyStatus: () => Promise<void>;
  checkServerStatus: () => Promise<void>;

  addChatMessage: (m: ChatMessage) => void;
  clearChat: () => void;
  sendChatQuestion: (question: string) => Promise<void>;

  polishCurrentSummary: () => Promise<void>;
};

// =====================================================
// Initial
// =====================================================
const initialState: State = {
  company: null,
  jd: null,
  profile: null,
  candidate: null,
  analysis: null,
  history: [],
  settings: {
    anthropicApiKey: '',
    weights: { ...DEFAULT_WEIGHTS },
    schoolTiers: DEFAULT_SCHOOL_TIERS.map((t) => ({ ...t, schools: [...t.schools] })),
    companyTiers: DEFAULT_COMPANY_TIERS.map((t) => ({ ...t, companies: [...t.companies] })),
  },
  chat: [],
  chatSending: false,
  summaryPolishing: false,
  apiKeyStatus: 'missing',
  serverAvailable: false,
  serverModel: null,
};

// Debounce timer
let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
const RECOMPUTE_DELAY = 400;

// 历史记录自动保存 —— 评分完就算一次「完成了一次分析」。
// 用静默期兜底: 用户还在改 JD 的时候不落记录, 停下来 5 秒后才存,
// 否则每敲几个字就多一条历史。
let historyTimer: ReturnType<typeof setTimeout> | null = null;
const HISTORY_SAVE_DELAY = 5000;

function historySignature(input: {
  jd?: JD | null;
  candidate?: Candidate | null;
  company?: Company | null;
}): string {
  return [
    (input.jd?.rawText ?? '').slice(0, 500),
    input.candidate?.name ?? '',
    input.candidate?.currentCompany ?? '',
    String(input.candidate?.totalYears ?? ''),
    (input.candidate?.skills ?? []).join(','),
    input.company?.name ?? '',
  ].join('|');
}

function maybeSaveHistory(get: () => State & Actions) {
  if (historyTimer) clearTimeout(historyTimer);
  historyTimer = setTimeout(() => {
    historyTimer = null;
    const { jd, candidate, company, analysis, history } = get();
    if (!analysis || !jd || !candidate) return;
    const sig = historySignature({ jd, candidate, company });
    const latest = history[0];
    // 同一份 JD + 同一个候选人只存一条
    if (latest && historySignature(latest) === sig) return;
    get().saveToHistory();
  }, HISTORY_SAVE_DELAY);
}

// =====================================================
// Store
// =====================================================
export const useAnalysisStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setCompany: (v) => {
        set({ company: v });
        scheduleRecompute(get);
      },
      setJd: (v) => {
        set({ jd: v });
        scheduleRecompute(get);
      },
      setProfile: (v) => {
        set({ profile: v });
        scheduleRecompute(get);
      },
      setCandidate: (v) => {
        set({ candidate: v });
        scheduleRecompute(get);
      },

      runAnalysis: () => {
        const { candidate, jd, profile, company, settings } = get();
        // Allen 2026-08-21: 缺少必要输入 (JD 或 candidate) → 不评分
        // Allen 2026-08-21: candidate 信息稀疏 (≥3 关键字段缺失) → 不评分, 强制用户手动补充
        if (!candidate || !jd || isCandidateSparse(candidate)) {
          set({ analysis: null });
          return;
        }
        try {
          const result = runFullScoring({
            candidate,
            jd,
            profile,
            company,
            schoolTiers: settings.schoolTiers,
            companyTiers: settings.companyTiers,
            weights: settings.weights,
          });
          set({ analysis: result });
          maybeSaveHistory(get);
        } catch (e) {
          console.error('评分失败:', e);
          set({ analysis: null });
        }
      },

      clearCurrent: () => set({
        company: null,
        jd: null,
        profile: null,
        candidate: null,
        analysis: null,
        chat: [],
      }),

      saveToHistory: (label) => {
        const { company, jd, profile, candidate, analysis } = get();
        if (!analysis) return;
        const record: HistoryRecord = {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          jd: jd ?? undefined,
          candidate: candidate ?? undefined,
          company: company ?? undefined,
          profile: profile ?? undefined,
          analysis,
          label,
        };
        set((s) => ({
          history: [record, ...s.history].slice(0, HISTORY_LIMIT),
        }));
      },

      loadFromHistory: (id) => {
        const rec = get().history.find((r) => r.id === id);
        if (!rec) return;
        set({
          company: rec.company ?? null,
          jd: rec.jd ?? null,
          profile: rec.profile ?? null,
          candidate: rec.candidate ?? null,
          analysis: rec.analysis ?? null,
          chat: [],
        });
        setTimeout(() => get().runAnalysis(), 0);
      },

      removeFromHistory: (id) => {
        set((s) => ({ history: s.history.filter((r) => r.id !== id) }));
      },

      clearHistory: () => set({ history: [] }),

      updateSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
        if (patch.weights) {
          scheduleRecompute(get, 0);
        }
      },

      importTierConfig: (data) => {
        try {
          const patch: Partial<State['settings']> = {};
          if (data.schoolTiers) patch.schoolTiers = data.schoolTiers;
          if (data.companyTiers) patch.companyTiers = data.companyTiers;
          if (data.weights) {
            // 权重必须逐项校验 —— 导入的文件里塞个 "education": "abc" 或负数,
            // 算出来就是 NaN 分, 整个报告作废。宁可拒掉也别让分数变 NaN。
            const w = sanitizeWeights(data.weights);
            if (!w) {
              console.error('导入失败: 权重格式不对');
              return false;
            }
            patch.weights = w;
          }
          get().updateSettings(patch);
          scheduleRecompute(get, 0);
          return true;
        } catch (e) {
          console.error('导入失败:', e);
          return false;
        }
      },

      exportTierConfig: () => {
        const { settings } = get();
        const data: TierConfigExport = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          schoolTiers: settings.schoolTiers,
          companyTiers: settings.companyTiers,
          weights: settings.weights,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bosi-tier-config-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },

      setApiKeyStatus: (s) => set({ apiKeyStatus: s }),

      validateApiKeyStatus: async () => {
        const key = get().settings.anthropicApiKey.trim();
        if (!key) {
          // 没填 key → 看服务器是否可用
          const { serverAvailable } = get();
          set({ apiKeyStatus: serverAvailable ? 'configured' : 'missing' });
          return;
        }
        try {
          const { validateApiKey } = await import('@/lib/llmClient');
          const ok = await validateApiKey(key);
          set({ apiKeyStatus: ok ? 'configured' : 'invalid' });
        } catch {
          set({ apiKeyStatus: 'invalid' });
        }
      },

      checkServerStatus: async () => {
        const result = await checkServerHealth();
        set({
          serverAvailable: result.available,
          serverModel: result.model ?? null,
        });
        // 同步 apiKeyStatus: 若用户没填 key，按服务器状态决定
        const key = get().settings.anthropicApiKey.trim();
        if (!key) {
          set({ apiKeyStatus: result.available ? 'configured' : 'missing' });
        }
      },

      addChatMessage: (m) => set((s) => ({ chat: [...s.chat, m] })),

      clearChat: () => set({ chat: [] }),

      sendChatQuestion: async (question) => {
        const { analysis, company, jd, profile, candidate } = get();
        if (!analysis) return;

        const userMsg: ChatMessage = {
          id: `msg-${Date.now()}-user`,
          role: 'user',
          content: question,
          timestamp: new Date().toISOString(),
        };
        get().addChatMessage(userMsg);
        set({ chatSending: true });

        const answerMsg = await askQuestion(question, {
          analysis,
          company,
          jd,
          profile,
          candidate,
        });

        get().addChatMessage(answerMsg);
        set({ chatSending: false });
      },

      polishCurrentSummary: async () => {
        const { analysis, company, jd, profile, candidate } = get();
        if (!analysis) return;
        if (analysis.summarySource === 'llm') return; // 已是润色版，避免重复
        set({ summaryPolishing: true });
        try {
          const polished = await polishSummary(analysis.summary, {
            analysis,
            company,
            jd,
            profile,
            candidate,
          });
          if (!polished) {
            // 空响应回退到骨架
            return;
          }
          const next = { ...analysis, summary: polished, summarySource: 'llm' as const };
          set({ analysis: next });
        } catch (e) {
          console.error('[store] 摘要润色失败:', e);
          // 保持骨架，不抛错给用户
        } finally {
          set({ summaryPolishing: false });
        }
      },
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        company: state.company,
        jd: state.jd,
        profile: state.profile,
        candidate: state.candidate,
        history: state.history,
        settings: state.settings,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          setApiKeyGetter(() => state.settings.anthropicApiKey);
          const key = state.settings.anthropicApiKey?.trim();
          if (key) state.apiKeyStatus = 'configured';
          // analysis 没进 partialize (它是算出来的, 不值得存) ——
          // 所以 hydrate 完要重算一次, 否则刷新后深度评鉴永远停在
          // "正在生成分析…解析中, 请稍候"
          state.runAnalysis();
          // app 启动后会自动 checkServerStatus
        }
      },
    }
  )
);

// =====================================================
// Debounced recompute
// =====================================================
function scheduleRecompute(get: () => State & Actions, delay = RECOMPUTE_DELAY) {
  if (recomputeTimer) clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(() => {
    get().runAnalysis();
  }, delay);
}

// =====================================================
// Initialize API Key getter on first import
// =====================================================
setApiKeyGetter(() => useAnalysisStore.getState().settings.anthropicApiKey);

// app 启动时立即检查后端状态
if (typeof window !== 'undefined') {
  // 等 hydrate 完成
  setTimeout(() => {
    useAnalysisStore.getState().checkServerStatus();
  }, 100);
}

// 监听 settings.anthropicApiKey 变化，同步 getter 和状态
useAnalysisStore.subscribe((state, prev) => {
  if (state.settings.anthropicApiKey !== prev.settings.anthropicApiKey) {
    setApiKeyGetter(() => state.settings.anthropicApiKey);
    const key = state.settings.anthropicApiKey.trim();
    if (!key) {
      // 没 key 时按服务器状态决定
      useAnalysisStore.setState({
        apiKeyStatus: state.serverAvailable ? 'configured' : 'missing',
      });
    } else if (state.apiKeyStatus === 'missing') {
      useAnalysisStore.setState({ apiKeyStatus: 'configured' });
    }
  }
});