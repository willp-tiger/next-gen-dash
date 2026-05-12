import { useEffect, useMemo, useState } from 'react';
import type { MetricConfig, FilterState, CalendarSnapshot } from 'shared/types';
import { getCalendar } from '../../api/client';

interface CalendarHeatmapTileProps {
  metric: MetricConfig;
  filters?: FilterState;
  onClick?: () => void;
}

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const CELL = 11;
const GAP = 2;

function isoToDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function intensity(v: number, min: number, max: number): string {
  if (max <= min) return '#e2e8f0';
  const t = (v - min) / (max - min);
  // Slate-50 → accent (deep blue) gradient
  const r = Math.round(241 + (29 - 241) * t);
  const g = Math.round(245 + (78 - 245) * t);
  const b = Math.round(249 + (216 - 249) * t);
  return `rgb(${r},${g},${b})`;
}

export function CalendarHeatmapTile({ metric, filters, onClick }: CalendarHeatmapTileProps) {
  const [snapshot, setSnapshot] = useState<CalendarSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ date: string; value: number } | null>(null);

  const source = metric.calendar?.source ?? 'shipments_per_day';

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    getCalendar(source, filters)
      .then(s => { if (!cancelled) setSnapshot(s); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [source, JSON.stringify(filters)]);

  const grid = useMemo(() => {
    if (!snapshot) return null;
    const cellMap = new Map(snapshot.cells.map(c => [c.date, c.value]));
    const start = isoToDate(snapshot.dateStart);
    const end = isoToDate(snapshot.dateEnd);
    // Snap to Monday-of-start-week
    const dayOfWeek = (start.getDay() + 6) % 7; // Mon=0..Sun=6
    const gridStart = new Date(start);
    gridStart.setDate(gridStart.getDate() - dayOfWeek);
    // Generate weeks until end
    const weeks: { date: string; value: number | null }[][] = [];
    const cursor = new Date(gridStart);
    while (cursor <= end) {
      const week: { date: string; value: number | null }[] = [];
      for (let i = 0; i < 7; i++) {
        const iso = cursor.toISOString().slice(0, 10);
        const inRange = cursor >= start && cursor <= end;
        week.push({
          date: iso,
          value: inRange ? cellMap.get(iso) ?? 0 : null,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }
    // Compute month label positions: first column where the month starts
    const monthLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((w, ci) => {
      const firstInRange = w.find(c => c.value !== null);
      if (firstInRange) {
        const d = isoToDate(firstInRange.date);
        if (d.getMonth() !== lastMonth && d.getDate() <= 7) {
          monthLabels.push({ col: ci, label: d.toLocaleString('en-US', { month: 'short' }) });
          lastMonth = d.getMonth();
        }
      }
    });
    return { weeks, monthLabels };
  }, [snapshot]);

  const sourceLabel = source === 'shipments_per_day' ? 'Shipments per day' : 'Exceptions per day';

  return (
    <div onClick={onClick} className="metric-card cursor-pointer p-5 col-span-1 lg:col-span-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {metric.label || sourceLabel}
        </span>
        {hoveredCell && (
          <span className="text-[10px] text-slate-500">
            {hoveredCell.date}: <span className="font-semibold text-slate-800">{hoveredCell.value}</span>
          </span>
        )}
      </div>

      {error && <div className="mt-3 text-xs text-red-500">{error}</div>}
      {!error && !snapshot && <div className="mt-3 text-xs text-slate-400">Loading…</div>}

      {snapshot && grid && (
        <div className="mt-4 overflow-x-auto">
          <div style={{ display: 'inline-block' }}>
            {/* Month labels row */}
            <div className="flex items-end mb-1" style={{ marginLeft: 16 }}>
              {grid.weeks.map((_, i) => {
                const lbl = grid.monthLabels.find(m => m.col === i);
                return (
                  <div
                    key={i}
                    style={{ width: CELL + GAP, fontSize: 9, color: '#94a3b8', textAlign: 'left' }}
                  >
                    {lbl ? lbl.label : ''}
                  </div>
                );
              })}
            </div>
            {/* Body: weekday rows × week columns */}
            <div className="flex">
              {/* Weekday labels */}
              <div className="flex flex-col" style={{ marginRight: 4 }}>
                {WEEKDAY_LABELS.map((d, i) => (
                  <div
                    key={i}
                    style={{ height: CELL + GAP, fontSize: 8, color: '#94a3b8', lineHeight: `${CELL}px` }}
                  >
                    {i % 2 === 0 ? d : ''}
                  </div>
                ))}
              </div>
              {/* Weeks */}
              <div className="flex">
                {grid.weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col" style={{ marginRight: GAP }}>
                    {week.map((cell, di) => (
                      <div
                        key={di}
                        style={{
                          width: CELL,
                          height: CELL,
                          marginBottom: GAP,
                          background: cell.value !== null
                            ? intensity(cell.value, snapshot.min, snapshot.max)
                            : 'transparent',
                          borderRadius: 2,
                          cursor: 'pointer',
                        }}
                        onMouseEnter={() => cell.value !== null && setHoveredCell({ date: cell.date, value: cell.value })}
                        onMouseLeave={() => setHoveredCell(null)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
            {/* Legend */}
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
              <span>{snapshot.min}</span>
              <div className="flex gap-[1px]">
                {[0, 0.2, 0.4, 0.6, 0.8, 1].map(t => (
                  <div
                    key={t}
                    style={{
                      width: 14, height: 8,
                      background: intensity(snapshot.min + (snapshot.max - snapshot.min) * t, snapshot.min, snapshot.max),
                      borderRadius: 1,
                    }}
                  />
                ))}
              </div>
              <span>{snapshot.max}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
