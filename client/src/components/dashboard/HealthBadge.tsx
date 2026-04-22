import type { ThresholdConfig, HealthStatus } from 'shared/types';

interface HealthBadgeProps {
  value: number;
  thresholds: ThresholdConfig;
}

export function getHealthStatus(
  value: number,
  thresholds: ThresholdConfig
): HealthStatus {
  const { green, yellow, direction } = thresholds;

  if (direction === 'lower-is-better') {
    if (value <= green.max) return 'healthy';
    if (value <= yellow.max) return 'warning';
    return 'critical';
  }

  if (value >= green.max) return 'healthy';
  if (value >= yellow.max) return 'warning';
  return 'critical';
}

export const STATUS_COLORS: Record<HealthStatus, { accent: string; dot: string }> = {
  healthy: { accent: 'bg-emerald-500', dot: 'bg-emerald-500' },
  warning: { accent: 'bg-amber-500', dot: 'bg-amber-500' },
  critical: { accent: 'bg-red-500', dot: 'bg-red-500' },
};

const STATUS_STYLES: Record<HealthStatus, string> = {
  healthy: 'health-badge health-badge-healthy',
  warning: 'health-badge health-badge-warning',
  critical: 'health-badge health-badge-critical',
};

const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  critical: 'Critical',
};

export function HealthBadge({ value, thresholds }: HealthBadgeProps) {
  const status = getHealthStatus(value, thresholds);

  return (
    <span className={STATUS_STYLES[status]}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[status].dot}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
