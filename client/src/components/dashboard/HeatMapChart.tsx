import { useState, useEffect, useCallback } from 'react';
import type { MetricConfig, CategoryBreakdown } from 'shared/types';
import { getCategoricalMetrics } from '../../api/client';

interface HeatMapChartProps {
  metric: MetricConfig;
  onClick?: () => void;
}

function getHeatColor(value: number, min: number, max: number, direction: string): string {
  const range = max - min || 1;
  const normalized = Math.max(0, Math.min(1, (value - min) / range));
  // For lower-is-better: low values = green, high = red
  // For higher-is-better: high values = green, low = red
  const ratio = direction === 'higher-is-better' ? normalized : 1 - normalized;

  if (ratio >= 0.7) return '#dcfce7'; // green-100
  if (ratio >= 0.5) return '#d1fae5'; // emerald-100
  if (ratio >= 0.3) return '#fef9c3'; // yellow-100
  if (ratio >= 0.15) return '#fed7aa'; // orange-200
  return '#fecaca'; // red-200
}

function getTextColor(value: number, min: number, max: number, direction: string): string {
  const range = max - min || 1;
  const normalized = Math.max(0, Math.min(1, (value - min) / range));
  const ratio = direction === 'higher-is-better' ? normalized : 1 - normalized;

  if (ratio >= 0.5) return '#166534'; // green-800
  if (ratio >= 0.15) return '#92400e'; // amber-800
  return '#991b1b'; // red-800
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
      <div className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 ${metric.size === 'lg' ? 'col-span-2' : ''}`}>
        <div className="flex h-40 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        </div>
      </div>
    );
  }

  // Build heat map: rows = makes, columns = last 5 dates (trim for readability)
  const territories = territoryBreakdown.values;
  const productLines = productLineBreakdown.values;

  // Generate synthetic cross-values using make and date values
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
      className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md cursor-pointer ${metric.size === 'lg' ? 'col-span-2' : ''}`}
      onClick={onClick}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
          {metric.label}
        </h3>
        <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
          heat map
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-[10px] font-medium text-gray-400 uppercase">Product Line</th>
              {territories.map((t, i) => (
                <th key={i} className="px-2 py-1 text-center text-[10px] font-medium text-gray-400">
                  {t.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productLines.map((pl, mi) => (
              <tr key={mi}>
                <td className="px-2 py-1 text-xs font-medium text-gray-700 whitespace-nowrap">{pl.label}</td>
                {grid[mi].map((val, di) => (
                  <td key={di} className="px-1 py-1">
                    <div
                      className="rounded px-2 py-1.5 text-center text-xs font-semibold transition-colors"
                      style={{
                        backgroundColor: getHeatColor(val, minVal, maxVal, dir),
                        color: getTextColor(val, minVal, maxVal, dir),
                      }}
                    >
                      {val}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center justify-end gap-2 text-[10px] text-gray-400">
        <span>{dir === 'lower-is-better' ? 'Good' : 'Bad'}</span>
        <div className="flex">
          {['#dcfce7', '#d1fae5', '#fef9c3', '#fed7aa', '#fecaca'].map((c, i) => (
            <div key={i} className="h-2.5 w-5" style={{ backgroundColor: c }} />
          ))}
        </div>
        <span>{dir === 'lower-is-better' ? 'Bad' : 'Good'}</span>
      </div>
    </div>
  );
}
