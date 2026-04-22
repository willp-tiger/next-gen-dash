// Runs KPI test assertions against the real Postgres database.
// Results are cached with a TTL so the health endpoint doesn't hammer the DB.

import pool from './db.js';
import { METRIC_DEFS, normalizePublishedSql } from './salesData.js';
import { getPublishedKpis } from './kpiStore.js';
import type { PublishedKpi } from './kpiStore.js';

export interface AssertionDef {
  assertionId: string;
  kpiId: string;
  assertionType: 'range_check' | 'not_null' | 'freshness' | 'row_count' | 'delta_check';
  severity: 'warn' | 'fail';
  description: string;
  sql: string;
}

export interface AssertionResult {
  assertionId: string;
  kpiId: string;
  assertionType: AssertionDef['assertionType'];
  severity: 'warn' | 'fail';
  description: string;
  lastRunAt: string;
  lastResult: 'pass' | 'warn' | 'fail';
  message: string;
  durationMs: number;
}

export interface KpiHealthSummary {
  kpiId: string;
  displayName: string;
  owner: string;
  assertions: AssertionResult[];
  totalTests: number;
  passing: number;
  warnings: number;
  failures: number;
  overallStatus: 'pass' | 'warn' | 'fail' | 'none';
  lastRunAt: string;
}

export interface HealthSnapshot {
  runAt: string;
  summaries: KpiHealthSummary[];
  totalAssertions: number;
  totalPassing: number;
  totalWarnings: number;
  totalFailures: number;
}

// --- Assertion definitions for built-in KPIs ---

interface KpiMeta {
  id: string;
  label: string;
  unit: string;
  sql: string;
  owner: string;
  direction: 'higher-is-better' | 'lower-is-better';
}

function getKpiMetas(): KpiMeta[] {
  const builtIn: KpiMeta[] = METRIC_DEFS.map(m => ({
    id: m.id,
    label: m.label,
    unit: m.unit,
    sql: m.sql,
    owner: 'Built-in',
    direction: m.direction,
  }));

  const published: KpiMeta[] = getPublishedKpis().map(p => ({
    id: p.kpiId,
    label: p.displayName,
    unit: p.unit,
    sql: normalizePublishedSql(p.sqlLogic),
    owner: p.createdBy,
    direction: p.direction,
  }));

  return [...builtIn, ...published];
}

function buildAssertions(kpi: KpiMeta): AssertionDef[] {
  const assertions: AssertionDef[] = [];
  const { id, unit, sql } = kpi;

  // not_null: the KPI SQL must return a non-null value
  assertions.push({
    assertionId: `${id}-not_null`,
    kpiId: id,
    assertionType: 'not_null',
    severity: 'fail',
    description: 'Must return a non-null value',
    sql: `SELECT (sub.value IS NOT NULL) AS ok FROM (${sql}) sub`,
  });

  // range_check: value must be within plausible bounds for the unit
  if (unit === 'percent') {
    assertions.push({
      assertionId: `${id}-range`,
      kpiId: id,
      assertionType: 'range_check',
      severity: 'fail',
      description: 'Value must be between 0% and 100%',
      sql: `SELECT (sub.value >= 0 AND sub.value <= 100) AS ok FROM (${sql}) sub`,
    });
  } else if (unit === 'count') {
    assertions.push({
      assertionId: `${id}-range`,
      kpiId: id,
      assertionType: 'range_check',
      severity: 'fail',
      description: 'Count must be non-negative',
      sql: `SELECT (sub.value >= 0) AS ok FROM (${sql}) sub`,
    });
  } else if (unit === 'dollars') {
    assertions.push({
      assertionId: `${id}-range`,
      kpiId: id,
      assertionType: 'range_check',
      severity: 'warn',
      description: 'Dollar value should be non-negative',
      sql: `SELECT (sub.value >= 0) AS ok FROM (${sql}) sub`,
    });
  }

  // row_count: source table must have data
  assertions.push({
    assertionId: `${id}-row_count`,
    kpiId: id,
    assertionType: 'row_count',
    severity: 'fail',
    description: 'Source table must have data',
    sql: `SELECT (COUNT(*) > 0) AS ok FROM sales_orders`,
  });

  // freshness: source data must have records (date check)
  assertions.push({
    assertionId: `${id}-freshness`,
    kpiId: id,
    assertionType: 'freshness',
    severity: 'warn',
    description: 'Source data must contain date records',
    sql: `SELECT (MAX(order_date) IS NOT NULL) AS ok FROM sales_orders`,
  });

  // delta_check: for percent metrics, check the value isn't an extreme outlier
  if (unit === 'percent') {
    assertions.push({
      assertionId: `${id}-delta`,
      kpiId: id,
      assertionType: 'delta_check',
      severity: 'warn',
      description: 'Value should not be at an extreme (0% or 100%)',
      sql: `SELECT (sub.value > 0 AND sub.value < 100) AS ok FROM (${sql}) sub`,
    });
  }

  return assertions;
}

