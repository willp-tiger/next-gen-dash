import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  DashboardConfig,
  MetricsSnapshot,
  MetricValue,
  MetricConfig,
  FilterState,
  RefinementSuggestion,
} from 'shared/types';
import { getMetrics, getCanonicalView, updateDashboardConfig } from '../../api/client';
import { ViewToggle } from './ViewToggle';
import { MetricTile } from './MetricTile';
import { GaugeTile } from './GaugeTile';
import { ChartTile } from './ChartTile';
import { BreakdownChart } from './BreakdownChart';
import { HeatMapChart } from './HeatMapChart';
import { FilterBar } from './FilterBar';
import { RefinementBanner } from '../refinement/RefinementBanner';
import { DashboardChat } from './DashboardChat';
import { SkeletonGrid } from './SkeletonTile';
import { PersonaSelector } from './PersonaSelector';
import { getHealthStatus } from './HealthBadge';
import { MetricDetailDrawer } from './MetricDetailDrawer';
import { ThresholdDrawer } from './ThresholdDrawer';
import { formatValue } from '../../lib/format';

interface DashboardProps {
  config: DashboardConfig;
  userId: string;
  onAuthorKpi?: (phrase: string) => void;
}

type DashboardTab = 'overview' | 'metrics';

const EMPTY_VALUE: MetricValue = { current: 0, trend: [], delta: 0 };

