import pool from './db.js';
import { getPublishedKpi, getPublishedKpis } from './kpiStore.js';
import type { PublishedKpi } from './kpiStore.js';
import { getMetricDefs, normalizePublishedSql } from './kpiDefinitionStore.js';
import type { MetricDefinition } from './kpiDefinitionStore.js';
import { PIVOT_DIM_SPECS, pivotValueExprFor } from './widgets.js';
import type {
  MetricsSnapshot,
  MetricValue,
  MetricConfig,
  DashboardConfig,
  LayoutConfig,
  FilterState,
  CategoricalSnapshot,
  CategoryBreakdown,
} from '../../../shared/types.js';

// === Filter application ===
//
// The KPI execSql queries reference one or more fact tables (shipments, inventory_snapshots,
// purchase_orders, exceptions, returns). We wrap each referenced fact table in a CTE that
// pre-filters it, then rewrite the table references to point to the CTE. This works correctly
// even when the SQL already has WHERE clauses, JOINs, subqueries, or its own leading WITH
// clause.
//
// Per-table date columns:
//   - shipments:           order_date
//   - inventory_snapshots: snapshot_date
//   - purchase_orders:     ordered_date
//   - exceptions:          event_date
//   - returns:             return_date
//
// Dimension filters (customer_segment, sku_category, supplier_tier) are applied via
// IN-subqueries against the dimension tables. They do not require additional joins in
// the metric SQL itself.
//
// Exceptions and returns are also cross-filtered by shipment_id / po_id IN _shipments_f /
// _po_f when a non-date dimension is active on those tables. This keeps numerator and
// denominator scoped consistently for rate metrics (exception_rate, damage_rate,
// return_rate, supplier_defect_rate).

interface CteSpec { cteName: string; body: string; }

function injectCtes(sql: string, ctes: CteSpec[]): string {
  if (ctes.length === 0) return sql;
  const cteDecls = ctes.map(c => `${c.cteName} AS (${c.body})`).join(', ');
  if (/^\s*WITH\s/i.test(sql)) {
    // Use the function-replacement form: a string template would interpret `$1`/`$2`
    // inside cteDecls (which are SQL parameter placeholders) as regex backreferences,
    // corrupting the query.
    return sql.replace(/^(\s*WITH\s+)/i, (_match, leadingWith) => `${leadingWith}${cteDecls}, `);
  }
  return `WITH ${cteDecls}\n${sql}`;
}

