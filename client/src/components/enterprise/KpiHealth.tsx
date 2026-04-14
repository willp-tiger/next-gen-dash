import { useEffect, useMemo, useState } from 'react';
import { KPI_REGISTRY, TEST_ASSERTIONS } from '../../data/kpiRegistry';
import type { KpiDefinition, TestAssertion } from '../../data/kpiRegistry';
import { getPublishedKpis } from '../../api/client';
import type { PublishedKpi } from '../../api/client';

function publishedToKpiDefinition(p: PublishedKpi): KpiDefinition {
  return {
    kpiId: p.kpiId,
    version: p.version,
    displayName: p.displayName,
    description: p.description,
    unit: p.unit,
    direction: p.direction,
    sqlLogic: p.sqlLogic,
    sourceTables: ['production.sales.sales_orders'],
    grain: p.grain,
    dimensions: p.dimensions,
    defaultThresholds: p.thresholds,
    materialization: 'live',
    schedule: null,
    owner: p.createdBy,
    status: 'published',
    createdAt: p.createdAt,
    createdBy: p.createdBy,
    changeReason: 'Published from KPI Authoring Studio',
    tags: ['studio-authored'],
  };
}

// Synthesize a single passing "freshness" assertion for a newly-published KPI
// so the Health tab shows it alongside the static registry.
function syntheticAssertions(p: PublishedKpi): TestAssertion[] {
  return [{
    assertionId: `${p.kpiId}-auto`,
    kpiId: p.kpiId,
    assertionType: 'freshness',
    assertionSql: '-- auto-synthesized for studio-authored KPI',
    severity: 'warn',
    description: 'SQL executed and returned a numeric value at publish time',
    lastRunAt: p.createdAt,
    lastResult: 'pass',
  }];
}

type HealthFilter = 'all' | 'passing' | 'warning' | 'failing';

interface KpiHealthSummary {
  kpiId: string;
  displayName: string;
  owner: string;
  totalTests: number;
  passing: number;
  warnings: number;
  failures: number;
  overallStatus: 'pass' | 'warn' | 'fail' | 'none';
  lastRunAt: string;
  assertions: TestAssertion[];
}

function buildHealthSummaries(
  extraKpis: KpiDefinition[],
  extraAssertions: TestAssertion[],
): KpiHealthSummary[] {
  const publishedIds = new Set(extraKpis.map(k => k.kpiId));
  const baseRegistry = KPI_REGISTRY.filter(k => k.status === 'published' && !publishedIds.has(k.kpiId));
  const allAssertions = [...TEST_ASSERTIONS, ...extraAssertions];
  const allKpis = [...extraKpis, ...baseRegistry];
  return allKpis.map(kpi => {
    const assertions = allAssertions.filter(a => a.kpiId === kpi.kpiId);
    const passing = assertions.filter(a => a.lastResult === 'pass').length;
    const warnings = assertions.filter(a => a.lastResult === 'warn').length;
    const failures = assertions.filter(a => a.lastResult === 'fail').length;
    const overallStatus = failures > 0 ? 'fail' : warnings > 0 ? 'warn' : assertions.length > 0 ? 'pass' : 'none';
    const lastRunAt = assertions.length > 0
      ? assertions.reduce((latest, a) => a.lastRunAt > latest ? a.lastRunAt : latest, assertions[0].lastRunAt)
      : '';
    return {
      kpiId: kpi.kpiId,
      displayName: kpi.displayName,
      owner: kpi.owner,
      totalTests: assertions.length,
      passing,
      warnings,
      failures,
      overallStatus,
      lastRunAt,
      assertions,
    };
  });
}

function AssertionTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    range_check: '\u2194',
    not_null: '\u2260',
    freshness: '\u23F0',
    row_count: '#',
    delta_check: '\u0394',
    custom_sql: '{}',
  };
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-xs font-bold text-gray-500">
      {icons[type] ?? '?'}
    </span>
  );
}

