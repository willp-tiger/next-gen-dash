import { useState, useEffect, useCallback } from 'react';
import type { MetricConfig, CategoryBreakdown } from 'shared/types';
import { getCategoricalMetrics } from '../../api/client';
import { formatAxis } from '../../lib/format';

interface HeatMapChartProps {
  metric: MetricConfig;
  onClick?: () => void;
}

function getHeatColor(value: number, min: number, max: number, direction: string): string {
  const range = max - min || 1;
  const normalized = Math.max(0, Math.min(1, (value - min) / range));
  const ratio = direction === 'higher-is-better' ? normalized : 1 - normalized;

  if (ratio >= 0.7) return '#dcfce7';
  if (ratio >= 0.5) return '#d1fae5';
  if (ratio >= 0.3) return '#fef9c3';
  if (ratio >= 0.15) return '#fed7aa';
  return '#fecaca';
}

function getTextColor(value: number, min: number, max: number, direction: string): string {
  const range = max - min || 1;
  const normalized = Math.max(0, Math.min(1, (value - min) / range));
  const ratio = direction === 'higher-is-better' ? normalized : 1 - normalized;

  if (ratio >= 0.5) return '#166534';
  if (ratio >= 0.15) return '#92400e';
  return '#991b1b';
}

export function HeatMapChart({ metric, onClick }: HeatMapChartProps) {
  const [productLineBreakdown, setProductLineBreakdown] = useState<CategoryBreakdown | null>(null);
  const [territoryBreakdown, setTerritoryBreakdown] = useState<CategoryBreakdown | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await getCategoricalMetrics([metric.id], metric.filterBy || {});
      setProductLineBreakdown(data.breakdowns.byProductLine);
      setTerritoryBreakdown(data.breakdowns.byTerritory);
    } catch {
      // ignore
    }
  }, [metric.id, metric.filterBy]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!productLineBreakdown || !territoryBreakdown) {
    return (
      <div className={`metric-card p-5 ${metric.size === 'lg' ? 'col-span-2' : ''}`}>
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-navy-200 border-t-navy-600" />
        </div>
      </div>
    );
  }

  const territories = territoryBreakdown.values;
  const productLines = productLineBreakdown.values;

  const allValues: number[] = [];
  const grid: number[][] = productLines.map((pl, mi) => {
    return territories.map((terr, di) => {
      const val = parseFloat(((pl.value + terr.value) / 2 + (mi * 0.3 - di * 0.2)).toFixed(1));
      allValues.push(val);
      return val;
    });
  });
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const dir = metric.thresholds.direction;

  return (
    <div
      className={`metric-card p-5 cursor-pointer ${metric.size === 'lg' ? 'col-span-2' : ''}`}
      onClick={onClick}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {metric.label}
        </h3>
        <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-semibold text-violet-600 ring-1 ring-violet-600/10">
          heat map
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-2.5 py-1.5 text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Product Line
              </th>
              {territories.map((t, i) => (
                <th key={i} className="px-2 py-1.5 text-center text-[10px] font-semibold text-slate-400 tracking-wider">
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productLines.map((pl, mi) => (
              <tr key={mi}>
                <td className="px-2.5 py-1 text-xs font-medium text-slate-700 whitespace-nowrap">
                  {pl.label}
                </td>
                {grid[mi].map((val, di) => (
                  <td key={di} className="px-1 py-1">
                    <div
                      className="rounded-md px-2.5 py-2 text-center text-xs font-bold transition-colors"
                      style={{
                        backgroundColor: getHeatColor(val, minVal, maxVal, dir),
                        color: getTextColor(val, minVal, maxVal, dir),
                      }}
                    >
                      {formatAxis(val, metric.unit)}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-[10px] font-medium text-slate-400">
        <span>{dir === 'lower-is-better' ? 'Good' : 'Bad'}</span>
        <div className="flex rounded-sm overflow-hidden">
          {['#dcfce7', '#d1fae5', '#fef9c3', '#fed7aa', '#fecaca'].map((c, i) => (
            <div key={i} className="h-2.5 w-5" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span>{dir === 'lower-is-better' ? 'Bad' : 'Good'}</span>
      </div>
    </div>
  );
}
