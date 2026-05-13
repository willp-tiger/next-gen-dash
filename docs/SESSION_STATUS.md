# Session Status

## Current State

**Project**: Meridian Industrial Supply demo (B2B industrial parts distributor)
**Phase**: Manager + Director feature pass — chat-tile correctness fixed; Phase 5 showcase still queued
**Last Commit**: `efef5c7` (pushed to origin/master) — chat-added breakdown/heatmap tiles: drill-through + correct metric values
**Demo Pitch**: democratization of dashboard authoring for non-technical business users. The artifact must work as a Manager/Director surface for *acting on* what they see — drilling into detail, pinning context, comparing to commitments — not just looking at headline tiles.

## Target Users — Scope of Record

The demo targets **Manager and above only**. Analyst is explicitly out of scope.

- **Director** (e.g. CSCO) — needs board-ready scorecards, drill to evidence, commitment comparison, pinned context for ops reviews.
- **Manager** (e.g. Warehouse Director, Procurement Lead) — needs personalized view, drill to driver rows, threshold awareness, notes for 1:1s.
- **Analyst — dropped.** The role wanted SQL escape hatches, custom-formula editors, raw export, ad-hoc dimensions, statistical layer. All of those pulled the product toward "be a BI tool" and undermined the democratization wedge.

**Out of scope for the demo** (would matter for a v1 product, not for the walkthrough): real ERP/WMS/TMS data connectors, SSO/RBAC, scheduled email/Slack delivery.

## Most Recent Completed Work — Session 2026-05-13

**Chat-added tile correctness pass.** User reported "a lot of bugs" on cards added via the dashboard chat — drill-down missing, no click affordance, "previous numbers are bugged." Reproduced with Playwright, fixed three root causes, then ran a broad coverage sweep. Detailed history in `SESSION_HISTORY.md`.

- **Click handler on breakdown/heatmap restored** — `Dashboard.tsx renderTile` was passing `onClick={openDetail}` to every chart type *except* these two; cursor-pointer was rendering but no React handler was attached. Drawer now opens for chat-added breakdown and heatmap tiles.
- **Categorical endpoint honors `metricId`** — previously always returned `SUM(s.total_value)`, so "OTIF by Region" rendered `$1.4B` labelled as percent. Now resolves the metric def and reuses `pivotValueExprFor` (the same per-metric SQL the pivot endpoint already used). Exported `PIVOT_DIM_SPECS` + `pivotValueExprFor` from `widgets.ts` so categorical can reuse them.
- **Heatmap endpoint had the same `metricId` bug** — surfaced during the broad sweep. Threaded `metricId` through `getHeatmapBreakdown` → `/api/metrics/heatmap` → `generateHeatmapBreakdown`. `HeatMapChart` also had a hardcoded `'dollars'` cell formatter; replaced with `metric.unit`.
- **`abc_class` and `supplier_tier` breakdowns now supported** — both were listed in the chat prompt but `CategoricalSnapshot.breakdowns` only carried four dims and `BreakdownChart` silently fell back to byCategory. Extended the type with `byAbcClass + bySupplierTier`, added queries, wired both into the chart's dim mapper.

**Playwright verification:** seeded a dashboard with every chart type × diverse KPI shapes (percent / days / turns / dollars / hours) and all 6 breakdown dims. 22/22 tiles render, 21/21 clickable tiles open the drill drawer (markdown intentionally not clickable), 0 console errors. "vs prior" deltas format correctly across every unit type.

## Widget library — current state

| Type | Status | Notes |
|---|---|---|
| number | ✓ | |
| line / bar / area | ✓ | |
| gauge | ✓ | |
| **breakdown** | ✓ | 2026-05-13 — drill click + 6 dims (added abc_class, supplier_tier) + metric-aware values |
| **heatmap** | ✓ | 2026-05-13 — drill click + metric-aware values + unit-aware cell formatter |
| scorecard | ✓ | vs-target delta + sparkline reference line |
| annotated_line | ✓ | |
| pivot | ✓ | |
| funnel | ✓ | |
| markdown | partial | skeleton renderer only, needs proper markdown parser |
| waterfall | ✓ | |
| top_n | ✓ | |
| bullet | ✓ | |
| calendar_heatmap | ✓ | |
| cohort retention grid | not started | Phase 4.5 second half |
| status grid | not started | Phase 4.5 second half |
| stacked area | not started | Phase 4.5 second half |

