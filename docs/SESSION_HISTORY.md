# Session History

## Session 2026-05-13: Chat-added tile fixes — drill-through + correct metric values

**Goal:** User reported "a lot of bugs" on cards added via dashboard chat — drill-down not appearing, no click affordance, and "previous numbers are bugged." Reproduce with Playwright, fix, then sweep every chart type × KPI combination for regressions.

**Completed Tasks:**

### 1. Reproduction via Playwright

Seeded a dashboard config directly through `PUT /api/dashboard/:userId` to skip the Claude onboarding round-trip, then drove the UI: opened the chat, asked "Break down OTIF by destination region," screenshotted, inspected each `.metric-card`'s computed `cursor` and `onClick` props via `page.evaluate`, then tried clicking each card and checking for the drawer.

Bugs confirmed before any fix:
- Chat-added breakdown card: `cursor=pointer hasOnClick=False reactClick=False` — clickable affordance with no handler, drawer never opened.
- Breakdown bars displayed `1,449,967,260.6%`, `977,678,409.8%` etc. — i.e. shipment revenue in dollars rendered through `metric.unit = "percent"`.

### 2. Click handler on breakdown / heatmap

`Dashboard.tsx renderTile` passed `onClick={openDetail}` to every chart type *except* the `breakdown`/`heatmap` branch. One-line fix per branch; both tile components already accepted the prop.

### 3. Categorical endpoint honors metricId

`generateCategoricalSnapshot` always returned `SUM(s.total_value)` per dimension regardless of which metric was requested. Fixed by:
- Exporting `PIVOT_DIM_SPECS` and `pivotValueExprFor` from `widgets.ts` (the same per-metric SQL expressions the pivot endpoint already uses).
- Resolving the requested metric def in `generateCategoricalSnapshot` and using `pivotValueExprFor(def).valueExpr` for each dim query.
- When no metric is supplied, fallback to `SUM(s.total_value)` so existing callers don't break.

After the fix, "OTIF by Region" returns `LATAM 48.1% · NA 46.7% · APAC 44.5% · EMEA 44.3%` — sensible per-region OTIF rates anchoring to the headline 47.9%.

### 4. abc_class and supplier_tier breakdowns

Chat prompt advertised these two `breakdownBy` values but `CategoricalSnapshot.breakdowns` only carried `byCategory/byRegion/byWarehouse/bySegment`, and `BreakdownChart`'s dimension mapper silently fell through to `byCategory`. Extended the type with `byAbcClass + bySupplierTier`, added their queries in `generateCategoricalSnapshot` via `PIVOT_DIM_SPECS['abc_class' | 'supplier_tier']`, and wired both into `BreakdownChart`'s dim switch.

### 5. Heatmap endpoint had the same metricId bug

Surfaced during the broad-coverage pass — `OTIF heatmap (category × region)` rendered `$102.94M` per cell. Fix mirrored breakdown:
- `generateHeatmapBreakdown` accepts optional `metricId`, resolves the def, uses `pivotValueExprFor` when supplied.
- `/api/metrics/heatmap` reads the new query param; `getHeatmapBreakdown` client helper accepts it.
- `HeatMapChart` passes `metric.id` (and added it to the fetch dep array) and replaced the hardcoded `formatAxis(val, 'dollars')` with `formatAxis(val, metric.unit || 'dollars')`.

After fix the OTIF heatmap shows real percentages per cell (Bearings × NA = 45.8%, etc.), correctly direction-colored against `higher-is-better`.

### 6. Broad-coverage Playwright sweep

Seeded a single dashboard exercising every chart type against diverse KPI shapes:
- Chart types: scorecard, number, line, bar, area, gauge, annotated_line, pivot, funnel, waterfall, top_n, bullet, calendar_heatmap, breakdown (×6 dims), heatmap, markdown.
- KPIs covered: `otif_rate` (percent), `exception_rate` (percent), `avg_lead_time` (days), `inventory_turns` (turns), `excess_inventory_value` (dollars), `supplier_otd` (percent), `avg_exception_mttr` (hours).

