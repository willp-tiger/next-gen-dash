import { useMemo, useState } from 'react';
import type { DashboardConfig, MetricConfig } from 'shared/types';

interface InterpretationReviewProps {
  config: DashboardConfig;
  onConfirm: (config: DashboardConfig) => void;
  onRetry: () => void;
}

// Hardcoded category for each known KPI id — used to group the metrics list into sensible
// sections (Fulfillment / Inventory / etc.) on the review screen so the reader can scan it
// like a table of contents rather than a flat grid.
const CATEGORY_OF: Record<string, string> = {
  otif_rate: 'Fulfillment', perfect_order_rate: 'Fulfillment', order_cycle_time: 'Fulfillment',
  line_fill_rate: 'Fulfillment', backorder_rate: 'Fulfillment', same_day_ship_rate: 'Fulfillment',
  inventory_turns: 'Inventory', days_of_supply: 'Inventory', stockout_rate: 'Inventory',
  excess_inventory_value: 'Inventory', critical_sku_stockout_rate: 'Inventory',
  supplier_otd: 'Procurement', supplier_otif: 'Procurement', po_cycle_time: 'Procurement',
  avg_lead_time: 'Procurement', supplier_defect_rate: 'Procurement',
  carrier_otd: 'Logistics', avg_transit_days: 'Logistics', damage_rate: 'Logistics',
  exception_rate: 'Operations', avg_exception_mttr: 'Operations', return_rate: 'Operations',
  warehouse_capacity_util: 'Operations',
};

const CATEGORY_ORDER = ['Fulfillment', 'Inventory', 'Procurement', 'Logistics', 'Operations', 'Other'];

const CHART_LABEL: Record<string, string> = {
  number: 'KPI number', scorecard: 'Scorecard', gauge: 'Gauge',
  line: 'Line chart', bar: 'Bar chart', area: 'Area chart',
  breakdown: 'Breakdown', heatmap: 'Heatmap',
  annotated_line: 'Annotated trend', pivot: 'Pivot table',
  funnel: 'Funnel', waterfall: 'Waterfall',
  top_n: 'Top-N', bullet: 'Bullet', calendar_heatmap: 'Calendar heatmap',
  markdown: 'Note',
};

function chartLabel(t: string): string {
  return CHART_LABEL[t] ?? t.replace(/_/g, ' ');
}

function formatThreshold(value: number, unit: string): string {
  if (unit === 'percent') return `${value}%`;
  if (unit === 'dollars') return `$${value.toLocaleString()}`;
  if (unit === 'days') return `${value}d`;
  if (unit === 'turns') return `${value} turns`;
  return String(value);
}