export function applyFilters(sql: string, filters?: FilterState): { sql: string; params: unknown[] } {
  if (!filters) return { sql, params: [] };

  const params: unknown[] = [];
  let p = 1;
  const ctes: CteSpec[] = [];
  let modified = sql;

  // ----- shipments -----
  if (/\bshipments\b/i.test(modified)) {
    const conds: string[] = [];
    if (filters.destination_region) { conds.push(`destination_region = $${p++}`); params.push(filters.destination_region); }
    if (filters.warehouse_id) { conds.push(`warehouse_id = $${p++}`); params.push(filters.warehouse_id); }
    if (filters.dateStart) { conds.push(`order_date >= $${p++}`); params.push(filters.dateStart); }
    if (filters.dateEnd) { conds.push(`order_date <= $${p++}`); params.push(filters.dateEnd); }
    if (filters.customer_segment) {
      conds.push(`customer_id IN (SELECT customer_id FROM customers WHERE segment = $${p++})`);
      params.push(filters.customer_segment);
    }
    if (filters.sku_category) {
      conds.push(`shipment_id IN (SELECT DISTINCT shipment_id FROM shipment_lines WHERE sku_id IN (SELECT sku_id FROM skus WHERE category = $${p++}))`);
      params.push(filters.sku_category);
    }
    if (filters.supplier_tier) {
      conds.push(`shipment_id IN (SELECT DISTINCT shipment_id FROM shipment_lines WHERE sku_id IN (SELECT sku_id FROM skus WHERE primary_supplier_id IN (SELECT supplier_id FROM suppliers WHERE tier = $${p++})))`);
      params.push(filters.supplier_tier);
    }
    if (conds.length > 0) {
      const cteName = '_shipments_f';
      ctes.push({ cteName, body: `SELECT * FROM shipments WHERE ${conds.join(' AND ')}` });
      modified = modified.replace(/\bshipments\b/g, cteName);
    }
  }

  // ----- inventory_snapshots -----
  if (/\binventory_snapshots\b/i.test(modified)) {
    const conds: string[] = [];
    if (filters.warehouse_id) { conds.push(`warehouse_id = $${p++}`); params.push(filters.warehouse_id); }
    if (filters.dateStart) { conds.push(`snapshot_date >= $${p++}`); params.push(filters.dateStart); }
    if (filters.dateEnd) { conds.push(`snapshot_date <= $${p++}`); params.push(filters.dateEnd); }
    if (filters.sku_category) {
      conds.push(`sku_id IN (SELECT sku_id FROM skus WHERE category = $${p++})`);
      params.push(filters.sku_category);
    }
    if (filters.supplier_tier) {
      conds.push(`sku_id IN (SELECT sku_id FROM skus WHERE primary_supplier_id IN (SELECT supplier_id FROM suppliers WHERE tier = $${p++}))`);
      params.push(filters.supplier_tier);
    }
    if (conds.length > 0) {
      const cteName = '_inv_f';
      ctes.push({ cteName, body: `SELECT * FROM inventory_snapshots WHERE ${conds.join(' AND ')}` });
      modified = modified.replace(/\binventory_snapshots\b/g, cteName);
    }
  }

  // ----- purchase_orders -----
  if (/\bpurchase_orders\b/i.test(modified)) {
    const conds: string[] = [];
    if (filters.warehouse_id) { conds.push(`warehouse_id = $${p++}`); params.push(filters.warehouse_id); }
    if (filters.dateStart) { conds.push(`ordered_date >= $${p++}`); params.push(filters.dateStart); }
    if (filters.dateEnd) { conds.push(`ordered_date <= $${p++}`); params.push(filters.dateEnd); }
    if (filters.sku_category) {
      conds.push(`sku_id IN (SELECT sku_id FROM skus WHERE category = $${p++})`);
      params.push(filters.sku_category);
    }
    if (filters.supplier_tier) {
      conds.push(`supplier_id IN (SELECT supplier_id FROM suppliers WHERE tier = $${p++})`);
      params.push(filters.supplier_tier);
    }
    if (conds.length > 0) {
      const cteName = '_po_f';
      ctes.push({ cteName, body: `SELECT * FROM purchase_orders WHERE ${conds.join(' AND ')}` });
      modified = modified.replace(/\bpurchase_orders\b/g, cteName);
    }
  }

  // ----- exceptions -----
  // Cross-filter via the already-built shipments/PO CTEs whenever they exist, so the
  // numerator of exception_rate / damage_rate / supplier_defect_rate / return_rate stays
  // scoped to the same population as the denominator. This matters even for date-only
  // filters: returns and exceptions logged in a window can be linked to shipments outside
  // the window, which inflates the numerator. (e.g. return_date in the last 7 days for a
  // shipment that delivered weeks ago.)
  if (/\bexceptions\b/i.test(modified)) {
    const conds: string[] = [];
    if (filters.dateStart) { conds.push(`event_date >= $${p++}`); params.push(filters.dateStart); }
    if (filters.dateEnd) { conds.push(`event_date <= $${p++}`); params.push(filters.dateEnd); }
    const shipmentsCte = ctes.find(c => c.cteName === '_shipments_f');
    const poCte = ctes.find(c => c.cteName === '_po_f');
    const linkConds: string[] = [];
    if (shipmentsCte) {
      linkConds.push(`shipment_id IN (SELECT shipment_id FROM _shipments_f)`);
    }
    if (poCte) {
      linkConds.push(`po_id IN (SELECT po_id FROM _po_f)`);
    }
    if (linkConds.length > 0) {
      conds.push(`(${linkConds.join(' OR ')})`);
    }
    if (conds.length > 0) {
      const cteName = '_exceptions_f';
      ctes.push({ cteName, body: `SELECT * FROM exceptions WHERE ${conds.join(' AND ')}` });
      modified = modified.replace(/\bexceptions\b/g, cteName);
    }
  }

  // ----- returns -----
  if (/\breturns\b/i.test(modified)) {
    const conds: string[] = [];
    if (filters.dateStart) { conds.push(`return_date >= $${p++}`); params.push(filters.dateStart); }
    if (filters.dateEnd) { conds.push(`return_date <= $${p++}`); params.push(filters.dateEnd); }
    if (filters.customer_segment) {
      conds.push(`customer_id IN (SELECT customer_id FROM customers WHERE segment = $${p++})`);
      params.push(filters.customer_segment);
    }
    if (filters.sku_category) {
      conds.push(`sku_id IN (SELECT sku_id FROM skus WHERE category = $${p++})`);
      params.push(filters.sku_category);
    }
    const shipmentsCte = ctes.find(c => c.cteName === '_shipments_f');
    if (shipmentsCte) {
      conds.push(`shipment_id IN (SELECT shipment_id FROM _shipments_f)`);
    }
    if (conds.length > 0) {
      const cteName = '_returns_f';
      ctes.push({ cteName, body: `SELECT * FROM returns WHERE ${conds.join(' AND ')}` });
      modified = modified.replace(/\breturns\b/g, cteName);
    }
  }

  return { sql: injectCtes(modified, ctes), params };
}

