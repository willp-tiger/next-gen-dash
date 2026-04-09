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
  chartType: 'number' | 'line' | 'bar' | 'area' | 'gauge' | 'breakdown';
  size: 'sm' | 'md' | 'lg';
  thresholds: ThresholdConfig;
  position: number;
  visible: boolean;
  breakdownBy?: 'make' | 'model' | 'date';
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

// === Interaction Tracking (Phase 3) ===

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

// === Categorical / Filter Types ===

export interface FilterState {
  make?: string;
  model?: string;
  dateFrom?: string;
  dateTo?: string;
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
    byMake: CategoryBreakdown;
    byModel: CategoryBreakdown;
    byDate: CategoryBreakdown;
  };
}

export const VEHICLE_MAKES = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'BMW', 'Tesla'] as const;
export type VehicleMake = (typeof VEHICLE_MAKES)[number];

export const VEHICLE_MODELS: Record<VehicleMake, string[]> = {
  Toyota: ['Camry', 'Corolla', 'RAV4', 'Highlander'],
  Honda: ['Civic', 'Accord', 'CR-V', 'Pilot'],
  Ford: ['F-150', 'Mustang', 'Explorer', 'Escape'],
  Chevrolet: ['Silverado', 'Malibu', 'Equinox', 'Tahoe'],
  BMW: ['3 Series', '5 Series', 'X3', 'X5'],
  Tesla: ['Model 3', 'Model Y', 'Model S', 'Model X'],
};

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
  'avg_wait_time',
  'max_wait_time',
  'queue_depth',
  'staffing_ratio',
  'sla_compliance',
  'escalation_rate',
  'first_contact_resolution',
  'cost_per_ticket',
  'csat_score',
  'agent_utilization',
  'abandon_rate',
  'avg_handle_time',
] as const;

export type MetricId = (typeof AVAILABLE_METRICS)[number];
