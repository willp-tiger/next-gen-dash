/**
 * Looker integration via SDK.
 * Provides the actual Looker API calls that Claude's tool-use will invoke
 * to discover data models and build dashboards.
 *
 * The SDK types vary across versions, so we use `any` casts for method calls
 * and validate return shapes at runtime.
 */

import { LookerNodeSDK } from '@looker/sdk-node';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdk: any = null;

function getSDK(): any {
  if (sdk) return sdk;
  const base = process.env.LOOKER_BASE_URL;
  const clientId = process.env.LOOKER_CLIENT_ID;
  const clientSecret = process.env.LOOKER_CLIENT_SECRET;
  if (!base || !clientId || !clientSecret) {
    throw new Error('Missing LOOKER_BASE_URL, LOOKER_CLIENT_ID, or LOOKER_CLIENT_SECRET');
  }

  process.env.LOOKERSDK_BASE_URL = base;
  process.env.LOOKERSDK_CLIENT_ID = clientId;
  process.env.LOOKERSDK_CLIENT_SECRET = clientSecret;
  if (process.env.LOOKER_VERIFY_SSL === 'false') {
    process.env.LOOKERSDK_VERIFY_SSL = 'false';
  }

  sdk = LookerNodeSDK.init40();
  return sdk;
}

export function isLookerConfigured(): boolean {
  return !!(process.env.LOOKER_BASE_URL && process.env.LOOKER_CLIENT_ID && process.env.LOOKER_CLIENT_SECRET);
}

// === Discovery ===

export async function getModels() {
  const s = getSDK();
  const models: any[] = await s.ok(s.all_lookml_models());
  return models.map((m: any) => ({
    name: m.name,
    label: m.label,
    explores: (m.explores || []).map((e: any) => ({ name: e.name, label: e.label })),
  }));
}

export async function getExploreFields(modelName: string, exploreName: string) {
  const s = getSDK();
  const explore: any = await s.ok(s.lookml_model_explore(modelName, exploreName));
  return {
    name: explore.name,
    label: explore.label,
    description: explore.description,
    dimensions: (explore.fields?.dimensions || []).map((d: any) => ({
      name: d.name,
      label: d.label_short || d.label,
      type: d.type,
      description: d.description,
    })),
    measures: (explore.fields?.measures || []).map((m: any) => ({
      name: m.name,
      label: m.label_short || m.label,
      type: m.type,
      description: m.description,
    })),
  };
}

// === Query ===

export async function runQuery(params: {
  model: string;
  view: string;
  fields: string[];
  filters?: Record<string, string>;
  sorts?: string[];
  limit?: number;
}) {
  const s = getSDK();
  return s.ok(s.run_inline_query({
    result_format: 'json',
    body: {
      model: params.model,
      view: params.view,
      fields: params.fields,
      filters: params.filters || {},
      sorts: params.sorts,
      limit: String(params.limit || 100),
    },
  }));
}

// === Dashboard building ===

export async function createDashboard(title: string, description?: string) {
  const s = getSDK();
  const dash: any = await s.ok(s.create_dashboard({ title, description: description || '' }));
  return { id: dash.id, title: dash.title };
}

export async function addDashboardElement(params: {
  dashboardId: string;
  title: string;
  model: string;
  explore: string;
  fields: string[];
  filters?: Record<string, string>;
  sorts?: string[];
  limit?: number;
  visType?: string;
  pivots?: string[];
}) {
  const s = getSDK();

  const query: any = await s.ok(s.create_query({
    model: params.model,
    view: params.explore,
    fields: params.fields,
    filters: params.filters || {},
    sorts: params.sorts,
    limit: String(params.limit || 500),
    pivots: params.pivots,
    vis_config: { type: params.visType || 'looker_column' },
  }));

  const element: any = await s.ok(s.create_dashboard_element({
    dashboard_id: params.dashboardId,
    title: params.title,
    type: 'vis',
    query_id: query.id,
  }));

  return { id: element.id, title: element.title, queryId: query.id };
}

export async function addDashboardFilter(params: {
  dashboardId: string;
  title: string;
  dimension: string;
  model: string;
  explore: string;
  type?: string;
  defaultValue?: string;
}) {
  const s = getSDK();
  const filter: any = await s.ok(s.create_dashboard_filter({
    dashboard_id: params.dashboardId,
    title: params.title,
    name: params.dimension.replace(/\./g, '_'),
    type: params.type || 'field_filter',
    model: params.model,
    explore: params.explore,
    dimension: params.dimension,
    default_value: params.defaultValue || '',
    allow_multiple_values: true,
  }));
  return { id: filter.id, title: filter.title };
}

export async function getDashboardUrl(dashboardId: string): Promise<string> {
  return `${process.env.LOOKER_BASE_URL || ''}/dashboards/${dashboardId}`;
}

export async function listDashboards() {
  const s = getSDK();
  const dashboards: any[] = await s.ok(s.all_dashboards('id,title,description'));
  return dashboards.map((d: any) => ({ id: d.id, title: d.title, description: d.description }));
}
