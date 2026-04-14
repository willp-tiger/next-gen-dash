import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';

// --- Mock @anthropic-ai/sdk so we can control Claude's reply per test ---
// The dashboardChat route instantiates `new Anthropic()` at module load and
// calls `client.messages.create(...)`. We hoist a shared mock fn we can
// rewire each test.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { create: mockCreate };
  }
  return { default: Anthropic };
});

// Imports that depend on the mock must come AFTER vi.mock
const { default: dashboardChatRouter } = await import('../server/src/routes/dashboardChat.js');
const { default: dashboardRouter } = await import('../server/src/routes/dashboard.js');
const { getPersonaConfigs } = await import('../server/src/services/salesData.js');
const { getConfig } = await import('../server/src/services/configStore.js');

let app: express.Express;
let server: Server;
let baseUrl: string;

function claudeReply(text: string) {
  return {
    content: [{ type: 'text', text }],
  };
}

async function chat(userId: string, message: string) {
  const res = await fetch(`${baseUrl}/api/dashboard-chat/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function adoptPersona(userId: string, personaKey: 'sales-rep' | 'director' | 'executive') {
  const personas = getPersonaConfigs();
  const persona = personas[personaKey];
  const now = new Date().toISOString();
  const adopted = { ...persona, userId, createdAt: now, updatedAt: now };
  const res = await fetch(`${baseUrl}/api/dashboard/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(adopted),
  });
  expect(res.status).toBe(200);
  return (await res.json()).config;
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/dashboard-chat', dashboardChatRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

afterAll(() => { server?.close(); });

beforeEach(() => { mockCreate.mockReset(); });

// --- Regression: persona adoption writes server config, unblocking chat ---

describe('Persona adoption → dashboard chat', () => {
  it('returns 404 when chatting before a persona has been adopted', async () => {
    mockCreate.mockResolvedValue(claudeReply('{"message":"ok"}'));
    const res = await chat(`fresh-${Date.now()}`, 'hi');
    expect(res.status).toBe(404);
  });

  it('persona PUT stores the config under the session userId', async () => {
    const userId = `sales-rep-${Date.now()}`;
    await adoptPersona(userId, 'sales-rep');
    const stored = getConfig(userId);
    expect(stored).toBeDefined();
    expect(stored!.userId).toBe(userId);
    expect(stored!.metrics.length).toBeGreaterThan(0);
  });

  it('chat succeeds immediately after persona adoption (regression for 404 bug)', async () => {
    const userId = `director-${Date.now()}`;
    await adoptPersona(userId, 'director');
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: 'Your fulfillment rate gauge tracks on-time shipments.',
    })));
    const res = await chat(userId, 'what does fulfillment rate mean?');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/fulfillment/i);
    expect(res.body.action).toBeNull();
  });
});

// --- Chat actions mutate the persona-adopted config ---

