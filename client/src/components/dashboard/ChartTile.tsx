import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { MetricConfig, MetricValue } from 'shared/types';
import { HealthBadge, getHealthStatus } from './HealthBadge';
import { logInteraction } from '../../api/client';

interface ChartTileProps {
  metric: MetricConfig;
  value: MetricValue;
  userId?: string;
  onClick?: () => void;
}

const STATUS_COLORS = {
  healthy: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export function ChartTile({ metric, value, userId, onClick }: ChartTileProps) {
  const status = getHealthStatus(value.current, metric.thresholds);
  const color = STATUS_COLORS[status];
  const data = value.trend.map((v, i) => ({ i, v }));

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

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 4, right: 4, bottom: 4, left: 4 },
    };

    switch (metric.chartType) {
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <XAxis dataKey="i" hide />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #e5e7eb',
              }}
              labelFormatter={() => ''}
              formatter={(val: number) => [
                `${val}${metric.unit ? ' ' + metric.unit : ''}`,
                metric.label,
              ]}
            />
            <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} />
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id={`chart-fill-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="i" hide />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #e5e7eb',
              }}
              labelFormatter={() => ''}
              formatter={(val: number) => [
                `${val}${metric.unit ? ' ' + metric.unit : ''}`,
                metric.label,
              ]}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              fill={`url(#chart-fill-${metric.id})`}
            />
          </AreaChart>
        );
      case 'line':
      default:
        return (
          <LineChart {...commonProps}>
            <XAxis dataKey="i" hide />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: '1px solid #e5e7eb',
              }}
              labelFormatter={() => ''}
              formatter={(val: number) => [
                `${val}${metric.unit ? ' ' + metric.unit : ''}`,
                metric.label,
              ]}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        );
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`cursor-pointer rounded-xl bg-white p-5 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md ${
        metric.size === 'lg' ? 'col-span-2' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
          {metric.label}
        </span>
        <HealthBadge value={value.current} thresholds={metric.thresholds} />
      </div>

      {/* Current value */}
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">
          {value.current % 1 === 0
            ? value.current
            : value.current.toFixed(1)}
        </span>
        <span className="text-sm text-gray-400">{metric.unit}</span>
      </div>

      {/* Chart */}
      <div className="mt-3 h-40">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
