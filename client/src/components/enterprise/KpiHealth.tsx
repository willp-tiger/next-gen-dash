import { useEffect, useState, useCallback } from 'react';
import { getKpiHealth, runKpiHealth } from '../../api/client';
import type { HealthSnapshot, KpiHealthSummary, AssertionResult } from '../../api/client';

type HealthFilter = 'all' | 'passing' | 'warning' | 'failing';

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
    <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-xs font-bold text-slate-500">
      {icons[type] ?? '?'}
    </span>
  );
}

export function KpiHealth() {
  const [filter, setFilter] = useState<HealthFilter>('all');
  const [expandedKpi, setExpandedKpi] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(() => {
    getKpiHealth().then(setSnapshot).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const result = await runKpiHealth();
      setSnapshot(result);
    } catch { /* ignore */ }
    setRunning(false);
  };

  const summaries = snapshot?.summaries ?? [];
  const totalAssertions = snapshot?.totalAssertions ?? 0;
  const totalPassing = snapshot?.totalPassing ?? 0;
  const totalWarning = snapshot?.totalWarnings ?? 0;
  const totalFailing = snapshot?.totalFailures ?? 0;
  const overallHealth = totalFailing > 0 ? 'fail' : totalWarning > 0 ? 'warn' : 'pass';

  const filtered = summaries.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'passing') return s.overallStatus === 'pass';
    if (filter === 'warning') return s.overallStatus === 'warn';
    if (filter === 'failing') return s.overallStatus === 'fail';
    return true;
  });

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-navy-200 border-t-navy-600" />
        <span className="ml-3 text-slate-500">Running health checks against database...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">KPI Health Monitor</h2>
          <p className="mt-1 text-sm text-slate-500">
            Live test assertions run against the Postgres database.
            {snapshot && (
              <> Last run: {new Date(snapshot.runAt).toLocaleString()}</>
            )}
          </p>
        </div>
        <button
          onClick={handleRunNow}
          disabled={running}
          className="flex items-center gap-2 rounded-lg bg-navy-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-navy-700 disabled:opacity-50"
        >
          {running ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Running...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
              </svg>
              Run Now
            </>
          )}
        </button>
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
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <span>{snapshot ? `Assertions executed live at ${new Date(snapshot.runAt).toLocaleTimeString()}` : 'No data yet'}</span>
                {overallHealth !== 'pass' && (
                  <button
                    onClick={() => setFilter(overallHealth === 'fail' ? 'failing' : 'warning')}
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold transition ${
                      overallHealth === 'fail'
                        ? 'bg-red-200 text-red-800 hover:bg-red-300'
                        : 'bg-amber-200 text-amber-800 hover:bg-amber-300'
                    }`}
                  >
                    Jump to {overallHealth === 'fail' ? 'failures' : 'warnings'}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <div className="text-2xl font-bold text-slate-900">{totalAssertions}</div>
              <div className="text-xs text-slate-500">Total Tests</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">{totalPassing}</div>
              <div className="text-xs text-slate-500">Passing</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600">{totalWarning}</div>
              <div className="text-xs text-slate-500">Warnings</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{totalFailing}</div>
              <div className="text-xs text-slate-500">Failures</div>
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
              filter === f.key ? 'bg-navy-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
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
            <div key={s.kpiId} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button
                onClick={() => setExpandedKpi(isExpanded ? null : s.kpiId)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition"
              >
                <div className="flex items-center gap-4">
                  <span className={`h-3 w-3 rounded-full flex-shrink-0 ${
                    s.overallStatus === 'pass' ? 'bg-emerald-400' : s.overallStatus === 'warn' ? 'bg-amber-400' : s.overallStatus === 'fail' ? 'bg-red-400' : 'bg-slate-300'
                  }`} />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{s.displayName}</div>
                    <div className="text-xs text-slate-400 font-mono">{s.kpiId}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <span className="text-xs text-slate-400">Owner: {s.owner}</span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-emerald-600 font-medium">{s.passing} pass</span>
                    <span className="text-amber-600 font-medium">{s.warnings} warn</span>
                    <span className="text-red-600 font-medium">{s.failures} fail</span>
                  </div>
                  <svg className={`h-4 w-4 text-slate-400 transition ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-slate-100 px-5 py-3 space-y-2">
                  {s.assertions.map((a: AssertionResult) => (
                    <div key={a.assertionId} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <AssertionTypeIcon type={a.assertionType} />
                        <div>
                          <div className="text-sm text-slate-700">{a.description}</div>
                          <div className="text-xs text-slate-400 font-mono">
                            {a.assertionType} · severity: {a.severity}
                            {a.message !== 'Assertion passed' && (
                              <> · {a.message}</>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{a.durationMs}ms</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          a.lastResult === 'pass' ? 'bg-emerald-100 text-emerald-700' : a.lastResult === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {a.lastResult.toUpperCase()}
                        </span>
                        <span className="text-xs text-slate-400">{new Date(a.lastRunAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                  {s.assertions.length === 0 && (
                    <p className="text-sm text-slate-400 py-2">No test assertions defined for this KPI.</p>
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
