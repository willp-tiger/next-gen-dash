// In-memory store for KPIs published from the KPI Authoring Studio.
// A published KPI is queryable as a dashboard metric and visible in the
// Catalog and Health tabs alongside the built-in registry.

export interface PublishedKpi {
  kpiId: string;
  displayName: string;
  description: string;
  unit: string;
  direction: 'higher-is-better' | 'lower-is-better';
  sqlLogic: string;        // Full SELECT ... AS value FROM ... that returns one row
  grain: string;
  dimensions: string[];
  thresholds: { greenMax: number; yellowMax: number };
  createdAt: string;
  createdBy: string;
  version: number;
  status: 'published';
}

const store = new Map<string, PublishedKpi>();

export function publishKpi(kpi: Omit<PublishedKpi, 'createdAt' | 'version' | 'status'> & { createdBy?: string }): PublishedKpi {
  const existing = store.get(kpi.kpiId);
  const record: PublishedKpi = {
    kpiId: kpi.kpiId,
    displayName: kpi.displayName,
    description: kpi.description,
    unit: kpi.unit,
    direction: kpi.direction,
    sqlLogic: kpi.sqlLogic,
    grain: kpi.grain,
    dimensions: kpi.dimensions,
    thresholds: kpi.thresholds,
    createdBy: kpi.createdBy ?? 'studio-user',
    createdAt: new Date().toISOString(),
    version: existing ? existing.version + 1 : 1,
    status: 'published',
  };
  store.set(kpi.kpiId, record);
  return record;
}

export function getPublishedKpis(): PublishedKpi[] {
  return Array.from(store.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getPublishedKpi(id: string): PublishedKpi | undefined {
  return store.get(id);
}
