import pool from './db.js';
import {
  COLUMN_COMMENTS, DROP_LEGACY_DDL, KPI_METADATA_DDL, SUPPLY_CHAIN_DDL,
} from './supplyChain/schema.js';
import { seedDimensions } from './supplyChain/seedDimensions.js';
import { seedFacts } from './supplyChain/seedFacts.js';
import { seedKpiLibrary, SUPPLY_CHAIN_KPIS } from './supplyChain/seedKpis.js';

// Idempotent fixups for KPI execSql definitions that have shipped to existing DBs.
// Each entry rewrites the runnable SQL for a KPI without bumping its version. Add a row
// here when a KPI's execSql is wrong in the seed and we need every existing DB to pick
// up the corrected version on next boot.
const KPI_EXEC_SQL_FIXUPS: { kpiId: string; expected: string; replacement: string; replaceTrend?: boolean }[] = [
  {
    // inventory_turns must annualize so 30d / 7d / YTD windows show comparable values
    // against the (annualized) green threshold of 8.
    kpiId: 'inventory_turns',
    expected: 'WITH cogs AS',
    replacement: SUPPLY_CHAIN_KPIS.find(k => k.kpiId === 'inventory_turns')?.execSql ?? '',
  },
  {
    // perfect_order_rate — replace the three-EXISTS subquery with the materialized
    // is_perfect_order flag. ensurePerfectOrderFlag (in this file) populates the column.
    kpiId: 'perfect_order_rate',
    expected: 'WITH evaluated AS',
    replacement: SUPPLY_CHAIN_KPIS.find(k => k.kpiId === 'perfect_order_rate')?.execSql ?? '',
    replaceTrend: true,
  },
];

async function applyKpiFixups(): Promise<void> {
  for (const fix of KPI_EXEC_SQL_FIXUPS) {
    if (!fix.replacement) continue;
    const { rows } = await pool.query(
      `SELECT exec_sql FROM kpi_definitions WHERE kpi_id = $1`,
      [fix.kpiId]
    );
    if (rows.length === 0) continue;
    if (rows[0].exec_sql === fix.replacement) continue;
    await pool.query(
      `UPDATE kpi_definitions SET exec_sql = $1 WHERE kpi_id = $2`,
      [fix.replacement, fix.kpiId]
    );
    if (fix.replaceTrend) {
      const trendSql = SUPPLY_CHAIN_KPIS.find(k => k.kpiId === fix.kpiId)?.trendSql ?? '';
      if (trendSql) {
        await pool.query(
          `UPDATE kpi_definitions SET trend_sql = $1 WHERE kpi_id = $2`,
          [trendSql, fix.kpiId],
        );
      }
    }
    console.log(`Applied execSql fixup for KPI: ${fix.kpiId}`);
  }
}

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

  // 9. Apply idempotent fixups to KPI execSql for already-seeded DBs
  await applyKpiFixups();

  // 10. Materialize is_perfect_order on shipments (one-time backfill on existing DBs).
  await ensurePerfectOrderFlag();

  console.log('=== Migrations: complete ===');
}

// Tracks one-time migrations that go beyond schema DDL (column adds, data backfills).
// Each migration name records that it has run; we skip if already applied.
async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name        TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function migrationApplied(name: string): Promise<boolean> {
  await ensureMigrationsTable();
  const { rows } = await pool.query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [name]);
  return rows.length > 0;
}

async function markMigrationApplied(name: string): Promise<void> {
  await ensureMigrationsTable();
  await pool.query(
    `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`,
    [name],
  );
}

// One-time migration: add is_perfect_order to shipments (idempotent ALTER for existing
// DBs that pre-date the schema change), then backfill via the three-EXISTS computation.
// The backfill is slow (≈10s on the demo dataset) but runs once; subsequent metric reads
// become a simple AVG over the flag.
async function ensurePerfectOrderFlag(): Promise<void> {
  const MIGRATION = 'shipments_is_perfect_order_2026_05';
  if (await migrationApplied(MIGRATION)) return;
  console.log('Adding + backfilling shipments.is_perfect_order…');
  await pool.query(`ALTER TABLE shipments ADD COLUMN IF NOT EXISTS is_perfect_order BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shp_perfect ON shipments(is_perfect_order) WHERE is_perfect_order = TRUE`);
  const t0 = Date.now();
  await pool.query(`
    UPDATE shipments s
    SET is_perfect_order = TRUE
    WHERE s.status = 'Delivered'
      AND s.delivered_date IS NOT NULL
      AND s.delivered_date <= s.promised_date
      AND NOT EXISTS (SELECT 1 FROM shipment_lines sl WHERE sl.shipment_id = s.shipment_id AND sl.qty_backordered > 0)
      AND NOT EXISTS (SELECT 1 FROM exceptions e WHERE e.shipment_id = s.shipment_id)
      AND NOT EXISTS (SELECT 1 FROM returns r WHERE r.shipment_id = s.shipment_id)
  `);
  await markMigrationApplied(MIGRATION);
  console.log(`Backfilled is_perfect_order in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
}
