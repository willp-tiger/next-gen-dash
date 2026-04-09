import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import metricsRouter from '../server/src/routes/metrics.js';
import dashboardRouter from '../server/src/routes/dashboard.js';
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
    userPrompt: 'I care about wait times',
    interpretation: {
      summary: 'Focus on wait times',
      priorities: [{ label: 'Wait Time', weight: 1, reasoning: 'Mentioned explicitly' }],
    },
    metrics: [
      {
        id: 'avg_wait_time', label: 'Avg Wait Time', unit: 'minutes',
        chartType: 'line', size: 'lg',
        thresholds: { green: { max: 3 }, yellow: { max: 5 }, direction: 'lower-is-better' },
        position: 0, visible: true,
      },
      {
        id: 'queue_depth', label: 'Queue Depth', unit: 'count',
        chartType: 'bar', size: 'md',
        thresholds: { green: { max: 10 }, yellow: { max: 20 }, direction: 'lower-is-better' },
        position: 1, visible: true,
      },
    ],
    layout: { columns: 3, showCanonicalToggle: true },
  };
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api/metrics', metricsRouter);
  app.use('/api/dashboard', dashboardRouter);
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

// === METRICS ROUTES ===

describe('GET /api/metrics', () => {
  it('returns all 12 metrics', async () => {
    const res = await fetch(`${baseUrl}/api/metrics`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.timestamp).toBeTruthy();
    expect(Object.keys(data.metrics)).toHaveLength(12);
  });

  it('filters by metricIds query param', async () => {
    const res = await fetch(`${baseUrl}/api/metrics?metricIds=avg_wait_time,queue_depth`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Object.keys(data.metrics)).toHaveLength(2);
    expect(data.metrics['avg_wait_time']).toBeDefined();
    expect(data.metrics['queue_depth']).toBeDefined();
  });

  it('returns valid metric values with trend arrays', async () => {
    const res = await fetch(`${baseUrl}/api/metrics?metricIds=avg_wait_time`);
    const data = await res.json();
    const metric = data.metrics['avg_wait_time'];
    expect(metric.current).toBeTypeOf('number');
    expect(metric.delta).toBeTypeOf('number');
    expect(metric.trend).toHaveLength(24);
  });
});

describe('GET /api/metrics/canonical', () => {
  it('returns canonical config and snapshot', async () => {
    const res = await fetch(`${baseUrl}/api/metrics/canonical`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.config).toBeDefined();
    expect(data.config.userId).toBe('canonical');
    expect(data.config.metrics).toHaveLength(12);

    expect(data.snapshot).toBeDefined();
    expect(Object.keys(data.snapshot.metrics)).toHaveLength(12);
  });
});

// === DASHBOARD ROUTES ===

describe('GET /api/dashboard/:userId', () => {
  it('returns 404 for unknown user', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/nonexistent-${Date.now()}`);
    expect(res.status).toBe(404);
  });

  it('returns stored config for known user', async () => {
    const userId = `test-dash-get-${Date.now()}`;
    setConfig(userId, makeConfig(userId));

    const res = await fetch(`${baseUrl}/api/dashboard/${userId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config.userId).toBe(userId);
    expect(data.config.metrics).toHaveLength(2);
  });
});

describe('PUT /api/dashboard/:userId', () => {
  it('returns 404 for unknown user', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/nonexistent-${Date.now()}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPrompt: 'updated' }),
    });
    expect(res.status).toBe(404);
  });

  it('updates an existing config', async () => {
    const userId = `test-dash-put-${Date.now()}`;
    setConfig(userId, makeConfig(userId));

    const res = await fetch(`${baseUrl}/api/dashboard/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPrompt: 'updated priorities' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config.userPrompt).toBe('updated priorities');
    expect(data.config.updatedAt).toBeTruthy();
  });
});

// === REFINEMENT ROUTES ===

describe('POST /api/refinement/log', () => {
  it('accepts a valid interaction event', async () => {
    const res = await fetch(`${baseUrl}/api/refinement/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'refine-test-user',
        metricId: 'avg_wait_time',
        action: 'click',
        timestamp: new Date().toISOString(),
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.totalEvents).toBeGreaterThanOrEqual(1);
  });

  it('rejects event missing required fields', async () => {
    const res = await fetch(`${baseUrl}/api/refinement/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'test' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/refinement/suggestions/:userId', () => {
  it('returns empty suggestions for user with no interactions', async () => {
    const res = await fetch(`${baseUrl}/api/refinement/suggestions/no-activity-${Date.now()}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.suggestions).toEqual([]);
    expect(data.totalInteractions).toBe(0);
  });

  it('suggests adding a metric after 4+ interactions with it', async () => {
    const userId = `suggest-add-${Date.now()}`;
    // Create a dashboard config that does NOT include escalation_rate
    setConfig(userId, makeConfig(userId));

    // Log 4 interactions with escalation_rate (not on dashboard)
    for (let i = 0; i < 4; i++) {
      await fetch(`${baseUrl}/api/refinement/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          metricId: 'escalation_rate',
          action: 'click',
          timestamp: new Date().toISOString(),
        }),
      });
    }

    const res = await fetch(`${baseUrl}/api/refinement/suggestions/${userId}`);
    const data = await res.json();
    const addSuggestion = data.suggestions.find(
      (s: { type: string; metricId: string }) =>
        s.type === 'add_metric' && s.metricId === 'escalation_rate'
    );
    expect(addSuggestion).toBeDefined();
    expect(addSuggestion.status).toBe('pending');
  });

  it('suggests removing unused metrics after 10+ total interactions', async () => {
    const userId = `suggest-remove-${Date.now()}`;
    setConfig(userId, makeConfig(userId));

    // Log 11 interactions, all with avg_wait_time (queue_depth gets 0 interactions)
    for (let i = 0; i < 11; i++) {
      await fetch(`${baseUrl}/api/refinement/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          metricId: 'avg_wait_time',
          action: 'click',
          timestamp: new Date().toISOString(),
        }),
      });
    }

    const res = await fetch(`${baseUrl}/api/refinement/suggestions/${userId}`);
    const data = await res.json();
    const removeSuggestion = data.suggestions.find(
      (s: { type: string; metricId: string }) =>
        s.type === 'remove_metric' && s.metricId === 'queue_depth'
    );
    expect(removeSuggestion).toBeDefined();
  });
});