Results: **22/22 tiles rendered** without errors, **21/21 clickable tiles opened the drill drawer** (markdown intentionally not clickable), **0 console errors**. "vs prior" deltas formatted correctly across every unit type.

**Technical Decisions:**

- **Reuse pivot's per-metric SQL machinery, don't duplicate.** Both bugs (categorical + heatmap) had the same root cause — endpoints written before `pivotValueExprFor` existed never adopted it. Exporting two symbols beats writing a third metric-aware query function.
- **Keep the legacy `SUM(s.total_value)` fallback.** Some callers (the canonical/standard view, the categorical endpoint when no metric is passed) genuinely want shipment-value breakdowns. Branch on `metricId` presence rather than forcing a metric.
- **Heatmap cell formatter takes `metric.unit`.** Previously hardcoded `'dollars'` was an artifact of the always-revenue assumption. Once we honor the metric, the formatter has to follow.
- **`PIVOT_DIM_SPECS` already had `abc_class` and `supplier_tier`** — extending the categorical breakdown was a matter of plumbing, not new SQL. The shared `PIVOT_DIM_SPECS` table is now the single source of truth for dim → SQL across pivot + categorical breakdown.

**Issues Resolved:**

- Chat-added breakdown/heatmap tiles had no click handler — `cursor: pointer` was a lie.
- Categorical endpoint returned revenue regardless of metric, producing values like `1.4B%`.
- Heatmap endpoint had the same flaw and additionally hardcoded the cell formatter to dollars.
- `abc_class` / `supplier_tier` breakdowns silently fell back to byCategory.

**Git:** Commit `efef5c7` pushed to origin/master.

---

## Session 2026-05-12 (late evening): Role-fit scope decision + Manager/Director feature batch

**Goal:** Evaluate the artifact against three enterprise personas (Director, Analyst, Manager), narrow the demo's target audience, and build the highest-impact features for the remaining personas.

**Scope decision:**
- **Analyst removed from target users.** The role wanted SQL escape hatches, custom-formula editors, CSV/raw-row export, ad-hoc dimensions, and a forecast/stats layer — all of which pulled the product toward "be a BI tool" and away from the democratization wedge. Dropping Analyst lets the chat-driven, prompt-guided authoring concept stand without compromise.
- **Manager + Director are the canonical users.** Their needs are *to act on* what they see (drill, comment, set targets) rather than to author new analysis. This shifts the roadmap from "expose more data shaping" to "close the loop from observation to decision."
- **Real data connectors / SSO / RBAC explicitly out of scope** because this is a demo, not a v1 product. Every Manager/Director feature must be implementable against the seeded Meridian data and earn its place by making the walkthrough land.

**Trimmed feature requirements (from a 7-item list down to 3 for this session):**
1. Drill-to-detail — biggest credibility multiplier; without it the dashboard reads as a poster.
2. Tile comments / pinned notes — collaboration sells cheaply.
3. Target line + vs-commitment delta on scorecards — Director's "vs commitment" framing, distinct from prior-period.

(Remaining deferred: export PPT/PDF, threshold alert setup UI, team scoreboard widget, mobile read pass.)

**Completed Tasks:**

### 1. Drill-to-detail

