import { useState, useEffect, useRef, useMemo } from 'react';
import type {
  AlertRule,
  DashboardConfig,
  MetricsSnapshot,
  MetricConfig,
  FilterState,
  RefinementSuggestion,
} from 'shared/types';
import { getMetrics, getCanonicalView, updateDashboardConfig } from '../../api/client';
import { ViewToggle } from './ViewToggle';
import { MetricTile } from './MetricTile';
import { GaugeTile } from './GaugeTile';
import { ChartTile } from './ChartTile';
import { ScorecardTile } from './ScorecardTile';
import { AnnotatedLineTile } from './AnnotatedLineTile';
import { PivotTile } from './PivotTile';
import { FunnelTile } from './FunnelTile';
import { WaterfallTile } from './WaterfallTile';
import { TopNTile } from './TopNTile';
import { BulletTile } from './BulletTile';
import { CalendarHeatmapTile } from './CalendarHeatmapTile';
import { BreakdownChart } from './BreakdownChart';
import { HeatMapChart } from './HeatMapChart';
import { EmptyMetricTile } from './EmptyMetricTile';
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
  /** Display name used to attribute pinned notes to the logged-in user. */
  userName?: string;
  onAuthorKpi?: (phrase: string) => void;
}

type DashboardTab = 'overview' | 'metrics';


