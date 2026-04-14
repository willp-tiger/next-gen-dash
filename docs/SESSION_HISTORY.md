# Session History

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