- **New `GET /api/widgets/drill` endpoint** returning the underlying fact rows behind any metric, scoped to the active filter state. Per-metric row selection is opinionated — OTIF surfaces late/partial shipments sorted by days-late; supplier_otd surfaces late receipts sorted by days-late; critical_sku_stockout_rate surfaces A-class zero-on-hand inventory positions; etc.
- **21 metric-to-drill specs** in `DRILL_SPECS` mapping each KPI to a source table (shipments / purchase_orders / inventory_snapshots / exceptions / returns), a "what these rows represent" description, an ordered column set, and an extra-WHERE clause selecting *driver* rows rather than dumping the full fact table. Unmapped metrics fall through to a "recent shipments in scope" default.
- **Three drill-SQL builders** (`shipmentDrillSql`, `poDrillSql`, `inventoryDrillSql`) plus exception/return helpers, all reusing the FilterState dimension/date conditions. Count query mirrors the row query's JOINs so extra-WHERE clauses referencing joined aliases (e.g. `sk.abc_class` for critical_sku) don't error.
- **MetricDetailDrawer rewrite** to render the rows beneath the existing trend/threshold sections. Added active-filter chips at the top, a row-count summary ("3 of 28,820 shipments"), and per-column rendering (badges, currency, right-aligned numerics). Drawer now opens for selected tiles even when there's no snapshot value — i.e., self-fetching widgets (pivot, funnel, waterfall, calendar) can drill too.

### 2. Tile comments / pinned notes

- **`TileNote[]` on `MetricConfig`** with `id`, `author`, `body`, `createdAt`. Notes bucket by metric id (not tile instance), so a Director's note about OTIF appears wherever OTIF is rendered.
- **Notes section in MetricDetailDrawer** — list of pinned notes with author + timestamp + hover-to-delete, plus a textarea with Cmd/Ctrl+Enter shortcut for pinning. Persisted through the existing `updateDashboardConfig` path.
- **Real-author attribution.** Notes are attributed to `UserProfile.displayName` of the logged-in user (passed App.tsx → Dashboard → drawer). This respects the `feedback_avoid_demo_theater.md` rule against synthetic author chips — we never fabricate other personas as authors; only the actual user is named.
- **Note-pin badge on tiles** — amber rounded badge with count, rendered next to the health badge on `MetricTile` and `ScorecardTile`. Subtle by design.

### 3. Target line + vs-commitment delta

