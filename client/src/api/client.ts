import type {
  DashboardConfig,
  InterpretResponse,
  MetricsSnapshot,
  InteractionEvent,
  RefinementSuggestion,
  CategoricalSnapshot,
  FilterState,
} from 'shared/types';

const BASE_URL = '/api';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let body: unknown = text;
    try { body = JSON.parse(text); } catch { /* leave as text */ }
    throw new ApiError(res.status, body, `API ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export function interpretPrompt(userId: string, prompt: string) {
  return fetchJson<InterpretResponse>('/interpret', {
    method: 'POST',
    body: JSON.stringify({ userId, prompt }),
  });
}

export function chatMessage(userId: string, message: string) {
  return fetchJson<{ reply: string; isReady: boolean; transcript?: string }>('/chat', {
    method: 'POST',
    body: JSON.stringify({ userId, message }),
  });
}

export function getDashboardConfig(userId: string) {
  return fetchJson<DashboardConfig>(`/dashboard/${userId}`);
}

export async function updateDashboardConfig(userId: string, config: DashboardConfig) {
  const data = await fetchJson<{ config: DashboardConfig }>(`/dashboard/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
  return data.config;
}

function buildFilterParams(params: URLSearchParams, filters?: FilterState) {
  if (!filters) return;
  if (filters.product_line) params.set('product_line', filters.product_line);
  if (filters.country) params.set('country', filters.country);
  if (filters.territory) params.set('territory', filters.territory);
  if (filters.deal_size) params.set('deal_size', filters.deal_size);
  if (filters.dateStart) params.set('dateStart', filters.dateStart);
  if (filters.dateEnd) params.set('dateEnd', filters.dateEnd);
}

export function getMetrics(metricIds?: string[], filters?: FilterState) {
  const params = new URLSearchParams();
  if (metricIds?.length) params.set('metricIds', metricIds.join(','));
  buildFilterParams(params, filters);
  const qs = params.toString();
  return fetchJson<MetricsSnapshot>(`/metrics${qs ? '?' + qs : ''}`);
}

export async function getCanonicalView(): Promise<DashboardConfig> {
  const data = await fetchJson<{ config: DashboardConfig; snapshot: MetricsSnapshot }>('/metrics/canonical');
  return data.config;
}

export function getPersonaConfigs() {
  return fetchJson<Record<string, DashboardConfig>>('/metrics/personas');
}

export function logInteraction(event: InteractionEvent) {
  return fetchJson<void>('/refinement/log', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

export async function getRefinementSuggestions(userId: string): Promise<RefinementSuggestion[]> {
  const data = await fetchJson<{ suggestions: RefinementSuggestion[]; totalInteractions: number }>(
    `/refinement/suggestions/${userId}`
  );
  return data.suggestions;
}

export function updateSuggestion(
  id: string,
  status: 'accepted' | 'dismissed',
  extra?: { userId: string; type: string; metricId: string }
) {
  return fetchJson<RefinementSuggestion>(`/refinement/suggestions/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status, ...extra }),
  });
}

export function getCategoricalMetrics(metricIds?: string[], filters?: FilterState) {
  const params = new URLSearchParams();
  if (metricIds?.length) params.set('metricIds', metricIds.join(','));
  buildFilterParams(params, filters);
  const qs = params.toString();
  return fetchJson<CategoricalSnapshot>(`/metrics/categorical${qs ? '?' + qs : ''}`);
}

export function getAvailableFilters() {
  return fetchJson<{
    productLines: string[];
    countries: string[];
    territories: string[];
    dealSizes: string[];
    minDate: string | null;
    maxDate: string | null;
  }>('/metrics/filters');
}

export function dashboardChat(userId: string, message: string) {
  return fetchJson<{ message: string; action: string | null; config: DashboardConfig | null }>(
    `/dashboard-chat/${userId}`,
    {
      method: 'POST',
      body: JSON.stringify({ message }),
    }
  );
}

export function resetDashboardChat(userId: string) {
  return fetchJson<{ ok: true }>(`/dashboard-chat/${userId}`, { method: 'DELETE' });
}

export interface KpiCandidatePayload {
  displayName: string;
  description: string;
  kpiId: string;
  unit: string;
  direction: 'higher-is-better' | 'lower-is-better';
  sqlLogic: string;
  grain: string;
  dimensions: string[];
  thresholds: { greenMax: number; yellowMax: number };
}

export function kpiStudioChat(userId: string, message: string) {
  return fetchJson<{ message: string; candidate: KpiCandidatePayload | null }>(
    `/kpi-studio/${userId}`,
    {
      method: 'POST',
      body: JSON.stringify({ message }),
    }
  );
}

export function resetKpiStudio(userId: string) {
  return fetchJson<{ ok: true }>(`/kpi-studio/${userId}`, { method: 'DELETE' });
}
