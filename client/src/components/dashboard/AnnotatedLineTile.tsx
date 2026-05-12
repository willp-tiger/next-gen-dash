import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine, ReferenceArea, ReferenceDot,
} from 'recharts';
import type { MetricConfig, FilterState, TimeseriesSnapshot, AnnotationEvent } from 'shared/types';
import { getTimeseries } from '../../api/client';
import { formatValue, formatAxis } from '../../lib/format';
import { MetricTooltip } from './MetricTooltip';

interface AnnotatedLineTileProps {
  metric: MetricConfig;
  filters?: FilterState;
  onClick?: () => void;
}

const SEVERITY_COLOR: Record<AnnotationEvent['severity'], string> = {
  info: '#0ea5e9',
  warning: '#f59e0b',
  critical: '#ef4444',
};

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 10,
  border: 'none',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  padding: '8px 12px',
};

export function AnnotatedLineTile({ metric, filters, onClick }: AnnotatedLineTileProps) {
  const [snapshot, setSnapshot] = useState<TimeseriesSnapshot | null>(null);
  const [hoveredAnnotation, setHoveredAnnotation] = useState<AnnotationEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setError(null);
    getTimeseries(metric.id, 'weekly', filters)
      .then(s => { if (!cancelled) setSnapshot(s); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [metric.id, JSON.stringify(filters)]);

  const data = snapshot?.points ?? [];
  const annotations = snapshot?.annotations ?? [];

  // Filter annotations to those that fall inside the visible date range.
  const dataDates = data.map(d => d.date);
  const minDate = dataDates[0];
  const maxDate = dataDates[dataDates.length - 1];
  const visibleAnnotations = annotations.filter(a => {
    if (!minDate || !maxDate) return false;
    const start = a.date;
    const end = a.endDate ?? a.date;
    return end >= minDate && start <= maxDate;
  });

  return (
    <MetricTooltip metric={metric}>
      <div onClick={onClick} className="metric-card cursor-pointer p-5 col-span-1 lg:col-span-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {metric.label} — annotated trend
          </span>
          <span className="text-[10px] text-slate-400">{visibleAnnotations.length} event{visibleAnnotations.length === 1 ? '' : 's'}</span>
        </div>

        <div className="mt-3 h-56">
          {error && (
            <div className="flex h-full items-center justify-center text-xs text-red-500">{error}</div>
          )}
          {!error && data.length === 0 && (
            <div className="flex h-full items-center justify-center text-xs text-slate-400">Loading…</div>
          )}
          {!error && data.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={32}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatAxis(v, metric.unit)}
                  width={56}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(label: string) => label}
                  formatter={(val: number) => [formatValue(val, metric.unit), metric.label]}
                />

                {/* Range annotations as shaded areas */}
                {visibleAnnotations.filter(a => a.endDate).map(a => (
                  <ReferenceArea
                    key={`area-${a.id}`}
                    x1={a.date}
                    x2={a.endDate!}
                    strokeOpacity={0}
                    fill={SEVERITY_COLOR[a.severity]}
                    fillOpacity={0.08}
                  />
                ))}

                {/* Point annotations as vertical lines */}
                {visibleAnnotations.filter(a => !a.endDate).map(a => (
                  <ReferenceLine
                    key={`line-${a.id}`}
                    x={a.date}
                    stroke={SEVERITY_COLOR[a.severity]}
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                  />
                ))}

                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#0f172a', stroke: '#fff', strokeWidth: 2 }}
                />

                {/* Pin dots on top of the line for each annotation */}
                {visibleAnnotations.map(a => {
                  const pinDate = a.endDate ?? a.date;
                  const point = data.find(d => d.date >= pinDate) ?? data[data.length - 1];
                  if (!point) return null;
                  return (
                    <ReferenceDot
                      key={`pin-${a.id}`}
                      x={point.date}
                      y={point.value}
                      r={6}
                      fill={SEVERITY_COLOR[a.severity]}
                      stroke="#fff"
                      strokeWidth={2}
                      onMouseEnter={() => setHoveredAnnotation(a)}
                      onMouseLeave={() => setHoveredAnnotation(null)}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Annotation legend / hover detail */}
        {visibleAnnotations.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {visibleAnnotations.map(a => (
              <div
                key={a.id}
                className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-[11px] transition ${
                  hoveredAnnotation?.id === a.id ? 'bg-slate-50' : ''
                }`}
                onMouseEnter={() => setHoveredAnnotation(a)}
                onMouseLeave={() => setHoveredAnnotation(null)}
              >
                <span
                  className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: SEVERITY_COLOR[a.severity] }}
                />
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-slate-700">{a.label}</span>
                    <span className="text-slate-400">
                      {a.date}{a.endDate ? ` → ${a.endDate}` : ''}
                    </span>
                  </div>
                  <div className="text-slate-500 leading-snug">{a.description}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MetricTooltip>
  );
}
