import { describe, it, expect } from 'vitest';
import { shiftFiltersForComparison } from '../server/src/services/salesData.js';
import { getAnnotations } from '../server/src/services/widgets.js';

describe('shiftFiltersForComparison', () => {
  it('returns null when no date range is set', () => {
    expect(shiftFiltersForComparison(undefined, 'prior_period')).toBeNull();
    expect(shiftFiltersForComparison({ dateStart: '2025-01-01' }, 'prior_period')).toBeNull();
    expect(shiftFiltersForComparison({ dateEnd: '2025-01-31' }, 'prior_period')).toBeNull();
  });

  it('shifts a 7-day window back by 7 days for prior_period', () => {
    const result = shiftFiltersForComparison(
      { dateStart: '2025-01-15', dateEnd: '2025-01-21' },
      'prior_period'
    );
    expect(result).not.toBeNull();
    expect(result!.filters.dateStart).toBe('2025-01-08');
    expect(result!.filters.dateEnd).toBe('2025-01-14');
    expect(result!.basisLabel).toMatch(/prior period/i);
  });

  it('shifts a month-long window by one year for prior_year', () => {
    const result = shiftFiltersForComparison(
      { dateStart: '2025-10-01', dateEnd: '2025-10-31' },
      'prior_year'
    );
    expect(result).not.toBeNull();
    expect(result!.filters.dateStart).toBe('2024-10-01');
    expect(result!.filters.dateEnd).toBe('2024-10-31');
    expect(result!.basisLabel).toMatch(/prior year/i);
  });

  it('forces compareTo=none on the shifted filters to prevent recursion', () => {
    const result = shiftFiltersForComparison(
      { dateStart: '2025-01-01', dateEnd: '2025-01-31', compareTo: 'prior_period' },
      'prior_period'
    );
    expect(result!.filters.compareTo).toBe('none');
  });

  it('preserves non-date filters when shifting', () => {
    const result = shiftFiltersForComparison(
      {
        dateStart: '2025-01-01', dateEnd: '2025-01-31',
        destination_region: 'EMEA', warehouse_id: 'WH-EMEA-02',
      },
      'prior_period'
    );
    expect(result!.filters.destination_region).toBe('EMEA');
    expect(result!.filters.warehouse_id).toBe('WH-EMEA-02');
  });
});

describe('getAnnotations', () => {
  it('emits the four seeded narrative anomalies', () => {
    const ann = getAnnotations();
    const ids = ann.map(a => a.id);
    expect(ids).toContain('apac-port-congestion');
    expect(ids).toContain('sup-0042-otd-decline');
    expect(ids).toContain('emea-logistics-incident');
    expect(ids).toContain('cutting-tools-phase-out');
  });

  it('all annotations have ISO date strings', () => {
    for (const a of getAnnotations()) {
      expect(a.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (a.endDate) expect(a.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('APAC port congestion is a Nov 8 → Nov 22 window', () => {
    const a = getAnnotations().find(x => x.id === 'apac-port-congestion');
    expect(a).toBeDefined();
    expect(a!.date.endsWith('-11-08')).toBe(true);
    expect(a!.endDate!.endsWith('-11-22')).toBe(true);
  });

  it('EMEA incident is a single-day event on May 6', () => {
    const a = getAnnotations().find(x => x.id === 'emea-logistics-incident');
    expect(a).toBeDefined();
    expect(a!.date.endsWith('-05-06')).toBe(true);
    expect(a!.endDate).toBeUndefined();
  });

  it('every annotation declares severity', () => {
    for (const a of getAnnotations()) {
      expect(['info', 'warning', 'critical']).toContain(a.severity);
    }
  });
});
