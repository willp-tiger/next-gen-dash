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

async function adoptPersona(userId: string, personaKey: 'csco' | 'warehouse-director' | 'procurement-lead') {
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
    await adoptPersona(userId, 'csco');
    const stored = getConfig(userId);
    expect(stored).toBeDefined();
    expect(stored!.userId).toBe(userId);
    expect(stored!.metrics.length).toBeGreaterThan(0);
  });

  it('chat succeeds immediately after persona adoption (regression for 404 bug)', async () => {
    const userId = `director-${Date.now()}`;
    await adoptPersona(userId, 'warehouse-director');
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: 'Your OTIF gauge tracks on-time in-full delivery rate.',
    })));
    const res = await chat(userId, 'what does OTIF mean?');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/OTIF/i);
    expect(res.body.action).toBeNull();
  });
});

// --- Chat actions mutate the persona-adopted config ---

describe('Chat actions on a persona dashboard', () => {
  it('add action inserts a new metric and persists via configStore', async () => {
    const userId = `add-${Date.now()}`;
    await adoptPersona(userId, 'csco');
    const before = getConfig(userId)!.metrics.length;
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: "I've added Damage Rate as a gauge.",
      action: 'add',
      metric: {
        id: 'damage_rate',
        label: 'Damage Rate',
        unit: 'percent',
        chartType: 'gauge',
        size: 'md',
        thresholds: { green: { max: 1 }, yellow: { max: 3 }, direction: 'lower-is-better' },
        visible: true,
      },
    })));
    const res = await chat(userId, 'add a gauge for damage rate');
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('add');
    const after = getConfig(userId)!;
    expect(after.metrics).toHaveLength(before + 1);
    const added = after.metrics.find((m) => m.id === 'damage_rate' && m.chartType === 'gauge');
    expect(added).toBeDefined();
    expect(added!.position).toBe(before);
  });

  it('add action rejects duplicate non-breakdown metric', async () => {
    const userId = `dup-${Date.now()}`;
    await adoptPersona(userId, 'csco');
    const before = getConfig(userId)!.metrics.length;
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: 'added',
      action: 'add',
      metric: {
        id: 'otif_rate', // already in csco persona
        label: 'OTIF Rate', unit: 'percent',
        chartType: 'gauge', size: 'lg',
        thresholds: { green: { max: 95 }, yellow: { max: 85 }, direction: 'higher-is-better' },
        visible: true,
      },
    })));
    const res = await chat(userId, 'add OTIF rate');
    expect(res.status).toBe(200);
    const after = getConfig(userId)!;
    expect(after.metrics).toHaveLength(before); // unchanged
  });

  it('add action allows two breakdown charts on the same metric with different dimensions', async () => {
    const userId = `breakdown-${Date.now()}`;
    await adoptPersona(userId, 'warehouse-director');
    const mkBreakdown = (dim: string) => ({
      message: `Breakdown by ${dim}`,
      action: 'add',
      metric: {
        id: 'otif_rate', label: `OTIF by ${dim}`, unit: 'percent',
        chartType: 'breakdown', size: 'lg',
        thresholds: { green: { max: 95 }, yellow: { max: 85 }, direction: 'higher-is-better' },
        visible: true,
        breakdownBy: dim,
      },
    });
    mockCreate.mockResolvedValueOnce(claudeReply(JSON.stringify(mkBreakdown('category'))));
    await chat(userId, 'break down OTIF by category');
    mockCreate.mockResolvedValueOnce(claudeReply(JSON.stringify(mkBreakdown('destination_region'))));
    await chat(userId, 'now break it down by region too');
    const cfg = getConfig(userId)!;
    const breakdowns = cfg.metrics.filter((m) => m.chartType === 'breakdown' && m.id === 'otif_rate');
    expect(breakdowns).toHaveLength(2);
    expect(breakdowns.map((b) => b.breakdownBy).sort()).toEqual(['category', 'destination_region']);
  });

  it('filter action writes globalFilters and drops null keys', async () => {
    const userId = `filter-${Date.now()}`;
    await adoptPersona(userId, 'csco');
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: 'Filtered to EMEA destinations.',
      action: 'filter',
      filterBy: {
        destination_region: 'EMEA',
        warehouse_id: null,
        customer_segment: null,
        sku_category: null,
        supplier_tier: null,
      },
    })));
    const res = await chat(userId, 'filter to EMEA');
    expect(res.status).toBe(200);
    const cfg = getConfig(userId)!;
    expect(cfg.globalFilters).toEqual({ destination_region: 'EMEA' });
  });

  it('filter action writes date range in addition to categorical filters', async () => {
    const userId = `date-filter-${Date.now()}`;
    await adoptPersona(userId, 'warehouse-director');
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: 'Filtered to EMEA in Q4 2025.',
      action: 'filter',
      filterBy: {
        destination_region: 'EMEA',
        dateStart: '2025-10-01',
        dateEnd: '2025-12-31',
        warehouse_id: null,
        customer_segment: null,
        sku_category: null,
        supplier_tier: null,
      },
    })));
    const res = await chat(userId, 'filter to EMEA in Q4');
    expect(res.status).toBe(200);
    const cfg = getConfig(userId)!;
    expect(cfg.globalFilters).toEqual({
      destination_region: 'EMEA',
      dateStart: '2025-10-01',
      dateEnd: '2025-12-31',
    });
  });

  it('filter action with {clear:true} empties globalFilters', async () => {
    const userId = `clear-${Date.now()}`;
    await adoptPersona(userId, 'warehouse-director');

    // First apply a filter
    mockCreate.mockResolvedValueOnce(claudeReply(JSON.stringify({
      message: 'Filtered.', action: 'filter',
      filterBy: { destination_region: 'APAC', dateStart: '2025-01-01', dateEnd: '2025-12-31' },
    })));
    await chat(userId, 'filter to APAC in 2025');
    expect(getConfig(userId)!.globalFilters).toMatchObject({ destination_region: 'APAC' });

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
    await adoptPersona(userId, 'csco');
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
    await adoptPersona(userId, 'csco');
    const target = getConfig(userId)!.metrics[0].id;
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      message: 'Updated.', action: 'edit', metricId: target,
      changes: {
        label: 'OTIF Rate (tweaked)',
        size: 'lg',
        thresholds: { green: { max: 97 }, yellow: { max: 90 }, direction: 'higher-is-better' },
      },
    })));
    const res = await chat(userId, `bump ${target} thresholds`);
    expect(res.status).toBe(200);
    const metric = getConfig(userId)!.metrics.find((m) => m.id === target)!;
    expect(metric.label).toBe('OTIF Rate (tweaked)');
    expect(metric.size).toBe('lg');
    expect(metric.thresholds.green.max).toBe(97);
  });
});

