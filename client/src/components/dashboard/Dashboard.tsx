import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  DashboardConfig,
  MetricsSnapshot,
  MetricValue,
  MetricConfig,
  FilterState,
  RefinementSuggestion,
} from 'shared/types';
import { getMetrics, getCanonicalView } from '../../api/client';
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
}

const EMPTY_VALUE: MetricValue = { current: 0, trend: [], delta: 0 };

export function Dashboard({ config, userId }: DashboardProps) {
  const [isCanonical, setIsCanonical] = useState(false);
  const [activePersona, setActivePersona] = useState<string | null>(null);
  const [activeConfig, setActiveConfig] = useState<DashboardConfig>(config);
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});
  const [showFilters, setShowFilters] = useState(false);

  // Track previous metric IDs for animation
  const prevMetricIds = useRef<Set<string>>(new Set());
  const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set());

  // Detect new/changed metrics and animate them
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

  // Keep user config in sync with prop
  useEffect(() => {
    if (!isCanonical) {
      setActiveConfig(config);
      if (config.globalFilters) setFilters(config.globalFilters);
    }
  }, [config, isCanonical]);

  // Show filter bar when any metric has a filter or breakdown or a global filter is set
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
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [activeConfig.metrics, filters]);

  // Initial fetch + auto-refresh every 10s
  useEffect(() => {
    setLoading(true);
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10_000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  // Toggle canonical view
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
    // Determine persona key from userId
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
    // Prefer global filters from chat; fall back to breakdown's filterBy
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

  // Apply global filters to breakdown/heatmap metrics
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
  const gridClass = `grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-${cols} lg:grid-cols-${cols}`;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {activePersona
              ? `${activePersona.charAt(0).toUpperCase() + activePersona.slice(1)} View`
              : 'Dashboard'}
          </h2>
          {activePersona && (
            <p className="text-xs text-gray-500">{activeConfig.interpretation.summary}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <PersonaSelector onSelect={handlePersonaSelect} activePersona={activePersona} />
          {activeConfig.layout?.showCanonicalToggle !== false && (
            <ViewToggle isCanonical={isCanonical} onToggle={handleToggle} />
          )}
        </div>
      </div>

      {/* Filter bar - shown when breakdown charts exist */}
      {showFilters && (
        <FilterBar filters={filters} onFilterChange={setFilters} />
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
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Breakdowns
          </h3>
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

      {/* Dashboard chat for modifying KPIs */}
      <DashboardChat
        userId={userId}
        onConfigUpdate={handleConfigUpdate}
      />
    </div>
  );
}
