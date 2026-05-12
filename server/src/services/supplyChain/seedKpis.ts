import type { Pool } from 'pg';

// Each KPI carries the metadata that mature data-platform tools track:
// owner, ABC of tier-1/tier-2, version history, source tables, materialization
// schedule, documented SQL (with parameters), and runnable SQL.

export interface SeedKpi {
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
  execSql: string;
  trendSql: string;
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

export interface SeedVersion {
  kpiId: string;
  version: number;
  createdAt: string;
  createdBy: string;
  changeReason: string;
  status: string;
}

// === KPI library ===

const FULFILLMENT_KPIS: SeedKpi[] = [
  {
    kpiId: 'otif_rate', version: 2,
    displayName: 'OTIF Rate',
    description: 'On-Time In-Full rate. % of delivered shipments arriving by promised date AND with no backordered lines. The headline customer-experience metric.',
    unit: 'percent', chartType: 'gauge', direction: 'higher-is-better',
    greenMax: 95, yellowMax: 85,
    sqlLogic: `SELECT
  COUNT(CASE WHEN s.delivered_date <= s.promised_date
              AND NOT EXISTS (SELECT 1 FROM production.supply_chain.shipment_lines sl
                              WHERE sl.shipment_id = s.shipment_id AND sl.qty_backordered > 0)
        THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM production.supply_chain.shipments s
WHERE s.status = 'Delivered'
  AND s.order_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT
  COUNT(CASE WHEN s.delivered_date <= s.promised_date
              AND NOT EXISTS (SELECT 1 FROM shipment_lines sl
                              WHERE sl.shipment_id = s.shipment_id AND sl.qty_backordered > 0)
        THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM shipments s
WHERE s.status = 'Delivered'`,
    trendSql: `SELECT
  TO_CHAR(DATE_TRUNC('month', s.order_date), 'YYYY-MM') AS period,
  COUNT(CASE WHEN s.delivered_date <= s.promised_date
              AND NOT EXISTS (SELECT 1 FROM shipment_lines sl
                              WHERE sl.shipment_id = s.shipment_id AND sl.qty_backordered > 0)
        THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM shipments s
WHERE s.status = 'Delivered'
GROUP BY DATE_TRUNC('month', s.order_date)
ORDER BY DATE_TRUNC('month', s.order_date)`,
    sourceTables: ['production.supply_chain.shipments', 'production.supply_chain.shipment_lines'],
    grain: 'monthly', dimensions: ['destination_region', 'warehouse_id', 'carrier_id', 'customer_segment'],
    materialization: 'scheduled', schedule: '0 */1 * * *',
    owner: 'Operations Team', status: 'published',
    createdAt: '2026-01-20T10:00:00Z', createdBy: 'lisa.park',
    changeReason: 'Switched to line-level backorder check from shipment-level flag',
    tags: ['fulfillment', 'tier-1', 'customer-facing'],
  },
  {
    kpiId: 'perfect_order_rate', version: 1,
    displayName: 'Perfect Order Rate',
    description: 'Strictest fulfillment metric: % of shipments that are on-time, in-full, undamaged (no exceptions logged), and not subsequently returned.',
    unit: 'percent', chartType: 'gauge', direction: 'higher-is-better',
    greenMax: 90, yellowMax: 80,
    sqlLogic: `WITH evaluated AS (
  SELECT s.shipment_id,
    CASE WHEN s.delivered_date <= s.promised_date
              AND NOT EXISTS (SELECT 1 FROM production.supply_chain.shipment_lines sl WHERE sl.shipment_id = s.shipment_id AND sl.qty_backordered > 0)
              AND NOT EXISTS (SELECT 1 FROM production.supply_chain.exceptions e WHERE e.shipment_id = s.shipment_id)
              AND NOT EXISTS (SELECT 1 FROM production.supply_chain.returns r WHERE r.shipment_id = s.shipment_id)
         THEN 1 ELSE 0 END AS is_perfect
  FROM production.supply_chain.shipments s
  WHERE s.status = 'Delivered' AND s.order_date BETWEEN :start_date AND :end_date
)
SELECT AVG(is_perfect::numeric) * 100 AS value FROM evaluated`,
    execSql: `WITH evaluated AS (
  SELECT s.shipment_id,
    CASE WHEN s.delivered_date <= s.promised_date
              AND NOT EXISTS (SELECT 1 FROM shipment_lines sl WHERE sl.shipment_id = s.shipment_id AND sl.qty_backordered > 0)
              AND NOT EXISTS (SELECT 1 FROM exceptions e WHERE e.shipment_id = s.shipment_id)
              AND NOT EXISTS (SELECT 1 FROM returns r WHERE r.shipment_id = s.shipment_id)
         THEN 1 ELSE 0 END AS is_perfect
  FROM shipments s
  WHERE s.status = 'Delivered'
)
SELECT AVG(is_perfect::numeric) * 100 AS value FROM evaluated`,
    trendSql: `WITH evaluated AS (
  SELECT DATE_TRUNC('month', s.order_date) AS month,
    CASE WHEN s.delivered_date <= s.promised_date
              AND NOT EXISTS (SELECT 1 FROM shipment_lines sl WHERE sl.shipment_id = s.shipment_id AND sl.qty_backordered > 0)
              AND NOT EXISTS (SELECT 1 FROM exceptions e WHERE e.shipment_id = s.shipment_id)
              AND NOT EXISTS (SELECT 1 FROM returns r WHERE r.shipment_id = s.shipment_id)
         THEN 1 ELSE 0 END AS is_perfect
  FROM shipments s
  WHERE s.status = 'Delivered'
)
SELECT TO_CHAR(month, 'YYYY-MM') AS period, AVG(is_perfect::numeric) * 100 AS value
FROM evaluated GROUP BY month ORDER BY month`,
    sourceTables: ['production.supply_chain.shipments', 'production.supply_chain.shipment_lines', 'production.supply_chain.exceptions', 'production.supply_chain.returns'],
    grain: 'monthly', dimensions: ['destination_region', 'warehouse_id', 'customer_segment'],
    materialization: 'scheduled', schedule: '0 2 * * *',
    owner: 'Operations Team', status: 'published',
    createdAt: '2026-02-12T11:00:00Z', createdBy: 'lisa.park',
    changeReason: 'Initial KPI — composite quality metric',
    tags: ['fulfillment', 'tier-1', 'composite'],
  },
  {
    kpiId: 'order_cycle_time', version: 1,
    displayName: 'Order Cycle Time',
    description: 'Average days from order placement to customer delivery, across delivered shipments.',
    unit: 'days', chartType: 'line', direction: 'lower-is-better',
    greenMax: 7, yellowMax: 10,
    sqlLogic: `SELECT AVG(EXTRACT(EPOCH FROM (delivered_date::timestamp - order_date::timestamp)) / 86400.0) AS value
FROM production.supply_chain.shipments
WHERE status = 'Delivered' AND order_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT AVG(EXTRACT(EPOCH FROM (delivered_date::timestamp - order_date::timestamp)) / 86400.0) AS value
FROM shipments WHERE status = 'Delivered'`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', order_date), 'YYYY-MM') AS period,
  AVG(EXTRACT(EPOCH FROM (delivered_date::timestamp - order_date::timestamp)) / 86400.0) AS value
FROM shipments WHERE status = 'Delivered'
GROUP BY DATE_TRUNC('month', order_date) ORDER BY DATE_TRUNC('month', order_date)`,
    sourceTables: ['production.supply_chain.shipments'],
    grain: 'monthly', dimensions: ['destination_region', 'warehouse_id', 'carrier_id'],
    materialization: 'live', schedule: null,
    owner: 'Operations Team', status: 'published',
    createdAt: '2026-01-20T10:00:00Z', createdBy: 'lisa.park',
    changeReason: 'Initial KPI definition',
    tags: ['fulfillment', 'cycle-time'],
  },
  {
    kpiId: 'line_fill_rate', version: 1,
    displayName: 'Line Fill Rate',
    description: '% of order lines shipped with zero backorder (qty_shipped = qty_ordered). Independent of timing.',
    unit: 'percent', chartType: 'gauge', direction: 'higher-is-better',
    greenMax: 96, yellowMax: 90,
    sqlLogic: `SELECT COUNT(CASE WHEN sl.qty_backordered = 0 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM production.supply_chain.shipment_lines sl
JOIN production.supply_chain.shipments s ON s.shipment_id = sl.shipment_id
WHERE s.status IN ('Shipped', 'Delivered') AND s.order_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT COUNT(CASE WHEN sl.qty_backordered = 0 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM shipment_lines sl
JOIN shipments s ON s.shipment_id = sl.shipment_id
WHERE s.status IN ('Shipped', 'Delivered')`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', s.order_date), 'YYYY-MM') AS period,
  COUNT(CASE WHEN sl.qty_backordered = 0 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM shipment_lines sl
JOIN shipments s ON s.shipment_id = sl.shipment_id
WHERE s.status IN ('Shipped', 'Delivered')
GROUP BY DATE_TRUNC('month', s.order_date) ORDER BY DATE_TRUNC('month', s.order_date)`,
    sourceTables: ['production.supply_chain.shipment_lines', 'production.supply_chain.shipments'],
    grain: 'monthly', dimensions: ['destination_region', 'warehouse_id'],
    materialization: 'scheduled', schedule: '0 4 * * *',
    owner: 'Operations Team', status: 'published',
    createdAt: '2026-01-20T10:00:00Z', createdBy: 'lisa.park',
    changeReason: 'Initial KPI definition',
    tags: ['fulfillment', 'inventory-pressure'],
  },
  {
    kpiId: 'backorder_rate', version: 1,
    displayName: 'Backorder Rate',
    description: '% of shipped/delivered order lines with any backordered quantity. Inverse view of line fill rate.',
    unit: 'percent', chartType: 'bar', direction: 'lower-is-better',
    greenMax: 4, yellowMax: 10,
    sqlLogic: `SELECT COUNT(CASE WHEN sl.qty_backordered > 0 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM production.supply_chain.shipment_lines sl
JOIN production.supply_chain.shipments s ON s.shipment_id = sl.shipment_id
WHERE s.status IN ('Shipped', 'Delivered') AND s.order_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT COUNT(CASE WHEN sl.qty_backordered > 0 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM shipment_lines sl
JOIN shipments s ON s.shipment_id = sl.shipment_id
WHERE s.status IN ('Shipped', 'Delivered')`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', s.order_date), 'YYYY-MM') AS period,
  COUNT(CASE WHEN sl.qty_backordered > 0 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM shipment_lines sl
JOIN shipments s ON s.shipment_id = sl.shipment_id
WHERE s.status IN ('Shipped', 'Delivered')
GROUP BY DATE_TRUNC('month', s.order_date) ORDER BY DATE_TRUNC('month', s.order_date)`,
    sourceTables: ['production.supply_chain.shipment_lines', 'production.supply_chain.shipments'],
    grain: 'monthly', dimensions: ['destination_region', 'warehouse_id'],
    materialization: 'scheduled', schedule: '0 4 * * *',
    owner: 'Operations Team', status: 'published',
    createdAt: '2026-02-01T09:00:00Z', createdBy: 'lisa.park',
    changeReason: 'Initial KPI — companion to line_fill_rate',
    tags: ['fulfillment', 'inventory-pressure'],
  },
  {
    kpiId: 'same_day_ship_rate', version: 1,
    displayName: 'Same-Day Ship Rate',
    description: '% of orders shipped same calendar day as placed. Strong proxy for warehouse responsiveness.',
    unit: 'percent', chartType: 'gauge', direction: 'higher-is-better',
    greenMax: 60, yellowMax: 40,
    sqlLogic: `SELECT COUNT(CASE WHEN shipped_date = order_date THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM production.supply_chain.shipments
WHERE shipped_date IS NOT NULL AND order_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT COUNT(CASE WHEN shipped_date = order_date THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM shipments WHERE shipped_date IS NOT NULL`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', order_date), 'YYYY-MM') AS period,
  COUNT(CASE WHEN shipped_date = order_date THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM shipments WHERE shipped_date IS NOT NULL
GROUP BY DATE_TRUNC('month', order_date) ORDER BY DATE_TRUNC('month', order_date)`,
    sourceTables: ['production.supply_chain.shipments'],
    grain: 'monthly', dimensions: ['warehouse_id'],
    materialization: 'live', schedule: null,
    owner: 'Warehouse Operations', status: 'published',
    createdAt: '2026-02-15T09:00:00Z', createdBy: 'rachel.kim',
    changeReason: 'Initial KPI definition',
    tags: ['fulfillment', 'warehouse-ops'],
  },
];

const INVENTORY_KPIS: SeedKpi[] = [
  {
    kpiId: 'inventory_turns', version: 1,
    displayName: 'Inventory Turns',
    description: 'Annualized inventory turnover: (annualized COGS proxy) / avg on-hand inventory value. Computed using shipped qty × unit_cost as COGS proxy.',
    unit: 'turns', chartType: 'line', direction: 'higher-is-better',
    greenMax: 8, yellowMax: 5,
    sqlLogic: `WITH cogs AS (
  SELECT SUM(sl.qty_shipped * sk.unit_cost) AS cogs_proxy
  FROM production.supply_chain.shipment_lines sl
  JOIN production.supply_chain.shipments s ON s.shipment_id = sl.shipment_id
  JOIN production.supply_chain.skus sk ON sk.sku_id = sl.sku_id
  WHERE s.status IN ('Shipped', 'Delivered')
    AND s.order_date BETWEEN :start_date AND :end_date
),
inv AS (
  SELECT AVG(daily_value) AS avg_value
  FROM (
    SELECT inv.snapshot_date, SUM(inv.on_hand_qty * sk.unit_cost) AS daily_value
    FROM production.supply_chain.inventory_snapshots inv
    JOIN production.supply_chain.skus sk ON sk.sku_id = inv.sku_id
    WHERE inv.snapshot_date BETWEEN :start_date AND :end_date
    GROUP BY inv.snapshot_date
  ) daily
)
SELECT cogs.cogs_proxy / NULLIF(inv.avg_value, 0) * (365.0 / GREATEST((SELECT MAX(snapshot_date) - MIN(snapshot_date) FROM production.supply_chain.inventory_snapshots), 1)) AS value
FROM cogs, inv`,
    execSql: `WITH cogs AS (
  SELECT SUM(sl.qty_shipped * sk.unit_cost) AS cogs_proxy
  FROM shipment_lines sl
  JOIN shipments s ON s.shipment_id = sl.shipment_id
  JOIN skus sk ON sk.sku_id = sl.sku_id
  WHERE s.status IN ('Shipped', 'Delivered')
),
inv AS (
  SELECT AVG(daily_value) AS avg_value
  FROM (
    SELECT inv.snapshot_date, SUM(inv.on_hand_qty * sk.unit_cost) AS daily_value
    FROM inventory_snapshots inv
    JOIN skus sk ON sk.sku_id = inv.sku_id
    GROUP BY inv.snapshot_date
  ) daily
)
SELECT (cogs.cogs_proxy / NULLIF(inv.avg_value, 0)) AS value FROM cogs, inv`,
    trendSql: `WITH monthly_cogs AS (
  SELECT DATE_TRUNC('month', s.order_date) AS month,
         SUM(sl.qty_shipped * sk.unit_cost) AS cogs_proxy
  FROM shipment_lines sl
  JOIN shipments s ON s.shipment_id = sl.shipment_id
  JOIN skus sk ON sk.sku_id = sl.sku_id
  WHERE s.status IN ('Shipped', 'Delivered')
  GROUP BY DATE_TRUNC('month', s.order_date)
),
monthly_inv AS (
  SELECT DATE_TRUNC('month', inv.snapshot_date) AS month,
         AVG(inv.on_hand_qty * sk.unit_cost) AS avg_value
  FROM inventory_snapshots inv
  JOIN skus sk ON sk.sku_id = inv.sku_id
  GROUP BY DATE_TRUNC('month', inv.snapshot_date)
)
SELECT TO_CHAR(c.month, 'YYYY-MM') AS period,
       (c.cogs_proxy / NULLIF(i.avg_value, 0)) * 12 AS value
FROM monthly_cogs c
JOIN monthly_inv i ON i.month = c.month
ORDER BY c.month`,
    sourceTables: ['production.supply_chain.shipment_lines', 'production.supply_chain.shipments', 'production.supply_chain.skus', 'production.supply_chain.inventory_snapshots'],
    grain: 'monthly', dimensions: ['warehouse_id', 'category'],
    materialization: 'scheduled', schedule: '0 6 * * *',
    owner: 'Inventory Team', status: 'published',
    createdAt: '2026-01-22T08:00:00Z', createdBy: 'david.chen',
    changeReason: 'Initial KPI definition using shipped-cost COGS proxy',
    tags: ['inventory', 'tier-1', 'finance'],
  },
  {
    kpiId: 'days_of_supply', version: 1,
    displayName: 'Avg Days of Supply',
    description: 'Average forward-looking days of supply across active SKU-warehouse positions. Computed at most recent snapshot date.',
    unit: 'days', chartType: 'bar', direction: 'lower-is-better',
    greenMax: 45, yellowMax: 75,
    sqlLogic: `SELECT AVG(days_of_supply) AS value
FROM production.supply_chain.inventory_snapshots
WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM production.supply_chain.inventory_snapshots)
  AND on_hand_qty > 0`,
    execSql: `SELECT AVG(days_of_supply) AS value
FROM inventory_snapshots
WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM inventory_snapshots) AND on_hand_qty > 0`,
    trendSql: `SELECT TO_CHAR(snapshot_date, 'YYYY-MM') AS period, AVG(days_of_supply) AS value
FROM inventory_snapshots WHERE on_hand_qty > 0
GROUP BY TO_CHAR(snapshot_date, 'YYYY-MM') ORDER BY TO_CHAR(snapshot_date, 'YYYY-MM')`,
    sourceTables: ['production.supply_chain.inventory_snapshots'],
    grain: 'daily', dimensions: ['warehouse_id', 'abc_class', 'category'],
    materialization: 'scheduled', schedule: '0 5 * * *',
    owner: 'Inventory Team', status: 'published',
    createdAt: '2026-01-22T08:00:00Z', createdBy: 'david.chen',
    changeReason: 'Initial KPI definition',
    tags: ['inventory', 'working-capital'],
  },
  {
    kpiId: 'stockout_rate', version: 2,
    displayName: 'Stockout Rate',
    description: '% of active SKU-warehouse positions with zero on-hand inventory at most recent snapshot. Excludes discontinued SKUs.',
    unit: 'percent', chartType: 'bar', direction: 'lower-is-better',
    greenMax: 2, yellowMax: 5,
    sqlLogic: `SELECT COUNT(CASE WHEN inv.on_hand_qty = 0 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM production.supply_chain.inventory_snapshots inv
JOIN production.supply_chain.skus sk ON sk.sku_id = inv.sku_id
WHERE inv.snapshot_date = (SELECT MAX(snapshot_date) FROM production.supply_chain.inventory_snapshots)
  AND sk.status <> 'discontinued'`,
    execSql: `SELECT COUNT(CASE WHEN inv.on_hand_qty = 0 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM inventory_snapshots inv
JOIN skus sk ON sk.sku_id = inv.sku_id
WHERE inv.snapshot_date = (SELECT MAX(snapshot_date) FROM inventory_snapshots)
  AND sk.status <> 'discontinued'`,
    trendSql: `SELECT TO_CHAR(inv.snapshot_date, 'YYYY-MM-DD') AS period,
  COUNT(CASE WHEN inv.on_hand_qty = 0 THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM inventory_snapshots inv
JOIN skus sk ON sk.sku_id = inv.sku_id
WHERE sk.status <> 'discontinued'
  AND inv.snapshot_date IN (
    SELECT MAX(snapshot_date) FROM inventory_snapshots
    GROUP BY DATE_TRUNC('week', snapshot_date)
  )
GROUP BY inv.snapshot_date ORDER BY inv.snapshot_date`,
    sourceTables: ['production.supply_chain.inventory_snapshots', 'production.supply_chain.skus'],
    grain: 'daily', dimensions: ['warehouse_id', 'category', 'abc_class'],
    materialization: 'scheduled', schedule: '0 5 * * *',
    owner: 'Inventory Team', status: 'published',
    createdAt: '2026-02-05T10:00:00Z', createdBy: 'david.chen',
    changeReason: 'Excluded discontinued SKUs from denominator',
    tags: ['inventory', 'tier-1', 'risk'],
  },
  {
    kpiId: 'excess_inventory_value', version: 1,
    displayName: 'Excess Inventory Value',
    description: 'Total $ value of inventory in SKU-warehouse positions with > 90 days of supply at most recent snapshot. Indicates working capital tied up in slow-moving stock.',
    unit: 'dollars', chartType: 'area', direction: 'lower-is-better',
    greenMax: 500000, yellowMax: 1500000,
    sqlLogic: `SELECT SUM(inv.on_hand_qty * sk.unit_cost) AS value
FROM production.supply_chain.inventory_snapshots inv
JOIN production.supply_chain.skus sk ON sk.sku_id = inv.sku_id
WHERE inv.snapshot_date = (SELECT MAX(snapshot_date) FROM production.supply_chain.inventory_snapshots)
  AND inv.days_of_supply > 90`,
    execSql: `SELECT SUM(inv.on_hand_qty * sk.unit_cost) AS value
FROM inventory_snapshots inv
JOIN skus sk ON sk.sku_id = inv.sku_id
WHERE inv.snapshot_date = (SELECT MAX(snapshot_date) FROM inventory_snapshots)
  AND inv.days_of_supply > 90`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', inv.snapshot_date), 'YYYY-MM') AS period,
  SUM(inv.on_hand_qty * sk.unit_cost) /
    NULLIF(COUNT(DISTINCT inv.snapshot_date), 0) AS value
FROM inventory_snapshots inv
JOIN skus sk ON sk.sku_id = inv.sku_id
WHERE inv.days_of_supply > 90
GROUP BY DATE_TRUNC('month', inv.snapshot_date) ORDER BY DATE_TRUNC('month', inv.snapshot_date)`,
    sourceTables: ['production.supply_chain.inventory_snapshots', 'production.supply_chain.skus'],
    grain: 'daily', dimensions: ['warehouse_id', 'category'],
    materialization: 'scheduled', schedule: '0 5 * * *',
    owner: 'Inventory Team', status: 'published',
    createdAt: '2026-02-10T10:00:00Z', createdBy: 'david.chen',
    changeReason: 'Initial KPI definition',
    tags: ['inventory', 'working-capital', 'finance'],
  },
  {
    kpiId: 'critical_sku_stockout_rate', version: 1,
    displayName: 'Critical SKU Stockout Rate',
    description: '% of critical-path SKUs (production-stopping parts) at zero on-hand inventory at any warehouse. Most urgent inventory signal.',
    unit: 'percent', chartType: 'bar', direction: 'lower-is-better',
    greenMax: 1, yellowMax: 3,
    sqlLogic: `WITH critical_skus AS (
  SELECT sku_id FROM production.supply_chain.skus WHERE is_critical = TRUE AND status = 'active'
),
stockout AS (
  SELECT DISTINCT inv.sku_id
  FROM production.supply_chain.inventory_snapshots inv
  WHERE inv.snapshot_date = (SELECT MAX(snapshot_date) FROM production.supply_chain.inventory_snapshots)
    AND inv.on_hand_qty = 0
    AND inv.sku_id IN (SELECT sku_id FROM critical_skus)
)
SELECT COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM critical_skus), 0) AS value FROM stockout`,
    execSql: `WITH critical_skus AS (
  SELECT sku_id FROM skus WHERE is_critical = TRUE AND status = 'active'
),
stockout AS (
  SELECT DISTINCT inv.sku_id
  FROM inventory_snapshots inv
  WHERE inv.snapshot_date = (SELECT MAX(snapshot_date) FROM inventory_snapshots)
    AND inv.on_hand_qty = 0
    AND inv.sku_id IN (SELECT sku_id FROM critical_skus)
)
SELECT COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM critical_skus), 0) AS value FROM stockout`,
    trendSql: `WITH critical_skus AS (
  SELECT sku_id FROM skus WHERE is_critical = TRUE AND status = 'active'
)
SELECT TO_CHAR(inv.snapshot_date, 'YYYY-MM-DD') AS period,
  COUNT(DISTINCT CASE WHEN inv.on_hand_qty = 0 THEN inv.sku_id END) * 100.0
    / NULLIF((SELECT COUNT(*) FROM critical_skus), 0) AS value
FROM inventory_snapshots inv
WHERE inv.sku_id IN (SELECT sku_id FROM critical_skus)
  AND inv.snapshot_date IN (
    SELECT MAX(snapshot_date) FROM inventory_snapshots GROUP BY DATE_TRUNC('week', snapshot_date)
  )
GROUP BY inv.snapshot_date ORDER BY inv.snapshot_date`,
    sourceTables: ['production.supply_chain.inventory_snapshots', 'production.supply_chain.skus'],
    grain: 'daily', dimensions: ['warehouse_id'],
    materialization: 'live', schedule: null,
    owner: 'Inventory Team', status: 'published',
    createdAt: '2026-03-01T09:00:00Z', createdBy: 'david.chen',
    changeReason: 'Initial KPI — most urgent risk signal',
    tags: ['inventory', 'tier-1', 'risk', 'critical-path'],
  },
];

const PROCUREMENT_KPIS: SeedKpi[] = [
  {
    kpiId: 'supplier_otd', version: 1,
    displayName: 'Supplier OTD Rate',
    description: 'Supplier On-Time Delivery: % of received PO lines where received_date <= promised_date.',
    unit: 'percent', chartType: 'gauge', direction: 'higher-is-better',
    greenMax: 92, yellowMax: 85,
    sqlLogic: `SELECT COUNT(CASE WHEN received_date <= promised_date THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM production.supply_chain.purchase_orders
WHERE status IN ('Received', 'Closed') AND received_date IS NOT NULL
  AND ordered_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT COUNT(CASE WHEN received_date <= promised_date THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM purchase_orders
WHERE status IN ('Received', 'Closed') AND received_date IS NOT NULL`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', ordered_date), 'YYYY-MM') AS period,
  COUNT(CASE WHEN received_date <= promised_date THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM purchase_orders
WHERE status IN ('Received', 'Closed') AND received_date IS NOT NULL
GROUP BY DATE_TRUNC('month', ordered_date) ORDER BY DATE_TRUNC('month', ordered_date)`,
    sourceTables: ['production.supply_chain.purchase_orders'],
    grain: 'monthly', dimensions: ['supplier_id', 'supplier_tier', 'category'],
    materialization: 'scheduled', schedule: '0 3 * * *',
    owner: 'Procurement Team', status: 'published',
    createdAt: '2026-01-25T11:00:00Z', createdBy: 'sarah.chen',
    changeReason: 'Initial KPI definition',
    tags: ['procurement', 'tier-1', 'supplier'],
  },
  {
    kpiId: 'supplier_otif', version: 1,
    displayName: 'Supplier OTIF Rate',
    description: 'Supplier On-Time In-Full: % of PO lines received on time AND with full ordered quantity.',
    unit: 'percent', chartType: 'gauge', direction: 'higher-is-better',
    greenMax: 88, yellowMax: 80,
    sqlLogic: `SELECT COUNT(CASE WHEN received_date <= promised_date AND qty_received >= qty_ordered THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM production.supply_chain.purchase_orders
WHERE status IN ('Received', 'Closed') AND received_date IS NOT NULL
  AND ordered_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT COUNT(CASE WHEN received_date <= promised_date AND qty_received >= qty_ordered THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM purchase_orders
WHERE status IN ('Received', 'Closed') AND received_date IS NOT NULL`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', ordered_date), 'YYYY-MM') AS period,
  COUNT(CASE WHEN received_date <= promised_date AND qty_received >= qty_ordered THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM purchase_orders
WHERE status IN ('Received', 'Closed') AND received_date IS NOT NULL
GROUP BY DATE_TRUNC('month', ordered_date) ORDER BY DATE_TRUNC('month', ordered_date)`,
    sourceTables: ['production.supply_chain.purchase_orders'],
    grain: 'monthly', dimensions: ['supplier_id', 'supplier_tier'],
    materialization: 'scheduled', schedule: '0 3 * * *',
    owner: 'Procurement Team', status: 'published',
    createdAt: '2026-01-25T11:00:00Z', createdBy: 'sarah.chen',
    changeReason: 'Initial KPI definition',
    tags: ['procurement', 'tier-1', 'supplier'],
  },
  {
    kpiId: 'po_cycle_time', version: 1,
    displayName: 'PO Cycle Time',
    description: 'Average days from PO placement to receipt for closed purchase orders.',
    unit: 'days', chartType: 'line', direction: 'lower-is-better',
    greenMax: 18, yellowMax: 25,
    sqlLogic: `SELECT AVG(received_date - ordered_date) AS value
FROM production.supply_chain.purchase_orders
WHERE status IN ('Received', 'Closed') AND received_date IS NOT NULL
  AND ordered_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT AVG(received_date - ordered_date) AS value
FROM purchase_orders WHERE status IN ('Received', 'Closed') AND received_date IS NOT NULL`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', ordered_date), 'YYYY-MM') AS period,
  AVG(received_date - ordered_date) AS value
FROM purchase_orders WHERE status IN ('Received', 'Closed') AND received_date IS NOT NULL
GROUP BY DATE_TRUNC('month', ordered_date) ORDER BY DATE_TRUNC('month', ordered_date)`,
    sourceTables: ['production.supply_chain.purchase_orders'],
    grain: 'monthly', dimensions: ['supplier_id', 'category'],
    materialization: 'live', schedule: null,
    owner: 'Procurement Team', status: 'published',
    createdAt: '2026-01-25T11:00:00Z', createdBy: 'sarah.chen',
    changeReason: 'Initial KPI definition',
    tags: ['procurement', 'cycle-time'],
  },
  {
    kpiId: 'avg_lead_time', version: 1,
    displayName: 'Avg Supplier Lead Time',
    description: 'Average promised lead time (days) across active POs. Weighted by PO line count.',
    unit: 'days', chartType: 'line', direction: 'lower-is-better',
    greenMax: 21, yellowMax: 30,
    sqlLogic: `SELECT AVG(promised_date - ordered_date) AS value
FROM production.supply_chain.purchase_orders
WHERE status NOT IN ('Cancelled') AND ordered_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT AVG(promised_date - ordered_date) AS value
FROM purchase_orders WHERE status <> 'Cancelled'`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', ordered_date), 'YYYY-MM') AS period,
  AVG(promised_date - ordered_date) AS value
FROM purchase_orders WHERE status <> 'Cancelled'
GROUP BY DATE_TRUNC('month', ordered_date) ORDER BY DATE_TRUNC('month', ordered_date)`,
    sourceTables: ['production.supply_chain.purchase_orders'],
    grain: 'monthly', dimensions: ['supplier_id', 'category'],
    materialization: 'live', schedule: null,
    owner: 'Procurement Team', status: 'published',
    createdAt: '2026-02-01T10:00:00Z', createdBy: 'sarah.chen',
    changeReason: 'Initial KPI definition',
    tags: ['procurement', 'lead-time'],
  },
  {
    kpiId: 'supplier_defect_rate', version: 1,
    displayName: 'Supplier Defect Rate',
    description: '% of POs with a Quality Hold exception logged. Tracks inbound quality issues from suppliers.',
    unit: 'percent', chartType: 'bar', direction: 'lower-is-better',
    greenMax: 2, yellowMax: 5,
    sqlLogic: `WITH all_pos AS (SELECT DISTINCT po_id FROM production.supply_chain.purchase_orders WHERE status NOT IN ('Open', 'Cancelled')),
defects AS (SELECT DISTINCT po_id FROM production.supply_chain.exceptions WHERE reason_code = 'Quality Hold')
SELECT COUNT(DISTINCT d.po_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM all_pos), 0) AS value
FROM all_pos a LEFT JOIN defects d ON d.po_id = a.po_id WHERE d.po_id IS NOT NULL`,
    execSql: `WITH all_pos AS (SELECT DISTINCT po_id FROM purchase_orders WHERE status NOT IN ('Open', 'Cancelled')),
defects AS (SELECT DISTINCT po_id FROM exceptions WHERE reason_code = 'Quality Hold')
SELECT COUNT(d.po_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM all_pos), 0) AS value FROM defects d`,
    trendSql: `WITH monthly AS (
  SELECT DATE_TRUNC('month', po.ordered_date) AS month,
         COUNT(DISTINCT po.po_id) AS pos,
         COUNT(DISTINCT CASE WHEN e.reason_code = 'Quality Hold' THEN po.po_id END) AS defects
  FROM purchase_orders po
  LEFT JOIN exceptions e ON e.po_id = po.po_id
  WHERE po.status NOT IN ('Open', 'Cancelled')
  GROUP BY DATE_TRUNC('month', po.ordered_date)
)
SELECT TO_CHAR(month, 'YYYY-MM') AS period, defects * 100.0 / NULLIF(pos, 0) AS value FROM monthly ORDER BY month`,
    sourceTables: ['production.supply_chain.purchase_orders', 'production.supply_chain.exceptions'],
    grain: 'monthly', dimensions: ['supplier_id', 'category'],
    materialization: 'scheduled', schedule: '0 3 * * *',
    owner: 'Procurement Team', status: 'published',
    createdAt: '2026-02-10T09:00:00Z', createdBy: 'sarah.chen',
    changeReason: 'Initial KPI definition',
    tags: ['procurement', 'quality', 'supplier'],
  },
];

const LOGISTICS_KPIS: SeedKpi[] = [
  {
    kpiId: 'carrier_otd', version: 1,
    displayName: 'Carrier OTD Rate',
    description: 'Carrier On-Time Delivery: % of delivered shipments where delivered_date <= promised_date.',
    unit: 'percent', chartType: 'gauge', direction: 'higher-is-better',
    greenMax: 95, yellowMax: 88,
    sqlLogic: `SELECT COUNT(CASE WHEN delivered_date <= promised_date THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM production.supply_chain.shipments
WHERE status = 'Delivered' AND order_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT COUNT(CASE WHEN delivered_date <= promised_date THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM shipments WHERE status = 'Delivered'`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', order_date), 'YYYY-MM') AS period,
  COUNT(CASE WHEN delivered_date <= promised_date THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0) AS value
FROM shipments WHERE status = 'Delivered'
GROUP BY DATE_TRUNC('month', order_date) ORDER BY DATE_TRUNC('month', order_date)`,
    sourceTables: ['production.supply_chain.shipments'],
    grain: 'monthly', dimensions: ['carrier_id', 'destination_region'],
    materialization: 'scheduled', schedule: '0 2 * * *',
    owner: 'Logistics Team', status: 'published',
    createdAt: '2026-01-28T10:00:00Z', createdBy: 'marcus.lee',
    changeReason: 'Initial KPI definition',
    tags: ['logistics', 'tier-1', 'carrier'],
  },
  {
    kpiId: 'avg_transit_days', version: 1,
    displayName: 'Avg Transit Days',
    description: 'Average days from shipped to delivered across completed shipments.',
    unit: 'days', chartType: 'line', direction: 'lower-is-better',
    greenMax: 5, yellowMax: 8,
    sqlLogic: `SELECT AVG(delivered_date - shipped_date) AS value
FROM production.supply_chain.shipments
WHERE status = 'Delivered' AND shipped_date IS NOT NULL
  AND order_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT AVG(delivered_date - shipped_date) AS value
FROM shipments WHERE status = 'Delivered' AND shipped_date IS NOT NULL`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', order_date), 'YYYY-MM') AS period,
  AVG(delivered_date - shipped_date) AS value
FROM shipments WHERE status = 'Delivered' AND shipped_date IS NOT NULL
GROUP BY DATE_TRUNC('month', order_date) ORDER BY DATE_TRUNC('month', order_date)`,
    sourceTables: ['production.supply_chain.shipments'],
    grain: 'monthly', dimensions: ['carrier_id', 'destination_region'],
    materialization: 'live', schedule: null,
    owner: 'Logistics Team', status: 'published',
    createdAt: '2026-01-28T10:00:00Z', createdBy: 'marcus.lee',
    changeReason: 'Initial KPI definition',
    tags: ['logistics', 'transit'],
  },
  {
    kpiId: 'damage_rate', version: 1,
    displayName: 'Damage Rate',
    description: '% of shipments with at least one Damage exception logged.',
    unit: 'percent', chartType: 'bar', direction: 'lower-is-better',
    greenMax: 1, yellowMax: 3,
    sqlLogic: `SELECT COUNT(DISTINCT e.shipment_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM production.supply_chain.shipments WHERE status IN ('Shipped', 'Delivered')), 0) AS value
FROM production.supply_chain.exceptions e WHERE e.reason_code = 'Damage'`,
    execSql: `SELECT COUNT(DISTINCT e.shipment_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM shipments WHERE status IN ('Shipped', 'Delivered')), 0) AS value
FROM exceptions e WHERE e.reason_code = 'Damage'`,
    trendSql: `WITH monthly AS (
  SELECT DATE_TRUNC('month', s.order_date) AS month,
         COUNT(*) AS ships,
         COUNT(DISTINCT CASE WHEN e.reason_code = 'Damage' THEN s.shipment_id END) AS dmg
  FROM shipments s
  LEFT JOIN exceptions e ON e.shipment_id = s.shipment_id
  WHERE s.status IN ('Shipped', 'Delivered')
  GROUP BY DATE_TRUNC('month', s.order_date)
)
SELECT TO_CHAR(month, 'YYYY-MM') AS period, dmg * 100.0 / NULLIF(ships, 0) AS value FROM monthly ORDER BY month`,
    sourceTables: ['production.supply_chain.exceptions', 'production.supply_chain.shipments'],
    grain: 'monthly', dimensions: ['carrier_id', 'destination_region'],
    materialization: 'scheduled', schedule: '0 4 * * *',
    owner: 'Logistics Team', status: 'published',
    createdAt: '2026-02-05T09:00:00Z', createdBy: 'marcus.lee',
    changeReason: 'Initial KPI definition',
    tags: ['logistics', 'quality'],
  },
];

const OPERATIONS_KPIS: SeedKpi[] = [
  {
    kpiId: 'exception_rate', version: 1,
    displayName: 'Exception Rate',
    description: '% of shipped/delivered shipments with at least one exception event logged. Composite operational health indicator.',
    unit: 'percent', chartType: 'bar', direction: 'lower-is-better',
    greenMax: 6, yellowMax: 12,
    sqlLogic: `SELECT COUNT(DISTINCT e.shipment_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM production.supply_chain.shipments WHERE status IN ('Shipped', 'Delivered')), 0) AS value
FROM production.supply_chain.exceptions e WHERE e.shipment_id IS NOT NULL`,
    execSql: `SELECT COUNT(DISTINCT e.shipment_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM shipments WHERE status IN ('Shipped', 'Delivered')), 0) AS value
FROM exceptions e WHERE e.shipment_id IS NOT NULL`,
    trendSql: `WITH monthly AS (
  SELECT DATE_TRUNC('month', s.order_date) AS month, COUNT(*) AS ships,
         COUNT(DISTINCT e.shipment_id) AS excs
  FROM shipments s LEFT JOIN exceptions e ON e.shipment_id = s.shipment_id
  WHERE s.status IN ('Shipped', 'Delivered')
  GROUP BY DATE_TRUNC('month', s.order_date)
)
SELECT TO_CHAR(month, 'YYYY-MM') AS period, excs * 100.0 / NULLIF(ships, 0) AS value FROM monthly ORDER BY month`,
    sourceTables: ['production.supply_chain.exceptions', 'production.supply_chain.shipments'],
    grain: 'monthly', dimensions: ['warehouse_id', 'reason_code', 'destination_region'],
    materialization: 'scheduled', schedule: '0 1 * * *',
    owner: 'Operations Team', status: 'published',
    createdAt: '2026-01-20T10:00:00Z', createdBy: 'lisa.park',
    changeReason: 'Initial KPI definition',
    tags: ['operations', 'tier-1', 'health'],
  },
  {
    kpiId: 'avg_exception_mttr', version: 1,
    displayName: 'Avg Exception MTTR',
    description: 'Mean time to resolve exceptions (hours). Measures operational responsiveness to issues.',
    unit: 'hours', chartType: 'line', direction: 'lower-is-better',
    greenMax: 48, yellowMax: 96,
    sqlLogic: `SELECT AVG(EXTRACT(EPOCH FROM (resolved_date::timestamp - event_date::timestamp)) / 3600.0) AS value
FROM production.supply_chain.exceptions
WHERE resolved_date IS NOT NULL AND event_date BETWEEN :start_date AND :end_date`,
    execSql: `SELECT AVG(EXTRACT(EPOCH FROM (resolved_date::timestamp - event_date::timestamp)) / 3600.0) AS value
FROM exceptions WHERE resolved_date IS NOT NULL`,
    trendSql: `SELECT TO_CHAR(DATE_TRUNC('month', event_date), 'YYYY-MM') AS period,
  AVG(EXTRACT(EPOCH FROM (resolved_date::timestamp - event_date::timestamp)) / 3600.0) AS value
FROM exceptions WHERE resolved_date IS NOT NULL
GROUP BY DATE_TRUNC('month', event_date) ORDER BY DATE_TRUNC('month', event_date)`,
    sourceTables: ['production.supply_chain.exceptions'],
    grain: 'monthly', dimensions: ['reason_code', 'severity'],
    materialization: 'live', schedule: null,
    owner: 'Operations Team', status: 'published',
    createdAt: '2026-02-12T11:00:00Z', createdBy: 'lisa.park',
    changeReason: 'Initial KPI definition',
    tags: ['operations', 'mttr', 'responsiveness'],
  },
  {
    kpiId: 'return_rate', version: 1,
    displayName: 'Return Rate',
    description: '% of delivered shipments with at least one return logged.',
    unit: 'percent', chartType: 'bar', direction: 'lower-is-better',
    greenMax: 8, yellowMax: 15,
    sqlLogic: `SELECT COUNT(DISTINCT r.shipment_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM production.supply_chain.shipments WHERE status = 'Delivered'), 0) AS value
FROM production.supply_chain.returns r`,
    execSql: `SELECT COUNT(DISTINCT r.shipment_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM shipments WHERE status = 'Delivered'), 0) AS value FROM returns r`,
    trendSql: `WITH monthly AS (
  SELECT DATE_TRUNC('month', s.order_date) AS month, COUNT(*) AS delivered,
         COUNT(DISTINCT r.shipment_id) AS returned
  FROM shipments s LEFT JOIN returns r ON r.shipment_id = s.shipment_id
  WHERE s.status = 'Delivered'
  GROUP BY DATE_TRUNC('month', s.order_date)
)
SELECT TO_CHAR(month, 'YYYY-MM') AS period, returned * 100.0 / NULLIF(delivered, 0) AS value FROM monthly ORDER BY month`,
    sourceTables: ['production.supply_chain.returns', 'production.supply_chain.shipments'],
    grain: 'monthly', dimensions: ['destination_region', 'customer_segment'],
    materialization: 'scheduled', schedule: '0 5 * * *',
    owner: 'Customer Operations', status: 'published',
    createdAt: '2026-02-15T10:00:00Z', createdBy: 'amy.torres',
    changeReason: 'Initial KPI definition',
    tags: ['operations', 'customer-experience'],
  },
  {
    kpiId: 'warehouse_capacity_util', version: 1,
    displayName: 'Warehouse Capacity Utilization',
    description: 'Pallet positions in use vs. warehouse capacity. Computed as total on-hand pallets (proxy: total on_hand_qty / 1000) / capacity_pallets across all warehouses.',
    unit: 'percent', chartType: 'gauge', direction: 'lower-is-better',
    greenMax: 75, yellowMax: 88,
    sqlLogic: `WITH wh_util AS (
  SELECT inv.warehouse_id, SUM(inv.on_hand_qty) / 1000.0 AS pallets_used, MAX(w.capacity_pallets) AS capacity
  FROM production.supply_chain.inventory_snapshots inv
  JOIN production.supply_chain.warehouses w ON w.warehouse_id = inv.warehouse_id
  WHERE inv.snapshot_date = (SELECT MAX(snapshot_date) FROM production.supply_chain.inventory_snapshots)
  GROUP BY inv.warehouse_id
)
SELECT SUM(pallets_used) * 100.0 / NULLIF(SUM(capacity), 0) AS value FROM wh_util`,
    execSql: `WITH wh_util AS (
  SELECT inv.warehouse_id, SUM(inv.on_hand_qty) / 1000.0 AS pallets_used, MAX(w.capacity_pallets) AS capacity
  FROM inventory_snapshots inv
  JOIN warehouses w ON w.warehouse_id = inv.warehouse_id
  WHERE inv.snapshot_date = (SELECT MAX(snapshot_date) FROM inventory_snapshots)
  GROUP BY inv.warehouse_id
)
SELECT SUM(pallets_used) * 100.0 / NULLIF(SUM(capacity), 0) AS value FROM wh_util`,
    trendSql: `WITH monthly AS (
  SELECT DATE_TRUNC('month', inv.snapshot_date) AS month,
         AVG(SUM(inv.on_hand_qty) / 1000.0) OVER (PARTITION BY DATE_TRUNC('month', inv.snapshot_date)) AS avg_pallets_used,
         MAX(SUM(w.capacity_pallets)) OVER (PARTITION BY DATE_TRUNC('month', inv.snapshot_date)) AS total_capacity
  FROM inventory_snapshots inv
  JOIN warehouses w ON w.warehouse_id = inv.warehouse_id
  GROUP BY DATE_TRUNC('month', inv.snapshot_date), inv.snapshot_date
)
SELECT TO_CHAR(month, 'YYYY-MM') AS period,
  AVG(avg_pallets_used) * 100.0 / NULLIF(AVG(total_capacity), 0) AS value
FROM monthly GROUP BY month ORDER BY month`,
    sourceTables: ['production.supply_chain.inventory_snapshots', 'production.supply_chain.warehouses'],
    grain: 'daily', dimensions: ['warehouse_id'],
    materialization: 'scheduled', schedule: '0 6 * * *',
    owner: 'Warehouse Operations', status: 'published',
    createdAt: '2026-02-20T09:00:00Z', createdBy: 'rachel.kim',
    changeReason: 'Initial KPI definition with pallet-proxy formula',
    tags: ['operations', 'capacity'],
  },
];

export const SUPPLY_CHAIN_KPIS: SeedKpi[] = [
  ...FULFILLMENT_KPIS,
  ...INVENTORY_KPIS,
  ...PROCUREMENT_KPIS,
  ...LOGISTICS_KPIS,
  ...OPERATIONS_KPIS,
];

export const KPI_VERSION_HISTORY: SeedVersion[] = [
  // OTIF v1 deprecated, v2 published
  { kpiId: 'otif_rate', version: 1, createdAt: '2026-01-15T10:00:00Z', createdBy: 'lisa.park', changeReason: 'Initial KPI — shipment-level on-time + in-full flag', status: 'deprecated' },
  { kpiId: 'otif_rate', version: 2, createdAt: '2026-01-20T10:00:00Z', createdBy: 'lisa.park', changeReason: 'Switched to line-level backorder check from shipment-level flag', status: 'published' },
  // Stockout v1 deprecated, v2 published
  { kpiId: 'stockout_rate', version: 1, createdAt: '2026-01-20T10:00:00Z', createdBy: 'david.chen', changeReason: 'Initial KPI — included all SKUs in denominator', status: 'deprecated' },
  { kpiId: 'stockout_rate', version: 2, createdAt: '2026-02-05T10:00:00Z', createdBy: 'david.chen', changeReason: 'Excluded discontinued SKUs from denominator', status: 'published' },
];

// === Persistence ===

export async function seedKpiLibrary(pool: Pool): Promise<void> {
  for (const k of SUPPLY_CHAIN_KPIS) {
    await pool.query(
      `INSERT INTO kpi_definitions
       (kpi_id, version, display_name, description, unit, chart_type, direction,
        green_max, yellow_max, sql_logic, exec_sql, trend_sql, source_tables,
        grain, dimensions, materialization, schedule, owner, status,
        created_at, created_by, change_reason, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [k.kpiId, k.version, k.displayName, k.description, k.unit, k.chartType, k.direction,
       k.greenMax, k.yellowMax, k.sqlLogic, k.execSql, k.trendSql || null, k.sourceTables,
       k.grain, k.dimensions, k.materialization, k.schedule, k.owner, k.status,
       k.createdAt, k.createdBy, k.changeReason, k.tags]
    );
  }

  // Explicit version history rows
  for (const v of KPI_VERSION_HISTORY) {
    await pool.query(
      `INSERT INTO kpi_versions (kpi_id, version, created_at, created_by, change_reason, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (kpi_id, version) DO NOTHING`,
      [v.kpiId, v.version, v.createdAt, v.createdBy, v.changeReason, v.status]
    );
  }
  // For KPIs without explicit history, add a single row for the current version
  const withHistory = new Set(KPI_VERSION_HISTORY.map(v => `${v.kpiId}@${v.version}`));
  for (const k of SUPPLY_CHAIN_KPIS) {
    if (!withHistory.has(`${k.kpiId}@${k.version}`)) {
      await pool.query(
        `INSERT INTO kpi_versions (kpi_id, version, created_at, created_by, change_reason, status)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (kpi_id, version) DO NOTHING`,
        [k.kpiId, k.version, k.createdAt, k.createdBy, k.changeReason, k.status]
      );
    }
  }

  console.log(`Seeded ${SUPPLY_CHAIN_KPIS.length} supply chain KPI definitions.`);
}
