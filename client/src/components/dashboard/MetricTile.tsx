import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import type { MetricConfig, MetricValue } from 'shared/types';
import { HealthBadge, getHealthStatus } from './HealthBadge';
import { logInteraction } from '../../api/client';

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
  const deltaArrow = deltaPositive ? '\u2191' : '\u2193';

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
    <div
      onClick={handleClick}
      className="cursor-pointer rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {metric.label}
        </span>
        <HealthBadge value={value.current} thresholds={metric.thresholds} />
      </div>

      {/* Value */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">
          {typeof value.current === 'number'
            ? value.current % 1 === 0
              ? value.current
              : value.current.toFixed(1)
            : value.current}
        </span>
        <span className="text-sm text-gray-400">{metric.unit}</span>
      </div>

      {/* Delta */}
      <div className="mt-1">
        <span className={`text-sm font-medium ${deltaColor}`}>
          {deltaArrow} {Math.abs(value.delta).toFixed(1)}%
        </span>
      </div>

      {/* Sparkline */}
      {sparkData.length > 1 && (
        <div className="mt-3 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id={`fill-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.2} />
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
  );
}