export function Dashboard({ config, userId, onAuthorKpi }: DashboardProps) {
  const [dashTab, setDashTab] = useState<DashboardTab>('overview');
  const [isCanonical, setIsCanonical] = useState(false);
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [activeConfig, setActiveConfig] = useState<DashboardConfig>(config);
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});
  const [showFilters, setShowFilters] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [showThresholds, setShowThresholds] = useState(false);

  const prevMetricIds = useRef<Set<string>>(new Set());
  const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());

  const persistTimer = useRef<number | null>(null);
  const handleFilterChange = (next: FilterState) => {
    setFilters(next);
    setActiveConfig(prev => ({ ...prev, globalFilters: next }));
    if (isCanonical || activePersona) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      updateDashboardConfig(userId, {
        ...activeConfig,
        globalFilters: next,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }, 400);
  };

  useEffect(() => {
    const currentIds = new Set(activeConfig.metrics.filter(m => m.visible).map(m => m.id));
    const newIds = new Set<string>();
    for (const id of currentIds) {
      if (!prevMetricIds.current.has(id)) {
        newIds.add(id);
      }
    }
    prevMetricIds.current = currentIds;
    if (newIds.size > 0) {
      setAnimatedIds(newIds);
      const timer = setTimeout(() => setAnimatedIds(new Set()), 500);
      return () => clearTimeout(timer);
    }
  }, [activeConfig.metrics]);

  useEffect(() => {
    if (!isCanonical) {
      setActiveConfig(config);
      if (config.globalFilters) setFilters(config.globalFilters);
    }
  }, [config, isCanonical]);

  useEffect(() => {
    const hasBreakdown = activeConfig.metrics.some(m => m.chartType === 'breakdown' || m.chartType === 'heatmap' || m.filterBy);
    const hasGlobal = !!(activeConfig.globalFilters && Object.keys(activeConfig.globalFilters).length > 0);
    if ((hasBreakdown || hasGlobal) && !showFilters) setShowFilters(true);
  }, [activeConfig.metrics, activeConfig.globalFilters, showFilters]);

  const fetchMetrics = useCallback(async () => {
    try {
      const ids = activeConfig.metrics
        .filter((m) => m.visible && m.chartType !== 'breakdown')
        .map((m) => m.id);
      const data = await getMetrics(ids, filters);
      setSnapshot(data);
      setLastRefresh(new Date());
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [activeConfig.metrics, filters]);

  useEffect(() => {
    setLoading(true);
    fetchMetrics();
    const interval = setInterval(() => {
      if (!document.hidden) fetchMetrics();
    }, 10_000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const handleToggle = async (canonical: boolean) => {
    setIsCanonical(canonical);
    setActivePersona(null);
    if (canonical) {
      try {
        const canonicalConfig = await getCanonicalView();
        setActiveConfig(canonicalConfig);
      } catch {
        setIsCanonical(false);
      }
    } else {
      setActiveConfig(config);
    }
  };

  const handlePersonaSelect = (personaConfig: DashboardConfig | null) => {
    if (!personaConfig) {
      setActivePersona(null);
      setIsCanonical(false);
      setActiveConfig(config);
      return;
    }
    const key = personaConfig.userId.replace('persona-', '');
    setActivePersona(key);
    setIsCanonical(false);
    setActiveConfig(personaConfig);
  };

  const handleAcceptSuggestion = (suggestion: RefinementSuggestion) => {
    setActiveConfig((prev) => {
      const existingIndex = prev.metrics.findIndex(
        (m) => m.id === suggestion.metricId
      );
      if (suggestion.type === 'add_metric' && existingIndex === -1) {
        const newMetric = {
          id: suggestion.metricId,
          label: suggestion.metricId.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          unit: '',
          chartType: 'number' as const,
          size: 'sm' as const,
          thresholds: {
            green: { max: 0 },
            yellow: { max: 0 },
            direction: 'lower-is-better' as const,
          },
          position: prev.metrics.length,
          visible: true,
          ...suggestion.suggestedChange,
        };
        return { ...prev, metrics: [...prev.metrics, newMetric] };
      }
      if (existingIndex !== -1) {
        const updated = prev.metrics.map((m, i) =>
          i === existingIndex ? { ...m, ...suggestion.suggestedChange } : m
        );
        return { ...prev, metrics: updated };
      }
      return prev;
    });
  };

  const handleConfigUpdate = (newConfig: DashboardConfig) => {
    setActiveConfig(newConfig);
    if (newConfig.globalFilters !== undefined) {
      setFilters(newConfig.globalFilters || {});
      setShowFilters(true);
    } else {
      const filterMetric = newConfig.metrics.find(m => m.filterBy);
      if (filterMetric?.filterBy) {
        setFilters(filterMetric.filterBy);
        setShowFilters(true);
      }
    }
    if (newConfig.metrics.some(m => m.chartType === 'breakdown' || m.chartType === 'heatmap')) {
      setShowFilters(true);
    }
  };

  const applyGlobalFilters = (metric: MetricConfig): MetricConfig => {
    if (metric.chartType === 'breakdown' || metric.chartType === 'heatmap') {
      return { ...metric, filterBy: { ...metric.filterBy, ...filters } };
    }
    return metric;
  };

  const visibleMetrics = activeConfig.metrics
    .filter((m) => m.visible)
    .sort((a, b) => a.position - b.position);

  const standardMetrics = visibleMetrics.filter(m => m.chartType !== 'breakdown' && m.chartType !== 'heatmap');
  const breakdownMetrics = visibleMetrics.filter(m => m.chartType === 'breakdown' || m.chartType === 'heatmap');

  const cols = activeConfig.layout?.columns ?? 3;
  const gridClass = `grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-${cols} lg:grid-cols-${cols}`;

  const refreshAgo = () => {
    const seconds = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
    if (seconds < 5) return 'Just now';
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  // Compute composite health score for executive summary
  const healthSummary = useMemo(() => {
    if (!snapshot) return { healthy: 0, warning: 0, critical: 0, score: 0 };
    let healthy = 0, warning = 0, critical = 0;
    for (const m of standardMetrics) {
      const val = snapshot.metrics[m.id];
      if (!val) continue;
      const status = getHealthStatus(val.current, m.thresholds);
      if (status === 'healthy') healthy++;
      else if (status === 'warning') warning++;
      else critical++;
    }
    const total = healthy + warning + critical;
    const score = total > 0 ? Math.round((healthy / total) * 100) : 0;
    return { healthy, warning, critical, score };
  }, [snapshot, standardMetrics]);

  // Top KPIs for executive summary (first 6 number-type metrics)
  const topKpis = standardMetrics.filter(m => m.chartType === 'number').slice(0, 6);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Dashboard header */}
      <div className="rounded-xl bg-white border border-slate-200/60 shadow-sm">
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  {activePersona
                    ? `${activePersona.charAt(0).toUpperCase() + activePersona.slice(1)} View`
                    : 'My Dashboard'}
                </h2>
                {!isCanonical && !activePersona && (
                  <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold text-accent-dark ring-1 ring-accent/15 uppercase tracking-wider">
                    Personalized
                  </span>
                )}
                {isCanonical && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-600/10 uppercase tracking-wider">
                    Standard
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-slate-500 max-w-2xl leading-relaxed">
                {activeConfig.interpretation.summary}
              </p>
              <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
                  </svg>
                  <span className="font-medium">{visibleMetrics.length} metrics</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Updated {refreshAgo()}</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => setShowThresholds(true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
                title="View threshold settings"
              >
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
                Thresholds
              </button>
              <PersonaSelector onSelect={handlePersonaSelect} activePersona={activePersona} />
              {activeConfig.layout?.showCanonicalToggle !== false && (
                <ViewToggle isCanonical={isCanonical} onToggle={handleToggle} />
              )}
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 px-5 border-t border-slate-100">
          {([
            { key: 'overview' as const, label: 'Executive Summary', icon: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z' },
            { key: 'metrics' as const, label: 'All Metrics', icon: 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setDashTab(tab.key)}
              className={`flex items-center gap-2 border-b-[3px] px-4 py-3 text-xs font-semibold transition-all -mb-px ${
                dashTab === tab.key
                  ? 'border-accent text-accent'
                  : 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
              }`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <FilterBar filters={filters} onFilterChange={handleFilterChange} />
      )}

      {/* Refinement banner */}
      <RefinementBanner userId={userId} onAccept={handleAcceptSuggestion} />

      {/* Loading state */}
      {loading && !snapshot && (
        <SkeletonGrid columns={cols} count={activeConfig.metrics.filter(m => m.visible).length || 6} />
      )}

      {/* Executive Summary tab */}
      {dashTab === 'overview' && snapshot && (
        <div className="space-y-5">
          {/* Composite health gauge + status cards */}
          <div className="grid gap-5 grid-cols-1 lg:grid-cols-5">
            {/* Composite score gauge */}
            <div className="metric-card p-6 lg:col-span-2 flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4">
                Overall Health Score
              </span>
              <div className="relative w-52 h-[120px]">
                <svg viewBox="0 0 200 120" className="w-full h-full">
                  <path
                    d="M 20 100 A 80 80 0 1 1 180 100"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="16"
                    strokeLinecap="round"
                  />
                  {healthSummary.score > 0 && (
                    <path
                      d={(() => {
                        const pct = healthSummary.score / 100;
                        const theta = Math.PI * (1 - pct);
                        const ex = 100 + 80 * Math.cos(theta);
                        const ey = 100 - 80 * Math.sin(theta);
                        return `M 20 100 A 80 80 0 ${pct > 0.5 ? 1 : 0} 1 ${ex} ${ey}`;
                      })()}
                      fill="none"
                      stroke={healthSummary.score >= 80 ? '#10b981' : healthSummary.score >= 50 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="16"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center" style={{ top: '42%' }}>
                  <span className="text-4xl font-bold text-slate-900">{healthSummary.score}%</span>
                  <span className={`text-xs font-semibold mt-0.5 ${
                    healthSummary.score >= 80 ? 'text-emerald-600' : healthSummary.score >= 50 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {healthSummary.score >= 80 ? 'On Track' : healthSummary.score >= 50 ? 'At Risk' : 'Off Track'}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-5 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  {healthSummary.healthy} Healthy
                </span>
                <span className="flex items-center gap-1.5 text-amber-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  {healthSummary.warning} Warning
                </span>
                <span className="flex items-center gap-1.5 text-red-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  {healthSummary.critical} Critical
                </span>
              </div>
            </div>

            {/* Top KPI summary cards */}
            {topKpis.slice(0, 3).map(metric => {
              const val = snapshot.metrics[metric.id] ?? EMPTY_VALUE;
              const status = getHealthStatus(val.current, metric.thresholds);
              const borderColor = status === 'healthy' ? 'border-l-emerald-500' : status === 'warning' ? 'border-l-amber-500' : 'border-l-red-500';
              const deltaPositive = val.delta >= 0;
              const isGoodDelta = metric.thresholds.direction === 'lower-is-better' ? val.delta <= 0 : val.delta >= 0;

              return (
                <div
                  key={metric.id}
                  className={`metric-card p-5 border-l-4 ${borderColor} cursor-pointer`}
                  onClick={() => setSelectedMetric(metric.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedMetric(metric.id); } }}
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {metric.label}
                  </span>
                  <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                    {formatValue(val.current, metric.unit)}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`flex items-center gap-1 text-sm font-semibold ${isGoodDelta ? 'text-emerald-600' : 'text-red-600'}`}>
                      <svg className={`h-3 w-3 ${deltaPositive ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                      </svg>
                      {Math.abs(val.delta).toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-slate-400">vs prior</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Remaining KPIs in compact row */}
          {topKpis.length > 3 && (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {topKpis.slice(3).map(metric => {
                const val = snapshot.metrics[metric.id] ?? EMPTY_VALUE;
                const status = getHealthStatus(val.current, metric.thresholds);
                const dotColor = status === 'healthy' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500';

                return (
                  <div
                    key={metric.id}
                    className="metric-card p-4 cursor-pointer text-center"
                    onClick={() => setSelectedMetric(metric.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedMetric(metric.id); } }}
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {metric.label}
                    </span>
                    <div className="mt-1.5 text-xl font-bold tracking-tight text-slate-900">
                      {formatValue(val.current, metric.unit)}
                    </div>
                    <div className="mt-1 flex items-center justify-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                      <span className="text-[10px] font-medium text-slate-500 capitalize">{status}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Chart metrics in overview */}
          {standardMetrics.filter(m => m.chartType !== 'number').length > 0 && (
            <>
              <div className="section-divider">
                <h3>Trend Charts</h3>
              </div>
              <div className={gridClass}>
                {standardMetrics.filter(m => m.chartType !== 'number').map(metric => {
                  const val = snapshot.metrics[metric.id] ?? EMPTY_VALUE;
                  return metric.chartType === 'gauge' ? (
                    <GaugeTile key={metric.id} metric={metric} value={val} userId={userId} />
                  ) : (
                    <ChartTile key={metric.id} metric={metric} value={val} userId={userId} />
                  );
                })}
              </div>
            </>
          )}

          {/* Breakdowns in overview */}
          {breakdownMetrics.length > 0 && (
            <>
              <div className="section-divider">
                <h3>Breakdowns</h3>
              </div>
              <div className={gridClass}>
                {breakdownMetrics.map((metric) => {
                  const filtered = applyGlobalFilters(metric);
                  if (metric.chartType === 'heatmap') {
                    return <HeatMapChart key={`${metric.id}-heatmap`} metric={filtered} />;
                  }
                  return (
                    <BreakdownChart key={`${metric.id}-${metric.breakdownBy}`} metric={filtered} />
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* All Metrics tab (full detail grid) */}
      {dashTab === 'metrics' && (
        <>
          {snapshot && standardMetrics.length > 0 && (
            <div className={gridClass}>
              {standardMetrics.map((metric) => {
                const val = snapshot.metrics[metric.id] ?? EMPTY_VALUE;
                const isChart =
                  metric.chartType === 'line' ||
                  metric.chartType === 'bar' ||
                  metric.chartType === 'area';
                const animClass = animatedIds.has(metric.id) ? 'animate-tile-enter' : '';

                const openDetail = () => setSelectedMetric(metric.id);
                const tile = metric.chartType === 'gauge' ? (
                  <GaugeTile key={metric.id} metric={metric} value={val} userId={userId} onClick={openDetail} />
                ) : isChart ? (
                  <ChartTile key={metric.id} metric={metric} value={val} userId={userId} onClick={openDetail} />
                ) : (
                  <MetricTile key={metric.id} metric={metric} value={val} userId={userId} onClick={openDetail} />
                );

                return animClass ? (
                  <div key={metric.id} className={animClass}>{tile}</div>
                ) : (
                  <div key={metric.id}>{tile}</div>
                );
              })}
            </div>
          )}

          {breakdownMetrics.length > 0 && (
            <div>
              <div className="section-divider">
                <h3>Breakdowns</h3>
              </div>
              <div className={gridClass}>
                {breakdownMetrics.map((metric) => {
                  const filtered = applyGlobalFilters(metric);
                  if (metric.chartType === 'heatmap') {
                    return <HeatMapChart key={`${metric.id}-heatmap`} metric={filtered} />;
                  }
                  return (
                    <BreakdownChart key={`${metric.id}-${metric.breakdownBy}`} metric={filtered} />
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Dashboard chat */}
      <DashboardChat
        userId={userId}
        onConfigUpdate={handleConfigUpdate}
        onAuthorKpi={onAuthorKpi}
      />

      {/* Threshold settings drawer */}
      {showThresholds && snapshot && (
        <ThresholdDrawer
          metrics={standardMetrics}
          snapshot={Object.fromEntries(
            Object.entries(snapshot.metrics).map(([k, v]) => [k, { current: v.current }])
          )}
          onClose={() => setShowThresholds(false)}
        />
      )}

      {/* Metric detail drawer */}
      {selectedMetric && snapshot && (() => {
        const metric = visibleMetrics.find(m => m.id === selectedMetric);
        if (!metric) return null;
        const val = snapshot.metrics[metric.id] ?? EMPTY_VALUE;
        return (
          <MetricDetailDrawer
            metric={metric}
            value={val}
            onClose={() => setSelectedMetric(null)}
          />
        );
      })()}
    </div>
  );
}
