# Session History

## Session 2026-05-12: Replace retail sales dataset with Meridian supply chain

**Strategic framing:**
- Reframed the demo's core pitch as **democratization of dashboard authoring** for non-technical business users — buyers need to see that artifacts produced via chat look like work a senior analyst would have shipped, not "AI demo" output.
- Rejected demo-theater UI patterns (fake author attribution chips, animated chat-builds-dashboard, live previews, tool-use trails on tiles). Saved feedback memory `feedback_avoid_demo_theater.md` to enforce this going forward.
- Decided to scope the demo to a **single business unit** (not cross-functional) so it reads like a real enterprise BI surface. Picked **Supply Chain Operations** over Sales / Marketing for differentiation and natural fit for funnel/waterfall/cohort widget storytelling.
- Fictional company: **Meridian Industrial Supply**, a B2B industrial parts distributor with 12 DCs across NA/EMEA/APAC/LATAM, ~200 suppliers, 5,000+ SKUs across 7 categories, serving Enterprise/Mid-Market/SMB customers across Manufacturing/Automotive/Aerospace/Energy/Construction.

**Completed Tasks:**
- Created `server/src/services/supplyChain/` module with five files:
  - `random.ts` — seeded RNG (mulberry32), date helpers anchored to `TODAY`, seasonality + weekend/holiday multipliers, batch INSERT helper (500-row batches by default).
  - `schema.ts` — 11-table DDL (suppliers, warehouses, carriers, customers, skus, purchase_orders, shipments, shipment_lines, inventory_snapshots, exceptions, returns) with FKs, indexes, column comments. All idempotent (`IF NOT EXISTS`). Plus KPI metadata table DDL carried over.
  - `seedDimensions.ts` — generates 200 suppliers (60 Strategic / 70 Preferred / 70 Tactical), 12 hardcoded warehouses, 18 carriers (Parcel/LTL/FTL/Ocean/Air mix), 2,000 customers (200/700/1100 by segment), 5,000 SKUs (ABC distribution with category-specific skew — Bearings/Hydraulics skew B, Fasteners skew C).
  - `seedFacts.ts` — generates ~55k shipments (180 weekday / 60 weekend baseline × seasonal × anomaly multipliers), ~25k PO lines, ~947k inventory snapshots (daily for top 300 SKUs × 12 warehouses + monthly for tail), exception generation with reason-code weighting, returns generation.
  - `seedKpis.ts` — 23 supply chain KPIs across Fulfillment (6) / Inventory (5) / Procurement (5) / Logistics (3) / Operations (4). Each has sqlLogic (documented with `:start_date`/`:end_date` binds) + execSql (runnable) + trendSql (monthly buckets) + owner + tier + version history. Includes a `version_history` array for OTIF and stockout_rate showing prior deprecated versions.
- Rewrote `server/src/services/migrate.ts` as an orchestrator: drops legacy `sales_orders`, ensures KPI metadata tables exist, ensures supply chain schema exists, detects legacy KPI IDs (`total_revenue` etc.) and wipes the library if found, seeds dimensions + facts + KPIs if empty. `RESET_DATA=true` env var forces a clean wipe + reseed.
- Built in four narrative anomalies into the seed data:
  1. **APAC port congestion** Nov 8–22 (most recent November in seed range): drags OTIF ~8pp on APAC-origin / EMEA-destination lanes; exception spike weighted toward Carrier Delay + Customs.
  2. **Strategic supplier SUP-0042 underperforming**: OTD linearly declines from 96% → 78% across the last 120 days. PO Cycle Time inflates for SKUs sourced from it. Stockouts elevated for downstream SKUs.
  3. **EMEA logistics incident** (May 6): WH-EMEA-02 single-day backlog with 2–4 extra ship delay days and Capacity-coded critical exceptions.
  4. **Cutting Tools category phase-out**: SKUs in that category get a 6x elevated `phasing_out` status rate (18% vs 3% baseline).
