import { useState } from 'react';
import type { DashboardConfig } from 'shared/types';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { InterpretationReview } from './components/interpretation/InterpretationReview';
import { Dashboard } from './components/dashboard/Dashboard';
import { Header } from './components/layout/Header';
import type { AppTab } from './components/layout/Header';
import { KpiCatalog } from './components/enterprise/KpiCatalog';
import { KpiStudio } from './components/enterprise/KpiStudio';
import { KpiHealth } from './components/enterprise/KpiHealth';

type DashboardPhase = 'onboarding' | 'review' | 'dashboard';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [dashboardPhase, setDashboardPhase] = useState<DashboardPhase>('onboarding');
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [userId] = useState(() => `user-${Date.now()}`);
  const [studioSeed, setStudioSeed] = useState<string | null>(null);

  const handleAuthorKpi = (phrase: string) => {
    setStudioSeed(phrase);
    setActiveTab('studio');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        dashboardPhase={dashboardPhase}
        onReset={() => {
          setDashboardPhase('onboarding');
          setConfig(null);
        }}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {activeTab === 'dashboard' && (
          <>
            {dashboardPhase === 'onboarding' && (
              <OnboardingFlow
                userId={userId}
                onComplete={(newConfig) => {
                  setConfig(newConfig);
                  setDashboardPhase('review');
                }}
              />
            )}
            {dashboardPhase === 'review' && config && (
              <InterpretationReview
                config={config}
                onConfirm={(finalConfig) => {
                  setConfig(finalConfig);
                  setDashboardPhase('dashboard');
                }}
                onRetry={() => setDashboardPhase('onboarding')}
              />
            )}
            {dashboardPhase === 'dashboard' && config && (
              <Dashboard config={config} userId={userId} onAuthorKpi={handleAuthorKpi} />
            )}
          </>
        )}
        {activeTab === 'catalog' && <KpiCatalog />}
        {activeTab === 'studio' && (
          <KpiStudio seedPrompt={studioSeed} onSeedConsumed={() => setStudioSeed(null)} />
        )}
        {activeTab === 'health' && <KpiHealth />}
      </main>
    </div>
  );
}