// --- Parser hardening (matches the fix in server/src/routes/dashboardChat.ts) ---

describe('Chat parser resilience', () => {
  it('extracts JSON even when Claude wraps it in prose', async () => {
    const userId = `prose-${Date.now()}`;
    await adoptPersona(userId, 'csco');
    mockCreate.mockResolvedValue(claudeReply(
      'Sure! Here is the filter you asked for:\n\n' +
      '{"message":"Filtered.","action":"filter","filterBy":{"sku_category":"Bearings"}}\n\n' +
      'Let me know if you want to change it.'
    ));
    const res = await chat(userId, 'filter to bearings');
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('filter');
    expect(getConfig(userId)!.globalFilters).toEqual({ sku_category: 'Bearings' });
  });

  it('extracts JSON from fenced code blocks', async () => {
    const userId = `fence-${Date.now()}`;
    await adoptPersona(userId, 'csco');
    mockCreate.mockResolvedValue(claudeReply(
      '```json\n{"message":"ok","action":"filter","filterBy":{"destination_region":"EMEA"}}\n```'
    ));
    const res = await chat(userId, 'filter to EMEA');
    expect(res.status).toBe(200);
    expect(getConfig(userId)!.globalFilters).toEqual({ destination_region: 'EMEA' });
  });

  it('returns a friendly 200 fallback when Claude returns unparseable text', async () => {
    const userId = `unparse-${Date.now()}`;
    await adoptPersona(userId, 'csco');
    mockCreate.mockResolvedValue(claudeReply(
      "I'm not sure what you mean — could you try again?"
    ));
    const res = await chat(userId, 'do the thing');
    expect(res.status).toBe(200);
    expect(res.body.action).toBeNull();
    expect(res.body.config).toBeNull();
    expect(res.body.message).toMatch(/rephrase|parse|try/i);
  });

  it('returns 500 only when the Claude SDK itself throws an unclassified error', async () => {
    const userId = `throw-${Date.now()}`;
    await adoptPersona(userId, 'csco');
    mockCreate.mockRejectedValue(new Error('Anthropic API upstream failure'));
    const res = await chat(userId, 'add something');
    expect(res.status).toBe(500);
  });

  it('returns 503 llm_unavailable when Anthropic reports insufficient credits', async () => {
    const userId = `billing-${Date.now()}`;
    await adoptPersona(userId, 'csco');
    // Shape mirrors @anthropic-ai/sdk BadRequestError
    const billingErr = Object.assign(new Error('400 billing'), {
      status: 400,
      error: { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } },
    });
    mockCreate.mockRejectedValue(billingErr);
    const res = await chat(userId, 'filter to Q4 2025');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('llm_unavailable');
    expect(res.body.reason).toBe('billing');
    expect(res.body.message).toMatch(/credit|unavailable/i);
  });

  it('returns 503 llm_unavailable on 429 rate limit', async () => {
    const userId = `rl-${Date.now()}`;
    await adoptPersona(userId, 'csco');
    const rateErr = Object.assign(new Error('429'), { status: 429 });
    mockCreate.mockRejectedValue(rateErr);
    const res = await chat(userId, 'anything');
    expect(res.status).toBe(503);
    expect(res.body.reason).toBe('rate_limit');
  });

  it('400s when message body is missing', async () => {
    const userId = `missing-${Date.now()}`;
    await adoptPersona(userId, 'csco');
    const res = await fetch(`${baseUrl}/api/dashboard-chat/${userId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