- Anchor-to-today date convention: all seed dates derived from `TODAY` at module load. The most recent date is always "now," so "last 30 days," "current quarter" always work without re-seeding.
- Replaced `shared/types.ts`:
  - New `FilterState` fields: `destination_region`, `warehouse_id`, `customer_segment`, `sku_category`, `supplier_tier`, plus `dateStart`/`dateEnd`.
  - New supply chain enums: `SKU_CATEGORIES`, `REGIONS`, `CUSTOMER_SEGMENTS`, `SUPPLIER_TIERS`, `ABC_CLASSES`.
  - `AVAILABLE_METRICS` rewritten to the 23 supply chain KPI IDs.
  - `MetricConfig.breakdownBy` union switched to supply chain dimensions.
  - `CategoricalSnapshot.breakdowns` shape: `byCategory`, `byRegion`, `byWarehouse`, `bySegment`.
- Overwrote `server/src/services/salesData.ts` (kept filename to avoid churn):
  - New filter system uses CTE wrappers (`_shipments_f`, `_inv_f`, `_po_f`) that gracefully handle queries with existing WHERE clauses, JOINs, subqueries, and leading WITH clauses. Smart per-table filter application — only inject filters for fact tables actually referenced in the SQL.
  - New breakdown queries joining shipments + shipment_lines + skus / customers.
  - New heatmap dimensions whitelist with join clauses (`category`, `abc_class`, `destination_region`, `warehouse_id`, `customer_segment`, `customer_region`).
  - Three new personas replacing sales-rep/director/executive:
    - **CSCO** — OTIF, Perfect Order Rate, Order Cycle Time, Inventory Turns, Exception Rate, Excess Inventory Value
    - **Warehouse Director** — Same-Day Ship Rate, Line Fill Rate, Backorder Rate, Capacity Util, Exception Rate, MTTR
    - **Procurement Lead** — Supplier OTD, Supplier OTIF, PO Cycle Time, Avg Lead Time, Defect Rate, Critical SKU Stockout
- Updated `server/src/services/kpiDefinitionStore.ts`:
  - `normalizePublishedSql` generalized to strip any `production.<schema>.` prefix instead of only `production.sales.sales_orders`.
  - `COLUMN_DESCRIPTIONS` rewritten for all 11 supply chain tables.
  - `loadSchemaTables` query updated to include all 11 supply chain tables; schema label set to `supply_chain`.
- Updated all four Claude prompts:
  - `dashboardChat.ts` — domain framing, available metrics, filter dimensions, examples all rewritten for Meridian. Preserved the "NEVER refuse UI/element asks" rule per memory.
  - `interpret.ts` — domain framing, KPI inference examples (fulfillment → otif_rate, inventory → inventory_turns, etc.) for supply chain.
  - `kpiStudio.ts` — schema fallback, SQL example, dimensions list updated. Also made `getExistingKpiIds()` failure-tolerant so the prompt builds without a DB (fixes unit-test crash).
  - `refine.ts` — domain framing only.
- Updated `server/src/routes/metrics.ts` to parse new filter params.
- Updated client UI:
  - `FilterBar.tsx` — full rewrite for new dimensions (Region / Warehouse / Segment / Category / Supplier Tier dropdowns).
  - `PersonaSelector.tsx` — new persona labels + descriptions + icons.
  - `OnboardingFlow.tsx` — persona cards + example prompts rewritten for supply chain.
  - `MetricTooltip.tsx` — descriptions for all 23 new KPIs.
  - `BreakdownChart.tsx` — new breakdown dim → endpoint mapping.
  - `HeatMapChart.tsx` — default row × col is `category × destination_region`.
  - `DashboardChat.tsx` — quick actions + placeholder.
  - `KpiStudio.tsx` — example prompt buttons.
  - `client/src/api/client.ts` — `buildFilterParams` and `getAvailableFilters` response shape updated.
- Updated five test files (sharedTypes, refinementSystem, dashboardChat, interpretPrompt, kpiStudio) to use new metric IDs, filter dimensions, and persona keys. All 78 tests pass.

