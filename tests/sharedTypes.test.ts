import { describe, it, expect } from 'vitest';
import { AVAILABLE_METRICS } from '../shared/types.js';

describe('Shared Types', () => {
  describe('AVAILABLE_METRICS', () => {
    it('contains exactly 12 metric IDs', () => {
      expect(AVAILABLE_METRICS).toHaveLength(12);
    });

    it('all IDs are unique', () => {
      expect(new Set(AVAILABLE_METRICS).size).toBe(12);
    });

    it('contains expected core metrics', () => {
      expect(AVAILABLE_METRICS).toContain('total_revenue');
      expect(AVAILABLE_METRICS).toContain('avg_order_value');
      expect(AVAILABLE_METRICS).toContain('total_orders');
      expect(AVAILABLE_METRICS).toContain('units_sold');
      expect(AVAILABLE_METRICS).toContain('fulfillment_rate');
      expect(AVAILABLE_METRICS).toContain('cancelled_order_rate');
      expect(AVAILABLE_METRICS).toContain('avg_deal_size_value');
    });

    it('all IDs are snake_case strings', () => {
      for (const id of AVAILABLE_METRICS) {
        expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });
  });
});
