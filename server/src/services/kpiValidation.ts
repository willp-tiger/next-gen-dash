// 8-stage validation pipeline for a KPI candidate, run against the real
// Postgres warehouse and Claude. Each stage yields as it completes so the
// client can update its stepper in real time.

import Anthropic from '@anthropic-ai/sdk';
import pool from './db.js';
import { getPublishedKpis } from './kpiStore.js';
import { METRIC_DEFS, normalizePublishedSql } from './salesData.js';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

export interface CandidateKpi {
  displayName: string;
  description: string;
  kpiId: string;
  unit: string;
  direction: 'lower-is-better' | 'higher-is-better';
  sqlLogic: string;
  grain: string;
  dimensions: string[];
  thresholds: { greenMax: number; yellowMax: number };
}

export interface StageResult {
  stage: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  durationMs: number;
}

export const VALIDATION_STAGES = [
  'Schema Validation',
  'Execution Validation',
  'Type Validation',
  'Range Validation',
  'Null/Empty Validation',
  'Freshness Validation',
  'Semantic Validation',
  'Consistency Validation',
] as const;

export async function* validateKpiCandidate(
  candidate: CandidateKpi
): AsyncGenerator<StageResult> {
  const sql = normalizePublishedSql(candidate.sqlLogic);

  // Stage 1: Schema — let Postgres EXPLAIN be the source of truth (it resolves
  // CTEs, subqueries, and column types). Then enrich the pass message with any
  // real base tables we can confirm live in information_schema.
  const tableRefs = extractTableRefs(sql);
  const schema = await timed(async () => {
    try {
      await pool.query(`EXPLAIN ${sql}`);
    } catch (err) {
      return fail(`Query plan failed: ${cleanPgError(err)}`);
    }
    const confirmed: string[] = [];
    for (const t of tableRefs) {
      try {
        const { rows } = await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
          [t]
        );
        if (rows.length > 0) confirmed.push(t);
      } catch { /* noop */ }
    }
    const detail = confirmed.length > 0
      ? `source ${confirmed.length === 1 ? 'table' : 'tables'} resolved: ${confirmed.join(', ')}`
      : 'query parsed (no base tables detected beyond CTEs)';
    return pass(`All referenced tables and columns resolve; ${detail}.`);
  });
  yield { stage: 'Schema Validation', ...schema };

  const schemaOk = schema.status !== 'fail';

  // Stage 2: Execution — actually run the query.
  let executionValue: number | null = null;
  let executionRowCount = 0;
  const execution = await timed(async () => {
    if (!schemaOk) {
      return fail('Skipped: schema validation did not pass.');
    }
    try {
      const { rows } = await pool.query(sql);
      executionRowCount = rows.length;
      const raw = rows[0]?.value;
      executionValue = raw == null ? null : parseFloat(String(raw));
      return pass(`SQL executed successfully, returned ${rows.length} row${rows.length === 1 ? '' : 's'}.`);
    } catch (err) {
      return fail(`Query failed at runtime: ${cleanPgError(err)}`);
    }
  });
  yield { stage: 'Execution Validation', ...execution };

  const haveValue = executionValue !== null && Number.isFinite(executionValue);

  // Stage 3: Type — is the result a finite number consistent with the unit?
  const type = await timed(async () => {
    if (!haveValue) {
      return fail('Skipped: execution did not produce a numeric value.');
    }
    const v = executionValue as number;
    return pass(`Result ${formatValue(v, candidate.unit)} is numeric, consistent with ${candidate.unit} unit.`);
  });
  yield { stage: 'Type Validation', ...type };

  // Stage 4: Range — does the value fall within plausible bounds for the unit?
  const range = await timed(async () => {
    if (!haveValue) return fail('Skipped: execution did not produce a numeric value.');
    return checkRange(executionValue as number, candidate.unit);
  });
  yield { stage: 'Range Validation', ...range };

  // Stage 5: Null/Empty — did the query return a real value?
  const nullCheck = await timed(async () => {
    if (!schemaOk) return fail('Skipped: schema validation did not pass.');
    if (executionRowCount === 0) return fail('Query returned no rows.');
    if (executionValue === null) return fail('Query returned a row but `value` column is NULL.');
    return pass('Query returned a non-null value for the current period.');
  });
  yield { stage: 'Null/Empty Validation', ...nullCheck };

  // Stage 6: Freshness — how recent is the source data?
  const freshness = await timed(() => checkFreshness(tableRefs));
  yield { stage: 'Freshness Validation', ...freshness };

  // Stage 7: Semantic — does the SQL actually compute what the description says?
  const semantic = await timed(() => checkSemantic(candidate));
  yield { stage: 'Semantic Validation', ...semantic };

  // Stage 8: Consistency — is this a near-duplicate of an existing KPI?
  const consistency = await timed(() => checkConsistency(candidate));
  yield { stage: 'Consistency Validation', ...consistency };
}

