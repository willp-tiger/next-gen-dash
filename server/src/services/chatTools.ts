import {
  generateSnapshot,
  generateCategoricalSnapshot,
} from './salesData.js';
import {
  generateTopN,
  generateDrill,
  generateTimeseries,
  getAnnotations,
} from './widgets.js';
import { getMetricDefs } from './kpiDefinitionStore.js';
import { getPublishedKpis } from './kpiStore.js';
import type { FilterState, PivotDimension, TopNDimension } from '../../../shared/types.js';

// === Tool definitions ===
//
// Curated tools exposed to Claude in the dashboard chat. Each tool maps 1:1 to an existing
// widgets/salesData service, with the dashboard's globalFilters merged in server-side so the
// model only needs to specify overrides. Keep descriptions tight — these ship in every Claude
// call's tools array.

const FILTER_SCHEMA = {
  type: 'object',
  description: 'Optional filter overrides. Merged over the dashboard\'s active globalFilters; only specify keys you want to set or change.',
  properties: {
    destination_region: { type: 'string', enum: ['NA', 'EMEA', 'APAC', 'LATAM'] },
    warehouse_id: { type: 'string', description: 'Warehouse id (e.g., WH-NA-01).' },
    customer_segment: { type: 'string', enum: ['Enterprise', 'Mid-Market', 'SMB'] },
    sku_category: { type: 'string', enum: ['Fasteners', 'Bearings', 'Hydraulics', 'Electrical', 'Safety', 'MRO', 'Cutting Tools'] },
    supplier_tier: { type: 'string', enum: ['Strategic', 'Preferred', 'Tactical'] },
    dateStart: { type: 'string', description: 'Inclusive start date, ISO YYYY-MM-DD.' },
    dateEnd: { type: 'string', description: 'Inclusive end date, ISO YYYY-MM-DD.' },
    compareTo: { type: 'string', enum: ['prior_period', 'prior_year', 'none'] },
  },
  additionalProperties: false,
} as const;

export interface ChatTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export const CHAT_TOOLS: ChatTool[] = [
  {
    name: 'get_metric_value',
    description: 'Return current value, recent trend tail, and any prior-period comparison for one or more KPIs. Use when the Current dashboard state section doesn\'t already include the metric, or when you need it under different filters. Don\'t call this for metrics that are already shown in the Current dashboard state — just cite the snapshot.',
    input_schema: {
      type: 'object',
      properties: {
        metric_ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          description: 'KPI ids (e.g., ["otif_rate"], ["supplier_otd", "supplier_otif"]).',
        },
        filters: FILTER_SCHEMA,
      },
      required: ['metric_ids'],
    },
  },
  {
    name: 'get_breakdown',
    description: 'Slice a single KPI across one categorical dimension. Use for questions like "OTIF by region", "stockout rate by ABC class", "exception rate by warehouse".',
    input_schema: {
      type: 'object',
      properties: {
        metric_id: { type: 'string', description: 'KPI id to break down.' },
        dimension: {
          type: 'string',
          enum: ['category', 'destination_region', 'warehouse_id', 'customer_segment', 'abc_class', 'supplier_tier'],
        },
        filters: FILTER_SCHEMA,
      },
      required: ['metric_id', 'dimension'],
    },
  },
  {
    name: 'get_top_n',
    description: 'Rank entities (supplier, customer, sku, warehouse, carrier, or category) by a metric. Use for "who are the worst suppliers by OTD?", "top 5 customers by backorder rate", "which carriers miss most often?". Set ascending=true when ranking "worst" of a higher-is-better metric, or "best" of a lower-is-better metric.',
    input_schema: {
      type: 'object',
      properties: {
        metric_id: { type: 'string' },
        dimension: {
          type: 'string',
          enum: ['supplier', 'customer', 'sku', 'warehouse', 'carrier', 'category'],
        },
        n: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        ascending: { type: 'boolean', default: false, description: 'true = lowest values first.' },
        filters: FILTER_SCHEMA,
      },
      required: ['metric_id', 'dimension'],
    },
  },
  {
    name: 'get_drill_rows',
    description: 'Fetch a sample of underlying transaction rows (shipments / POs / inventory / exceptions / returns) driving a metric. Use for "show me the shipments that missed OTIF", "which SKUs are stocked out", "give me the late PO lines". Returns rows already filtered to the relevant subset for the metric — for OTIF, late/partial shipments; for stockout, zero-on-hand positions; etc.',
    input_schema: {
      type: 'object',
      properties: {
        metric_id: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        filters: FILTER_SCHEMA,
      },
      required: ['metric_id'],
    },
  },
  {
    name: 'get_annotations',
    description: 'Fetch known business events / anomaly annotations (APAC port congestion, SUP-0042 OTD decline, EMEA logistics incident, Cutting Tools phase-out). Use for "what happened around date X?", "what\'s driving the dip?", "are there any known incidents in this window?". Returns annotations that intersect the date window (active filters if no override).',
    input_schema: {
      type: 'object',
      properties: {
        filters: FILTER_SCHEMA,
        metric_id: { type: 'string', description: 'Optional — only return annotations that affect this KPI.' },
      },
    },
  },
  {
    name: 'get_timeseries',
    description: 'Fetch a metric\'s time series at daily, weekly, or monthly grain over the active filter window, with overlapping annotations attached. Use for detailed trend analysis when the 6-point trend tail in the snapshot isn\'t enough.',
    input_schema: {
      type: 'object',
      properties: {
        metric_id: { type: 'string' },
        grain: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
        filters: FILTER_SCHEMA,
      },
      required: ['metric_id'],
    },
  },
];

