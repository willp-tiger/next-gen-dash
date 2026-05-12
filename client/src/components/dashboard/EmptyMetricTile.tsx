import type { MetricConfig } from 'shared/types';

interface EmptyMetricTileProps {
  metric: MetricConfig;
  reason?: string;
  onClick?: () => void;
}

export function EmptyMetricTile({ metric, reason, onClick }: EmptyMetricTileProps) {
  return (
    <div
      onClick={onClick}
      className={`metric-card p-5 ${onClick ? 'cursor-pointer' : ''} ${metric.size === 'lg' ? 'col-span-2' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {metric.label}
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-300">
          no data
        </span>
      </div>
      <div className="mt-4 flex h-24 flex-col items-center justify-center text-center">
        <span className="text-2xl font-bold tracking-tight text-slate-300">—</span>
        <span className="mt-1.5 max-w-[200px] text-[10px] font-medium text-slate-400">
          {reason ?? 'Metric query failed or returned no value.'}
        </span>
      </div>
    </div>
  );
}
