# Session Status

## Current State

**Project**: Meridian Industrial Supply demo (B2B industrial parts distributor)
**Phase**: Manager + Director feature pass — first batch shipped (drill, notes, target); Phase 5 showcase still queued
**Last Commit**: `10b39b6` (pushed) — current session's work is staged, not yet committed
**Demo Pitch**: democratization of dashboard authoring for non-technical business users. The artifact must work as a Manager/Director surface for *acting on* what they see — drilling into detail, pinning context, comparing to commitments — not just looking at headline tiles.

## Target Users — Scope of Record

The demo targets **Manager and above only**. Analyst is explicitly out of scope.

- **Director** (e.g. CSCO) — needs board-ready scorecards, drill to evidence, commitment comparison, pinned context for ops reviews.
- **Manager** (e.g. Warehouse Director, Procurement Lead) — needs personalized view, drill to driver rows, threshold awareness, notes for 1:1s.
- **Analyst — dropped.** The role wanted SQL escape hatches, custom-formula editors, raw export, ad-hoc dimensions, statistical layer. All of those pulled the product toward "be a BI tool" and undermined the democratization wedge. Analysts will route to their own tools regardless.

**Out of scope for the demo** (would matter for a v1 product, not for the walkthrough): real ERP/WMS/TMS data connectors, SSO/RBAC, scheduled email/Slack delivery.

## Most Recent Completed Work — Session 2026-05-12 (late evening)

**Manager + Director feature batch #1** — drill, notes, target. Detailed history in `SESSION_HISTORY.md`.

- **`/api/widgets/drill`** — new endpoint returning fact-table rows behind any metric, scoped to active filters. 21 metric-to-drill specs encode *which* rows drive the number (OTIF → late/partial shipments, supplier_otd → late receipts, critical_sku_stockout → A-class zero-on-hand, etc.). Fallback to "recent shipments in scope" for unmapped metrics.
- **Drill section in `MetricDetailDrawer`** — table of rows with active-filter chips, row-count summary, per-column rendering. Drawer now also opens for pivot/funnel/waterfall/calendar tiles (previously gated on snapshot value presence).
- **Tile notes** — `MetricConfig.notes: TileNote[]` with author/body/createdAt. Pinned via the drawer, attributed to `UserProfile.displayName` (real user only — no synthetic personas). Amber note-pin badge on MetricTile and ScorecardTile when notes exist.
- **Target + vs-commitment delta** — Scorecard renders a separate "vs target" line when `MetricConfig.target` is explicitly set, distinct from "vs prior period." Sparkline shows a dashed target reference line. Drawer label switches between "Target" (explicit commitment) and "Healthy threshold" (derived from green.max).

Type additions: `TileNote`, `DrillSnapshot`, `DrillColumn`, `DrillSourceTable`, `MetricConfig.notes`. App.tsx passes `displayName` through to Dashboard for note authorship.

Tests: 110 passing (unchanged). Server `tsc` and client `tsc -b && vite build` clean. Live API probes confirm drill works for shipment-, PO-, inventory-, and exception-backed metrics with filter scoping.

## Widget library — current state

| Type | Status | Notes |
|---|---|---|
| number | ✓ | original |
| line / bar / area | ✓ | original |
| gauge | ✓ | original |
| breakdown | ✓ | original |
| heatmap | ✓ | original |
| **scorecard** | ✓ | Phase 4 — vs-target delta + sparkline reference line added this session |
| **annotated_line** | ✓ | Phase 4 |
| **pivot** | ✓ | Phase 4 |
| **funnel** | ✓ | Phase 4 |
| **markdown** | partial | Phase 4 — skeleton renderer only, needs proper markdown parser |
| **waterfall** | ✓ | Phase 4.5 |
| **top_n** | ✓ | Phase 4.5 |
| **bullet** | ✓ | Phase 4.5 |
| **calendar_heatmap** | ✓ | Phase 4.5 |
| cohort retention grid | not started | Phase 4.5 second half |
| status grid | not started | Phase 4.5 second half |
| stacked area | not started | Phase 4.5 second half |

