// =====================================================
// 岗位详情抽屉 —— JD + 画像 + 匹配拆解 + AI 理由
// =====================================================
import { useEffect } from 'react';
import { X, MapPin, Wallet, Briefcase, Sparkles, ArrowRightCircle, AlertTriangle } from 'lucide-react';
import { Badge, Button, cn } from '@/components/ui/Card';
import { useJobStore } from '@/store/useJobStore';

export function JobDetailPanel() {
  const selectedJobId = useJobStore((s) => s.selectedJobId);
  const matches = useJobStore((s) => s.matches);
  const topMatches = useJobStore((s) => s.topMatches);
  const llmReasons = useJobStore((s) => s.llmReasons);
  const selectJob = useJobStore((s) => s.selectJob);
  const openInReview = useJobStore((s) => s.openInReview);

  const result =
    topMatches.find((m) => m.job.id === selectedJobId) ??
    matches.find((m) => m.job.id === selectedJobId);

  useEffect(() => {
    if (!selectedJobId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectJob(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedJobId, selectJob]);

  const open = !!selectedJobId && !!result;

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => selectJob(null)}
      />

      <aside
        className={cn(
          'fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-bg-card border-l border-border shadow-2xl',
          'transform transition-transform duration-300 ease-out flex flex-col',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {result && (
          <>
            <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-border">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-fg truncate">
                  {result.job.title || '（未填职位名称）'}
                </h3>
                <p className="text-xs text-fg-muted mt-0.5">{result.job.client || '未填客户'}</p>
              </div>
              <button onClick={() => selectJob(null)} className="text-fg-muted hover:text-fg p-1 shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* 匹配分 */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-bg-elevated border border-border">
                <div className="text-center">
                  <div
                    className={cn(
                      'text-3xl font-bold tabular-nums leading-none',
                      result.score >= 80 ? 'text-status-green' :
                      result.score >= 65 ? 'text-accent-gold' :
                      result.score >= 50 ? 'text-status-yellow' : 'text-fg-muted'
                    )}
                  >
                    {Math.round(result.score)}
                  </div>
                  <div className="text-[10px] text-fg-subtle mt-1">匹配分</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    <Badge color="blue" variant="soft">{result.job.trackLabel}</Badge>
                    {result.incomplete && (
                      <Badge color="yellow" variant="soft">
                        <AlertTriangle className="w-3 h-3" />岗位信息不全
                      </Badge>
                    )}
                    {result.priorityBonus > 0 && (
                      <Badge color="gold" variant="outline">
                        优先级 +{result.priorityBonus}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-fg-muted leading-relaxed">
                    证据覆盖 {Math.round(result.confidence * 100)}% · 实际评估 {result.evaluatedDimensions}/4 个维度
                    {result.evaluatedDimensions < 4 && '（信息不全的维度不计分，只摊权重）'}
                  </p>
                </div>
              </div>

              {/* 维度拆解 */}
              <section>
                <h4 className="text-xs font-semibold text-fg-muted mb-2 uppercase tracking-wider">匹配拆解</h4>
                <div className="space-y-2.5">
                  {result.dimensions.map((d) => (
                    <div key={d.key} className="p-3 rounded-lg bg-bg-elevated border border-border">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-medium text-fg">{d.label}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[10px] text-fg-subtle tabular-nums">
                            权重 {(d.effectiveWeight * 100).toFixed(0)}%
                          </span>
                          <span
                            className={cn(
                              'text-sm font-bold tabular-nums',
                              d.score === null ? 'text-fg-subtle' :
                              d.score >= 80 ? 'text-status-green' :
                              d.score >= 65 ? 'text-accent-gold' :
                              d.score >= 50 ? 'text-status-yellow' : 'text-status-red'
                            )}
                          >
                            {d.score === null ? '未评估' : Math.round(d.score)}
                          </span>
                        </span>
                      </div>
                      <div className="h-1 bg-bg-base rounded-full overflow-hidden mb-1.5">
                        <div
                          className="h-full rounded-full bg-accent-gold"
                          style={{ width: `${d.score ?? 0}%` }}
                        />
                      </div>
                      <p className="text-[10px] leading-relaxed text-fg-subtle">{d.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* AI 理由 */}
              {llmReasons[result.job.id] && (
                <section>
                  <h4 className="text-xs font-semibold text-fg-muted mb-2 uppercase tracking-wider">
                    <Sparkles className="w-3 h-3 inline mr-1 text-accent-gold" />AI 推荐理由
                  </h4>
                  <div className="p-3 rounded-lg bg-bg-elevated border border-accent-gold/20">
                    <p className="text-xs leading-relaxed text-fg">{llmReasons[result.job.id].reason}</p>
                    {llmReasons[result.job.id].gaps.length > 0 && (
                      <div className="mt-2.5 pt-2.5 border-t border-border/60">
                        <p className="text-[10px] text-fg-subtle mb-1">差距与风险</p>
                        {llmReasons[result.job.id].gaps.map((g, i) => (
                          <p key={i} className="text-[11px] text-status-yellow leading-relaxed">· {g}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* 要求词命中 */}
              {(result.matchedTerms.length > 0 || result.missingTerms.length > 0) && (
                <section>
                  <h4 className="text-xs font-semibold text-fg-muted mb-2 uppercase tracking-wider">岗位要求覆盖</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {result.matchedTerms.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-status-green/15 text-status-green">
                        {t}
                      </span>
                    ))}
                    {result.missingTerms.map((t) => (
                      <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-status-red/10 text-status-red/80">
                        -{t}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* 岗位信息 */}
              <section>
                <h4 className="text-xs font-semibold text-fg-muted mb-2 uppercase tracking-wider">岗位信息</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Meta label="方向" value={result.job.trackLabel} />
                  <Meta label="地点" value={result.job.location} icon={<MapPin className="w-3 h-3" />} />
                  <Meta label="薪资带宽" value={result.job.salaryBand} icon={<Wallet className="w-3 h-3" />} />
                  <Meta label="合同点位" value={result.job.feePoint} />
                  <Meta label="客户层级" value={result.job.clientTier} />
                  <Meta label="优先级" value={result.job.priority} />
                  <Meta label="客户经理" value={result.job.owner} />
                  <Meta label="开始时间" value={result.job.startDate} />
                </div>
              </section>

              {/* JD */}
              {result.job.jdText && (
                <section>
                  <h4 className="text-xs font-semibold text-fg-muted mb-2 uppercase tracking-wider flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />岗位 JD
                  </h4>
                  <p className="text-xs leading-relaxed text-fg-muted whitespace-pre-wrap p-3 rounded-lg bg-bg-elevated border border-border">
                    {result.job.jdText}
                  </p>
                </section>
              )}

              {/* 画像 */}
              {result.job.profileText && (
                <section>
                  <h4 className="text-xs font-semibold text-fg-muted mb-2 uppercase tracking-wider">人才画像</h4>
                  <p className="text-xs leading-relaxed text-fg-muted whitespace-pre-wrap p-3 rounded-lg bg-bg-elevated border border-border">
                    {result.job.profileText}
                  </p>
                </section>
              )}

              {result.job.remarks && (
                <section>
                  <h4 className="text-xs font-semibold text-fg-muted mb-2 uppercase tracking-wider">备注</h4>
                  <p className="text-xs text-fg-muted whitespace-pre-wrap">{result.job.remarks}</p>
                </section>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
              <p className="text-[10px] text-fg-subtle leading-relaxed">
                在深度评鉴里会把这个岗位填成 JD, 跑完整的 5 维评鉴
              </p>
              <Button
                size="sm"
                onClick={() => openInReview(result.job.id)}
                leftIcon={<ArrowRightCircle className="w-4 h-4" />}
              >
                在深度评鉴中打开
              </Button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function Meta({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) {
  return (
    <div className="p-2.5 rounded-lg bg-bg-elevated border border-border">
      <p className="text-[10px] text-fg-subtle flex items-center gap-1">{icon}{label}</p>
      <p className="text-xs text-fg mt-0.5 break-words">{value || '—'}</p>
    </div>
  );
}
