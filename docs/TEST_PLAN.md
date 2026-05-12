# Meridian Demo — User Test Plan

**Audience:** Claude Code session that will write and execute these tests.
**Status:** Design only — no code yet.
**Last revised:** 2026-05-12

---

## 1. Purpose

This is a **demo product**, not a SaaS deployment. The unit of value is *can a non-technical business user pick this up and produce a credible supply-chain dashboard via chat?* The tests below validate that promise across three axes:

1. **The data tells the story.** Seeded anomalies (APAC port congestion, supplier SUP-0042 decline, EMEA logistics incident, Cutting Tools phase-out) must surface in KPI values, breakdowns, and filtered views. If the data is silent, the demo has nothing to say.
2. **The chat is a real mutator.** Every chat surface (onboarding, dashboard chat, KPI Studio) must do the thing — add tiles, apply filters, propose KPIs — not just describe doing it. This is the democratization claim.
3. **The product surface reads as enterprise BI.** Filter bar dimensions, persona switcher, KPI Catalog/Health, the 23-KPI library, sectioned layouts, new widget types — all must render and behave as a buyer would expect from a paid tool.

These are **user tests**, not unit tests. Every test should map to something a buyer or end user can perceive.

---

## 2. Pre-Existing Constraints To Honor

Before writing tests, read:
- `docs/SESSION_STATUS.md` — open partial-seed bug + Phase 4 widget scope
- `docs/SESSION_HISTORY.md` (most recent session) — full migration context, anomaly definitions
- `C:\Users\Will Powell\.claude\projects\C--Users-Will-Powell-next-gen-dash\memory\feedback_avoid_demo_theater.md` — don't validate or build demo-theater patterns
- `C:\Users\Will Powell\.claude\projects\C--Users-Will-Powell-next-gen-dash\memory\feedback_chat_capabilities.md` — chat must never refuse UI/element asks

---

## 3. Pre-Requisites Before Running Tests

| # | Step | Why |
|---|---|---|
| 1 | Resolve the partial-seed bug from SESSION_STATUS.md. `exceptions`, `returns`, `kpi_definitions`, `kpi_versions` must be populated. | Tests assume a fully seeded DB. |
| 2 | Confirm row counts: `suppliers` 200, `warehouses` 12, `carriers` 18, `customers` 2000, `skus` 5000, `purchase_orders` ~60k, `shipments` ~50k, `shipment_lines` ~150k, `inventory_snapshots` ~900k–1M, `exceptions` ≥ 10k, `returns` ≥ 5k, `kpi_definitions` 23, `kpi_versions` ≥ 23. | Sanity floor for the test suite. |
| 3 | Confirm both server + client build clean and existing vitest suite passes (78/78). | Don't start writing UI tests if the app won't boot. |
| 4 | Identify the Phase 4 widget code state. The `shared/types.ts` already declares `scorecard`, `annotated_line`, `pivot`, `funnel`, `markdown` chart types and supporting fields. Confirm which are actually wired to a renderer in the client. Skip browser tests for widgets that aren't rendered yet (mark as "pending"). | Don't fail tests for features that aren't implemented. |
| 5 | Start the dev server (`npm run dev` from root) and confirm `http://localhost:5173` (Vite) and `http://localhost:3000` (API) respond. | Tests against a running stack. |

---

## 4. Test Approach Principles

### 4.1. Three execution lanes

| Lane | Tool | When to use |
|---|---|---|
| **DB checks** | `node --env-file=.env -e '...'` with `pg` (matches the pattern used in this session) | Verify seeded data, KPI metadata, anomaly detectability. Fast, deterministic, no UI flake. |
| **API checks** | `curl` or `node fetch` against `http://localhost:3000/api/*` | Verify routes, filter application, KPI computation, persona configs. |
| **Browser checks** | Playwright (already a dep) via the `example-skills:webapp-testing` skill | User journeys: onboarding, persona pick, chat → tile appears, filter bar behavior, KPI catalog navigation. **One screenshot per test on completion**, regardless of pass/fail, saved under `scripts/test_artifacts/`. |

