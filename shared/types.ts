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

export interface MetricConfig {
  id: string;
  label: string;
  unit: string;
  chartType: 'number' | 'line' | 'bar' | 'area' | 'gauge' | 'breakdown' | 'heatmap';
  size: 'sm' | 'md' | 'lg';
  thresholds: ThresholdConfig;
  position: number;
  visible: boolean;
  reasoning?: string;
  breakdownBy?: 'category' | 'destination_region' | 'warehouse_id' | 'customer_segment' | 'abc_class' | 'supplier_tier';
  filterBy?: FilterState;
}

export interface ThresholdConfig {
  green: { max: number };
  yellow: { max: number };
  direction: 'lower-is-better' | 'higher-is-better';
}

export interface LayoutConfig {
  columns: 2 | 3 | 4;
  showCanonicalToggle: boolean;
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
