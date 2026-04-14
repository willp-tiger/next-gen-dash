import type { MetricConfig, MetricValue } from 'shared/types';
import { HealthBadge, getHealthStatus } from './HealthBadge';
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

  // Calculate gauge angle (semicircle: 0 to 180 degrees)
  const { green, yellow, direction } = metric.thresholds;
  let percent: number;
  if (direction === 'higher-is-better') {
    // 0% at 0, 100% at green.max (or beyond)
    const max = green.max > 0 ? green.max * 1.1 : 100;
    percent = Math.min(value.current / max, 1);
  } else {
    // Invert: low values = high fill
    const max = yellow.max > 0 ? yellow.max * 1.5 : 100;
    percent = Math.max(1 - value.current / max, 0);
  }

  const strokeColor =
    status === 'healthy' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';

  // SVG semicircle gauge. The arc sweeps from the left (9 o'clock) over the
  // top (12 o'clock) to the right (3 o'clock). SVG's y-axis points DOWN, so
  // positions on the upper half of the circle have y < cy (not y > cy).
  //
  // At proportion p ∈ [0, 1], the traced point is at math-angle π(1-p)
  // measured from +x. The SVG coordinate is:
  //   x = cx + r·cos(θ)
  //   y = cy − r·sin(θ)   // minus because SVG y grows downward
  //
  // Sweep-flag = 1 (clockwise in screen space) traces from 9 → 12 → 3, which
  // is the "over the top" path. Sweep-flag = 0 would route under the bottom.
  const viewW = 200, viewH = 120;
  const cx = 100, cy = 100, r = 80;

  const startX = cx - r;
  const startY = cy;
  const theta = Math.PI * (1 - percent);
  const endX = cx + r * Math.cos(theta);
  const endY = cy - r * Math.sin(theta);
  const largeArc = percent > 0.5 ? 1 : 0;

  const arcPath = `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`;
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
      className="cursor-pointer rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {metric.label}
        </span>
        <HealthBadge value={value.current} thresholds={metric.thresholds} />
      </div>

      {/* Gauge — SVG arc with HTML value overlay for reliable text rendering.
          Fixed-aspect container so overlay percentages map predictably. */}
      <div className="mx-auto mt-3 w-full max-w-[220px]">
        <div className="relative" style={{ aspectRatio: `${viewW} / ${viewH}` }}>
          <svg
            viewBox={`0 0 ${viewW} ${viewH}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full"
          >
            {/* Background arc — full semicircle over the top */}
            <path
              d={bgPath}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="12"
              strokeLinecap="round"
            />
            {/* Value arc — partial sweep from left toward right, over the top */}
            {percent > 0.005 && (
              <path
                d={arcPath}
                fill="none"
                stroke={strokeColor}
                strokeWidth="12"
                strokeLinecap="round"
              />
            )}
          </svg>
          {/* Value overlay — centered horizontally, positioned inside the upper
              semicircle of the arc (arc's diameter is at ~83% from top). */}
          <div
            className="pointer-events-none absolute inset-x-0 flex flex-col items-center"
            style={{ top: '48%' }}
          >
            <span className="text-2xl font-bold leading-none text-gray-900">
              {formatValue(value.current, metric.unit)}
            </span>
            <span className={`mt-1 text-xs font-medium ${deltaColor}`}>
              {formatDelta(value.delta)}
            </span>
          </div>
        </div>
      </div>
    </div>
    </MetricTooltip>
  );
}
