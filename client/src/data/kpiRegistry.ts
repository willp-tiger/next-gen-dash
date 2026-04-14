// Mock KPI Registry data representing what would live in Databricks Unity Catalog
// Updated for the Sales Analytics domain backed by real Postgres data

export interface KpiDefinition {
  kpiId: string;
  version: number;
  displayName: string;
  description: string;
  unit: string;
  direction: 'lower-is-better' | 'higher-is-better';
  sqlLogic: string;
  sourceTables: string[];
  grain: string;
  dimensions: string[];
  defaultThresholds: { greenMax: number; yellowMax: number };
  materialization: 'live' | 'scheduled';
  schedule: string | null;
  owner: string;
  status: 'draft' | 'validating' | 'validated' | 'published' | 'deprecated';
  createdAt: string;
  createdBy: string;
  changeReason: string;
  tags: string[];
}

export interface TestAssertion {
  assertionId: string;
  kpiId: string;
  assertionType: 'range_check' | 'not_null' | 'freshness' | 'row_count' | 'delta_check' | 'custom_sql';
  assertionSql: string;
  severity: 'warn' | 'fail';
  description: string;
  lastRunAt: string;
  lastResult: 'pass' | 'warn' | 'fail';
}

export interface ValidationResult {
  stage: string;
  status: 'pass' | 'warn' | 'fail' | 'pending';
  message: string;
  durationMs: number;
}

export interface KpiVersion {
  version: number;
  createdAt: string;
  createdBy: string;
  changeReason: string;
  status: 'published' | 'deprecated';
}

export interface CatalogTable {
  catalog: string;
  schema: string;
  table: string;
  columns: { name: string; type: string; description: string }[];
}

// ===== Mock Unity Catalog Schema (Sales Domain) =====

export const CATALOG_TABLES: CatalogTable[] = [
  {
    catalog: 'production',
    schema: 'sales',
    table: 'sales_orders',
    columns: [
      { name: 'id', type: 'SERIAL', description: 'Auto-incrementing primary key' },
      { name: 'order_number', type: 'INTEGER', description: 'Order identifier (multiple line items per order)' },
      { name: 'quantity_ordered', type: 'INTEGER', description: 'Number of units in this line item' },
      { name: 'price_each', type: 'NUMERIC(10,2)', description: 'Unit price for this line item' },
      { name: 'order_line_number', type: 'INTEGER', description: 'Line item number within the order' },
      { name: 'sales', type: 'NUMERIC(10,2)', description: 'Total sales amount for this line item' },
      { name: 'order_date', type: 'DATE', description: 'Date the order was placed' },
      { name: 'status', type: 'VARCHAR(20)', description: 'Order status: Shipped, Cancelled, Resolved, On Hold, In Process, Disputed' },
      { name: 'qtr_id', type: 'INTEGER', description: 'Quarter of the year (1-4)' },
      { name: 'month_id', type: 'INTEGER', description: 'Month of the year (1-12)' },
      { name: 'year_id', type: 'INTEGER', description: 'Year of the order (2003-2005)' },
      { name: 'product_line', type: 'VARCHAR(50)', description: 'Product category: Classic Cars, Motorcycles, Planes, Ships, Trains, Trucks and Buses, Vintage Cars' },
      { name: 'msrp', type: 'NUMERIC(10,2)', description: 'Manufacturer suggested retail price' },
      { name: 'product_code', type: 'VARCHAR(20)', description: 'Unique product SKU' },
      { name: 'customer_name', type: 'VARCHAR(100)', description: 'Customer company name' },
      { name: 'city', type: 'VARCHAR(100)', description: 'Customer city' },
      { name: 'country', type: 'VARCHAR(50)', description: 'Customer country (19 countries)' },
      { name: 'territory', type: 'VARCHAR(20)', description: 'Sales territory: NA, EMEA, APAC, Japan' },
      { name: 'deal_size', type: 'VARCHAR(20)', description: 'Deal tier: Small, Medium, Large' },
    ],
  },
  {
    catalog: 'production',
    schema: 'sales',
    table: 'customers',
    columns: [
      { name: 'customer_name', type: 'VARCHAR(100)', description: 'Unique customer company name' },
      { name: 'phone', type: 'VARCHAR(50)', description: 'Customer phone number' },
      { name: 'address_line1', type: 'VARCHAR(200)', description: 'Primary address' },
      { name: 'city', type: 'VARCHAR(100)', description: 'Customer city' },
      { name: 'state', type: 'VARCHAR(50)', description: 'Customer state/province' },
      { name: 'postal_code', type: 'VARCHAR(20)', description: 'Postal/ZIP code' },
      { name: 'country', type: 'VARCHAR(50)', description: 'Customer country' },
      { name: 'territory', type: 'VARCHAR(20)', description: 'Sales territory assignment' },
      { name: 'contact_last_name', type: 'VARCHAR(50)', description: 'Primary contact last name' },
      { name: 'contact_first_name', type: 'VARCHAR(50)', description: 'Primary contact first name' },
    ],
  },
  {
    catalog: 'production',
    schema: 'sales',
    table: 'products',
    columns: [
      { name: 'product_code', type: 'VARCHAR(20)', description: 'Unique product SKU' },
      { name: 'product_line', type: 'VARCHAR(50)', description: 'Product category' },
      { name: 'msrp', type: 'NUMERIC(10,2)', description: 'Manufacturer suggested retail price' },
    ],
  },
];

