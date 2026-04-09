import { useState, useEffect, useCallback } from 'react';
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
import { ChartTile } from './ChartTile';
import { BreakdownChart } from './BreakdownChart';
import { FilterBar } from './FilterBar';
import { RefinementBanner } from '../refinement/RefinementBanner';
import { DashboardChat } from './DashboardChat';

interface DashboardProps {
  config: DashboardConfig;
  userId: string;
}

const EMPTY_VALUE: MetricValue = { current: 0, trend: [], delta: 0 };

export function Dashboard({ config, userId }: DashboardProps) {
  const [isCanonical, setIsCanonical] = useState(false);
  const [activeConfig, setActiveConfig] = useState<DashboardConfig>(config);
  const [snapshot, setSnapshot] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});
  const [showFilters, setShowFilters] = useState(false);

  // Keep user config in sync with prop
  useEffect(() => {
    if (!isCanonical) setActiveConfig(config);
  }, [config, isCanonical]);

  // Show filter bar when any metric has a filter or breakdown
  useEffect(() => {
    const hasBreakdown = activeConfig.metrics.some(m => m.chartType === 'breakdown' || m.filterBy);
    if (hasBreakdown && !showFilters) setShowFilters(true);
  }, [activeConfig.metrics, showFilters]);

  const fetchMetrics = useCallback(async () => {
    try {
      const ids = activeConfig.metrics
        .filter((m) => m.visible && m.chartType !== 'breakdown')
        .map((m) => m.id);
      const data = await getMetrics(ids);
      setSnapshot(data);
    } catch {
      // ignore fetch errors
    } finally {
      setLoading(false);
    }
  }, [activeConfig.metrics]);

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
    // If new config has filters, apply them
    const filterMetric = newConfig.metrics.find(m => m.filterBy);
    if (filterMetric?.filterBy) {
      setFilters(filterMetric.filterBy);
      setShowFilters(true);
    }
    // If any breakdown chart added, show filter bar
    if (newConfig.metrics.some(m => m.chartType === 'breakdown')) {
      setShowFilters(true);
    }
  };

  // Apply global filters to breakdown metrics
  const applyGlobalFilters = (metric: MetricConfig): MetricConfig => {
    if (metric.chartType === 'breakdown') {
      return { ...metric, filterBy: { ...metric.filterBy, ...filters } };
    }
    return metric;
  };

  const visibleMetrics = activeConfig.metrics
    .filter((m) => m.visible)
    .sort((a, b) => a.position - b.position);

  const standardMetrics = visibleMetrics.filter(m => m.chartType !== 'breakdown');
  const breakdownMetrics = visibleMetrics.filter(m => m.chartType === 'breakdown');

  const cols = activeConfig.layout?.columns ?? 3;
  const gridClass = `grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-${cols} lg:grid-cols-${cols}`;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Dashboard</h2>
        {activeConfig.layout?.showCanonicalToggle !== false && (
          <ViewToggle isCanonical={isCanonical} onToggle={handleToggle} />
        )}
      </div>

      {/* Filter bar - shown when breakdown charts exist */}
      {showFilters && (
        <FilterBar filters={filters} onFilterChange={setFilters} />
      )}

      {/* Refinement banner */}
      <RefinementBanner userId={userId} onAccept={handleAcceptSuggestion} />

      {/* Loading state */}
      {loading && !snapshot && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        </div>
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

            return isChart ? (
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
            {breakdownMetrics.map((metric) => (
              <BreakdownChart
                key={`${metric.id}-${metric.breakdownBy}`}
                metric={applyGlobalFilters(metric)}
              />
            ))}
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
