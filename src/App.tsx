// =====================================================
// App - 顶层
//
// 两个页面靠 useJobStore.view 切换 (项目里没有 router, 也不打算加)
// =====================================================
import { useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AuthModal } from '@/components/ui/AuthModal';
import { MatchPage } from '@/pages/MatchPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { useAnalysisStore } from '@/store/useAnalysisStore';
import { useJobStore } from '@/store/useJobStore';
import { useAuthStore } from '@/store/useAuthStore';

function App() {
  const apiKeyStatus = useAnalysisStore((s) => s.apiKeyStatus);
  const view = useJobStore((s) => s.view);
  const authOpen = useAuthStore((s) => s.modalOpen);
  const closeAuth = useAuthStore((s) => s.closeAuth);

  // 本地存的 token 未必还有效, 开页时问一次后端
  useEffect(() => {
    void useAuthStore.getState().bootstrap();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-bg-base page-grid">
      <Header apiKeyStatus={apiKeyStatus} />
      {view === 'match' ? <MatchPage /> : <ReviewPage />}
      <Footer />
      <AuthModal open={authOpen} onClose={closeAuth} />
    </div>
  );
}

export default App;