// === Single-metric query ===

/**
 * Returns a comparison FilterState shifted backwards in time. Returns null when
 * the requested basis can't be computed (e.g., no date range was set on the input).
 */
export function shiftFiltersForComparison(
  filters: FilterState | undefined,
  basis: 'prior_period' | 'prior_year'
): { filters: FilterState; basisLabel: string } | null {
  if (!filters?.dateStart || !filters?.dateEnd) return null;
  const start = new Date(filters.dateStart);
  const end = new Date(filters.dateEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

  let prevStart: Date;
  let prevEnd: Date;
  let basisLabel: string;
  if (basis === 'prior_year') {
    prevStart = new Date(start); prevStart.setFullYear(prevStart.getFullYear() - 1);
    prevEnd = new Date(end); prevEnd.setFullYear(prevEnd.getFullYear() - 1);
    basisLabel = 'vs prior year';
  } else {
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    prevEnd = new Date(start); prevEnd.setDate(prevEnd.getDate() - 1);
    prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (days - 1));
    basisLabel = 'vs prior period';
  }
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    filters: { ...filters, dateStart: iso(prevStart), dateEnd: iso(prevEnd), compareTo: 'none' },
    basisLabel,
  };
}

async function queryMetric(def: MetricDefinition, filters?: FilterState): Promise<MetricValue> {
  const { sql, params } = applyFilters(def.sql, filters);

  const queries: Promise<{ rows: { value: string }[] }>[] = [pool.query(sql, params)];
  if (def.trendSql) {
    const { sql: trendSql, params: trendParams } = applyFilters(def.trendSql, filters);
    queries.push(pool.query(trendSql, trendParams));
  }

  const compareBasis = filters?.compareTo && filters.compareTo !== 'none' ? filters.compareTo : null;
  const compareShift = compareBasis ? shiftFiltersForComparison(filters, compareBasis) : null;
  let comparePromise: Promise<{ rows: { value: string }[] }> | null = null;
  if (compareShift) {
    const { sql: cmpSql, params: cmpParams } = applyFilters(def.sql, compareShift.filters);
    comparePromise = pool.query(cmpSql, cmpParams);
  }

  const [valueRes, trendRes, cmpRes] = await Promise.all([
    queries[0],
    queries[1] ?? Promise.resolve(undefined),
    comparePromise ?? Promise.resolve(undefined),
  ]);

  const current = parseFloat(valueRes.rows[0]?.value ?? '0');
  const trend = trendRes
    ? trendRes.rows.map((r: { value: string }) => parseFloat(r.value || '0'))
    : [];
  const prev = trend.length >= 2 ? trend[trend.length - 2] : current;
  const delta = parseFloat((current - prev).toFixed(2));
  // Relative percent change so the UI can label deltas correctly. `delta` is in the metric's
  // own units (dollars, days, percentage points), but tile chrome appends a `%` sign — without
  // a separate pct field, "$380k change" would render as "380000.0%". Falls back to 0 when
  // the prior value is 0 (no meaningful relative change).
  const deltaPct = prev !== 0 && isFinite(prev)
    ? parseFloat(((delta / Math.abs(prev)) * 100).toFixed(1))
    : 0;

  const value: MetricValue = {
    current: isFinite(current) ? parseFloat(current.toFixed(2)) : 0,
    trend,
    delta: isFinite(delta) ? delta : 0,
    deltaPct,
  };

  if (cmpRes && compareShift && compareBasis) {
    const previous = parseFloat(cmpRes.rows[0]?.value ?? '0');
    if (isFinite(previous)) {
      const deltaAbs = parseFloat((current - previous).toFixed(2));
      const deltaPct = previous !== 0
        ? parseFloat(((deltaAbs / Math.abs(previous)) * 100).toFixed(1))
        : 0;
      value.comparison = {
        previous: parseFloat(previous.toFixed(2)),
        deltaAbs,
        deltaPct,
        basis: compareBasis,
        basisLabel: compareShift.basisLabel,
      };
    }
  }

  return value;
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
    // Failed metrics omitted so the client can render an explicit "no data" state.
  });

  return { timestamp: new Date().toISOString(), metrics };
}