export function InterpretationReview({
  config,
  onConfirm,
  onRetry,
}: InterpretationReviewProps) {
  const [editedConfig, setEditedConfig] = useState<DashboardConfig>(config);

  const updateMetric = (index: number, patch: Partial<MetricConfig>) => {
    setEditedConfig((prev) => ({
      ...prev,
      metrics: prev.metrics.map((m, i) =>
        i === index ? { ...m, ...patch } : m
      ),
    }));
  };

  const updateThreshold = (
    index: number,
    band: 'green' | 'yellow',
    value: number
  ) => {
    setEditedConfig((prev) => ({
      ...prev,
      metrics: prev.metrics.map((m, i) =>
        i === index
          ? {
              ...m,
              thresholds: {
                ...m.thresholds,
                [band]: { max: value },
              },
            }
          : m
      ),
    }));
  };

  const toggleVisibility = (index: number) => {
    setEditedConfig((prev) => ({
      ...prev,
      metrics: prev.metrics.map((m, i) =>
        i === index ? { ...m, visible: !m.visible } : m
      ),
    }));
  };

  const maxWeight = Math.max(
    ...editedConfig.interpretation.priorities.map((p) => p.weight),
    1
  );

  // Group metrics by category for a readable scan.
  const grouped = useMemo(() => {
    const groups = new Map<string, { metric: MetricConfig; realIndex: number }[]>();
    editedConfig.metrics.forEach((metric, realIndex) => {
      const cat = CATEGORY_OF[metric.id] ?? 'Other';
      const arr = groups.get(cat) ?? [];
      arr.push({ metric, realIndex });
      groups.set(cat, arr);
    });
    return CATEGORY_ORDER
      .map(cat => ({ cat, items: groups.get(cat) ?? [] }))
      .filter(g => g.items.length > 0);
  }, [editedConfig.metrics]);

  const visibleCount = editedConfig.metrics.filter(m => m.visible).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Hero — anchors the trust moment. The user just told Claude what they care about;
          this screen is Claude saying "here's what I heard." */}
      <div className="rounded-2xl bg-gradient-to-br from-accent/10 via-white to-white p-6 shadow-sm ring-1 ring-accent/20">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-accent-dark">Claude's interpretation</span>
            <h2 className="mt-1 text-xl font-bold text-slate-900 leading-tight">
              Here's the dashboard I'd build for you
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {editedConfig.interpretation.summary}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {visibleCount} metrics selected
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200">
                {editedConfig.interpretation.priorities.length} priorities identified
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Priorities — what Claude thinks the user cares most about, with weights. */}
      {editedConfig.interpretation.priorities.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-900">What you care about most</h3>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Inferred from your prompt</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {editedConfig.interpretation.priorities.map((priority, i) => (
              <div
                key={i}
                className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900 truncate">
                    {priority.label}
                  </span>
                  <span className="flex-shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent-dark uppercase tracking-wider">
                    weight {priority.weight}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${(priority.weight / maxWeight) * 100}%` }}
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  {priority.reasoning}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics grouped by category */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-900">Your dashboard tiles</h3>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Edit thresholds, hide tiles you don't want</span>
        </div>
        <div className="space-y-5">
          {grouped.map(group => (
            <div key={group.cat}>
              <div className="flex items-center gap-3 mb-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{group.cat}</h4>
                <span className="text-[10px] text-slate-400">{group.items.length} {group.items.length === 1 ? 'metric' : 'metrics'}</span>
                <div className="flex-1 border-t border-slate-200" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map(({ metric, realIndex }) => (
                  <div
                    key={metric.id}
                    className={`relative rounded-xl bg-white p-4 shadow-sm ring-1 transition ${
                      metric.visible ? 'ring-slate-200/60' : 'ring-slate-200/40 bg-slate-50/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h5 className="text-sm font-semibold text-slate-900 truncate">{metric.label}</h5>
                        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {chartLabel(metric.chartType)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {metric.thresholds.direction === 'higher-is-better' ? 'higher is better' : 'lower is better'}
                          </span>
                        </div>
                      </div>
                      <label className="flex-shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={metric.visible}
                          onChange={() => toggleVisibility(realIndex)}
                          className="sr-only peer"
                        />
                        <div className="relative h-5 w-9 rounded-full bg-slate-200 peer-checked:bg-accent transition">
                          <div className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
                        </div>
                      </label>
                    </div>

                    {/* Reasoning — show prominently when present; this is Claude's "why" */}
                    {metric.reasoning && (
                      <div className="mt-2.5 rounded-lg bg-accent/5 border border-accent/15 px-3 py-2">
                        <p className="text-[11px] leading-relaxed text-slate-700">
                          <span className="font-semibold text-accent-dark">Why: </span>
                          {metric.reasoning}
                        </p>
                      </div>
                    )}

                    {/* Threshold editors — compact inline so they don't dominate the card */}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <label className="flex items-center gap-1.5 text-slate-500 mb-1">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                          <span>Healthy {metric.thresholds.direction === 'lower-is-better' ? '≤' : '≥'}</span>
                        </label>
                        <input
                          type="number"
                          value={metric.thresholds.green.max}
                          onChange={(e) =>
                            updateThreshold(realIndex, 'green', Number(e.target.value))
                          }
                          disabled={!metric.visible}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-right tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-slate-100 disabled:text-slate-400"
                        />
                        <div className="mt-0.5 text-[9px] text-slate-400 text-right">{formatThreshold(metric.thresholds.green.max, metric.unit)}</div>
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-slate-500 mb-1">
                          <span className="h-2 w-2 rounded-full bg-amber-500" />
                          <span>Warning {metric.thresholds.direction === 'lower-is-better' ? '≤' : '≥'}</span>
                        </label>
                        <input
                          type="number"
                          value={metric.thresholds.yellow.max}
                          onChange={(e) =>
                            updateThreshold(realIndex, 'yellow', Number(e.target.value))
                          }
                          disabled={!metric.visible}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-right tabular-nums focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-slate-100 disabled:text-slate-400"
                        />
                        <div className="mt-0.5 text-[9px] text-slate-400 text-right">{formatThreshold(metric.thresholds.yellow.max, metric.unit)}</div>
                      </div>
                    </div>

                    {/* Size selector — small, tucked at bottom */}
                    <div className="mt-2.5 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">Size</span>
                      <div className="flex items-center gap-1">
                        {(['sm', 'md', 'lg'] as const).map((size) => (
                          <button
                            key={size}
                            onClick={() => updateMetric(realIndex, { size })}
                            disabled={!metric.visible}
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition ${
                              metric.size === size
                                ? 'bg-slate-700 text-white'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-50'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 z-10 -mx-4 px-4 py-3 sm:py-4 bg-gradient-to-t from-slate-50 via-slate-50 to-slate-50/0">
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-between gap-3 rounded-2xl bg-white border border-slate-200 shadow-lg p-4">
          <button
            onClick={onRetry}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ← Start over with a different prompt
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-slate-500">
              {visibleCount} {visibleCount === 1 ? 'tile' : 'tiles'} ready
            </span>
            <button
              onClick={() => onConfirm(editedConfig)}
              disabled={visibleCount === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-navy-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Build my dashboard
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
