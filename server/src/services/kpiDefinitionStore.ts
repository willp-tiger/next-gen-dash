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
  return sql
    .replace(/production\.\w+\.sales_orders/g, 'sales_orders')
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

const COLUMN_DESCRIPTIONS: Record<string, string> = {
  'sales_orders.id': 'Auto-incrementing primary key',
  'sales_orders.order_number': 'Order identifier (multiple line items per order)',
  'sales_orders.quantity_ordered': 'Number of units in this line item',
  'sales_orders.price_each': 'Unit price for this line item',
  'sales_orders.order_line_number': 'Line item number within the order',
  'sales_orders.sales': 'Total sales amount for this line item',
  'sales_orders.order_date': 'Date the order was placed',
  'sales_orders.status': 'Order status: Shipped, Cancelled, Resolved, On Hold, In Process, Disputed',
  'sales_orders.qtr_id': 'Quarter of the year (1-4)',
  'sales_orders.month_id': 'Month of the year (1-12)',
  'sales_orders.year_id': 'Year of the order (2003-2005)',
  'sales_orders.product_line': 'Product category: Classic Cars, Motorcycles, Planes, Ships, Trains, Trucks and Buses, Vintage Cars',
  'sales_orders.msrp': 'Manufacturer suggested retail price',
  'sales_orders.product_code': 'Unique product SKU',
  'sales_orders.customer_name': 'Customer company name',
  'sales_orders.city': 'Customer city',
  'sales_orders.country': 'Customer country (19 countries)',
  'sales_orders.territory': 'Sales territory: NA, EMEA, APAC, Japan',
  'sales_orders.deal_size': 'Deal tier: Small, Medium, Large',
  'sales_orders.phone': 'Customer phone number',
  'sales_orders.address_line1': 'Primary address',
  'sales_orders.address_line2': 'Secondary address line',
  'sales_orders.state': 'Customer state/province',
  'sales_orders.postal_code': 'Postal/ZIP code',
  'sales_orders.contact_last_name': 'Primary contact last name',
  'sales_orders.contact_first_name': 'Primary contact first name',
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
      AND c.table_name IN ('sales_orders', 'customers', 'products')
    ORDER BY c.table_name, c.ordinal_position
  `);

  const tableMap = new Map<string, CatalogTable>();
  for (const row of rows) {
    const tableName = row.table_name as string;
    const colName = row.column_name as string;
    if (!tableMap.has(tableName)) {
      tableMap.set(tableName, {
        catalog: 'production',
        schema: 'sales',
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
