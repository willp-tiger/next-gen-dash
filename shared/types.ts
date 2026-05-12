// === User Profile ===

export interface UserProfile {
  email: string;
  displayName: string;
  role?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface AuthResponse {
  profile: UserProfile;
  hasConfig: boolean;
  config?: DashboardConfig;
}

// === Dashboard Configuration ===

export interface DashboardConfig {
  userId: string;
  createdAt: string;
  updatedAt: string;
  userPrompt: string;
  interpretation: Interpretation;
  metrics: MetricConfig[];
  layout: LayoutConfig;
  globalFilters?: FilterState;
}

export interface Interpretation {
  summary: string;
  priorities: Priority[];
}

export interface Priority {
  label: string;
  weight: number;
  reasoning: string;
}

export type ChartType =
  | 'number'
  | 'line'
  | 'bar'
  | 'area'
  | 'gauge'
  | 'breakdown'
  | 'heatmap'
  | 'scorecard'
  | 'annotated_line'
  | 'pivot'
  | 'funnel'
  | 'markdown'
  | 'waterfall'
  | 'top_n'
  | 'bullet'
  | 'calendar_heatmap';

export type TopNDimension =
  | 'supplier' | 'customer' | 'sku' | 'warehouse' | 'carrier' | 'category';

export type PivotDimension =
  | 'category' | 'destination_region' | 'warehouse_id'
  | 'customer_segment' | 'abc_class' | 'supplier_tier';

export interface MetricConfig {
  id: string;
  label: string;
  unit: string;
  chartType: ChartType;
  size: 'sm' | 'md' | 'lg';
  thresholds: ThresholdConfig;
  position: number;
  visible: boolean;
  reasoning?: string;
  breakdownBy?: PivotDimension;
  filterBy?: FilterState;
  /** Section the tile belongs to. Matches LayoutConfig.sections[].id. */
  sectionId?: string;
  /** Pivot widget config: rows × cols of a metric. */
  pivot?: { rowDim: PivotDimension; colDim: PivotDimension };
  /** Funnel widget config: which lifecycle to render. */
  funnel?: { source: 'shipment_lifecycle' };
  /** Waterfall widget config: which prior-vs-current bridge to render. */
  waterfall?: { source: 'otif_bridge' };
  /** Top-N widget config: rank labels along a dimension by the metric value. */
  topN?: { dimension: TopNDimension; n: number; ascending?: boolean };
  /** Calendar heatmap config: how to aggregate daily values. */
  calendar?: { source: 'shipments_per_day' | 'exceptions_per_day' };
  /** Optional explicit target (when not derivable from green threshold). */
  target?: number;
  /** Markdown widget body (only used when chartType === 'markdown'). */
  markdown?: string;
  /** User-authored notes pinned to this tile. */
  notes?: TileNote[];
}

export interface TileNote {
  id: string;
  /** Display name of the author at the time of writing. */
  author: string;
  /** Plain text body. */
  body: string;
  createdAt: string;
}

export interface ThresholdConfig {
  green: { max: number };
  yellow: { max: number };
  direction: 'lower-is-better' | 'higher-is-better';
}

export interface SectionConfig {
  id: string;
  label: string;
  description?: string;
  /** Optional column override for this section (otherwise inherits LayoutConfig.columns). */
  columns?: 2 | 3 | 4;
}

export interface LayoutConfig {
  columns: 2 | 3 | 4;
  showCanonicalToggle: boolean;
  /** Optional named sections; if absent, the dashboard renders as a flat grid. */
  sections?: SectionConfig[];
}

// === Metrics Data ===

export interface MetricsSnapshot {
  timestamp: string;
  metrics: Record<string, MetricValue>;
}

export interface MetricValue {
  current: number;
  trend: number[];
  delta: number;
  /** Optional comparison vs prior period / prior year, populated when FilterState.compareTo is set. */
  comparison?: {
    previous: number;
    deltaAbs: number;
    deltaPct: number;
    basis: 'prior_period' | 'prior_year';
    basisLabel: string;
  };
}

// === Interaction Tracking ===

export interface InteractionEvent {
  userId: string;
  metricId: string;
  action: 'view' | 'hover' | 'click' | 'expand';
  timestamp: string;
  durationMs?: number;
}

export interface RefinementSuggestion {
  id: string;
  userId: string;
  type: 'add_metric' | 'promote_metric' | 'adjust_threshold' | 'remove_metric';
  metricId: string;
  reason: string;
  suggestedChange: Partial<MetricConfig>;
  status: 'pending' | 'accepted' | 'dismissed';
}

// === Filter Types ===

export interface FilterState {
  destination_region?: string;       // NA | EMEA | APAC | LATAM
  warehouse_id?: string;             // WH-NA-01 | WH-EMEA-02 | ...
  customer_segment?: string;         // Enterprise | Mid-Market | SMB
  sku_category?: string;             // Fasteners | Bearings | Hydraulics | Electrical | Safety | MRO | Cutting Tools
  supplier_tier?: string;            // Strategic | Preferred | Tactical
  // ISO date strings (YYYY-MM-DD). Inclusive date range applied per fact table's natural date column.
  dateStart?: string;
  dateEnd?: string;
  /** Comparison basis for scorecards. 'none' (default) skips the comparison query. */
  compareTo?: 'none' | 'prior_period' | 'prior_year';
}

export interface CategoryBreakdown {
  category: string;
  values: { label: string; value: number }[];
}

export interface CategoricalSnapshot {
  timestamp: string;
  filters: FilterState;
  metrics: Record<string, MetricValue>;
  breakdowns: {
    byCategory: CategoryBreakdown;
    byRegion: CategoryBreakdown;
    byWarehouse: CategoryBreakdown;
    bySegment: CategoryBreakdown;
  };
}

// === Supply chain enums ===

export const SKU_CATEGORIES = [
  'Fasteners', 'Bearings', 'Hydraulics', 'Electrical', 'Safety', 'MRO', 'Cutting Tools',
] as const;
export type SkuCategory = (typeof SKU_CATEGORIES)[number];

export const REGIONS = ['NA', 'EMEA', 'APAC', 'LATAM'] as const;
export type Region = (typeof REGIONS)[number];

export const CUSTOMER_SEGMENTS = ['Enterprise', 'Mid-Market', 'SMB'] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export const SUPPLIER_TIERS = ['Strategic', 'Preferred', 'Tactical'] as const;
export type SupplierTier = (typeof SUPPLIER_TIERS)[number];

export const ABC_CLASSES = ['A', 'B', 'C'] as const;
export type AbcClass = (typeof ABC_CLASSES)[number];

// === Widget data shapes ===

export interface AnnotationEvent {
  id: string;
  /** ISO date or date range start (YYYY-MM-DD). */
  date: string;
  /** ISO date for the end of the window (omit for point events). */
  endDate?: string;
  label: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  /** Optional metric IDs this annotation is most relevant to. Empty = applies broadly. */
  affectsMetrics?: string[];
}

export interface PivotSnapshot {
  metricId: string;
  rowDim: PivotDimension;
  colDim: PivotDimension;
  rowLabels: string[];
  colLabels: string[];
  /** [row][col] value or null when no data. */
  grid: (number | null)[][];
  /** Min/max across non-null cells (for color scaling). */
  min: number;
  max: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
  /** Cumulative drop-off vs. the first stage, expressed as a percentage. */
  dropoffPct: number;
}

export interface FunnelSnapshot {
  source: 'shipment_lifecycle';
  stages: FunnelStage[];
}

export interface TimeseriesPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  value: number;
}