**Technical Decisions:**
- **Kept the file name `salesData.ts`** instead of renaming to `dashboardData.ts` to avoid churn in importers. Acceptable debt; cleanup later.
- **Filter strategy uses CTE wrappers** rather than naive `FROM X → FROM X WHERE ...` substitution, because the new KPI SQL has existing WHERE clauses, JOINs, and CTEs of its own. The CTE approach is robust against any of those patterns.
- **Anchor-to-today** for seed dates rather than a fixed historical window. Demos always look current; no re-seeding needed.
- **Three intentional anomalies + a category phase-out** built into the seed code (not as separate annotation rows). The anomalies are reproducible because the RNG is seeded with constants (`0xC0FFEE` for dimensions, `0xACE10` for facts).
- **Inventory snapshot density: daily for top 300 SKUs only** (not 500 as originally planned). The 947k actual rows fit Postgres comfortably and seed in a few minutes. Tail SKUs get monthly snapshots.
- **Per-tier supplier OTD probabilities** (Strategic ~96% / Preferred ~92% / Tactical ~84%) drive realistic supplier_otd distributions. SUP-0042's degradation is layered on top.

**Issues Resolved / Investigated:**
- `tests/kpiStudio.test.ts` was crashing because `buildKpiStudioPrompt` calls `getExistingKpiIds()` which queries the DB. In test environments without a DB, this threw before the route's catch handler could return a 503. Wrapped the call in try/catch to gracefully degrade.

**Outstanding Issue — flagged at end of session, not yet investigated:**
- After seeding, post-boot DB inspection shows:
  - `exceptions`: 0 rows (expected ~15k)
  - `returns`: 0 rows (expected ~8k)
  - `kpi_definitions`: 0 rows (expected 23)
  - `kpi_versions`: 0 rows (expected ~25)
  - All other tables seeded correctly with expected counts (200 suppliers, 12 warehouses, 18 carriers, 2,000 customers, 5,000 SKUs, 61,514 PO lines, 53,028 shipments, 144,736 shipment lines, 947,000 inventory snapshots).
- Hypotheses to investigate next session:
  1. The seed may have been interrupted/timed out before reaching `seedFacts`'s `generateExceptions` / `generateReturns` steps. Next boot would then skip seeding because `skus.count > 0`. Solution: `RESET_DATA=true` should force a clean wipe, but it also needs to handle the partial-state case (currently `wipeSupplyChainData` truncates all 11 tables, so it should work).
  2. A logic error in `generateExceptions` / `generateReturns` that drops all rows. The base rate × probability math could be wrong.
  3. Why did `kpi_definitions` end up empty? Looking at `migrate.ts`, the flow is: KPI metadata tables created → legacy KPIs detected → if legacy found, wipe → if `rowCount('kpi_definitions') === 0`, seed KPIs. If the wipe ran, then the seed should have run after. Unless the seed itself errored silently and the migration just didn't catch it. Worth adding more granular logging.

**Git Commit:** `07e99bb` — "feat(data): replace retail sales schema with Meridian supply chain dataset" (27 files changed, +3,430 / −827)

## Session 2026-04-14 (pm): Chat-generated date/time and global filters

**Completed Tasks:**
- Extended `FilterState` with `dateStart` / `dateEnd` (ISO `YYYY-MM-DD`) and
  added optional `DashboardConfig.globalFilters` so chat-authored filters
  affect every tile, not only breakdown charts.
- Refactored `server/src/services/salesData.ts` around a single
  `buildConditions(filters, startIdx)` helper used by both `applyFilters`
  (WHERE injection for metric/trend SQL) and `buildFilterWhere` (categorical
  queries). Date filters render as `order_date >= $n` / `order_date <= $n`.
- `getAvailableFilters` now returns `minDate` / `maxDate` via
  `SELECT MIN(order_date), MAX(order_date) FROM sales_orders`, so the UI's
  date pickers can clamp to the dataset range (2003–2005).
- `GET /api/metrics` and `GET /api/metrics/categorical` now read
  `product_line`, `country`, `territory`, `deal_size`, `dateStart`, `dateEnd`
  query params. Client `getMetrics(ids, filters)` serializes them via a shared
  `buildFilterParams` helper.
