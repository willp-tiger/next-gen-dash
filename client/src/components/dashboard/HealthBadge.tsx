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

  // higher-is-better: green.max is the minimum for healthy
  if (value >= green.max) return 'healthy';
  if (value >= yellow.max) return 'warning';
  return 'critical';
}

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
    <span className={STATUS_STYLES[status]}>{STATUS_LABELS[status]}</span>
  );
}
