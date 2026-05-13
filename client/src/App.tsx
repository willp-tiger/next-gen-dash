import { useEffect, useRef, useState } from 'react';
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
import { HowItWorks } from './components/system/HowItWorks';
import { getDashboardConfig } from './api/client';

type DashboardPhase = 'onboarding' | 'review' | 'dashboard';

// Session persistence — without this, every browser refresh dumps the user back to the login
// screen and loses pinned-note continuity. Demo-killing for a Director walkthrough.
const SESSION_USER_KEY = 'ngd:session-user';

function loadSessionUser(): UserProfile | null {
  try {
    const raw = window.localStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.email === 'string' && typeof parsed.displayName === 'string') {
      return parsed as UserProfile;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(() => loadSessionUser());
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [dashboardPhase, setDashboardPhase] = useState<DashboardPhase>('onboarding');
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [studioSeed, setStudioSeed] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Rehydrate the persisted user's dashboard config once per login so a browser refresh lands
  // them on their dashboard instead of restarting onboarding. Gated by hydratedFor so it
  // doesn't re-fire when the user clicks "New dashboard" (which intentionally nulls config) —
  // without the gate, the effect would immediately re-fetch and bounce them back.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    if (hydratedFor.current === user.email) return;
    hydratedFor.current = user.email;
    let cancelled = false;
    (async () => {
      try {
        const wrapped = await getDashboardConfig(user.email.toLowerCase()) as unknown as
          { config?: DashboardConfig } | DashboardConfig | null;
        if (cancelled) return;
        const saved: DashboardConfig | null = wrapped && typeof wrapped === 'object' && 'config' in (wrapped as object)
          ? ((wrapped as { config?: DashboardConfig }).config ?? null)
          : (wrapped as DashboardConfig | null);
        if (saved && saved.metrics) {
          setConfig(saved);
          setDashboardPhase('dashboard');
        } else {
          setDashboardPhase('onboarding');
        }
      } catch {
        if (!cancelled) setDashboardPhase('onboarding');
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const userId = user?.email.toLowerCase() ?? '';

  const handleLogin = (profile: UserProfile, savedConfig?: DashboardConfig) => {
    setUser(profile);
    try { window.localStorage.setItem(SESSION_USER_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
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
    hydratedFor.current = null;
    try { window.localStorage.removeItem(SESSION_USER_KEY); } catch { /* ignore */ }
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
                <Dashboard
                  config={config}
                  userId={userId}
                  userName={user.displayName}
                  onAuthorKpi={handleAuthorKpi}
                />
              )}
            </>
          )}
          {activeTab === 'catalog' && <KpiCatalog />}
          {activeTab === 'studio' && (
            <KpiStudio seedPrompt={studioSeed} onSeedConsumed={() => setStudioSeed(null)} />
          )}
          {activeTab === 'health' && <KpiHealth />}
          {activeTab === 'howItWorks' && <HowItWorks />}
        </div>
      </main>
    </div>
  );
}
