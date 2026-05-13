import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DrillSnapshot,
  FilterState,
  MetricConfig,
  MetricValue,
  TileNote,
} from 'shared/types';
import { getHealthStatus, STATUS_COLORS } from './HealthBadge';
import { formatValue, formatDelta } from '../../lib/format';
import { getDrill } from '../../api/client';

interface MetricDetailDrawerProps {
  metric: MetricConfig;
  /** Optional — present for snapshot-backed tiles (scorecard, gauge, line). Absent for
   *  self-fetching widgets (pivot, funnel, waterfall, calendar) where the drawer still
   *  opens for drill + notes but skips trend/threshold sections. */
  value?: MetricValue;
  filters?: FilterState;
  /** Display name to attribute new notes to. Real user identity — no synthetic personas. */
  noteAuthor?: string;
  onAddNote?: (metricId: string, body: string) => void;
  onRemoveNote?: (metricId: string, noteId: string) => void;
  onClose: () => void;
}

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: 'none',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '8px 12px',
};

const FILTER_LABELS: Record<keyof FilterState, string> = {
  destination_region: 'Region',
  warehouse_id: 'Warehouse',
  customer_segment: 'Segment',
  sku_category: 'Category',
  supplier_tier: 'Supplier tier',
  dateStart: 'From',
  dateEnd: 'To',
  compareTo: 'Compare to',
};

function activeFilterChips(filters?: FilterState): { label: string; value: string }[] {
  if (!filters) return [];
  const out: { label: string; value: string }[] = [];
  (Object.keys(FILTER_LABELS) as (keyof FilterState)[]).forEach(k => {
    const v = filters[k];
    if (v && v !== 'none') out.push({ label: FILTER_LABELS[k], value: String(v) });
  });
  return out;
}

function formatCell(value: string | number | null, kind: string, unit: string): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (kind) {
    case 'date':
      return typeof value === 'string' ? value : String(value);
    case 'currency':
      return formatValue(Number(value), 'dollars', { mode: 'full' });
    case 'percent':
      return formatValue(Number(value), 'percent');
    case 'number':
      return typeof value === 'number'
        ? formatValue(value, unit || '')
        : String(value);
    default:
      return String(value);
  }
}

