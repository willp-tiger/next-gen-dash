import { generateSnapshot } from './salesData.js';
import { getAnnotations } from './widgets.js';
import { getMetricDefs } from './kpiDefinitionStore.js';
import type { AnnotationEvent, DashboardConfig, FilterState } from '../../../shared/types.js';

type Health = 'GREEN' | 'YELLOW' | 'RED';

function computeHealth(
  value: number,
  greenMax: number,
  yellowMax: number,
  direction: 'higher-is-better' | 'lower-is-better',
): Health {
  if (direction === 'lower-is-better') {
    if (value <= greenMax) return 'GREEN';
    if (value <= yellowMax) return 'YELLOW';
    return 'RED';
  }
  if (value >= greenMax) return 'GREEN';
  if (value >= yellowMax) return 'YELLOW';
  return 'RED';
}

function fmtValue(value: number, unit: string): string {
  const u = unit.toLowerCase();
  if (u === 'percent' || u === '%') return `${value.toFixed(1)}%`;
  if (u === 'currency' || u === 'usd' || u === 'dollars') {
    return `$${Math.round(value).toLocaleString()}`;
  }
  if (u === 'days') return `${value.toFixed(1)} days`;
  if (u === 'count' || u === 'units') return Math.round(value).toLocaleString();
  if (u === 'turns') return `${value.toFixed(2)} turns`;
  return value.toFixed(2);
}

function fmtDelta(delta: number): string {
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`;
}

function fmtPct(pct: number): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function describeFilters(f?: FilterState): string {
  if (!f) return 'none';
  const parts: string[] = [];
  if (f.destination_region) parts.push(`region=${f.destination_region}`);
  if (f.warehouse_id) parts.push(`warehouse=${f.warehouse_id}`);
  if (f.customer_segment) parts.push(`segment=${f.customer_segment}`);
  if (f.sku_category) parts.push(`category=${f.sku_category}`);
  if (f.supplier_tier) parts.push(`supplier_tier=${f.supplier_tier}`);
  if (f.dateStart || f.dateEnd) parts.push(`dates=${f.dateStart ?? '*'}..${f.dateEnd ?? '*'}`);
  if (f.compareTo && f.compareTo !== 'none') parts.push(`compareTo=${f.compareTo}`);
  return parts.length ? parts.join(', ') : 'none';
}

function trendDescriptor(trend: number[] | undefined): string {
  if (!trend || trend.length === 0) return '(no trend data)';
  const tail = trend.slice(-6);
  return tail.map(v => v.toFixed(2)).join(' → ');
}

function annotationsInWindow(annotations: AnnotationEvent[], filters?: FilterState): AnnotationEvent[] {
  if (!filters?.dateStart && !filters?.dateEnd) return annotations;
  const wStart = filters?.dateStart ? new Date(filters.dateStart) : null;
  const wEnd = filters?.dateEnd ? new Date(filters.dateEnd) : null;
  return annotations.filter(a => {
    const aStart = new Date(a.date);
    const aEnd = new Date(a.endDate ?? a.date);
    if (wEnd && aStart > wEnd) return false;
    if (wStart && aEnd < wStart) return false;
    return true;
  });
}

/**
 * Produces a markdown-shaped "current state" payload the chat route paste into the user-message
 * context so Claude can answer interpretation questions ("is OTIF healthy?", "why is X red?")
 * from grounded numbers rather than guessing. Scoped to visible metrics + active globalFilters
 * so the payload stays bounded.
 */
export async function buildChatSnapshot(config: DashboardConfig): Promise<string> {
  const visibleMetrics = config.metrics.filter(m => m.visible);
  const uniqueIds = Array.from(new Set(visibleMetrics.map(m => m.id)));

  const lines: string[] = [];
  if (uniqueIds.length === 0) {
    return '## Current dashboard state\n\nNo visible metrics.';
  }

  const filters = config.globalFilters;
  const snapshot = await generateSnapshot(uniqueIds, filters);
  const defs = getMetricDefs();

  lines.push(`## Current dashboard state (as of ${snapshot.timestamp.slice(0, 10)})`);
  lines.push('');
  lines.push(`Active filters: ${describeFilters(filters)}`);
  lines.push('');
  lines.push('### Metric values');

  const seen = new Set<string>();
  for (const m of visibleMetrics) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const value = snapshot.metrics[m.id];
    if (!value) {
      lines.push(`- **${m.label}** (${m.id}): no current value available`);
      continue;
    }
    const def = defs.find(d => d.id === m.id);
    const direction = def?.direction ?? m.thresholds.direction;
    const greenMax = m.thresholds.green.max;
    const yellowMax = m.thresholds.yellow.max;
    const health = computeHealth(value.current, greenMax, yellowMax, direction);
    const thresholdStr = direction === 'lower-is-better'
      ? `green≤${greenMax}, yellow≤${yellowMax}, lower-is-better`
      : `green≥${greenMax}, yellow≥${yellowMax}, higher-is-better`;
    lines.push(`- **${m.label}** (${m.id}): ${fmtValue(value.current, m.unit)} — ${health} (${thresholdStr})`);
    lines.push(`  Trend (last 6): ${trendDescriptor(value.trend)} — Δ ${fmtDelta(value.delta)} / ${fmtPct(value.deltaPct)} vs prior point`);
    if (value.comparison) {
      lines.push(`  vs ${value.comparison.basisLabel}: ${fmtValue(value.comparison.previous, m.unit)} (Δ ${fmtDelta(value.comparison.deltaAbs)} / ${fmtPct(value.comparison.deltaPct)})`);
    }
  }

  const inWindow = annotationsInWindow(getAnnotations(), filters);
  if (inWindow.length > 0) {
    lines.push('');
    lines.push('### Active annotations in window');
    for (const a of inWindow) {
      const window = a.endDate && a.endDate !== a.date ? `${a.date} → ${a.endDate}` : a.date;
      lines.push(`- **${a.label}** (${window}, ${a.severity}): ${a.description}`);
      if (a.affectsMetrics && a.affectsMetrics.length > 0) {
        lines.push(`  Affects: ${a.affectsMetrics.join(', ')}`);
      }
    }
  }

  return lines.join('\n');
}