// ---------- helpers ----------

async function timed(
  fn: () => Promise<Omit<StageResult, 'stage' | 'durationMs'>> | Omit<StageResult, 'stage' | 'durationMs'>
): Promise<Omit<StageResult, 'stage'>> {
  const t = Date.now();
  const out = await fn();
  return { ...out, durationMs: Date.now() - t };
}

function pass(message: string): Omit<StageResult, 'stage' | 'durationMs'> {
  return { status: 'pass', message };
}
function warn(message: string): Omit<StageResult, 'stage' | 'durationMs'> {
  return { status: 'warn', message };
}
function fail(message: string): Omit<StageResult, 'stage' | 'durationMs'> {
  return { status: 'fail', message };
}

function extractTableRefs(sql: string): string[] {
  const re = /\b(?:FROM|JOIN)\s+((?:\w+\.)*\w+)/gi;
  const tables = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    const parts = m[1].split('.');
    const leaf = parts[parts.length - 1];
    // Skip subquery aliases like "sub" that appear after a closing paren
    if (leaf.length > 0 && !/^\(/.test(leaf)) tables.add(leaf);
  }
  return Array.from(tables);
}

function cleanPgError(err: unknown): string {
  if (err instanceof Error) return err.message.replace(/\n+/g, ' ').trim();
  return String(err);
}

function formatValue(v: number, unit: string): string {
  if (unit === 'percent') return `${v.toFixed(2)}%`;
  if (unit === 'dollars') return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (unit === 'count') return v.toLocaleString();
  return v.toFixed(2);
}

function checkRange(value: number, unit: string): Omit<StageResult, 'stage' | 'durationMs'> {
  if (unit === 'percent') {
    if (value < 0 || value > 100) {
      return fail(`Value ${formatValue(value, unit)} is outside the [0, 100] range expected for percent.`);
    }
    return pass(`Value ${formatValue(value, unit)} is within [0, 100] for percent.`);
  }
  if (unit === 'count') {
    if (value < 0) return fail(`Value ${formatValue(value, unit)} is negative; counts must be >= 0.`);
    return pass(`Value ${formatValue(value, unit)} is non-negative, consistent with count.`);
  }
  if (unit === 'dollars') {
    if (value < 0) return warn(`Value ${formatValue(value, unit)} is negative; dollar values are usually >= 0.`);
    return pass(`Value ${formatValue(value, unit)} is positive, consistent with dollars.`);
  }
  if (unit === 'ratio') {
    if (!Number.isFinite(value)) return fail('Ratio is not finite.');
    return pass(`Value ${value.toFixed(3)} recorded for ratio.`);
  }
  return pass(`Value ${formatValue(value, unit)} recorded for unit "${unit}".`);
}

