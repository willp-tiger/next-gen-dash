import { useState, useEffect } from 'react';
import type { UserProfile } from 'shared/types';

export type AppTab = 'dashboard' | 'catalog' | 'studio' | 'health';

interface HeaderProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  dashboardPhase: 'onboarding' | 'review' | 'dashboard';
  onReset: () => void;
  sidebarCollapsed: boolean;
  user?: UserProfile | null;
  onLogout?: () => void;
}

const TAB_LABELS: Record<AppTab, string> = {
  dashboard: 'Dashboard',
  catalog: 'KPI Catalog',
  studio: 'KPI Studio',
  health: 'KPI Health',
};

const TAB_SUBTITLES: Record<AppTab, string> = {
  dashboard: 'Real-time queue health metrics',
  catalog: 'Browse and manage KPI definitions',
  studio: 'Author new KPIs with AI assistance',
  health: 'Monitor KPI data quality and freshness',
};

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function Header({ activeTab, dashboardPhase, onReset, sidebarCollapsed, user, onLogout }: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    if (!showUserMenu) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowUserMenu(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showUserMenu]);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <header
      className="sticky top-0 z-40 border-b border-navy-800/50"
      style={{ background: 'linear-gradient(135deg, hsl(210, 50%, 16%) 0%, hsl(210, 55%, 12%) 100%)' }}
    >
      <div
        className={`flex items-center justify-between px-6 py-3 transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-60'}`}
      >
        <div className="flex items-center gap-4 pl-2 lg:pl-0">
          <div className="w-9 lg:hidden" />
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-white tracking-wide uppercase">
                {TAB_LABELS[activeTab]}
              </h2>
            </div>
            <p className="text-xs text-navy-300 mt-0.5">{TAB_SUBTITLES[activeTab]}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {activeTab === 'dashboard' && dashboardPhase !== 'onboarding' && (
            <button
              onClick={onReset}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-navy-200 transition hover:bg-white/10 hover:text-white"
            >
              Start Over
            </button>
          )}

          <div className="hidden sm:flex items-center gap-2 text-xs text-navy-300">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{dateStr} {timeStr}</span>
          </div>

          <div className="h-5 w-px bg-white/15 hidden sm:block" />

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1 transition hover:bg-white/5"
              aria-expanded={showUserMenu}
              aria-haspopup="true"
              aria-label="User menu"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent-light">
                {user ? getInitials(user.displayName) : '?'}
              </div>
              {user && (
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-white leading-tight">{user.displayName}</p>
                  <p className="text-[10px] text-navy-300 leading-tight">{user.email}</p>
                </div>
              )}
              <svg className="h-3 w-3 text-navy-300 hidden sm:block" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl bg-white border border-slate-200/60 shadow-xl shadow-slate-900/10 p-2" role="menu">
                  {user && (
                    <div className="px-3 py-2 border-b border-slate-100 mb-1">
                      <p className="text-sm font-semibold text-slate-900">{user.displayName}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout?.();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
