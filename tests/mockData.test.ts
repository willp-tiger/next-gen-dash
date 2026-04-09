import { describe, it, expect } from 'vitest';
import { generateSnapshot, getCanonicalConfig, METRIC_DEFS } from '../server/src/services/mockData.js';

describe('Mock Data Service', () => {
  describe('generateSnapshot', () => {
    it('returns all 12 metrics when no filter is provided', () => {
      const snapshot = generateSnapshot();
      expect(Object.keys(snapshot.metrics)).toHaveLength(12);
      expect(snapshot.timestamp).toBeTruthy();
    });

    it('filters metrics by IDs when provided', () => {
      const snapshot = generateSnapshot(['avg_wait_time', 'queue_depth']);
      expect(Object.keys(snapshot.metrics)).toHaveLength(2);
      expect(snapshot.metrics['avg_wait_time']).toBeDefined();
      expect(snapshot.metrics['queue_depth']).toBeDefined();
      expect(snapshot.metrics['sla_compliance']).toBeUndefined();
    });

    it('returns empty metrics for unknown IDs', () => {
      const snapshot = generateSnapshot(['nonexistent_metric']);
      expect(Object.keys(snapshot.metrics)).toHaveLength(0);
    });

    it('returns a valid ISO timestamp', () => {
      const snapshot = generateSnapshot();
      const date = new Date(snapshot.timestamp);
      expect(date.toISOString()).toBe(snapshot.timestamp);
    });

    it('generates non-negative current values', () => {
      // Run multiple times since values are random
      for (let i = 0; i < 20; i++) {
        const snapshot = generateSnapshot();
        for (const [, value] of Object.entries(snapshot.metrics)) {
          expect(value.current).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('generates trend arrays with exactly 24 data points', () => {
      const snapshot = generateSnapshot();
      for (const [, value] of Object.entries(snapshot.metrics)) {
        expect(value.trend).toHaveLength(24);
      }
    });

    it('includes a numeric delta for each metric', () => {
      const snapshot = generateSnapshot();
      for (const [, value] of Object.entries(snapshot.metrics)) {
        expect(typeof value.delta).toBe('number');
        expect(Number.isFinite(value.delta)).toBe(true);
      }
    });

    it('generates different values on successive calls (randomness)', () => {
      const snap1 = generateSnapshot(['avg_wait_time']);
      const snap2 = generateSnapshot(['avg_wait_time']);
      // It's theoretically possible but extremely unlikely these are identical
      // Check trends differ (random walk shifts each call)
      const trend1 = snap1.metrics['avg_wait_time'].trend;
      const trend2 = snap2.metrics['avg_wait_time'].trend;
      const identical = trend1.every((v, i) => v === trend2[i]);
      expect(identical).toBe(false);
    });
  });

  describe('getCanonicalConfig', () => {
    it('returns a valid DashboardConfig', () => {
      const config = getCanonicalConfig();
      expect(config.userId).toBe('canonical');
      expect(config.interpretation.summary).toBeTruthy();
      expect(config.layout.columns).toBe(3);
      expect(config.layout.showCanonicalToggle).toBe(true);
    });

    it('includes all 12 metrics', () => {
      const config = getCanonicalConfig();
      expect(config.metrics).toHaveLength(12);
    });

    it('has valid thresholds for every metric', () => {
      const config = getCanonicalConfig();
      for (const metric of config.metrics) {
        expect(metric.thresholds.green.max).toBeTypeOf('number');
        expect(metric.thresholds.yellow.max).toBeTypeOf('number');
        expect(['lower-is-better', 'higher-is-better']).toContain(
          metric.thresholds.direction
        );
      }
    });

    it('has sequential positions starting from 0', () => {
      const config = getCanonicalConfig();
      const positions = config.metrics.map((m) => m.position).sort((a, b) => a - b);
      expect(positions).toEqual(Array.from({ length: 12 }, (_, i) => i));
    });

    it('all metrics are visible', () => {
      const config = getCanonicalConfig();
      expect(config.metrics.every((m) => m.visible)).toBe(true);
    });

    it('each metric has a valid chartType', () => {
      const config = getCanonicalConfig();
      const validTypes = ['number', 'line', 'bar', 'area', 'gauge'];
      for (const metric of config.metrics) {
        expect(validTypes).toContain(metric.chartType);
      }
    });
  });

  describe('METRIC_DEFS', () => {
    it('has exactly 12 definitions', () => {
      expect(METRIC_DEFS).toHaveLength(12);
    });

    it('all IDs are unique', () => {
      const ids = METRIC_DEFS.map((d) => d.id);
      expect(new Set(ids).size).toBe(12);
    });

    it('all have positive base and noise values', () => {
      for (const def of METRIC_DEFS) {
        expect(def.base).toBeGreaterThan(0);
        expect(def.noise).toBeGreaterThan(0);
      }
    });
  });
});
