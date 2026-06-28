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
import { askQuestion } from '@/lib/qaEngine';
import { setApiKeyGetter, ApiKeyMissingError } from '@/lib/llmClient';

const HISTORY_LIMIT = 50;
const STORAGE_KEY = 'bosi:analyzer:v1';

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

  // API 状态
  apiKeyStatus: ApiKeyStatus;
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

  addChatMessage: (m: ChatMessage) => void;
  clearChat: () => void;
  sendChatQuestion: (question: string) => Promise<void>;
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
  apiKeyStatus: 'missing',
};

// Debounce timer
let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
const RECOMPUTE_DELAY = 400;

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
        if (!candidate || !jd) {
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
        // 立即重算（用当前权重）
        setTimeout(() => get().runAnalysis(), 0);
      },

      removeFromHistory: (id) => {
        set((s) => ({ history: s.history.filter((r) => r.id !== id) }));
      },

      clearHistory: () => set({ history: [] }),

      updateSettings: (patch) => {
        set((s) => ({ settings: { ...s.settings, ...patch } }));
        // 权重变化时重算
        if (patch.weights) {
          scheduleRecompute(get, 0);
        }
      },

      importTierConfig: (data) => {
        try {
          const patch: Partial<State['settings']> = {};
          if (data.schoolTiers) patch.schoolTiers = data.schoolTiers;
          if (data.companyTiers) patch.companyTiers = data.companyTiers;
          if (data.weights) patch.weights = data.weights;
          get().updateSettings(patch);
          // 重算
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
          set({ apiKeyStatus: 'missing' });
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

      addChatMessage: (m) => set((s) => ({ chat: [...s.chat, m] })),

      clearChat: () => set({ chat: [] }),

      sendChatQuestion: async (question) => {
        const { analysis, company, jd, profile, candidate } = get();
        if (!analysis) return;

        // 添加用户消息
        const userMsg: ChatMessage = {
          id: `msg-${Date.now()}-user`,
          role: 'user',
          content: question,
          timestamp: new Date().toISOString(),
        };
        get().addChatMessage(userMsg);
        set({ chatSending: true });

        // 异步调用 LLM
        const answerMsg = await askQuestion(question, {
          analysis,
          company,
          jd,
          profile,
          candidate,
        });

        get().addChatMessage(answerMsg);
        set({ chatSending: false });

        // 保存到历史（首次提问时）
        if (get().history.length === 0 || get().history[0].timestamp !== get().history[0]?.timestamp) {
          // 仅在分析有效时记录
          if (analysis) {
            // 不重复保存，由用户主动操作
          }
        }
      },
    }),
    {
      name: STORAGE_KEY,
      // 只持久化必要部分（chat 不持久化，避免长会话膨胀）
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
          // 设置 API Key getter
          setApiKeyGetter(() => state.settings.anthropicApiKey);
          // 初始化 API Key 状态
          const key = state.settings.anthropicApiKey?.trim();
          state.apiKeyStatus = key ? 'configured' : 'missing';
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

// 监听 settings.anthropicApiKey 变化，同步 getter
useAnalysisStore.subscribe((state, prev) => {
  if (state.settings.anthropicApiKey !== prev.settings.anthropicApiKey) {
    setApiKeyGetter(() => state.settings.anthropicApiKey);
    // 同步 apiKeyStatus
    const key = state.settings.anthropicApiKey.trim();
    if (!key) {
      useAnalysisStore.setState({ apiKeyStatus: 'missing' });
    } else if (state.apiKeyStatus === 'missing' || state.apiKeyStatus === 'invalid') {
      // 设为 configured 等待下次验证
      useAnalysisStore.setState({ apiKeyStatus: 'configured' });
    }
  }
});