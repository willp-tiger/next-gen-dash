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
  chartType: 'number' | 'line' | 'bar' | 'area' | 'gauge';
  size: 'sm' | 'md' | 'lg';
  thresholds: ThresholdConfig;
  position: number;
  visible: boolean;
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
