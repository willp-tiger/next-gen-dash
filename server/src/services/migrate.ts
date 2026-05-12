import pool from './db.js';

interface SeedKpi {
  kpiId: string; version: number; displayName: string; description: string;
  unit: string; chartType: string; direction: string;
  greenMax: number; yellowMax: number;
  sqlLogic: string; execSql: string; trendSql: string;
  sourceTables: string[]; grain: string; dimensions: string[];
  materialization: string; schedule: string | null;
  owner: string; status: string;
  createdAt: string; createdBy: string; changeReason: string; tags: string[];
}

interface SeedVersion {
  kpiId: string; version: number; createdAt: string;
  createdBy: string; changeReason: string; status: string;
}

const SEED_KPIS: SeedKpi[] = [
  {
    kpiId: 'total_revenue', version: 3,
    displayName: 'Total Revenue',
    description: 'Sum of all sales amounts across all order line items. The primary top-line revenue metric.',
    unit: 'dollars', chartType: 'line', direction: 'higher-is-better',
    greenMax: 300000, yellowMax: 200000,
    sqlLogic: `SELECT COALESCE(SUM(sales), 0) AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
    execSql: `SELECT COALESCE(SUM(sales), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, SUM(sales) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory', 'deal_size'],
    materialization: 'scheduled', schedule: '0 */1 * * *',
    owner: 'Revenue Team', status: 'published',
    createdAt: '2026-01-15T10:00:00Z', createdBy: 'sarah.chen',
    changeReason: 'Added quarterly grain parameter for trend analysis',
    tags: ['revenue', 'top-line', 'tier-1'],
  },
  {
    kpiId: 'avg_order_value', version: 2,
    displayName: 'Average Order Value',
    description: 'Mean sales amount per order line item. Indicates pricing efficiency and order quality.',
    unit: 'dollars', chartType: 'line', direction: 'higher-is-better',
    greenMax: 4000, yellowMax: 3000,
    sqlLogic: `SELECT COALESCE(AVG(sales), 0) AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
    execSql: `SELECT COALESCE(AVG(sales), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, AVG(sales) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory', 'deal_size'],
    materialization: 'scheduled', schedule: '0 */1 * * *',
    owner: 'Revenue Team', status: 'published',
    createdAt: '2026-02-01T14:30:00Z', createdBy: 'sarah.chen',
    changeReason: 'Refined to use per-line-item average instead of per-order',
    tags: ['revenue', 'pricing'],
  },
  {
    kpiId: 'total_orders', version: 1,
    displayName: 'Total Orders',
    description: 'Count of distinct order numbers in the period. Measures sales volume and pipeline throughput.',
    unit: 'count', chartType: 'bar', direction: 'higher-is-better',
    greenMax: 350, yellowMax: 250,
    sqlLogic: `SELECT COUNT(DISTINCT order_number) AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
    execSql: `SELECT COUNT(DISTINCT order_number) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, COUNT(DISTINCT order_number) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory', 'deal_size'],
    materialization: 'scheduled', schedule: '0 0 * * *',
    owner: 'Sales Ops', status: 'published',
    createdAt: '2026-01-15T10:00:00Z', createdBy: 'mike.johnson',
    changeReason: 'Initial KPI definition',
    tags: ['volume', 'pipeline'],
  },
  {
    kpiId: 'units_sold', version: 1,
    displayName: 'Units Sold',
    description: 'Total quantity of items ordered across all line items. Measures product movement velocity.',
    unit: 'count', chartType: 'bar', direction: 'higher-is-better',
    greenMax: 35000, yellowMax: 25000,
    sqlLogic: `SELECT COALESCE(SUM(quantity_ordered), 0) AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
    execSql: `SELECT COALESCE(SUM(quantity_ordered), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, SUM(quantity_ordered) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory'],
    materialization: 'scheduled', schedule: '0 0 * * *',
    owner: 'Sales Ops', status: 'published',
    createdAt: '2026-01-15T10:00:00Z', createdBy: 'mike.johnson',
    changeReason: 'Initial KPI definition',
    tags: ['volume', 'inventory'],
  },
  {
    kpiId: 'avg_price', version: 1,
    displayName: 'Avg Price per Unit',
    description: 'Average selling price per unit. Tracks pricing power and discount trends.',
    unit: 'dollars', chartType: 'line', direction: 'higher-is-better',
    greenMax: 90, yellowMax: 75,
    sqlLogic: `SELECT COALESCE(AVG(price_each), 0) AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
    execSql: `SELECT COALESCE(AVG(price_each), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, AVG(price_each) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory'],
    materialization: 'live', schedule: null,
    owner: 'Pricing Team', status: 'published',
    createdAt: '2026-01-20T09:00:00Z', createdBy: 'james.wright',
    changeReason: 'Initial KPI definition',
    tags: ['pricing', 'margin'],
  },
  {
    kpiId: 'fulfillment_rate', version: 2,
    displayName: 'Fulfillment Rate',
    description: 'Percentage of order line items with Shipped status. Key operational health indicator.',
    unit: 'percent', chartType: 'gauge', direction: 'higher-is-better',
    greenMax: 95, yellowMax: 85,
    sqlLogic: `SELECT COUNT(CASE WHEN status = 'Shipped' THEN 1 END)\n       * 100.0 / NULLIF(COUNT(*), 0) AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
    execSql: `SELECT COUNT(CASE WHEN status = 'Shipped' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, COUNT(CASE WHEN status = 'Shipped' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory', 'deal_size'],
    materialization: 'scheduled', schedule: '0 0 * * *',
    owner: 'Operations Team', status: 'published',
    createdAt: '2026-03-01T11:00:00Z', createdBy: 'lisa.park',
    changeReason: 'Switched from order-level to line-item-level calculation',
    tags: ['operations', 'fulfillment', 'tier-1'],
  },
  {
    kpiId: 'cancelled_order_rate', version: 1,
    displayName: 'Cancelled Order Rate',
    description: 'Percentage of distinct orders with Cancelled status. Tracks order quality and customer retention risk.',
    unit: 'percent', chartType: 'bar', direction: 'lower-is-better',
    greenMax: 3, yellowMax: 7,
    sqlLogic: `SELECT COUNT(CASE WHEN status = 'Cancelled' THEN 1 END)\n       * 100.0 / NULLIF(COUNT(DISTINCT order_number), 0) AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
    execSql: `SELECT COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) * 100.0 / NULLIF(COUNT(DISTINCT order_number), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, COUNT(CASE WHEN status = 'Cancelled' THEN 1 END) * 100.0 / NULLIF(COUNT(DISTINCT order_number), 0) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory'],
    materialization: 'scheduled', schedule: '0 0 * * *',
    owner: 'Operations Team', status: 'published',
    createdAt: '2026-02-10T16:00:00Z', createdBy: 'lisa.park',
    changeReason: 'Initial KPI definition',
    tags: ['operations', 'quality'],
  },
  {
    kpiId: 'avg_deal_size_value', version: 2,
    displayName: 'Avg Deal Size',
    description: 'Average total sales value per order (summing all line items). Measures deal quality and upsell effectiveness.',
    unit: 'dollars', chartType: 'area', direction: 'higher-is-better',
    greenMax: 4500, yellowMax: 3000,
    sqlLogic: `SELECT COALESCE(AVG(total), 0) AS value\nFROM (\n  SELECT order_number, SUM(sales) AS total\n  FROM production.sales.sales_orders\n  WHERE year_id = :year AND qtr_id = :quarter\n  GROUP BY order_number\n) sub`,
    execSql: `SELECT COALESCE(AVG(total), 0) AS value FROM (SELECT order_number, SUM(sales) AS total FROM sales_orders GROUP BY order_number) sub`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, AVG(total) AS value FROM (SELECT order_number, year_id, qtr_id, SUM(sales) AS total FROM sales_orders GROUP BY order_number, year_id, qtr_id) sub GROUP BY year_id, qtr_id, period ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory', 'deal_size'],
    materialization: 'scheduled', schedule: '0 6 * * *',
    owner: 'Revenue Team', status: 'published',
    createdAt: '2026-02-20T08:00:00Z', createdBy: 'sarah.chen',
    changeReason: 'Changed from line-item avg to order-total avg for accuracy',
    tags: ['revenue', 'deal-quality'],
  },
  {
    kpiId: 'revenue_per_customer', version: 1,
    displayName: 'Revenue per Customer',
    description: 'Total revenue divided by distinct customer count. Measures customer lifetime value and account health.',
    unit: 'dollars', chartType: 'line', direction: 'higher-is-better',
    greenMax: 120000, yellowMax: 80000,
    sqlLogic: `SELECT SUM(sales) / NULLIF(COUNT(DISTINCT customer_name), 0) AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
    execSql: `SELECT COALESCE(SUM(sales) / NULLIF(COUNT(DISTINCT customer_name), 0), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, SUM(sales) / NULLIF(COUNT(DISTINCT customer_name), 0) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'quarterly',
    dimensions: ['product_line', 'country', 'territory'],
    materialization: 'scheduled', schedule: '0 6 * * *',
    owner: 'CX Team', status: 'published',
    createdAt: '2026-01-15T10:00:00Z', createdBy: 'amy.torres',
    changeReason: 'Initial KPI definition',
    tags: ['customer-value', 'retention'],
  },
  {
    kpiId: 'order_frequency', version: 1,
    displayName: 'Orders per Customer',
    description: 'Average number of distinct orders per customer. Indicates repeat purchase behavior and loyalty.',
    unit: 'count', chartType: 'bar', direction: 'higher-is-better',
    greenMax: 4, yellowMax: 2,
    sqlLogic: `SELECT COUNT(DISTINCT order_number)::float\n       / NULLIF(COUNT(DISTINCT customer_name), 0) AS value\nFROM production.sales.sales_orders`,
    execSql: `SELECT COALESCE(COUNT(DISTINCT order_number)::float / NULLIF(COUNT(DISTINCT customer_name), 0), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, COUNT(DISTINCT order_number)::float / NULLIF(COUNT(DISTINCT customer_name), 0) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'all-time',
    dimensions: ['product_line', 'territory'],
    materialization: 'live', schedule: null,
    owner: 'CX Team', status: 'published',
    createdAt: '2026-01-15T10:00:00Z', createdBy: 'amy.torres',
    changeReason: 'Initial KPI definition',
    tags: ['customer-value', 'loyalty'],
  },
  {
    kpiId: 'product_line_count', version: 1,
    displayName: 'Active Product Lines',
    description: 'Count of distinct product lines with orders. Measures catalog breadth and product diversity.',
    unit: 'count', chartType: 'number', direction: 'higher-is-better',
    greenMax: 7, yellowMax: 5,
    sqlLogic: `SELECT COUNT(DISTINCT product_line) AS value\nFROM production.sales.sales_orders`,
    execSql: `SELECT COUNT(DISTINCT product_line) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, COUNT(DISTINCT product_line) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'all-time',
    dimensions: ['territory', 'country'],
    materialization: 'live', schedule: null,
    owner: 'Product Team', status: 'published',
    createdAt: '2026-01-15T10:00:00Z', createdBy: 'mike.johnson',
    changeReason: 'Initial KPI definition',
    tags: ['product', 'catalog'],
  },
  {
    kpiId: 'territory_revenue_share', version: 1,
    displayName: 'Top Territory Revenue %',
    description: 'Revenue share of the highest-revenue territory. Tracks geographic concentration risk \u2014 lower is more diversified.',
    unit: 'percent', chartType: 'gauge', direction: 'lower-is-better',
    greenMax: 40, yellowMax: 55,
    sqlLogic: `SELECT MAX(terr_rev) * 100.0 / NULLIF(SUM(terr_rev), 0) AS value\nFROM (\n  SELECT territory, SUM(sales) AS terr_rev\n  FROM production.sales.sales_orders\n  GROUP BY territory\n) sub`,
    execSql: `SELECT MAX(terr_rev) * 100.0 / NULLIF(SUM(terr_rev), 0) AS value FROM (SELECT territory, SUM(sales) AS terr_rev FROM sales_orders GROUP BY territory) sub`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, MAX(terr_rev) * 100.0 / NULLIF(SUM(terr_rev), 0) AS value FROM (SELECT year_id, qtr_id, territory, SUM(sales) AS terr_rev FROM sales_orders GROUP BY year_id, qtr_id, territory) sub GROUP BY year_id, qtr_id, period ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'all-time',
    dimensions: ['product_line'],
    materialization: 'live', schedule: null,
    owner: 'Strategy Team', status: 'published',
    createdAt: '2026-02-15T13:00:00Z', createdBy: 'james.wright',
    changeReason: 'Initial KPI definition',
    tags: ['strategy', 'geographic-risk'],
  },
  {
    kpiId: 'large_deal_rate', version: 1,
    displayName: 'Large Deal Rate',
    description: 'Percentage of orders classified as Large deal size. Tracks enterprise deal pipeline health.',
    unit: 'percent', chartType: 'gauge', direction: 'higher-is-better',
    greenMax: 15, yellowMax: 8,
    sqlLogic: `SELECT COUNT(CASE WHEN deal_size = 'Large' THEN 1 END)\n       * 100.0 / NULLIF(COUNT(DISTINCT order_number), 0) AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
    execSql: `SELECT COUNT(CASE WHEN deal_size = 'Large' THEN 1 END) * 100.0 / NULLIF(COUNT(DISTINCT order_number), 0) AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, COUNT(CASE WHEN deal_size = 'Large' THEN 1 END) * 100.0 / NULLIF(COUNT(DISTINCT order_number), 0) AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'quarterly',
    dimensions: ['product_line', 'territory', 'country'],
    materialization: 'live', schedule: null,
    owner: 'Sarah Chen', status: 'validated',
    createdAt: '2026-04-08T09:30:00Z', createdBy: 'sarah.chen',
    changeReason: 'New KPI requested by enterprise sales team',
    tags: ['enterprise', 'deal-quality'],
  },
  {
    kpiId: 'discount_depth', version: 1,
    displayName: 'Discount Depth',
    description: 'Average percentage discount from MSRP. Measures pricing discipline \u2014 higher discount means more margin erosion.',
    unit: 'percent', chartType: 'gauge', direction: 'lower-is-better',
    greenMax: 10, yellowMax: 20,
    sqlLogic: `SELECT AVG((msrp - price_each) / NULLIF(msrp, 0)) * 100 AS value\nFROM production.sales.sales_orders\nWHERE year_id = :year AND qtr_id = :quarter`,
    execSql: `SELECT AVG((msrp - price_each) / NULLIF(msrp, 0)) * 100 AS value FROM sales_orders`,
    trendSql: `SELECT year_id * 10 + qtr_id AS period, AVG((msrp - price_each) / NULLIF(msrp, 0)) * 100 AS value FROM sales_orders GROUP BY year_id, qtr_id ORDER BY period`,
    sourceTables: ['production.sales.sales_orders'], grain: 'quarterly',
    dimensions: ['product_line', 'territory', 'deal_size'],
    materialization: 'live', schedule: null,
    owner: 'James Wright', status: 'draft',
    createdAt: '2026-04-10T08:00:00Z', createdBy: 'james.wright',
    changeReason: 'Investigating margin erosion \u2014 draft for pricing team review',
    tags: ['pricing', 'margin', 'discount'],
  },
  {
    kpiId: 'single_product_orders', version: 1,
    displayName: 'Single-Item Order Rate',
    description: 'Percentage of orders with only one line item. Was used to track cross-sell effectiveness but superseded by basket_size KPI.',
    unit: 'percent', chartType: 'bar', direction: 'lower-is-better',
    greenMax: 15, yellowMax: 30,
    sqlLogic: `WITH order_sizes AS (\n  SELECT order_number, COUNT(*) AS line_count\n  FROM production.sales.sales_orders\n  GROUP BY order_number\n)\nSELECT COUNT(CASE WHEN line_count = 1 THEN 1 END)\n       * 100.0 / NULLIF(COUNT(*), 0) AS value\nFROM order_sizes`,
    execSql: `WITH order_sizes AS (SELECT order_number, COUNT(*) AS line_count FROM sales_orders GROUP BY order_number) SELECT COUNT(CASE WHEN line_count = 1 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value FROM order_sizes`,
    trendSql: '',
    sourceTables: ['production.sales.sales_orders'], grain: 'all-time',
    dimensions: ['product_line', 'territory'],
    materialization: 'scheduled', schedule: '0 6 * * *',
    owner: 'CX Team', status: 'deprecated',
    createdAt: '2026-03-01T10:00:00Z', createdBy: 'amy.torres',
    changeReason: 'Superseded by more accurate basket_size KPI',
    tags: ['cross-sell', 'retention'],
  },
];

const SEED_VERSIONS: SeedVersion[] = [
  { kpiId: 'total_revenue', version: 1, createdAt: '2026-01-15T10:00:00Z', createdBy: 'sarah.chen', changeReason: 'Initial KPI definition', status: 'deprecated' },
  { kpiId: 'total_revenue', version: 2, createdAt: '2026-02-01T09:00:00Z', createdBy: 'sarah.chen', changeReason: 'Added territory dimension', status: 'deprecated' },
  { kpiId: 'total_revenue', version: 3, createdAt: '2026-03-10T14:00:00Z', createdBy: 'sarah.chen', changeReason: 'Added quarterly grain parameter for trend analysis', status: 'published' },
  { kpiId: 'fulfillment_rate', version: 1, createdAt: '2026-01-15T10:00:00Z', createdBy: 'lisa.park', changeReason: 'Initial KPI \u2014 order-level calculation', status: 'deprecated' },
  { kpiId: 'fulfillment_rate', version: 2, createdAt: '2026-03-01T11:00:00Z', createdBy: 'lisa.park', changeReason: 'Switched from order-level to line-item-level calculation', status: 'published' },
  { kpiId: 'avg_order_value', version: 1, createdAt: '2026-01-15T10:00:00Z', createdBy: 'sarah.chen', changeReason: 'Initial KPI \u2014 per-order average', status: 'deprecated' },
  { kpiId: 'avg_order_value', version: 2, createdAt: '2026-02-01T14:30:00Z', createdBy: 'sarah.chen', changeReason: 'Refined to use per-line-item average', status: 'published' },
  { kpiId: 'avg_deal_size_value', version: 1, createdAt: '2026-01-20T08:00:00Z', createdBy: 'sarah.chen', changeReason: 'Initial KPI \u2014 simple line-item average', status: 'deprecated' },
  { kpiId: 'avg_deal_size_value', version: 2, createdAt: '2026-02-20T08:00:00Z', createdBy: 'sarah.chen', changeReason: 'Changed from line-item avg to order-total avg for accuracy', status: 'published' },
];

const COLUMN_COMMENTS: [string, string, string][] = [
  ['sales_orders', 'id', 'Auto-incrementing primary key'],
  ['sales_orders', 'order_number', 'Order identifier (multiple line items per order)'],
  ['sales_orders', 'quantity_ordered', 'Number of units in this line item'],
  ['sales_orders', 'price_each', 'Unit price for this line item'],
  ['sales_orders', 'order_line_number', 'Line item number within the order'],
  ['sales_orders', 'sales', 'Total sales amount for this line item'],
  ['sales_orders', 'order_date', 'Date the order was placed'],
  ['sales_orders', 'status', 'Order status: Shipped, Cancelled, Resolved, On Hold, In Process, Disputed'],
  ['sales_orders', 'qtr_id', 'Quarter of the year (1-4)'],
  ['sales_orders', 'month_id', 'Month of the year (1-12)'],
  ['sales_orders', 'year_id', 'Year of the order (2003-2005)'],
  ['sales_orders', 'product_line', 'Product category: Classic Cars, Motorcycles, Planes, Ships, Trains, Trucks and Buses, Vintage Cars'],
  ['sales_orders', 'msrp', 'Manufacturer suggested retail price'],
  ['sales_orders', 'product_code', 'Unique product SKU'],
  ['sales_orders', 'customer_name', 'Customer company name'],
  ['sales_orders', 'city', 'Customer city'],
  ['sales_orders', 'country', 'Customer country (19 countries)'],
  ['sales_orders', 'territory', 'Sales territory: NA, EMEA, APAC, Japan'],
  ['sales_orders', 'deal_size', 'Deal tier: Small, Medium, Large'],
];

export async function runMigrations(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_definitions (
      kpi_id VARCHAR(100) PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1,
      display_name VARCHAR(200) NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      unit VARCHAR(50) NOT NULL,
      chart_type VARCHAR(50) NOT NULL DEFAULT 'number',
      direction VARCHAR(20) NOT NULL,
      green_max NUMERIC NOT NULL,
      yellow_max NUMERIC NOT NULL,
      sql_logic TEXT NOT NULL,
      exec_sql TEXT,
      trend_sql TEXT,
      source_tables TEXT[] NOT NULL DEFAULT ARRAY['production.sales.sales_orders'],
      grain VARCHAR(50) NOT NULL DEFAULT 'all-time',
      dimensions TEXT[] NOT NULL DEFAULT '{}',
      materialization VARCHAR(20) NOT NULL DEFAULT 'live',
      schedule VARCHAR(50),
      owner VARCHAR(200) NOT NULL DEFAULT 'System',
      status VARCHAR(20) NOT NULL DEFAULT 'published',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by VARCHAR(200) NOT NULL DEFAULT 'system',
      change_reason TEXT DEFAULT '',
      tags TEXT[] NOT NULL DEFAULT '{}'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS kpi_versions (
      id SERIAL PRIMARY KEY,
      kpi_id VARCHAR(100) NOT NULL,
      version INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by VARCHAR(200) NOT NULL,
      change_reason TEXT DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'published',
      UNIQUE(kpi_id, version)
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS cnt FROM kpi_definitions');
  if ((rows[0]?.cnt ?? 0) === 0) {
    for (const d of SEED_KPIS) {
      await pool.query(
        `INSERT INTO kpi_definitions
         (kpi_id, version, display_name, description, unit, chart_type, direction,
          green_max, yellow_max, sql_logic, exec_sql, trend_sql, source_tables,
          grain, dimensions, materialization, schedule, owner, status,
          created_at, created_by, change_reason, tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [d.kpiId, d.version, d.displayName, d.description, d.unit, d.chartType, d.direction,
         d.greenMax, d.yellowMax, d.sqlLogic, d.execSql, d.trendSql || null, d.sourceTables,
         d.grain, d.dimensions, d.materialization, d.schedule, d.owner, d.status,
         d.createdAt, d.createdBy, d.changeReason, d.tags]
      );
    }

    for (const v of SEED_VERSIONS) {
      await pool.query(
        `INSERT INTO kpi_versions (kpi_id, version, created_at, created_by, change_reason, status)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [v.kpiId, v.version, v.createdAt, v.createdBy, v.changeReason, v.status]
      );
    }

    // Add single-version entries for KPIs without explicit version history
    const kpisWithHistory = new Set(SEED_VERSIONS.map(v => v.kpiId));
    for (const d of SEED_KPIS) {
      if (!kpisWithHistory.has(d.kpiId)) {
        await pool.query(
          `INSERT INTO kpi_versions (kpi_id, version, created_at, created_by, change_reason, status)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [d.kpiId, d.version, d.createdAt, d.createdBy, d.changeReason, d.status]
        );
      }
    }

    console.log(`Seeded ${SEED_KPIS.length} KPI definitions and version history.`);
  }

  for (const [table, column, comment] of COLUMN_COMMENTS) {
    try {
      await pool.query(`COMMENT ON COLUMN "${table}"."${column}" IS $1`, [comment]);
    } catch {
      // Table or column may not exist yet
    }
  }

  console.log('KPI migrations complete.');
}
