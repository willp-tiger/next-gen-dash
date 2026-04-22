import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import type { MetricConfig, MetricValue } from 'shared/types';
import { HealthBadge, getHealthStatus, STATUS_COLORS } from './HealthBadge';
import { logInteraction } from '../../api/client';
import { MetricTooltip } from './MetricTooltip';
import { formatValue, formatDelta } from '../../lib/format';

interface MetricTileProps {
  metric: MetricConfig;
  value: MetricValue;
  userId?: string;
  onClick?: () => void;
}

export function MetricTile({ metric, value, userId, onClick }: MetricTileProps) {
  const status = getHealthStatus(value.current, metric.thresholds);
  const deltaPositive = value.delta >= 0;
  const deltaColor = deltaPositive ? 'text-emerald-600' : 'text-red-600';
  const trendLabel = deltaPositive ? 'vs prior period' : 'vs prior period';

  const sparkData = value.trend.map((v, i) => ({ i, v }));

  const strokeColor =
    status === 'healthy'
      ? '#10b981'
      : status === 'warning'
      ? '#f59e0b'
      : '#ef4444';

  const handleClick = () => {
    if (userId) {
      logInteraction({
        userId,
        metricId: metric.id,
        action: 'click',
        timestamp: new Date().toISOString(),
      });
    }
    onClick?.();
  };

  const target = metric.thresholds.green.max;

  return (
    <MetricTooltip metric={metric}>
    <div
      onClick={handleClick}
      className="metric-card cursor-pointer p-5"
    >
      <div className={`metric-card-accent ${STATUS_COLORS[status].accent}`} />

      <div className="pl-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {metric.label}
          </span>
          <HealthBadge value={value.current} thresholds={metric.thresholds} />
        </div>

        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-3xl font-bold tracking-tight text-slate-900">
            {formatValue(value.current, metric.unit)}
          </span>
        </div>

        {/* Trend indicator with direction arrow and label */}
        <div className="mt-1.5 flex items-center gap-2">
          <span className={`flex items-center gap-1 text-sm font-semibold ${deltaColor}`}>
            <svg className={`h-3.5 w-3.5 ${deltaPositive ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
            {formatDelta(value.delta)}
          </span>
          <span className="text-[10px] font-medium text-slate-400">{trendLabel}</span>
        </div>

        {/* Target comparison */}
        {target > 0 && (
          <div className="mt-2 flex items-center gap-2 text-[10px] font-medium text-slate-400">
            <span>Target: {formatValue(target, metric.unit)}</span>
            <div className="h-px flex-1 bg-slate-100" />
          </div>
        )}

        {sparkData.length > 1 && (
          <div className="mt-2 h-12">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparkData}>
                <defs>
                  <linearGradient id={`fill-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={strokeColor} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={strokeColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={strokeColor}
                  strokeWidth={1.5}
                  fill={`url(#fill-${metric.id})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
    </MetricTooltip>
  );
}
