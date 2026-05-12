import { useEffect, useState } from 'react';
import type { MetricConfig, FilterState, TopNSnapshot, TopNDimension } from 'shared/types';
import { getTopN } from '../../api/client';
import { formatValue } from '../../lib/format';

interface TopNTileProps {
  metric: MetricConfig;
  filters?: FilterState;
  onClick?: () => void;
}

const DIM_LABELS: Record<TopNDimension, string> = {
  supplier: 'Supplier',
  customer: 'Customer',
  sku: 'SKU',
  warehouse: 'Warehouse',
  carrier: 'Carrier',
  category: 'Category',
};

export function TopNTile({ metric, filters, onClick }: TopNTileProps) {
  const [snapshot, setSnapshot] = useState<TopNSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dimension: TopNDimension = metric.topN?.dimension ?? 'supplier';
  const n = metric.topN?.n ?? 10;
  const ascending = metric.topN?.ascending ?? false;

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    getTopN(metric.id, dimension, n, ascending, filters)
      .then(s => { if (!cancelled) setSnapshot(s); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [metric.id, dimension, n, ascending, JSON.stringify(filters)]);

  return (
    <div onClick={onClick} className="metric-card cursor-pointer p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {ascending ? 'Bottom' : 'Top'} {n} {DIM_LABELS[dimension]}{n === 1 ? '' : 's'} — {metric.label}
        </span>
      </div>

      {error && <div className="mt-3 text-xs text-red-500">{error}</div>}
      {!error && !snapshot && <div className="mt-3 text-xs text-slate-400">Loading…</div>}
      {snapshot && snapshot.rows.length === 0 && (
        <div className="mt-3 text-xs text-slate-400">No data for this slice.</div>
      )}

      {snapshot && snapshot.rows.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {snapshot.rows.map(row => (
            <div key={row.id} className="flex items-center gap-3 text-xs">
              <span className="w-5 text-right font-mono text-slate-400">{row.rank}.</span>
              <span className="flex-1 truncate font-medium text-slate-700" title={row.label}>{row.label}</span>
              <div className="relative h-5 flex-1 max-w-[160px] rounded bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded bg-accent/70"
                  style={{ width: `${Math.max(2, row.share * 100)}%` }}
                />
              </div>
              <span className="w-20 text-right font-mono font-semibold text-slate-800">
                {formatValue(row.value, metric.unit)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
