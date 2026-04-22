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
          <span className={`flex items-center gap-0.5 text-sm font-semibold ${deltaColor}`}>
            {formatDelta(value.delta)}
          </span>
        </div>

        {sparkData.length > 1 && (
          <div className="mt-3 h-12">
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
