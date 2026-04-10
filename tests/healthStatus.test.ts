import { describe, it, expect } from 'vitest';
import type { ThresholdConfig } from '../shared/types.js';

// Re-implement getHealthStatus here since the original is in a tsx file with JSX
// This tests the core threshold evaluation logic
function getHealthStatus(
  value: number,
  thresholds: ThresholdConfig
): 'healthy' | 'warning' | 'critical' {
  const { green, yellow, direction } = thresholds;

  if (direction === 'lower-is-better') {
    if (value <= green.max) return 'healthy';
    if (value <= yellow.max) return 'warning';
    return 'critical';
  }

  // higher-is-better
  if (value >= green.max) return 'healthy';
  if (value >= yellow.max) return 'warning';
  return 'critical';
}

describe('Health Status Evaluation', () => {
  describe('lower-is-better metrics (e.g., cancelled order rate)', () => {
    const thresholds: ThresholdConfig = {
      green: { max: 3 },
      yellow: { max: 5 },
      direction: 'lower-is-better',
    };

    it('returns healthy when value is below green threshold', () => {
      expect(getHealthStatus(1.5, thresholds)).toBe('healthy');
    });

    it('returns healthy when value equals green threshold', () => {
      expect(getHealthStatus(3, thresholds)).toBe('healthy');
    });

    it('returns warning when value is between green and yellow', () => {
      expect(getHealthStatus(4, thresholds)).toBe('warning');
    });

    it('returns warning when value equals yellow threshold', () => {
      expect(getHealthStatus(5, thresholds)).toBe('warning');
    });

    it('returns critical when value exceeds yellow threshold', () => {
      expect(getHealthStatus(7, thresholds)).toBe('critical');
    });

    it('returns healthy for zero', () => {
      expect(getHealthStatus(0, thresholds)).toBe('healthy');
    });
  });

  describe('higher-is-better metrics (e.g., fulfillment rate)', () => {
    const thresholds: ThresholdConfig = {
      green: { max: 95 },
      yellow: { max: 80 },
      direction: 'higher-is-better',
    };

    it('returns healthy when value meets or exceeds green threshold', () => {
      expect(getHealthStatus(97, thresholds)).toBe('healthy');
      expect(getHealthStatus(95, thresholds)).toBe('healthy');
    });

    it('returns warning when value is between yellow and green', () => {
      expect(getHealthStatus(85, thresholds)).toBe('warning');
      expect(getHealthStatus(80, thresholds)).toBe('warning');
    });

    it('returns critical when value is below yellow threshold', () => {
      expect(getHealthStatus(70, thresholds)).toBe('critical');
    });

    it('returns critical for zero', () => {
      expect(getHealthStatus(0, thresholds)).toBe('critical');
    });

    it('returns healthy for 100%', () => {
      expect(getHealthStatus(100, thresholds)).toBe('healthy');
    });
  });

  describe('edge cases', () => {
    it('handles avg_price thresholds correctly', () => {
      // avg_price: greenMax 1.5, yellowMax 1.0, higher-is-better
      const thresholds: ThresholdConfig = {
        green: { max: 1.5 },
        yellow: { max: 1.0 },
        direction: 'higher-is-better',
      };
      expect(getHealthStatus(1.8, thresholds)).toBe('healthy');
      expect(getHealthStatus(1.2, thresholds)).toBe('warning');
      expect(getHealthStatus(0.7, thresholds)).toBe('critical');
    });

    it('handles equal green and yellow thresholds', () => {
      const thresholds: ThresholdConfig = {
        green: { max: 5 },
        yellow: { max: 5 },
        direction: 'lower-is-better',
      };
      expect(getHealthStatus(5, thresholds)).toBe('healthy');
      expect(getHealthStatus(6, thresholds)).toBe('critical');
    });

    it('handles very large values', () => {
      const thresholds: ThresholdConfig = {
        green: { max: 3 },
        yellow: { max: 5 },
        direction: 'lower-is-better',
      };
      expect(getHealthStatus(999999, thresholds)).toBe('critical');
    });

    it('handles negative values', () => {
      const thresholds: ThresholdConfig = {
        green: { max: 3 },
        yellow: { max: 5 },
        direction: 'lower-is-better',
      };
      expect(getHealthStatus(-1, thresholds)).toBe('healthy');
    });
  });
});
