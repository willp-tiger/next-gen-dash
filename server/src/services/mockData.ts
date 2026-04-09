import type {
  MetricsSnapshot,
  MetricValue,
  MetricConfig,
  DashboardConfig,
  LayoutConfig,
  ThresholdConfig,
  FilterState,
  CategoricalSnapshot,
  CategoryBreakdown,
} from '../../../shared/types.js';
import { VEHICLE_MAKES, VEHICLE_MODELS } from '../../../shared/types.js';

interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
  base: number;
  noise: number;
  chartType: MetricConfig['chartType'];
  direction: ThresholdConfig['direction'];
  greenMax: number;
  yellowMax: number;
}

const METRIC_DEFS: MetricDefinition[] = [
  { id: 'avg_wait_time', label: 'Avg Wait Time', unit: 'minutes', base: 3.2, noise: 1.5, chartType: 'line', direction: 'lower-is-better', greenMax: 3, yellowMax: 5 },
  { id: 'max_wait_time', label: 'Max Wait Time', unit: 'minutes', base: 8.0, noise: 4.0, chartType: 'line', direction: 'lower-is-better', greenMax: 8, yellowMax: 15 },
  { id: 'queue_depth', label: 'Queue Depth', unit: 'count', base: 12, noise: 8, chartType: 'bar', direction: 'lower-is-better', greenMax: 10, yellowMax: 20 },
  { id: 'staffing_ratio', label: 'Staffing Ratio', unit: 'ratio', base: 1.1, noise: 0.3, chartType: 'gauge', direction: 'higher-is-better', greenMax: 1.5, yellowMax: 1.0 },
  { id: 'sla_compliance', label: 'SLA Compliance', unit: 'percent', base: 87, noise: 8, chartType: 'gauge', direction: 'higher-is-better', greenMax: 95, yellowMax: 80 },
  { id: 'escalation_rate', label: 'Escalation Rate', unit: 'percent', base: 12, noise: 5, chartType: 'bar', direction: 'lower-is-better', greenMax: 10, yellowMax: 20 },
  { id: 'first_contact_resolution', label: 'First Contact Resolution', unit: 'percent', base: 72, noise: 10, chartType: 'area', direction: 'higher-is-better', greenMax: 80, yellowMax: 60 },
  { id: 'cost_per_ticket', label: 'Cost per Ticket', unit: 'dollars', base: 18, noise: 6, chartType: 'line', direction: 'lower-is-better', greenMax: 15, yellowMax: 25 },
  { id: 'csat_score', label: 'CSAT Score', unit: 'score', base: 3.8, noise: 0.6, chartType: 'gauge', direction: 'higher-is-better', greenMax: 4.5, yellowMax: 3.5 },
  { id: 'agent_utilization', label: 'Agent Utilization', unit: 'percent', base: 78, noise: 12, chartType: 'area', direction: 'higher-is-better', greenMax: 85, yellowMax: 65 },
  { id: 'abandon_rate', label: 'Abandon Rate', unit: 'percent', base: 8, noise: 4, chartType: 'bar', direction: 'lower-is-better', greenMax: 5, yellowMax: 12 },
  { id: 'avg_handle_time', label: 'Avg Handle Time', unit: 'minutes', base: 7.5, noise: 3, chartType: 'line', direction: 'lower-is-better', greenMax: 7, yellowMax: 12 },
];

// Persistent trend arrays that evolve via random walk
const trends: Map<string, number[]> = new Map();

function initTrend(def: MetricDefinition): number[] {
  const points: number[] = [];
  let value = def.base;
  for (let i = 0; i < 24; i++) {
    value += (Math.random() - 0.5) * def.noise * 0.3;
    value = Math.max(0, value);
    points.push(parseFloat(value.toFixed(2)));
  }
  return points;
}

function advanceTrend(def: MetricDefinition): number[] {
  let points = trends.get(def.id);
  if (!points) {
    points = initTrend(def);
  }
  // Shift left and append new point via random walk from last value
  const last = points[points.length - 1];
  const next = Math.max(0, last + (Math.random() - 0.5) * def.noise * 0.4);
  points = [...points.slice(1), parseFloat(next.toFixed(2))];
  trends.set(def.id, points);
  return points;
}

