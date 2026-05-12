import { describe, it, expect } from 'vitest';
import { applyFilters } from '../server/src/services/salesData.js';

// Exception/return rate fragments — the shapes that were silently breaking before
// applyFilters learned about the exceptions and returns tables.
const EXCEPTION_RATE_SQL = `SELECT COUNT(DISTINCT e.shipment_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM shipments WHERE status IN ('Shipped','Delivered')), 0) AS value
FROM exceptions e WHERE e.shipment_id IS NOT NULL`;

const RETURN_RATE_SQL = `SELECT COUNT(DISTINCT r.shipment_id) * 100.0 / NULLIF((SELECT COUNT(*) FROM shipments WHERE status = 'Delivered'), 0) AS value FROM returns r`;

const MTTR_SQL = `SELECT AVG(EXTRACT(EPOCH FROM (resolved_date::timestamp - event_date::timestamp)) / 3600.0) AS value
FROM exceptions WHERE resolved_date IS NOT NULL`;

describe('applyFilters — date filtering on exceptions and returns', () => {
  it('wraps exceptions in a CTE with event_date bounds when dates are set', () => {
    const { sql, params } = applyFilters(EXCEPTION_RATE_SQL, {
      dateStart: '2025-01-01', dateEnd: '2025-01-31',
    });
    expect(sql).toMatch(/_exceptions_f AS \(SELECT \* FROM exceptions WHERE event_date >=/);
    expect(sql).toContain('event_date <=');
    expect(sql).toContain('FROM _exceptions_f');
    expect(params).toContain('2025-01-01');
    expect(params).toContain('2025-01-31');
  });

  it('does NOT wrap exceptions when no filters apply', () => {
    const { sql, params } = applyFilters(MTTR_SQL, {});
    expect(sql).not.toContain('_exceptions_f');
    expect(params).toHaveLength(0);
  });

  it('wraps returns in a CTE with return_date bounds when dates are set', () => {
    const { sql, params } = applyFilters(RETURN_RATE_SQL, {
      dateStart: '2025-06-01', dateEnd: '2025-06-30',
    });
    expect(sql).toMatch(/_returns_f AS \(SELECT \* FROM returns WHERE return_date >=/);
    expect(sql).toContain('FROM _returns_f');
    expect(params).toContain('2025-06-01');
  });

  it('filters both shipments AND exceptions consistently under a date range', () => {
    // exception_rate: numerator (exceptions) and denominator (shipments subquery) must
    // both be scoped to the same window so the rate is meaningful.
    const { sql } = applyFilters(EXCEPTION_RATE_SQL, {
      dateStart: '2025-01-01', dateEnd: '2025-01-31',
    });
    expect(sql).toContain('_shipments_f');
    expect(sql).toContain('_exceptions_f');
    // Body of the main query should reference the CTE names, not the raw tables.
    // (The CTE bodies themselves still say "FROM shipments" / "FROM exceptions" —
    // that's how the CTE is defined.)
    expect(sql).toContain('FROM _shipments_f');
    expect(sql).toContain('FROM _exceptions_f');
  });
});

describe('applyFilters — dimension filters', () => {
  it('customer_segment becomes a subquery on customers via shipments', () => {
    const { sql, params } = applyFilters('SELECT * FROM shipments', {
      customer_segment: 'Enterprise',
    });
    expect(sql).toMatch(/customer_id IN \(SELECT customer_id FROM customers WHERE segment =/);
    expect(params).toContain('Enterprise');
  });

  it('sku_category resolves through shipment_lines for shipment-scoped metrics', () => {
    const { sql, params } = applyFilters('SELECT * FROM shipments', {
      sku_category: 'Bearings',
    });
    expect(sql).toMatch(/shipment_id IN \(SELECT DISTINCT shipment_id FROM shipment_lines WHERE sku_id IN \(SELECT sku_id FROM skus WHERE category =/);
    expect(params).toContain('Bearings');
  });

  it('supplier_tier on purchase_orders uses suppliers.tier directly', () => {
    const { sql, params } = applyFilters('SELECT * FROM purchase_orders', {
      supplier_tier: 'Strategic',
    });
    expect(sql).toMatch(/supplier_id IN \(SELECT supplier_id FROM suppliers WHERE tier =/);
    expect(params).toContain('Strategic');
  });

  it('supplier_tier on inventory_snapshots resolves through skus.primary_supplier_id', () => {
    const { sql, params } = applyFilters('SELECT * FROM inventory_snapshots', {
      supplier_tier: 'Strategic',
    });
    expect(sql).toMatch(/sku_id IN \(SELECT sku_id FROM skus WHERE primary_supplier_id IN \(SELECT supplier_id FROM suppliers WHERE tier =/);
    expect(params).toContain('Strategic');
  });
});

describe('applyFilters — cross-filtering exceptions by shipment/PO dimensions', () => {
  it('restricts exceptions to those linked to the filtered shipments when a non-date shipments dimension is active', () => {
    const { sql } = applyFilters(EXCEPTION_RATE_SQL, {
      destination_region: 'EMEA',
    });
    expect(sql).toContain('_shipments_f');
    expect(sql).toContain('_exceptions_f');
    expect(sql).toContain('shipment_id IN (SELECT shipment_id FROM _shipments_f)');
  });

  it('does NOT cross-filter exceptions when only a date filter is active', () => {
    const { sql } = applyFilters(EXCEPTION_RATE_SQL, {
      dateStart: '2025-01-01', dateEnd: '2025-01-31',
    });
    expect(sql).toContain('_exceptions_f');
    // No shipment_id cross-filter — exceptions filtered by event_date alone.
    expect(sql).not.toContain('shipment_id IN (SELECT shipment_id FROM _shipments_f)');
  });

  it('cross-filters exceptions by both shipment AND PO when both have dim filters (OR-joined)', () => {
    const sql_in = `SELECT COUNT(*) FROM exceptions e JOIN shipments s ON s.shipment_id = e.shipment_id JOIN purchase_orders p ON p.po_id = e.po_id`;
    const { sql } = applyFilters(sql_in, {
      warehouse_id: 'WH-EMEA-02',
    });
    expect(sql).toContain('_shipments_f');
    expect(sql).toContain('_po_f');
    expect(sql).toMatch(/shipment_id IN \(SELECT shipment_id FROM _shipments_f\) OR po_id IN \(SELECT po_id FROM _po_f\)/);
  });
});

describe('applyFilters — returns cross-filtering', () => {
  it('cross-filters returns by shipment_id when a non-date dimension is active', () => {
    const { sql } = applyFilters(RETURN_RATE_SQL, {
      destination_region: 'NA',
    });
    expect(sql).toContain('_returns_f');
    expect(sql).toContain('shipment_id IN (SELECT shipment_id FROM _shipments_f)');
  });

  it('applies customer_segment directly on returns.customer_id (no shipment join required)', () => {
    const { sql, params } = applyFilters(RETURN_RATE_SQL, {
      customer_segment: 'Enterprise',
    });
    expect(sql).toContain('_returns_f');
    expect(sql).toMatch(/customer_id IN \(SELECT customer_id FROM customers WHERE segment =/);
    expect(params).toContain('Enterprise');
  });
});

describe('applyFilters — backwards compatibility', () => {
  it('handles a metric with no relevant tables (empty CTE list)', () => {
    const { sql, params } = applyFilters('SELECT 1 AS value', {
      dateStart: '2025-01-01', dateEnd: '2025-01-31',
    });
    expect(sql).toBe('SELECT 1 AS value');
    expect(params).toHaveLength(0);
  });

  it('preserves a leading WITH clause from the original SQL', () => {
    const sql_in = `WITH cte AS (SELECT 1) SELECT * FROM shipments, cte`;
    const { sql } = applyFilters(sql_in, { destination_region: 'NA' });
    expect(sql).toMatch(/^WITH _shipments_f AS \(SELECT \* FROM shipments WHERE destination_region = \$\d+\), cte AS/);
  });

  it('returns the original SQL unchanged when filters is undefined', () => {
    const { sql, params } = applyFilters(EXCEPTION_RATE_SQL, undefined);
    expect(sql).toBe(EXCEPTION_RATE_SQL);
    expect(params).toEqual([]);
  });
});
