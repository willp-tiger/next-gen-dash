export interface KpiDefinition {
  kpiId: string;
  version: number;
  displayName: string;
  description: string;
  unit: string;
  direction: 'lower-is-better' | 'higher-is-better';
  sqlLogic: string;
  sourceTables: string[];
  grain: string;
  dimensions: string[];
  defaultThresholds: { greenMax: number; yellowMax: number };
  materialization: 'live' | 'scheduled';
  schedule: string | null;
  owner: string;
  status: 'draft' | 'validating' | 'validated' | 'published' | 'deprecated';
  createdAt: string;
  createdBy: string;
  changeReason: string;
  tags: string[];
}

export interface ValidationResult {
  stage: string;
  status: 'pass' | 'warn' | 'fail' | 'pending';
  message: string;
  durationMs: number;
}

export interface CatalogTable {
  catalog: string;
  schema: string;
  table: string;
  columns: { name: string; type: string; description: string }[];
}