describe('Chat actions on a persona dashboard', () => {
  it('add action inserts a new metric and persists via configStore', async () => {
    const userId = `add-${Date.now()}`;
    await adoptPersona(userId, 'sales-rep');
    const before = getConfig(userId)!.metrics.length;
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: "I've added Fulfillment Rate as a gauge.",
      action: 'add',
      metric: {
        id: 'fulfillment_rate',
        label: 'Fulfillment Rate',
        unit: 'percent',
        chartType: 'gauge',
        size: 'md',
        thresholds: { green: { max: 95 }, yellow: { max: 85 }, direction: 'higher-is-better' },
        visible: true,
      },
    })));
    const res = await chat(userId, 'add a gauge for fulfillment rate');
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('add');
    const after = getConfig(userId)!;
    expect(after.metrics).toHaveLength(before + 1);
    const added = after.metrics.find((m) => m.id === 'fulfillment_rate' && m.chartType === 'gauge');
    expect(added).toBeDefined();
    expect(added!.position).toBe(before);
  });

  it('add action rejects duplicate non-breakdown metric', async () => {
    const userId = `dup-${Date.now()}`;
    await adoptPersona(userId, 'sales-rep');
    const before = getConfig(userId)!.metrics.length;
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: 'added',
      action: 'add',
      metric: {
        id: 'total_revenue', // already in sales-rep persona
        label: 'Total Revenue', unit: 'dollars',
        chartType: 'line', size: 'lg',
        thresholds: { green: { max: 300000 }, yellow: { max: 200000 }, direction: 'higher-is-better' },
        visible: true,
      },
    })));
    const res = await chat(userId, 'add total revenue');
    expect(res.status).toBe(200);
    const after = getConfig(userId)!;
    expect(after.metrics).toHaveLength(before); // unchanged
  });

  it('add action allows two breakdown charts on the same metric with different dimensions', async () => {
    const userId = `breakdown-${Date.now()}`;
    await adoptPersona(userId, 'director');
    const mkBreakdown = (dim: string) => ({
      message: `Breakdown by ${dim}`,
      action: 'add',
      metric: {
        id: 'total_revenue', label: `Revenue by ${dim}`, unit: 'dollars',
        chartType: 'breakdown', size: 'lg',
        thresholds: { green: { max: 0 }, yellow: { max: 0 }, direction: 'lower-is-better' },
        visible: true,
        breakdownBy: dim,
      },
    });
    mockCreate.mockResolvedValueOnce(claudeReply(JSON.stringify(mkBreakdown('product_line'))));
    await chat(userId, 'break down revenue by product line');
    mockCreate.mockResolvedValueOnce(claudeReply(JSON.stringify(mkBreakdown('territory'))));
    await chat(userId, 'now break it down by territory too');
    const cfg = getConfig(userId)!;
    const breakdowns = cfg.metrics.filter((m) => m.chartType === 'breakdown' && m.id === 'total_revenue');
    expect(breakdowns).toHaveLength(2);
    expect(breakdowns.map((b) => b.breakdownBy).sort()).toEqual(['product_line', 'territory']);
  });

  it('filter action writes globalFilters and drops null keys', async () => {
    const userId = `filter-${Date.now()}`;
    await adoptPersona(userId, 'sales-rep');
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: 'Filtered to Classic Cars.',
      action: 'filter',
      filterBy: {
        product_line: 'Classic Cars',
        country: null,
        territory: null,
        deal_size: null,
      },
    })));
    const res = await chat(userId, 'filter to classic cars');
    expect(res.status).toBe(200);
    const cfg = getConfig(userId)!;
    expect(cfg.globalFilters).toEqual({ product_line: 'Classic Cars' });
  });

  it('filter action writes date range in addition to categorical filters', async () => {
    const userId = `date-filter-${Date.now()}`;
    await adoptPersona(userId, 'director');
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: 'Filtered to Classic Cars in Q1 2004.',
      action: 'filter',
      filterBy: {
        product_line: 'Classic Cars',
        dateStart: '2004-01-01',
        dateEnd: '2004-03-31',
        country: null,
        territory: null,
        deal_size: null,
      },
    })));
    const res = await chat(userId, 'filter to classic cars in q1 2004');
    expect(res.status).toBe(200);
    const cfg = getConfig(userId)!;
    expect(cfg.globalFilters).toEqual({
      product_line: 'Classic Cars',
      dateStart: '2004-01-01',
      dateEnd: '2004-03-31',
    });
  });

  it('filter action with {clear:true} empties globalFilters', async () => {
    const userId = `clear-${Date.now()}`;
    await adoptPersona(userId, 'director');

    // First apply a filter
    mockCreate.mockResolvedValueOnce(claudeReply(JSON.stringify({
      message: 'Filtered.', action: 'filter',
      filterBy: { product_line: 'Planes', dateStart: '2004-01-01', dateEnd: '2004-12-31' },
    })));
    await chat(userId, 'filter to planes in 2004');
    expect(getConfig(userId)!.globalFilters).toMatchObject({ product_line: 'Planes' });

    // Then clear
    mockCreate.mockResolvedValueOnce(claudeReply(JSON.stringify({
      message: 'Cleared filters.', action: 'filter', clear: true,
    })));
    const res = await chat(userId, 'clear all filters');
    expect(res.status).toBe(200);
    const cfg = getConfig(userId)!;
    expect(cfg.globalFilters).toEqual({});
  });

  it('remove action deletes the metric and reindexes positions', async () => {
    const userId = `remove-${Date.now()}`;
    await adoptPersona(userId, 'sales-rep');
    const before = getConfig(userId)!.metrics.map((m) => m.id);
    const target = before[1]; // remove the second metric
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: 'Removed.', action: 'remove', metricId: target,
    })));
    const res = await chat(userId, `remove ${target}`);
    expect(res.status).toBe(200);
    const after = getConfig(userId)!;
    expect(after.metrics.map((m) => m.id)).not.toContain(target);
    after.metrics.forEach((m, i) => expect(m.position).toBe(i));
  });

  it('edit action applies thresholds + size + label changes', async () => {
    const userId = `edit-${Date.now()}`;
    await adoptPersona(userId, 'sales-rep');
    const target = getConfig(userId)!.metrics[0].id;
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: 'Updated.', action: 'edit', metricId: target,
      changes: {
        label: 'Total Revenue (tweaked)',
        size: 'lg',
        thresholds: { green: { max: 500000 }, yellow: { max: 350000 }, direction: 'higher-is-better' },
      },
    })));
    const res = await chat(userId, `bump ${target} thresholds`);
    expect(res.status).toBe(200);
    const metric = getConfig(userId)!.metrics.find((m) => m.id === target)!;
    expect(metric.label).toBe('Total Revenue (tweaked)');
    expect(metric.size).toBe('lg');
    expect(metric.thresholds.green.max).toBe(500000);
  });
});