async function runAssertion(def: AssertionDef): Promise<AssertionResult> {
  const start = Date.now();
  try {
    const { rows } = await pool.query(def.sql);
    const durationMs = Date.now() - start;
    const ok = rows[0]?.ok;

    if (ok === null || ok === undefined) {
      return {
        ...pick(def),
        lastRunAt: new Date().toISOString(),
        lastResult: def.severity,
        message: 'Query returned no result',
        durationMs,
      };
    }

    const passed = ok === true || ok === 't' || ok === 1 || ok === '1';
    return {
      ...pick(def),
      lastRunAt: new Date().toISOString(),
      lastResult: passed ? 'pass' : def.severity,
      message: passed ? 'Assertion passed' : `Assertion failed (severity: ${def.severity})`,
      durationMs,
    };
  } catch (err) {
    return {
      ...pick(def),
      lastRunAt: new Date().toISOString(),
      lastResult: 'fail',
      message: `SQL error: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
      durationMs: Date.now() - start,
    };
  }
}

function pick(def: AssertionDef) {
  return {
    assertionId: def.assertionId,
    kpiId: def.kpiId,
    assertionType: def.assertionType,
    severity: def.severity,
    description: def.description,
  };
}

// --- Cache ---

let cachedSnapshot: HealthSnapshot | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

export async function runAllAssertions(): Promise<HealthSnapshot> {
  const kpis = getKpiMetas();
  const allDefs = kpis.flatMap(buildAssertions);

  const results = await Promise.all(allDefs.map(runAssertion));

  const resultsByKpi = new Map<string, AssertionResult[]>();
  for (const r of results) {
    const list = resultsByKpi.get(r.kpiId) ?? [];
    list.push(r);
    resultsByKpi.set(r.kpiId, list);
  }

  const summaries: KpiHealthSummary[] = kpis.map(kpi => {
    const assertions = resultsByKpi.get(kpi.id) ?? [];
    const passing = assertions.filter(a => a.lastResult === 'pass').length;
    const warnings = assertions.filter(a => a.lastResult === 'warn').length;
    const failures = assertions.filter(a => a.lastResult === 'fail').length;
    const overallStatus = failures > 0 ? 'fail' : warnings > 0 ? 'warn' : assertions.length > 0 ? 'pass' : 'none';
    const lastRunAt = assertions.length > 0
      ? assertions.reduce((latest, a) => a.lastRunAt > latest ? a.lastRunAt : latest, assertions[0].lastRunAt)
      : '';
    return {
      kpiId: kpi.id,
      displayName: kpi.label,
      owner: kpi.owner,
      assertions,
      totalTests: assertions.length,
      passing,
      warnings,
      failures,
      overallStatus,
      lastRunAt,
    };
  });

  const snapshot: HealthSnapshot = {
    runAt: new Date().toISOString(),
    summaries,
    totalAssertions: results.length,
    totalPassing: results.filter(r => r.lastResult === 'pass').length,
    totalWarnings: results.filter(r => r.lastResult === 'warn').length,
    totalFailures: results.filter(r => r.lastResult === 'fail').length,
  };

  cachedSnapshot = snapshot;
  return snapshot;
}

export async function getHealthSnapshot(forceRefresh = false): Promise<HealthSnapshot> {
  if (!forceRefresh && cachedSnapshot) {
    const age = Date.now() - new Date(cachedSnapshot.runAt).getTime();
    if (age < CACHE_TTL_MS) return cachedSnapshot;
  }
  return runAllAssertions();
}
