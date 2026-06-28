// =====================================================
// App - 顶层
// =====================================================
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { HomePage } from '@/pages/HomePage';
import { useAnalysisStore } from '@/store/useAnalysisStore';

function App() {
  const apiKeyStatus = useAnalysisStore((s) => s.apiKeyStatus);

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <Header apiKeyStatus={apiKeyStatus} />
      <HomePage />
      <Footer />
    </div>
  );
}

export default App;