// --- Parser hardening (matches the fix in server/src/routes/dashboardChat.ts) ---

describe('Chat parser resilience', () => {
  it('extracts JSON even when Claude wraps it in prose', async () => {
    const userId = `prose-${Date.now()}`;
    await adoptPersona(userId, 'sales-rep');
    mockCreate.mockResolvedValue(claudeReply(
      'Sure! Here is the filter you asked for:\n\n' +
      '{"message":"Filtered.","action":"filter","filterBy":{"product_line":"Ships"}}\n\n' +
      'Let me know if you want to change it.'
    ));
    const res = await chat(userId, 'filter to ships');
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('filter');
    expect(getConfig(userId)!.globalFilters).toEqual({ product_line: 'Ships' });
  });

  it('extracts JSON from fenced code blocks', async () => {
    const userId = `fence-${Date.now()}`;
    await adoptPersona(userId, 'sales-rep');
    mockCreate.mockResolvedValue(claudeReply(
      '```json\n{"message":"ok","action":"filter","filterBy":{"territory":"EMEA"}}\n```'
    ));
    const res = await chat(userId, 'filter to EMEA');
    expect(res.status).toBe(200);
    expect(getConfig(userId)!.globalFilters).toEqual({ territory: 'EMEA' });
  });

  it('returns a friendly 200 fallback when Claude returns unparseable text', async () => {
    const userId = `unparse-${Date.now()}`;
    await adoptPersona(userId, 'sales-rep');
    mockCreate.mockResolvedValue(claudeReply(
      "I'm not sure what you mean — could you try again?"
    ));
    const res = await chat(userId, 'do the thing');
    expect(res.status).toBe(200);
    expect(res.body.action).toBeNull();
    expect(res.body.config).toBeNull();
    expect(res.body.message).toMatch(/rephrase|parse|try/i);
  });

  it('returns 500 only when the Claude SDK itself throws', async () => {
    const userId = `throw-${Date.now()}`;
    await adoptPersona(userId, 'sales-rep');
    mockCreate.mockRejectedValue(new Error('Anthropic API upstream failure'));
    const res = await chat(userId, 'add something');
    expect(res.status).toBe(500);
  });

  it('400s when message body is missing', async () => {
    const userId = `missing-${Date.now()}`;
    await adoptPersona(userId, 'sales-rep');
    const res = await fetch(`${baseUrl}/api/dashboard-chat/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
