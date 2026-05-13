// Supply chain schema DDL for Meridian Industrial Supply.
// All statements are idempotent (IF NOT EXISTS / IF EXISTS) so this can run on every startup.

export const DROP_LEGACY_DDL: string[] = [
  `DROP TABLE IF EXISTS sales_orders CASCADE`,
];

export const SUPPLY_CHAIN_DDL: string[] = [
  // === Dimensions ===

  `CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id    VARCHAR(20) PRIMARY KEY,
    name           VARCHAR(200) NOT NULL,
    country        VARCHAR(50) NOT NULL,
    region         VARCHAR(20) NOT NULL,
    tier           VARCHAR(20) NOT NULL,
    onboarded_at   DATE NOT NULL,
    payment_terms  VARCHAR(20) NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'active'
  )`,

  `CREATE TABLE IF NOT EXISTS warehouses (
    warehouse_id      VARCHAR(20) PRIMARY KEY,
    name              VARCHAR(100) NOT NULL,
    country           VARCHAR(50) NOT NULL,
    region            VARCHAR(20) NOT NULL,
    type              VARCHAR(20) NOT NULL,
    capacity_pallets  INTEGER NOT NULL,
    opened_at         DATE NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS carriers (
    carrier_id  VARCHAR(20) PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    type        VARCHAR(20) NOT NULL,
    region      VARCHAR(20) NOT NULL,
    sla_days    INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS customers (
    customer_id   VARCHAR(20) PRIMARY KEY,
    name          VARCHAR(200) NOT NULL,
    segment       VARCHAR(20) NOT NULL,
    industry      VARCHAR(50) NOT NULL,
    country       VARCHAR(50) NOT NULL,
    region        VARCHAR(20) NOT NULL,
    onboarded_at  DATE NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS skus (
    sku_id               VARCHAR(20) PRIMARY KEY,
    name                 VARCHAR(200) NOT NULL,
    category             VARCHAR(50) NOT NULL,
    subcategory          VARCHAR(80) NOT NULL,
    abc_class            CHAR(1) NOT NULL,
    is_critical          BOOLEAN NOT NULL DEFAULT FALSE,
    unit_cost            NUMERIC(10,2) NOT NULL,
    list_price           NUMERIC(10,2) NOT NULL,
    weight_kg            NUMERIC(8,3) NOT NULL,
    primary_supplier_id  VARCHAR(20) REFERENCES suppliers(supplier_id),
    lead_time_days       INTEGER NOT NULL,
    introduced_at        DATE NOT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'active'
  )`,

  // === Facts ===

  `CREATE TABLE IF NOT EXISTS purchase_orders (
    po_id          VARCHAR(20) NOT NULL,
    line_number    INTEGER NOT NULL,
    supplier_id    VARCHAR(20) NOT NULL REFERENCES suppliers(supplier_id),
    warehouse_id   VARCHAR(20) NOT NULL REFERENCES warehouses(warehouse_id),
    sku_id         VARCHAR(20) NOT NULL REFERENCES skus(sku_id),
    qty_ordered    INTEGER NOT NULL,
    qty_received   INTEGER NOT NULL DEFAULT 0,
    unit_cost      NUMERIC(10,2) NOT NULL,
    ordered_date   DATE NOT NULL,
    promised_date  DATE NOT NULL,
    received_date  DATE,
    status         VARCHAR(20) NOT NULL,
    PRIMARY KEY (po_id, line_number)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id)`,
  `CREATE INDEX IF NOT EXISTS idx_po_ordered_date ON purchase_orders(ordered_date)`,
  `CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status)`,

  `CREATE TABLE IF NOT EXISTS shipments (
    shipment_id         VARCHAR(20) PRIMARY KEY,
    customer_id         VARCHAR(20) NOT NULL REFERENCES customers(customer_id),
    warehouse_id        VARCHAR(20) NOT NULL REFERENCES warehouses(warehouse_id),
    carrier_id          VARCHAR(20) NOT NULL REFERENCES carriers(carrier_id),
    order_date          DATE NOT NULL,
    promised_date       DATE NOT NULL,
    shipped_date        DATE,
    delivered_date      DATE,
    status              VARCHAR(20) NOT NULL,
    origin_region       VARCHAR(20) NOT NULL,
    destination_region  VARCHAR(20) NOT NULL,
    total_value         NUMERIC(12,2) NOT NULL,
    -- Materialized perfect-order flag. Populated by a one-time backfill in migrate.ts to
    -- avoid the three-EXISTS subquery on every perfect_order_rate read (was ~7s on Railway).
    is_perfect_order    BOOLEAN NOT NULL DEFAULT FALSE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_shp_order_date ON shipments(order_date)`,
  `CREATE INDEX IF NOT EXISTS idx_shp_destination ON shipments(destination_region)`,
  `CREATE INDEX IF NOT EXISTS idx_shp_status ON shipments(status)`,
  `CREATE INDEX IF NOT EXISTS idx_shp_customer ON shipments(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_shp_warehouse ON shipments(warehouse_id)`,
  // Note: the partial index on is_perfect_order is created inside
  // ensurePerfectOrderFlag() in migrate.ts, AFTER the column is ALTERed into the table.
  // Putting it here would crash on existing DBs where the column doesn't exist yet —
  // CREATE TABLE IF NOT EXISTS doesn't backfill columns.

  `CREATE TABLE IF NOT EXISTS shipment_lines (
    shipment_id      VARCHAR(20) NOT NULL REFERENCES shipments(shipment_id) ON DELETE CASCADE,
    line_number      INTEGER NOT NULL,
    sku_id           VARCHAR(20) NOT NULL REFERENCES skus(sku_id),
    qty_ordered      INTEGER NOT NULL,
    qty_shipped      INTEGER NOT NULL DEFAULT 0,
    qty_backordered  INTEGER NOT NULL DEFAULT 0,
    unit_price       NUMERIC(10,2) NOT NULL,
    line_total       NUMERIC(12,2) NOT NULL,
    PRIMARY KEY (shipment_id, line_number)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_shpl_sku ON shipment_lines(sku_id)`,

  `CREATE TABLE IF NOT EXISTS inventory_snapshots (
    snapshot_date   DATE NOT NULL,
    warehouse_id    VARCHAR(20) NOT NULL REFERENCES warehouses(warehouse_id),
    sku_id          VARCHAR(20) NOT NULL REFERENCES skus(sku_id),
    on_hand_qty     INTEGER NOT NULL,
    allocated_qty   INTEGER NOT NULL DEFAULT 0,
    on_order_qty    INTEGER NOT NULL DEFAULT 0,
    days_of_supply  NUMERIC(6,1),
    PRIMARY KEY (snapshot_date, warehouse_id, sku_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_inv_date ON inventory_snapshots(snapshot_date)`,
  `CREATE INDEX IF NOT EXISTS idx_inv_sku ON inventory_snapshots(sku_id)`,

  `CREATE TABLE IF NOT EXISTS exceptions (
    exception_id      SERIAL PRIMARY KEY,
    event_date        DATE NOT NULL,
    shipment_id       VARCHAR(20) REFERENCES shipments(shipment_id),
    po_id             VARCHAR(20),
    reason_code       VARCHAR(40) NOT NULL,
    severity          VARCHAR(20) NOT NULL,
    resolved_date     DATE,
    resolution_note   TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_exc_date ON exceptions(event_date)`,
  `CREATE INDEX IF NOT EXISTS idx_exc_reason ON exceptions(reason_code)`,

  `CREATE TABLE IF NOT EXISTS returns (
    return_id      VARCHAR(20) PRIMARY KEY,
    shipment_id    VARCHAR(20) NOT NULL REFERENCES shipments(shipment_id),
    customer_id    VARCHAR(20) NOT NULL REFERENCES customers(customer_id),
    sku_id         VARCHAR(20) NOT NULL REFERENCES skus(sku_id),
    return_date    DATE NOT NULL,
    reason_code    VARCHAR(40) NOT NULL,
    qty_returned   INTEGER NOT NULL,
    condition      VARCHAR(20) NOT NULL,
    refund_amount  NUMERIC(10,2) NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ret_date ON returns(return_date)`,
];

