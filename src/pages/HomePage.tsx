// =====================================================
// HomePage - 组合 5 个模块到单页布局
// =====================================================
import { useEffect } from 'react';
import { CompanyOverviewModule } from '@/components/modules/CompanyOverviewModule';
import { JobDescriptionModule } from '@/components/modules/JobDescriptionModule';
import { JobProfileModule } from '@/components/modules/JobProfileModule';
import { ResumeUploadModule } from '@/components/modules/ResumeUploadModule';
import { MatchAnalysisModule } from '@/components/modules/MatchAnalysisModule';
import { useAnalysisStore } from '@/store/useAnalysisStore';

export function HomePage() {
  const company = useAnalysisStore((s) => s.company);
  const jd = useAnalysisStore((s) => s.jd);
  const profile = useAnalysisStore((s) => s.profile);
  const candidate = useAnalysisStore((s) => s.candidate);
  const analysis = useAnalysisStore((s) => s.analysis);
  const chat = useAnalysisStore((s) => s.chat);
  const chatSending = useAnalysisStore((s) => s.chatSending);
  const apiKeyStatus = useAnalysisStore((s) => s.apiKeyStatus);

  const setCompany = useAnalysisStore((s) => s.setCompany);
  const setJd = useAnalysisStore((s) => s.setJd);
  const setProfile = useAnalysisStore((s) => s.setProfile);
  const setCandidate = useAnalysisStore((s) => s.setCandidate);
  const sendChatQuestion = useAnalysisStore((s) => s.sendChatQuestion);
  const clearChat = useAnalysisStore((s) => s.clearChat);
  const validateApiKeyStatus = useAnalysisStore((s) => s.validateApiKeyStatus);

  // 启动时校验 API Key
  useEffect(() => {
    validateApiKeyStatus();
  }, [validateApiKeyStatus]);

  return (
    <main className="flex-1">
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: 60% on desktop = 7/12 */}
          <div className="lg:col-span-7 space-y-6">
            <CompanyOverviewModule value={company} onChange={setCompany} />
            <JobDescriptionModule value={jd} onChange={setJd} />
            <JobProfileModule value={profile} onChange={setProfile} />
            <ResumeUploadModule value={candidate} onChange={setCandidate} />
          </div>

          {/* Right Column: 40% on desktop = 5/12 - sticky */}
          <div className="lg:col-span-5">
            <MatchAnalysisModule
              analysis={analysis}
              chatMessages={chat}
              isSending={chatSending}
              apiKeyStatus={apiKeyStatus}
              onSendChat={sendChatQuestion}
              onClearChat={clearChat}
              company={company}
              jd={jd}
              profile={profile}
              candidate={candidate}
            />
          </div>
        </div>
      </div>
    </main>
  );
}