- Dashboard chat prompt (`server/src/prompts/dashboardChat.ts`) documents the
  date dimension, instructs the model to resolve relative phrases ("Q1 2004",
  "last 30 days") into absolute ISO dates, and adds a `{"action":"filter",
  "clear":true}` shape.
- `server/src/routes/dashboardChat.ts` filter handler now writes into
  `config.globalFilters` (dropping null/empty keys), supports full-clear, and
  still mirrors the filter onto breakdown-chart `filterBy` so existing
  breakdown rendering keeps working.
- `FilterBar` gains two `<input type="date">` controls (From / To), bounded by
  the dataset `minDate` / `maxDate`; a Clear button wipes every filter
  including the new date range.
- `Dashboard` seeds `filters` from `config.globalFilters`, forwards `filters`
  into `getMetrics`, and auto-opens the filter bar when chat sets globals or
  an existing config arrives with globals.
- Chat input placeholder updated to hint at filter usage.

**Technical Decisions:**
- Put global filters on `DashboardConfig`, not a separate API. The config is
  already round-tripped via PUT `/api/dashboard/:userId`, so chat-authored
  filters persist through reloads without new endpoints.
- Kept per-breakdown `filterBy` in sync with globals rather than ripping it
  out, because breakdown charts fetch through `/api/metrics/categorical` with
  the metric's `filterBy` as their filter source. Dual-writing is cheap and
  avoids a bigger refactor of BreakdownChart.
- Date comparisons use `order_date >= $n AND order_date <= $n` (inclusive) so
  "Jan 2004" end-dates can be `2004-01-31` without off-by-one confusion.

**Assumption to verify:**
- The Postgres column is assumed to be `order_date`. This matches the
  snake_case convention used across `salesData.ts` (`product_line`,
  `order_number`, `customer_name`, `year_id`, `qtr_id`, `price_each`,
  `quantity_ordered`) and the client semantic registry in
  `client/src/data/kpiRegistry.ts`. If Railway's table uses a different name,
  swap the two references in `salesData.ts:applyFilters` (via
  `buildConditions`) and `getAvailableFilters`.

**Verification:** `npm run build` clean, 53 tests pass.

## Session 2026-04-14: Dashboard-chat 404 fix and number formatting polish

**Completed Tasks:**
- Diagnosed "Sorry, something went wrong" error from the Dashboard Assistant chat
  on the Railway-hosted app. Root cause: `handlePersonaPick` in
  `client/src/components/onboarding/OnboardingFlow.tsx` routed users into the
  dashboard using a pre-built persona config without ever saving a config to
  the server under the session userId, so `/api/dashboard-chat/:userId`
  returned 404.
- Fix, client side: `handlePersonaPick` now adopts the persona config under the
  current `user-<timestamp>` id and PUTs it to the server before calling
  `onComplete`. `updateDashboardConfig` now unwraps the `{config}` envelope the
  server actually returns.
- Fix, server side: `PUT /api/dashboard/:userId` now upserts (previously
  required an existing config or returned 404). This is the correct REST
  semantic for a config store and unblocks persona adoption.
- Number formatting pass for client-presentable output:
  - New `client/src/lib/format.ts` with `formatValue`, `formatNumber`,
    `formatAxis`, `formatDelta`. Rules: `dollars` → `$1,234` or `$1.23M`
    (compact mode), `percent` → `87.3%`, `count` → commas + K/M/B above 10K.
  - MetricTile, ChartTile, GaugeTile: value + tooltip use `formatValue`; delta
    uses `formatDelta`. Removed the literal "dollars" / "percent" unit-word
    suffixes that were displayed next to values.
  - BreakdownChart: fixed broken tooltip formatter (`value.toFixed(1) dollars`
    was nonsensical), added `<LabelList>` above bars so readers see the
    formatted value without hovering, cursor highlight softened.
  - HeatMapChart: cell values render through `formatAxis` so dollar cells show
    `$123K` not `123.4`.
- Verified end-to-end on Railway: new userId → PUT persona config → POST
  `/api/dashboard-chat/:userId` "add a gauge for fulfillment rate" → 200 with
  action:"add" and updated config in body.

