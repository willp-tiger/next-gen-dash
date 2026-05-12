import { useEffect, useState } from 'react';
import type { MetricConfig, FilterState, WaterfallSnapshot, WaterfallStage } from 'shared/types';
import { getWaterfall } from '../../api/client';
import { formatValue } from '../../lib/format';

interface WaterfallTileProps {
  metric: MetricConfig;
  filters?: FilterState;
  onClick?: () => void;
}

const STAGE_FILL: Record<WaterfallStage['kind'], string> = {
  anchor: '#475569',
  positive: '#10b981',
  negative: '#ef4444',
};

const CHART_HEIGHT = 220;
const TOP_PAD = 16;
const BOTTOM_PAD = 36;

export function WaterfallTile({ metric, filters, onClick }: WaterfallTileProps) {
  const [snapshot, setSnapshot] = useState<WaterfallSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    getWaterfall('otif_bridge', filters)
      .then(s => { if (!cancelled) setSnapshot(s); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [JSON.stringify(filters)]);

  return (
    <div onClick={onClick} className="metric-card cursor-pointer p-5 col-span-1 lg:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {metric.label || 'OTIF Bridge'}
        </span>
        {snapshot && (
          <span className={`text-xs font-semibold ${snapshot.netDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            Net Δ {snapshot.netDelta >= 0 ? '+' : ''}{snapshot.netDelta.toFixed(2)} pts
          </span>
        )}
      </div>

      {error && <div className="mt-3 text-xs text-red-500">{error}</div>}
      {!error && !snapshot && <div className="mt-3 text-xs text-slate-400">Loading…</div>}

      {snapshot && snapshot.stages.length > 0 && (() => {
        const allValues: number[] = [];
        for (const s of snapshot.stages) {
          allValues.push(s.runningTotal);
          if (s.kind !== 'anchor') allValues.push(s.runningTotal - s.value);
        }
        const yMax = Math.max(...allValues, 100);
        const yMin = Math.max(0, Math.min(...allValues) - 5);
        const range = yMax - yMin || 1;
        const drawHeight = CHART_HEIGHT - TOP_PAD - BOTTOM_PAD;
        const yScale = (v: number) => TOP_PAD + (1 - (v - yMin) / range) * drawHeight;

        const colWidth = 100 / snapshot.stages.length;
        const barWidthPct = 60;

        return (
          <div className="mt-3" style={{ height: CHART_HEIGHT }}>
            <svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 100 ${CHART_HEIGHT}`} preserveAspectRatio="none">
              {/* y-grid */}
              {[0, 0.25, 0.5, 0.75, 1].map(t => {
                const y = TOP_PAD + t * drawHeight;
                return <line key={t} x1={0} x2={100} y1={y} y2={y} stroke="#f1f5f9" strokeWidth={0.2} />;
              })}
              {snapshot.stages.map((s, i) => {
                const cx = i * colWidth + colWidth / 2;
                const barLeft = cx - (colWidth * barWidthPct / 100) / 2;
                const barW = colWidth * barWidthPct / 100;
                const top = s.kind === 'anchor' ? s.runningTotal : Math.max(s.runningTotal - s.value, s.runningTotal);
                const bottom = s.kind === 'anchor' ? 0 : Math.min(s.runningTotal - s.value, s.runningTotal);
                const yTop = yScale(top);
                const yBot = yScale(bottom);
                return (
                  <g key={i}>
                    <rect
                      x={barLeft}
                      y={yTop}
                      width={barW}
                      height={Math.max(yBot - yTop, 1)}
                      fill={STAGE_FILL[s.kind]}
                      rx={1}
                    />
                    {/* connector line to next bar */}
                    {i < snapshot.stages.length - 1 && (
                      <line
                        x1={barLeft + barW}
                        x2={(i + 1) * colWidth + colWidth / 2 - (colWidth * barWidthPct / 100) / 2}
                        y1={yScale(s.runningTotal)}
                        y2={yScale(s.runningTotal)}
                        stroke="#94a3b8"
                        strokeDasharray="0.5 0.5"
                        strokeWidth={0.3}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="grid mt-1" style={{ gridTemplateColumns: `repeat(${snapshot.stages.length}, 1fr)` }}>
              {snapshot.stages.map((s, i) => (
                <div key={i} className="text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{s.label}</div>
                  <div className={`text-xs font-semibold ${
                    s.kind === 'anchor' ? 'text-slate-700'
                    : s.kind === 'positive' ? 'text-emerald-600'
                    : 'text-red-600'
                  }`}>
                    {s.kind === 'anchor'
                      ? formatValue(s.value, snapshot.unit)
                      : `${s.value >= 0 ? '+' : ''}${s.value.toFixed(2)} pts`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
