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
      expect(AVAILABLE_METRICS).toContain('avg_wait_time');
      expect(AVAILABLE_METRICS).toContain('sla_compliance');
      expect(AVAILABLE_METRICS).toContain('queue_depth');
      expect(AVAILABLE_METRICS).toContain('staffing_ratio');
      expect(AVAILABLE_METRICS).toContain('escalation_rate');
      expect(AVAILABLE_METRICS).toContain('cost_per_ticket');
      expect(AVAILABLE_METRICS).toContain('csat_score');
    });

    it('all IDs are snake_case strings', () => {
      for (const id of AVAILABLE_METRICS) {
        expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    });
  });
});