Pick the cheapest lane that proves the thing. Don't drive a browser if a `curl` does it.

### 4.2. Determinism

Seed RNG is fixed (`0xC0FFEE` / `0xACE10`). Tests should assert against *ranges* or *anomaly signals*, not exact numeric equality — because anchor-to-today shifts the data window each day. Example: "OTIF on `destination_region='EMEA'` between `Nov 8` and `Nov 22` of the most recent November in the data is at least **5 percentage points lower** than the rest-of-period EMEA OTIF" rather than "OTIF = 82.4%."

### 4.3. State isolation

Each test that mutates server state (creates user, publishes KPI, adds tile to dashboard) must use a unique `userId` (`test-${timestamp}-${slug}`) and clean up after itself or accept it leaves state.

### 4.4. Reporting

The next session should produce a single artifact: `docs/TEST_REPORT.md` with:
- Per-test row: ID, name, pass/fail/skip, duration, evidence (DB query result, API response excerpt, or screenshot path)
- A 1-paragraph executive summary
- For each failing test, a hypothesis on the root cause and a suggested next-action

---

## 5. Test Inventory

Conventions: `TC-{category}-{NN}`. Priority `P0` blocks demo, `P1` is should-have for a credible demo, `P2` is nice-to-have polish.

### 5.1. Data Foundation (DB checks)

| ID | Priority | Title |
|---|---|---|
| TC-DF-01 | P0 | All 11 supply chain tables exist and have row counts within expected bounds. |
| TC-DF-02 | P0 | KPI library has 23 KPIs; each row has non-null `display_name`, `unit`, `direction`, `exec_sql`, `trend_sql`, `owner`, `status`. |
| TC-DF-03 | P0 | **APAC port congestion anomaly is detectable.** Compare OTIF for `(origin_region='APAC' OR destination_region IN ('EMEA','APAC'))` shipments inside vs outside the Nov 8–22 window of the most recent November in the data. Inside-window OTIF is ≥ 5 pp lower. |
| TC-DF-04 | P0 | **SUP-0042 decline is detectable.** Bucket `purchase_orders` for `supplier_id='SUP-0042'` into "last 120 days" vs "earlier"; on-time rate (received_date ≤ promised_date) for the recent bucket is ≥ 10 pp lower. |
| TC-DF-05 | P1 | **EMEA WH-EMEA-02 incident is detectable.** Shipments from `WH-EMEA-02` ordered within ±1 day of May 6 (most recent May in seed range) show inflated `shipped_date - order_date` (median ≥ 2 days higher than the warehouse baseline). |
| TC-DF-06 | P1 | **Cutting Tools phase-out is detectable.** Share of `phasing_out` SKUs in `category='Cutting Tools'` is ≥ 3× the rate in other categories. |
| TC-DF-07 | P1 | No orphan FK rows — every `shipment_lines.shipment_id` exists in `shipments`, every `inventory_snapshots.sku_id` in `skus`, etc. (Cheap query: anti-join each FK and assert zero rows.) |
| TC-DF-08 | P2 | `inventory_snapshots` covers both daily-tracked top SKUs and monthly-tracked tail. Expect ~300 SKUs with 300+ distinct snapshot dates each, and the remaining ~4700 SKUs with ≤ 15 distinct snapshot dates each. |

### 5.2. KPI Correctness (API + DB)

