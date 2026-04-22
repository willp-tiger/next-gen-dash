import { useState, useEffect, useCallback, useRef } from 'react';
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

interface DashboardProps {
  config: DashboardConfig;
  userId: string;
  onAuthorKpi?: (phrase: string) => void;
}

const EMPTY_VALUE: MetricValue = { current: 0, trend: [], delta: 0 };

export function Dashboard({ config, userId, onAuthorKpi }: DashboardProps) {
  const [isCanonical, setIsCanonical] = useState(false);
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [activeConfig, setActiveConfig] = useState<DashboardConfig>(config);
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});
  const [showFilters, setShowFilters] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

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
    if (newIds.size > 0) {
      setAnimatedIds(newIds);
      const timer = setTimeout(() => setAnimatedIds(new Set()), 500);
      return () => clearTimeout(timer);
    }
    prevMetricIds.current = currentIds;
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
    const interval = setInterval(fetchMetrics, 10_000);
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

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Dashboard header */}
      <div className="rounded-xl bg-white border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {activePersona
                  ? `${activePersona.charAt(0).toUpperCase() + activePersona.slice(1)} View`
                  : 'My Dashboard'}
              </h2>
              {!isCanonical && !activePersona && (
                <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-600 ring-1 ring-indigo-600/10 uppercase tracking-wider">
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
              <span className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
                <span className="font-medium">{cols}-column layout</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4">
            <PersonaSelector onSelect={handlePersonaSelect} activePersona={activePersona} />
            {activeConfig.layout?.showCanonicalToggle !== false && (
              <ViewToggle isCanonical={isCanonical} onToggle={handleToggle} />
            )}
          </div>
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

      {/* Standard metrics grid */}
      {snapshot && standardMetrics.length > 0 && (
        <div className={gridClass}>
          {standardMetrics.map((metric) => {
            const val = snapshot.metrics[metric.id] ?? EMPTY_VALUE;
            const isChart =
              metric.chartType === 'line' ||
              metric.chartType === 'bar' ||
              metric.chartType === 'area';
            const animClass = animatedIds.has(metric.id) ? 'animate-tile-enter' : '';

            const tile = metric.chartType === 'gauge' ? (
              <GaugeTile
                key={metric.id}
                metric={metric}
                value={val}
                userId={userId}
              />
            ) : isChart ? (
              <ChartTile
                key={metric.id}
                metric={metric}
                value={val}
                userId={userId}
              />
            ) : (
              <MetricTile
                key={metric.id}
                metric={metric}
                value={val}
                userId={userId}
              />
            );

            return animClass ? (
              <div key={metric.id} className={animClass}>{tile}</div>
            ) : (
              <div key={metric.id}>{tile}</div>
            );
          })}
        </div>
      )}

      {/* Breakdown charts section */}
      {breakdownMetrics.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Breakdowns
            </h3>
            <div className="flex-1 border-t border-slate-200" />
          </div>
          <div className={gridClass}>
            {breakdownMetrics.map((metric) => {
              const filtered = applyGlobalFilters(metric);
              if (metric.chartType === 'heatmap') {
                return <HeatMapChart key={`${metric.id}-heatmap`} metric={filtered} />;
              }
              return (
                <BreakdownChart
                  key={`${metric.id}-${metric.breakdownBy}`}
                  metric={filtered}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Dashboard chat */}
      <DashboardChat
        userId={userId}
        onConfigUpdate={handleConfigUpdate}
        onAuthorKpi={onAuthorKpi}
      />
    </div>
  );
}
