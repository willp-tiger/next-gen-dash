import pool from './db.js';
import { getPublishedKpi, getPublishedKpis } from './kpiStore.js';
import type { PublishedKpi } from './kpiStore.js';
import { getMetricDefs, normalizePublishedSql } from './kpiDefinitionStore.js';
import type { MetricDefinition } from './kpiDefinitionStore.js';
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

function buildConditions(filters: FilterState | undefined, startIdx: number): { conditions: string[]; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = startIdx;

  if (filters?.product_line) { conditions.push(`product_line = $${idx++}`); params.push(filters.product_line); }
  if (filters?.country) { conditions.push(`country = $${idx++}`); params.push(filters.country); }
  if (filters?.territory) { conditions.push(`territory = $${idx++}`); params.push(filters.territory); }
  if (filters?.deal_size) { conditions.push(`deal_size = $${idx++}`); params.push(filters.deal_size); }
  if (filters?.dateStart) { conditions.push(`order_date >= $${idx++}`); params.push(filters.dateStart); }
  if (filters?.dateEnd) { conditions.push(`order_date <= $${idx++}`); params.push(filters.dateEnd); }

  return { conditions, params };
}

function applyFilters(baseSql: string, filters?: FilterState): { sql: string; params: unknown[] } {
  const { conditions, params } = buildConditions(filters, 1);
  if (conditions.length === 0) return { sql: baseSql, params: [] };

  const filterClause = conditions.join(' AND ');
  const modified = baseSql.replace(/FROM sales_orders/g, `FROM sales_orders WHERE ${filterClause}`);
  return { sql: modified, params };
}

async function queryMetric(def: MetricDefinition, filters?: FilterState): Promise<MetricValue> {
  const { sql, params } = applyFilters(def.sql, filters);

  const queries: Promise<{ rows: { value: string }[] }>[] = [pool.query(sql, params)];
  if (def.trendSql) {
    const { sql: trendSql, params: trendParams } = applyFilters(def.trendSql, filters);
    queries.push(pool.query(trendSql, trendParams));
  }
  const [valueRes, trendRes] = await Promise.all(queries);

  const current = parseFloat(valueRes.rows[0]?.value ?? 0);
  const trend = trendRes
    ? trendRes.rows.map((r: { value: string }) => parseFloat(r.value || '0'))
    : [];
  const prev = trend.length >= 2 ? trend[trend.length - 2] : current;
  const delta = parseFloat((current - prev).toFixed(2));

  return {
    current: parseFloat(current.toFixed(2)),
    trend,
    delta,
  };
}

function publishedToDef(k: PublishedKpi): MetricDefinition {
  return {
    id: k.kpiId,
    label: k.displayName,
    unit: k.unit,
    chartType: 'number',
    direction: k.direction,
    greenMax: k.thresholds.greenMax,
    yellowMax: k.thresholds.yellowMax,
    sql: normalizePublishedSql(k.sqlLogic),
    trendSql: '', // Published KPIs have no trend series; UI must render without sparkline.
  };
}

function resolveDefs(metricIds?: string[]): MetricDefinition[] {
  if (!metricIds) {
    return [...getMetricDefs(), ...getPublishedKpis().map(publishedToDef)];
  }
  const out: MetricDefinition[] = [];
  for (const id of metricIds) {
    const builtIn = getMetricDefs().find(d => d.id === id);
    if (builtIn) { out.push(builtIn); continue; }
    const pub = getPublishedKpi(id);
    if (pub) { out.push(publishedToDef(pub)); continue; }
  }
  return out;
}

export async function generateSnapshot(metricIds?: string[], filters?: FilterState): Promise<MetricsSnapshot> {
  const defs = resolveDefs(metricIds);

  const results = await Promise.all(defs.map(d =>
    queryMetric(d, filters).then(
      (value) => ({ ok: true as const, value }),
      (err) => {
        console.error(`Metric ${d.id} failed:`, err?.message ?? err);
        return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
      }
    )
  ));
  const metrics: Record<string, MetricValue> = {};
  defs.forEach((d, i) => {
    const r = results[i];
    if (r.ok) metrics[d.id] = r.value;
    // Failed metrics are omitted from the snapshot so the client can render
    // an explicit "no data" state instead of a misleading 0.
  });

  return { timestamp: new Date().toISOString(), metrics };
}

