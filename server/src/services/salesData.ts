import pool from './db.js';
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

// === Metric Definitions ===

interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
  chartType: MetricConfig['chartType'];
  direction: ThresholdConfig['direction'];
  greenMax: number;
  yellowMax: number;
  sql: string;
  trendSql: string;
}

const METRIC_DEFS: MetricDefinition[] = [
  {
    id: 'total_revenue',
    label: 'Total Revenue',
    unit: 'dollars',
    chartType: 'line',
    direction: 'higher-is-better',
    greenMax: 300000,
    yellowMax: 200000,
    sql: `SELECT COALESCE(SUM(sales), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, SUM(sales) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
  },
  {
    id: 'avg_order_value',
    label: 'Avg Order Value',
    unit: 'dollars',
    chartType: 'line',
    direction: 'higher-is-better',
    greenMax: 4000,
    yellowMax: 3000,
    sql: `SELECT COALESCE(AVG(sales), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, AVG(sales) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
  },
  {
    id: 'total_orders',
    label: 'Total Orders',
    unit: 'count',
    chartType: 'bar',
    direction: 'higher-is-better',
    greenMax: 350,
    yellowMax: 250,
    sql: `SELECT COUNT(DISTINCT order_number) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, COUNT(DISTINCT order_number) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
  },
  {
    id: 'units_sold',
    label: 'Units Sold',
    unit: 'count',
    chartType: 'bar',
    direction: 'higher-is-better',
    greenMax: 35000,
    yellowMax: 25000,
    sql: `SELECT COALESCE(SUM(quantity_ordered), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, SUM(quantity_ordered) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
  },
  {
    id: 'avg_price',
    label: 'Avg Price per Unit',
    unit: 'dollars',
    chartType: 'line',
    direction: 'higher-is-better',
    greenMax: 90,
    yellowMax: 75,
    sql: `SELECT COALESCE(AVG(price_each), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, AVG(price_each) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
  },
  {
    id: 'fulfillment_rate',
    label: 'Fulfillment Rate',
    unit: 'percent',
    chartType: 'gauge',
    direction: 'higher-is-better',
    greenMax: 95,
    yellowMax: 85,
    sql: `SELECT COUNT(CASE WHEN status = 'Shipped' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, COUNT(CASE WHEN status = 'Shipped' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
  },
  {
    id: 'cancelled_order_rate',
    label: 'Cancelled Order Rate',
    unit: 'percent',
    chartType: 'bar',
    direction: 'lower-is-better',
    greenMax: 3,
    yellowMax: 7,
    sql: `SELECT COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) * 100.0 / NULLIF(COUNT(DISTINCT order_number), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) * 100.0 / NULLIF(COUNT(DISTINCT order_number), 0) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
  },
  {
    id: 'avg_deal_size_value',
    label: 'Avg Deal Size',
    unit: 'dollars',
    chartType: 'area',
    direction: 'higher-is-better',
    greenMax: 4500,
    yellowMax: 3000,
    sql: `SELECT COALESCE(AVG(total), 0) AS value FROM (SELECT order_number, SUM(sales) AS total FROM sales_orders GROUP BY order_number) sub`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, AVG(total) AS value FROM (SELECT order_number, year_id, qtr_id, SUM(sales) AS total FROM sales_orders GROUP BY order_number, year_id, qtr_id) sub GROUP BY year_id, qtr_id, period ORDER BY period`,
  },
  {
    id: 'revenue_per_customer',
    label: 'Revenue per Customer',
    unit: 'dollars',
    chartType: 'line',
    direction: 'higher-is-better',
    greenMax: 120000,
    yellowMax: 80000,
    sql: `SELECT COALESCE(SUM(sales) / NULLIF(COUNT(DISTINCT customer_name), 0), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, SUM(sales) / NULLIF(COUNT(DISTINCT customer_name), 0) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
  },
  {
    id: 'order_frequency',
    label: 'Orders per Customer',
    unit: 'count',
    chartType: 'bar',
    direction: 'higher-is-better',
    greenMax: 4,
    yellowMax: 2,
    sql: `SELECT COALESCE(COUNT(DISTINCT order_number)::float / NULLIF(COUNT(DISTINCT customer_name), 0), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, COUNT(DISTINCT order_number)::float / NULLIF(COUNT(DISTINCT customer_name), 0) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
  },
  {
    id: 'product_line_count',
    label: 'Active Product Lines',
    unit: 'count',
    chartType: 'number',
    direction: 'higher-is-better',
    greenMax: 7,
    yellowMax: 5,
    sql: `SELECT COUNT(DISTINCT product_line) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, COUNT(DISTINCT product_line) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
  },
  {
    id: 'territory_revenue_share',
    label: 'Top Territory Revenue %',
    unit: 'percent',
    chartType: 'gauge',
    direction: 'lower-is-better',
    greenMax: 40,
    yellowMax: 55,
    sql: `SELECT MAX(terr_rev) * 100.0 / NULLIF(SUM(terr_rev), 0) AS value FROM (SELECT territory, SUM(sales) AS terr_rev FROM sales_orders GROUP BY territory) sub`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, MAX(terr_rev) * 100.0 / NULLIF(SUM(terr_rev), 0) AS value FROM (SELECT year_id, qtr_id, territory, SUM(sales) AS terr_rev FROM sales_orders GROUP BY year_id, qtr_id, territory) sub GROUP BY year_id, qtr_id, period ORDER BY period`,
  },
];

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
  const { sql: trendSql, params: trendParams } = applyFilters(def.trendSql, filters);

  const [valueRes, trendRes] = await Promise.all([
    pool.query(sql, params),
    pool.query(trendSql, trendParams),
  ]);

  const current = parseFloat(valueRes.rows[0]?.value ?? 0);
  const trend = trendRes.rows.map((r: { value: string }) => parseFloat(r.value || '0'));
  const prev = trend.length >= 2 ? trend[trend.length - 2] : current;
  const delta = parseFloat((current - prev).toFixed(2));

  return {
    current: parseFloat(current.toFixed(2)),
    trend,
    delta,
  };
}

export async function generateSnapshot(metricIds?: string[], filters?: FilterState): Promise<MetricsSnapshot> {
  const defs = metricIds
    ? METRIC_DEFS.filter(d => metricIds.includes(d.id))
    : METRIC_DEFS;

  const results = await Promise.all(defs.map(d => queryMetric(d, filters)));
  const metrics: Record<string, MetricValue> = {};
  defs.forEach((d, i) => { metrics[d.id] = results[i]; });

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

export { METRIC_DEFS };
