// =====================================================
// Header - Logo + 页面切换 + 历史/设置入口
// =====================================================
import { useState } from 'react';
import { History, Settings as SettingsIcon } from 'lucide-react';
import { Button, cn } from '@/components/ui/Card';
import { HistoryDrawer } from '@/components/ui/HistoryDrawer';
import { SettingsModal } from '@/components/ui/SettingsModal';
import { useJobStore, type AppView } from '@/store/useJobStore';
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

  return (
    <>
      <header className="sticky top-0 z-30 bg-bg-base/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3.5">
            <div className="h-12 px-2 rounded-xl bg-bg-card border border-accent-gold/50 flex items-center justify-center overflow-hidden shadow-[0_0_24px_rgba(201,169,97,0.18)]">
              <img
                src="/bosi-logo.png"
                alt="博思人才 BOSHR Logo"
                className="h-10 w-auto object-contain"
              />
            </div>
            <div className="leading-tight">
              <h1 className="text-xl font-bold font-serif text-gold-gradient">
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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>
              <History className="w-4 h-4" /> 历史记录
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
              <SettingsIcon className="w-4 h-4" /> 设置
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