// === Categorical breakdowns ===

function buildShipmentWhere(filters?: FilterState): { sql: string; params: unknown[]; nextIdx: number } {
  const conds: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.destination_region) { conds.push(`s.destination_region = $${idx++}`); params.push(filters.destination_region); }
  if (filters?.warehouse_id) { conds.push(`s.warehouse_id = $${idx++}`); params.push(filters.warehouse_id); }
  if (filters?.dateStart) { conds.push(`s.order_date >= $${idx++}`); params.push(filters.dateStart); }
  if (filters?.dateEnd) { conds.push(`s.order_date <= $${idx++}`); params.push(filters.dateEnd); }
  return {
    sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
    params,
    nextIdx: idx,
  };
}

export async function generateCategoricalSnapshot(
  metricIds?: string[],
  filters?: FilterState
): Promise<CategoricalSnapshot> {
  const snapshot = await generateSnapshot(metricIds, filters);
  const where = buildShipmentWhere(filters);

  // Resolve the requested metric so the breakdown values are computed *for that metric*
  // (OTIF %, exception rate %, etc.) — not always SUM(shipment value). When unknown or
  // omitted, pivotValueExprFor falls back to SUM(s.total_value), preserving the prior
  // "revenue by dim" behavior for callers that don't pass a metric.
  const defs = getMetricDefs();
  const def = metricIds && metricIds.length > 0
    ? defs.find(d => d.id === metricIds[0])
    : undefined;
  const valueExpr = def
    ? pivotValueExprFor(def).valueExpr
    : 'SUM(s.total_value)';

  const dimSql = (dim: keyof typeof PIVOT_DIM_SPECS): string => {
    const spec = PIVOT_DIM_SPECS[dim];
    return `
      SELECT ${spec.expr} AS label, ${valueExpr} AS value
      FROM shipments s
      ${spec.joinClause}
      ${where.sql}
      GROUP BY ${spec.expr}
      ORDER BY value DESC
    `;
  };

  const [byCategory, byRegion, byWarehouse, bySegment, byAbcClass, bySupplierTier] = await Promise.all([
    pool.query(dimSql('category'), where.params),
    pool.query(dimSql('destination_region'), where.params),
    pool.query(dimSql('warehouse_id'), where.params),
    pool.query(dimSql('customer_segment'), where.params),
    pool.query(dimSql('abc_class'), where.params),
    pool.query(dimSql('supplier_tier'), where.params),
  ]);

  const toBreakdown = (cat: string, rows: { label: string; value: string }[]): CategoryBreakdown => ({
    category: cat,
    values: rows.map(r => ({ label: r.label, value: parseFloat(r.value || '0') })),
  });

  return {
    timestamp: snapshot.timestamp,
    filters: filters || {},
    metrics: snapshot.metrics,
    breakdowns: {
      byCategory: toBreakdown('category', byCategory.rows),
      byRegion: toBreakdown('destination_region', byRegion.rows),
      byWarehouse: toBreakdown('warehouse_id', byWarehouse.rows),
      bySegment: toBreakdown('customer_segment', bySegment.rows),
      byAbcClass: toBreakdown('abc_class', byAbcClass.rows),
      bySupplierTier: toBreakdown('supplier_tier', bySupplierTier.rows),
    },
  };
}

// === Heatmap breakdown ===