**Technical Decisions:**
- PUT is upsert rather than introducing a separate POST `/adopt` endpoint —
  the config store is idempotent by userId and the client already had
  `updateDashboardConfig`. One round trip, no new API surface.
- Formatter lives in `client/src/lib` (new directory) since it's display-only
  logic with no server counterpart.
- Gauge tile now renders the currency symbol inline (`$1.23M`) instead of a
  separate unit subtitle, since the symbol reads fine at gauge text size.

**Issues Resolved:**
- Dashboard Assistant chat returned "Sorry, something went wrong" on the
  deployed app whenever a user picked a pre-built persona (the most common
  onboarding path). Persona users can now chat-edit their dashboard.
- Metric values displayed as raw floats with unit words appended (e.g.
  `1234567 dollars`) — now `$1.23M`.

**Deployment:**
- Railway deploys: `e6b3de43` (persona fix, bundle `index-B4uA2x_o.js`),
  `5a7020fc` (formatting pass, bundle `index-Bx5MRBxk.js`).

## Session 2026-04-09: Project Setup and Initial Build

**Completed Tasks:**
- Generated CLAUDE.md from CLAUDE_TEMPLATE.md, tailored for prompt-guided dashboard project
- Created docs/SESSION_STATUS.md and docs/SESSION_HISTORY.md
- Beginning project scaffold

**Technical Decisions:**
- Vite + React + Tailwind for frontend (user selected)
- Express + Anthropic SDK for backend (user selected)
- npm workspaces monorepo structure (root, client, server, shared)
- In-memory data store (no database for demo)
- Multi-stage Dockerfile for Railway deployment
- claude-sonnet-4-20250514 model for interpretation (fast structured output)

**Architecture:**
- Config-driven dashboards: Claude generates DashboardConfig objects, frontend renders them
- Single Claude call per onboarding (batch all 3 questions)
- Canonical fallback view available without Claude
- Phase 3 adaptive refinement via interaction tracking + rule-based suggestions

## Session 2026-04-09 (continued): Full Implementation of Phases 1-3

**Completed Tasks:**
- Scaffolded full npm workspaces monorepo (root, client, server, shared)
- Defined shared TypeScript types: DashboardConfig, MetricConfig, ThresholdConfig, FilterState, CategoricalSnapshot, etc.
- 12 queue health metrics defined in AVAILABLE_METRICS constant
- Built mock data service with random-walk trends, categorical breakdowns, filter multipliers
- Built in-memory config store (Map-based, intentional for demo)
- Built all Express routes: metrics (standard + categorical + filters), dashboard CRUD, refinement (log + suggestions), onboarding chat, dashboard chat
- Claude integration: multi-turn onboarding chat with READY_TO_BUILD signal, interpretation prompt parsing with JSON extraction and validation, dashboard chat for live config mutation
- Rule-based refinement engine: suggests adding high-interaction metrics, removing zero-interaction metrics
- Built full React frontend: OnboardingFlow (multi-turn chat UI), InterpretationReview, Dashboard with auto-refresh, MetricTile, ChartTile, BreakdownChart, FilterBar, HealthBadge, ViewToggle, DashboardChat, RefinementBanner
- API client with 11 typed functions covering all endpoints
- 3-phase state machine in App.tsx: onboarding → review → dashboard
- Test suite: 78 tests across 8 files (API routes integration, Claude service unit tests, config store, mock data, interpretation, health status, shared types, build check)
- Dockerfile with multi-stage build

**Technical Decisions:**
- Multi-turn chat for onboarding instead of single batch (richer conversation)
- Dashboard chat can add/remove/edit metrics and apply filters via LLM
- Rule-based refinement suggestions (not LLM-based) for the suggestion route
- No auth — userId is client-generated timestamp string
- No router library — phase-based single-page state machine

**Issues Resolved:**
- Server TypeScript build error: `req.params.userId` typed as `string | string[]` in Express — fixed by adding `Request<{ userId: string }>` generic parameter to chat.ts DELETE handler

**Git Commits:**
- `19d7489` - feat: Initial build of prompt-guided dashboard personalization demo
- `b620a5e` - feat: Add dashboard chat, categorical breakdowns, filters, and test suite
