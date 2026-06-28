// =====================================================
// Module 5: 匹配度分析 (粘性右侧栏 - 核心价值交付)
// =====================================================
import { BarChart3, Sparkles, FileText, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Card, CardHeader, CardBody, Button, EmptyState, Badge } from '@/components/ui/Card';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { RecommendationBadge } from '@/components/ui/RecommendationBadge';
import { DimensionCard } from '@/components/ui/DimensionCard';
import { ChatPanel } from '@/components/ui/ChatPanel';
import { formatReport } from '@/lib/formatReport';
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
}: Props) {
  const [copied, setCopied] = useState(false);

  const hasInputs = !!(jd?.rawText && candidate);

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
              <h4 className="text-xs font-semibold text-fg-muted uppercase tracking-wider mb-2">履历分析</h4>
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