| ID | Priority | Title |
|---|---|---|
| TC-KPI-01 | P0 | `GET /api/metrics?metricIds=<all 23>` returns a `MetricValue` for every KPI; none NaN, none null, none Infinity. |
| TC-KPI-02 | P0 | Each KPI's value is in a plausible band. Concrete bounds per KPI (the implementer should encode these explicitly): OTIF 75–98, perfect_order_rate 60–95, order_cycle_time 1–20 days, line_fill_rate 80–99, backorder_rate 1–20, same_day_ship_rate 20–80, inventory_turns 1–25, days_of_supply 10–120, stockout_rate 0–15, excess_inventory_value > 0, critical_sku_stockout_rate 0–10, supplier_otd 75–98, supplier_otif 70–95, po_cycle_time 5–35 days, avg_lead_time 10–40 days, supplier_defect_rate 0–10, carrier_otd 80–99, avg_transit_days 1–30, damage_rate 0–5, exception_rate 1–30, avg_exception_mttr 1–250 hours, return_rate 5–25, warehouse_capacity_util 20–95. |
| TC-KPI-03 | P1 | Each KPI's `trend` array has ≥ 6 monthly buckets (last 12 months of data → ≥ 6 months even after seasonality). |
| TC-KPI-04 | P1 | Threshold direction matches data shape. For each KPI, when `direction='higher-is-better'`, the current value being above `greenMax` would correctly classify as healthy; when `'lower-is-better'`, below `greenMax` is healthy. Spot-check 3 KPIs of each direction. |
| TC-KPI-05 | P1 | Snapshot-based KPIs use `(SELECT MAX(snapshot_date) FROM inventory_snapshots)`, not a date filter. Verify `days_of_supply`, `stockout_rate`, `excess_inventory_value`, `critical_sku_stockout_rate`, `warehouse_capacity_util` queries don't depend on `dateStart`/`dateEnd`. |
| TC-KPI-06 | P0 | **`compareTo='prior_period'` returns a `comparison` block.** With `dateStart=<recent 30d ago>, dateEnd=<today>, compareTo=prior_period`, response includes `comparison.previous`, `deltaAbs`, `deltaPct`, `basis='prior_period'`, `basisLabel='vs prior period'`. The previous-window query uses the same width shifted back by that width. |
| TC-KPI-07 | P0 | **`compareTo='prior_year'` shifts the window by 365 days.** Same setup with `compareTo=prior_year` returns `basis='prior_year'`, `basisLabel='vs prior year'`, and `comparison.previous` corresponds to the year-ago window (not the prior period). |
| TC-KPI-08 | P1 | `compareTo` without `dateStart`/`dateEnd` is silently ignored (no `comparison` field; no 5xx). The `shiftFiltersForComparison` helper returns null in that case. |
| TC-KPI-09 | P1 | `compareTo='none'` (explicit) is treated the same as omitting it — no comparison query is run. (Spot-check via timing or by mocking the pool to assert query count.) |
| TC-KPI-10 | P1 | `comparison.deltaPct` math: when current=110 and previous=100, `deltaAbs=10`, `deltaPct=10.0`. When previous=0, `deltaPct=0` (no divide-by-zero). |

### 5.3. Filter Application (API)

