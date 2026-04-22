import { useState, useEffect } from 'react';
import type { DashboardConfig } from 'shared/types';
import { getPersonaConfigs } from '../../api/client';

interface PersonaSelectorProps {
  onSelect: (config: DashboardConfig) => void;
  activePersona: string | null;
}

const PERSONA_META: Record<string, { icon: string; label: string; description: string }> = {
  'sales-rep': {
    icon: 'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
    label: 'Sales Rep',
    description: 'Revenue, orders, deal sizes',
  },
  director: {
    icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6',
    label: 'Sales Director',
    description: 'Fulfillment, territory performance',
  },
  executive: {
    icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
    label: 'Executive',
    description: 'Revenue growth, pricing efficiency',
  },
};

export function PersonaSelector({ onSelect, activePersona }: PersonaSelectorProps) {
  const [personas, setPersonas] = useState<Record<string, DashboardConfig> | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    getPersonaConfigs().then(setPersonas).catch(() => {});
  }, []);

  if (!personas) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
      >
        <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
        Compare Personas
        <svg className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl bg-white p-2 shadow-xl shadow-slate-900/10 border border-slate-200/60">
          <p className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            See how different roles view the same data
          </p>
          {Object.entries(PERSONA_META).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => {
                onSelect(personas[key]);
                setIsOpen(false);
              }}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                activePersona === key
                  ? 'bg-accent/10 ring-1 ring-accent/20'
                  : 'hover:bg-slate-50'
              }`}
            >
              <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                activePersona === key ? 'bg-accent/15' : 'bg-slate-100'
              }`}>
                <svg className={`h-4 w-4 ${activePersona === key ? 'text-accent' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} />
                </svg>
              </div>
              <div>
                <p className={`text-sm font-semibold ${activePersona === key ? 'text-navy-900' : 'text-slate-900'}`}>
                  {meta.label}
                </p>
                <p className="text-xs text-slate-500">{meta.description}</p>
              </div>
            </button>
          ))}
          {activePersona && (
            <button
              onClick={() => {
                onSelect(null as unknown as DashboardConfig);
                setIsOpen(false);
              }}
              className="mt-1 w-full rounded-lg px-3 py-2 text-center text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            >
              Back to My View
            </button>
          )}
        </div>
      )}
    </div>
  );
}
