import { useEffect, useState } from 'react';
import type { MetricConfig, FilterState, FunnelSnapshot } from 'shared/types';
import { getFunnel } from '../../api/client';

interface FunnelTileProps {
  metric: MetricConfig;
  filters?: FilterState;
  onClick?: () => void;
}

const STAGE_COLORS = ['#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e'];

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function FunnelTile({ metric, filters, onClick }: FunnelTileProps) {
  const [snapshot, setSnapshot] = useState<FunnelSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    getFunnel('shipment_lifecycle', filters)
      .then(s => { if (!cancelled) setSnapshot(s); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [JSON.stringify(filters)]);

  const stages = snapshot?.stages ?? [];
  const top = stages[0]?.count || 0;

  return (
    <div onClick={onClick} className="metric-card cursor-pointer p-5 col-span-1 lg:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {metric.label || 'Shipment lifecycle funnel'}
        </span>
        {top > 0 && (
          <span className="text-[10px] text-slate-400">
            {fmtCount(top)} shipments in window
          </span>
        )}
      </div>

      {error && <div className="mt-3 text-xs text-red-500">{error}</div>}
      {!error && stages.length === 0 && <div className="mt-3 text-xs text-slate-400">Loading…</div>}

      {stages.length > 0 && (
        <div className="mt-4 space-y-2">
          {stages.map((stage, i) => {
            const pct = top > 0 ? (stage.count / top) * 100 : 0;
            const drop = i === 0
              ? 0
              : (stages[i - 1].count > 0 ? ((stages[i - 1].count - stage.count) / stages[i - 1].count) * 100 : 0);
            return (
              <div key={stage.stage}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-700">{stage.stage}</span>
                  <span className="flex items-center gap-3 text-slate-500">
                    <span className="font-mono font-semibold text-slate-800">{fmtCount(stage.count)}</span>
                    <span className="w-12 text-right">{pct.toFixed(1)}%</span>
                    {i > 0 && (
                      <span className={`w-20 text-right text-[10px] font-semibold ${drop > 10 ? 'text-red-600' : drop > 3 ? 'text-amber-600' : 'text-slate-400'}`}>
                        −{drop.toFixed(1)}% drop
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1 flex justify-center">
                  <div
                    className="h-6 rounded transition-all"
                    style={{
                      width: `${Math.max(2, pct)}%`,
                      background: STAGE_COLORS[i] ?? STAGE_COLORS[STAGE_COLORS.length - 1],
                    }}
                    title={`${stage.stage}: ${stage.count} (${pct.toFixed(1)}%)`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {stages.length > 0 && top > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px]">
          <span className="text-slate-400">End-to-end conversion</span>
          <span className="font-bold text-slate-700">
            {((stages[stages.length - 1].count / top) * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
