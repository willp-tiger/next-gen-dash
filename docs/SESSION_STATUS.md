# Session Status

## Current State
**Phase**: 4 - Deploy & Polish
**Status**: Phases 1-3 complete. Production build passing. Ready for deployment.

## Completed
- [x] CLAUDE.md generated from template
- [x] Session docs created
- [x] Scaffold npm workspaces and install dependencies
- [x] Configure TypeScript, Tailwind, Vite
- [x] Define shared types (12 metrics, DashboardConfig, filters, breakdowns)
- [x] Mock data service with random-walk trends, categorical breakdowns, filter multipliers
- [x] In-memory config store
- [x] Express routes: metrics, dashboard CRUD, refinement, chat, dashboard-chat
- [x] Claude integration: onboarding chat, interpretation prompt, dashboard chat
- [x] Refinement endpoints: interaction logging + rule-based suggestion generation
- [x] Onboarding chat flow (multi-turn conversational)
- [x] Interpretation review UI
- [x] Personalized dashboard with Recharts (metric tiles, charts, breakdowns)
- [x] Canonical (standard) view toggle
- [x] Filter bar and categorical breakdowns
- [x] Dashboard chat for live config mutation
- [x] Refinement suggestion banner
- [x] Test suite: 78 tests passing across 8 files
- [x] Dockerfile (multi-stage build)
- [x] Fix server TypeScript build error (chat.ts param typing)

## Session 2026-04-14 (pm-2): Studio → Catalog / Health / Dashboard plumbing
- New `server/src/services/kpiStore.ts` holds published KPIs in memory (Map
  keyed by kpiId, versioned on re-publish).
- `POST /api/kpi-studio/:userId/publish` persists a candidate; `GET /api/kpis/published` returns the list.
- `salesData.resolveDefs` merges `METRIC_DEFS` with kpiStore so
  `generateSnapshot` queries published KPIs through the same pipeline. SQL
  normalized on the fly: `production.sales.sales_orders` → `sales_orders`,
  trailing `:year`/`:quarter` WHERE clauses stripped. Per-metric errors
  now caught so one failing KPI doesn't 500 the whole snapshot.
- `dashboardChat` handler injects a "Additional KPIs the user has authored
  in the Studio" section into the context message each turn.
- Client: `publishKpi` / `getPublishedKpis` helpers, green Publish button
  in KpiStudio (enabled only after clean validation), Catalog + Health
  poll `/api/kpis/published` every 4s and merge into the static registry.
- Verified E2E on Railway with Playwright: create → validate → publish →
  Catalog shows studio-authored tag → Health shows synthetic passing
  assertion → dashboard chat "add X" renders the tile with live data.

## Next Session Goals
- Verify live on Railway that `order_date` is the actual column name; if not,
  update `applyFilters`/`buildConditions` and `getAvailableFilters` in
  `server/src/services/salesData.ts`.
- Consider persisting global filters server-side when the user changes them
  via the FilterBar (currently only chat-driven changes write to
  `config.globalFilters`; manual FilterBar edits stay in local React state).
- Consider chunk splitting to address 500kB bundle warning.
- Update CLAUDE.md phase checklist to reflect completion.

## Session 2026-04-14 (pm): Chat-generated date/time & global filters
- `FilterState` gains `dateStart`/`dateEnd`; `DashboardConfig` gains
  `globalFilters`. Chat `filter` action now writes to `globalFilters` and
  applies to every tile, not just breakdown charts.
- SQL helpers consolidated into `buildConditions`; date filters render as
  `order_date >= $n` / `order_date <= $n`. `getAvailableFilters` exposes
  dataset `minDate`/`maxDate` for UI clamping.
- `/api/metrics` and `/api/metrics/categorical` accept full filter query
  params including date range; client `getMetrics(ids, filters)` forwards
  them.
- `FilterBar` adds From/To date inputs; `Dashboard` seeds filters from
  `config.globalFilters` and passes them into every metric fetch.
- Chat prompt teaches the model to produce absolute ISO dates for phrases
  like "Q1 2004" and to emit `{action:"filter", clear:true}` for clear
  requests.
- Assumption: column is `order_date`. Verify on Railway.

## Session 2026-04-14: Dashboard-chat fix & number formatting polish
- Fixed dashboard-chat 404 after picking a pre-built persona. `handlePersonaPick`
  now PUTs the persona config to the server under the current session userId
  before entering the dashboard. Server `PUT /api/dashboard/:userId` upserts
  instead of 404'ing when no existing config.
- Client-presentable number formatting everywhere: new `client/src/lib/format.ts`
  with `formatValue`/`formatAxis`/`formatDelta`. Applied to MetricTile, ChartTile,
  GaugeTile, BreakdownChart, HeatMapChart. Dollars render as `$1.23M`, percent as
  `87.3%`, counts with commas/K-M-B abbreviation.
- Added data labels above BreakdownChart bars, fixed tooltip label/format.
- Deployed + e2e verified on Railway (bundle `index-Bx5MRBxk.js`).
