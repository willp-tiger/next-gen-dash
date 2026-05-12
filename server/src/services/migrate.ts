import pool from './db.js';
import {
  COLUMN_COMMENTS, DROP_LEGACY_DDL, KPI_METADATA_DDL, SUPPLY_CHAIN_DDL,
} from './supplyChain/schema.js';
import { seedDimensions } from './supplyChain/seedDimensions.js';
import { seedFacts } from './supplyChain/seedFacts.js';
import { seedKpiLibrary, SUPPLY_CHAIN_KPIS } from './supplyChain/seedKpis.js';

// Set RESET_DATA=true env var to force a full wipe + reseed on next boot.
// Default behavior is idempotent: only seeds if tables are empty.
const FORCE_RESET = process.env.RESET_DATA === 'true';

// KPI IDs that belonged to the legacy retail-sales schema. Their presence means
// we're upgrading from the old data model and need to wipe before reseeding.
const LEGACY_KPI_IDS = [
  'total_revenue', 'avg_order_value', 'total_orders', 'units_sold', 'avg_price',
  'fulfillment_rate', 'cancelled_order_rate', 'avg_deal_size_value', 'revenue_per_customer',
  'order_frequency', 'product_line_count', 'territory_revenue_share', 'large_deal_rate',
  'discount_depth', 'single_product_orders',
];

async function tableExists(tableName: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1) AS present`,
    [tableName]
  );
  return rows[0]?.present === true;
}

async function rowCount(tableName: string): Promise<number> {
  if (!(await tableExists(tableName))) return 0;
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS cnt FROM ${tableName}`);
  return rows[0]?.cnt ?? 0;
}

async function detectLegacyKpis(): Promise<boolean> {
  if (!(await tableExists('kpi_definitions'))) return false;
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM kpi_definitions WHERE kpi_id = ANY($1::text[])`,
    [LEGACY_KPI_IDS]
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

async function applyColumnComments(): Promise<void> {
  for (const [table, column, comment] of COLUMN_COMMENTS) {
    try {
      await pool.query(`COMMENT ON COLUMN "${table}"."${column}" IS $1`, [comment]);
    } catch {
      // Column may not exist if migration is still in progress — skip silently.
    }
  }
}

async function wipeSupplyChainData(): Promise<void> {
  // Truncate in dependency order. CASCADE handles FK chains.
  await pool.query(`TRUNCATE
    returns, exceptions, inventory_snapshots,
    shipment_lines, shipments, purchase_orders,
    skus, customers, carriers, warehouses, suppliers
    RESTART IDENTITY CASCADE`);
}

async function wipeKpiLibrary(): Promise<void> {
  await pool.query('TRUNCATE kpi_versions');
  await pool.query('TRUNCATE kpi_definitions');
}

export async function runMigrations(): Promise<void> {
  console.log('=== Migrations: starting ===');

  // 1. Drop legacy sales table (no-op if not present)
  for (const ddl of DROP_LEGACY_DDL) {
    await pool.query(ddl);
  }

  // 2. KPI metadata tables (always ensure present — used by both old + new world)
  for (const ddl of KPI_METADATA_DDL) {
    await pool.query(ddl);
  }

  // 3. Supply chain schema
  for (const ddl of SUPPLY_CHAIN_DDL) {
    await pool.query(ddl);
  }

  // 4. Detect legacy KPIs and wipe if present (one-time upgrade path)
  const hasLegacy = await detectLegacyKpis();
  if (hasLegacy) {
    console.log('Detected legacy retail-sales KPI definitions. Wiping...');
    await wipeKpiLibrary();
  }

  // 5. Force-reset path for development
  if (FORCE_RESET) {
    console.log('RESET_DATA=true: wiping supply chain data + KPI library.');
    await wipeSupplyChainData();
    await wipeKpiLibrary();
  }

  // 6. Seed supply chain data if empty
  const skuCount = await rowCount('skus');
  if (skuCount === 0) {
    console.log('Seeding supply chain data (Meridian Industrial)...');
    const t0 = Date.now();
    const dims = await seedDimensions(pool);
    await seedFacts(pool, dims);
    console.log(`Supply chain seed complete in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  } else {
    console.log(`Supply chain data present (${skuCount} SKUs). Skipping seed.`);
  }

  // 7. Seed KPI library if empty
  const kpiCount = await rowCount('kpi_definitions');
  if (kpiCount === 0) {
    console.log(`Seeding ${SUPPLY_CHAIN_KPIS.length} supply chain KPIs...`);
    await seedKpiLibrary(pool);
  } else {
    console.log(`KPI library present (${kpiCount} KPIs). Skipping seed.`);
  }

  // 8. Apply column comments (idempotent, drives Claude's schema awareness)
  await applyColumnComments();

  console.log('=== Migrations: complete ===');
}
