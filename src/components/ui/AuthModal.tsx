// =====================================================
// 登录 / 注册弹窗
//
// 首次用的人直接注册: 手机号或邮箱 + 密码 + 所在公司名称 (公司必填)。
// 注册完就自动登录, 之后关掉页面再打开还是登录态。
// =====================================================
import { useState, useEffect } from 'react';
import { X, LogIn, UserPlus, Building2, AlertCircle } from 'lucide-react';
import { cn, Button, Input } from './Card';
import { useAuthStore } from '@/store/useAuthStore';
import { normalizeAccount, MIN_PASSWORD_LEN } from '../../../shared/auth.ts';

type Props = {
  open: boolean;
  onClose: () => void;
};

type Tab = 'login' | 'register';

export function AuthModal({ open, onClose }: Props) {
  const reason = useAuthStore((s) => s.reason);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);

  const [tab, setTab] = useState<Tab>('login');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 切换页签时清掉上一次的报错和输入
  useEffect(() => {
    setError(null);
    setPassword('');
    setConfirm('');
  }, [tab]);

  // 弹窗关掉后清空敏感输入
  useEffect(() => {
    if (!open) {
      setError(null);
      setPassword('');
      setConfirm('');
    }
  }, [open]);

  if (!open) return null;

  const accountHint = (() => {
    const text = account.trim();
    if (!text) return '手机号或邮箱, 用来登录';
    const normalized = normalizeAccount(text);
    if (!normalized) return '手机号或邮箱格式不对';
    return normalized.type === 'phone' ? '手机号' : '邮箱';
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (!normalizeAccount(account)) {
      setError('请填写正确的手机号或邮箱');
      return;
    }
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`密码至少 ${MIN_PASSWORD_LEN} 位`);
      return;
    }

    if (tab === 'register') {
      if (!company.trim()) {
        setError('请填写所在公司名称');
        return;
      }
      if (password !== confirm) {
        setError('两次输入的密码不一样');
        return;
      }
    }

    setBusy(true);
    try {
      if (tab === 'login') {
        await login(account.trim(), password);
      } else {
        await register({
          account: account.trim(),
          password,
          company: company.trim(),
          name: name.trim() || undefined,
        });
      }
      // 成功 → store 会把 modalOpen 关掉
      setAccount('');
      setName('');
      setCompany('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-md bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              {tab === 'login' ? (
                <LogIn className="w-5 h-5 text-accent-gold" />
              ) : (
                <UserPlus className="w-5 h-5 text-accent-gold" />
              )}
              <h3 className="text-base font-semibold text-fg">
                {tab === 'login' ? '登录' : '注册'}
              </h3>
            </div>
            <button onClick={onClose} className="text-fg-muted hover:text-fg p-1" aria-label="关闭">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 为什么要登录 */}
          {reason && (
            <div className="px-6 pt-4">
              <div className="flex items-start gap-2 p-3 bg-accent-goldGlow border border-accent-gold/30 rounded-lg">
                <Building2 className="w-4 h-4 text-accent-gold shrink-0 mt-0.5" />
                <p className="text-xs text-fg-muted leading-relaxed">{reason}</p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-border px-6 mt-4">
            {(
              [
                { key: 'login', label: '登录' },
                { key: 'register', label: '注册 (首次使用)' },
              ] as Array<{ key: Tab; label: string }>
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors',
                  tab === t.key
                    ? 'text-accent-gold border-accent-gold'
                    : 'text-fg-muted border-transparent hover:text-fg',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <Input
              label="手机号或邮箱"
              placeholder="如 13800138000 或 name@company.com"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              hint={accountHint}
              autoComplete="username"
            />

            <Input
              label="密码"
              type="password"
              placeholder={`至少 ${MIN_PASSWORD_LEN} 位`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />

            {tab === 'register' && (
              <>
                <Input
                  label="确认密码"
                  type="password"
                  placeholder="再输一次"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />

                <Input
                  label="所在公司名称"
                  placeholder="如 博思猎头 / 字节跳动"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  hint="必填 —— 我们据此知道是哪家公司来对接候选人"
                />

                <Input
                  label="姓名 (选填)"
                  placeholder="如 张三"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 bg-status-red/10 border border-status-red/30 rounded-lg">
                <AlertCircle className="w-4 h-4 text-status-red shrink-0 mt-0.5" />
                <p className="text-xs text-status-red leading-relaxed">{error}</p>
              </div>
            )}

            <Button type="submit" loading={busy} className="w-full">
              {tab === 'login' ? (
                <>
                  <LogIn className="w-4 h-4" /> 登录
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" /> 注册并登录
                </>
              )}
            </Button>

            <p className="text-[11px] text-fg-subtle leading-relaxed text-center">
              {tab === 'login' ? (
                <>
                  还没账号?{' '}
                  <button
                    type="button"
                    onClick={() => setTab('register')}
                    className="text-accent-gold hover:underline"
                  >
                    立即注册
                  </button>
                </>
              ) : (
                <>
                  已有账号?{' '}
                  <button
                    type="button"
                    onClick={() => setTab('login')}
                    className="text-accent-gold hover:underline"
                  >
                    去登录
                  </button>
                </>
              )}
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
