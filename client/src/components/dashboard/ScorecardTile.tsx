import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import type { MetricConfig, MetricValue } from 'shared/types';
import { HealthBadge, getHealthStatus, STATUS_COLORS } from './HealthBadge';
import { logInteraction } from '../../api/client';
import { MetricTooltip } from './MetricTooltip';
import { formatValue } from '../../lib/format';

interface ScorecardTileProps {
  metric: MetricConfig;
  value: MetricValue;
  userId?: string;
  onClick?: () => void;
}

const STROKE: Record<string, string> = {
  healthy: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
};

/**
 * Scorecard widget — number + sparkline + comparison badge + target track.
 *
 * Falls back to "vs prior period" (the previous trend point) when the server hasn't
 * supplied an explicit `comparison` block (which only fires when compareTo + a date
 * range are both set).
 */
export function ScorecardTile({ metric, value, userId, onClick }: ScorecardTileProps) {
  const status = getHealthStatus(value.current, metric.thresholds);
  const stroke = STROKE[status];
  const sparkData = value.trend.map((v, i) => ({ i, v }));
  const target = metric.target ?? metric.thresholds.green.max;

  const comparison = value.comparison;
  const directionGood = metric.thresholds.direction;
  const isGood = (delta: number) => directionGood === 'lower-is-better' ? delta <= 0 : delta >= 0;

  const cmpDelta = comparison?.deltaPct ?? value.delta;
  const cmpAbs = comparison?.deltaAbs;
  const cmpLabel = comparison?.basisLabel ?? 'vs prior period';
  const good = isGood(cmpDelta);
  const arrow = cmpDelta >= 0 ? '↑' : '↓';

  // Target progress (only meaningful when a positive target exists)
  const targetPct = target > 0
    ? Math.max(0, Math.min(100, directionGood === 'lower-is-better'
        ? (1 - Math.min(value.current / target, 1.5)) * 100 + 100  // heuristic for lower-is-better
        : (value.current / target) * 100))
    : 0;
  const showTargetBar = target > 0 && directionGood === 'higher-is-better';

  const handleClick = () => {
    if (userId) {
      logInteraction({
        userId, metricId: metric.id, action: 'click', timestamp: new Date().toISOString(),
      });
    }
    onClick?.();
  };

  return (
    <MetricTooltip metric={metric}>
      <div onClick={handleClick} className="metric-card cursor-pointer p-5">
        <div className={`metric-card-accent ${STATUS_COLORS[status].accent}`} />
        <div className="pl-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {metric.label}
            </span>
            <HealthBadge value={value.current} thresholds={metric.thresholds} />
          </div>

          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-3xl font-bold tracking-tight text-slate-900">
              {formatValue(value.current, metric.unit)}
            </span>
            <span className={`flex items-center gap-1 text-sm font-semibold ${good ? 'text-emerald-600' : 'text-red-600'}`}>
              <span aria-hidden>{arrow}</span>
              {Math.abs(cmpDelta).toFixed(1)}%
            </span>
          </div>

          <div className="mt-1 flex items-center gap-2 text-[10px] font-medium text-slate-400">
            <span>{cmpLabel}</span>
            {comparison && (
              <>
                <span>•</span>
                <span>was {formatValue(comparison.previous, metric.unit)}</span>
                {cmpAbs !== undefined && (
                  <>
                    <span>•</span>
                    <span>{cmpAbs >= 0 ? '+' : ''}{formatValue(cmpAbs, metric.unit)}</span>
                  </>
                )}
              </>
            )}
          </div>

          {/* Target progress bar (higher-is-better only — lower-is-better targets read inversely) */}
          {showTargetBar && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
                <span>Target {formatValue(target, metric.unit)}</span>
                <span>{targetPct.toFixed(0)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${status === 'healthy' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, targetPct)}%` }}
                />
              </div>
            </div>
          )}

          {/* For lower-is-better, show a simple "vs target" line */}
          {!showTargetBar && target > 0 && (
            <div className="mt-2 text-[10px] font-medium text-slate-400">
              Target ≤ {formatValue(target, metric.unit)}
            </div>
          )}

          {sparkData.length > 1 && (
            <div className="mt-3 h-12">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData}>
                  <defs>
                    <linearGradient id={`sc-fill-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke={stroke}
                    strokeWidth={1.5}
                    fill={`url(#sc-fill-${metric.id})`}
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
