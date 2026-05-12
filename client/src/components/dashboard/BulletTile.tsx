import { useEffect, useState } from 'react';
import type { MetricConfig, FilterState, BulletSnapshot } from 'shared/types';
import { getBullet } from '../../api/client';
import { formatValue } from '../../lib/format';

interface BulletTileProps {
  metric: MetricConfig;
  filters?: FilterState;
  onClick?: () => void;
}

const BAND_COLOR: Record<BulletSnapshot['bands'][number]['color'], string> = {
  healthy: '#d1fae5',  // emerald-100
  warning: '#fef3c7',  // amber-100
  critical: '#fee2e2', // red-100
};

const BAND_BORDER: Record<BulletSnapshot['bands'][number]['color'], string> = {
  healthy: '#10b981',
  warning: '#f59e0b',
  critical: '#ef4444',
};

export function BulletTile({ metric, filters, onClick }: BulletTileProps) {
  const [snapshot, setSnapshot] = useState<BulletSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    getBullet(metric.id, filters)
      .then(s => { if (!cancelled) setSnapshot(s); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [metric.id, JSON.stringify(filters)]);

  return (
    <div onClick={onClick} className="metric-card cursor-pointer p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {metric.label}
        </span>
      </div>

      {error && <div className="mt-3 text-xs text-red-500">{error}</div>}
      {!error && !snapshot && <div className="mt-3 text-xs text-slate-400">Loading…</div>}

      {snapshot && (() => {
        const chartMax = snapshot.bands[snapshot.bands.length - 1]?.max ?? 100;
        const actualPct = Math.max(0, Math.min(100, (snapshot.actual / chartMax) * 100));
        const targetPct = Math.max(0, Math.min(100, (snapshot.target / chartMax) * 100));

        // Build qualitative band stripes; bands are sorted ascending by max in
        // display order. Render them as contiguous segments along the track.
        let prevMax = 0;
        const bandSegs = snapshot.bands.map(b => {
          const startPct = (prevMax / chartMax) * 100;
          const widthPct = ((b.max - prevMax) / chartMax) * 100;
          prevMax = b.max;
          return { ...b, startPct, widthPct };
        });

        return (
          <div className="mt-4">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">
                {formatValue(snapshot.actual, metric.unit)}
              </span>
              <span className="text-[10px] font-medium text-slate-500">
                Target {snapshot.direction === 'lower-is-better' ? '≤' : '≥'} {formatValue(snapshot.target, metric.unit)}
              </span>
            </div>

            {/* Track + bands + actual + target tick */}
            <div className="relative h-5 w-full rounded bg-slate-50 overflow-hidden">
              {/* qualitative bands */}
              {bandSegs.map((b, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0"
                  style={{
                    left: `${b.startPct}%`,
                    width: `${b.widthPct}%`,
                    background: BAND_COLOR[b.color],
                    borderRight: i < bandSegs.length - 1 ? '1px solid white' : undefined,
                  }}
                />
              ))}
              {/* actual bar — narrow centered stripe over the bands */}
              <div
                className="absolute top-1.5 bottom-1.5 rounded-sm bg-slate-800"
                style={{ left: 0, width: `${actualPct}%` }}
              />
              {/* target tick */}
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-slate-900"
                style={{ left: `${targetPct}%` }}
              />
            </div>

            {/* band legend */}
            <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
              {snapshot.bands.map((b, i) => {
                const prev = i === 0 ? 0 : snapshot.bands[i - 1].max;
                return (
                  <span key={i} className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{ background: BAND_BORDER[b.color] }}
                    />
                    {formatValue(prev, metric.unit)} – {formatValue(b.max, metric.unit)}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
