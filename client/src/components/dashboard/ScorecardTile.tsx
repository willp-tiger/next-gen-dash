import { AreaChart, Area, ResponsiveContainer, ReferenceLine, YAxis } from 'recharts';
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
 * Three deltas can stack here:
 *   - vs prior period / year (from MetricValue.comparison.deltaPct or value.deltaPct fallback)
 *   - vs target (when MetricConfig.target is set — Director-facing "vs commitment")
 *   - the sparkline reference line at target
 */
export function ScorecardTile({ metric, value, userId, onClick }: ScorecardTileProps) {
  const status = getHealthStatus(value.current, metric.thresholds);
  const stroke = STROKE[status];
  const sparkData = value.trend.map((v, i) => ({ i, v }));
  const target = metric.target ?? metric.thresholds.green.max;
  const hasExplicitTarget = metric.target !== undefined;

  const comparison = value.comparison;
  const direction = metric.thresholds.direction;
  const isGood = (delta: number) => direction === 'lower-is-better' ? delta <= 0 : delta >= 0;

  const cmpDelta = comparison?.deltaPct ?? value.deltaPct;
  const cmpAbs = comparison?.deltaAbs;
  const cmpLabel = comparison?.basisLabel ?? 'vs prior period';
  const good = isGood(cmpDelta);
  const arrow = cmpDelta >= 0 ? '↑' : '↓';

  // Target delta — only computed when a positive target exists.
  const targetDelta = target > 0
    ? {
        abs: value.current - target,
        good: direction === 'lower-is-better' ? value.current <= target : value.current >= target,
      }
    : null;

  // Target progress (only meaningful when a positive target exists)
  const targetPct = target > 0
    ? Math.max(0, Math.min(100, direction === 'lower-is-better'
        ? (1 - Math.min(value.current / target, 1.5)) * 100 + 100
        : (value.current / target) * 100))
    : 0;
  const showTargetBar = target > 0 && direction === 'higher-is-better';

  // Sparkline Y-range — extend to include the target so the reference line is visible.
  const sparkValues = value.trend.length > 0 ? value.trend : [value.current];
  const yMin = Math.min(...sparkValues, target > 0 ? target : Infinity);
  const yMax = Math.max(...sparkValues, target > 0 ? target : -Infinity);
  const yPad = (yMax - yMin) * 0.08 || 1;

  const noteCount = metric.notes?.length ?? 0;

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
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {metric.label}
            </span>
            <div className="flex items-center gap-1.5">
              {noteCount > 0 && (
                <span
                  title={`${noteCount} pinned note${noteCount === 1 ? '' : 's'}`}
                  className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 ring-1 ring-amber-200"
                >
                  <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5.05 3.05a7 7 0 119.9 9.9L10 17.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" />
                  </svg>
                  {noteCount}
                </span>
              )}
              <HealthBadge value={value.current} thresholds={metric.thresholds} />
            </div>
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

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-medium text-slate-400">
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

          {/* vs target delta — surfaced when MetricConfig.target is explicitly set */}
          {hasExplicitTarget && targetDelta && (
            <div className="mt-1 flex items-center gap-1.5 text-[10px] font-medium">
              <span className={`font-semibold ${targetDelta.good ? 'text-emerald-600' : 'text-red-600'}`}>
                {targetDelta.abs >= 0 ? '+' : ''}{formatValue(targetDelta.abs, metric.unit)}
              </span>
              <span className="text-slate-400">vs target {formatValue(target, metric.unit)}</span>
            </div>
          )}

          {/* Target progress bar (higher-is-better only — lower-is-better targets read inversely) */}
          {showTargetBar && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[10px] font-medium text-slate-400">
                <span>{hasExplicitTarget ? 'Target' : 'Healthy'} {formatValue(target, metric.unit)}</span>
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

          {/* For lower-is-better with no explicit target, show a simple "vs target" line */}
          {!showTargetBar && target > 0 && !hasExplicitTarget && (
            <div className="mt-2 text-[10px] font-medium text-slate-400">
              Target ≤ {formatValue(target, metric.unit)}
            </div>
          )}

          {sparkData.length > 1 && (
            <div className="mt-3 h-12">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`sc-fill-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={stroke} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={[yMin - yPad, yMax + yPad]} />
                  {target > 0 && Number.isFinite(yMin) && Number.isFinite(yMax) && (
                    <ReferenceLine
                      y={target}
                      stroke="#94a3b8"
                      strokeDasharray="3 3"
                      strokeOpacity={0.7}
                    />
                  )}
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
