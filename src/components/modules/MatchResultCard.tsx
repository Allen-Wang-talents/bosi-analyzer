// =====================================================
// 岗位推荐卡片
// =====================================================
import { MapPin, Wallet, AlertTriangle, Sparkles, ArrowUpRight } from 'lucide-react';
import { Badge, cn } from '@/components/ui/Card';
import type { JobMatchResult } from '@/lib/jobMatch';
import type { LlmReason } from '@/store/useJobStore';

type Props = {
  result: JobMatchResult;
  rank: number;
  onSelect: () => void;
  llmReason?: LlmReason;
  ranking?: boolean;
};

export function MatchResultCard({ result, rank, onSelect, llmReason, ranking }: Props) {
  const { job, score, tier, matchedTerms, missingTerms, incomplete, violations } = result;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left p-4 rounded-xl border bg-bg-card transition-all duration-150',
        'hover:border-accent-gold/40 hover:bg-bg-elevated group',
        rank <= 3 ? 'border-accent-gold/25' : 'border-border'
      )}
    >
      <div className="flex items-start gap-3">
        {/* 排名 + 分数 */}
        <div className="shrink-0 flex flex-col items-center gap-1 w-12">
          <span className="text-[10px] text-fg-subtle tabular-nums">#{rank}</span>
          <span
            className={cn(
              'text-lg font-bold tabular-nums leading-none',
              score >= 80 ? 'text-status-green' :
              score >= 65 ? 'text-accent-gold' :
              score >= 50 ? 'text-status-yellow' : 'text-fg-muted'
            )}
          >
            {Math.round(score)}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          {/* 标题行 */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-fg truncate group-hover:text-accent-gold transition-colors">
                {job.title || '（未填职位名称）'}
              </h4>
              <p className="text-xs text-fg-muted mt-0.5 truncate">{job.client || '未填客户'}</p>
            </div>
            <ArrowUpRight className="w-4 h-4 text-fg-subtle shrink-0 group-hover:text-accent-gold transition-colors" />
          </div>

          {/* 标签行 */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <Badge color="blue" variant="soft">{job.trackLabel}</Badge>
            {job.location && (
              <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle">
                <MapPin className="w-3 h-3" />{job.location}
              </span>
            )}
            {job.salaryBand && (
              <span className="inline-flex items-center gap-1 text-[10px] text-fg-subtle">
                <Wallet className="w-3 h-3" />{job.salaryBand}
              </span>
            )}
            {job.clientTier && <Badge color="gray" variant="outline">{job.clientTier}</Badge>}
            {job.priority && !/暂停|停止/.test(job.priority) && (
              <Badge color="gold" variant="outline">{job.priority}</Badge>
            )}
            {incomplete && (
              <Badge color="yellow" variant="soft">
                <AlertTriangle className="w-3 h-3" />岗位信息不全
              </Badge>
            )}
          </div>

          {/* 命中 / 缺失 */}
          {(matchedTerms.length > 0 || missingTerms.length > 0) && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {matchedTerms.slice(0, 8).map((t) => (
                <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-status-green/15 text-status-green">
                  {t}
                </span>
              ))}
              {missingTerms.slice(0, 6).map((t) => (
                <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-status-red/10 text-status-red/80">
                  -{t}
                </span>
              ))}
            </div>
          )}

          {violations.length > 0 && (
            <p className="mt-2 text-[11px] text-status-red">
              ⚠ 不满足「{violations.join('、')}」
            </p>
          )}

          {/* AI 理由 */}
          <div className="mt-2.5 pt-2.5 border-t border-border/60">
            {llmReason ? (
              <p className="text-[11px] leading-relaxed text-fg-muted">
                <Sparkles className="w-3 h-3 inline mr-1 text-accent-gold" />
                {llmReason.reason}
              </p>
            ) : ranking ? (
              <p className="text-[11px] text-fg-subtle">AI 复核中…</p>
            ) : (
              <p className="text-[11px] leading-relaxed text-fg-subtle line-clamp-2">{result.reason}</p>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