export async function generateCategoricalSnapshot(
  metricIds?: string[],
  filters?: FilterState
): Promise<CategoricalSnapshot> {
  const snapshot = await generateSnapshot(metricIds, filters);

  const filterClause = buildFilterWhere(filters);

  const [byProductLine, byCountry, byTerritory] = await Promise.all([
    pool.query(`SELECT product_line AS label, SUM(sales) AS value FROM sales_orders ${filterClause.sql} GROUP BY product_line ORDER BY value DESC`, filterClause.params),
    pool.query(`SELECT country AS label, SUM(sales) AS value FROM sales_orders ${filterClause.sql} GROUP BY country ORDER BY value DESC LIMIT 10`, filterClause.params),
    pool.query(`SELECT territory AS label, SUM(sales) AS value FROM sales_orders ${filterClause.sql} GROUP BY territory ORDER BY value DESC`, filterClause.params),
  ]);

  return {
    timestamp: snapshot.timestamp,
    filters: filters || {},
    metrics: snapshot.metrics,
    breakdowns: {
      byProductLine: { category: 'product_line', values: byProductLine.rows.map((r: { label: string; value: string }) => ({ label: r.label, value: parseFloat(r.value) })) },
      byCountry: { category: 'country', values: byCountry.rows.map((r: { label: string; value: string }) => ({ label: r.label, value: parseFloat(r.value) })) },
      byTerritory: { category: 'territory', values: byTerritory.rows.map((r: { label: string; value: string }) => ({ label: r.label, value: parseFloat(r.value) })) },
    },
  };
}