// KPI metadata tables stay (carried over from the previous design).
export const KPI_METADATA_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS kpi_definitions (
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
    source_tables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
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
  )`,
  `CREATE TABLE IF NOT EXISTS kpi_versions (
    id SERIAL PRIMARY KEY,
    kpi_id VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(200) NOT NULL,
    change_reason TEXT DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'published',
    UNIQUE(kpi_id, version)
  )`,
];

// Column comments — drive Claude's schema awareness via pg's COMMENT system.
export const COLUMN_COMMENTS: Array<[string, string, string]> = [
  ['suppliers', 'supplier_id', 'Unique supplier identifier (e.g., SUP-0042)'],
  ['suppliers', 'tier', 'Supplier tier: Strategic | Preferred | Tactical. Strategic suppliers are critical and have negotiated SLAs.'],
  ['suppliers', 'region', 'Supplier region: NA | EMEA | APAC | LATAM'],
  ['suppliers', 'payment_terms', 'Payment terms: NET30 | NET45 | NET60'],
  ['suppliers', 'status', 'active | suspended | offboarded'],

  ['warehouses', 'warehouse_id', 'Unique warehouse identifier (e.g., WH-NA-01)'],
  ['warehouses', 'type', 'Facility type: DC (full distribution center) | Regional | Cross-dock (no long-term storage)'],
  ['warehouses', 'capacity_pallets', 'Total pallet positions'],

  ['carriers', 'type', 'Carrier service type: Parcel | LTL | FTL | Ocean | Air'],
  ['carriers', 'sla_days', 'Standard transit SLA in days'],

  ['customers', 'segment', 'Customer segment: Enterprise | Mid-Market | SMB'],
  ['customers', 'industry', 'Industry vertical: Manufacturing | Automotive | Aerospace | Energy | Construction'],

  ['skus', 'category', 'Product category: Fasteners | Bearings | Hydraulics | Electrical | Safety | MRO | Cutting Tools'],
  ['skus', 'abc_class', 'ABC velocity class: A (top 10% volume) | B (next 30%) | C (long tail)'],
  ['skus', 'is_critical', 'TRUE if SKU is a critical-path part (production-stopping if stocked out)'],
  ['skus', 'lead_time_days', 'Typical supplier replenishment lead time in days'],
  ['skus', 'status', 'active | phasing_out | discontinued'],

  ['purchase_orders', 'po_id', 'Purchase order header identifier (multiple lines per PO)'],
  ['purchase_orders', 'status', 'PO lifecycle: Open | Confirmed | In Transit | Received | Closed | Cancelled'],
  ['purchase_orders', 'qty_received', 'Cumulative quantity received against this line (may be partial)'],

  ['shipments', 'shipment_id', 'Outbound shipment identifier'],
  ['shipments', 'status', 'Lifecycle: Open | Picking | Packed | Shipped | Delivered | Cancelled | Returned'],
  ['shipments', 'promised_date', 'Date promised to customer at order time'],
  ['shipments', 'shipped_date', 'Actual ship-out date from warehouse (NULL until shipped)'],
  ['shipments', 'delivered_date', 'Final-mile delivery date (NULL until delivered)'],
  ['shipments', 'origin_region', 'Region of shipping warehouse'],
  ['shipments', 'destination_region', 'Region of customer delivery address'],
  ['shipments', 'total_value', 'Total line-item value (sum of shipment_lines.line_total)'],

  ['shipment_lines', 'qty_backordered', 'Quantity not shipped due to stockout; partial-fill indicator'],
  ['shipment_lines', 'line_total', 'qty_shipped * unit_price'],

  ['inventory_snapshots', 'snapshot_date', 'Daily snapshot date'],
  ['inventory_snapshots', 'on_hand_qty', 'Physical inventory at the warehouse'],
  ['inventory_snapshots', 'allocated_qty', 'Reserved against open shipments (not yet picked)'],
  ['inventory_snapshots', 'on_order_qty', 'On-order from suppliers, not yet received'],
  ['inventory_snapshots', 'days_of_supply', 'On-hand / avg daily demand (forward-looking coverage)'],

  ['exceptions', 'reason_code', 'Categorized issue: Carrier Delay | Address Issue | Damage | Weather | Capacity | Customs | Supplier Delay | Hazmat Hold | Documentation | Other'],
  ['exceptions', 'severity', 'info | warning | critical'],

  ['returns', 'reason_code', 'Return reason: Defective | Wrong Item | No Longer Needed | Damaged in Transit | Excess Order | Other'],
  ['returns', 'condition', 'Returned condition: Sellable | Damaged | Scrap'],
];
