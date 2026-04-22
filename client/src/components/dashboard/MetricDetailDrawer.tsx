import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useEffect, useRef } from 'react';
import type { MetricConfig, MetricValue } from 'shared/types';
import { getHealthStatus, STATUS_COLORS } from './HealthBadge';
import { formatValue, formatDelta } from '../../lib/format';

interface MetricDetailDrawerProps {
  metric: MetricConfig;
  value: MetricValue;
  onClose: () => void;
}

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: 'none',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '8px 12px',
};

export function MetricDetailDrawer({ metric, value, onClose }: MetricDetailDrawerProps) {
  const status = getHealthStatus(value.current, metric.thresholds);
  const deltaPositive = value.delta >= 0;
  const isGoodDelta = metric.thresholds.direction === 'lower-is-better' ? value.delta <= 0 : value.delta >= 0;
  const color = status === 'healthy' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';

  const trendData = value.trend.map((v, i) => {
    const total = value.trend.length;
    let label: string;
    if (total <= 12) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      label = monthNames[i % 12];
    } else if (total <= 31) {
      label = `Day ${i + 1}`;
    } else {
      label = `${i + 1}`;
    }
    return { hour: label, value: v };
  });

  const { green, yellow, direction } = metric.thresholds;
  const target = green.max;

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
      <div ref={drawerRef} tabIndex={-1} className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-lg bg-white shadow-2xl overflow-y-auto animate-slide-in focus:outline-none">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">{metric.label}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {direction === 'higher-is-better' ? 'Higher is better' : 'Lower is better'}
              </p>
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

        <div className="px-6 py-5 space-y-6">
          {/* Current value hero */}
          <div className="flex items-start gap-6">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current</span>
              <div className="text-4xl font-bold tracking-tight text-slate-900 mt-1">
                {formatValue(value.current, metric.unit)}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`flex items-center gap-1 text-sm font-semibold ${isGoodDelta ? 'text-emerald-600' : 'text-red-600'}`}>
                  <svg className={`h-3.5 w-3.5 ${deltaPositive ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                  </svg>
                  {formatDelta(value.delta)}
                </span>
                <span className="text-[10px] text-slate-400">vs prior period</span>
              </div>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                status === 'healthy' ? 'bg-emerald-50 text-emerald-700' :
                status === 'warning' ? 'bg-amber-50 text-amber-700' :
                'bg-red-50 text-red-700'
              }`}>
                <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[status].dot}`} />
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
              {target > 0 && (
                <span className="text-[10px] text-slate-400 mt-1">
                  Target: {formatValue(target, metric.unit)}
                </span>
              )}
            </div>
          </div>

          {/* Trend chart */}
          {trendData.length > 1 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                Trend
              </h4>
              <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 8, right: 12, bottom: 4, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        interval={Math.max(0, Math.floor(trendData.length / 8))}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={45}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(val: number) => [formatValue(val, metric.unit), metric.label]}
                      />
                      {target > 0 && (
                        <ReferenceLine
                          y={target}
                          stroke="#94a3b8"
                          strokeDasharray="4 4"
                          label={{ value: 'Target', position: 'right', fontSize: 10, fill: '#94a3b8' }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Threshold levels */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
              Threshold Levels
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg border border-slate-200/60 bg-emerald-50/50 px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-emerald-500" />
                <div className="flex-1">
                  <span className="text-xs font-semibold text-emerald-800">Healthy</span>
                </div>
                <span className="text-xs font-medium text-emerald-700">
                  {direction === 'lower-is-better' ? `≤ ${formatValue(green.max, metric.unit)}` : `≥ ${formatValue(green.max, metric.unit)}`}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200/60 bg-amber-50/50 px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-amber-500" />
                <div className="flex-1">
                  <span className="text-xs font-semibold text-amber-800">Warning</span>
                </div>
                <span className="text-xs font-medium text-amber-700">
                  {direction === 'lower-is-better'
                    ? `${formatValue(green.max, metric.unit)} – ${formatValue(yellow.max, metric.unit)}`
                    : `${formatValue(yellow.max, metric.unit)} – ${formatValue(green.max, metric.unit)}`}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-slate-200/60 bg-red-50/50 px-4 py-2.5">
                <span className="h-3 w-3 rounded-full bg-red-500" />
                <div className="flex-1">
                  <span className="text-xs font-semibold text-red-800">Critical</span>
                </div>
                <span className="text-xs font-medium text-red-700">
                  {direction === 'lower-is-better' ? `> ${formatValue(yellow.max, metric.unit)}` : `< ${formatValue(yellow.max, metric.unit)}`}
                </span>
              </div>
            </div>
          </div>

          {/* Supporting stats */}
          {trendData.length > 1 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                Period Statistics
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Min', val: Math.min(...value.trend) },
                  { label: 'Max', val: Math.max(...value.trend) },
                  { label: 'Average', val: value.trend.reduce((a, b) => a + b, 0) / value.trend.length },
                ].map(stat => (
                  <div key={stat.label} className="rounded-lg border border-slate-200/60 bg-slate-50 p-3 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</span>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      {formatValue(stat.val, metric.unit)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reasoning (if present from Claude) */}
          {metric.reasoning && (
            <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-dark">AI Insight</span>
              <p className="mt-1 text-sm text-slate-700 leading-relaxed italic">
                &ldquo;{metric.reasoning}&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
