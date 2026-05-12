import { useState, useEffect } from 'react';
import type { DashboardConfig } from 'shared/types';
import { getPersonaConfigs } from '../../api/client';

interface PersonaSelectorProps {
  onSelect: (config: DashboardConfig | null) => void;
  activePersona: string | null;
}

const PERSONA_META: Record<string, { icon: string; label: string; description: string }> = {
  csco: {
    icon: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
    label: 'Chief Supply Chain Officer',
    description: 'OTIF, working capital, operational health',
  },
  'warehouse-director': {
    icon: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m4.5-6h1.5m-1.5 3h1.5m-1.5 3h1.5M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21',
    label: 'Warehouse Director',
    description: 'Throughput, accuracy, capacity',
  },
  'procurement-lead': {
    icon: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6',
    label: 'Procurement Lead',
    description: 'Supplier OTD, lead time, quality',
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
                onSelect(null);
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
