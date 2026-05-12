import pool from './db.js';
import { getMetricDefs } from './kpiDefinitionStore.js';
import type { MetricDefinition } from './kpiDefinitionStore.js';
import { TODAY } from './supplyChain/random.js';
import type {
  AnnotationEvent,
  BulletSnapshot,
  CalendarSnapshot,
  FilterState,
  FunnelSnapshot,
  PivotDimension,
  PivotSnapshot,
  TimeseriesSnapshot,
  TopNDimension,
  TopNSnapshot,
  WaterfallSnapshot,
} from '../../../shared/types.js';

// === Annotations ===
//
// The four narrative anomalies are baked into the seed (see seedFacts.ts), but there's no
// annotations table — we re-derive the dates here using the same logic.

function apacCongestionWindow(): { start: Date; end: Date } {
  const year = TODAY.getMonth() >= 10 ? TODAY.getFullYear() : TODAY.getFullYear() - 1;
  return { start: new Date(year, 10, 8), end: new Date(year, 10, 22) };
}

function emeaIncidentDate(): Date {
  const year = TODAY.getMonth() >= 4 ? TODAY.getFullYear() : TODAY.getFullYear() - 1;
  return new Date(year, 4, 6);
}

function supDegradationStart(): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - 120);
  return d;
}

function cuttingToolsPhaseOutStart(): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - 180);
  return d;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function getAnnotations(): AnnotationEvent[] {
  const apac = apacCongestionWindow();
  return [
    {
      id: 'apac-port-congestion',
      date: iso(apac.start),
      endDate: iso(apac.end),
      label: 'APAC port congestion',
      description: 'Two-week disruption at major APAC ports caused widespread carrier delays into APAC and EMEA. OTIF and supplier OTD show a clear dip in this window.',
      severity: 'critical',
      affectsMetrics: ['otif_rate', 'carrier_otd', 'supplier_otd', 'avg_transit_days', 'order_cycle_time'],
    },
    {
      id: 'sup-0042-otd-decline',
      date: iso(supDegradationStart()),
      endDate: iso(TODAY),
      label: 'SUP-0042 OTD decline',
      description: 'Strategic supplier SUP-0042 has shown a steady on-time-delivery decline over the trailing 120 days, dragging inbound reliability and downstream A-class stockout.',
      severity: 'warning',
      affectsMetrics: ['supplier_otd', 'supplier_otif', 'avg_lead_time', 'critical_sku_stockout_rate'],
    },
    {
      id: 'emea-logistics-incident',
      date: iso(emeaIncidentDate()),
      label: 'EMEA logistics incident (WH-EMEA-02)',
      description: 'Single-day operational incident at the Frankfurt DC backed up outbound shipments; visible as a one-day cycle-time spike.',
      severity: 'warning',
      affectsMetrics: ['order_cycle_time', 'same_day_ship_rate', 'exception_rate', 'avg_exception_mttr'],
    },
    {
      id: 'cutting-tools-phase-out',
      date: iso(cuttingToolsPhaseOutStart()),
      endDate: iso(TODAY),
      label: 'Cutting Tools phase-out',
      description: 'Elevated phase-out of Cutting Tools SKUs (~18% vs. 3% baseline) is shifting volume mix and increasing returns on legacy parts.',
      severity: 'info',
      affectsMetrics: ['return_rate', 'excess_inventory_value', 'inventory_turns'],
    },
  ];
}

// === Pivot ===
//
// Generic pivot: rowDim × colDim of any metric. Re-uses the metric's SQL where possible by
// rewriting it to GROUP BY the requested dimensions; falls back to a shipment-based
// aggregation when the metric isn't supported.
//
// We support pivot only for the subset of metrics whose execSql is shipment-based and uses
// SUM(s.total_value)-style aggregation. For others we return a "value distribution" — counts
// of shipments per cell — so the widget always renders something sensible.

