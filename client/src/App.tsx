import { useState, useEffect } from 'react';
import type { DashboardConfig } from 'shared/types';
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';
import { InterpretationReview } from './components/interpretation/InterpretationReview';
import { Dashboard } from './components/dashboard/Dashboard';
import { LookerBuilder } from './components/looker/LookerBuilder';
import { Header } from './components/layout/Header';
import { getLookerStatus } from './api/client';

type AppMode = 'demo' | 'looker';
type AppPhase = 'onboarding' | 'review' | 'dashboard';

export default function App() {
  const [mode, setMode] = useState<AppMode>('demo');
  const [phase, setPhase] = useState<AppPhase>('onboarding');
  const [config, setConfig] = useState<DashboardConfig | null>(null);
  const [userId] = useState(() => `user-${Date.now()}`);
  const [lookerAvailable, setLookerAvailable] = useState(false);

  useEffect(() => {
    getLookerStatus()
      .then(s => setLookerAvailable(s.configured))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        phase={mode === 'looker' ? 'dashboard' : phase}
        onReset={() => {
          if (mode === 'looker') {
            setMode('demo');
          }
          setPhase('onboarding');
          setConfig(null);
        }}
        extra={
          lookerAvailable ? (
            <button
              onClick={() => setMode(mode === 'looker' ? 'demo' : 'looker')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                mode === 'looker'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {mode === 'looker' ? 'Looker Mode' : 'Switch to Looker'}
            </button>
          ) : undefined
        }
      />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {mode === 'looker' ? (
          <LookerBuilder userId={userId} />
        ) : (
          <>
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
          </>
        )}
      </main>
    </div>
  );
}