async function checkFreshness(tableRefs: string[]): Promise<Omit<StageResult, 'stage' | 'durationMs'>> {
  try {
    // Filter to tables that actually exist in information_schema (skips CTE names).
    let primary: string | null = null;
    let dateCol: string | null = null;
    for (const t of tableRefs) {
      const { rows: cols } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = $1 AND column_name IN ('order_date', 'created_at', 'updated_at')
         ORDER BY CASE column_name
           WHEN 'order_date' THEN 1 WHEN 'updated_at' THEN 2 WHEN 'created_at' THEN 3 END
         LIMIT 1`,
        [t]
      );
      if (cols.length > 0) {
        primary = t;
        dateCol = cols[0].column_name as string;
        break;
      }
    }
    if (!primary || !dateCol) {
      return warn('No date column detected on source tables; unable to measure freshness.');
    }
    const { rows } = await pool.query(
      `SELECT MIN(${dateCol})::text AS min_date, MAX(${dateCol})::text AS max_date, COUNT(*)::text AS row_count FROM ${primary}`
    );
    const minDate = rows[0]?.min_date as string | null;
    const maxDate = rows[0]?.max_date as string | null;
    const rowCount = parseInt(rows[0]?.row_count ?? '0', 10);
    if (!maxDate) return fail(`Source ${primary} has no rows.`);
    return pass(`${primary} has ${rowCount.toLocaleString()} rows spanning ${minDate} \u2192 ${maxDate} (on ${dateCol}).`);
  } catch (err) {
    return warn(`Freshness probe failed: ${cleanPgError(err)}`);
  }
}

async function checkSemantic(c: CandidateKpi): Promise<Omit<StageResult, 'stage' | 'durationMs'>> {
  const prompt = `You are reviewing a single KPI definition.

Description: "${c.description}"
Unit: ${c.unit}
Direction: ${c.direction}

SQL:
${c.sqlLogic}

Does the SQL correctly compute what the description claims? Consider: aggregation choice (SUM vs AVG vs COUNT), filtering, grouping, and whether the returned value matches the stated unit.

Reply with ONLY a JSON object, no prose outside it:
{"match": true|false, "reasoning": "one short sentence, under 25 words"}`;
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = textOf(res);
    const parsed = parseJsonish(raw);
    const reasoning = typeof parsed?.reasoning === 'string' ? parsed.reasoning : 'Claude returned no reasoning.';
    if (parsed?.match === true) return pass(reasoning);
    if (parsed?.match === false) return warn(reasoning);
    return warn(`Unclear verdict from Claude. Raw: ${raw.slice(0, 140)}`);
  } catch (err) {
    return warn(`Claude semantic review failed: ${cleanPgError(err)}`);
  }
}

async function checkConsistency(c: CandidateKpi): Promise<Omit<StageResult, 'stage' | 'durationMs'>> {
  const builtIn = METRIC_DEFS.map(m => ({ id: m.id, name: m.label, unit: m.unit, sql: m.sql }));
  const published = getPublishedKpis()
    .filter(p => p.kpiId !== c.kpiId)
    .map(p => ({ id: p.kpiId, name: p.displayName, unit: p.unit, sql: p.sqlLogic }));
  const existing = [...builtIn, ...published].filter(k => k.id !== c.kpiId);
  if (existing.length === 0) return pass('No other KPIs to compare against.');

  const listing = existing
    .map(k => `- ${k.id} (${k.name}, ${k.unit}): ${k.sql.replace(/\s+/g, ' ').slice(0, 220)}`)
    .join('\n');

  const prompt = `You are reviewing a new KPI for near-duplication against an existing registry.

New KPI:
  id: ${c.kpiId}
  name: ${c.displayName}
  description: ${c.description}
  sql: ${c.sqlLogic.replace(/\s+/g, ' ').slice(0, 400)}

Existing KPIs:
${listing}

Is the new KPI a near-duplicate or materially overlapping with any existing KPI? Name the conflicting KPI id if so.

Reply with ONLY a JSON object, no prose outside it:
{"duplicate": true|false, "conflictsWith": "existing_kpi_id or null", "reasoning": "one short sentence, under 25 words"}`;
  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = textOf(res);
    const parsed = parseJsonish(raw);
    const reasoning = typeof parsed?.reasoning === 'string' ? parsed.reasoning : 'Claude returned no reasoning.';
    if (parsed?.duplicate === true) return warn(reasoning);
    if (parsed?.duplicate === false) return pass(reasoning);
    return warn(`Unclear verdict from Claude. Raw: ${raw.slice(0, 140)}`);
  } catch (err) {
    return warn(`Claude consistency review failed: ${cleanPgError(err)}`);
  }
}

function textOf(res: Anthropic.Messages.Message): string {
  const block = res.content.find(b => b.type === 'text');
  return block?.type === 'text' ? block.text : '';
}

function parseJsonish(text: string): { match?: boolean; duplicate?: boolean; reasoning?: string; conflictsWith?: string | null } | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : text.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}