## Open Issues / Verification Needed

- **Browser walkthrough of the new drawer is outstanding.** Drill rows, filter chips, note add/remove, scorecard target line / sparkline reference line have not been visually verified. Live API probes confirmed the backend works (28,820 OTIF-miss shipments, 21,331 late POs, 27,657 critical-SKU positions, 1,223 APAC exceptions under filter), but the drawer UI itself needs a click-through.
- **`perfect_order_rate` is ~7 seconds on Railway** (pre-existing, not caused by this session). Three EXISTS subqueries per delivered shipment. Should be tackled before Phase 5: materialize `perfect_order_flag` BOOLEAN on shipments at seed time + index it.

## Next Session Goals

Recommended order:

1. **Visual verification** of drill drawer + notes + target line against seeded data. Boot `npm run dev`, click into a red OTIF scorecard, confirm late shipments listed with days-late sort, pin a note, refresh and confirm persistence, toggle filters and confirm chip + scope updates.

2. **Manager + Director feature batch #2.** Pick from the deferred list:
   - **Threshold alert setup UI** — let the user configure "alert me when OTIF < 92" on a tile. Doesn't need to actually fire; the visible setup sells the story. Small lift.
   - **Team scoreboard widget** — Manager-specific. New widget type: sites/regions as rows with health badge + sparkline + owner. Larger lift (new widget shape + backend).
   - **Export to PNG/PDF** — closes the chat → dashboard → board pack loop. Could be a single-screen capture, doesn't need a full report builder.
   - **Comments + ownership extension** — add `assignedTo` to TileNote so a Director can hand a tile off to a Manager persona in the demo.

3. **Fix `perfect_order_rate` slowness** if it's blocking visual verification. Highest UX leverage — every persona that includes it sees a 7s load.

4. **Phase 5 — Showcase dashboard** as the default for the CSCO persona. Now benefits from drill + notes + target work — the showcase is the natural place to demo all three. Layout from prior planning: Headline (4 scorecards) / What Changed (annotated trend + waterfall) / Where (pivot + status grid) / Customer & Pipeline (funnel + top-N + cohort) / Operations (bullet + calendar heatmap + stacked area).

## Things to Verify on Railway/Local Boot

1. `/api/widgets/drill?metricId=otif_rate&limit=10` returns late/partial shipments sorted by days-late.
2. `/api/widgets/drill?metricId=critical_sku_stockout_rate&limit=10` returns A-class zero-on-hand positions (regression test for the count-query JOIN fix made this session).
3. Drawer opens for a pivot or funnel tile (no snapshot value) and the drill rows render.
4. Adding a note via the drawer persists across page reload.
5. A scorecard with `metric.target` set shows the "vs target" delta and a dashed line in the sparkline.
6. Pre-existing checks: `applyKpiFixups` log line appears; `/api/widgets/waterfall` returns 5-stage bridge; `/api/widgets/top-n?metricId=supplier_otd&dimension=supplier&n=10` returns supplier rates in 40-75% range; rapid filter clicks settle on correct values within ~10s.

## Constraints to Honor

From memory (`feedback_avoid_demo_theater.md`):
- No author attribution chips for *fake* identities, animated chat-builds-tile transitions, live tile preview during chat composition, or tool-use trail badges. **Real user notes attributed to the real logged-in user are fine** and don't violate this rule.

From memory (`feedback_chat_capabilities.md`):
- Dashboard chat must never refuse UI / element asks. Chat is the app's primary mutator.

## Skipped Untracked Files (intentionally not committed)

Pre-existing untracked, left alone:
- `.claude/`
- `docs/Dashboard-Demo-Showcase-v2.docx`, `Prompt-Guided-Dashboard-Demo-Showcase.docx`, `demo-walkthrough.webm`, `screenshots/`
- `scripts/` — gitignored per prior session's note.
