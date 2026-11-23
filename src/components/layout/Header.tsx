// =====================================================
// Header - Logo + 页面切换 + 历史/设置入口
// =====================================================
import { useState } from 'react';
import { History, Settings as SettingsIcon, LogIn, LogOut, Building2 } from 'lucide-react';
import { Button, cn } from '@/components/ui/Card';
import { HistoryDrawer } from '@/components/ui/HistoryDrawer';
import { SettingsModal } from '@/components/ui/SettingsModal';
import { useJobStore, type AppView } from '@/store/useJobStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { ApiKeyStatus } from '@/types';

type Props = {
  apiKeyStatus: ApiKeyStatus;
};

const TABS: Array<{ key: AppView; label: string }> = [
  { key: 'match', label: '岗位推荐' },
  { key: 'review', label: '深度评鉴' },
];

export function Header({ apiKeyStatus }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const view = useJobStore((s) => s.view);
  const setView = useJobStore((s) => s.setView);
  const authUser = useAuthStore((s) => s.user);
  const openAuth = useAuthStore((s) => s.openAuth);
  const logout = useAuthStore((s) => s.logout);

  return (
    <>
      <header className="sticky top-0 z-30 bg-bg-base/80 backdrop-blur-xl border-b border-border">
        {/* 顶部一道金色渐变高光 —— 科技感的小细节 */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-gold/60 to-transparent" />
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3.5 shrink-0">
            <div className="h-12 px-2 rounded-xl bg-bg-card border border-accent-gold/50 flex items-center justify-center overflow-hidden shadow-[0_0_24px_rgba(201,169,97,0.18)] card-sheen">
              <img
                src="/bosi-logo.png"
                alt="博思人才 BOSHR Logo"
                className="h-10 w-auto max-w-[92px] object-contain"
              />
            </div>
            {/* 手机上只留 logo 图 (字标在下面那一行太挤), 桌面才显示全称 */}
            <div className="hidden sm:block leading-tight">
              <h1 className="text-xl font-bold font-serif text-gold-gradient whitespace-nowrap">
                博思AI人才推荐网
              </h1>
              <p className="text-[11px] text-fg-muted tracking-[0.2em] uppercase font-medium">BOSS AI TALENT</p>
            </div>
          </div>

          {/* 页面切换 */}
          <nav className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-bg-card border border-border">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={cn(
                  'px-4 h-8 text-xs font-medium rounded-lg transition-all duration-150',
                  view === tab.key
                    ? 'bg-accent-gold/15 text-accent-gold'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right actions */}
          {/* 手机上只留图标 —— 带文字的话 375px 宽的屏会挤爆整行 */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {authUser ? (
              <>
                <span className="hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-lg bg-bg-card border border-border text-xs text-fg-muted">
                  <Building2 className="w-3.5 h-3.5 text-accent-gold shrink-0" />
                  <span className="max-w-[140px] truncate">
                    {authUser.name ? `${authUser.name} @ ${authUser.company}` : authUser.company}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => void logout()} aria-label="退出登录">
                  <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">退出</span>
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => openAuth()} aria-label="登录或注册">
                <LogIn className="w-4 h-4" /> <span className="hidden sm:inline">登录 / 注册</span>
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)} aria-label="历史记录">
              <History className="w-4 h-4" /> <span className="hidden sm:inline">历史记录</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)} aria-label="设置">
              <SettingsIcon className="w-4 h-4" /> <span className="hidden sm:inline">设置</span>
              <ApiKeyDot status={apiKeyStatus} />
            </Button>
          </div>
        </div>

        {/* 小屏时把切换按钮挪到第二行 */}
        <div className="md:hidden max-w-[1600px] mx-auto px-6 pb-2">
          <nav className="flex items-center gap-1 p-1 rounded-xl bg-bg-card border border-border w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={cn(
                  'px-4 h-8 text-xs font-medium rounded-lg transition-all duration-150',
                  view === tab.key
                    ? 'bg-accent-gold/15 text-accent-gold'
                    : 'text-fg-muted hover:text-fg'
                )}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

function ApiKeyDot({ status }: { status: ApiKeyStatus }) {
  const colors = {
    configured: 'bg-status-green',
    missing: 'bg-status-red',
    invalid: 'bg-status-yellow',
  };
  const labels = {
    configured: 'AI 可用',
    missing: 'AI 未配置',
    invalid: 'AI 异常',
  };
  return (
    <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-fg-muted">
      <span className={`w-1.5 h-1.5 rounded-full ${colors[status]}`} />
      <span className="hidden sm:inline">{labels[status]}</span>
    </span>
  );
}