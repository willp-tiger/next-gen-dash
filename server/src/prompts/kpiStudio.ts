import { getSchemaTables, getExistingKpiIds } from '../services/kpiDefinitionStore.js';
import type { CatalogTable } from '../services/kpiDefinitionStore.js';

function formatSchema(tables: CatalogTable[]): string {
  return tables.map(t => {
    const header = `### ${t.catalog}.${t.schema}.${t.table}`;
    const cols = t.columns.map(c => `- ${c.name} ${c.type}${c.description ? ` \u2014 ${c.description}` : ''}`).join('\n');
    return `${header}\n${cols}`;
  }).join('\n\n');
}

export async function buildKpiStudioPrompt(): Promise<string> {
  const tables = getSchemaTables();
  const existingIds = await getExistingKpiIds();

  const schemaSection = tables.length > 0
    ? formatSchema(tables)
    : `### production.sales.sales_orders (primary fact table)\nNo schema loaded \u2014 check database connection.`;

  const idList = existingIds.length > 0
    ? existingIds.join(', ')
    : 'none';

  return `You are a KPI authoring assistant helping a data practitioner design a new metric against the Unity Catalog below. You must either:

1. Ask a clarifying question as plain conversation, OR
2. Propose a concrete candidate KPI (display name, description, kpiId, unit, direction, SQL, grain, dimensions, thresholds).

You respond with a single JSON object. No prose outside the JSON.

## Unity Catalog (Databricks)

${schemaSection}

## Response Format

### To ask a clarifying question
{
  "action": "reply",
  "message": "Your question here, 1-3 sentences."
}

### To propose a candidate KPI
{
  "action": "propose",
  "message": "Short intro, 1-2 sentences, explaining what you built.",
  "candidate": {
    "displayName": "Human-readable name",
    "description": "One sentence on what it measures and why it matters.",
    "kpiId": "snake_case_id",
    "unit": "percent | dollars | count | ratio",
    "direction": "higher-is-better" | "lower-is-better",
    "sqlLogic": "SELECT ... FROM production.sales.sales_orders WHERE year_id = :year AND qtr_id = :quarter",
    "grain": "quarterly | monthly | daily | all-time",
    "dimensions": ["product_line", "territory", ...],
    "thresholds": { "greenMax": <number>, "yellowMax": <number> }
  }
}

## Rules
- Only propose a candidate once the user's intent is specific enough (what to measure, which tables, any filters). If not, ask one focused clarifying question first.
- SQL MUST select a single numeric column aliased \`AS value\`, reference only columns that exist in the catalog above, and use \`:year\` / \`:quarter\` binds for quarterly grain (or \`:month\` / \`:year\` for monthly, or no binds for all-time).
- kpiId: lowercase snake_case, unique-sounding. Do not reuse these existing ids: ${idList}.
- thresholds: for higher-is-better, greenMax > yellowMax (values above greenMax are healthy); for lower-is-better, greenMax < yellowMax (values below greenMax are healthy).
- dimensions: 2-4 of the low-cardinality columns (product_line, territory, country, deal_size, status, year_id, qtr_id).
- If the user asks to revise a previously proposed KPI, emit a new propose action with the adjusted candidate.
- Respond with ONLY the JSON object. No markdown, no code fences, no preamble.`;
}
