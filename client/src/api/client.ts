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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
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

export function getMetrics(metricIds?: string[]) {
  const params = metricIds?.length
    ? `?metricIds=${metricIds.join(',')}`
    : '';
  return fetchJson<MetricsSnapshot>(`/metrics${params}`);
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
  if (filters?.product_line) params.set('product_line', filters.product_line);
  if (filters?.country) params.set('country', filters.country);
  if (filters?.territory) params.set('territory', filters.territory);
  if (filters?.deal_size) params.set('deal_size', filters.deal_size);
  const qs = params.toString();
  return fetchJson<CategoricalSnapshot>(`/metrics/categorical${qs ? '?' + qs : ''}`);
}

export function getAvailableFilters() {
  return fetchJson<{
    productLines: string[];
    countries: string[];
    territories: string[];
    dealSizes: string[];
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
