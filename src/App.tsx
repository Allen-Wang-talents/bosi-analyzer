// =====================================================
// App - 顶层
//
// 两个页面靠 useJobStore.view 切换 (项目里没有 router, 也不打算加)
// =====================================================
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MatchPage } from '@/pages/MatchPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { useAnalysisStore } from '@/store/useAnalysisStore';
import { useJobStore } from '@/store/useJobStore';

function App() {
  const apiKeyStatus = useAnalysisStore((s) => s.apiKeyStatus);
  const view = useJobStore((s) => s.view);

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <Header apiKeyStatus={apiKeyStatus} />
      {view === 'match' ? <MatchPage /> : <ReviewPage />}
      <Footer />
    </div>
  );
}

export default App;