export interface TimeseriesSnapshot {
  metricId: string;
  grain: 'daily' | 'weekly' | 'monthly';
  points: TimeseriesPoint[];
  annotations: AnnotationEvent[];
}

export interface WaterfallStage {
  /** Short label for the column ('Prior', 'On-time', 'In-full', 'Exceptions', 'Current'). */
  label: string;
  /** 'anchor' for start/end columns; 'positive' / 'negative' for impact columns. */
  kind: 'anchor' | 'positive' | 'negative';
  /** For anchors: the absolute value. For impacts: the signed delta in absolute units. */
  value: number;
  /** Cumulative running total for layout (anchors equal value; impacts shift it). */
  runningTotal: number;
}

export interface WaterfallSnapshot {
  source: 'otif_bridge';
  /** Units of the bridge values (e.g. 'percent' for OTIF). */
  unit: string;
  /** Sum of impacts (signed). Should equal current - prior. */
  netDelta: number;
  stages: WaterfallStage[];
}

export interface TopNRow {
  rank: number;
  /** Stable id (e.g. supplier_id). */
  id: string;
  /** Display label. */
  label: string;
  value: number;
  /** 0..1 share of max across the returned rows, for the data bar. */
  share: number;
}

export interface TopNSnapshot {
  metricId: string;
  dimension: TopNDimension;
  ascending: boolean;
  rows: TopNRow[];
}

