import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import refinementRouter from '../server/src/routes/refinement.js';
import { setConfig } from '../server/src/services/configStore.js';
import type { DashboardConfig } from '../shared/types.js';

let app: express.Express;
let server: Server;
let baseUrl: string;

function makeConfig(userId: string): DashboardConfig {
  return {
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userPrompt: 'test',
    interpretation: {
      summary: 'Test',
      priorities: [{ label: 'Test', weight: 1, reasoning: 'Test' }],
    },
    metrics: [
      {
        id: 'otif_rate', label: 'OTIF Rate', unit: 'percent',
        chartType: 'gauge', size: 'lg',
        thresholds: { green: { max: 95 }, yellow: { max: 85 }, direction: 'higher-is-better' },
        position: 0, visible: true,
      },
      {
        id: 'order_cycle_time', label: 'Order Cycle Time', unit: 'days',
        chartType: 'line', size: 'md',
        thresholds: { green: { max: 7 }, yellow: { max: 10 }, direction: 'lower-is-better' },
        position: 1, visible: true,
      },
    ],
    layout: { columns: 3, showCanonicalToggle: true },
  };
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api/refinement', refinementRouter);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

// === PUT /api/refinement/suggestions/:id ===

describe('PUT /api/refinement/suggestions/:id', () => {
  it('accepts a valid dismiss request', async () => {
    const res = await fetch(`${baseUrl}/api/refinement/suggestions/test-id-1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'dismissed',
        userId: 'put-test-user',
        type: 'add_metric',
        metricId: 'supplier_otd',
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe('test-id-1');
    expect(data.status).toBe('dismissed');
  });

  it('accepts a valid accept request', async () => {
    const res = await fetch(`${baseUrl}/api/refinement/suggestions/test-id-2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'accepted',
        userId: 'put-test-user',
        type: 'add_metric',
        metricId: 'stockout_rate',
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('accepted');
  });

  it('rejects invalid status value', async () => {
    const res = await fetch(`${baseUrl}/api/refinement/suggestions/test-id-3`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'invalid' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects request with missing status', async () => {
    const res = await fetch(`${baseUrl}/api/refinement/suggestions/test-id-4`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

// === Dismissed suggestions should not reappear ===

describe('Suggestion Persistence', () => {
  it('dismissed suggestions do not reappear on subsequent polls', async () => {
    const userId = `persist-dismiss-${Date.now()}`;
    setConfig(userId, makeConfig(userId));

    // Generate 4 interactions with cancelled_order_rate to trigger add_metric suggestion
    for (let i = 0; i < 4; i++) {
      await fetch(`${baseUrl}/api/refinement/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          metricId: 'stockout_rate',
          action: 'click',
          timestamp: new Date().toISOString(),
        }),
      });
    }

    // First poll: should have the suggestion
    const res1 = await fetch(`${baseUrl}/api/refinement/suggestions/${userId}`);
    const data1 = await res1.json();
    const suggestion = data1.suggestions.find(
      (s: any) => s.type === 'add_metric' && s.metricId === 'stockout_rate'
    );
    expect(suggestion).toBeDefined();

    // Dismiss it
    await fetch(`${baseUrl}/api/refinement/suggestions/${suggestion.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'dismissed',
        userId,
        type: 'add_metric',
        metricId: 'stockout_rate',
      }),
    });

    // Second poll: should NOT have the dismissed suggestion
    const res2 = await fetch(`${baseUrl}/api/refinement/suggestions/${userId}`);
    const data2 = await res2.json();
    const dismissed = data2.suggestions.find(
      (s: any) => s.type === 'add_metric' && s.metricId === 'stockout_rate'
    );
    expect(dismissed).toBeUndefined();
  });
});
