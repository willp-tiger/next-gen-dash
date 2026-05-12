import { describe, it, expect } from 'vitest';
import { AVAILABLE_METRICS } from '../shared/types.js';

describe('Shared Types', () => {
  describe('AVAILABLE_METRICS', () => {
    it('contains the full Meridian supply chain KPI library', () => {
      // Library spans Fulfillment / Inventory / Procurement / Logistics / Operations.
      expect(AVAILABLE_METRICS.length).toBeGreaterThanOrEqual(20);
    });

    it('all IDs are unique', () => {
      expect(new Set(AVAILABLE_METRICS).size).toBe(AVAILABLE_METRICS.length);
    });

    it('contains the tier-1 supply chain KPIs', () => {
      expect(AVAILABLE_METRICS).toContain('otif_rate');
      expect(AVAILABLE_METRICS).toContain('perfect_order_rate');
      expect(AVAILABLE_METRICS).toContain('inventory_turns');
      expect(AVAILABLE_METRICS).toContain('stockout_rate');
      expect(AVAILABLE_METRICS).toContain('supplier_otd');
      expect(AVAILABLE_METRICS).toContain('carrier_otd');
      expect(AVAILABLE_METRICS).toContain('exception_rate');
    });

    it('all IDs are snake_case strings', () => {
      for (const id of AVAILABLE_METRICS) {
        expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });
  });
});
