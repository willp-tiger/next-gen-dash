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

export function updateDashboardConfig(userId: string, config: DashboardConfig) {
  return fetchJson<DashboardConfig>(`/dashboard/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export function getMetrics(metricIds?: string[]) {
  const params = metricIds?.length
    ? `?ids=${metricIds.join(',')}`
    : '';
  return fetchJson<MetricsSnapshot>(`/metrics${params}`);
}

export function getCanonicalView() {
  return fetchJson<DashboardConfig>('/metrics/canonical');
}

export function logInteraction(event: InteractionEvent) {
  return fetchJson<void>('/refinement/log', {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

export function getRefinementSuggestions(userId: string) {
  return fetchJson<RefinementSuggestion[]>(`/refinement/suggestions/${userId}`);
}

export function updateSuggestion(id: string, status: 'accepted' | 'dismissed') {
  return fetchJson<RefinementSuggestion>(`/refinement/suggestions/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  });
}

export function getCategoricalMetrics(metricIds?: string[], filters?: FilterState) {
  const params = new URLSearchParams();
  if (metricIds?.length) params.set('metricIds', metricIds.join(','));
  if (filters?.make) params.set('make', filters.make);
  if (filters?.model) params.set('model', filters.model);
  if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters?.dateTo) params.set('dateTo', filters.dateTo);
  const qs = params.toString();
  return fetchJson<CategoricalSnapshot>(`/metrics/categorical${qs ? '?' + qs : ''}`);
}

export function getAvailableFilters() {
  return fetchJson<{ makes: string[]; models: Record<string, string[]>; dateRange: { min: string; max: string } }>('/metrics/filters');
}

export function getDataSource() {
  return fetchJson<{ source: 'looker' | 'mock'; looker: { available: boolean; error: string | null } }>('/metrics/source');
}

export function getLookerStatus() {
  return fetchJson<{ configured: boolean; env: Record<string, boolean> }>('/looker/status');
}

export function lookerChat(userId: string, message: string) {
  return fetchJson<{
    message: string;
    toolCalls: { name: string; input: any; result: string }[];
    dashboardUrl: string | null;
  }>(`/looker/chat/${userId}`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
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
