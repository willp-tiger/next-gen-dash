import { describe, it, expect, vi } from 'vitest';

// buildBulletSnapshot relies on the cached KPI defs loaded from Postgres at server boot.
// In tests we don't have a DB connection, so stub the store with the two metrics we exercise.
vi.mock('../server/src/services/kpiDefinitionStore.js', () => ({
  getMetricDefs: () => [
    {
      id: 'otif_rate', label: 'OTIF Rate', unit: 'percent', chartType: 'gauge',
      direction: 'higher-is-better', greenMax: 95, yellowMax: 85, sql: '', trendSql: '',
    },
    {
      id: 'exception_rate', label: 'Exception Rate', unit: 'percent', chartType: 'bar',
      direction: 'lower-is-better', greenMax: 6, yellowMax: 12, sql: '', trendSql: '',
    },
  ],
}));

const { buildBulletSnapshot } = await import('../server/src/services/widgets.js');

// buildBulletSnapshot is the only one of the new widget functions that doesn't hit Postgres,
// so it's the only one we can unit-test directly. The waterfall and top-N math is exercised
// through manual API verification in scripts/_inspect_out.

describe('buildBulletSnapshot — bands derived from KPI thresholds', () => {
  it('throws on unknown metric id', () => {
    expect(() => buildBulletSnapshot('does_not_exist', 50)).toThrow(/Unknown metric/);
  });

  it('orders bands as critical → warning → healthy for higher-is-better metrics', () => {
    // otif_rate is higher-is-better with greenMax=95, yellowMax=85.
    const snap = buildBulletSnapshot('otif_rate', 92);
    expect(snap.direction).toBe('higher-is-better');
    expect(snap.target).toBe(95);
    expect(snap.bands.map(b => b.color)).toEqual(['critical', 'warning', 'healthy']);
    // Bands ascend by max — last band's max is the chart edge.
    const maxes = snap.bands.map(b => b.max);
    for (let i = 1; i < maxes.length; i++) {
      expect(maxes[i]).toBeGreaterThan(maxes[i - 1]);
    }
  });

  it('orders bands as healthy → warning → critical for lower-is-better metrics', () => {
    // exception_rate is lower-is-better with greenMax=6, yellowMax=12.
    const snap = buildBulletSnapshot('exception_rate', 8);
    expect(snap.direction).toBe('lower-is-better');
    expect(snap.target).toBe(6);
    expect(snap.bands.map(b => b.color)).toEqual(['healthy', 'warning', 'critical']);
    const maxes = snap.bands.map(b => b.max);
    for (let i = 1; i < maxes.length; i++) {
      expect(maxes[i]).toBeGreaterThan(maxes[i - 1]);
    }
  });

  it('expands the chart max above the actual value so the actual bar fits', () => {
    // Force an extreme actual value to make sure chart max grows accordingly.
    const snap = buildBulletSnapshot('otif_rate', 200);
    const chartMax = snap.bands[snap.bands.length - 1].max;
    expect(chartMax).toBeGreaterThanOrEqual(200);
  });

  it('rounds actual to two decimals', () => {
    const snap = buildBulletSnapshot('otif_rate', 87.6789);
    expect(snap.actual).toBe(87.68);
  });
});