export interface BulletSnapshot {
  metricId: string;
  /** Current value. */
  actual: number;
  /** Target (typically the green threshold). */
  target: number;
  /** Qualitative bands in display order. Each band has a maximum and a color hint. */
  bands: { max: number; color: 'critical' | 'warning' | 'healthy' }[];
  direction: 'higher-is-better' | 'lower-is-better';
}

export interface CalendarCell {
  date: string;            // YYYY-MM-DD
  value: number;
}

export interface CalendarSnapshot {
  source: 'shipments_per_day' | 'exceptions_per_day';
  /** Inclusive date range covered. */
  dateStart: string;
  dateEnd: string;
  cells: CalendarCell[];
  min: number;
  max: number;
}

// === Drill-to-detail ===

export type DrillSourceTable =
  | 'shipments'
  | 'purchase_orders'
  | 'inventory_snapshots'
  | 'exceptions'
  | 'returns';

export interface DrillColumn {
  /** Column key in the row object. */
  key: string;
  /** Display label. */
  label: string;
  /** How to format / align the column. */
  kind: 'text' | 'number' | 'currency' | 'percent' | 'date' | 'badge';
  /** Hint to highlight the column the metric is most about (e.g., days_late for OTIF). */
  primary?: boolean;
}

export interface DrillSnapshot {
  metricId: string;
  /** Which fact table the rows came from. */
  source: DrillSourceTable;
  /** Plain-English description of what the rows represent (e.g. "Late or partial shipments"). */
  rowDescription: string;
  /** Total matching rows in the seed (before limit). */
  totalRows: number;
  /** Limit applied to rows[]. */
  limit: number;
  columns: DrillColumn[];
  /** Each row is a flat dict keyed by column.key. */
  rows: Record<string, string | number | null>[];
}

// === API Request/Response Types ===

export interface InterpretRequest {
  userId: string;
  prompt: string;
}

export interface InterpretResponse {
  config: DashboardConfig;
}

export type HealthStatus = 'healthy' | 'warning' | 'critical';

// === Available KPI Registry (must match seeded kpi_definitions) ===

export const AVAILABLE_METRICS = [
  // Fulfillment
  'otif_rate',
  'perfect_order_rate',
  'order_cycle_time',
  'line_fill_rate',
  'backorder_rate',
  'same_day_ship_rate',
  // Inventory
  'inventory_turns',
  'days_of_supply',
  'stockout_rate',
  'excess_inventory_value',
  'critical_sku_stockout_rate',
  // Procurement
  'supplier_otd',
  'supplier_otif',
  'po_cycle_time',
  'avg_lead_time',
  'supplier_defect_rate',
  // Logistics
  'carrier_otd',
  'avg_transit_days',
  'damage_rate',
  // Operations
  'exception_rate',
  'avg_exception_mttr',
  'return_rate',
  'warehouse_capacity_util',
] as const;

export type MetricId = (typeof AVAILABLE_METRICS)[number];