| ID | Priority | Title |
|---|---|---|
| TC-FIL-01 | P0 | Empty filters produce the canonical result (sanity baseline). |
| TC-FIL-02 | P0 | `destination_region=EMEA` filter changes OTIF, line_fill_rate, return_rate (shipment-based KPIs) but **does not change** supplier_otd, po_cycle_time (PO-based KPIs without warehouse_id) — verifies CTE wrapper only touches referenced fact tables. |
| TC-FIL-03 | P0 | `warehouse_id=WH-EMEA-02` filter affects shipments + inventory + PO KPIs (it's referenced in all three fact tables). |
| TC-FIL-04 | P0 | Date filter narrows the shipment window correctly. Compare `count(*)` returned for narrow vs wide windows. |
| TC-FIL-05 | P1 | Filters compose. `destination_region=EMEA` AND `dateStart=<recent Nov 8>` AND `dateEnd=<recent Nov 22>` produces noticeably lower OTIF than either filter alone (compounds the anomaly). |
| TC-FIL-06 | P1 | KPIs with subqueries / CTEs still respect filters. `perfect_order_rate` (CTE-based) and `inventory_turns` (two-CTE join) should return a sensible number when filtered, not error. |
| TC-FIL-07 | P0 | **APAC port congestion narrative produces a visible dip.** With `destination_region=EMEA, dateStart=<Nov 8>, dateEnd=<Nov 22>`, OTIF is at least 5pp lower than the same EMEA filter over an off-anomaly month. |
| TC-FIL-08 | P2 | Unknown filter values (e.g., `destination_region=Antarctica`) return zero-row results gracefully, not 500s. |

### 5.4. Personas (API)

| ID | Priority | Title |
|---|---|---|
| TC-PER-01 | P0 | `GET /api/metrics/personas` returns exactly three keys: `csco`, `warehouse-director`, `procurement-lead`. |
| TC-PER-02 | P0 | Each persona has 5–6 metrics, all with IDs in `AVAILABLE_METRICS`. |
| TC-PER-03 | P1 | Persona adoption via `PUT /api/dashboard/:userId` stores under the supplied userId and round-trips on `GET`. |
| TC-PER-04 | P1 | CSCO persona includes `otif_rate`, `inventory_turns`, `exception_rate` (the demo headlines). Warehouse Director includes `same_day_ship_rate`, `line_fill_rate`. Procurement Lead includes `supplier_otd`, `po_cycle_time`. |

### 5.5. Onboarding Flow (Playwright)

| ID | Priority | Title |
|---|---|---|
| TC-ONB-01 | P0 | Navigating to the unauthenticated app and registering a new user lands on the persona picker. Three cards visible: CSCO, Warehouse Director, Procurement Lead — with supply chain language in descriptions (no "Sales Rep", no "Revenue"). |
| TC-ONB-02 | P0 | Clicking the CSCO card transitions to the dashboard, which renders ≥ 4 KPI tiles within 5s. |
| TC-ONB-03 | P1 | "Build a custom dashboard with AI" path opens the chat. Example prompts shown are supply chain (mention OTIF / supplier OTD / line fill). |
| TC-ONB-04 | P1 | Sending the supply chain example prompt produces an LLM reply (no 5xx). Eventually transitions to an interpretation review or dashboard. |

### 5.6. Dashboard Chat (Playwright + API)

| ID | Priority | Title |
|---|---|---|
| TC-DBC-01 | P0 | After adopting CSCO persona, "add a gauge for damage rate" results in a new tile with `chartType='gauge'` and id `damage_rate`. |
| TC-DBC-02 | P0 | "Remove the X tile" removes a tile and reindexes positions. Tile count decreases by 1. |
| TC-DBC-03 | P0 | "Filter to EMEA shipments" sets `config.globalFilters.destination_region='EMEA'`. Subsequent metric fetches include `destination_region=EMEA` in query params. |
| TC-DBC-04 | P1 | "Break down OTIF by category" adds a `chartType='breakdown'` tile with `breakdownBy='category'`. |
| TC-DBC-05 | P0 | **Chat never refuses UI/filter asks.** Send "add a date filter UI" → response must NOT contain "can't create UI" or "can only filter by"; must either apply a filter or point at the existing FilterBar. (Per memory.) |
| TC-DBC-06 | P1 | Asking for a KPI NOT in the registry triggers the `author` action. Verify by sending "track average dwell time at each warehouse" and asserting `res.body.action === 'author'`. |
| TC-DBC-07 | P1 | Multi-turn context: ask "what's our worst territory?" then "filter to that one" — verify the second turn produces a `filter` action with a region value. (Tests context handoff; may be flaky depending on LLM nondeterminism — mark as informational if it fails twice.) |
| TC-DBC-08 | P2 | Chat 503 path: simulate Anthropic 429 → app shows a graceful banner, doesn't crash. (Hard to trigger in real env; consider mocking at the API level or skip in browser tests.) |

### 5.7. KPI Studio (Playwright + API)

| ID | Priority | Title |
|---|---|---|
| TC-STU-01 | P0 | KPI Studio chat: "I want to track dwell time by warehouse" → response is either a clarifying question OR a propose with a `candidate` that has `unit`, `direction`, `sqlLogic`, `thresholds`. |
| TC-STU-02 | P0 | Proposed candidate SQL references `production.supply_chain.<table>` (not `sales_orders`). |
| TC-STU-03 | P1 | Validation pipeline: `POST /api/kpi-studio/:userId/validate` with a candidate streams ≥ 3 NDJSON stages (parsing, schema check, query execution) with statuses. |
| TC-STU-04 | P1 | Publish flow: candidate → publish → appears in `GET /api/kpis/published`. |
| TC-STU-05 | P2 | Published KPI appears in the dashboard via chat: "add my new dwell_time KPI" produces an `add` action with that id. |

### 5.8. KPI Catalog + Health (Playwright)

| ID | Priority | Title |
|---|---|---|
| TC-CAT-01 | P0 | KPI Catalog page lists ≥ 23 rows. Each row shows `displayName`, `owner`, `unit`, `status`. |
| TC-CAT-02 | P0 | Spot-check: clicking an OTIF row shows version history (at least one prior `deprecated` version for `otif_rate` per the seed). |
| TC-CAT-03 | P1 | KPI Health page lists rows for each KPI with `lastRunAt` and at least one assertion result. Refresh button triggers a re-run and timestamps update. |

### 5.9. Filter Bar UI (Playwright)

| ID | Priority | Title |
|---|---|---|
| TC-FBA-01 | P0 | FilterBar shows 5 dropdowns (Region, Warehouse, Segment, Category, Supplier Tier) and From/To date inputs. No remnant of "Product Line / Territory / Country / Deal Size." |
| TC-FBA-02 | P0 | Each dropdown is populated with values from the DB (Region has NA/EMEA/APAC/LATAM; Category has all 7 categories; etc.). |
| TC-FBA-03 | P1 | Selecting `destination_region=EMEA` triggers a refetch — at least one KPI tile's value visibly changes within 3s. |
| TC-FBA-04 | P1 | "Clear all" button resets every filter to empty and triggers refetch. |
| TC-FBA-05 | P2 | Date presets (Today / 7d / 30d / MTD / YTD) populate dateStart/dateEnd correctly. |

### 5.10. New Widget Types — API layer (HTTP checks)

The Phase 4 widget endpoints landed: `/api/widgets/annotations`, `/api/widgets/pivot`, `/api/widgets/funnel`. Test these at the API layer first; browser rendering is in 5.11.

| ID | Priority | Title |
|---|---|---|
| TC-WID-API-01 | P0 | `GET /api/widgets/annotations` returns `{ annotations: AnnotationEvent[] }`. List includes at least the four narrative anomalies (APAC port congestion, SUP-0042 OTD decline, EMEA WH-EMEA-02 May 6 incident, Cutting Tools phase-out) — match by description substring or event_date. Each event has the fields required by `AnnotationEvent` (verify the type in `shared/types.ts`). |
| TC-WID-API-02 | P0 | `GET /api/widgets/pivot?metricId=otif_rate&rowDim=category&colDim=destination_region` returns a `PivotSnapshot` with non-empty `rowLabels`, `colLabels`, and `cells`. Cell values for OTIF are between 0 and 100. |
| TC-WID-API-03 | P0 | Pivot respects filters. The same call with `dateStart=<recent Nov 8>&dateEnd=<recent Nov 22>` shows reduced OTIF cells in the EMEA column (APAC port congestion anomaly surfaces in pivot form). |
| TC-WID-API-04 | P1 | Pivot supports all six `PivotDimension` values for both rows and cols (`category`, `destination_region`, `warehouse_id`, `customer_segment`, `abc_class`, `supplier_tier`). Spot-check 3 pairings. |
| TC-WID-API-05 | P2 | Invalid pivot dimensions return 400 with a useful message — not a 500. |
| TC-WID-API-06 | P0 | `GET /api/widgets/funnel?source=shipment_lifecycle` returns a `FunnelSnapshot` with stage counts in the expected lifecycle order (Open → Picking → Packed → Shipped → Delivered). Stage counts are monotonically non-increasing along the funnel (drop-off, never gain). |
| TC-WID-API-07 | P1 | Funnel respects filters. `destination_region=APAC` produces different stage counts than empty filter; the totals at the funnel head correspond to filtered shipment counts. |

### 5.11. New Widget Types — Rendering (Playwright)

For each test: verify the widget *renders without error*. Visual perfection is out of scope — focus on "the chart appears with data, no console errors." Skip if no client renderer is wired for the widget type yet.

| ID | Priority | Title |
|---|---|---|
| TC-WID-UI-01 | P1 | Scorecard widget renders: large number + sparkline + delta chip. When `compareTo='prior_period'` is set on the dashboard, a comparison badge appears with deltaPct value. |
| TC-WID-UI-02 | P1 | Annotated time series shows ≥ 1 pin marker in the November window for OTIF. Hovering a pin reveals the annotation label. |
| TC-WID-UI-03 | P1 | Pivot widget renders a grid with the configured `rowDim × colDim` and color-coded cells. Cell color reflects value relative to thresholds (green/yellow/red bands). |
| TC-WID-UI-04 | P1 | Funnel widget renders shipment lifecycle stages with drop-off percentages between stages. |
| TC-WID-UI-05 | P2 | Markdown tile renders supplied prose with basic formatting (headers, lists, bold). |
| TC-WID-UI-06 | P2 | Sectioned layout: a dashboard with `layout.sections` renders distinct section headers between tile groups; sections respect `columns` override. Tiles with `sectionId` land in the right section. |

### 5.12. Demo Narrative Walkthroughs (Playwright — high-value, story-driven)

Each is a scripted user journey. The test passes if the scripted observations are confirmed.

| ID | Priority | Title |
|---|---|---|
| TC-DEM-01 | P0 | **"Why is OTIF down?" — APAC port congestion narrative.** Adopt CSCO persona → OTIF tile is visible → apply `dateStart=<recent Nov 8>, dateEnd=<recent Nov 22>` via FilterBar → OTIF value drops measurably (≥ 5 pp lower than YTD) → ask chat "what changed?" → response references shipments / delays / exceptions. |
| TC-DEM-02 | P1 | **Procurement Lead spots SUP-0042.** Adopt Procurement Lead persona → Supplier OTD tile visible → ask chat "show me OTD by supplier" → ranking appears OR chat routes to Studio for a new KPI → SUP-0042 is in the bottom group. |
| TC-DEM-03 | P1 | **Warehouse Director sees the EMEA incident.** Adopt Warehouse Director persona → filter `warehouse_id=WH-EMEA-02` → exception rate or same-day-ship-rate worsens. |
| TC-DEM-04 | P2 | **CSCO morning briefing — full flow.** Login → CSCO persona → all 6 headline tiles render with healthy/warning/critical mix (not all-green, not all-red) → click into a tile, see drill-through or detail drawer. |

### 5.13. Cross-Cutting / Robustness

| ID | Priority | Title |
|---|---|---|
| TC-CC-01 | P0 | **Migration idempotency.** Reboot the server twice → second boot logs "Supply chain data present (5000 SKUs). Skipping seed." and "KPI library present (23 KPIs)." No duplicate rows. |
| TC-CC-02 | P0 | **RESET_DATA=true wipes and reseeds cleanly.** `RESET_DATA=true npm run dev:server` (or equivalent) → tables truncated → reseeded to expected counts. End state matches first-time-boot. |
| TC-CC-03 | P0 | **Partial-seed bug regression.** After any boot mode, `exceptions`, `returns`, `kpi_definitions`, `kpi_versions` are all > 0. This is the specific regression flagged in SESSION_STATUS. |
| TC-CC-04 | P0 | `npm run build` succeeds for both server and client. |
| TC-CC-05 | P0 | `npm test` — all existing vitest tests still pass (78+). |
| TC-CC-06 | P1 | No console errors during a typical user session (login → persona → dashboard → chat → KPI catalog). |
| TC-CC-07 | P2 | Page load performance: initial dashboard renders within 3s on a fresh user adopt. |

---

## 6. Execution Sequence

Run categories in this order, halting on P0 failures:

1. **TC-CC-04, TC-CC-05** (build + vitest) — fail fast if the code doesn't even compile.
2. **5.1 Data Foundation + TC-CC-03** — without correct data, nothing downstream is meaningful.
3. **5.2 KPI Correctness, 5.3 Filter Application, 5.4 Personas** — core API surface.
4. **5.10 New Widget Types — API layer** — Phase 4 endpoints (annotations, pivot, funnel) before driving them in the browser.
5. **5.9 Filter Bar UI, 5.8 KPI Catalog/Health** — read-only UI surfaces.
6. **5.5 Onboarding, 5.6 Dashboard Chat, 5.7 KPI Studio** — interactive flows.
7. **5.11 New Widget Types — Rendering** — skip individual tests for widgets not yet wired to a renderer.
8. **5.12 Demo Narrative Walkthroughs** — the highest-value tests; capstone.
9. **5.13 Cross-Cutting** — anything not already covered.

---

## 7. Test Report Format

Output to `docs/TEST_REPORT.md`. Suggested skeleton:

```markdown
# Meridian Demo — Test Run Report
**Date:** <ISO>
**Branch:** <git rev>
**Tester:** Claude Code

## Executive Summary
<1-paragraph: what's working, what's not, blockers for demo readiness>

## Results

### Category 5.1 — Data Foundation
| ID | Status | Evidence | Notes |
|---|---|---|---|
| TC-DF-01 | PASS | row counts: suppliers=200, ... | |
| TC-DF-02 | FAIL | kpi_definitions has 0 rows | partial-seed bug from SESSION_STATUS not yet resolved — fix migrate.ts |
| ... | | | |

### Category 5.2 — KPI Correctness
...

## Failed Tests — Root Cause Hypotheses
- **TC-DF-02:** likely seedKpiLibrary failed silently in migrate.ts. Recommend: add per-KPI insert error log + retry on individual failure.
- ...

## Demo Readiness Verdict
- **P0 pass rate:** X / Y
- **Demo narratives (5.11) working:** X / 4
- **Blocking issues:** ...
- **Recommendation:** ready for demo / needs one more pass / fundamental issue
```

---

## 8. Tooling Notes For The Implementer

- **DB queries:** use the same pattern as the diagnostic command in SESSION_HISTORY's session 2026-05-12 entry — `node --env-file=.env -e '...'` with `pg.Pool`. Keep them inline; no test runner needed for DB checks.
- **API tests:** prefer `node fetch` over `curl` (cross-platform, easier JSON handling).
- **Browser tests:** use the `example-skills:webapp-testing` skill. One Playwright file per category (or one mega-file split by `describe` blocks — your call). Save screenshots to `scripts/test_artifacts/{TC-ID}.png` regardless of pass/fail.
- **Determinism:** when asserting on LLM-driven behavior, prefer presence/absence checks over exact string matches. Example: "response.action === 'filter'" not "response.message === 'Filtered to EMEA.'"
- **Skipping:** if a feature isn't built yet (e.g., a Phase 4 widget without a renderer), mark the relevant tests as `SKIP` with a reason in the report. Don't fail them.

---

## 9. Open Decisions For The Implementer

These weren't pre-decided in this design — make a call and document it in the report:

1. **Single test file vs. per-category files?** Either is fine. Single file is easier to run; per-category is easier to navigate.
2. **Mock the LLM for chat tests, or use the live API?** Live API is more realistic but slower + nondeterministic. Mocking matches the existing `tests/dashboardChat.test.ts` pattern. Recommendation: live for the demo-narrative walkthroughs (5.11), mocked for the granular chat tests (5.6, 5.7).
3. **Test user lifecycle:** create a fresh user per test, or reuse a long-lived `test-user`? Fresh-per-test is cleaner; long-lived is faster. Recommendation: long-lived for read-only tests, fresh for any that mutate config.
4. **Failure recovery:** if a test fails partway, should subsequent tests continue or halt? Default: continue, but halt on TC-CC-04 / TC-CC-05 (build failures make everything else moot).

---

## 10. Out Of Scope (For Now)

- Load testing / performance benchmarks.
- Cross-browser testing (Playwright defaults to Chromium; Firefox/Safari coverage is post-demo).
- Accessibility audits (a11y is a Phase 5+ concern).
- Visual regression / screenshot diffing (Phase 5+).
- Authentication / authorization edge cases (the demo's auth is rudimentary).
- Security testing (no PII; sandbox demo).
