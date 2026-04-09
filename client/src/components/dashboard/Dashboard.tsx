import { useState, useEffect, useCallback } from 'react';
import type {
  DashboardConfig,
  MetricsSnapshot,
  MetricValue,
  RefinementSuggestion,
} from 'shared/types';
import { getMetrics, getCanonicalView } from '../../api/client';
import { ViewToggle } from './ViewToggle';
import { MetricTile } from './MetricTile';
import { ChartTile } from './ChartTile';
import { RefinementBanner } from '../refinement/RefinementBanner';

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

  // Keep user config in sync with prop
  useEffect(() => {
    if (!isCanonical) setActiveConfig(config);
  }, [config, isCanonical]);

  const fetchMetrics = useCallback(async () => {
    try {
      const ids = activeConfig.metrics
        .filter((m) => m.visible)
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
        // fallback to user config
        setIsCanonical(false);
      }
    } else {
      setActiveConfig(config);
    }
  };

  const handleAcceptSuggestion = (suggestion: RefinementSuggestion) => {
    // Apply the suggested change to the active config
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

  const visibleMetrics = activeConfig.metrics
    .filter((m) => m.visible)
    .sort((a, b) => a.position - b.position);

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

      {/* Refinement banner */}
      <RefinementBanner userId={userId} onAccept={handleAcceptSuggestion} />

      {/* Loading state */}
      {loading && !snapshot && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
        </div>
      )}

      {/* Metrics grid */}
      {snapshot && (
        <div className={gridClass}>
          {visibleMetrics.map((metric) => {
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
    </div>
  );
}
