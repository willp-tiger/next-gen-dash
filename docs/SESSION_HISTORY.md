# Session History

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