// ===== Mock KPI Definitions (Sales Domain) =====

export const KPI_REGISTRY: KpiDefinition[] = [
  {
    kpiId: 'total_revenue',
    version: 3,
    displayName: 'Total Revenue',
    description: 'Sum of all sales amounts across all order line items. The primary top-line revenue metric.',
    unit: 'dollars',
    direction: 'higher-is-better',
    sqlLogic: `SELECT COALESCE(SUM(sales), 0) AS value
FROM production.sales.sales_orders
WHERE year_id = :year AND qtr_id = :quarter`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory', 'deal_size'],
    defaultThresholds: { greenMax: 300000, yellowMax: 200000 },
    materialization: 'scheduled',
    schedule: '0 */1 * * *',
    owner: 'Revenue Team',
    status: 'published',
    createdAt: '2026-01-15T10:00:00Z',
    createdBy: 'sarah.chen',
    changeReason: 'Added quarterly grain parameter for trend analysis',
    tags: ['revenue', 'top-line', 'tier-1'],
  },
  {
    kpiId: 'avg_order_value',
    version: 2,
    displayName: 'Average Order Value',
    description: 'Mean sales amount per order line item. Indicates pricing efficiency and order quality.',
    unit: 'dollars',
    direction: 'higher-is-better',
    sqlLogic: `SELECT COALESCE(AVG(sales), 0) AS value
FROM production.sales.sales_orders
WHERE year_id = :year AND qtr_id = :quarter`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory', 'deal_size'],
    defaultThresholds: { greenMax: 4000, yellowMax: 3000 },
    materialization: 'scheduled',
    schedule: '0 */1 * * *',
    owner: 'Revenue Team',
    status: 'published',
    createdAt: '2026-02-01T14:30:00Z',
    createdBy: 'sarah.chen',
    changeReason: 'Refined to use per-line-item average instead of per-order',
    tags: ['revenue', 'pricing'],
  },
  {
    kpiId: 'total_orders',
    version: 1,
    displayName: 'Total Orders',
    description: 'Count of distinct order numbers in the period. Measures sales volume and pipeline throughput.',
    unit: 'count',
    direction: 'higher-is-better',
    sqlLogic: `SELECT COUNT(DISTINCT order_number) AS value
FROM production.sales.sales_orders
WHERE year_id = :year AND qtr_id = :quarter`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory', 'deal_size'],
    defaultThresholds: { greenMax: 350, yellowMax: 250 },
    materialization: 'scheduled',
    schedule: '0 0 * * *',
    owner: 'Sales Ops',
    status: 'published',
    createdAt: '2026-01-15T10:00:00Z',
    createdBy: 'mike.johnson',
    changeReason: 'Initial KPI definition',
    tags: ['volume', 'pipeline'],
  },
  {
    kpiId: 'units_sold',
    version: 1,
    displayName: 'Units Sold',
    description: 'Total quantity of items ordered across all line items. Measures product movement velocity.',
    unit: 'count',
    direction: 'higher-is-better',
    sqlLogic: `SELECT COALESCE(SUM(quantity_ordered), 0) AS value
FROM production.sales.sales_orders
WHERE year_id = :year AND qtr_id = :quarter`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory'],
    defaultThresholds: { greenMax: 35000, yellowMax: 25000 },
    materialization: 'scheduled',
    schedule: '0 0 * * *',
    owner: 'Sales Ops',
    status: 'published',
    createdAt: '2026-01-15T10:00:00Z',
    createdBy: 'mike.johnson',
    changeReason: 'Initial KPI definition',
    tags: ['volume', 'inventory'],
  },
  {
    kpiId: 'avg_price',
    version: 1,
    displayName: 'Avg Price per Unit',
    description: 'Average selling price per unit. Tracks pricing power and discount trends.',
    unit: 'dollars',
    direction: 'higher-is-better',
    sqlLogic: `SELECT COALESCE(AVG(price_each), 0) AS value
FROM production.sales.sales_orders
WHERE year_id = :year AND qtr_id = :quarter`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory'],
    defaultThresholds: { greenMax: 90, yellowMax: 75 },
    materialization: 'live',
    schedule: null,
    owner: 'Pricing Team',
    status: 'published',
    createdAt: '2026-01-20T09:00:00Z',
    createdBy: 'james.wright',
    changeReason: 'Initial KPI definition',
    tags: ['pricing', 'margin'],
  },
  {
    kpiId: 'fulfillment_rate',
    version: 2,
    displayName: 'Fulfillment Rate',
    description: 'Percentage of order line items with Shipped status. Key operational health indicator.',
    unit: 'percent',
    direction: 'higher-is-better',
    sqlLogic: `SELECT COUNT(CASE WHEN status = 'Shipped' THEN 1 END)
       * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM production.sales.sales_orders
WHERE year_id = :year AND qtr_id = :quarter`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory', 'deal_size'],
    defaultThresholds: { greenMax: 95, yellowMax: 85 },
    materialization: 'scheduled',
    schedule: '0 0 * * *',
    owner: 'Operations Team',
    status: 'published',
    createdAt: '2026-03-01T11:00:00Z',
    createdBy: 'lisa.park',
    changeReason: 'Switched from order-level to line-item-level calculation',
    tags: ['operations', 'fulfillment', 'tier-1'],
  },
  {
    kpiId: 'cancelled_order_rate',
    version: 1,
    displayName: 'Cancelled Order Rate',
    description: 'Percentage of distinct orders with Cancelled status. Tracks order quality and customer retention risk.',
    unit: 'percent',
    direction: 'lower-is-better',
    sqlLogic: `SELECT COUNT(CASE WHEN status = 'Cancelled' THEN 1 END)
       * 100.0 / NULLIF(COUNT(DISTINCT order_number), 0) AS value
FROM production.sales.sales_orders
WHERE year_id = :year AND qtr_id = :quarter`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory'],
    defaultThresholds: { greenMax: 3, yellowMax: 7 },
    materialization: 'scheduled',
    schedule: '0 0 * * *',
    owner: 'Operations Team',
    status: 'published',
    createdAt: '2026-02-10T16:00:00Z',
    createdBy: 'lisa.park',
    changeReason: 'Initial KPI definition',
    tags: ['operations', 'quality'],
  },
  {
    kpiId: 'avg_deal_size_value',
    version: 2,
    displayName: 'Avg Deal Size',
    description: 'Average total sales value per order (summing all line items). Measures deal quality and upsell effectiveness.',
    unit: 'dollars',
    direction: 'higher-is-better',
    sqlLogic: `SELECT COALESCE(AVG(total), 0) AS value
FROM (
  SELECT order_number, SUM(sales) AS total
  FROM production.sales.sales_orders
  WHERE year_id = :year AND qtr_id = :quarter
  GROUP BY order_number
) sub`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory', 'deal_size'],
    defaultThresholds: { greenMax: 4500, yellowMax: 3000 },
    materialization: 'scheduled',
    schedule: '0 6 * * *',
    owner: 'Revenue Team',
    status: 'published',
    createdAt: '2026-02-20T08:00:00Z',
    createdBy: 'sarah.chen',
    changeReason: 'Changed from line-item avg to order-total avg for accuracy',
    tags: ['revenue', 'deal-quality'],
  },
  {
    kpiId: 'revenue_per_customer',
    version: 1,
    displayName: 'Revenue per Customer',
    description: 'Total revenue divided by distinct customer count. Measures customer lifetime value and account health.',
    unit: 'dollars',
    direction: 'higher-is-better',
    sqlLogic: `SELECT SUM(sales) / NULLIF(COUNT(DISTINCT customer_name), 0) AS value
FROM production.sales.sales_orders
WHERE year_id = :year AND qtr_id = :quarter`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory'],
    defaultThresholds: { greenMax: 120000, yellowMax: 80000 },
    materialization: 'scheduled',
    schedule: '0 6 * * *',
    owner: 'CX Team',
    status: 'published',
    createdAt: '2026-01-15T10:00:00Z',
    createdBy: 'amy.torres',
    changeReason: 'Initial KPI definition',
    tags: ['customer-value', 'retention'],
  },
  {
    kpiId: 'order_frequency',
    version: 1,
    displayName: 'Orders per Customer',
    description: 'Average number of distinct orders per customer. Indicates repeat purchase behavior and loyalty.',
    unit: 'count',
    direction: 'higher-is-better',
    sqlLogic: `SELECT COUNT(DISTINCT order_number)::float
       / NULLIF(COUNT(DISTINCT customer_name), 0) AS value
FROM production.sales.sales_orders`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'all-time',
    dimensions: ['product_line', 'territory'],
    defaultThresholds: { greenMax: 4, yellowMax: 2 },
    materialization: 'live',
    schedule: null,
    owner: 'CX Team',
    status: 'published',
    createdAt: '2026-01-15T10:00:00Z',
    createdBy: 'amy.torres',
    changeReason: 'Initial KPI definition',
    tags: ['customer-value', 'loyalty'],
  },
  {
    kpiId: 'product_line_count',
    version: 1,
    displayName: 'Active Product Lines',
    description: 'Count of distinct product lines with orders. Measures catalog breadth and product diversity.',
    unit: 'count',
    direction: 'higher-is-better',
    sqlLogic: `SELECT COUNT(DISTINCT product_line) AS value
FROM production.sales.sales_orders`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'all-time',
    dimensions: ['territory', 'country'],
    defaultThresholds: { greenMax: 7, yellowMax: 5 },
    materialization: 'live',
    schedule: null,
    owner: 'Product Team',
    status: 'published',
    createdAt: '2026-01-15T10:00:00Z',
    createdBy: 'mike.johnson',
    changeReason: 'Initial KPI definition',
    tags: ['product', 'catalog'],
  },
  {
    kpiId: 'territory_revenue_share',
    version: 1,
    displayName: 'Top Territory Revenue %',
    description: 'Revenue share of the highest-revenue territory. Tracks geographic concentration risk \u2014 lower is more diversified.',
    unit: 'percent',
    direction: 'lower-is-better',
    sqlLogic: `SELECT MAX(terr_rev) * 100.0 / NULLIF(SUM(terr_rev), 0) AS value
FROM (
  SELECT territory, SUM(sales) AS terr_rev
  FROM production.sales.sales_orders
  GROUP BY territory
) sub`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'all-time',
    dimensions: ['product_line'],
    defaultThresholds: { greenMax: 40, yellowMax: 55 },
    materialization: 'live',
    schedule: null,
    owner: 'Strategy Team',
    status: 'published',
    createdAt: '2026-02-15T13:00:00Z',
    createdBy: 'james.wright',
    changeReason: 'Initial KPI definition',
    tags: ['strategy', 'geographic-risk'],
  },
  // Non-published KPIs to show lifecycle
  {
    kpiId: 'large_deal_rate',
    version: 1,
    displayName: 'Large Deal Rate',
    description: 'Percentage of orders classified as Large deal size. Tracks enterprise deal pipeline health.',
    unit: 'percent',
    direction: 'higher-is-better',
    sqlLogic: `SELECT COUNT(CASE WHEN deal_size = 'Large' THEN 1 END)
       * 100.0 / NULLIF(COUNT(DISTINCT order_number), 0) AS value
FROM production.sales.sales_orders
WHERE year_id = :year AND qtr_id = :quarter`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'quarterly',
    dimensions: ['product_line', 'territory', 'country'],
    defaultThresholds: { greenMax: 15, yellowMax: 8 },
    materialization: 'live',
    schedule: null,
    owner: 'Sarah Chen',
    status: 'validated',
    createdAt: '2026-04-08T09:30:00Z',
    createdBy: 'sarah.chen',
    changeReason: 'New KPI requested by enterprise sales team',
    tags: ['enterprise', 'deal-quality'],
  },
  {
    kpiId: 'discount_depth',
    version: 1,
    displayName: 'Discount Depth',
    description: 'Average percentage discount from MSRP. Measures pricing discipline \u2014 higher discount means more margin erosion.',
    unit: 'percent',
    direction: 'lower-is-better',
    sqlLogic: `SELECT AVG((msrp - price_each) / NULLIF(msrp, 0)) * 100 AS value
FROM production.sales.sales_orders
WHERE year_id = :year AND qtr_id = :quarter`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'quarterly',
    dimensions: ['product_line', 'territory', 'deal_size'],
    defaultThresholds: { greenMax: 10, yellowMax: 20 },
    materialization: 'live',
    schedule: null,
    owner: 'James Wright',
    status: 'draft',
    createdAt: '2026-04-10T08:00:00Z',
    createdBy: 'james.wright',
    changeReason: 'Investigating margin erosion \u2014 draft for pricing team review',
    tags: ['pricing', 'margin', 'discount'],
  },
  {
    kpiId: 'single_product_orders',
    version: 1,
    displayName: 'Single-Item Order Rate',
    description: 'Percentage of orders with only one line item. Was used to track cross-sell effectiveness but superseded by basket_size KPI.',
    unit: 'percent',
    direction: 'lower-is-better',
    sqlLogic: `WITH order_sizes AS (
  SELECT order_number, COUNT(*) AS line_count
  FROM production.sales.sales_orders
  GROUP BY order_number
)
SELECT COUNT(CASE WHEN line_count = 1 THEN 1 END)
       * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM order_sizes`,
    sourceTables: ['production.sales.sales_orders'],
    grain: 'all-time',
    dimensions: ['product_line', 'territory'],
    defaultThresholds: { greenMax: 15, yellowMax: 30 },
    materialization: 'scheduled',
    schedule: '0 6 * * *',
    owner: 'CX Team',
    status: 'deprecated',
    createdAt: '2026-03-01T10:00:00Z',
    createdBy: 'amy.torres',
    changeReason: 'Superseded by more accurate basket_size KPI',
    tags: ['cross-sell', 'retention'],
  },
];

