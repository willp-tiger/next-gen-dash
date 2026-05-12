import { useEffect, useState } from 'react';
import type { MetricConfig, FilterState, PivotSnapshot, PivotDimension } from 'shared/types';
import { getPivot } from '../../api/client';
import { formatValue } from '../../lib/format';
import { MetricTooltip } from './MetricTooltip';

interface PivotTileProps {
  metric: MetricConfig;
  filters?: FilterState;
  onClick?: () => void;
}

const DIM_LABELS: Record<PivotDimension, string> = {
  category: 'SKU Category',
  destination_region: 'Destination Region',
  warehouse_id: 'Warehouse',
  customer_segment: 'Customer Segment',
  abc_class: 'ABC Class',
  supplier_tier: 'Supplier Tier',
};

/** Map a 0..1 normalized value to a heat color. Direction-aware: low-is-better inverts. */
function heatColor(t: number, direction: 'higher-is-better' | 'lower-is-better'): string {
  // Clamp + optional invert
  const x = Math.max(0, Math.min(1, t));
  const v = direction === 'lower-is-better' ? 1 - x : x;
  // Interpolate red(low) → amber(mid) → emerald(high) at fixed-opacity tints suitable for table cells.
  // We use rgb() with alpha applied via CSS so the table outline still shows through.
  if (v < 0.5) {
    // red → amber
    const k = v / 0.5;
    const r = Math.round(254 + (252 - 254) * k);
    const g = Math.round(226 + (211 - 226) * k);
    const b = Math.round(226 + (77  - 226) * k);
    return `rgba(${r},${g},${b},0.65)`;
  } else {
    // amber → emerald
    const k = (v - 0.5) / 0.5;
    const r = Math.round(252 + (209 - 252) * k);
    const g = Math.round(211 + (250 - 211) * k);
    const b = Math.round(77  + (229 - 77)  * k);
    return `rgba(${r},${g},${b},0.55)`;
  }
}

export function PivotTile({ metric, filters, onClick }: PivotTileProps) {
  const [snapshot, setSnapshot] = useState<PivotSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rowDim: PivotDimension = metric.pivot?.rowDim ?? 'destination_region';
  const colDim: PivotDimension = metric.pivot?.colDim ?? 'customer_segment';

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    getPivot(metric.id, rowDim, colDim, filters)
      .then(s => { if (!cancelled) setSnapshot(s); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [metric.id, rowDim, colDim, JSON.stringify(filters)]);

  return (
    <MetricTooltip metric={metric}>
      <div onClick={onClick} className="metric-card cursor-pointer p-5 col-span-1 lg:col-span-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {metric.label} — {DIM_LABELS[rowDim]} × {DIM_LABELS[colDim]}
          </span>
        </div>

        {error && <div className="mt-3 text-xs text-red-500">{error}</div>}
        {!error && !snapshot && <div className="mt-3 text-xs text-slate-400">Loading…</div>}
        {snapshot && snapshot.rowLabels.length === 0 && (
          <div className="mt-3 text-xs text-slate-400">No data for this slice.</div>
        )}

        {snapshot && snapshot.rowLabels.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {DIM_LABELS[rowDim]}
                  </th>
                  {snapshot.colLabels.map(c => (
                    <th key={c} className="px-2 py-1.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.rowLabels.map((rl, i) => (
                  <tr key={rl} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-semibold text-slate-700 whitespace-nowrap">{rl}</td>
                    {snapshot.colLabels.map((cl, j) => {
                      const v = snapshot.grid[i][j];
                      if (v === null) {
                        return <td key={cl} className="px-2 py-1.5 text-right text-slate-300">—</td>;
                      }
                      const range = snapshot.max - snapshot.min || 1;
                      const t = (v - snapshot.min) / range;
                      const bg = heatColor(t, metric.thresholds.direction);
                      return (
                        <td
                          key={cl}
                          className="px-2 py-1.5 text-right font-semibold text-slate-800 whitespace-nowrap"
                          style={{ background: bg }}
                        >
                          {formatValue(v, metric.unit)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {snapshot && (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
            <span className="h-2 w-12 rounded" style={{ background: `linear-gradient(to right, ${heatColor(0, metric.thresholds.direction)}, ${heatColor(0.5, metric.thresholds.direction)}, ${heatColor(1, metric.thresholds.direction)})` }} />
            <span>{formatValue(snapshot.min, metric.unit)} → {formatValue(snapshot.max, metric.unit)}</span>
          </div>
        )}
      </div>
    </MetricTooltip>
  );
}
