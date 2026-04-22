import { useEffect, useRef } from 'react';
import type { MetricConfig } from 'shared/types';
import { getHealthStatus, STATUS_COLORS } from './HealthBadge';
import { formatValue } from '../../lib/format';

interface ThresholdDrawerProps {
  metrics: MetricConfig[];
  snapshot: Record<string, { current: number }>;
  highlightId?: string | null;
  onClose: () => void;
}

export function ThresholdDrawer({ metrics, snapshot, highlightId, onClose }: ThresholdDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    drawerRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div ref={drawerRef} tabIndex={-1} className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-md bg-white shadow-2xl overflow-y-auto animate-slide-in focus:outline-none">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Threshold Settings</h3>
              <p className="text-xs text-slate-500 mt-0.5">{metrics.length} KPI thresholds configured</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="px-6 py-4 space-y-3">
          {metrics.map(metric => {
            const val = snapshot[metric.id];
            const currentVal = val?.current ?? 0;
            const status = getHealthStatus(currentVal, metric.thresholds);
            const isHighlighted = highlightId === metric.id;
            const { green, yellow, direction } = metric.thresholds;

            return (
              <div
                key={metric.id}
                className={`rounded-xl border p-4 transition ${
                  isHighlighted
                    ? 'border-accent ring-2 ring-accent/20 bg-accent/5'
                    : 'border-slate-200/60 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status].dot}`} />
                    <span className="text-sm font-semibold text-slate-900">{metric.label}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-700">
                    {formatValue(currentVal, metric.unit)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />
                    <span className="text-[11px] font-medium text-slate-500 flex-1">Healthy</span>
                    <span className="text-[11px] font-semibold text-slate-600 bg-emerald-50 rounded px-2 py-0.5">
                      {direction === 'lower-is-better' ? `≤ ${formatValue(green.max, metric.unit)}` : `≥ ${formatValue(green.max, metric.unit)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500 flex-shrink-0" />
                    <span className="text-[11px] font-medium text-slate-500 flex-1">Warning</span>
                    <span className="text-[11px] font-semibold text-slate-600 bg-amber-50 rounded px-2 py-0.5">
                      {direction === 'lower-is-better'
                        ? `≤ ${formatValue(yellow.max, metric.unit)}`
                        : `≥ ${formatValue(yellow.max, metric.unit)}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
                    <span className="text-[11px] font-medium text-slate-500 flex-1">Critical</span>
                    <span className="text-[11px] font-semibold text-slate-600 bg-red-50 rounded px-2 py-0.5">
                      {direction === 'lower-is-better' ? `> ${formatValue(yellow.max, metric.unit)}` : `< ${formatValue(yellow.max, metric.unit)}`}
                    </span>
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                    {direction === 'higher-is-better' ? 'Higher is better' : 'Lower is better'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
