// =====================================================
// MatchPage —— 岗位推荐 (新主流程)
//
// 左边上传简历, 右边自动列出最合适的岗位。
// 岗位信息不全时降级提示, 但「深度评鉴」页完全不受影响。
// =====================================================
import { useEffect } from 'react';
import { AlertTriangle, Database, Loader2 } from 'lucide-react';
import { ResumeUploadModule } from '@/components/modules/ResumeUploadModule';
import { JobListModule } from '@/components/modules/JobListModule';
import { JobDetailPanel } from '@/components/modules/JobDetailPanel';
import { HeroCarousel } from '@/components/modules/HeroCarousel';
import { CompanyMarquee } from '@/components/modules/CompanyMarquee';
import { Card, CardBody, Button } from '@/components/ui/Card';
import { useAnalysisStore } from '@/store/useAnalysisStore';
import { useJobStore } from '@/store/useJobStore';

export function MatchPage() {
  const candidate = useAnalysisStore((s) => s.candidate);
  const setCandidate = useAnalysisStore((s) => s.setCandidate);

  const jobsStatus = useJobStore((s) => s.jobsStatus);
  const jobsError = useJobStore((s) => s.jobsError);
  const jobsDegraded = useJobStore((s) => s.jobsDegraded);
  const jobsCount = useJobStore((s) => s.jobs.length);
  const loadJobs = useJobStore((s) => s.loadJobs);

  useEffect(() => {
    if (jobsStatus === 'idle') void loadJobs();
  }, [jobsStatus, loadJobs]);

  return (
    <main className="flex-1">
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <HeroCarousel />
        <CompanyMarquee />

        {jobsDegraded && (
          <div className="mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-status-yellow/10 border border-status-yellow/30">
            <AlertTriangle className="w-4 h-4 text-status-yellow shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-fg">岗位库暂时读不到飞书</p>
              <p className="text-[11px] text-fg-muted mt-0.5 leading-relaxed">
                {jobsError ?? '岗位数据暂时不可用。'}
                {jobsCount > 0 && ` 当前显示的是本地缓存的 ${jobsCount} 个岗位。`}
                {' 深度评鉴功能不受影响, 可以直接切过去用。'}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => loadJobs(true)}>重试</Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-6">
            <ResumeUploadModule value={candidate} onChange={setCandidate} />

            <Card>
              <CardBody className="flex items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-2 min-w-0">
                  <Database className="w-4 h-4 text-accent-gold shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-fg">在招岗位池</p>
                    <p className="text-[11px] text-fg-subtle mt-0.5 truncate">
                      {jobsStatus === 'loading'
                        ? '加载中…'
                        : jobsStatus === 'ready'
                          ? `${jobsCount} 个岗位 · 数据来自飞书多维表格`
                          : '未加载'}
                    </p>
                  </div>
                </div>
                {jobsStatus === 'loading' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-fg-muted shrink-0" />
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => loadJobs(true)}>刷新</Button>
                )}
              </CardBody>
            </Card>
          </div>

          <div className="lg:col-span-7">
            <JobListModule />
          </div>
        </div>
      </div>

      <JobDetailPanel />
    </main>
  );
}
