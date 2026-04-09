import { describe, it, expect } from 'vitest';
import { getConfig, setConfig } from '../server/src/services/configStore.js';
import type { DashboardConfig } from '../shared/types.js';

function makeConfig(userId: string): DashboardConfig {
  return {
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userPrompt: 'test prompt',
    interpretation: {
      summary: 'Test summary',
      priorities: [{ label: 'Test', weight: 1, reasoning: 'Test' }],
    },
    metrics: [
      {
        id: 'avg_wait_time',
        label: 'Avg Wait Time',
        unit: 'minutes',
        chartType: 'line',
        size: 'lg',
        thresholds: { green: { max: 3 }, yellow: { max: 5 }, direction: 'lower-is-better' },
        position: 0,
        visible: true,
      },
    ],
    layout: { columns: 3, showCanonicalToggle: true },
  };
}

describe('Config Store', () => {
  it('returns undefined for unknown userId', () => {
    expect(getConfig('nonexistent-user-' + Date.now())).toBeUndefined();
  });

  it('stores and retrieves a config', () => {
    const id = 'test-user-' + Date.now();
    const config = makeConfig(id);
    setConfig(id, config);
    expect(getConfig(id)).toEqual(config);
  });

  it('overwrites config on repeated set', () => {
    const id = 'overwrite-user-' + Date.now();
    const config1 = makeConfig(id);
    setConfig(id, config1);

    const config2 = { ...config1, userPrompt: 'updated prompt' };
    setConfig(id, config2);

    expect(getConfig(id)?.userPrompt).toBe('updated prompt');
  });

  it('stores configs for different users independently', () => {
    const id1 = 'user-a-' + Date.now();
    const id2 = 'user-b-' + Date.now();
    setConfig(id1, makeConfig(id1));
    setConfig(id2, makeConfig(id2));

    expect(getConfig(id1)?.userId).toBe(id1);
    expect(getConfig(id2)?.userId).toBe(id2);
  });
});