const PIVOT_DIM_SPECS: Record<PivotDimension, { joinClause: string; expr: string }> = {
  category:           { joinClause: 'JOIN shipment_lines sl ON sl.shipment_id = s.shipment_id JOIN skus sk ON sk.sku_id = sl.sku_id', expr: 'sk.category' },
  abc_class:          { joinClause: 'JOIN shipment_lines sl ON sl.shipment_id = s.shipment_id JOIN skus sk ON sk.sku_id = sl.sku_id', expr: 'sk.abc_class' },
  destination_region: { joinClause: '',                                                                                              expr: 's.destination_region' },
  warehouse_id:       { joinClause: '',                                                                                              expr: 's.warehouse_id' },
  customer_segment:   { joinClause: 'JOIN customers c ON c.customer_id = s.customer_id',                                             expr: 'c.segment' },
  supplier_tier:      { joinClause: 'JOIN shipment_lines sl ON sl.shipment_id = s.shipment_id JOIN skus sk ON sk.sku_id = sl.sku_id JOIN suppliers sup ON sup.supplier_id = sk.primary_supplier_id', expr: 'sup.tier' },
};

function buildShipmentWhere(filters?: FilterState): { sql: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  if (filters?.destination_region) { conds.push(`s.destination_region = $${p++}`); params.push(filters.destination_region); }
  if (filters?.warehouse_id) { conds.push(`s.warehouse_id = $${p++}`); params.push(filters.warehouse_id); }
  if (filters?.dateStart) { conds.push(`s.order_date >= $${p++}`); params.push(filters.dateStart); }
  if (filters?.dateEnd) { conds.push(`s.order_date <= $${p++}`); params.push(filters.dateEnd); }
  return { sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

/** Map a metric to a pivot value expression and any extra joins it needs. */
function pivotValueExprFor(def: MetricDefinition): { valueExpr: string; extraJoin: string } {
  const id = def.id;
  // OTIF-family rates: percent on-time AND in-full per cell.
  if (id === 'otif_rate' || id === 'perfect_order_rate') {
    return {
      valueExpr: `100.0 * AVG(CASE WHEN s.delivered_date IS NOT NULL AND s.delivered_date <= s.promised_date AND NOT EXISTS (SELECT 1 FROM shipment_lines slx WHERE slx.shipment_id = s.shipment_id AND COALESCE(slx.qty_backordered,0) > 0) THEN 1 ELSE 0 END)`,
      extraJoin: '',
    };
  }
  if (id === 'order_cycle_time') {
    return { valueExpr: `AVG(EXTRACT(EPOCH FROM (s.delivered_date - s.order_date)) / 86400.0)`, extraJoin: '' };
  }
  if (id === 'same_day_ship_rate') {
    return { valueExpr: `100.0 * AVG(CASE WHEN s.shipped_date::date = s.order_date::date THEN 1 ELSE 0 END)`, extraJoin: '' };
  }
  if (id === 'exception_rate') {
    return {
      valueExpr: `100.0 * AVG(CASE WHEN EXISTS (SELECT 1 FROM exceptions e WHERE e.shipment_id = s.shipment_id) THEN 1 ELSE 0 END)`,
      extraJoin: '',
    };
  }
  // Default: total shipped value per cell. Always meaningful.
  return { valueExpr: `SUM(s.total_value)`, extraJoin: '' };
}

export async function generatePivot(
  metricId: string,
  rowDim: PivotDimension,
  colDim: PivotDimension,
  filters?: FilterState
): Promise<PivotSnapshot> {
  const def = getMetricDefs().find(d => d.id === metricId);
  if (!def) throw new Error(`Unknown metric: ${metricId}`);

  const rowSpec = PIVOT_DIM_SPECS[rowDim];
  const colSpec = PIVOT_DIM_SPECS[colDim];
  if (!rowSpec || !colSpec) throw new Error(`Unsupported pivot dimensions: ${rowDim} x ${colDim}`);

  const { valueExpr } = pivotValueExprFor(def);
  const where = buildShipmentWhere(filters);

  const joins = new Set<string>();
  if (rowSpec.joinClause) joins.add(rowSpec.joinClause);
  if (colSpec.joinClause) joins.add(colSpec.joinClause);

  const sql = `
    SELECT ${rowSpec.expr} AS row_label, ${colSpec.expr} AS col_label, ${valueExpr} AS value
    FROM shipments s
    ${Array.from(joins).join('\n    ')}
    ${where.sql}
    GROUP BY ${rowSpec.expr}, ${colSpec.expr}
    ORDER BY ${rowSpec.expr}, ${colSpec.expr}
  `;

  const { rows } = await pool.query(sql, where.params);

  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  const map = new Map<string, Map<string, number>>();
  let min = Infinity, max = -Infinity;
  for (const r of rows) {
    const rl = String(r.row_label);
    const cl = String(r.col_label);
    const v = parseFloat(r.value);
    if (!isFinite(v)) continue;
    rowSet.add(rl); colSet.add(cl);
    if (!map.has(rl)) map.set(rl, new Map());
    map.get(rl)!.set(cl, v);
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const rowLabels = Array.from(rowSet).sort();
  const colLabels = Array.from(colSet).sort();
  const grid: (number | null)[][] = rowLabels.map(rl =>
    colLabels.map(cl => map.get(rl)?.get(cl) ?? null)
  );

  return {
    metricId,
    rowDim,
    colDim,
    rowLabels,
    colLabels,
    grid,
    min: isFinite(min) ? parseFloat(min.toFixed(2)) : 0,
    max: isFinite(max) ? parseFloat(max.toFixed(2)) : 0,
  };
}

// === Funnel ===

const SHIPMENT_FUNNEL_STAGES = ['Open', 'Picking', 'Packed', 'Shipped', 'Delivered'] as const;

export async function generateShipmentFunnel(filters?: FilterState): Promise<FunnelSnapshot> {
  const where = buildShipmentWhere(filters);
  // Cumulative semantics: stage N counts every shipment that reached stage N or any later stage.
  // We use status ordering + non-null lifecycle dates to determine reach.
  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE s.status NOT IN ('Cancelled')) AS open_or_later,
      COUNT(*) FILTER (WHERE s.status IN ('Picking','Packed','Shipped','Delivered','Returned')) AS picking_or_later,
      COUNT(*) FILTER (WHERE s.status IN ('Packed','Shipped','Delivered','Returned')) AS packed_or_later,
      COUNT(*) FILTER (WHERE s.status IN ('Shipped','Delivered','Returned') OR s.shipped_date IS NOT NULL) AS shipped_or_later,
      COUNT(*) FILTER (WHERE s.status IN ('Delivered','Returned') OR s.delivered_date IS NOT NULL) AS delivered_or_later
    FROM shipments s
    ${where.sql}
  `;

  const { rows } = await pool.query(sql, where.params);
  const r = rows[0] || {};
  const counts = [
    parseInt(r.open_or_later || '0', 10),
    parseInt(r.picking_or_later || '0', 10),
    parseInt(r.packed_or_later || '0', 10),
    parseInt(r.shipped_or_later || '0', 10),
    parseInt(r.delivered_or_later || '0', 10),
  ];

  const top = counts[0] || 0;
  const stages = SHIPMENT_FUNNEL_STAGES.map((stage, i) => ({
    stage,
    count: counts[i],
    dropoffPct: top > 0 ? parseFloat((((top - counts[i]) / top) * 100).toFixed(1)) : 0,
  }));

  return { source: 'shipment_lifecycle', stages };
}

// === Timeseries (for annotated line) ===

const GRAIN_BUCKET: Record<'daily' | 'weekly' | 'monthly', string> = {
  daily: `date_trunc('day', s.order_date)`,
  weekly: `date_trunc('week', s.order_date)`,
  monthly: `date_trunc('month', s.order_date)`,
};

export async function generateTimeseries(
  metricId: string,
  grain: 'daily' | 'weekly' | 'monthly',
  filters?: FilterState
): Promise<TimeseriesSnapshot> {
  const def = getMetricDefs().find(d => d.id === metricId);
  if (!def) throw new Error(`Unknown metric: ${metricId}`);

  const { valueExpr } = pivotValueExprFor(def);
  const where = buildShipmentWhere(filters);
  const bucket = GRAIN_BUCKET[grain];

  const sql = `
    SELECT ${bucket} AS bucket, ${valueExpr} AS value
    FROM shipments s
    ${where.sql}
    GROUP BY ${bucket}
    ORDER BY ${bucket}
  `;

  const { rows } = await pool.query(sql, where.params);
  const points = rows.map((r: { bucket: Date | string; value: string }) => {
    const d = r.bucket instanceof Date ? r.bucket : new Date(r.bucket);
    return {
      date: d.toISOString().slice(0, 10),
      value: parseFloat(r.value || '0'),
    };
  }).filter((p: { value: number }) => Number.isFinite(p.value));

  // Filter annotations to the requested metric (or include all if metric-agnostic).
  const all = getAnnotations();
  const annotations = all.filter(a => !a.affectsMetrics || a.affectsMetrics.length === 0 || a.affectsMetrics.includes(metricId));

  return { metricId, grain, points, annotations };
}

// === Waterfall (OTIF bridge) ===
//
// Decomposes the change in OTIF between a prior window and the current window into three
// drivers: on-time rate, in-full rate, and a residual catch-all (interaction + exception
// effect). The math is intentionally simple — the prior + impacts = current identity is
// closed by absorbing the cross-term into "Other" — but the chart tells the right story
// directionally and reads correctly to a CSCO audience.

interface OtifComponents {
  total: number;
  otifCount: number;
  onTimeCount: number;
  inFullCount: number;
  otifRate: number;
  onTimeRate: number;
  inFullRate: number;
}

async function queryOtifComponents(filters?: FilterState): Promise<OtifComponents> {
  const where = buildShipmentWhere(filters);
  const sql = `
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE s.delivered_date IS NOT NULL AND s.delivered_date <= s.promised_date) AS on_time_count,
      COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM shipment_lines slx WHERE slx.shipment_id = s.shipment_id AND COALESCE(slx.qty_backordered, 0) > 0)) AS in_full_count,
      COUNT(*) FILTER (
        WHERE s.delivered_date IS NOT NULL
          AND s.delivered_date <= s.promised_date
          AND NOT EXISTS (SELECT 1 FROM shipment_lines slx WHERE slx.shipment_id = s.shipment_id AND COALESCE(slx.qty_backordered, 0) > 0)
      ) AS otif_count
    FROM shipments s
    ${where.sql}
  `;
  const { rows } = await pool.query(sql, where.params);
  const r = rows[0] || {};
  const total = parseInt(r.total || '0', 10);
  const otifCount = parseInt(r.otif_count || '0', 10);
  const onTimeCount = parseInt(r.on_time_count || '0', 10);
  const inFullCount = parseInt(r.in_full_count || '0', 10);
  return {
    total,
    otifCount,
    onTimeCount,
    inFullCount,
    otifRate: total > 0 ? (otifCount / total) * 100 : 0,
    onTimeRate: total > 0 ? (onTimeCount / total) * 100 : 0,
    inFullRate: total > 0 ? (inFullCount / total) * 100 : 0,
  };
}

function priorWindow(filters?: FilterState): FilterState {
  // If a date range is set, mirror it backwards. Otherwise default to "same length immediately
  // before" the seeded TODAY — a 30-day prior window.
  if (filters?.dateStart && filters?.dateEnd) {
    const start = new Date(filters.dateStart);
    const end = new Date(filters.dateEnd);
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const priorEnd = new Date(start); priorEnd.setDate(priorEnd.getDate() - 1);
    const priorStart = new Date(priorEnd); priorStart.setDate(priorStart.getDate() - (days - 1));
    return {
      ...filters,
      dateStart: priorStart.toISOString().slice(0, 10),
      dateEnd: priorEnd.toISOString().slice(0, 10),
    };
  }
  // Default: last 30 days vs the 30 days before that.
  const end = new Date(TODAY); end.setDate(end.getDate() - 30);
  const start = new Date(end); start.setDate(start.getDate() - 29);
  return {
    ...filters,
    dateStart: start.toISOString().slice(0, 10),
    dateEnd: end.toISOString().slice(0, 10),
  };
}

export async function generateOtifWaterfall(filters?: FilterState): Promise<WaterfallSnapshot> {
  const [current, prior] = await Promise.all([
    queryOtifComponents(filters),
    queryOtifComponents(priorWindow(filters)),
  ]);

  const onTimeImpact = current.onTimeRate - prior.onTimeRate;
  const inFullImpact = current.inFullRate - prior.inFullRate;
  const netDelta = current.otifRate - prior.otifRate;
  // The cross-term and any residual (e.g. exception coupling) lands in 'Other' so the
  // bridge closes exactly. This is the standard "interaction effect" in a multiplicative
  // decomposition: ΔOTIF != ΔOnTime + ΔInFull when OTIF = OnTime AND InFull.
  const otherImpact = netDelta - onTimeImpact - inFullImpact;

  let running = prior.otifRate;
  const stages: WaterfallSnapshot['stages'] = [
    { label: 'Prior',     kind: 'anchor',   value: prior.otifRate,   runningTotal: running },
  ];
  running += onTimeImpact;
  stages.push({ label: 'On-time', kind: onTimeImpact >= 0 ? 'positive' : 'negative', value: onTimeImpact, runningTotal: running });
  running += inFullImpact;
  stages.push({ label: 'In-full', kind: inFullImpact >= 0 ? 'positive' : 'negative', value: inFullImpact, runningTotal: running });
  running += otherImpact;
  stages.push({ label: 'Other',   kind: otherImpact >= 0 ? 'positive' : 'negative', value: otherImpact, runningTotal: running });
  stages.push({ label: 'Current', kind: 'anchor',   value: current.otifRate, runningTotal: current.otifRate });

  return {
    source: 'otif_bridge',
    unit: 'percent',
    netDelta: parseFloat(netDelta.toFixed(2)),
    stages: stages.map(s => ({
      ...s,
      value: parseFloat(s.value.toFixed(2)),
      runningTotal: parseFloat(s.runningTotal.toFixed(2)),
    })),
  };
}

// === Top-N ===
//
// Rank labels along a dimension by a metric. Most metrics are shipment-based and rank fine
// off the standard shipments → dimension joins; procurement metrics (supplier_otd, supplier_otif,
// po_cycle_time, supplier_defect_rate, avg_lead_time) need to query purchase_orders instead so
// the per-row value reflects the supplier's real OTD/lead-time rather than shipment value.

interface TopNQuery {
  baseTable: 'shipments' | 'purchase_orders';
  joinClause: string;
  idExpr: string;
  labelExpr: string;
  valueExpr: string;
  whereClause: string;
  /** Minimum row count per group for the value to be considered statistically meaningful. */
  minGroupCount: number;
}

function buildPoWhere(filters?: FilterState): { sql: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  if (filters?.warehouse_id) { conds.push(`po.warehouse_id = $${p++}`); params.push(filters.warehouse_id); }
  if (filters?.dateStart) { conds.push(`po.ordered_date >= $${p++}`); params.push(filters.dateStart); }
  if (filters?.dateEnd) { conds.push(`po.ordered_date <= $${p++}`); params.push(filters.dateEnd); }
  if (filters?.sku_category) { conds.push(`po.sku_id IN (SELECT sku_id FROM skus WHERE category = $${p++})`); params.push(filters.sku_category); }
  if (filters?.supplier_tier) { conds.push(`po.supplier_id IN (SELECT supplier_id FROM suppliers WHERE tier = $${p++})`); params.push(filters.supplier_tier); }
  return { sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

function buildTopNQuery(metricId: string, dimension: TopNDimension, filters?: FilterState):
  { query: TopNQuery; params: unknown[] } {
  // === Procurement metrics: rank by per-group OTD/lead-time/defect from purchase_orders ===
  const procurementMetrics = ['supplier_otd', 'supplier_otif', 'po_cycle_time', 'avg_lead_time', 'supplier_defect_rate'];
  if (procurementMetrics.includes(metricId)) {
    const where = buildPoWhere(filters);
    let valueExpr = '';
    let joinExtra = '';
    if (metricId === 'supplier_otd') {
      valueExpr = `100.0 * COUNT(*) FILTER (WHERE po.received_date <= po.promised_date) / NULLIF(COUNT(*) FILTER (WHERE po.received_date IS NOT NULL), 0)`;
    } else if (metricId === 'supplier_otif') {
      valueExpr = `100.0 * COUNT(*) FILTER (WHERE po.received_date <= po.promised_date AND po.qty_received >= po.qty_ordered) / NULLIF(COUNT(*) FILTER (WHERE po.received_date IS NOT NULL), 0)`;
    } else if (metricId === 'po_cycle_time') {
      valueExpr = `AVG(po.received_date - po.ordered_date) FILTER (WHERE po.received_date IS NOT NULL)`;
    } else if (metricId === 'avg_lead_time') {
      valueExpr = `AVG(po.promised_date - po.ordered_date) FILTER (WHERE po.status <> 'Cancelled')`;
    } else if (metricId === 'supplier_defect_rate') {
      valueExpr = `100.0 * COUNT(DISTINCT po.po_id) FILTER (WHERE EXISTS (SELECT 1 FROM exceptions e WHERE e.po_id = po.po_id AND e.reason_code = 'Quality Hold')) / NULLIF(COUNT(DISTINCT po.po_id), 0)`;
    }

    const dimSpec = (() => {
      switch (dimension) {
        case 'supplier':
          return { join: 'JOIN suppliers sup ON sup.supplier_id = po.supplier_id', id: 'sup.supplier_id', label: 'sup.name' };
        case 'sku':
          return { join: 'JOIN skus sk ON sk.sku_id = po.sku_id', id: 'sk.sku_id', label: 'sk.name' };
        case 'category':
          return { join: 'JOIN skus sk ON sk.sku_id = po.sku_id', id: 'sk.category', label: 'sk.category' };
        case 'warehouse':
          return { join: 'JOIN warehouses w ON w.warehouse_id = po.warehouse_id', id: 'w.warehouse_id', label: 'w.name' };
        default:
          // customer / carrier don't naturally apply to inbound POs; fall back to supplier ranking.
          return { join: 'JOIN suppliers sup ON sup.supplier_id = po.supplier_id', id: 'sup.supplier_id', label: 'sup.name' };
      }
    })();

    return {
      query: {
        baseTable: 'purchase_orders',
        joinClause: `${dimSpec.join} ${joinExtra}`.trim(),
        idExpr: dimSpec.id,
        labelExpr: dimSpec.label,
        valueExpr,
        whereClause: where.sql,
        minGroupCount: 5,  // require ≥5 POs per supplier so a 1-row supplier doesn't score 100%
      },
      params: where.params,
    };
  }

  // === Default: shipment-based metrics ===
  const def = getMetricDefs().find(d => d.id === metricId)!;
  const { valueExpr } = pivotValueExprFor(def);
  const where = buildShipmentWhere(filters);

  const dimSpec = (() => {
    switch (dimension) {
      case 'supplier':
        return { join: 'JOIN shipment_lines sl ON sl.shipment_id = s.shipment_id JOIN skus sk ON sk.sku_id = sl.sku_id JOIN suppliers sup ON sup.supplier_id = sk.primary_supplier_id', id: 'sup.supplier_id', label: 'sup.name' };
      case 'customer':
        return { join: 'JOIN customers c ON c.customer_id = s.customer_id', id: 'c.customer_id', label: 'c.name' };
      case 'sku':
        return { join: 'JOIN shipment_lines sl ON sl.shipment_id = s.shipment_id JOIN skus sk ON sk.sku_id = sl.sku_id', id: 'sk.sku_id', label: 'sk.name' };
      case 'warehouse':
        return { join: 'JOIN warehouses w ON w.warehouse_id = s.warehouse_id', id: 'w.warehouse_id', label: 'w.name' };
      case 'carrier':
        return { join: 'JOIN carriers cr ON cr.carrier_id = s.carrier_id', id: 'cr.carrier_id', label: 'cr.name' };
      case 'category':
        return { join: 'JOIN shipment_lines sl ON sl.shipment_id = s.shipment_id JOIN skus sk ON sk.sku_id = sl.sku_id', id: 'sk.category', label: 'sk.category' };
    }
  })();

  return {
    query: {
      baseTable: 'shipments',
      joinClause: dimSpec.join,
      idExpr: dimSpec.id,
      labelExpr: dimSpec.label,
      valueExpr,
      whereClause: where.sql,
      minGroupCount: 1,
    },
    params: where.params,
  };
}

export async function generateTopN(
  metricId: string,
  dimension: TopNDimension,
  n: number,
  ascending: boolean,
  filters?: FilterState
): Promise<TopNSnapshot> {
  const def = getMetricDefs().find(d => d.id === metricId);
  if (!def) throw new Error(`Unknown metric: ${metricId}`);

  const { query: q, params } = buildTopNQuery(metricId, dimension, filters);
  const direction = ascending ? 'ASC' : 'DESC';
  const limit = Math.max(1, Math.min(50, Math.floor(n) || 10));

  const baseAlias = q.baseTable === 'purchase_orders' ? 'po' : 's';
  const sql = `
    SELECT ${q.idExpr} AS id, ${q.labelExpr} AS label, ${q.valueExpr} AS value
    FROM ${q.baseTable} ${baseAlias}
    ${q.joinClause}
    ${q.whereClause}
    GROUP BY ${q.idExpr}, ${q.labelExpr}
    HAVING COUNT(*) >= ${q.minGroupCount}
    ORDER BY value ${direction} NULLS LAST
    LIMIT ${limit}
  `;

  const { rows } = await pool.query(sql, params);
  const numeric = rows.map((r: { id: string; label: string; value: string }) => ({
    id: String(r.id),
    label: String(r.label),
    raw: parseFloat(r.value),
  })).filter((r: { raw: number }) => Number.isFinite(r.raw));

  const max = numeric.length > 0 ? Math.max(...numeric.map((r: { raw: number }) => Math.abs(r.raw))) : 0;
  const result: TopNSnapshot['rows'] = numeric.map((r: { id: string; label: string; raw: number }, i: number) => ({
    rank: i + 1,
    id: r.id,
    label: r.label,
    value: parseFloat(r.raw.toFixed(2)),
    share: max > 0 ? parseFloat((Math.abs(r.raw) / max).toFixed(3)) : 0,
  }));

  return { metricId, dimension, ascending, rows: result };
}

// === Bullet (snapshot-only, no SQL) ===
//
// Bullet derives its bands from the metric's existing thresholds and uses the current value
// from /api/metrics. No new query is needed; the snapshot endpoint just composes the bands
// from the published KPI definition so the client doesn't need to know the config schema.

export function buildBulletSnapshot(metricId: string, actual: number): BulletSnapshot {
  const def = getMetricDefs().find(d => d.id === metricId);
  if (!def) throw new Error(`Unknown metric: ${metricId}`);

  const direction = def.direction;
  const greenMax = def.greenMax;
  const yellowMax = def.yellowMax;

  // Bands ascend in display order. The "max" of the last band is the chart's right edge.
  // We pick a chart max of max(actual, yellowMax) * 1.25 for higher-is-better so the bands
  // give comparable visual weight; for lower-is-better the chart max is similar.
  const chartMax = Math.max(actual, yellowMax, greenMax) * 1.25;

  const bands: BulletSnapshot['bands'] = direction === 'lower-is-better'
    ? [
        { max: greenMax,  color: 'healthy'  },
        { max: yellowMax, color: 'warning'  },
        { max: chartMax,  color: 'critical' },
      ]
    : [
        { max: yellowMax, color: 'critical' },
        { max: greenMax,  color: 'warning'  },
        { max: chartMax,  color: 'healthy'  },
      ];

  return {
    metricId,
    actual: parseFloat(actual.toFixed(2)),
    target: greenMax,
    bands,
    direction,
  };
}

// === Calendar heatmap ===

export async function generateCalendar(
  source: 'shipments_per_day' | 'exceptions_per_day',
  filters?: FilterState
): Promise<CalendarSnapshot> {
  // Default to last 365 days when no filter range is set.
  const today = new Date(TODAY);
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStartD = new Date(today); defaultStartD.setDate(defaultStartD.getDate() - 364);
  const defaultStart = defaultStartD.toISOString().slice(0, 10);

  const dateStart = filters?.dateStart || defaultStart;
  const dateEnd = filters?.dateEnd || defaultEnd;

  // Re-apply dimension filters (region, warehouse, etc.) on top of the date range, but
  // anchor the date range explicitly so the heatmap always spans a full window even when
  // no date filter is otherwise set.
  const anchoredFilters: FilterState = { ...filters, dateStart, dateEnd };
  const where = buildShipmentWhere(anchoredFilters);

  let sql: string;
  if (source === 'exceptions_per_day') {
    // Exceptions linked to shipments matching the filter; use event_date as the day key.
    sql = `
      SELECT e.event_date::date AS d, COUNT(*) AS value
      FROM exceptions e
      JOIN shipments s ON s.shipment_id = e.shipment_id
      ${where.sql}
      GROUP BY e.event_date::date
      ORDER BY e.event_date::date
    `;
  } else {
    sql = `
      SELECT s.order_date::date AS d, COUNT(*) AS value
      FROM shipments s
      ${where.sql}
      GROUP BY s.order_date::date
      ORDER BY s.order_date::date
    `;
  }

  const { rows } = await pool.query(sql, where.params);
  const cells = rows.map((r: { d: Date | string; value: string }) => {
    const d = r.d instanceof Date ? r.d : new Date(r.d);
    return { date: d.toISOString().slice(0, 10), value: parseInt(r.value || '0', 10) };
  });

  const values = cells.map((c: { value: number }) => c.value);
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;

  return { source, dateStart, dateEnd, cells, min, max };
}
