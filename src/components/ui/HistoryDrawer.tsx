// =====================================================
// 历史记录抽屉
// =====================================================
import { X, History, Trash2, Download } from 'lucide-react';
import { cn } from './Card';
import { useAnalysisStore } from '@/store/useAnalysisStore';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HistoryDrawer({ open, onClose }: Props) {
  const history = useAnalysisStore((s) => s.history);
  const loadFromHistory = useAnalysisStore((s) => s.loadFromHistory);
  const removeFromHistory = useAnalysisStore((s) => s.removeFromHistory);
  const clearHistory = useAnalysisStore((s) => s.clearHistory);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-bg-card border-l border-border shadow-2xl',
          'transform transition-transform duration-300 ease-out flex flex-col',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-accent-gold" />
            <h3 className="text-base font-semibold text-fg">历史记录</h3>
            <span className="text-xs text-fg-muted">({history.length})</span>
          </div>
          <button onClick={onClose} className="text-fg-muted hover:text-fg p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {history.length === 0 ? (
            <div className="text-center py-12 text-fg-muted">
              <History className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">暂无历史记录</p>
              <p className="text-xs text-fg-subtle mt-1">完成一次分析后会自动保存</p>
            </div>
          ) : (
            history.map((rec) => (
              <HistoryItem
                key={rec.id}
                record={rec}
                onLoad={() => {
                  loadFromHistory(rec.id);
                  onClose();
                }}
                onRemove={() => removeFromHistory(rec.id)}
              />
            ))
          )}
        </div>

        {history.length > 0 && (
          <div className="border-t border-border p-4">
            <button
              onClick={() => {
                if (confirm('确定清空所有历史记录？')) clearHistory();
              }}
              className="w-full text-xs text-status-red hover:bg-status-red/10 py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> 清空所有历史
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

function HistoryItem({
  record,
  onLoad,
  onRemove,
}: {
  record: ReturnType<typeof useAnalysisStore.getState>['history'][0];
  onLoad: () => void;
  onRemove: () => void;
}) {
  const score = record.analysis?.total;
  const scoreColor = score === undefined ? 'gray' : score >= 90 ? 'red' : score >= 80 ? 'green' : score >= 70 ? 'yellow' : 'gray';

  return (
    <div className="group bg-bg-elevated rounded-lg p-3 hover:border-accent-gold/40 border border-transparent transition-all cursor-pointer" onClick={onLoad}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-fg truncate">
            {record.candidate?.name || record.jd?.title || '未命名分析'}
          </div>
          <div className="text-xs text-fg-muted truncate">
            {record.jd?.title || '无 JD'}
            {record.company ? ` · ${record.company.name}` : ''}
          </div>
        </div>
        {score !== undefined && (
          <div className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-bold tabular-nums ${
            scoreColor === 'red' ? 'bg-status-red/20 text-status-red' :
            scoreColor === 'green' ? 'bg-status-green/20 text-status-green' :
            scoreColor === 'yellow' ? 'bg-status-yellow/20 text-status-yellow' :
            'bg-status-gray/20 text-status-gray'
          }`}>
            {score.toFixed(0)}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-[10px] text-fg-subtle">
        <span>{new Date(record.timestamp).toLocaleString('zh-CN')}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('删除这条记录？')) onRemove();
          }}
          className="opacity-0 group-hover:opacity-100 hover:text-status-red transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}