export function Dashboard({ config, userId, userName, onAuthorKpi }: DashboardProps) {
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
  // Brief "Saved" indicator that replaces the "Updated …" timestamp for 1.5s after a
  // background config persist. Cheap confidence-builder that filter / personalization
  // changes are sticking; otherwise the save is invisible.
  const [savedFlash, setSavedFlash] = useState(false);

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
      }).then(() => {
        setSavedFlash(true);
        window.setTimeout(() => setSavedFlash(false), 1500);
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

  // Inline the fetch into the effect so we can use a closure-local `cancelled` flag.
  // Without this, rapid filter changes can land out of order: the slower initial /api/metrics
  // call (no filters → larger query → slower response) returns AFTER the user-triggered
  // filtered call, overwriting the snapshot with stale all-time data and making the filter
  // appear broken even though the request was correct.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const SELF_FETCHING = new Set([
      'breakdown', 'heatmap', 'pivot', 'annotated_line', 'funnel', 'markdown',
      'waterfall', 'top_n', 'bullet', 'calendar_heatmap',
    ]);
    const ids = activeConfig.metrics
      .filter((m) => m.visible && !SELF_FETCHING.has(m.chartType))
      .map((m) => m.id);

    const run = async () => {
      try {
        const data = await getMetrics(ids, filters);
        if (cancelled) return;
        setSnapshot(data);
        setLastRefresh(new Date());
      } catch {
        // ignore fetch errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    const interval = setInterval(() => {
      if (!document.hidden && !cancelled) run();
    }, 10_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeConfig.metrics, filters]);

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

  // Undo for chat-driven mutations. When chat applies a config change, snapshot the prior
  // state so the user can revert with one click. Auto-dismisses after 8s. Toast renders
  // bottom-left to avoid colliding with the chat FAB in the bottom-right.
  const [pendingUndo, setPendingUndo] = useState<{ prior: DashboardConfig; summary: string } | null>(null);
  const undoTimer = useRef<number | null>(null);

  const summarizeDiff = (prev: DashboardConfig, next: DashboardConfig): string => {
    const prevIds = new Set(prev.metrics.filter(m => m.visible).map(m => m.id));
    const nextIds = new Set(next.metrics.filter(m => m.visible).map(m => m.id));
    const added = [...nextIds].filter(id => !prevIds.has(id));
    const removed = [...prevIds].filter(id => !nextIds.has(id));
    if (added.length === 1) {
      const m = next.metrics.find(x => x.id === added[0]);
      return m ? `Added “${m.label}”` : 'Tile added';
    }
    if (added.length > 1) return `${added.length} tiles added`;
    if (removed.length === 1) {
      const m = prev.metrics.find(x => x.id === removed[0]);
      return m ? `Removed “${m.label}”` : 'Tile removed';
    }
    if (removed.length > 1) return `${removed.length} tiles removed`;
    if (JSON.stringify(prev.globalFilters) !== JSON.stringify(next.globalFilters)) {
      return 'Filters changed';
    }
    return 'Dashboard updated';
  };

  const handleConfigUpdate = (newConfig: DashboardConfig) => {
    const prior = activeConfig;
    const summary = summarizeDiff(prior, newConfig);
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
    setPendingUndo({ prior, summary });
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setPendingUndo(null), 8000);
  };

  const handleUndo = () => {
    if (!pendingUndo) return;
    const prior = pendingUndo.prior;
    setActiveConfig(prior);
    setFilters(prior.globalFilters || {});
    setPendingUndo(null);
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    // Persist the rollback. If it fails, the UI state is still correct; next snapshot will
    // re-render against the prior config.
    if (!isCanonical && !activePersona) {
      updateDashboardConfig(userId, { ...prior, updatedAt: new Date().toISOString() }).catch(() => {});
    }
  };

  // === Notes ===
  // Notes live on MetricConfig and persist with the dashboard config. We treat the metric
  // id as the note bucket — if a user has two scorecards for the same KPI, they share notes
  // (intentional: notes are about the KPI, not the tile instance).
  const persistConfig = (next: DashboardConfig) => {
    setActiveConfig(next);
    if (isCanonical || activePersona) return;
    updateDashboardConfig(userId, { ...next, updatedAt: new Date().toISOString() }).catch(() => {});
  };

  const addNote = (metricId: string, body: string) => {
    const note = {
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      author: userName || 'You',
      body,
      createdAt: new Date().toISOString(),
    };
    const next: DashboardConfig = {
      ...activeConfig,
      metrics: activeConfig.metrics.map(m =>
        m.id === metricId ? { ...m, notes: [...(m.notes ?? []), note] } : m
      ),
    };
    persistConfig(next);
  };

  const removeNote = (metricId: string, noteId: string) => {
    const next: DashboardConfig = {
      ...activeConfig,
      metrics: activeConfig.metrics.map(m =>
        m.id === metricId ? { ...m, notes: (m.notes ?? []).filter(n => n.id !== noteId) } : m
      ),
    };
    persistConfig(next);
  };

  const setAlert = (metricId: string, rule: AlertRule | null) => {
    const next: DashboardConfig = {
      ...activeConfig,
      metrics: activeConfig.metrics.map(m =>
        m.id === metricId ? { ...m, alertRule: rule ?? undefined } : m
      ),
    };
    persistConfig(next);
  };

  // === Reorder + resize ===
  // Drag-and-drop reorder uses native HTML5 drag events. Tile wrappers in the All Metrics
  // tab are draggable; drop swaps the two metrics' positions. The Overview tab is not
  // draggable — its layout is derived (hero row, compact row) rather than persisted.
  const [dragMetricId, setDragMetricId] = useState<string | null>(null);
  const [dragOverMetricId, setDragOverMetricId] = useState<string | null>(null);

  const swapPositions = (aId: string, bId: string) => {
    if (aId === bId) return;
    const list = activeConfig.metrics;
    const a = list.find(m => m.id === aId);
    const b = list.find(m => m.id === bId);
    if (!a || !b) return;
    const aPos = a.position;
    const bPos = b.position;
    const next: DashboardConfig = {
      ...activeConfig,
      metrics: list.map(m => {
        if (m.id === aId) return { ...m, position: bPos };
        if (m.id === bId) return { ...m, position: aPos };
        return m;
      }),
    };
    persistConfig(next);
  };

  const cycleSize = (metricId: string) => {
    const order = ['sm', 'md', 'lg'] as const;
    const next: DashboardConfig = {
      ...activeConfig,
      metrics: activeConfig.metrics.map(m => {
        if (m.id !== metricId) return m;
        const idx = order.indexOf(m.size as 'sm' | 'md' | 'lg');
        const nextSize = order[(idx + 1) % order.length];
        return { ...m, size: nextSize };
      }),
    };
    persistConfig(next);
  };

  const hideMetric = (metricId: string) => {
    const next: DashboardConfig = {
      ...activeConfig,
      metrics: activeConfig.metrics.map(m =>
        m.id === metricId ? { ...m, visible: false } : m
      ),
    };
    persistConfig(next);
  };

  const colSpanFor = (size: 'sm' | 'md' | 'lg', cols: number): string => {
    if (size === 'lg') return cols >= 3 ? 'sm:col-span-2 lg:col-span-2' : 'sm:col-span-2';
    return '';
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

  const breakdownTypes = new Set(['breakdown', 'heatmap']);
  const standardMetrics = visibleMetrics.filter(m => !breakdownTypes.has(m.chartType));
  const breakdownMetrics = visibleMetrics.filter(m => breakdownTypes.has(m.chartType));

  const cols = activeConfig.layout?.columns ?? 3;
  const gridClass = `grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-${cols} lg:grid-cols-${cols}`;

  const sections = activeConfig.layout?.sections;

  // Composite key for tiles. A user can have multiple widgets that share the same metric id
  // (e.g. scorecard + waterfall + bullet for OTIF), so id alone collides in React keys.
  const tileKey = (metric: MetricConfig): string => {
    const parts = [metric.id, metric.chartType, String(metric.position)];
    if (metric.breakdownBy) parts.push(`bb:${metric.breakdownBy}`);
    if (metric.pivot) parts.push(`pv:${metric.pivot.rowDim}x${metric.pivot.colDim}`);
    if (metric.topN) parts.push(`tn:${metric.topN.dimension}:${metric.topN.n}:${metric.topN.ascending ? 'a' : 'd'}`);
    if (metric.calendar) parts.push(`cal:${metric.calendar.source}`);
    if (metric.funnel) parts.push(`fn:${metric.funnel.source}`);
    if (metric.waterfall) parts.push(`wf:${metric.waterfall.source}`);
    return parts.join('|');
  };

  // Unified tile dispatch: takes a metric and renders the right widget. Two categories:
  // - Self-fetching widgets read their own data from /api/widgets/* (no snapshot dependency).
  // - Snapshot-backed widgets read from MetricsSnapshot.metrics[id] and fall back to
  //   EmptyMetricTile when the value isn't loaded yet.
  const renderTile = (metric: MetricConfig) => {
    const openDetail = () => setSelectedMetric(metric.id);

    // Markdown is special: pure layout, no data, may span columns.
    if (metric.chartType === 'markdown') {
      return (
        <div className="metric-card p-5 col-span-1 lg:col-span-2 prose prose-sm max-w-none">
          {metric.label && <h3 className="text-sm font-bold text-slate-700">{metric.label}</h3>}
          <p className="text-xs text-slate-500 whitespace-pre-wrap">{metric.markdown || ''}</p>
        </div>
      );
    }

    // Self-fetching widgets — render directly without checking snapshot. Each component
    // owns its /api/widgets/* call.
    const selfFetching: Partial<Record<MetricConfig['chartType'], React.ReactNode>> = {
      annotated_line: <AnnotatedLineTile metric={metric} filters={filters} onClick={openDetail} />,
      pivot: <PivotTile metric={metric} filters={filters} onClick={openDetail} />,
      funnel: <FunnelTile metric={metric} filters={filters} onClick={openDetail} />,
      waterfall: <WaterfallTile metric={metric} filters={filters} onClick={openDetail} />,
      top_n: <TopNTile metric={metric} filters={filters} onClick={openDetail} />,
      bullet: <BulletTile metric={metric} filters={filters} onClick={openDetail} />,
      calendar_heatmap: <CalendarHeatmapTile metric={metric} filters={filters} onClick={openDetail} />,
    };
    const selfFetched = selfFetching[metric.chartType];
    if (selfFetched) return selfFetched;

    // Breakdown / heatmap — categorical, applies global filters before render.
    if (metric.chartType === 'breakdown' || metric.chartType === 'heatmap') {
      const filtered = applyGlobalFilters(metric);
      return metric.chartType === 'heatmap'
        ? <HeatMapChart metric={filtered} onClick={openDetail} />
        : <BreakdownChart metric={filtered} onClick={openDetail} />;
    }

    // Snapshot-backed tiles — gauge / scorecard / line / bar / area / number.
    const val = snapshot?.metrics[metric.id];
    if (!val) return <EmptyMetricTile metric={metric} onClick={openDetail} />;

    const snapshotTiles: Partial<Record<MetricConfig['chartType'], React.ReactNode>> = {
      gauge: <GaugeTile metric={metric} value={val} userId={userId} onClick={openDetail} />,
      scorecard: <ScorecardTile metric={metric} value={val} userId={userId} onClick={openDetail} />,
      line: <ChartTile metric={metric} value={val} userId={userId} onClick={openDetail} />,
      bar: <ChartTile metric={metric} value={val} userId={userId} onClick={openDetail} />,
      area: <ChartTile metric={metric} value={val} userId={userId} onClick={openDetail} />,
    };
    return snapshotTiles[metric.chartType] ?? <MetricTile metric={metric} value={val} userId={userId} onClick={openDetail} />;
  };

  // Tile wrapper used in the All Metrics tab. Adds drag-to-reorder, size cycling, hide,
  // and a col-span based on metric.size. Markdown tiles set their own col-span so we skip
  // the wrapper-applied span for them.
  const renderTileWrapped = (metric: MetricConfig, sectionCols: number) => {
    const animClass = animatedIds.has(metric.id) ? 'animate-tile-enter' : '';
    const spanClass = metric.chartType === 'markdown' ? '' : colSpanFor(metric.size, sectionCols);
    const isDragging = dragMetricId === metric.id;
    const isDragTarget = dragOverMetricId === metric.id && dragMetricId && dragMetricId !== metric.id;
    return (
      <div
        key={tileKey(metric)}
        draggable
        onDragStart={(e) => {
          setDragMetricId(metric.id);
          e.dataTransfer.effectAllowed = 'move';
          // Required for Firefox compatibility.
          try { e.dataTransfer.setData('text/plain', metric.id); } catch { /* ignore */ }
        }}
        onDragOver={(e) => {
          if (!dragMetricId || dragMetricId === metric.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (dragOverMetricId !== metric.id) setDragOverMetricId(metric.id);
        }}
        onDragLeave={() => {
          if (dragOverMetricId === metric.id) setDragOverMetricId(null);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragMetricId && dragMetricId !== metric.id) {
            swapPositions(dragMetricId, metric.id);
          }
          setDragMetricId(null);
          setDragOverMetricId(null);
        }}
        onDragEnd={() => {
          setDragMetricId(null);
          setDragOverMetricId(null);
        }}
        className={`group/wrap relative ${spanClass} ${animClass} ${isDragging ? 'opacity-40' : ''} ${
          isDragTarget ? 'ring-2 ring-accent ring-offset-2 rounded-xl' : ''
        } transition`}
      >
        {/* Tile action overlay — appears on hover, lets the user resize, hide, or grab the
            drag handle. Hidden in print. */}
        <div className="no-print pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between px-3 pt-3 opacity-0 group-hover/wrap:opacity-100 transition-opacity">
          <span
            className="pointer-events-auto cursor-grab active:cursor-grabbing rounded-md bg-white/90 px-1.5 py-1 text-[10px] font-bold text-slate-400 shadow-sm ring-1 ring-slate-200 select-none"
            title="Drag to reorder"
          >
            ⋮⋮
          </span>
          <div className="pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); cycleSize(metric.id); }}
              className="rounded-md bg-white/90 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm ring-1 ring-slate-200 hover:bg-white hover:text-slate-700"
              title={`Resize (currently ${metric.size})`}
            >
              {metric.size}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); hideMetric(metric.id); }}
              className="rounded-md bg-white/90 px-1.5 py-1 text-slate-400 shadow-sm ring-1 ring-slate-200 hover:bg-white hover:text-red-600"
              title="Hide from dashboard"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {renderTile(metric)}
      </div>
    );
  };

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

  // Top KPIs for executive summary — include scorecards alongside plain numbers since they
  // serve the same headline-tile role.
  const topKpis = standardMetrics
    .filter(m => m.chartType === 'number' || m.chartType === 'scorecard')
    .slice(0, 6);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Dashboard header */}
      <div className="rounded-xl bg-white border border-slate-200/60 shadow-sm">
        <div className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold tracking-tight text-slate-900">
                  {activePersona
                    ? `${activePersona.charAt(0).toUpperCase() + activePersona.slice(1)} View`
                    : 'My Dashboard'}
                </h2>
                {!isCanonical && !activePersona && (
                  <span
                    className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold text-accent-dark ring-1 ring-accent/15 uppercase tracking-wider"
                    title="Built from your conversation with Claude. Edit any time via the chat."
                  >
                    Personalized
                  </span>
                )}
                {isCanonical && (
                  <span
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-600/10 uppercase tracking-wider"
                    title="Default queue-health template — no personalization applied."
                  >
                    Standard
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-slate-500 max-w-2xl leading-relaxed">
                {activeConfig.interpretation.summary}
              </p>
              {/* Header status strip — replaces the oversized composite gauge that used to
                  dominate the Overview tab. Always visible so Director/Manager can see the
                  health rollup without scrolling. */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
                  </svg>
                  <span className="font-medium">{visibleMetrics.length} metrics</span>
                </span>
                {snapshot && (healthSummary.healthy + healthSummary.warning + healthSummary.critical > 0) && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span className="font-semibold">{healthSummary.healthy}</span> healthy
                    </span>
                    <span className="flex items-center gap-1.5 text-amber-600">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      <span className="font-semibold">{healthSummary.warning}</span> warning
                    </span>
                    <span className="flex items-center gap-1.5 text-red-600">
                      <span className="h-2 w-2 rounded-full bg-red-500" />
                      <span className="font-semibold">{healthSummary.critical}</span> critical
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className={`font-semibold ${
                      healthSummary.score >= 80 ? 'text-emerald-600' : healthSummary.score >= 50 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {healthSummary.score}% on track
                    </span>
                  </>
                )}
                <span className="text-slate-300">·</span>
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">{savedFlash ? 'Saved' : `Updated ${refreshAgo()}`}</span>
                </span>
              </div>
            </div>
            <div className="no-print flex items-center gap-2 flex-wrap sm:flex-nowrap sm:ml-4">
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
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
                title="Print or save as PDF for a board pack"
              >
                <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                </svg>
                Export
              </button>
              {/* Visual separator between settings (thresholds / export) and view-switch
                  controls (persona / standard). Three pill buttons of equal weight in a row
                  read as one cluster otherwise. */}
              <div className="h-6 w-px bg-slate-200" />
              <PersonaSelector onSelect={handlePersonaSelect} activePersona={activePersona} />
              {activeConfig.layout?.showCanonicalToggle !== false && (
                <ViewToggle isCanonical={isCanonical} onToggle={handleToggle} />
              )}
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="no-print flex gap-1 px-5 border-t border-slate-100">
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
        <div className="no-print">
          <FilterBar filters={filters} onFilterChange={handleFilterChange} />
        </div>
      )}

      {/* Refinement banner */}
      <div className="no-print">
        <RefinementBanner userId={userId} onAccept={handleAcceptSuggestion} />
      </div>

      {/* Loading state */}
      {loading && !snapshot && (
        <SkeletonGrid columns={cols} count={activeConfig.metrics.filter(m => m.visible).length || 6} />
      )}

      {/* Executive Summary tab — focused on headline scorecard/number tiles only. Trend charts,
          breakdowns, pivots, etc. live in All Metrics. Composite health rollup has moved to
          the dashboard header strip above so it's always visible. */}
      {dashTab === 'overview' && snapshot && (
        <div className="space-y-5">
          {/* Hero KPI row — first 4 headline tiles. Wider columns, status border, prior delta. */}
          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {topKpis.slice(0, 4).map(metric => {
              const val = snapshot.metrics[metric.id];
              if (!val) {
                return <EmptyMetricTile key={tileKey(metric)} metric={metric} onClick={() => setSelectedMetric(metric.id)} />;
              }
              const status = getHealthStatus(val.current, metric.thresholds);
              const borderColor = status === 'healthy' ? 'border-l-emerald-500' : status === 'warning' ? 'border-l-amber-500' : 'border-l-red-500';
              const deltaPositive = val.delta >= 0;
              const isGoodDelta = metric.thresholds.direction === 'lower-is-better' ? val.delta <= 0 : val.delta >= 0;

              return (
                <div
                  key={tileKey(metric)}
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
                      {Math.abs(val.deltaPct).toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-slate-400">vs prior</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Additional KPIs in compact row */}
          {topKpis.length > 4 && (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {topKpis.slice(4).map(metric => {
                const val = snapshot.metrics[metric.id];
                if (!val) {
                  return (
                    <div
                      key={tileKey(metric)}
                      className="metric-card p-4 cursor-pointer text-center"
                      onClick={() => setSelectedMetric(metric.id)}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {metric.label}
                      </span>
                      <div className="mt-1.5 text-xl font-bold tracking-tight text-slate-300">—</div>
                      <div className="mt-1 text-[10px] font-medium text-slate-400">no data</div>
                    </div>
                  );
                }
                const status = getHealthStatus(val.current, metric.thresholds);
                const dotColor = status === 'healthy' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500';

                return (
                  <div
                    key={tileKey(metric)}
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

          {/* CTA to switch to All Metrics — Overview is intentionally scoped to headline tiles,
              so users who want the full picture (trends, breakdowns, pivots, etc.) go here. */}
          {standardMetrics.some(m => m.chartType !== 'number' && m.chartType !== 'scorecard') || breakdownMetrics.length > 0 ? (
            <button
              onClick={() => setDashTab('metrics')}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-3 text-xs font-semibold text-slate-500 transition hover:border-accent hover:bg-accent/5 hover:text-accent-dark"
            >
              <span>See all {visibleMetrics.length} metrics — trends, breakdowns, and widgets</span>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </button>
          ) : null}
        </div>
      )}

      {/* All Metrics tab (full detail grid) */}
      {dashTab === 'metrics' && (
        <>
          {sections && sections.length > 0 ? (
            // Sectioned layout: render each section header + its assigned metrics.
            sections.map(section => {
              const sectionMetrics = visibleMetrics.filter(m => m.sectionId === section.id);
              if (sectionMetrics.length === 0) return null;
              const sectionCols = section.columns ?? cols;
              const sectionGridClass = `grid gap-5 grid-cols-1 sm:grid-cols-2 md:grid-cols-${sectionCols} lg:grid-cols-${sectionCols}`;
              return (
                <div key={section.id} className="space-y-3">
                  <div className="section-divider">
                    <h3>{section.label}</h3>
                    {section.description && (
                      <p className="text-[11px] font-medium text-slate-400 mt-0.5">{section.description}</p>
                    )}
                  </div>
                  <div className={sectionGridClass}>
                    {sectionMetrics.map(metric => renderTileWrapped(metric, sectionCols))}
                  </div>
                </div>
              );
            })
          ) : (
            <>
              {standardMetrics.length > 0 && (
                <div className={gridClass}>
                  {standardMetrics.map((metric) => renderTileWrapped(metric, cols))}
                </div>
              )}

              {breakdownMetrics.length > 0 && (
                <div>
                  <div className="section-divider">
                    <h3>Breakdowns</h3>
                  </div>
                  <div className={gridClass}>
                    {breakdownMetrics.map((metric) => renderTileWrapped(metric, cols))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Dashboard chat */}
      <div className="no-print">
        <DashboardChat
          userId={userId}
          onConfigUpdate={handleConfigUpdate}
          onAuthorKpi={onAuthorKpi}
        />
      </div>

      {/* Undo toast — bottom-left so the chat FAB (bottom-right) stays clear. */}
      {pendingUndo && (
        <div
          className="no-print fixed bottom-6 left-6 z-50 animate-slide-in"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 rounded-2xl bg-slate-900 px-4 py-2.5 text-white shadow-xl shadow-slate-900/30 ring-1 ring-white/10">
            <svg className="h-4 w-4 text-accent-light flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium">{pendingUndo.summary}</span>
            <button
              onClick={handleUndo}
              className="rounded-md px-2 py-1 text-xs font-bold text-accent-light hover:bg-white/10 transition"
            >
              Undo
            </button>
            <button
              onClick={() => { if (undoTimer.current) window.clearTimeout(undoTimer.current); setPendingUndo(null); }}
              className="text-slate-400 hover:text-white transition"
              aria-label="Dismiss"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

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

      {/* Metric detail drawer — opens for any selected tile, including self-fetching widgets
          (pivot/funnel/waterfall/calendar) where snapshot.metrics has no entry. */}
      {selectedMetric && (() => {
        const metric = visibleMetrics.find(m => m.id === selectedMetric);
        if (!metric) return null;
        const val = snapshot?.metrics[metric.id];
        return (
          <MetricDetailDrawer
            metric={metric}
            value={val}
            filters={filters}
            noteAuthor={userName}
            onAddNote={addNote}
            onRemoveNote={removeNote}
            onSetAlert={setAlert}
            onClose={() => setSelectedMetric(null)}
          />
        );
      })()}
    </div>
  );
}