export interface HeatmapSnapshot {
  timestamp: string;
  rowDimension: string;
  colDimension: string;
  rowLabels: string[];
  colLabels: string[];
  grid: (number | null)[][];
}

// Whitelist of supported heatmap dimensions and how to resolve them in SQL.
// Each entry: { joinClause: SQL fragment to add to the FROM/JOIN; expr: SQL expression for the label }.
const HEATMAP_DIMS: Record<string, { joinClause: string; expr: string }> = {
  category:           { joinClause: 'JOIN skus sk ON sk.sku_id = sl.sku_id',         expr: 'sk.category' },
  abc_class:          { joinClause: 'JOIN skus sk ON sk.sku_id = sl.sku_id',         expr: 'sk.abc_class' },
  destination_region: { joinClause: '',                                              expr: 's.destination_region' },
  warehouse_id:       { joinClause: '',                                              expr: 's.warehouse_id' },
  customer_segment:   { joinClause: 'JOIN customers c ON c.customer_id = s.customer_id', expr: 'c.segment' },
  customer_region:    { joinClause: 'JOIN customers c ON c.customer_id = s.customer_id', expr: 'c.region' },
};

export async function generateHeatmapBreakdown(
  rowDim: string,
  colDim: string,
  filters?: FilterState,
  metricId?: string,
): Promise<HeatmapSnapshot> {
  const rowSpec = HEATMAP_DIMS[rowDim];
  const colSpec = HEATMAP_DIMS[colDim];
  if (!rowSpec || !colSpec) {
    throw new Error(`Invalid heatmap dimensions: ${rowDim} x ${colDim}. Supported: ${Object.keys(HEATMAP_DIMS).join(', ')}`);
  }

  const where = buildShipmentWhere(filters);
  const joins = new Set<string>();
  if (rowSpec.joinClause) joins.add(rowSpec.joinClause);
  if (colSpec.joinClause) joins.add(colSpec.joinClause);

  // shipment_lines join is required when either dim resolves through SKUs.
  const needsLines = rowSpec.expr.startsWith('sk.') || colSpec.expr.startsWith('sk.');
  const lineJoin = needsLines ? 'JOIN shipment_lines sl ON sl.shipment_id = s.shipment_id' : '';

  // Value expression depends on the requested metric. Without one, fall back to
  // dollar totals (line revenue when a SKU join exists, shipment revenue otherwise).
  const def = metricId ? getMetricDefs().find(d => d.id === metricId) : undefined;
  const valueExpr = def
    ? pivotValueExprFor(def).valueExpr
    : (needsLines ? 'SUM(sl.line_total)' : 'SUM(s.total_value)');

  const sql = `
    SELECT ${rowSpec.expr} AS row_label, ${colSpec.expr} AS col_label, ${valueExpr} AS value
    FROM shipments s
    ${lineJoin}
    ${Array.from(joins).join('\n    ')}
    ${where.sql}
    GROUP BY ${rowSpec.expr}, ${colSpec.expr}
    ORDER BY ${rowSpec.expr}, ${colSpec.expr}
  `;

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

// === Available filter values (drives FilterBar UI) ===

export async function getAvailableFilters() {
  const [regions, warehouses, segments, categories, tiers, dateRange] = await Promise.all([
    pool.query(`SELECT DISTINCT destination_region FROM shipments ORDER BY destination_region`),
    pool.query(`SELECT warehouse_id, name, region FROM warehouses ORDER BY region, name`),
    pool.query(`SELECT DISTINCT segment FROM customers ORDER BY segment`),
    pool.query(`SELECT DISTINCT category FROM skus ORDER BY category`),
    pool.query(`SELECT DISTINCT tier FROM suppliers ORDER BY tier`),
    pool.query(`SELECT MIN(order_date)::text AS min_date, MAX(order_date)::text AS max_date FROM shipments`),
  ]);

  return {
    regions: regions.rows.map((r: { destination_region: string }) => r.destination_region),
    warehouses: warehouses.rows.map((r: { warehouse_id: string; name: string; region: string }) => ({
      id: r.warehouse_id, name: r.name, region: r.region,
    })),
    customerSegments: segments.rows.map((r: { segment: string }) => r.segment),
    skuCategories: categories.rows.map((r: { category: string }) => r.category),
    supplierTiers: tiers.rows.map((r: { tier: string }) => r.tier),
    minDate: dateRange.rows[0]?.min_date ?? null,
    maxDate: dateRange.rows[0]?.max_date ?? null,
  };
}

// === Dashboard configs ===

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
      summary: 'Canonical dashboard showing the full Meridian supply chain KPI library.',
      priorities: [
        { label: 'Comprehensive Overview', weight: 1, reasoning: 'Display all KPIs for full operational visibility.' },
      ],
    },
    metrics,
    layout,
  };
}

