import type { MetricConfig, MetricValue } from 'shared/types';
import { HealthBadge, getHealthStatus } from './HealthBadge';
import { logInteraction } from '../../api/client';
import { MetricTooltip } from './MetricTooltip';

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
  const deltaArrow = deltaPositive ? '\u2191' : '\u2193';

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

  const angle = percent * 180;
  const strokeColor =
    status === 'healthy' ? '#10b981' : status === 'warning' ? '#f59e0b' : '#ef4444';

  // SVG arc path for semicircle gauge
  const cx = 60, cy = 60, r = 50;
  const startAngle = Math.PI; // left
  const endAngle = startAngle - (angle * Math.PI) / 180;

  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = angle > 180 ? 1 : 0;

  const arcPath = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`;

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

      {/* Gauge */}
      <div className="mt-2 flex justify-center">
        <svg width="120" height="70" viewBox="0 0 120 70">
          {/* Background arc */}
          <path
            d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 0 ${cx + r} ${cy}`}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Value arc */}
          {angle > 0.5 && (
            <path
              d={arcPath}
              fill="none"
              stroke={strokeColor}
              strokeWidth="8"
              strokeLinecap="round"
            />
          )}
          {/* Center value */}
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            className="fill-gray-900 text-lg font-bold"
            fontSize="18"
            fontWeight="700"
          >
            {value.current % 1 === 0 ? value.current : value.current.toFixed(1)}
          </text>
          <text
            x={cx}
            y={cy + 8}
            textAnchor="middle"
            className="fill-gray-400"
            fontSize="10"
          >
            {metric.unit}
          </text>
        </svg>
      </div>

      {/* Delta */}
      <div className="mt-1 text-center">
        <span className={`text-sm font-medium ${deltaColor}`}>
          {deltaArrow} {Math.abs(value.delta).toFixed(1)}%
        </span>
      </div>
    </div>
    </MetricTooltip>
  );
}
