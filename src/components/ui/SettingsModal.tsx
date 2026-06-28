// =====================================================
// 设置弹窗 - API Key / 权重 / Tier 名单 / 导入导出
// =====================================================
import { useState, useRef, useEffect } from 'react';
import { X, Settings as SettingsIcon, Key, Sliders, Database, Upload, Download, Trash2, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn, Button, Input, Badge } from './Card';
import { useAnalysisStore } from '@/store/useAnalysisStore';
import { isValidTierExport, TIER_JSON_SCHEMA_DOC } from '@/data/tierTemplate';
import { validateApiKey } from '@/lib/llmClient';

type Props = {
  open: boolean;
  onClose: () => void;
};

type Tab = 'api' | 'weights' | 'tiers' | 'data';

export function SettingsModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('api');
  const settings = useAnalysisStore((s) => s.settings);
  const updateSettings = useAnalysisStore((s) => s.updateSettings);
  const importTierConfig = useAnalysisStore((s) => s.importTierConfig);
  const exportTierConfig = useAnalysisStore((s) => s.exportTierConfig);

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none'
        )}
      >
        <div
          className={cn(
            'w-full max-w-2xl max-h-[90vh] bg-bg-card border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col',
            'transform transition-all duration-300 pointer-events-auto',
            open ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-accent-gold" />
              <h3 className="text-base font-semibold text-fg">设置</h3>
            </div>
            <button onClick={onClose} className="text-fg-muted hover:text-fg p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border px-6">
            <TabButton active={tab === 'api'} onClick={() => setTab('api')} icon={<Key className="w-3.5 h-3.5" />} label="API Key" />
            <TabButton active={tab === 'weights'} onClick={() => setTab('weights')} icon={<Sliders className="w-3.5 h-3.5" />} label="评分权重" />
            <TabButton active={tab === 'tiers'} onClick={() => setTab('tiers')} icon={<Database className="w-3.5 h-3.5" />} label="Tier 名单" />
            <TabButton active={tab === 'data'} onClick={() => setTab('data')} icon={<Upload className="w-3.5 h-3.5" />} label="导入/导出" />
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'api' && <ApiKeyTab settings={settings} updateSettings={updateSettings} />}
            {tab === 'weights' && <WeightsTab settings={settings} updateSettings={updateSettings} />}
            {tab === 'tiers' && <TiersTab settings={settings} updateSettings={updateSettings} />}
            {tab === 'data' && <DataTab exportTierConfig={exportTierConfig} importTierConfig={importTierConfig} />}
          </div>
        </div>
      </div>
    </>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors',
        active ? 'text-accent-gold border-accent-gold' : 'text-fg-muted border-transparent hover:text-fg'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// =====================================================
// API Key Tab
// =====================================================
function ApiKeyTab({ settings, updateSettings }: { settings: any; updateSettings: any }) {
  const [key, setKey] = useState(settings.anthropicApiKey ?? '');
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const apiKeyStatus = useAnalysisStore((s) => s.apiKeyStatus);
  const setApiKeyStatus = useAnalysisStore((s) => s.setApiKeyStatus);

  const handleSave = () => {
    updateSettings({ anthropicApiKey: key.trim() });
    if (key.trim()) setApiKeyStatus('configured');
    else setApiKeyStatus('missing');
  };

  const handleTest = async () => {
    if (!key.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await validateApiKey(key.trim());
      setTestResult(ok ? 'success' : 'fail');
      if (ok) {
        updateSettings({ anthropicApiKey: key.trim() });
        setApiKeyStatus('configured');
      } else {
        setApiKeyStatus('invalid');
      }
    } catch (e) {
      setTestResult('fail');
      setApiKeyStatus('invalid');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-fg mb-2">MiniMax M3 API Key</h4>
        <p className="text-xs text-fg-muted leading-relaxed">
          用于驱动 Chat 面板的 AI 问答。Key 仅保存在你的浏览器 localStorage，不上传任何服务器。
          <a href="https://api.minimaxi.com/" target="_blank" rel="noreferrer" className="text-accent-gold hover:underline ml-1">
            MiniMax 控制台 →
          </a>
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <span className="text-fg-muted">当前状态:</span>
        <Badge color={apiKeyStatus === 'configured' ? 'green' : apiKeyStatus === 'invalid' ? 'yellow' : 'red'} variant="soft">
          {apiKeyStatus === 'configured' ? '已配置' : apiKeyStatus === 'invalid' ? '异常' : '未配置'}
        </Badge>
      </div>

      <div className="relative">
        <Input
          label="API Key"
          placeholder="sk-..."
          type={show ? 'text' : 'password'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <button
          onClick={() => setShow(!show)}
          className="absolute right-3 top-9 text-fg-muted hover:text-fg"
          type="button"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave}>保存</Button>
        <Button variant="secondary" onClick={handleTest} loading={testing}>
          验证可用性
        </Button>
      </div>

      {testResult === 'success' && (
        <div className="flex items-center gap-2 text-xs text-status-green bg-status-green/10 p-3 rounded-lg border border-status-green/30">
          <CheckCircle2 className="w-4 h-4" /> API Key 验证成功
        </div>
      )}
      {testResult === 'fail' && (
        <div className="flex items-center gap-2 text-xs text-status-red bg-status-red/10 p-3 rounded-lg border border-status-red/30">
          <AlertCircle className="w-4 h-4" /> 验证失败，请检查 Key 是否正确
        </div>
      )}

      <div className="bg-bg-base/50 rounded-lg p-4 text-xs text-fg-muted leading-relaxed">
        <p className="font-medium text-fg mb-2">⚠️ 安全提示</p>
        <p>由于这是浏览器端直连，API Key 存在本地浏览器。请仅在个人设备上使用，不要部署到公网。</p>
      </div>
    </div>
  );
}

// =====================================================
// Weights Tab
// =====================================================
function WeightsTab({ settings, updateSettings }: { settings: any; updateSettings: any }) {
  const [w, setW] = useState({ ...settings.weights });

  const total = w.education + w.company + w.projects + w.fit + (w.age ?? 0);

  const handleSave = () => {
    updateSettings({ weights: w });
  };

  const presets = [
    { label: '默认 (5维)', value: { education: 18, company: 22, projects: 20, fit: 25, age: 15 } },
    { label: '重能力', value: { education: 10, company: 18, projects: 30, fit: 32, age: 10 } },
    { label: '重背景', value: { education: 22, company: 35, projects: 12, fit: 16, age: 15 } },
    { label: '纯 95 后优先', value: { education: 15, company: 20, projects: 15, fit: 20, age: 30 } },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-fg mb-2">评分权重</h4>
        <p className="text-xs text-fg-muted">调整各维度权重（总和需为 100）</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {presets.map((p) => (
          <Button key={p.label} size="sm" variant="ghost" onClick={() => setW(p.value)}>
            {p.label}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {(['education', 'company', 'projects', 'fit', 'age'] as const).map((key) => {
          const labels: Record<string, string> = {
            education: '学历',
            company: '公司背景',
            projects: '明星项目经验',
            fit: '履历匹配',
            age: '年龄 (95 后优先)',
          };
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-fg">{labels[key]}</span>
                <span className="text-xs text-fg-muted tabular-nums">{w[key] ?? 0}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="60"
                value={w[key] ?? 0}
                onChange={(e) => setW({ ...w, [key]: parseInt(e.target.value, 10) })}
                className="w-full accent-accent-gold"
              />
            </div>
          );
        })}
      </div>

      <div className={cn(
        'p-3 rounded-lg text-xs',
        total === 100 ? 'bg-status-green/10 text-status-green' : 'bg-status-red/10 text-status-red'
      )}>
        总和: {total}% {total === 100 ? '✓' : `（差 ${100 - total}%）`}
      </div>

      <Button onClick={handleSave} disabled={total !== 100}>保存权重</Button>
    </div>
  );
}

// =====================================================
// Tiers Tab
// =====================================================
function TiersTab({ settings, updateSettings }: { settings: any; updateSettings: any }) {
  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-fg mb-2">Tier 名单管理</h4>
        <p className="text-xs text-fg-muted leading-relaxed">
          在「导入/导出」标签可以批量导入 JSON 名单。这里显示当前已加载的 tier 数据。
        </p>
      </div>

      <div>
        <h5 className="text-xs font-medium text-fg mb-2">学校 Tier ({settings.schoolTiers?.reduce((s: number, t: any) => s + t.schools.length, 0) ?? 0} 所)</h5>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {settings.schoolTiers?.map((t: any) => (
            <div key={t.tier} className="flex items-center justify-between text-xs py-1.5 px-3 bg-bg-elevated rounded">
              <span className="text-fg-muted">Tier {t.tier} · {t.label}</span>
              <span className="text-fg tabular-nums">{t.schools.length} 所</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h5 className="text-xs font-medium text-fg mb-2">公司 Tier ({settings.companyTiers?.reduce((s: number, t: any) => s + t.companies.length, 0) ?? 0} 家)</h5>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {settings.companyTiers?.map((t: any) => (
            <div key={t.tier} className="flex items-center justify-between text-xs py-1.5 px-3 bg-bg-elevated rounded">
              <span className="text-fg-muted">Tier {t.tier} · {t.label}</span>
              <span className="text-fg tabular-nums">{t.companies.length} 家</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Data Tab (Import/Export)
// =====================================================
function DataTab({ exportTierConfig, importTierConfig }: { exportTierConfig: () => void; importTierConfig: (data: any) => boolean }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!isValidTierExport(json)) {
        setImportResult({ ok: false, msg: 'JSON 格式不正确，需包含 schoolTiers 和 companyTiers 数组' });
        return;
      }
      const success = importTierConfig(json);
      setImportResult({ ok: success, msg: success ? `导入成功: ${json.schoolTiers.length} 个学校 tier, ${json.companyTiers.length} 个公司 tier` : '导入失败' });
    } catch (err) {
      setImportResult({ ok: false, msg: `解析失败: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold text-fg mb-2">导入/导出 Tier 名单</h4>
        <p className="text-xs text-fg-muted leading-relaxed">
          支持 JSON 格式的批量导入/导出。格式参考下方说明。
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={exportTierConfig}>
          <Download className="w-4 h-4" /> 导出当前配置
        </Button>
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
          <Upload className="w-4 h-4" /> 导入 JSON
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {importResult && (
        <div className={cn(
          'p-3 rounded-lg text-xs flex items-center gap-2',
          importResult.ok ? 'bg-status-green/10 text-status-green' : 'bg-status-red/10 text-status-red'
        )}>
          {importResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {importResult.msg}
        </div>
      )}

      <details className="bg-bg-base/50 rounded-lg p-4">
        <summary className="text-xs font-medium text-fg cursor-pointer">JSON 格式说明</summary>
        <pre className="text-xs text-fg-muted mt-3 whitespace-pre-wrap font-mono leading-relaxed">
          {TIER_JSON_SCHEMA_DOC}
        </pre>
      </details>
    </div>
  );
}