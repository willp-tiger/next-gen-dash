import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';

// Shared Anthropic mock — must be hoisted before module imports.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { create: mockCreate };
  }
  return { default: Anthropic };
});

const { default: kpiStudioRouter } = await import('../server/src/routes/kpiStudio.js');

let app: express.Express;
let server: Server;
let baseUrl: string;

const claudeReply = (text: string) => ({ content: [{ type: 'text', text }] });

async function chat(userId: string, message: string) {
  const res = await fetch(`${baseUrl}/api/kpi-studio/${userId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use('/api/kpi-studio', kpiStudioRouter);
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

describe('POST /api/kpi-studio/:userId', () => {
  it('returns a clarifying reply when Claude asks for more detail', async () => {
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      action: 'reply',
      message: 'Which tables or columns should this draw from?',
    })));
    const res = await chat(`u-${Date.now()}`, 'i want a metric');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/tables|columns/i);
    expect(res.body.candidate).toBeNull();
  });

  it('returns a candidate when Claude proposes one', async () => {
    const candidate = {
      displayName: 'EMEA Cancel Rate',
      description: 'Share of EMEA orders that end up cancelled.',
      kpiId: 'emea_cancel_rate',
      unit: 'percent',
      direction: 'lower-is-better',
      sqlLogic: "SELECT 100.0 * COUNT(CASE WHEN status='Cancelled' THEN 1 END) / NULLIF(COUNT(*),0) AS value FROM production.sales.sales_orders WHERE territory='EMEA' AND year_id=:year AND qtr_id=:quarter",
      grain: 'quarterly',
      dimensions: ['product_line', 'country', 'deal_size'],
      thresholds: { greenMax: 5, yellowMax: 10 },
    };
    mockCreate.mockResolvedValue(claudeReply(JSON.stringify({
      action: 'propose',
      message: 'Here is the KPI I drafted.',
      candidate,
    })));
    const res = await chat(`u-${Date.now()}`, 'cancel rate in EMEA');
    expect(res.status).toBe(200);
    expect(res.body.candidate).toMatchObject({ kpiId: 'emea_cancel_rate', unit: 'percent' });
    expect(res.body.candidate.sqlLogic).toContain('production.sales.sales_orders');
  });

  it('returns a friendly fallback when Claude returns unparseable text', async () => {
    mockCreate.mockResolvedValue(claudeReply('I am not sure, could you clarify?'));
    const res = await chat(`u-${Date.now()}`, 'xyzzy');
    expect(res.status).toBe(200);
    expect(res.body.candidate).toBeNull();
    expect(res.body.message).toMatch(/parse|rephrase|measure/i);
  });

  it('extracts JSON wrapped in prose', async () => {
    mockCreate.mockResolvedValue(claudeReply(
      'Sure, here is the clarifier:\n{"action":"reply","message":"Would you like this scoped to a territory?"}\nLet me know.'
    ));
    const res = await chat(`u-${Date.now()}`, 'something');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/territory/i);
  });

  it('returns 400 when body is missing message', async () => {
    const res = await fetch(`${baseUrl}/api/kpi-studio/u-${Date.now()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 503 llm_unavailable on Anthropic billing error', async () => {
    const err = Object.assign(new Error('400'), {
      status: 400,
      error: { error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } },
    });
    mockCreate.mockRejectedValue(err);
    const res = await chat(`u-${Date.now()}`, 'anything');
    expect(res.status).toBe(503);
    expect(res.body.reason).toBe('billing');
  });

  it('DELETE clears conversation history so prior turns do not leak', async () => {
    const userId = `u-reset-${Date.now()}`;
    // Snapshot the messages array at call time, since the route mutates it after awaiting Claude.
    const snapshots: string[][] = [];
    mockCreate.mockImplementation(async ({ messages }: { messages: { role: string; content: string }[] }) => {
      snapshots.push(messages.map(m => m.content));
      return claudeReply(JSON.stringify({ action: 'reply', message: 'ok' }));
    });
    await chat(userId, 'first turn');
    const delRes = await fetch(`${baseUrl}/api/kpi-studio/${userId}`, { method: 'DELETE' });
    expect(delRes.status).toBe(200);
    await chat(userId, 'second turn after reset');
    expect(snapshots).toHaveLength(2);
    expect(snapshots[1]).toEqual(['second turn after reset']);
    expect(snapshots[1]).not.toContain('first turn');
  });
});
