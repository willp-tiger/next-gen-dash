import { useState } from 'react';
import type { DashboardConfig, UserProfile } from 'shared/types';
import { LoginPage } from './components/auth/LoginPage';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { InterpretationReview } from './components/interpretation/InterpretationReview';
import { Dashboard } from './components/dashboard/Dashboard';
import { Header } from './components/layout/Header';
import type { AppTab } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { KpiCatalog } from './components/enterprise/KpiCatalog';
import { KpiStudio } from './components/enterprise/KpiStudio';
import { KpiHealth } from './components/enterprise/KpiHealth';

type DashboardPhase = 'onboarding' | 'review' | 'dashboard';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [dashboardPhase, setDashboardPhase] = useState<DashboardPhase>('onboarding');
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [studioSeed, setStudioSeed] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const userId = user?.email.toLowerCase() ?? '';

  const handleLogin = (profile: UserProfile, savedConfig?: DashboardConfig) => {
    setUser(profile);
    if (savedConfig) {
      setConfig(savedConfig);
      setDashboardPhase('dashboard');
    } else {
      setDashboardPhase('onboarding');
      setConfig(null);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setConfig(null);
    setDashboardPhase('onboarding');
    setActiveTab('dashboard');
  };

  const handleAuthorKpi = (phrase: string) => {
    setStudioSeed(phrase);
    setActiveTab('studio');
  };

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
      />
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        dashboardPhase={dashboardPhase}
        onReset={() => {
          setDashboardPhase('onboarding');
          setConfig(null);
        }}
        sidebarCollapsed={sidebarCollapsed}
        user={user}
        onLogout={handleLogout}
      />
      <main
        className={`transition-all duration-300 px-4 py-6 sm:px-6 lg:px-8 ${sidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-60'}`}
      >
        <div className="mx-auto max-w-[1600px]">
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
        </div>
      </main>
    </div>
  );
}
