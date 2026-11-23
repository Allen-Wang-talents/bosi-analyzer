// =====================================================
// 账号状态 - Zustand
//
// 登录态存 localStorage —— 刷新页面、关掉再打开都还是登录的 (用户要求「默认登录状态」)。
// 启动时拿 token 去 /api/auth 问一次「这 token 还有效吗」, 有效才算登录。
//
// 弹窗开关也放这里 —— 页头和上传模块都要能叫起同一个弹窗。
// =====================================================
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../../shared/auth.ts';
import { fetchMe, loginAccount, logoutAccount, registerAccount } from '@/lib/authApi';

type RegisterInput = {
  account: string;
  password: string;
  company: string;
  name?: string;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  /** 正在校验本地 token */
  checking: boolean;
  /** 登录/注册弹窗 */
  modalOpen: boolean;
  /** 弹窗顶部要显示的一句话 (比如「上传简历需要先登录」) */
  reason: string | null;

  openAuth: (reason?: string) => void;
  closeAuth: () => void;
  bootstrap: () => Promise<void>;
  login: (account: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      checking: false,
      modalOpen: false,
      reason: null,

      openAuth: (reason) => set({ modalOpen: true, reason: reason ?? null }),
      closeAuth: () => set({ modalOpen: false, reason: null }),

      bootstrap: async () => {
        const token = get().token;
        if (!token) return;
        set({ checking: true });
        try {
          const { user } = await fetchMe(token);
          // 期间用户可能已经重新登录换了 token → 这次的结果作废
          if (get().token === token) set({ user, token });
        } catch (err) {
          // 只有服务端明确说「登录失效」才清 token ——
          // 网络抖动、服务端临时不可用都不该把人踢下线。
          const status = (err as { status?: number }).status;
          if (status === 401 && get().token === token) {
            set({ user: null, token: null });
          }
        } finally {
          set({ checking: false });
        }
      },

      login: async (account, password) => {
        const { token, user } = await loginAccount(account, password);
        set({ token, user, modalOpen: false, reason: null });
      },

      register: async (input) => {
        const { token, user } = await registerAccount(input);
        set({ token, user, modalOpen: false, reason: null });
      },

      logout: async () => {
        const token = get().token;
        if (token) {
          try {
            await logoutAccount(token);
          } catch {
            // 服务端删不掉无所谓, 本地照清
          }
        }
        set({ user: null, token: null });
      },
    }),
    {
      name: 'bosi:auth:v1',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
