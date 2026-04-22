import type { MetricConfig, MetricValue } from 'shared/types';
import { HealthBadge, getHealthStatus, STATUS_COLORS } from './HealthBadge';
import { logInteraction } from '../../api/client';
import { MetricTooltip } from './MetricTooltip';
import { formatValue, formatDelta } from '../../lib/format';

interface GaugeTileProps {
  metric: MetricConfig;
  value: MetricValue;
  userId?: string;
  onClick?: () => void;
}

export function GaugeTile({ metric, value, userId, onClick }: GaugeTileProps) {
  const status = getHealthStatus(value.current, metric.thresholds);
  const deltaPositive = value.delta >= 0;
  const deltaColor = deltaPositive ? 'text-emerald-600' : 'text-red-600';

  const { green, yellow, direction } = metric.thresholds;
  let percent: number;
  if (direction === 'higher-is-better') {
    const max = green.max > 0 ? green.max * 1.1 : 100;
    percent = Math.min(value.current / max, 1);
  } else {
    const max = yellow.max > 0 ? yellow.max * 1.5 : 100;
    percent = Math.max(1 - value.current / max, 0);
  }

  const strokeColor =
    status === 'healthy' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';

  const viewW = 200, viewH = 120;
  const cx = 100, cy = 100, r = 80;

  const startX = cx - r;
  const startY = cy;
  const theta = Math.PI * (1 - percent);
  const endX = cx + r * Math.cos(theta);
  const endY = cy - r * Math.sin(theta);
  const arcPath = `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`;
  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy}`;

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

        <div className="mx-auto mt-3 w-full max-w-[220px]">
          <div className="relative" style={{ aspectRatio: `${viewW} / ${viewH}` }}>
            <svg
              viewBox={`0 0 ${viewW} ${viewH}`}
              preserveAspectRatio="xMidYMid meet"
              className="absolute inset-0 h-full w-full"
            >
              <path
                d={bgPath}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="14"
                strokeLinecap="round"
              />
              {percent > 0.005 && (
                <path
                  d={arcPath}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="14"
                  strokeLinecap="round"
                />
              )}
            </svg>
            <div
              className="pointer-events-none absolute inset-x-0 flex flex-col items-center"
              style={{ top: '48%' }}
            >
              <span className="text-2xl font-bold leading-none tracking-tight text-slate-900">
                {formatValue(value.current, metric.unit)}
              </span>
              <span className={`mt-1 text-xs font-semibold ${deltaColor}`}>
                {formatDelta(value.delta)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    </MetricTooltip>
  );
}
