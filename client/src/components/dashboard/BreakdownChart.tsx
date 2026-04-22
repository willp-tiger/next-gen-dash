import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Cell, LabelList } from 'recharts';
import type { MetricConfig, CategoryBreakdown } from 'shared/types';
import { getCategoricalMetrics } from '../../api/client';
import { formatValue, formatAxis } from '../../lib/format';

interface BreakdownChartProps {
  metric: MetricConfig;
  onClick?: () => void;
}

const COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#818cf8', '#4f46e5'];

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: 'none',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '8px 12px',
};

export function BreakdownChart({ metric, onClick }: BreakdownChartProps) {
  const [breakdown, setBreakdown] = useState<CategoryBreakdown | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await getCategoricalMetrics(
        [metric.id],
        metric.filterBy || {}
      );
      const dim = metric.breakdownBy || 'product_line';
      const bd = dim === 'product_line'
        ? data.breakdowns.byProductLine
        : dim === 'country'
        ? data.breakdowns.byCountry
        : data.breakdowns.byTerritory;
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

  const dimLabels: Record<string, string> = {
    product_line: 'Product Line',
    country: 'Country',
    territory: 'Territory',
    deal_size: 'Deal Size',
    quarter: 'Quarter',
  };
  const dimLabel = dimLabels[metric.breakdownBy || 'product_line'] || 'Product Line';
  const filterLabel = metric.filterBy?.product_line ? ` (${metric.filterBy.product_line})` : '';
  const isLarge = metric.size === 'lg';

  return (
    <div
      className={`metric-card p-5 cursor-pointer ${isLarge ? 'col-span-2' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {metric.label}
        </h3>
        <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-600 ring-1 ring-indigo-600/10">
          by {dimLabel}{filterLabel}
        </span>
      </div>

      {breakdown ? (
        <ResponsiveContainer width="100%" height={isLarge ? 220 : 170}>
          <BarChart
            data={breakdown.values}
            margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={breakdown.values.length > 5 ? -35 : 0}
              textAnchor={breakdown.values.length > 5 ? 'end' : 'middle'}
              height={breakdown.values.length > 5 ? 50 : 30}
            />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: 'rgba(99, 102, 241, 0.04)' }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: number) => [formatValue(value, metric.unit), metric.label]}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={28}>
              {breakdown.values.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v: number) => formatAxis(v, metric.unit)}
                style={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
              />
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