// === Personas ===
//
// Three supply chain personas covering the spectrum of leadership in a B2B distributor.

export function getPersonaConfigs(): Record<string, DashboardConfig> {
  const now = new Date().toISOString();

  const csco: DashboardConfig = {
    userId: 'persona-csco',
    createdAt: now, updatedAt: now,
    userPrompt: "I'm the Chief Supply Chain Officer. I care about overall customer experience, operational health, and working capital. I need a high-signal view of where the supply chain is performing and where it's slipping.",
    interpretation: {
      summary: 'Executive supply chain dashboard: customer-facing fulfillment quality, operational risk signals, and working capital efficiency.',
      priorities: [
        { label: 'Customer Fulfillment', weight: 1.0, reasoning: 'OTIF and Perfect Order Rate are the headline customer-experience metrics.' },
        { label: 'Operational Health', weight: 0.85, reasoning: 'Exception rate and cycle time reveal systemic friction.' },
        { label: 'Working Capital', weight: 0.7, reasoning: 'Inventory turns and excess stock indicate cash trapped in the supply chain.' },
      ],
    },
    metrics: [
      { id: 'otif_rate', label: 'OTIF Rate', unit: 'percent', chartType: 'gauge', size: 'lg',
        thresholds: { green: { max: 95 }, yellow: { max: 85 }, direction: 'higher-is-better' }, position: 0, visible: true },
      { id: 'perfect_order_rate', label: 'Perfect Order Rate', unit: 'percent', chartType: 'gauge', size: 'md',
        thresholds: { green: { max: 90 }, yellow: { max: 80 }, direction: 'higher-is-better' }, position: 1, visible: true },
      { id: 'order_cycle_time', label: 'Order Cycle Time', unit: 'days', chartType: 'line', size: 'md',
        thresholds: { green: { max: 7 }, yellow: { max: 10 }, direction: 'lower-is-better' }, position: 2, visible: true },
      { id: 'inventory_turns', label: 'Inventory Turns', unit: 'turns', chartType: 'line', size: 'md',
        thresholds: { green: { max: 8 }, yellow: { max: 5 }, direction: 'higher-is-better' }, position: 3, visible: true },
      { id: 'exception_rate', label: 'Exception Rate', unit: 'percent', chartType: 'bar', size: 'md',
        thresholds: { green: { max: 6 }, yellow: { max: 12 }, direction: 'lower-is-better' }, position: 4, visible: true },
      { id: 'excess_inventory_value', label: 'Excess Inventory Value', unit: 'dollars', chartType: 'area', size: 'md',
        thresholds: { green: { max: 500000 }, yellow: { max: 1500000 }, direction: 'lower-is-better' }, position: 5, visible: true },
    ],
    layout: { columns: 3, showCanonicalToggle: true },
  };

  const warehouseDirector: DashboardConfig = {
    userId: 'persona-warehouse-director',
    createdAt: now, updatedAt: now,
    userPrompt: "I'm a warehouse director. I care about throughput, accuracy, and capacity. I run the four walls and need to spot bottlenecks fast.",
    interpretation: {
      summary: 'Warehouse operations view: throughput and pick accuracy, exceptions by reason and warehouse, and capacity headroom.',
      priorities: [
        { label: 'Pick & Pack Throughput', weight: 1.0, reasoning: 'Same-day ship rate and line fill are direct measures of warehouse responsiveness.' },
        { label: 'Order Accuracy', weight: 0.85, reasoning: 'Backorder rate and exception reasons reveal accuracy + process issues.' },
        { label: 'Capacity', weight: 0.7, reasoning: 'Capacity utilization tells us when we need to expand or rebalance.' },
      ],
    },
    metrics: [
      { id: 'same_day_ship_rate', label: 'Same-Day Ship Rate', unit: 'percent', chartType: 'gauge', size: 'lg',
        thresholds: { green: { max: 60 }, yellow: { max: 40 }, direction: 'higher-is-better' }, position: 0, visible: true },
      { id: 'line_fill_rate', label: 'Line Fill Rate', unit: 'percent', chartType: 'gauge', size: 'md',
        thresholds: { green: { max: 96 }, yellow: { max: 90 }, direction: 'higher-is-better' }, position: 1, visible: true },
      { id: 'backorder_rate', label: 'Backorder Rate', unit: 'percent', chartType: 'bar', size: 'md',
        thresholds: { green: { max: 4 }, yellow: { max: 10 }, direction: 'lower-is-better' }, position: 2, visible: true },
      { id: 'warehouse_capacity_util', label: 'Capacity Utilization', unit: 'percent', chartType: 'gauge', size: 'md',
        thresholds: { green: { max: 75 }, yellow: { max: 88 }, direction: 'lower-is-better' }, position: 3, visible: true },
      { id: 'exception_rate', label: 'Exception Rate', unit: 'percent', chartType: 'bar', size: 'md',
        thresholds: { green: { max: 6 }, yellow: { max: 12 }, direction: 'lower-is-better' }, position: 4, visible: true },
      { id: 'avg_exception_mttr', label: 'Exception MTTR', unit: 'hours', chartType: 'line', size: 'sm',
        thresholds: { green: { max: 48 }, yellow: { max: 96 }, direction: 'lower-is-better' }, position: 5, visible: true },
    ],
    layout: { columns: 3, showCanonicalToggle: true },
  };

  const procurementLead: DashboardConfig = {
    userId: 'persona-procurement-lead',
    createdAt: now, updatedAt: now,
    userPrompt: "I'm a procurement lead. I manage our supplier portfolio. I need to see who's delivering, who's slipping, and where lead times are blowing out.",
    interpretation: {
      summary: 'Procurement view: supplier reliability scoring, PO cycle time, inbound lead times, and quality.',
      priorities: [
        { label: 'Supplier Reliability', weight: 1.0, reasoning: 'Supplier OTD and OTIF directly drive inbound predictability.' },
        { label: 'Lead Time', weight: 0.85, reasoning: 'Lead time inflation is the first sign of supplier or supply-network stress.' },
        { label: 'Quality', weight: 0.7, reasoning: 'Defect rate catches quality regression early.' },
      ],
    },
    metrics: [
      { id: 'supplier_otd', label: 'Supplier OTD', unit: 'percent', chartType: 'gauge', size: 'lg',
        thresholds: { green: { max: 92 }, yellow: { max: 85 }, direction: 'higher-is-better' }, position: 0, visible: true },
      { id: 'supplier_otif', label: 'Supplier OTIF', unit: 'percent', chartType: 'gauge', size: 'md',
        thresholds: { green: { max: 88 }, yellow: { max: 80 }, direction: 'higher-is-better' }, position: 1, visible: true },
      { id: 'po_cycle_time', label: 'PO Cycle Time', unit: 'days', chartType: 'line', size: 'md',
        thresholds: { green: { max: 18 }, yellow: { max: 25 }, direction: 'lower-is-better' }, position: 2, visible: true },
      { id: 'avg_lead_time', label: 'Avg Lead Time', unit: 'days', chartType: 'line', size: 'md',
        thresholds: { green: { max: 21 }, yellow: { max: 30 }, direction: 'lower-is-better' }, position: 3, visible: true },
      { id: 'supplier_defect_rate', label: 'Defect Rate', unit: 'percent', chartType: 'bar', size: 'sm',
        thresholds: { green: { max: 2 }, yellow: { max: 5 }, direction: 'lower-is-better' }, position: 4, visible: true },
      { id: 'critical_sku_stockout_rate', label: 'Critical SKU Stockout', unit: 'percent', chartType: 'bar', size: 'sm',
        thresholds: { green: { max: 1 }, yellow: { max: 3 }, direction: 'lower-is-better' }, position: 5, visible: true },
    ],
    layout: { columns: 3, showCanonicalToggle: true },
  };

  return {
    csco,
    'warehouse-director': warehouseDirector,
    'procurement-lead': procurementLead,
  };
}

export { getMetricDefs };
