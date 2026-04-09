import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { MetricConfig, FilterState, CategoryBreakdown } from 'shared/types';
import { getCategoricalMetrics } from '../../api/client';

interface BreakdownChartProps {
  metric: MetricConfig;
  onClick?: () => void;
}

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#4f46e5'];

export function BreakdownChart({ metric, onClick }: BreakdownChartProps) {
  const [breakdown, setBreakdown] = useState<CategoryBreakdown | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await getCategoricalMetrics(
        [metric.id],
        metric.filterBy || {}
      );
      const dim = metric.breakdownBy || 'make';
      const bd = dim === 'make'
        ? data.breakdowns.byMake
        : dim === 'model'
        ? data.breakdowns.byModel
        : data.breakdowns.byDate;
      setBreakdown(bd);
    } catch {
      // ignore
    }
  }, [metric.id, metric.breakdownBy, metric.filterBy]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const dimLabel = metric.breakdownBy === 'date' ? 'Date' : metric.breakdownBy === 'model' ? 'Model' : 'Make';
  const filterLabel = metric.filterBy?.make ? ` (${metric.filterBy.make})` : '';
  const isLarge = metric.size === 'lg';

  return (
    <div
      className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md cursor-pointer ${
        isLarge ? 'col-span-2' : ''
      }`}
      onClick={onClick}
    >
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {metric.label}
        </h3>
        <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
          by {dimLabel}{filterLabel}
        </span>
      </div>

      {breakdown ? (
        <ResponsiveContainer width="100%" height={isLarge ? 220 : 160}>
          <BarChart
            data={breakdown.values}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
          >
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={metric.breakdownBy === 'date' ? -35 : 0}
              textAnchor={metric.breakdownBy === 'date' ? 'end' : 'middle'}
              height={metric.breakdownBy === 'date' ? 50 : 30}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              formatter={(value: number) => [value.toFixed(1), metric.unit]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {breakdown.values.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-32 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        </div>
      )}
    </div>
  );
}
