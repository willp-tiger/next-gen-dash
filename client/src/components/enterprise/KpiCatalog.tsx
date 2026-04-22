import { useEffect, useMemo, useState } from 'react';
import { KPI_REGISTRY, TEST_ASSERTIONS, VERSION_HISTORY } from '../../data/kpiRegistry';
import type { KpiDefinition } from '../../data/kpiRegistry';
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

const STATUS_STYLES: Record<string, string> = {
  published: 'bg-emerald-100 text-emerald-700',
  validated: 'bg-blue-100 text-blue-700',
  draft: 'bg-slate-100 text-slate-600',
  validating: 'bg-amber-100 text-amber-700',
  deprecated: 'bg-red-100 text-red-600',
};

const STATUS_ICONS: Record<string, string> = {
  published: '\u2713',
  validated: '\u25CB',
  draft: '\u270E',
  validating: '\u21BB',
  deprecated: '\u2717',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'}`}>
      <span className="text-[10px]">{STATUS_ICONS[status]}</span>
      {status}
    </span>
  );
}

function TestStatusDot({ kpiId }: { kpiId: string }) {
  const assertions = TEST_ASSERTIONS.filter(a => a.kpiId === kpiId);
  if (assertions.length === 0) return <span className="text-xs text-slate-400">No tests</span>;
  const hasFail = assertions.some(a => a.lastResult === 'fail');
  const hasWarn = assertions.some(a => a.lastResult === 'warn');
  const color = hasFail ? 'bg-red-400' : hasWarn ? 'bg-amber-400' : 'bg-emerald-400';
  const label = hasFail ? 'Failing' : hasWarn ? 'Warning' : 'Passing';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {assertions.length} tests \u00B7 {label}
    </span>
  );
}

