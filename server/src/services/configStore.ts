import type { DashboardConfig } from '../../../shared/types.js';

const store = new Map<string, DashboardConfig>();

export function getConfig(userId: string): DashboardConfig | undefined {
  return store.get(userId);
}

export function setConfig(userId: string, config: DashboardConfig): void {
  store.set(userId, config);
}