## Open Issues / Verification Needed

- **Note add/remove + target-line UI still unverified by walkthrough.** This session's Playwright sweep verified rendering, click handlers, and drill drawer opens for every chart type, but did NOT exercise note pinning, note deletion, or the scorecard target reference line behavior. Live API probes from prior session confirmed the backend works.
- **`perfect_order_rate` is ~7s on Railway** (pre-existing). Three EXISTS subqueries per delivered shipment. Should be tackled before Phase 5: materialize `perfect_order_flag` BOOLEAN on shipments + index.
- **`InventoryTurns` and `excess_inventory_value` deltas look extreme** (100%, 681% in seeded data). Not a rendering bug — values come from `generateSnapshot`. Worth a glance if a demo viewer would be confused.

## Next Session Goals

Recommended order:

1. **Walkthrough verification of notes + target line UI** against seeded data. Boot `npm run dev`, open a red OTIF scorecard drawer, pin a note, refresh, confirm persistence; toggle filters and confirm chip + scope updates; verify scorecard target line appears when `metric.target` is set.

2. **Manager + Director feature batch #2.** Pick from the deferred list:
   - **Threshold alert setup UI** — let the user configure "alert me when OTIF < 92" on a tile. Doesn't need to actually fire; visible setup sells the story.
   - **Team scoreboard widget** — Manager-specific. Sites/regions as rows with health badge + sparkline + owner.
   - **Export to PNG/PDF** — closes the chat → dashboard → board pack loop.
   - **Comments + ownership extension** — add `assignedTo` to `TileNote` so a Director can hand a tile off to a Manager persona.

3. **Fix `perfect_order_rate` slowness** if it's blocking visual verification.

4. **Phase 5 — Showcase dashboard** as default for CSCO persona. Layout: Headline (4 scorecards) / What Changed (annotated trend + waterfall) / Where (pivot + status grid) / Customer & Pipeline (funnel + top-N + cohort) / Operations (bullet + calendar heatmap + stacked area).

## Things to Verify on Railway/Local Boot

1. Add a breakdown via chat ("Break down OTIF by supplier tier"); cursor-pointer card shows real percentages, click opens drill drawer.
2. Add a heatmap by Category × Region for OTIF; cells render as percentages (not dollars), color-coded against direction.
3. `/api/metrics/categorical?metricIds=otif_rate` returns OTIF % per dim across all six breakdowns (byCategory / byRegion / byWarehouse / bySegment / byAbcClass / bySupplierTier).
4. `/api/metrics/heatmap?row=category&col=destination_region&metricId=otif_rate` returns percentages in the 40-50% range, not 100M+ values.
5. `/api/widgets/drill?metricId=otif_rate&limit=10` (regression check from prior session).
6. Adding a note via the drawer persists across reload (unchanged behavior, but worth re-checking after this session's drawer wiring changes).

## Constraints to Honor

From memory (`feedback_avoid_demo_theater.md`):
- No fake author chips, animated chat-builds-tile transitions, live tile preview during composition, or tool-use trail badges. Real notes attributed to the real logged-in user are fine.

From memory (`feedback_chat_capabilities.md`):
- Dashboard chat must never refuse UI / element asks. Chat is the app's primary mutator.

## Skipped Untracked Files (intentionally not committed)

Pre-existing untracked, left alone:
- `.claude/`
- `docs/Dashboard-Demo-Showcase-v2.docx`, `Prompt-Guided-Dashboard-Demo-Showcase.docx`, `demo-walkthrough.webm`, `screenshots/`
- `scripts/` — gitignored per prior session's note.
