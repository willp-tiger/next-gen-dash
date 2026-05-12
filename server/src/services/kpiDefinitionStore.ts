import pool from './db.js';

export interface MetricDefinition {
  id: string;
  label: string;
  unit: string;
  chartType: string;
  direction: 'higher-is-better' | 'lower-is-better';
  greenMax: number;
  yellowMax: number;
  sql: string;
  trendSql: string;
}

export interface KpiDefinitionRow {
  kpiId: string;
  version: number;
  displayName: string;
  description: string;
  unit: string;
  chartType: string;
  direction: 'higher-is-better' | 'lower-is-better';
  greenMax: number;
  yellowMax: number;
  sqlLogic: string;
  execSql: string | null;
  trendSql: string | null;
  sourceTables: string[];
  grain: string;
  dimensions: string[];
  materialization: string;
  schedule: string | null;
  owner: string;
  status: string;
  createdAt: string;
  createdBy: string;
  changeReason: string;
  tags: string[];
}

export interface KpiVersionRow {
  version: number;
  createdAt: string;
  createdBy: string;
  changeReason: string;
  status: string;
}

export interface CatalogTable {
  catalog: string;
  schema: string;
  table: string;
  columns: { name: string; type: string; description: string }[];
}

let cachedMetricDefs: MetricDefinition[] = [];
let cachedSchemaTables: CatalogTable[] = [];

export function normalizePublishedSql(sql: string): string {
  // Strip schema-qualified prefixes from any table reference (e.g., production.supply_chain.shipments → shipments).
  // Also strip trailing WHERE clauses that reference :param placeholders (those are documentation-only).
  return sql
    .replace(/production\.\w+\./g, '')
    .replace(/\s+WHERE\s+[^;]*?:[a-z_]+[^;]*$/i, '')
    .trim();
}

function rowToMetricDef(row: Record<string, unknown>): MetricDefinition {
  const execSql = (row.exec_sql as string | null) || normalizePublishedSql(row.sql_logic as string);
  return {
    id: row.kpi_id as string,
    label: row.display_name as string,
    unit: row.unit as string,
    chartType: (row.chart_type as string) || 'number',
    direction: row.direction as 'higher-is-better' | 'lower-is-better',
    greenMax: parseFloat(row.green_max as string),
    yellowMax: parseFloat(row.yellow_max as string),
    sql: execSql,
    trendSql: (row.trend_sql as string) || '',
  };
}

function rowToKpiDef(row: Record<string, unknown>): KpiDefinitionRow {
  return {
    kpiId: row.kpi_id as string,
    version: row.version as number,
    displayName: row.display_name as string,
    description: (row.description as string) || '',
    unit: row.unit as string,
    chartType: (row.chart_type as string) || 'number',
    direction: row.direction as 'higher-is-better' | 'lower-is-better',
    greenMax: parseFloat(row.green_max as string),
    yellowMax: parseFloat(row.yellow_max as string),
    sqlLogic: row.sql_logic as string,
    execSql: row.exec_sql as string | null,
    trendSql: row.trend_sql as string | null,
    sourceTables: (row.source_tables as string[]) || [],
    grain: (row.grain as string) || 'all-time',
    dimensions: (row.dimensions as string[]) || [],
    materialization: (row.materialization as string) || 'live',
    schedule: row.schedule as string | null,
    owner: (row.owner as string) || 'System',
    status: (row.status as string) || 'published',
    createdAt: (row.created_at as Date)?.toISOString?.() ?? (row.created_at as string),
    createdBy: (row.created_by as string) || 'system',
    changeReason: (row.change_reason as string) || '',
    tags: (row.tags as string[]) || [],
  };
}

function rowToVersion(row: Record<string, unknown>): KpiVersionRow {
  return {
    version: row.version as number,
    createdAt: (row.created_at as Date)?.toISOString?.() ?? (row.created_at as string),
    createdBy: row.created_by as string,
    changeReason: (row.change_reason as string) || '',
    status: row.status as string,
  };
}

export async function initKpiDefinitions(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT * FROM kpi_definitions WHERE status IN ('published', 'validated') ORDER BY display_name`
  );
  cachedMetricDefs = rows.map(rowToMetricDef);

  cachedSchemaTables = await loadSchemaTables();

  console.log(`Loaded ${cachedMetricDefs.length} metric definitions and ${cachedSchemaTables.length} schema tables from DB.`);
}

export function getMetricDefs(): MetricDefinition[] {
  return cachedMetricDefs;
}

export async function refreshMetricDefs(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT * FROM kpi_definitions WHERE status IN ('published', 'validated') ORDER BY display_name`
  );
  cachedMetricDefs = rows.map(rowToMetricDef);
}

export async function getAllKpiDefinitions(): Promise<KpiDefinitionRow[]> {
  const { rows } = await pool.query('SELECT * FROM kpi_definitions ORDER BY display_name');
  return rows.map(rowToKpiDef);
}