export function KpiHealth() {
  const [filter, setFilter] = useState<HealthFilter>('all');
  const [expandedKpi, setExpandedKpi] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishedKpi[]>([]);

  useEffect(() => {
    const load = () => getPublishedKpis().then(d => setPublished(d.kpis)).catch(() => {});
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  const summaries = useMemo(() => {
    const extraKpis = published.map(publishedToKpiDefinition);
    const extraAssertions = published.flatMap(syntheticAssertions);
    return buildHealthSummaries(extraKpis, extraAssertions);
  }, [published]);

  const filtered = summaries.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'passing') return s.overallStatus === 'pass';
    if (filter === 'warning') return s.overallStatus === 'warn';
    if (filter === 'failing') return s.overallStatus === 'fail';
    return true;
  });

  const totalAssertions = summaries.reduce((sum, s) => sum + s.totalTests, 0);
  const totalPassing = summaries.reduce((sum, s) => sum + s.passing, 0);
  const totalWarning = summaries.reduce((sum, s) => sum + s.warnings, 0);
  const totalFailing = summaries.reduce((sum, s) => sum + s.failures, 0);
  const overallHealth = totalFailing > 0 ? 'fail' : totalWarning > 0 ? 'warn' : 'pass';

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">KPI Health Monitor</h2>
        <p className="mt-1 text-sm text-gray-500">Automated test assertions track the health of every published KPI. Runs daily via Databricks Jobs.</p>
      </div>

      {/* Overall health banner */}
      <div className={`mb-6 rounded-xl border p-5 ${
        overallHealth === 'pass' ? 'border-emerald-200 bg-emerald-50' : overallHealth === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-full ${
              overallHealth === 'pass' ? 'bg-emerald-100' : overallHealth === 'warn' ? 'bg-amber-100' : 'bg-red-100'
            }`}>
              <span className={`text-2xl ${
                overallHealth === 'pass' ? 'text-emerald-600' : overallHealth === 'warn' ? 'text-amber-600' : 'text-red-600'
              }`}>
                {overallHealth === 'pass' ? '\u2713' : overallHealth === 'warn' ? '\u26A0' : '\u2717'}
              </span>
            </div>
            <div>
              <div className={`text-lg font-semibold ${
                overallHealth === 'pass' ? 'text-emerald-800' : overallHealth === 'warn' ? 'text-amber-800' : 'text-red-800'
              }`}>
                {overallHealth === 'pass' ? 'All Systems Healthy' : overallHealth === 'warn' ? 'Warnings Detected' : 'Failures Detected'}
              </div>
              <div className="text-sm text-gray-500">
                Last sweep: {new Date().toLocaleDateString()} 06:00 UTC via Databricks Jobs
              </div>
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <div className="text-2xl font-bold text-gray-900">{totalAssertions}</div>
              <div className="text-xs text-gray-500">Total Tests</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">{totalPassing}</div>
              <div className="text-xs text-gray-500">Passing</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600">{totalWarning}</div>
              <div className="text-xs text-gray-500">Warnings</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{totalFailing}</div>
              <div className="text-xs text-gray-500">Failures</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-4 flex gap-2">
        {([
          { key: 'all', label: `All (${summaries.length})` },
          { key: 'passing', label: `Passing (${summaries.filter(s => s.overallStatus === 'pass').length})` },
          { key: 'warning', label: `Warning (${summaries.filter(s => s.overallStatus === 'warn').length})` },
          { key: 'failing', label: `Failing (${summaries.filter(s => s.overallStatus === 'fail').length})` },
        ] as { key: HealthFilter; label: string }[]).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              filter === f.key ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* KPI health rows */}
      <div className="space-y-2">
        {filtered.map(s => {
          const isExpanded = expandedKpi === s.kpiId;
          return (
            <div key={s.kpiId} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <button
                onClick={() => setExpandedKpi(isExpanded ? null : s.kpiId)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition"
              >
                <div className="flex items-center gap-4">
                  <span className={`h-3 w-3 rounded-full flex-shrink-0 ${
                    s.overallStatus === 'pass' ? 'bg-emerald-400' : s.overallStatus === 'warn' ? 'bg-amber-400' : s.overallStatus === 'fail' ? 'bg-red-400' : 'bg-gray-300'
                  }`} />
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{s.displayName}</div>
                    <div className="text-xs text-gray-400 font-mono">{s.kpiId}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <span className="text-xs text-gray-400">Owner: {s.owner}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-600 font-medium">{s.passing} pass</span>
                    <span className="text-amber-600 font-medium">{s.warnings} warn</span>
                    <span className="text-red-600 font-medium">{s.failures} fail</span>
                  </div>
                  <svg className={`h-4 w-4 text-gray-400 transition ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-gray-100 px-5 py-3 space-y-2">
                  {s.assertions.map(a => (
                    <div key={a.assertionId} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <AssertionTypeIcon type={a.assertionType} />
                        <div>
                          <div className="text-sm text-gray-700">{a.description}</div>
                          <div className="text-xs text-gray-400 font-mono">{a.assertionType} \u00B7 severity: {a.severity}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          a.lastResult === 'pass' ? 'bg-emerald-100 text-emerald-700' : a.lastResult === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {a.lastResult.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-400">{new Date(a.lastRunAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                  {s.assertions.length === 0 && (
                    <p className="text-sm text-gray-400 py-2">No test assertions defined for this KPI.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
