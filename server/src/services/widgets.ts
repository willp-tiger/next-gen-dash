import pool from './db.js';
import { getMetricDefs } from './kpiDefinitionStore.js';
import type { MetricDefinition } from './kpiDefinitionStore.js';
import { TODAY } from './supplyChain/random.js';
import type {
  AnnotationEvent,
  FilterState,
  FunnelSnapshot,
  PivotDimension,
  PivotSnapshot,
  TimeseriesSnapshot,
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