export async function getAllVersions(): Promise<Record<string, KpiVersionRow[]>> {
  const { rows } = await pool.query('SELECT * FROM kpi_versions ORDER BY kpi_id, version');
  const result: Record<string, KpiVersionRow[]> = {};
  for (const row of rows) {
    const kpiId = row.kpi_id as string;
    (result[kpiId] ??= []).push(rowToVersion(row));
  }
  return result;
}

// Fallback descriptions when column comments are missing from the DB.
// The Meridian supply chain schema covers procurement → inventory → outbound → returns.
const COLUMN_DESCRIPTIONS: Record<string, string> = {
  // suppliers
  'suppliers.supplier_id': 'Unique supplier identifier (e.g., SUP-0042)',
  'suppliers.name': 'Supplier company name',
  'suppliers.country': 'Supplier country',
  'suppliers.region': 'Supplier region: NA | EMEA | APAC | LATAM',
  'suppliers.tier': 'Supplier tier: Strategic | Preferred | Tactical',
  'suppliers.onboarded_at': 'Date supplier was onboarded',
  'suppliers.payment_terms': 'Payment terms: NET30 | NET45 | NET60',
  'suppliers.status': 'Supplier status: active | suspended | offboarded',

  // warehouses
  'warehouses.warehouse_id': 'Unique warehouse identifier (e.g., WH-NA-01)',
  'warehouses.name': 'Warehouse name',
  'warehouses.country': 'Warehouse country',
  'warehouses.region': 'Warehouse region: NA | EMEA | APAC | LATAM',
  'warehouses.type': 'Warehouse type: DC | Regional | Cross-dock',
  'warehouses.capacity_pallets': 'Total pallet positions in the facility',
  'warehouses.opened_at': 'Date warehouse was opened',

  // carriers
  'carriers.carrier_id': 'Unique carrier identifier',
  'carriers.name': 'Carrier name',
  'carriers.type': 'Service type: Parcel | LTL | FTL | Ocean | Air',
  'carriers.region': 'Operating region',
  'carriers.sla_days': 'Standard transit SLA in days',

  // customers
  'customers.customer_id': 'Unique customer identifier',
  'customers.name': 'Customer company name',
  'customers.segment': 'Customer segment: Enterprise | Mid-Market | SMB',
  'customers.industry': 'Industry vertical: Manufacturing | Automotive | Aerospace | Energy | Construction',
  'customers.country': 'Customer country',
  'customers.region': 'Customer region',
  'customers.onboarded_at': 'Date customer was onboarded',

  // skus
  'skus.sku_id': 'Unique SKU identifier',
  'skus.name': 'SKU display name',
  'skus.category': 'Product category: Fasteners | Bearings | Hydraulics | Electrical | Safety | MRO | Cutting Tools',
  'skus.subcategory': 'Subcategory within the parent category',
  'skus.abc_class': 'ABC velocity class: A (top 10%) | B (next 30%) | C (long tail)',
  'skus.is_critical': 'TRUE if SKU is a critical-path part (production-stopping if stocked out)',
  'skus.unit_cost': 'Cost per unit from supplier',
  'skus.list_price': 'List price to customer',
  'skus.weight_kg': 'Unit weight in kilograms',
  'skus.primary_supplier_id': 'FK to suppliers.supplier_id',
  'skus.lead_time_days': 'Typical replenishment lead time from supplier',
  'skus.introduced_at': 'Date SKU was introduced to catalog',
  'skus.status': 'SKU status: active | phasing_out | discontinued',

  // purchase_orders
  'purchase_orders.po_id': 'Purchase order header identifier (multiple lines per PO)',
  'purchase_orders.line_number': 'Line number within the PO',
  'purchase_orders.supplier_id': 'FK to suppliers',
  'purchase_orders.warehouse_id': 'Destination warehouse',
  'purchase_orders.sku_id': 'FK to skus',
  'purchase_orders.qty_ordered': 'Quantity ordered on this line',
  'purchase_orders.qty_received': 'Quantity actually received (may be partial)',
  'purchase_orders.unit_cost': 'Negotiated cost per unit',
  'purchase_orders.ordered_date': 'Date PO placed with supplier',
  'purchase_orders.promised_date': 'Supplier-committed delivery date',
  'purchase_orders.received_date': 'Actual receipt date at warehouse (NULL until received)',
  'purchase_orders.status': 'PO lifecycle: Open | Confirmed | In Transit | Received | Closed | Cancelled',

  // shipments
  'shipments.shipment_id': 'Outbound shipment identifier',
  'shipments.customer_id': 'FK to customers',
  'shipments.warehouse_id': 'Origin warehouse',
  'shipments.carrier_id': 'FK to carriers',
  'shipments.order_date': 'Customer order placement date',
  'shipments.promised_date': 'Promised delivery date',
  'shipments.shipped_date': 'Actual ship-out date (NULL until shipped)',
  'shipments.delivered_date': 'Final delivery date (NULL until delivered)',
  'shipments.status': 'Lifecycle: Open | Picking | Packed | Shipped | Delivered | Cancelled | Returned',
  'shipments.origin_region': 'Region of shipping warehouse',
  'shipments.destination_region': 'Region of delivery address',
  'shipments.total_value': 'Total line-item value',

  // shipment_lines
  'shipment_lines.shipment_id': 'FK to shipments',
  'shipment_lines.line_number': 'Line number within the shipment',
  'shipment_lines.sku_id': 'FK to skus',
  'shipment_lines.qty_ordered': 'Quantity ordered on this line',
  'shipment_lines.qty_shipped': 'Quantity actually shipped',
  'shipment_lines.qty_backordered': 'Quantity NOT shipped (stockout); partial-fill signal',
  'shipment_lines.unit_price': 'Unit price quoted to customer',
  'shipment_lines.line_total': 'qty_shipped * unit_price',

  // inventory_snapshots
  'inventory_snapshots.snapshot_date': 'Daily snapshot date',
  'inventory_snapshots.warehouse_id': 'FK to warehouses',
  'inventory_snapshots.sku_id': 'FK to skus',
  'inventory_snapshots.on_hand_qty': 'Physical inventory present at the warehouse',
  'inventory_snapshots.allocated_qty': 'Reserved against open shipments',
  'inventory_snapshots.on_order_qty': 'On-order from suppliers, not yet received',
  'inventory_snapshots.days_of_supply': 'on_hand / avg_daily_demand (forward coverage)',

  // exceptions
  'exceptions.exception_id': 'Primary key',
  'exceptions.event_date': 'When the exception was logged',
  'exceptions.shipment_id': 'FK to shipments (nullable; may be PO-scoped)',
  'exceptions.po_id': 'PO identifier (nullable; may be shipment-scoped)',
  'exceptions.reason_code': 'Categorized reason: Carrier Delay | Address Issue | Damage | Weather | Capacity | Customs | Supplier Delay | Hazmat Hold | Documentation | Quality Hold | Other',
  'exceptions.severity': 'info | warning | critical',
  'exceptions.resolved_date': 'Date issue resolved (NULL = open)',
  'exceptions.resolution_note': 'Free-text resolution detail',

  // returns
  'returns.return_id': 'Primary key',
  'returns.shipment_id': 'FK to shipments',
  'returns.customer_id': 'FK to customers',
  'returns.sku_id': 'FK to skus',
  'returns.return_date': 'Date return was initiated',
  'returns.reason_code': 'Return reason: Defective | Wrong Item | No Longer Needed | Damaged in Transit | Excess Order | Other',
  'returns.qty_returned': 'Quantity returned',
  'returns.condition': 'Returned condition: Sellable | Damaged | Scrap',
  'returns.refund_amount': 'Refund amount issued',
};