function generateMetricValue(def: MetricDefinition): MetricValue {
  const trend = advanceTrend(def);
  const current = parseFloat(
    (def.base + (Math.random() - 0.5) * def.noise).toFixed(2)
  );
  const previous = trend[trend.length - 2] ?? def.base;
  const delta = parseFloat((current - previous).toFixed(2));
  return { current: Math.max(0, current), trend, delta };
}

export function generateSnapshot(metricIds?: string[]): MetricsSnapshot {
  const defs = metricIds
    ? METRIC_DEFS.filter((d) => metricIds.includes(d.id))
    : METRIC_DEFS;

  const metrics: Record<string, MetricValue> = {};
  for (const def of defs) {
    metrics[def.id] = generateMetricValue(def);
  }

  return {
    timestamp: new Date().toISOString(),
    metrics,
  };
}

export function getCanonicalConfig(): DashboardConfig {
  const now = new Date().toISOString();
  const metrics: MetricConfig[] = METRIC_DEFS.map((def, index) => ({
    id: def.id,
    label: def.label,
    unit: def.unit,
    chartType: def.chartType,
    size: 'md' as const,
    thresholds: {
      green: { max: def.greenMax },
      yellow: { max: def.yellowMax },
      direction: def.direction,
    },
    position: index,
    visible: true,
  }));

  const layout: LayoutConfig = {
    columns: 3,
    showCanonicalToggle: true,
  };

  return {
    userId: 'canonical',
    createdAt: now,
    updatedAt: now,
    userPrompt: '',
    interpretation: {
      summary: 'Canonical dashboard showing all available queue health metrics.',
      priorities: [
        { label: 'Comprehensive Overview', weight: 1, reasoning: 'Display all metrics for full visibility.' },
      ],
    },
    metrics,
    layout,
  };
}

// === Categorical Data Generation ===

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = (h * 1664525 + 1013904223) | 0;
    return ((h >>> 0) / 4294967296);
  };
}

function generateBreakdown(category: string, labels: string[], baseValue: number, noise: number): CategoryBreakdown {
  const rng = seededRandom(category + new Date().toISOString().slice(0, 13));
  return {
    category,
    values: labels.map(label => ({
      label,
      value: parseFloat((baseValue + (rng() - 0.5) * noise * 2).toFixed(1)),
    })),
  };
}

function getLast7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function applyFilterMultiplier(filters: FilterState): number {
  // Simulate filters affecting metric values slightly
  let mult = 1.0;
  if (filters.make) {
    const idx = VEHICLE_MAKES.indexOf(filters.make as any);
    mult += (idx - 2) * 0.03; // different makes shift values slightly
  }
  if (filters.model) {
    mult += (filters.model.length % 3 - 1) * 0.02;
  }
  return mult;
}

export function generateCategoricalSnapshot(
  metricIds?: string[],
  filters?: FilterState
): CategoricalSnapshot {
  const appliedFilters = filters || {};
  const mult = applyFilterMultiplier(appliedFilters);

  const defs = metricIds
    ? METRIC_DEFS.filter((d) => metricIds.includes(d.id))
    : METRIC_DEFS;

  const metrics: Record<string, MetricValue> = {};
  for (const def of defs) {
    const val = generateMetricValue(def);
    metrics[def.id] = {
      current: parseFloat((val.current * mult).toFixed(2)),
      trend: val.trend.map(t => parseFloat((t * mult).toFixed(2))),
      delta: val.delta,
    };
  }

  // Filter models based on selected make
  const makes = VEHICLE_MAKES as unknown as string[];
  const models = appliedFilters.make
    ? VEHICLE_MODELS[appliedFilters.make as keyof typeof VEHICLE_MODELS] || []
    : ['Camry', 'Civic', 'F-150', 'Silverado', '3 Series', 'Model 3'];

  const dates = getLast7Days();

  // Generate breakdowns for a representative metric
  const throughputBase = 12;
  const qualityBase = 85;

  return {
    timestamp: new Date().toISOString(),
    filters: appliedFilters,
    metrics,
    breakdowns: {
      byMake: generateBreakdown('make', makes, throughputBase, 4),
      byModel: generateBreakdown('model', models, throughputBase, 3),
      byDate: generateBreakdown('date', dates, throughputBase, 2),
    },
  };
}

export function getAvailableFilters() {
  return {
    makes: [...VEHICLE_MAKES],
    models: VEHICLE_MODELS,
    dateRange: {
      min: getLast7Days()[0],
      max: getLast7Days()[6],
    },
  };
}

export { METRIC_DEFS };
