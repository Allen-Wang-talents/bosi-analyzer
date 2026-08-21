// =====================================================
// Module 5: 匹配度分析 (粘性右侧栏 - 核心价值交付)
// =====================================================
import { BarChart3, Sparkles, FileText, Copy, Check, Wand2, Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader, CardBody, Button, EmptyState, Badge } from '@/components/ui/Card';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { RecommendationBadge } from '@/components/ui/RecommendationBadge';
import { DimensionCard } from '@/components/ui/DimensionCard';
import { ChatPanel } from '@/components/ui/ChatPanel';
import { formatReport } from '@/lib/formatReport';
import { isCandidateSparse, getSparseCount } from '@/lib/candidateValid';
import type { ScoreResult, ChatMessage as ChatMessageType, Company, JD, JobProfile, Candidate, ApiKeyStatus } from '@/types';

type Props = {
  analysis: ScoreResult | null;
  chatMessages: ChatMessageType[];
  isSending: boolean;
  apiKeyStatus: ApiKeyStatus;
  onSendChat: (question: string) => void;
  onClearChat: () => void;
  // For context (Chat)
  company?: Company | null;
  jd?: JD | null;
  profile?: JobProfile | null;
  candidate?: Candidate | null;
  // AI 润色
  summaryPolishing: boolean;
  onPolishSummary: () => void;
};

export function MatchAnalysisModule({
  analysis,
  chatMessages,
  isSending,
  apiKeyStatus,
  onSendChat,
  onClearChat,
  company,
  jd,
  profile,
  candidate,
  summaryPolishing,
  onPolishSummary,
}: Props) {
  const [copied, setCopied] = useState(false);

  const hasInputs = !!(jd?.rawText && candidate);
  const candidateSparse = isCandidateSparse(candidate);

  const handleCopy = async () => {
    if (!analysis) return;
    const text = formatReport(analysis);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('复制失败:', e);
    }
  };

  return (
    <Card className="sticky top-4 flex flex-col">
      <CardHeader
        icon={<BarChart3 className="w-5 h-5" />}
        title="匹配度分析"
        subtitle={analysis ? `生成于 ${new Date(analysis.generatedAt).toLocaleString('zh-CN')}` : '等待输入...'}
        actions={
          analysis && (
            <Button size="sm" variant="ghost" onClick={handleCopy}>
              {copied ? (
                <><Check className="w-3.5 h-3.5 text-status-green" /> 已复制</>
              ) : (
                <><Copy className="w-3.5 h-3.5" /> 复制报告</>
              )}
            </Button>
          )
        }
      />

      <CardBody className="flex-1 flex flex-col gap-4">
        {!hasInputs ? (
          <EmptyState
            icon={<Sparkles className="w-6 h-6" />}
            title="等待输入"
            description="请先填写 Module 2 (JD) 和 Module 4 (简历) 触发评分"
          />
        ) : candidateSparse ? (
          // Allen 2026-08-21: 简历信息稀疏 → 阻止评分, 强制用户先补全
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-4 bg-status-yellow/10 border border-status-yellow/30 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-status-yellow shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-status-yellow">简历信息不足, 无法评分</h4>
                <p className="text-xs text-fg-muted mt-1.5 leading-relaxed">
                  已识别到候选人对象, 但关键字段缺失 {getSparseCount(candidate)}/4 (技能 / 工作经历 / 当前职位 / 工作年限)。
                  为保证评分有意义, 请先在 Module 4 手动补全核心字段后再触发评分。
                </p>
              </div>
            </div>
            <EmptyState
              icon={<FileText className="w-6 h-6" />}
              title="等待补全候选人信息"
              description='返回 Module 4 → 展开"手动补充" → 填写 5 个核心字段 (姓名/工作年限/当前职位/当前公司/技能)'
              action={
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    document.querySelector('[data-module="resume-upload"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> 回到 Module 4 补全
                </Button>
              }
            />
          </div>
        ) : !analysis ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="正在生成分析..."
            description="解析中，请稍候"
          />
        ) : (
          <>
            {/* Score Ring + Recommendation */}
            <div className="flex flex-col items-center py-4 border-b border-border">
              <ScoreRing score={analysis.total} size={160} />
              <div className="mt-4">
                <RecommendationBadge recommendation={analysis.recommendation} size="lg" />
              </div>
              <p className="text-xs text-fg-muted mt-3 text-center max-w-xs leading-relaxed">
                {analysis.recommendation.reason}
              </p>
            </div>

            {/* 4 Dimensions */}
            <div>
              <h4 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-3">评分依据</h4>
              <div className="space-y-2">
                {analysis.dimensions.map((d) => (
                  <DimensionCard key={d.name} dimension={d} />
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-bg-base/50 rounded-lg p-4 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-semibold text-fg-muted uppercase tracking-wider">履历分析</h4>
                  {analysis.summarySource === 'llm' ? (
                    <Badge color="gold" variant="soft" className="text-[10px] py-0">AI 润色版</Badge>
                  ) : (
                    <Badge color="gray" variant="soft" className="text-[10px] py-0">结构化骨架</Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onPolishSummary}
                  disabled={summaryPolishing || analysis.summarySource === 'llm' || apiKeyStatus !== 'configured'}
                  title={
                    apiKeyStatus !== 'configured'
                      ? '请先配置 MiniMax M3 API Key'
                      : analysis.summarySource === 'llm'
                      ? '已是润色版'
                      : '基于 JD + 岗位画像 + 项目/技能命中明细，由 MiniMax M3 二次润色'
                  }
                >
                  {summaryPolishing ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 润色中...</>
                  ) : (
                    <><Wand2 className="w-3.5 h-3.5" /> AI 润色</>
                  )}
                </Button>
              </div>
              <div className="text-sm text-fg leading-relaxed whitespace-pre-wrap">
                {analysis.summary}
              </div>
            </div>

            {/* Chat */}
            <div className="border border-border rounded-lg overflow-hidden">
              <ChatPanel
                messages={chatMessages}
                onSend={onSendChat}
                onClear={onClearChat}
                isSending={isSending}
                disabled={apiKeyStatus !== 'configured'}
                disabledReason={apiKeyStatus === 'missing' ? '请先在设置中配置 MiniMax M3 API Key' : apiKeyStatus === 'invalid' ? 'API Key 无效，请检查' : undefined}
              />
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}