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
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import type { MetricConfig, MetricValue } from 'shared/types';
import { HealthBadge, getHealthStatus, STATUS_COLORS } from './HealthBadge';
import { logInteraction } from '../../api/client';
import { MetricTooltip } from './MetricTooltip';
import { formatValue, formatDelta } from '../../lib/format';

interface ChartTileProps {
  metric: MetricConfig;
  value: MetricValue;
  userId?: string;
  onClick?: () => void;
}

const STATUS_STROKE: Record<string, string> = {
  healthy: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
};

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: 'none',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '8px 12px',
};

export function ChartTile({ metric, value, userId, onClick }: ChartTileProps) {
  const status = getHealthStatus(value.current, metric.thresholds);
  const color = STATUS_STROKE[status];
  const data = value.trend.map((v, i) => ({ period: `Q${(i % 4) + 1}`, v }));
  const deltaPositive = value.delta >= 0;
  const isGoodDelta = metric.thresholds.direction === 'lower-is-better' ? value.delta <= 0 : value.delta >= 0;
  const deltaColor = isGoodDelta ? 'text-emerald-600' : 'text-red-600';

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
      margin: { top: 8, right: 12, bottom: 4, left: -10 },
    };

    const grid = (
      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
    );

    switch (metric.chartType) {
      case 'bar':
        return (
          <BarChart {...commonProps}>
            {grid}
            <XAxis
              dataKey="period"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={() => ''}
              formatter={(val: number) => [
                formatValue(val, metric.unit),
                metric.label,
              ]}
            />
            <Bar dataKey="v" fill={color} radius={[4, 4, 0, 0]} barSize={20} />
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id={`chart-fill-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            {grid}
            <XAxis
              dataKey="period"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={() => ''}
              formatter={(val: number) => [
                formatValue(val, metric.unit),
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
            {grid}
            <XAxis
              dataKey="period"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={() => ''}
              formatter={(val: number) => [
                formatValue(val, metric.unit),
                metric.label,
              ]}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }}
            />
          </LineChart>
        );
    }
  };

  return (
    <MetricTooltip metric={metric}>
    <div
      onClick={handleClick}
      className={`metric-card cursor-pointer p-5 ${
        metric.size === 'lg' ? 'col-span-2' : ''
      }`}
    >
      <div className={`metric-card-accent ${STATUS_COLORS[status].accent}`} />

      <div className="pl-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {metric.label}
          </span>
          <HealthBadge value={value.current} thresholds={metric.thresholds} />
        </div>

        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            {formatValue(value.current, metric.unit)}
          </span>
          <span className={`text-sm font-semibold ${deltaColor}`}>
            {formatDelta(value.delta)}
          </span>
        </div>

        <div className="mt-3 h-40">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
    </MetricTooltip>
  );
}
