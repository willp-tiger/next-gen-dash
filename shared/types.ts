// === Dashboard Configuration ===

export interface DashboardConfig {
  userId: string;
  createdAt: string;
  updatedAt: string;
  userPrompt: string;
  interpretation: Interpretation;
  metrics: MetricConfig[];
  layout: LayoutConfig;
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
  breakdownBy?: 'product_line' | 'country' | 'territory' | 'deal_size' | 'quarter';
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
  product_line?: string;
  country?: string;
  territory?: string;
  deal_size?: string;
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
    byProductLine: CategoryBreakdown;
    byCountry: CategoryBreakdown;
    byTerritory: CategoryBreakdown;
  };
}

export const PRODUCT_LINES = ['Classic Cars', 'Motorcycles', 'Planes', 'Ships', 'Trains', 'Trucks and Buses', 'Vintage Cars'] as const;
export type ProductLine = (typeof PRODUCT_LINES)[number];

export const TERRITORIES = ['NA', 'EMEA', 'APAC', 'Japan'] as const;
export type Territory = (typeof TERRITORIES)[number];

export const DEAL_SIZES = ['Small', 'Medium', 'Large'] as const;
export type DealSize = (typeof DEAL_SIZES)[number];

// === API Request/Response Types ===

export interface InterpretRequest {
  userId: string;
  prompt: string;
}

export interface InterpretResponse {
  config: DashboardConfig;
}

export type HealthStatus = 'healthy' | 'warning' | 'critical';

// === Available Metrics Registry ===

export const AVAILABLE_METRICS = [
  'total_revenue',
  'avg_order_value',
  'total_orders',
  'units_sold',
  'avg_price',
  'fulfillment_rate',
  'cancelled_order_rate',
  'avg_deal_size_value',
  'revenue_per_customer',
  'order_frequency',
  'product_line_count',
  'territory_revenue_share',
] as const;

export type MetricId = (typeof AVAILABLE_METRICS)[number];