async function loadSchemaTables(): Promise<CatalogTable[]> {
  const { rows } = await pool.query(`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      c.character_maximum_length,
      c.numeric_precision,
      c.numeric_scale,
      COALESCE(
        col_description(
          (SELECT oid FROM pg_class WHERE relname = c.table_name),
          c.ordinal_position
        ), ''
      ) AS description
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name IN (
        'suppliers', 'warehouses', 'carriers', 'customers', 'skus',
        'purchase_orders', 'shipments', 'shipment_lines',
        'inventory_snapshots', 'exceptions', 'returns'
      )
    ORDER BY c.table_name, c.ordinal_position
  `);

  const tableMap = new Map<string, CatalogTable>();
  for (const row of rows) {
    const tableName = row.table_name as string;
    const colName = row.column_name as string;
    if (!tableMap.has(tableName)) {
      tableMap.set(tableName, {
        catalog: 'production',
        schema: 'supply_chain',
        table: tableName,
        columns: [],
      });
    }
    let pgType = (row.data_type as string).toUpperCase();
    if (pgType === 'CHARACTER VARYING') {
      pgType = `VARCHAR(${row.character_maximum_length || 255})`;
    } else if (pgType === 'NUMERIC' && row.numeric_precision) {
      pgType = `NUMERIC(${row.numeric_precision},${row.numeric_scale || 0})`;
    } else if (pgType === 'INTEGER') {
      pgType = 'INTEGER';
    }
    const dbDesc = row.description as string;
    const fallbackDesc = COLUMN_DESCRIPTIONS[`${tableName}.${colName}`] ?? '';
    tableMap.get(tableName)!.columns.push({
      name: colName,
      type: pgType,
      description: dbDesc || fallbackDesc,
    });
  }

  return Array.from(tableMap.values());
}

export function getSchemaTables(): CatalogTable[] {
  return cachedSchemaTables;
}

export async function getExistingKpiIds(): Promise<string[]> {
  const { rows } = await pool.query('SELECT kpi_id FROM kpi_definitions');
  return rows.map(r => r.kpi_id as string);
}