// ===== Mock Test Assertions =====

export const TEST_ASSERTIONS: TestAssertion[] = [
  // total_revenue
  { assertionId: 'rev-range', kpiId: 'total_revenue', assertionType: 'range_check', assertionSql: "SELECT value >= 0 FROM kpi_result", severity: 'fail', description: 'Revenue must be non-negative', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'rev-null', kpiId: 'total_revenue', assertionType: 'not_null', assertionSql: "SELECT value IS NOT NULL FROM kpi_result", severity: 'fail', description: 'Must return a non-null value', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'rev-rows', kpiId: 'total_revenue', assertionType: 'row_count', assertionSql: "SELECT COUNT(*) > 0 FROM sales_orders", severity: 'fail', description: 'Source table must have data', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'rev-delta', kpiId: 'total_revenue', assertionType: 'delta_check', assertionSql: "SELECT ABS(current_qtr - prev_qtr) / prev_qtr < 0.5", severity: 'warn', description: 'Quarter-over-quarter change must be less than 50%', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },

  // fulfillment_rate
  { assertionId: 'ful-range', kpiId: 'fulfillment_rate', assertionType: 'range_check', assertionSql: "SELECT value >= 0 AND value <= 100 FROM kpi_result", severity: 'fail', description: 'Value must be between 0% and 100%', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'ful-null', kpiId: 'fulfillment_rate', assertionType: 'not_null', assertionSql: "SELECT value IS NOT NULL FROM kpi_result", severity: 'fail', description: 'Must return a non-null value', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'ful-rows', kpiId: 'fulfillment_rate', assertionType: 'row_count', assertionSql: "SELECT COUNT(*) > 0 FROM sales_orders WHERE status IS NOT NULL", severity: 'fail', description: 'Must have orders with status values', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'ful-fresh', kpiId: 'fulfillment_rate', assertionType: 'freshness', assertionSql: "SELECT MAX(order_date) >= CURRENT_DATE - INTERVAL '30 days'", severity: 'warn', description: 'Source data must be within 30 days', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'warn' },

  // cancelled_order_rate
  { assertionId: 'can-range', kpiId: 'cancelled_order_rate', assertionType: 'range_check', assertionSql: "SELECT value >= 0 AND value <= 100 FROM kpi_result", severity: 'fail', description: 'Value must be between 0% and 100%', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'can-null', kpiId: 'cancelled_order_rate', assertionType: 'not_null', assertionSql: "SELECT value IS NOT NULL FROM kpi_result", severity: 'fail', description: 'Must return a non-null value', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'can-delta', kpiId: 'cancelled_order_rate', assertionType: 'delta_check', assertionSql: "SELECT ABS(current - previous) < 10 FROM qtr_values", severity: 'warn', description: 'Quarter-over-quarter change should be less than 10pp', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'fail' },

  // avg_order_value
  { assertionId: 'aov-range', kpiId: 'avg_order_value', assertionType: 'range_check', assertionSql: "SELECT value > 0 AND value < 50000 FROM kpi_result", severity: 'fail', description: 'AOV must be positive and under $50,000', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'aov-null', kpiId: 'avg_order_value', assertionType: 'not_null', assertionSql: "SELECT value IS NOT NULL FROM kpi_result", severity: 'fail', description: 'Must return a non-null value', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },

  // units_sold
  { assertionId: 'units-range', kpiId: 'units_sold', assertionType: 'range_check', assertionSql: "SELECT value >= 0 FROM kpi_result", severity: 'fail', description: 'Units sold must be non-negative', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'units-null', kpiId: 'units_sold', assertionType: 'not_null', assertionSql: "SELECT value IS NOT NULL FROM kpi_result", severity: 'fail', description: 'Must return a non-null value', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },

  // avg_price
  { assertionId: 'price-range', kpiId: 'avg_price', assertionType: 'range_check', assertionSql: "SELECT value > 0 AND value < 500 FROM kpi_result", severity: 'fail', description: 'Avg price must be positive and under $500', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'price-null', kpiId: 'avg_price', assertionType: 'not_null', assertionSql: "SELECT value IS NOT NULL FROM kpi_result", severity: 'warn', description: 'Should return a non-null value', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },

  // revenue_per_customer
  { assertionId: 'rpc-range', kpiId: 'revenue_per_customer', assertionType: 'range_check', assertionSql: "SELECT value > 0 FROM kpi_result", severity: 'fail', description: 'Revenue per customer must be positive', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'rpc-rows', kpiId: 'revenue_per_customer', assertionType: 'row_count', assertionSql: "SELECT COUNT(DISTINCT customer_name) >= 10 FROM sales_orders", severity: 'warn', description: 'Should have at least 10 distinct customers', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },

  // avg_deal_size_value
  { assertionId: 'deal-range', kpiId: 'avg_deal_size_value', assertionType: 'range_check', assertionSql: "SELECT value > 0 FROM kpi_result", severity: 'fail', description: 'Deal size must be positive', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'deal-null', kpiId: 'avg_deal_size_value', assertionType: 'not_null', assertionSql: "SELECT value IS NOT NULL FROM kpi_result", severity: 'fail', description: 'Must return a non-null value', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },

  // territory_revenue_share
  { assertionId: 'terr-range', kpiId: 'territory_revenue_share', assertionType: 'range_check', assertionSql: "SELECT value >= 0 AND value <= 100 FROM kpi_result", severity: 'fail', description: 'Percentage must be between 0% and 100%', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
  { assertionId: 'terr-delta', kpiId: 'territory_revenue_share', assertionType: 'delta_check', assertionSql: "SELECT ABS(current - previous) < 15 FROM qtr_values", severity: 'warn', description: 'Quarter-over-quarter shift should be less than 15pp', lastRunAt: '2026-04-10T06:00:00Z', lastResult: 'pass' },
];

// ===== Mock Version History =====

export const VERSION_HISTORY: Record<string, KpiVersion[]> = {
  total_revenue: [
    { version: 1, createdAt: '2026-01-15T10:00:00Z', createdBy: 'sarah.chen', changeReason: 'Initial KPI definition', status: 'deprecated' },
    { version: 2, createdAt: '2026-02-01T09:00:00Z', createdBy: 'sarah.chen', changeReason: 'Added territory dimension', status: 'deprecated' },
    { version: 3, createdAt: '2026-03-10T14:00:00Z', createdBy: 'sarah.chen', changeReason: 'Added quarterly grain parameter for trend analysis', status: 'published' },
  ],
  fulfillment_rate: [
    { version: 1, createdAt: '2026-01-15T10:00:00Z', createdBy: 'lisa.park', changeReason: 'Initial KPI — order-level calculation', status: 'deprecated' },
    { version: 2, createdAt: '2026-03-01T11:00:00Z', createdBy: 'lisa.park', changeReason: 'Switched from order-level to line-item-level calculation', status: 'published' },
  ],
  avg_order_value: [
    { version: 1, createdAt: '2026-01-15T10:00:00Z', createdBy: 'sarah.chen', changeReason: 'Initial KPI — per-order average', status: 'deprecated' },
    { version: 2, createdAt: '2026-02-01T14:30:00Z', createdBy: 'sarah.chen', changeReason: 'Refined to use per-line-item average', status: 'published' },
  ],
  avg_deal_size_value: [
    { version: 1, createdAt: '2026-01-20T08:00:00Z', createdBy: 'sarah.chen', changeReason: 'Initial KPI — simple line-item average', status: 'deprecated' },
    { version: 2, createdAt: '2026-02-20T08:00:00Z', createdBy: 'sarah.chen', changeReason: 'Changed from line-item avg to order-total avg for accuracy', status: 'published' },
  ],
};

// ===== Mock Validation Pipeline Results =====

export const MOCK_VALIDATION_RESULTS: Record<string, ValidationResult[]> = {
  large_deal_rate: [
    { stage: 'Schema Validation', status: 'pass', message: 'All referenced tables and columns exist in the catalog', durationMs: 340 },
    { stage: 'Execution Validation', status: 'pass', message: 'SQL executed successfully, returned 1 row', durationMs: 1250 },
    { stage: 'Type Validation', status: 'pass', message: 'Result is numeric value 12.4, consistent with percent unit', durationMs: 120 },
    { stage: 'Range Validation', status: 'pass', message: 'Value 12.4 is within expected range [0, 100] for percent', durationMs: 890 },
    { stage: 'Null/Empty Validation', status: 'pass', message: 'Query returned non-null result for current period', durationMs: 95 },
    { stage: 'Freshness Validation', status: 'pass', message: 'Source table has 2,823 rows across 2003-2005', durationMs: 210 },
    { stage: 'Semantic Validation', status: 'pass', message: 'Claude confirms: SQL correctly computes percentage of Large-sized deals', durationMs: 2100 },
    { stage: 'Consistency Validation', status: 'warn', message: 'Related to deal_size dimension but measures a different aspect than avg_deal_size_value. Not a duplicate.', durationMs: 1800 },
  ],
  discount_depth: [
    { stage: 'Schema Validation', status: 'pass', message: 'All referenced tables and columns exist (msrp, price_each)', durationMs: 280 },
    { stage: 'Execution Validation', status: 'pass', message: 'SQL executed successfully, returned 1 row', durationMs: 1450 },
    { stage: 'Type Validation', status: 'pass', message: 'Result is numeric value 14.7, consistent with percent unit', durationMs: 110 },
    { stage: 'Range Validation', status: 'warn', message: 'Value 14.7% — some rows show negative discounts (price > MSRP). Verify this is expected.', durationMs: 920 },
    { stage: 'Null/Empty Validation', status: 'pass', message: 'Query returned non-null result', durationMs: 88 },
    { stage: 'Freshness Validation', status: 'pass', message: 'Source table has current data', durationMs: 195 },
    { stage: 'Semantic Validation', status: 'pending', message: 'Awaiting Claude review...', durationMs: 0 },
    { stage: 'Consistency Validation', status: 'pending', message: 'Awaiting Claude review...', durationMs: 0 },
  ],
  single_product_orders: [
    { stage: 'Schema Validation', status: 'pass', message: 'order_number column exists in production.sales.sales_orders', durationMs: 260 },
    { stage: 'Execution Validation', status: 'pass', message: 'Windowed CTE executed successfully, returned 1 row', durationMs: 1680 },
    { stage: 'Type Validation', status: 'pass', message: 'Result is numeric value 22.1, consistent with percent unit', durationMs: 105 },
    { stage: 'Range Validation', status: 'pass', message: 'Value 22.1 is within expected range [0, 100] for percent', durationMs: 780 },
    { stage: 'Null/Empty Validation', status: 'pass', message: 'CTE produced 307 distinct orders, no null line counts', durationMs: 115 },
    { stage: 'Freshness Validation', status: 'pass', message: 'Source table has 2,823 rows across 2003-2005', durationMs: 205 },
    { stage: 'Semantic Validation', status: 'pass', message: 'Claude confirms: SQL correctly identifies single-line orders as cross-sell proxy', durationMs: 2240 },
    { stage: 'Consistency Validation', status: 'pass', message: 'No overlap with existing KPIs; cross-sell dimension not yet covered.', durationMs: 1560 },
  ],
  repeat_customer_rate: [
    { stage: 'Schema Validation', status: 'pass', message: 'customer_name and order_number columns exist in production.sales.sales_orders', durationMs: 295 },
    { stage: 'Execution Validation', status: 'pass', message: 'SQL executed successfully, returned 1 row', durationMs: 1520 },
    { stage: 'Type Validation', status: 'pass', message: 'Result is numeric value 68.4, consistent with percent unit', durationMs: 118 },
    { stage: 'Range Validation', status: 'pass', message: 'Value 68.4 is within expected range [0, 100] for percent', durationMs: 840 },
    { stage: 'Null/Empty Validation', status: 'warn', message: '3 orders have null customer_name and were excluded from the denominator.', durationMs: 160 },
    { stage: 'Freshness Validation', status: 'pass', message: 'Source table has current data through 2005-05-31', durationMs: 215 },
    { stage: 'Semantic Validation', status: 'pass', message: 'Claude confirms: SQL correctly computes share of customers with >1 order', durationMs: 2080 },
    { stage: 'Consistency Validation', status: 'warn', message: 'Directionally similar to order_frequency. Consider whether both are needed.', durationMs: 1720 },
  ],
};