// === Filter merge ===
//
// Tool's `filters` argument merges over dashboard.globalFilters. Empty strings and null are
// treated as "not provided" so the model can't accidentally clear a filter by passing "". To
// genuinely override a global value, the tool just passes the new value explicitly.

function mergeFilters(toolFilters: Partial<FilterState> | undefined, globalFilters: FilterState | undefined): FilterState {
  const merged: FilterState = { ...(globalFilters ?? {}) };
  if (!toolFilters) return merged;
  for (const [k, v] of Object.entries(toolFilters)) {
    if (v === null || v === undefined || v === '') continue;
    (merged as Record<string, unknown>)[k] = v;
  }
  return merged;
}

function knownMetricIds(): Set<string> {
  const ids = new Set<string>();
  for (const d of getMetricDefs()) ids.add(d.id);
  for (const k of getPublishedKpis()) ids.add(k.kpiId);
  return ids;
}

// === Executor ===

export interface ToolExecutionResult {
  /** Compact JSON payload returned to Claude as the tool_result content. */
  result: unknown;
  /** Optional one-line human-readable summary, used in UI evidence blocks. */
  summary?: string;
}

export async function executeChatTool(
  toolName: string,
  rawInput: unknown,
  globalFilters: FilterState | undefined,
): Promise<ToolExecutionResult> {
  // Defensive: the model occasionally returns input as a string. Normalize to object.
  const input = (typeof rawInput === 'string'
    ? safeParseJson(rawInput) ?? {}
    : (rawInput ?? {})) as Record<string, unknown>;

  const toolFilters = (input.filters && typeof input.filters === 'object') ? input.filters as Partial<FilterState> : undefined;
  const filters = mergeFilters(toolFilters, globalFilters);
  const known = knownMetricIds();

  switch (toolName) {
    case 'get_metric_value': {
      const ids = Array.isArray(input.metric_ids) ? (input.metric_ids as unknown[]).map(String) : [];
      const unknown = ids.filter(id => !known.has(id));
      const valid = ids.filter(id => known.has(id));
      if (valid.length === 0) {
        return { result: { error: 'No valid metric_ids', unknownIds: unknown, knownSample: Array.from(known).slice(0, 12) } };
      }
      const snap = await generateSnapshot(valid, filters);
      return {
        result: {
          timestamp: snap.timestamp,
          filters,
          metrics: snap.metrics,
          unknownIds: unknown.length ? unknown : undefined,
        },
        summary: `current value for ${valid.join(', ')}`,
      };
    }

    case 'get_breakdown': {
      const metricId = String(input.metric_id ?? '');
      const dim = String(input.dimension ?? '') as PivotDimension;
      if (!known.has(metricId)) {
        return { result: { error: `Unknown metric_id: ${metricId}`, knownSample: Array.from(known).slice(0, 12) } };
      }
      const cat = await generateCategoricalSnapshot([metricId], filters);
      // CategoricalSnapshot includes all dims; pick the one Claude asked for.
      const dimKeyMap: Record<PivotDimension, keyof typeof cat.breakdowns> = {
        category: 'byCategory',
        destination_region: 'byRegion',
        warehouse_id: 'byWarehouse',
        customer_segment: 'bySegment',
        abc_class: 'byAbcClass',
        supplier_tier: 'bySupplierTier',
      };
      const key = dimKeyMap[dim];
      if (!key) return { result: { error: `Unsupported dimension: ${dim}` } };
      const breakdown = cat.breakdowns[key];
      return {
        result: { metricId, dimension: dim, filters, values: breakdown.values },
        summary: `${metricId} by ${dim}`,
      };
    }

    case 'get_top_n': {
      const metricId = String(input.metric_id ?? '');
      const dim = String(input.dimension ?? '') as TopNDimension;
      const n = Math.max(1, Math.min(50, Number(input.n ?? 10)));
      const ascending = Boolean(input.ascending ?? false);
      if (!known.has(metricId)) {
        return { result: { error: `Unknown metric_id: ${metricId}`, knownSample: Array.from(known).slice(0, 12) } };
      }
      const validDims: TopNDimension[] = ['supplier', 'customer', 'sku', 'warehouse', 'carrier', 'category'];
      if (!validDims.includes(dim)) {
        return { result: { error: `Unsupported dimension: ${dim}`, validDimensions: validDims } };
      }
      const top = await generateTopN(metricId, dim, n, ascending, filters);
      return {
        result: { metricId, dimension: dim, ascending, filters, rows: top.rows },
        summary: `top ${n} ${dim} by ${metricId}${ascending ? ' (ascending)' : ''}`,
      };
    }

    case 'get_drill_rows': {
      const metricId = String(input.metric_id ?? '');
      const limit = Math.max(1, Math.min(50, Number(input.limit ?? 20)));
      if (!known.has(metricId)) {
        return { result: { error: `Unknown metric_id: ${metricId}`, knownSample: Array.from(known).slice(0, 12) } };
      }
      const drill = await generateDrill(metricId, filters, limit);
      return {
        result: {
          metricId,
          source: drill.source,
          rowDescription: drill.rowDescription,
          totalRows: drill.totalRows,
          returned: drill.rows.length,
          filters,
          columns: drill.columns.map(c => ({ key: c.key, label: c.label, kind: c.kind, primary: c.primary })),
          rows: drill.rows,
        },
        summary: `${drill.rows.length}/${drill.totalRows} rows for ${metricId} (${drill.source})`,
      };
    }

    case 'get_annotations': {
      const metricId = input.metric_id ? String(input.metric_id) : undefined;
      const all = getAnnotations();
      const wStart = filters?.dateStart ? new Date(filters.dateStart) : null;
      const wEnd = filters?.dateEnd ? new Date(filters.dateEnd) : null;
      const matched = all.filter(a => {
        if (metricId && a.affectsMetrics && a.affectsMetrics.length > 0 && !a.affectsMetrics.includes(metricId)) return false;
        const aStart = new Date(a.date);
        const aEnd = new Date(a.endDate ?? a.date);
        if (wEnd && aStart > wEnd) return false;
        if (wStart && aEnd < wStart) return false;
        return true;
      });
      return {
        result: { filters, metricId, annotations: matched },
        summary: `${matched.length} annotation(s)${metricId ? ` affecting ${metricId}` : ''}`,
      };
    }

    case 'get_timeseries': {
      const metricId = String(input.metric_id ?? '');
      const grain = (input.grain === 'daily' || input.grain === 'monthly') ? input.grain : 'weekly';
      if (!known.has(metricId)) {
        return { result: { error: `Unknown metric_id: ${metricId}`, knownSample: Array.from(known).slice(0, 12) } };
      }
      const ts = await generateTimeseries(metricId, grain, filters);
      return {
        result: {
          metricId,
          grain,
          filters,
          points: ts.points,
          annotations: ts.annotations,
        },
        summary: `${metricId} ${grain} series (${ts.points.length} points)`,
      };
    }

    default:
      return { result: { error: `Unknown tool: ${toolName}` } };
  }
}

function safeParseJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
