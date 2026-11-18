// =====================================================
// 岗位推荐列表 (含筛选)
// =====================================================
import { useMemo } from 'react';
import { Briefcase, RefreshCw, Search, Loader2, X } from 'lucide-react';
import { Card, CardHeader, CardBody, Button, Badge, cn } from '@/components/ui/Card';
import { JOB_TRACKS, TRACK_LABEL, type JobTrack } from '../../../shared/jobs.ts';
import { MatchResultCard } from './MatchResultCard';
import { useJobStore } from '@/store/useJobStore';

export function JobListModule() {
  const matches = useJobStore((s) => s.matches);
  const topMatches = useJobStore((s) => s.topMatches);
  const matching = useJobStore((s) => s.matching);
  const llmStatus = useJobStore((s) => s.llmStatus);
  const llmError = useJobStore((s) => s.llmError);
  const llmReasons = useJobStore((s) => s.llmReasons);
  const rankTop = useJobStore((s) => s.rankTop);
  const filters = useJobStore((s) => s.filters);
  const setFilters = useJobStore((s) => s.setFilters);
  const resetFilters = useJobStore((s) => s.resetFilters);
  const selectJob = useJobStore((s) => s.selectJob);
  const loadJobs = useJobStore((s) => s.loadJobs);
  const jobsStatus = useJobStore((s) => s.jobsStatus);
  const jobsFetchedAt = useJobStore((s) => s.jobsFetchedAt);

  const visible = useMemo(() => {
    let list = topMatches.length > 0 ? topMatches : matches.slice(0, 10);
    if (filters.tracks.length > 0) {
      list = list.filter((m) => filters.tracks.includes(m.job.track));
    }
    if (filters.client) {
      list = list.filter((m) => m.job.client === filters.client);
    }
    if (filters.onlyComplete) {
      list = list.filter((m) => !m.incomplete);
    }
    if (filters.keyword.trim()) {
      const kw = filters.keyword.trim().toLowerCase();
      list = list.filter((m) =>
        [m.job.title, m.job.client, m.job.jdText, m.job.profileText, m.job.trackLabel]
          .join(' ')
          .toLowerCase()
          .includes(kw)
      );
    }
    return list;
  }, [topMatches, matches, filters]);

  const clientOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) if (m.job.client) set.add(m.job.client);
    return [...set].sort();
  }, [matches]);

  const toggleTrack = (t: JobTrack) => {
    setFilters({
      tracks: filters.tracks.includes(t)
        ? filters.tracks.filter((x) => x !== t)
        : [...filters.tracks, t],
    });
  };

  const hasFilter =
    filters.tracks.length > 0 || filters.keyword || filters.client || filters.onlyComplete;

  return (
    <Card>
      <CardHeader
        title="岗位推荐"
        subtitle={
          jobsFetchedAt
            ? `岗位库 ${jobsFetchedAt ? new Date(jobsFetchedAt).toLocaleString('zh-CN') : ''} 更新 · 共 ${matches.length} 个在招岗位`
            : '岗位库未加载'
        }
        badge={
          visible.length > 0 ? (
            <Badge color="gold" variant="soft">推荐 {visible.length}</Badge>
          ) : null
        }
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => loadJobs(true)}
            loading={jobsStatus === 'loading'}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            刷新岗位
          </Button>
        }
      />

      <CardBody className="space-y-3">
        {/* 筛选 */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {JOB_TRACKS.map((t) => (
              <button
                key={t}
                onClick={() => toggleTrack(t)}
                className={cn(
                  'px-2 py-1 text-[11px] rounded-md border transition-colors',
                  filters.tracks.includes(t)
                    ? 'border-accent-gold/50 bg-accent-gold/15 text-accent-gold'
                    : 'border-border text-fg-muted hover:text-fg hover:border-border-strong'
                )}
              >
                {TRACK_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
              <input
                value={filters.keyword}
                onChange={(e) => setFilters({ keyword: e.target.value })}
                placeholder="搜职位 / 客户 / 要求关键词"
                className="w-full h-9 pl-8 pr-3 text-xs bg-bg-input text-fg border border-border rounded-lg
                  placeholder:text-fg-subtle focus:outline-none focus:border-accent-gold/50"
              />
            </div>
            <select
              value={filters.client}
              onChange={(e) => setFilters({ client: e.target.value })}
              className="h-9 px-2 text-xs bg-bg-input text-fg border border-border rounded-lg
                focus:outline-none focus:border-accent-gold/50 max-w-[140px]"
            >
              <option value="">全部客户</option>
              {clientOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted cursor-pointer">
              <input
                type="checkbox"
                checked={filters.onlyComplete}
                onChange={(e) => setFilters({ onlyComplete: e.target.checked })}
                className="accent-accent-gold"
              />
              只看信息完整的岗位
            </label>
            {hasFilter && (
              <button
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg"
              >
                <X className="w-3 h-3" />清除筛选
              </button>
            )}
          </div>
        </div>

        {/* AI 复核状态 */}
        {llmStatus === 'error' && (
          <div className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-status-yellow/10 border border-status-yellow/30">
            <p className="text-[11px] text-fg-muted leading-relaxed">
              AI 复核未完成，下面显示的是本地规则排序。{llmError ? ` (${llmError})` : ''}
            </p>
            <Button size="sm" variant="ghost" onClick={() => rankTop()}>重试</Button>
          </div>
        )}

        {/* 列表 */}
        {matching ? (
          <div className="flex items-center justify-center gap-2 py-12 text-fg-muted text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            正在匹配全部岗位…
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-12">
            <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30 text-fg-muted" />
            <p className="text-sm text-fg-muted">
              {matches.length === 0 ? '上传简历后自动推荐岗位' : '当前筛选条件下没有岗位'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visible.map((m, i) => (
              <MatchResultCard
                key={m.job.id}
                result={m}
                rank={i + 1}
                onSelect={() => selectJob(m.job.id)}
                llmReason={llmReasons[m.job.id]}
                ranking={llmStatus === 'ranking' && !llmReasons[m.job.id]}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