export function MetricDetailDrawer({
  metric,
  value,
  filters,
  noteAuthor,
  onAddNote,
  onRemoveNote,
  onClose,
}: MetricDetailDrawerProps) {
  const status = value ? getHealthStatus(value.current, metric.thresholds) : null;
  const color = status === 'healthy' ? '#10b981' : status === 'warning' ? '#f59e0b' : status === 'critical' ? '#ef4444' : '#64748b';

  const { green, yellow, direction } = metric.thresholds;
  const target = metric.target ?? green.max;
  const hasExplicitTarget = metric.target !== undefined;

  // Target delta (only meaningful when current is known + a positive target exists)
  const targetDelta = useMemo(() => {
    if (!value || target <= 0) return null;
    const abs = value.current - target;
    const pct = (abs / target) * 100;
    const goodSign = direction === 'lower-is-better' ? abs <= 0 : abs >= 0;
    return { abs, pct, good: goodSign };
  }, [value, target, direction]);

  const trendData = useMemo(() => {
    if (!value) return [];
    return value.trend.map((v, i) => {
      const total = value.trend.length;
      let label: string;
      if (total <= 12) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        label = monthNames[i % 12];
      } else if (total <= 31) {
        label = `Day ${i + 1}`;
      } else {
        label = `${i + 1}`;
      }
      return { hour: label, value: v };
    });
  }, [value]);

  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    drawerRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Drill rows
  const [drill, setDrill] = useState<DrillSnapshot | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  // Client-side sort state. The server returns rows already sorted by the most-relevant
  // column (e.g. days_late desc for OTIF); clicking a column header overrides that.
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    let cancelled = false;
    setDrillLoading(true);
    setDrillError(null);
    setSortKey(null);
    getDrill(metric.id, filters, 50)
      .then(snap => { if (!cancelled) setDrill(snap); })
      .catch(err => { if (!cancelled) setDrillError(err instanceof Error ? err.message : 'Failed to load underlying records'); })
      .finally(() => { if (!cancelled) setDrillLoading(false); });
    return () => { cancelled = true; };
    // Re-fetch when metric or active filters change.
  }, [metric.id, JSON.stringify(filters)]);

  const sortedRows = useMemo(() => {
    if (!drill || !sortKey) return drill?.rows ?? [];
    const col = drill.columns.find(c => c.key === sortKey);
    const numeric = col && (col.kind === 'number' || col.kind === 'currency' || col.kind === 'percent');
    const rows = [...drill.rows];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      let cmp = 0;
      if (numeric) cmp = Number(av) - Number(bv);
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [drill, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const handleExportCsv = () => {
    if (!drill || drill.rows.length === 0) return;
    const escape = (v: string | number | null): string => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const header = drill.columns.map(c => escape(c.label)).join(',');
    const rows = sortedRows.map(r => drill.columns.map(c => escape(r[c.key])).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metric.id}-${drill.source}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Notes
  const notes = metric.notes ?? [];
  const [noteDraft, setNoteDraft] = useState('');
  const handleAddNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed || !onAddNote) return;
    onAddNote(metric.id, trimmed);
    setNoteDraft('');
  };

  const chips = activeFilterChips(filters);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div ref={drawerRef} tabIndex={-1} className="fixed inset-y-0 right-0 z-50 w-full sm:max-w-2xl bg-white shadow-2xl overflow-y-auto animate-slide-in focus:outline-none">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">{metric.label}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {direction === 'higher-is-better' ? 'Higher is better' : 'Lower is better'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chips.map(chip => (
                <span key={`${chip.label}:${chip.value}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  <span className="text-slate-400">{chip.label}:</span> {chip.value}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Current value hero (snapshot-backed tiles only) */}
          {value && status && (
            <div className="flex items-start gap-6">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current</span>
                <div className="text-4xl font-bold tracking-tight text-slate-900 mt-1">
                  {formatValue(value.current, metric.unit)}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <span className={`flex items-center gap-1 text-sm font-semibold ${
                    (direction === 'lower-is-better' ? value.delta <= 0 : value.delta >= 0)
                      ? 'text-emerald-600'
                      : 'text-red-600'
                  }`}>
                    <svg className={`h-3.5 w-3.5 ${value.delta >= 0 ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                    </svg>
                    {formatDelta(value.deltaPct)}
                  </span>
                  <span className="text-[10px] text-slate-400">vs prior period</span>
                  {targetDelta && hasExplicitTarget && (
                    <>
                      <span className="text-slate-300">•</span>
                      <span className={`flex items-center gap-1 text-sm font-semibold ${targetDelta.good ? 'text-emerald-600' : 'text-red-600'}`}>
                        {targetDelta.abs >= 0 ? '+' : ''}{formatValue(targetDelta.abs, metric.unit)}
                      </span>
                      <span className="text-[10px] text-slate-400">vs target</span>
                    </>
                  )}
                </div>
              </div>
              <div className="ml-auto flex flex-col items-end gap-1">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  status === 'healthy' ? 'bg-emerald-50 text-emerald-700' :
                  status === 'warning' ? 'bg-amber-50 text-amber-700' :
                  'bg-red-50 text-red-700'
                }`}>
                  <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[status].dot}`} />
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
                {target > 0 && (
                  <span className="text-[10px] text-slate-400 mt-1">
                    {hasExplicitTarget ? 'Target' : 'Healthy threshold'}: {formatValue(target, metric.unit)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Trend chart */}
          {trendData.length > 1 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                Trend
              </h4>
              <div className="rounded-xl border border-slate-200/60 bg-slate-50/50 p-4">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 8, right: 12, bottom: 4, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis
                        dataKey="hour"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        interval={Math.max(0, Math.floor(trendData.length / 8))}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        width={45}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(val: number) => [formatValue(val, metric.unit), metric.label]}
                      />
                      {target > 0 && (
                        <ReferenceLine
                          y={target}
                          stroke="#94a3b8"
                          strokeDasharray="4 4"
                          label={{
                            value: hasExplicitTarget ? 'Target' : 'Threshold',
                            position: 'right',
                            fontSize: 10,
                            fill: '#94a3b8',
                          }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={color}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: color, stroke: '#fff', strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Threshold levels (only when value is known) */}
          {value && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                Threshold Levels
              </h4>
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-lg border border-slate-200/60 bg-emerald-50/50 px-4 py-2.5">
                  <span className="h-3 w-3 rounded-full bg-emerald-500" />
                  <div className="flex-1">
                    <span className="text-xs font-semibold text-emerald-800">Healthy</span>
                  </div>
                  <span className="text-xs font-medium text-emerald-700">
                    {direction === 'lower-is-better' ? `≤ ${formatValue(green.max, metric.unit)}` : `≥ ${formatValue(green.max, metric.unit)}`}
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-slate-200/60 bg-amber-50/50 px-4 py-2.5">
                  <span className="h-3 w-3 rounded-full bg-amber-500" />
                  <div className="flex-1">
                    <span className="text-xs font-semibold text-amber-800">Warning</span>
                  </div>
                  <span className="text-xs font-medium text-amber-700">
                    {direction === 'lower-is-better'
                      ? `${formatValue(green.max, metric.unit)} – ${formatValue(yellow.max, metric.unit)}`
                      : `${formatValue(yellow.max, metric.unit)} – ${formatValue(green.max, metric.unit)}`}
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-slate-200/60 bg-red-50/50 px-4 py-2.5">
                  <span className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="flex-1">
                    <span className="text-xs font-semibold text-red-800">Critical</span>
                  </div>
                  <span className="text-xs font-medium text-red-700">
                    {direction === 'lower-is-better' ? `> ${formatValue(yellow.max, metric.unit)}` : `< ${formatValue(yellow.max, metric.unit)}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Notes
              </h4>
              {notes.length > 0 && (
                <span className="text-[10px] font-medium text-slate-400">{notes.length} pinned</span>
              )}
            </div>
            <div className="space-y-2">
              {notes.length === 0 && (
                <p className="text-xs text-slate-400 italic">
                  No notes yet — pin context here for your next review.
                </p>
              )}
              {notes.map(n => (
                <div key={n.id} className="group rounded-lg border border-slate-200/60 bg-slate-50/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{n.body}</p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="font-medium text-slate-500">{n.author}</span>
                        <span>•</span>
                        <span>{new Date(n.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    {onRemoveNote && (
                      <button
                        onClick={() => onRemoveNote(metric.id, n.id)}
                        className="opacity-0 group-hover:opacity-100 transition rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                        title="Remove note"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {onAddNote && (
              <div className="mt-3 flex items-start gap-2">
                <textarea
                  value={noteDraft}
                  onChange={e => setNoteDraft(e.target.value)}
                  placeholder={noteAuthor ? `Add a note as ${noteAuthor}…` : 'Add a note…'}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleAddNote();
                    }
                  }}
                />
                <button
                  onClick={handleAddNote}
                  disabled={!noteDraft.trim()}
                  className="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-accent-dark disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Pin
                </button>
              </div>
            )}
          </div>

          {/* Drill rows */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Underlying Records
              </h4>
              <div className="flex items-center gap-3">
                {drill && (
                  <span className="text-[10px] font-medium text-slate-400">
                    {drill.rows.length} of {drill.totalRows.toLocaleString()} {drill.source.replace('_', ' ')}
                  </span>
                )}
                {drill && drill.rows.length > 0 && (
                  <button
                    onClick={handleExportCsv}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
                    title="Download these rows as CSV"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    Export CSV
                  </button>
                )}
              </div>
            </div>
            {drill?.rowDescription && (
              <p className="text-[11px] text-slate-500 mb-2">{drill.rowDescription}</p>
            )}
            {drillLoading && (
              <div className="rounded-lg border border-slate-200/60 bg-slate-50/50 p-6 text-center text-xs text-slate-400">
                Loading records…
              </div>
            )}
            {drillError && !drillLoading && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {drillError}
              </div>
            )}
            {drill && !drillLoading && drill.rows.length === 0 && (
              <div className="rounded-lg border border-slate-200/60 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
                No matching records in scope.
              </div>
            )}
            {drill && !drillLoading && drill.rows.length > 0 && (
              <div className="rounded-lg border border-slate-200/60 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {drill.columns.map(col => {
                        const isSorted = sortKey === col.key;
                        const isNumeric = col.kind === 'number' || col.kind === 'currency' || col.kind === 'percent';
                        return (
                          <th
                            key={col.key}
                            onClick={() => handleSort(col.key)}
                            className={`px-3 py-2 text-left font-semibold uppercase tracking-wider text-[10px] cursor-pointer select-none hover:bg-slate-100 transition ${col.primary ? 'text-slate-900' : 'text-slate-500'} ${isNumeric ? 'text-right' : ''}`}
                            title="Click to sort"
                          >
                            <span className={`inline-flex items-center gap-1 ${isNumeric ? 'flex-row-reverse' : ''}`}>
                              {col.label}
                              <span className={`text-[9px] ${isSorted ? 'text-slate-700' : 'text-slate-300'}`}>
                                {isSorted ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                              </span>
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}>
                        {drill.columns.map(col => {
                          const formatted = formatCell(row[col.key], col.kind, metric.unit);
                          const isNumeric = col.kind === 'number' || col.kind === 'currency' || col.kind === 'percent';
                          if (col.kind === 'badge' && row[col.key]) {
                            return (
                              <td key={col.key} className="px-3 py-2">
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                  {formatted}
                                </span>
                              </td>
                            );
                          }
                          return (
                            <td
                              key={col.key}
                              className={`px-3 py-2 ${isNumeric ? 'text-right tabular-nums' : ''} ${col.primary ? 'font-semibold text-slate-900' : 'text-slate-600'}`}
                            >
                              {formatted}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Supporting stats */}
          {trendData.length > 1 && value && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                Period Statistics
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Min', val: Math.min(...value.trend) },
                  { label: 'Max', val: Math.max(...value.trend) },
                  { label: 'Average', val: value.trend.reduce((a, b) => a + b, 0) / value.trend.length },
                ].map(stat => (
                  <div key={stat.label} className="rounded-lg border border-slate-200/60 bg-slate-50 p-3 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{stat.label}</span>
                    <div className="mt-1 text-lg font-bold text-slate-900">
                      {formatValue(stat.val, metric.unit)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reasoning (if present from Claude) */}
          {metric.reasoning && (
            <div className="rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent-dark">AI Insight</span>
              <p className="mt-1 text-sm text-slate-700 leading-relaxed italic">
                &ldquo;{metric.reasoning}&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