- **Scorecard "vs target" line** alongside the existing "vs prior period" delta. Only renders when `MetricConfig.target` is explicitly set (not when it's derived from `green.max`) — this is the Director-facing commitment comparison, kept separate from the green-threshold display so the two don't get conflated.
- **Sparkline reference line** at the target value, with a hidden `YAxis` extended to include the target so the line is always visible even when the trend never crosses it.
- **MetricDetailDrawer label switch.** When `metric.target` is set, the reference line and badge label read "Target"; otherwise they read "Healthy threshold." Same data structure, semantically distinct presentation.

**Technical Decisions:**

- **Drill row selection is opinionated, not generic.** A `SELECT * FROM shipments LIMIT 50` drill wastes the click — it returns rows that have nothing in particular to do with why the metric is red. Each spec encodes "what drives this number" (late + partial for OTIF, zero-on-hand for stockout) so the drill answers the natural follow-up question. Trade-off: it's per-metric work to add new ones, but the default fallback prevents a hard error for unmapped metrics.
- **Notes bucket by metric id, not tile id.** A user with two OTIF widgets (scorecard + waterfall) shares notes between them. The mental model is "I'm noting something about OTIF," not "this tile instance." Sharing across tile instances reduces duplication and matches how a Director would actually think.
- **Target distinct from `thresholds.green.max`.** Green threshold defines health bands ("acceptable performance"). Target is the commitment ("what we promised the board"). They are often the same number, but they're conceptually different — a CSCO may run a 92% OTIF green threshold but commit to 95% to the board. Surfacing them separately on scorecards lets the same dashboard serve both Director (vs commitment) and Manager (vs healthy) framings.
- **Drawer accepts optional `value`.** Previously the drawer only opened for snapshot-backed tiles, so clicks from pivot/funnel/waterfall/calendar opened nothing. Made `value` optional and gated trend/threshold/stat sections on its presence — drill rows and notes work for any selected tile.

**Issues Resolved:**

- **First version of inventory drill crashed with "missing FROM-clause entry for table sk".** The count query didn't include the `JOIN skus sk` that the row query did, so `critical_sku_stockout_rate`'s `sk.abc_class = 'A'` predicate failed when counting. Fixed by mirroring the row-query joins in the count query for all three drill builders (shipments + customers/warehouses/carriers, POs + suppliers/warehouses, inventory + warehouses/skus).

**Files Created:** none.

**Files Modified:**
- `shared/types.ts` — `TileNote`, `DrillSnapshot`, `DrillColumn`, `DrillSourceTable`; `MetricConfig.notes` field.
- `server/src/services/widgets.ts` — `generateDrill` + per-metric `DRILL_SPECS` + three drill-SQL builders + filter helpers + count-query JOIN mirrors.
- `server/src/routes/widgets.ts` — `GET /drill` route.
- `client/src/api/client.ts` — `getDrill` API helper.
- `client/src/components/dashboard/MetricDetailDrawer.tsx` — full rewrite with drill, notes, filter chips, optional value support.
- `client/src/components/dashboard/ScorecardTile.tsx` — vs-target delta, sparkline target reference line, note badge.
- `client/src/components/dashboard/MetricTile.tsx` — note badge.
- `client/src/components/dashboard/Dashboard.tsx` — `userName` prop, `addNote`/`removeNote` handlers, drawer wiring (filters/author/handlers).
- `client/src/App.tsx` — pass `user.displayName` to Dashboard as `userName`.

**Tests:** 110 passing (unchanged — the new endpoint is exercised via live API probes, no unit tests added for the drill SQL since it's largely seeded-data shape work).

**Open verification:** Browser walkthrough of the new drawer is the natural next step. Live API probes confirmed `otif_rate`, `supplier_otd`, `critical_sku_stockout_rate`, and `exception_rate` drills return the expected source tables and row counts (28,820 OTIF-miss shipments, 21,331 late POs, 27,657 critical-SKU positions, 1,223 APAC exceptions under filter). But the drawer UI itself — table layout, filter chips, note input UX, target line visibility — has not been visually verified.

---

## Session 2026-05-12 (evening): Filter correctness pass + Phase 4.5 widget batch

**Goal:** Validate Phase 4 widgets in the browser, fix filter behavior the user flagged ("filters still don't feel like they work"), then ship the next 4 widget types from the Phase 4.5 list.

**Completed Tasks:**

### 1. Filter correctness — three commits

- **`108ee43` — date filtering on `exceptions`/`returns` + dimension wiring.** Five KPIs (`exception_rate`, `damage_rate`, `return_rate`, `supplier_defect_rate`, `avg_exception_mttr`) silently broke under any timeframe filter because `applyFilters` never wrapped the `exceptions` or `returns` tables in CTEs. Numerator counted all-time events while denominator was scoped to the date window, inflating rates past 100% on short windows. Also wired the previously-stubbed `customer_segment` / `sku_category` / `supplier_tier` filter-bar selects through the existing fact-table CTEs via subquery-IN conditions on `customers` / `skus` / `suppliers`. Added a pre-existing `injectCtes` bug fix: it used `String.replace` with a string template, so a `$1` SQL parameter placeholder inside an injected CTE body got interpreted as a regex backreference whenever the source SQL had a leading `WITH` clause.

- **`4f2887f` — cross-filter under date-only + annualize inventory_turns.** Browser verification revealed two more issues. (a) `return_rate` showed 64% on a 7d window because returns logged in the last 7 days were being matched against shipments delivered weeks earlier — extended cross-filtering to apply whenever the shipments/PO CTEs exist, not just when a non-date dim filter is active. (b) `inventory_turns` returned per-window ratios (0.17 on 30d, 0.03 on 7d) but the green threshold is 8 turns/year, so it always read as catastrophically broken. Added `× (365 / span_days)` annualization to the execSql; updated both the seed file and added an idempotent KPI-execSql fixup step in `migrate.ts` so existing DBs pick up the corrected SQL on next boot.

- **`10b39b6` — ignore stale /api/metrics responses on rapid filter change.** Real root cause of the user's perception. Rapid clicks across filter presets fire correct, date-scoped requests, but responses arrive out of order: the slower no-dates initial mount fetch returns AFTER user-clicked filtered fetches and overwrites the snapshot with stale all-time data. Inlined the fetch into its `useEffect` with a closure-local `cancelled` flag so late-arriving responses from cancelled effects are silently dropped. Same pattern handles React StrictMode double-invocation in dev.

### 2. Phase 4.5 widget batch — `fe250be`

Four new widgets, plus a React duplicate-key fix:

- **WaterfallTile** — OTIF change-decomposition bridge (Prior → On-time impact → In-full impact → Other → Current). Backend `generateOtifWaterfall` queries OTIF components for current and prior windows; on-time / in-full deltas are direct percentage-point shifts; the interaction term lands in "Other" so the bridge closes exactly. SVG-rendered stacked bars with running totals and signed-color labels.
- **TopNTile** — ranked list with embedded data bars. Procurement metrics (`supplier_otd`, `supplier_otif`, `po_cycle_time`, `supplier_defect_rate`, `avg_lead_time`) route to a separate `purchase_orders` aggregation path so per-supplier values reflect real OTD/lead-time, not shipment value. Other metrics use the shared `pivotValueExprFor()` shipment-level expression. `HAVING COUNT(*) >= 5` for procurement so a single-PO supplier doesn't score 100%.
- **BulletTile** — compact actual-vs-target with qualitative bands derived from the metric's existing thresholds. No new SQL — uses the standard snapshot endpoint for the value and composes bands via `buildBulletSnapshot`. Direction-aware (lower-is-better inverts band order).
- **CalendarHeatmapTile** — 7×52 weekday × week intensity grid. Backend supports `shipments_per_day` and `exceptions_per_day` sources. Anchors to last 365 days when no date filter is set; respects all dimension filters. Color scale: slate-50 → accent.

Plus:
- React duplicate-key warning fix: a metric id alone collides when multiple tiles share the same metric (e.g. scorecard + waterfall + bullet for OTIF). Added `tileKey(metric)` composing id + chartType + position + variant config; applied to all five `.map()` sites in Dashboard.tsx.
- Chat duplicate-detection extended: keys widget variants on their config (`waterfall.source`, `topN.dimension/n/ascending`, `calendar.source`) so users can add multiple configurations of the same metric without false-positive blocks.
- Claude prompts (`interpret.ts` + `dashboardChat.ts`) updated with capabilities + JSON examples for each new widget.

**Technical Decisions:**
- **Annualize via `MAX(order_date) - MIN(order_date)` not the user's filter window.** The shipments CTE is already date-filtered, so MAX/MIN within `_shipments_f` gives the actual data span, which handles edge cases like sparse weekends or missing days correctly. Falls back to all-time span (~365 days) when no filter is applied.
- **Procurement metrics get their own top-N path, not pivot's shipment-based expressions.** Ranking suppliers by `supplier_otd` via shipments would compute "supplier presence in shipments" instead of "supplier on-time rate," which is misleading. The procurement path queries `purchase_orders` directly with the canonical OTD/OTIF/cycle-time formulas.
- **Bullet has no separate fetch endpoint.** Built `buildBulletSnapshot(metricId, actual)` that takes a value and composes the bands. The route fetches the value via `generateSnapshot([metricId], filters)` so all filter machinery (date, dimension, compareTo) applies consistently with the rest of the dashboard.
- **Closure-local `cancelled` flag, not AbortController.** Aborting the HTTP request would save bandwidth but the failing test was the React state race, not network capacity. The flag pattern is also smaller (no signal plumbing through `getMetrics`), and the StrictMode dev double-invoke is handled the same way.

**Files Created:**
- `client/src/components/dashboard/WaterfallTile.tsx`
- `client/src/components/dashboard/TopNTile.tsx`
- `client/src/components/dashboard/BulletTile.tsx`
- `client/src/components/dashboard/CalendarHeatmapTile.tsx`
- `tests/applyFilters.test.ts`
- `tests/widgetsBatch2.test.ts`

**Files Modified:**
- `shared/types.ts` (waterfall/top_n/bullet/calendar_heatmap chart types + config + snapshot shapes)
- `server/src/services/salesData.ts` (exceptions/returns CTEs, dimension filters, cross-filter rule, `injectCtes` regex backreference fix, `shiftFiltersForComparison` exported)
- `server/src/services/widgets.ts` (waterfall, top-N, bullet, calendar generators)
- `server/src/services/migrate.ts` (idempotent KPI execSql fixup step)
- `server/src/services/supplyChain/seedKpis.ts` (annualized inventory_turns SQL)
- `server/src/routes/widgets.ts` (4 new endpoints)
- `server/src/routes/dashboardChat.ts` (extended duplicate-detection)
- `server/src/prompts/interpret.ts` + `prompts/dashboardChat.ts` (new widget capabilities + examples)
- `client/src/api/client.ts` (new fetch wrappers)
- `client/src/components/dashboard/Dashboard.tsx` (closure-cancelled fetch effect, `tileKey()`, render dispatch for 4 new widgets)

**Verified:**
- 110 tests passing (84 prior session + 26 new this session: 16 in `tests/applyFilters.test.ts`, 10 in `tests/widgets.test.ts` from the previous session, 5 in `tests/widgetsBatch2.test.ts`).
- Server `tsc` and client `tsc -b && vite build` clean.
- API-level: probed `/api/metrics` across Today/7d/30d/MTD/YTD/Q1/Q4 + dimension combos for each persona — values are coherent (Q4 EMEA shows the APAC + EMEA anomaly bite as expected; Strategic suppliers OTD 64% vs Tactical 57%).
- Browser-level: Playwright registered a fresh user, switched to CSCO persona, walked the timeframe presets — 7d / 30d / YTD / 7d-replay all show their correct API values now (race condition fix verified). Then added all 4 new widgets via dashboard chat — they render correctly against seeded Meridian data with the expected values (waterfall Net Δ -2.52pts, Top 10 suppliers 70-71% OTD, OTIF bullet 47.9%, calendar heatmap 365 cells).

**Open / Outstanding:**
- **Performance.** `perfect_order_rate` takes ~7s on Railway-hosted Postgres because of three EXISTS subqueries against `shipments`/`exceptions`/`returns`/`shipment_lines` per delivered shipment. Pre-existing — not caused by this session's changes — but very visible in the demo (initial dashboard load hangs in skeleton state for ~7 seconds). Worth tackling before the showcase: either add a covering index, materialize a `perfect_order_flag` column, or cache the value with a TTL.
- **Phase 4.5 second half:** Cohort retention grid, Status grid, Stacked area, Markdown text tile (renderer needs polish — currently just a `<p>` block). 4 widgets remaining from the original Phase 4.5 list.
- **Phase 5: Showcase dashboard.** "Q4 2025 Global Supply Chain Performance Review" CSCO view as a sectioned dashboard. Sections: Headline (4 scorecards) / What Changed (annotated trend + waterfall) / Where (pivot + status grid) / Customer & Pipeline (funnel + cohort + top-N) / Operations (bullet + calendar heatmap + stacked area). Wire as the default landing for the CSCO persona.

**Git Commits (this session):**
- `108ee43` — fix(filters): scope exceptions/returns by date + wire segment/category/tier
- `4f2887f` — fix(filters): cross-filter exceptions/returns under date-only + annualize inventory_turns
- `10b39b6` — fix(dashboard): ignore stale /api/metrics responses on rapid filter change
- `fe250be` — feat(widgets): Phase 4.5 batch — waterfall, top-N, bullet, calendar heatmap
- (this commit) — docs: session 2026-05-12 evening — filter correctness + Phase 4.5

---

## Session 2026-05-12 (afternoon): Phase 4 widget library expansion — first batch

**Goal:** Raise the widget ceiling so chat-authored dashboards read as enterprise BI work, not basic demo output. Build the recommended first batch (Scorecard + Annotated time series + Pivot + Funnel + sectioned layout + filter-bar compareTo toggle).

**Completed Tasks:**
- Extended `shared/types.ts`:
  - New `ChartType` union: `'scorecard' | 'annotated_line' | 'pivot' | 'funnel' | 'markdown'` joined the existing set.
  - `MetricConfig` now carries optional `sectionId`, `pivot: { rowDim, colDim }`, `funnel: { source }`, `target`, `markdown` fields.
  - `LayoutConfig.sections?: SectionConfig[]` for named groupings; each section can override `columns`.
  - `FilterState.compareTo?: 'none' | 'prior_period' | 'prior_year'` drives scorecard comparisons.
  - `MetricValue.comparison?` carries the server-computed prior-period / prior-year value, deltaAbs, deltaPct, basis, basisLabel.
  - New widget data shapes: `AnnotationEvent`, `PivotSnapshot`, `FunnelSnapshot`, `FunnelStage`, `TimeseriesSnapshot`, `TimeseriesPoint`.
- Backend:
  - `server/src/services/salesData.ts` — added `shiftFiltersForComparison(filters, basis)` and wired comparison fetch into `queryMetric` so any KPI with a date range + `compareTo` gets a server-computed `comparison` block.
  - `server/src/services/widgets.ts` (new) — exposes `getAnnotations()` (re-derives the 4 seeded anomaly dates from `TODAY` since there's no annotations table), `generatePivot(metricId, rowDim, colDim, filters)`, `generateShipmentFunnel(filters)`, `generateTimeseries(metricId, grain, filters)`. Pivot uses metric-specific value expressions (OTIF-as-rate, exception-as-rate, default SUM(total_value)). Funnel computes cumulative-reach counts for Open → Picking → Packed → Shipped → Delivered.
  - `server/src/routes/widgets.ts` (new) — `/api/widgets/annotations`, `/pivot`, `/funnel`, `/timeseries`. Wired into `server/src/index.ts`.
  - `server/src/routes/metrics.ts` — `parseFilters` now forwards `compareTo`.
- Client widgets (all new):
  - `ScorecardTile.tsx` — number + comparison badge + comparison detail line + target progress bar (higher-is-better) + sparkline. Reads `value.comparison` when present, falls back to `value.delta`.
  - `AnnotatedLineTile.tsx` — weekly line chart fetched via `/widgets/timeseries`. Renders `ReferenceArea` for range annotations, `ReferenceLine` for point events, `ReferenceDot` pins on the line, plus a legend list under the chart. Severity color coding (info/warning/critical).
  - `PivotTile.tsx` — rows × cols table with cells color-scaled (red → amber → emerald gradient, direction-aware). Defaults to `destination_region × customer_segment` if no pivot config supplied. Inline legend showing min → max.
  - `FunnelTile.tsx` — horizontal bars per stage with count + percentage + drop-off badge between stages + end-to-end conversion footer.
- Filter bar (`FilterBar.tsx`):
  - Added a "Compare to" segmented control (None / Prior period / Prior year) feeding `filters.compareTo`. Active state uses accent color.
  - `activeCount` now reflects an explicit compareTo selection.
- Dashboard (`Dashboard.tsx`):
  - Introduced `renderTile(metric)` unified dispatch covering all 10 chart types.
  - Self-fetching widgets (`pivot`, `funnel`, `annotated_line`, `markdown`) added to the snapshot-fetch exclusion set.
  - `topKpis` in Executive Summary now includes both `number` and `scorecard` tiles.
  - "Trend Charts" section in Overview now uses `renderTile`, surfacing pivots/funnels/annotated lines correctly.
  - All Metrics tab: when `layout.sections` is present, renders each section header + grid; otherwise falls back to the legacy single-grid path. Sections can override column counts.
- Claude prompts:
  - `prompts/interpret.ts` — chart-type guidance now lists all 10 types with usage hints; example schema includes optional `pivot`, `funnel`, `sectionId` fields and `layout.sections`.
  - `prompts/dashboardChat.ts` — capabilities list mentions scorecard / annotated_line / pivot / funnel / markdown. Added explicit JSON examples for each. Filter-action example shows `compareTo`.
- Chat route (`routes/dashboardChat.ts`) — duplicate-detection rewritten to discriminate widget variants by `breakdownBy` / `pivot` dims / `funnel.source`, so users can add multiple pivots or annotated lines with different configurations.
- Tests:
  - `tests/widgets.test.ts` (new) — 10 tests covering `shiftFiltersForComparison` (null cases, 7-day shift, year shift, recursion guard, non-date preservation) and `getAnnotations` (4 expected IDs, ISO date shape, APAC window dates, EMEA point event, severity union).
  - Full suite: 88 passed (78 prior + 10 new). Both server `tsc` and client `tsc -b && vite build` clean.

**Technical Decisions:**
- **Annotation derivation, not storage.** The four narrative anomalies are baked into seed values and reference `TODAY`. Persisting them as rows would duplicate truth-of-source; instead, `widgets.ts` re-derives the same dates with identical math (apacCongestionWindow, emeaIncidentDate, supDegradationStart, cuttingToolsPhaseOutStart). One place to update if windows ever shift.
- **Timeseries endpoint instead of richer trendSql.** Existing KPI `trendSql` returns values only, no dates. Rather than retrofit every KPI definition, the new `/widgets/timeseries` endpoint computes a dated series on demand using each metric's pivot value expression. Keeps published KPIs unchanged; the annotated-line widget gets its own data path.
- **Server-side comparison, not client-side delta math.** The `MetricValue.comparison` block is computed on the server because (a) it requires a second filtered query against shifted dates, and (b) the basis label and exact previous value are useful to render alongside the delta. The client falls back to `value.delta` (last-vs-prior trend point) when `comparison` isn't populated.
- **Self-fetching widgets.** Pivot, funnel, and annotated_line each hit their dedicated endpoints rather than piggybacking on `/metrics`. This lets them define their own data shapes without ballooning `MetricsSnapshot`, and avoids fetching pivot grids for tiles that aren't currently rendered.

**Files Created:**
- `server/src/services/widgets.ts`
- `server/src/routes/widgets.ts`
- `client/src/components/dashboard/ScorecardTile.tsx`
- `client/src/components/dashboard/AnnotatedLineTile.tsx`
- `client/src/components/dashboard/PivotTile.tsx`
- `client/src/components/dashboard/FunnelTile.tsx`
- `tests/widgets.test.ts`

**Files Modified:**
- `shared/types.ts`
- `server/src/index.ts`
- `server/src/services/salesData.ts`
- `server/src/routes/metrics.ts`
- `server/src/routes/dashboardChat.ts`
- `server/src/prompts/interpret.ts`
- `server/src/prompts/dashboardChat.ts`
- `client/src/api/client.ts`
- `client/src/components/dashboard/Dashboard.tsx`
- `client/src/components/dashboard/FilterBar.tsx`

**Outstanding for Next Session:**
- **Visual verification in the browser.** Builds + tests pass, but the four widgets haven't been eyeballed yet — start the dev server and walk through each tile type with seeded supply chain data, including the compareTo toggle behavior and the annotated line over the OTIF series during the APAC congestion window.
- **Phase 5 — Showcase dashboard.** Wire the "Q4 2025 Global Supply Chain Performance Review" CSCO view as a 16-tile sectioned dashboard using the new widgets. Sections: Headline (4 scorecards) / What Changed (annotated trend + waterfall) / Where (pivot + geo + status grid) / Customer & Pipeline (funnel + cohort + top-N) / Operations (bullet + calendar heatmap + stacked area).
- Remaining widget types from the original plan (waterfall, cohort retention grid, top-N with data bars, bullet chart, calendar heatmap, status grid, stacked area) — pull into a Phase 4.5 batch once the showcase exercises the first four enough to surface gaps.

**Git Commit:** Not yet committed — pending user review.

---

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
