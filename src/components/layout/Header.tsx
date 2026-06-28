// =====================================================
// Header - Logo + 历史/设置入口
// =====================================================
import { useState } from 'react';
import { History, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { Button, Badge } from '@/components/ui/Card';
import { HistoryDrawer } from '@/components/ui/HistoryDrawer';
import { SettingsModal } from '@/components/ui/SettingsModal';
import type { ApiKeyStatus } from '@/types';

type Props = {
  apiKeyStatus: ApiKeyStatus;
};

export function Header({ apiKeyStatus }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 bg-bg-base/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-xl bg-bg-card border border-accent-gold/50 flex items-center justify-center overflow-hidden shadow-[0_0_24px_rgba(201,169,97,0.18)]">
              <img
                src="https://aka.doubaocdn.com/s/nl9E1wgLbm"
                alt="博思 Logo"
                className="w-12 h-12 object-contain"
              />
            </div>
            <div className="leading-tight">
              <h1 className="text-xl font-bold font-serif text-gold-gradient">
                博思人才评荐网
              </h1>
              <p className="text-[11px] text-fg-muted tracking-[0.2em] uppercase font-medium">BOSI TALENT</p>
            </div>
          </div>

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
    configured: '已配置',
    missing: '未配置',
    invalid: '异常',
  };
  return (
    <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-fg-muted">
      <span className={`w-1.5 h-1.5 rounded-full ${colors[status]}`} />
      <span className="hidden sm:inline">API {labels[status]}</span>
    </span>
  );
}