function buildFilterWhere(filters?: FilterState): { sql: string; params: unknown[] } {
  const { conditions, params } = buildConditions(filters, 1);
  return { sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

export interface HeatmapSnapshot {
  timestamp: string;
  rowDimension: string;
  colDimension: string;
  rowLabels: string[];
  colLabels: string[];
  grid: (number | null)[][];
}

const HEATMAP_DIMS: Record<string, string> = {
  product_line: 'product_line',
  country: 'country',
  territory: 'territory',
  deal_size: 'deal_size',
};

export async function generateHeatmapBreakdown(
  rowDim: string,
  colDim: string,
  filters?: FilterState
): Promise<HeatmapSnapshot> {
  const rowCol = HEATMAP_DIMS[rowDim];
  const colCol = HEATMAP_DIMS[colDim];
  if (!rowCol || !colCol) throw new Error(`Invalid heatmap dimensions: ${rowDim} x ${colDim}`);

  const where = buildFilterWhere(filters);
  const sql = `SELECT ${rowCol} AS row_label, ${colCol} AS col_label, SUM(sales) AS value
               FROM sales_orders ${where.sql}
               GROUP BY ${rowCol}, ${colCol}
               ORDER BY ${rowCol}, ${colCol}`;
  const { rows } = await pool.query(sql, where.params);

  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  const map = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const rl = String(r.row_label);
    const cl = String(r.col_label);
    rowSet.add(rl);
    colSet.add(cl);
    if (!map.has(rl)) map.set(rl, new Map());
    map.get(rl)!.set(cl, parseFloat(r.value));
  }

  const rowLabels = Array.from(rowSet).sort();
  const colLabels = Array.from(colSet).sort();
  const grid: (number | null)[][] = rowLabels.map(rl =>
    colLabels.map(cl => map.get(rl)?.get(cl) ?? null)
  );

  return {
    timestamp: new Date().toISOString(),
    rowDimension: rowDim,
    colDimension: colDim,
    rowLabels,
    colLabels,
    grid,
  };
}

export async function getAvailableFilters() {
  const [productLines, countries, territories, dealSizes, dateRange] = await Promise.all([
    pool.query(`SELECT DISTINCT product_line FROM sales_orders ORDER BY product_line`),
    pool.query(`SELECT DISTINCT country FROM sales_orders ORDER BY country`),
    pool.query(`SELECT DISTINCT territory FROM sales_orders ORDER BY territory`),
    pool.query(`SELECT DISTINCT deal_size FROM sales_orders ORDER BY deal_size`),
    pool.query(`SELECT MIN(order_date)::text AS min_date, MAX(order_date)::text AS max_date FROM sales_orders`),
  ]);

  return {
    productLines: productLines.rows.map((r: { product_line: string }) => r.product_line),
    countries: countries.rows.map((r: { country: string }) => r.country),
    territories: territories.rows.map((r: { territory: string }) => r.territory),
    dealSizes: dealSizes.rows.map((r: { deal_size: string }) => r.deal_size),
    minDate: dateRange.rows[0]?.min_date ?? null,
    maxDate: dateRange.rows[0]?.max_date ?? null,
  };
}

export function getCanonicalConfig(): DashboardConfig {
  const now = new Date().toISOString();
  const metrics: MetricConfig[] = getMetricDefs().map((def, index) => ({
    id: def.id,
    label: def.label,
    unit: def.unit,
    chartType: def.chartType as MetricConfig['chartType'],
    size: 'md' as const,
    thresholds: {
      green: { max: def.greenMax },
      yellow: { max: def.yellowMax },
      direction: def.direction,
    },
    position: index,
    visible: true,
  }));

  const layout: LayoutConfig = { columns: 3, showCanonicalToggle: true };

  return {
    userId: 'canonical',
    createdAt: now,
    updatedAt: now,
    userPrompt: '',
    interpretation: {
      summary: 'Canonical dashboard showing all available sales metrics.',
      priorities: [
        { label: 'Comprehensive Overview', weight: 1, reasoning: 'Display all metrics for full visibility.' },
      ],
    },
    metrics,
    layout,
  };
}

export function getPersonaConfigs(): Record<string, DashboardConfig> {
  const now = new Date().toISOString();

  const salesRep: DashboardConfig = {
    userId: 'persona-sales-rep',
    createdAt: now, updatedAt: now,
    userPrompt: "I'm a sales rep -- I care about my orders, revenue, and deal sizes",
    interpretation: {
      summary: 'Focused on order volume, revenue generation, and deal size optimization.',
      priorities: [
        { label: 'Revenue Generation', weight: 1.0, reasoning: 'Sales reps need visibility into revenue performance.' },
        { label: 'Order Volume', weight: 0.8, reasoning: 'Tracking order flow is essential for pipeline management.' },
        { label: 'Deal Quality', weight: 0.6, reasoning: 'Deal size indicates negotiation effectiveness.' },
      ],
    },
    metrics: [
      { id: 'total_revenue', label: 'Total Revenue', unit: 'dollars', chartType: 'line', size: 'lg', thresholds: { green: { max: 300000 }, yellow: { max: 200000 }, direction: 'higher-is-better' }, position: 0, visible: true },
      { id: 'total_orders', label: 'Total Orders', unit: 'count', chartType: 'bar', size: 'md', thresholds: { green: { max: 350 }, yellow: { max: 250 }, direction: 'higher-is-better' }, position: 1, visible: true },
      { id: 'avg_order_value', label: 'Avg Order Value', unit: 'dollars', chartType: 'line', size: 'md', thresholds: { green: { max: 4000 }, yellow: { max: 3000 }, direction: 'higher-is-better' }, position: 2, visible: true },
      { id: 'avg_deal_size_value', label: 'Avg Deal Size', unit: 'dollars', chartType: 'area', size: 'md', thresholds: { green: { max: 4500 }, yellow: { max: 3000 }, direction: 'higher-is-better' }, position: 3, visible: true },
      { id: 'units_sold', label: 'Units Sold', unit: 'count', chartType: 'bar', size: 'sm', thresholds: { green: { max: 35000 }, yellow: { max: 25000 }, direction: 'higher-is-better' }, position: 4, visible: true },
      { id: 'order_frequency', label: 'Orders per Customer', unit: 'count', chartType: 'bar', size: 'sm', thresholds: { green: { max: 4 }, yellow: { max: 2 }, direction: 'higher-is-better' }, position: 5, visible: true },
    ],
    layout: { columns: 3, showCanonicalToggle: true },
  };

  const director: DashboardConfig = {
    userId: 'persona-director',
    createdAt: now, updatedAt: now,
    userPrompt: "I'm a sales director focused on fulfillment rates and territory performance",
    interpretation: {
      summary: 'Strategic view focused on operational health, territory balance, and fulfillment quality.',
      priorities: [
        { label: 'Fulfillment Quality', weight: 1.0, reasoning: 'Directors are accountable for order fulfillment.' },
        { label: 'Territory Balance', weight: 0.85, reasoning: 'Revenue concentration risk across territories.' },
        { label: 'Customer Value', weight: 0.7, reasoning: 'Revenue per customer indicates account health.' },
      ],
    },
    metrics: [
      { id: 'fulfillment_rate', label: 'Fulfillment Rate', unit: 'percent', chartType: 'gauge', size: 'lg', thresholds: { green: { max: 95 }, yellow: { max: 85 }, direction: 'higher-is-better' }, position: 0, visible: true },
      { id: 'cancelled_order_rate', label: 'Cancelled Order Rate', unit: 'percent', chartType: 'bar', size: 'lg', thresholds: { green: { max: 3 }, yellow: { max: 7 }, direction: 'lower-is-better' }, position: 1, visible: true },
      { id: 'territory_revenue_share', label: 'Top Territory Revenue %', unit: 'percent', chartType: 'gauge', size: 'md', thresholds: { green: { max: 40 }, yellow: { max: 55 }, direction: 'lower-is-better' }, position: 2, visible: true },
      { id: 'revenue_per_customer', label: 'Revenue per Customer', unit: 'dollars', chartType: 'line', size: 'md', thresholds: { green: { max: 120000 }, yellow: { max: 80000 }, direction: 'higher-is-better' }, position: 3, visible: true },
      { id: 'total_revenue', label: 'Total Revenue', unit: 'dollars', chartType: 'number', size: 'sm', thresholds: { green: { max: 300000 }, yellow: { max: 200000 }, direction: 'higher-is-better' }, position: 4, visible: true },
      { id: 'total_orders', label: 'Total Orders', unit: 'count', chartType: 'number', size: 'sm', thresholds: { green: { max: 350 }, yellow: { max: 250 }, direction: 'higher-is-better' }, position: 5, visible: true },
    ],
    layout: { columns: 3, showCanonicalToggle: true },
  };

  const executive: DashboardConfig = {
    userId: 'persona-executive',
    createdAt: now, updatedAt: now,
    userPrompt: "I'm an executive tracking revenue growth and cost efficiency",
    interpretation: {
      summary: 'Executive-level view focused on revenue trajectory, pricing, and customer lifetime value.',
      priorities: [
        { label: 'Revenue Growth', weight: 1.0, reasoning: 'Top-line growth is the primary executive metric.' },
        { label: 'Pricing Efficiency', weight: 0.9, reasoning: 'Average price trends drive margin analysis.' },
        { label: 'Customer Economics', weight: 0.5, reasoning: 'Revenue per customer for strategic planning.' },
      ],
    },
    metrics: [
      { id: 'total_revenue', label: 'Total Revenue', unit: 'dollars', chartType: 'line', size: 'lg', thresholds: { green: { max: 300000 }, yellow: { max: 200000 }, direction: 'higher-is-better' }, position: 0, visible: true },
      { id: 'avg_price', label: 'Avg Price per Unit', unit: 'dollars', chartType: 'line', size: 'lg', thresholds: { green: { max: 90 }, yellow: { max: 75 }, direction: 'higher-is-better' }, position: 1, visible: true },
      { id: 'revenue_per_customer', label: 'Revenue per Customer', unit: 'dollars', chartType: 'line', size: 'md', thresholds: { green: { max: 120000 }, yellow: { max: 80000 }, direction: 'higher-is-better' }, position: 2, visible: true },
      { id: 'fulfillment_rate', label: 'Fulfillment Rate', unit: 'percent', chartType: 'gauge', size: 'md', thresholds: { green: { max: 95 }, yellow: { max: 85 }, direction: 'higher-is-better' }, position: 3, visible: true },
      { id: 'cancelled_order_rate', label: 'Cancelled Order Rate', unit: 'percent', chartType: 'number', size: 'sm', thresholds: { green: { max: 3 }, yellow: { max: 7 }, direction: 'lower-is-better' }, position: 4, visible: true },
    ],
    layout: { columns: 2, showCanonicalToggle: true },
  };

  return { 'sales-rep': salesRep, director, executive };
}

export { getMetricDefs };