function KpiDetailPanel({ kpi, onClose }: { kpi: KpiDefinition; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'sql' | 'tests' | 'versions'>('sql');
  const assertions = TEST_ASSERTIONS.filter(a => a.kpiId === kpi.kpiId);
  const versions = VERSION_HISTORY[kpi.kpiId] ?? [{ version: kpi.version, createdAt: kpi.createdAt, createdBy: kpi.createdBy, changeReason: kpi.changeReason, status: kpi.status as 'published' | 'deprecated' }];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{kpi.displayName}</h2>
              <StatusBadge status={kpi.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{kpi.description}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-4 gap-4 border-b border-slate-100 px-6 py-3 text-sm">
          <div><span className="text-slate-400">Unit</span><div className="font-medium text-slate-700">{kpi.unit}</div></div>
          <div><span className="text-slate-400">Direction</span><div className="font-medium text-slate-700">{kpi.direction}</div></div>
          <div><span className="text-slate-400">Grain</span><div className="font-medium text-slate-700">{kpi.grain}</div></div>
          <div><span className="text-slate-400">Materialization</span><div className="font-medium text-slate-700">{kpi.materialization}{kpi.schedule ? ` (${kpi.schedule})` : ''}</div></div>
          <div><span className="text-slate-400">Owner</span><div className="font-medium text-slate-700">{kpi.owner}</div></div>
          <div><span className="text-slate-400">Version</span><div className="font-medium text-slate-700">v{kpi.version}</div></div>
          <div><span className="text-slate-400">Dimensions</span><div className="font-medium text-slate-700">{kpi.dimensions.join(', ')}</div></div>
          <div><span className="text-slate-400">Thresholds</span><div className="font-medium text-slate-700">G: \u2264{kpi.defaultThresholds.greenMax} / Y: \u2264{kpi.defaultThresholds.yellowMax}</div></div>
        </div>

        {/* Source tables */}
        <div className="border-b border-slate-100 px-6 py-2 text-sm">
          <span className="text-slate-400">Source Tables: </span>
          {kpi.sourceTables.map(t => (
            <span key={t} className="mr-2 inline-flex rounded bg-accent/10 px-2 py-0.5 text-xs font-mono text-accent">{t}</span>
          ))}
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 px-6">
          <div className="flex gap-6">
            {(['sql', 'tests', 'versions'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`border-b-2 py-3 text-sm font-medium transition ${activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                {tab === 'sql' ? 'SQL Logic' : tab === 'tests' ? `Tests (${assertions.length})` : `Versions (${versions.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="max-h-80 overflow-auto px-6 py-4">
          {activeTab === 'sql' && (
            <pre className="rounded-lg bg-slate-900 p-4 text-sm text-slate-100 overflow-x-auto">
              <code>{kpi.sqlLogic}</code>
            </pre>
          )}

          {activeTab === 'tests' && (
            <div className="space-y-2">
              {assertions.length === 0 && <p className="text-sm text-slate-400">No test assertions defined.</p>}
              {assertions.map(a => (
                <div key={a.assertionId} className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${a.lastResult === 'pass' ? 'bg-emerald-400' : a.lastResult === 'warn' ? 'bg-amber-400' : 'bg-red-400'}`} />
                    <div>
                      <div className="text-sm font-medium text-slate-700">{a.description}</div>
                      <div className="text-xs text-slate-400">{a.assertionType} \u00B7 {a.severity}</div>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    <div className={`font-medium ${a.lastResult === 'pass' ? 'text-emerald-600' : a.lastResult === 'warn' ? 'text-amber-600' : 'text-red-600'}`}>
                      {a.lastResult.toUpperCase()}
                    </div>
                    <div>{new Date(a.lastRunAt).toLocaleDateString()}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="relative pl-6">
              <div className="absolute left-2.5 top-0 bottom-0 w-px bg-slate-200" />
              {[...versions].reverse().map((v, i) => (
                <div key={v.version} className="relative mb-4 last:mb-0">
                  <div className={`absolute -left-[14px] top-1 h-3 w-3 rounded-full border-2 border-white ${i === 0 ? 'bg-accent' : 'bg-slate-300'}`} />
                  <div className="rounded-lg border border-slate-200 px-4 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">v{v.version}</span>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={v.status} />
                        <span className="text-xs text-slate-400">{new Date(v.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{v.changeReason}</p>
                    <p className="text-xs text-slate-400">by {v.createdBy}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-200 px-6 py-3">
          <button onClick={onClose} className="rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Close</button>
        </div>
      </div>
    </div>
  );
}

export function KpiCatalog() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedKpi, setSelectedKpi] = useState<KpiDefinition | null>(null);
  const [published, setPublished] = useState<PublishedKpi[]>([]);

  useEffect(() => {
    const load = () => getPublishedKpis().then(d => setPublished(d.kpis)).catch(() => {});
    load();
    // Poll periodically so a newly-published KPI appears without a manual refresh
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  // Studio-published KPIs override built-in registry entries if IDs collide
  const registry = useMemo(() => {
    const publishedIds = new Set(published.map(p => p.kpiId));
    const base = KPI_REGISTRY.filter(k => !publishedIds.has(k.kpiId));
    return [...published.map(publishedToKpiDefinition), ...base];
  }, [published]);

  const filtered = registry.filter(kpi => {
    const matchesSearch = search === '' ||
      kpi.displayName.toLowerCase().includes(search.toLowerCase()) ||
      kpi.description.toLowerCase().includes(search.toLowerCase()) ||
      kpi.tags.some(t => t.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || kpi.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = registry.reduce((acc, kpi) => {
    acc[kpi.status] = (acc[kpi.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">KPI Catalog</h2>
        <p className="mt-1 text-sm text-slate-500">Browse, search, and inspect all registered KPI definitions in the semantic layer.</p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-5 gap-3">
        {(['published', 'validated', 'draft', 'validating', 'deprecated'] as const).map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            className={`rounded-lg border px-4 py-3 text-left transition ${statusFilter === status ? 'border-accent/30 bg-accent/10 ring-1 ring-accent/15' : 'border-slate-200 bg-white hover:border-slate-300'}`}
          >
            <div className="text-2xl font-bold text-slate-900">{statusCounts[status] || 0}</div>
            <div className="text-xs font-medium text-slate-500 capitalize">{status}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, description, or tag..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* KPI list */}
      <div className="space-y-2">
        {filtered.map(kpi => (
          <button
            key={kpi.kpiId}
            onClick={() => setSelectedKpi(kpi)}
            className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-navy-200 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">{kpi.displayName}</span>
                  <StatusBadge status={kpi.status} />
                  <span className="text-xs font-mono text-slate-400">v{kpi.version}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500 truncate">{kpi.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-400">
                    <span className="font-mono text-slate-500">{kpi.kpiId}</span>
                  </span>
                  <span className="text-xs text-slate-400">{kpi.unit} \u00B7 {kpi.direction}</span>
                  <span className="text-xs text-slate-400">{kpi.grain} \u00B7 {kpi.materialization}</span>
                  <span className="text-xs text-slate-400">Owner: {kpi.owner}</span>
                </div>
              </div>
              <div className="ml-4 flex flex-col items-end gap-2">
                <TestStatusDot kpiId={kpi.kpiId} />
                <div className="flex gap-1">
                  {kpi.tags.slice(0, 3).map(t => (
                    <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-slate-400">No KPIs match your search.</div>
        )}
      </div>

      {/* Detail modal */}
      {selectedKpi && <KpiDetailPanel kpi={selectedKpi} onClose={() => setSelectedKpi(null)} />}
    </div>
  );
}
