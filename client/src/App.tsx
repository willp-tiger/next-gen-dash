import { useState } from 'react';
import type { DashboardConfig } from 'shared/types';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { InterpretationReview } from './components/interpretation/InterpretationReview';
import { Dashboard } from './components/dashboard/Dashboard';
import { Header } from './components/layout/Header';

type AppPhase = 'onboarding' | 'review' | 'dashboard';

export default function App() {
  const [phase, setPhase] = useState<AppPhase>('onboarding');
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [userId] = useState(() => `user-${Date.now()}`);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        phase={phase}
        onReset={() => {
          setPhase('onboarding');
          setConfig(null);
        }}
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {phase === 'onboarding' && (
          <OnboardingFlow
            userId={userId}
            onComplete={(newConfig) => {
              setConfig(newConfig);
              setPhase('review');
            }}
          />
        )}
        {phase === 'review' && config && (
          <InterpretationReview
            config={config}
            onConfirm={(finalConfig) => {
              setConfig(finalConfig);
              setPhase('dashboard');
            }}
            onRetry={() => setPhase('onboarding')}
          />
        )}
        {phase === 'dashboard' && config && (
          <Dashboard config={config} userId={userId} />
        )}
      </main>
    </div>
  );
}
