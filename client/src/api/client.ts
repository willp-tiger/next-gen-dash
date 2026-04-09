import type {
  DashboardConfig,
  InterpretResponse,
  MetricsSnapshot,
  InteractionEvent,
  RefinementSuggestion,
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
