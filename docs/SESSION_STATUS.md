# Session Status

## Current State
**Project**: Meridian Industrial Supply demo (B2B industrial parts distributor)
**Phase**: 4.5 widget batch shipped (8 of ~12 widget types live). Filter correctness verified end-to-end. Phase 5 showcase dashboard not yet built.
**Last Commit**: `fe250be` (pushed) — feat(widgets): Phase 4.5 batch — waterfall, top-N, bullet, calendar heatmap
**Demo Pitch**: democratization of dashboard authoring for non-technical business users; the artifact itself must read as enterprise-grade BI work.

## Most Recent Completed Work — Session 2026-05-12 (evening)

Two fronts:

**Filter correctness (3 commits).** User flagged "filters still don't feel like they work" while reviewing the Phase 4 dashboard. Three distinct bugs:
1. `applyFilters` never wrapped `exceptions`/`returns` tables, breaking 5 KPIs (`exception_rate`, `damage_rate`, `return_rate`, `supplier_defect_rate`, `avg_exception_mttr`) under any timeframe filter — fixed by adding both tables to the CTE pipeline + wiring `customer_segment`/`sku_category`/`supplier_tier` filter-bar selects (which were previously stubs).
2. `inventory_turns` returned per-window ratios but the green threshold is annualized — fixed by multiplying by `(365 / span_days)`.
3. **Real root cause of the user's perception**: rapid filter clicks fire correct requests but responses arrive out of order. The slower no-dates initial mount fetch returns last and overwrites the user's filtered snapshot with stale all-time data. Fixed with a closure-local `cancelled` flag in the fetch effect.

Plus a pre-existing `injectCtes` regex backreference bug uncovered by tests (`String.replace` was interpreting `$1` SQL placeholders as backreferences when source SQL had a leading `WITH`).

**Phase 4.5 widget batch (1 commit).** Four new widgets, all visually verified in browser via Playwright + dashboard chat:
- **WaterfallTile** — OTIF change-decomposition bridge.
- **TopNTile** — ranked rows with embedded data bars; procurement metrics route to `purchase_orders` so per-supplier values reflect real OTD/lead-time.
- **BulletTile** — actual + target tick over qualitative bands derived from thresholds.
- **CalendarHeatmapTile** — 7×52 weekday × week intensity grid for shipments_per_day or exceptions_per_day.

Plus a React duplicate-key fix (`tileKey()`) for the case where multiple tiles share a metric id (scorecard + waterfall + bullet for OTIF).

Tests: 110 passing total (84 prior + 26 new).

## Widget library — current state

| Type | Status | Notes |
|---|---|---|
| number | ✓ | original |
| line / bar / area | ✓ | original |
| gauge | ✓ | original |
| breakdown | ✓ | original |
| heatmap | ✓ | original |
| **scorecard** | ✓ | Phase 4 |
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

## Open Issues / Pre-existing Performance Problem

- **`perfect_order_rate` is ~7 seconds on Railway.** Pre-existing, not caused by this session's changes, but very visible: the dashboard hangs in skeleton state for ~7s on initial load because all CSCO persona metrics fetch in parallel and the slowest one gates the snapshot. The query has three EXISTS subqueries (shipment_lines, exceptions, returns) per delivered shipment. Should be tackled before the showcase: either add a covering index, materialize a `perfect_order_flag` column on shipments at seed time, or cache the value with a short TTL.

## Next Session Goals

Recommended order:

1. **Fix `perfect_order_rate` slowness.** Highest UX leverage — every persona that includes it sees a 7s load. Easiest fix: materialize `perfect_order_flag` BOOLEAN on `shipments` at seed time and add an index. Rewrite the KPI's execSql to a simple `AVG(perfect_order_flag::int) * 100`.

2. **Phase 5 — Showcase dashboard** as the default for the CSCO persona. Layout from prior planning: Headline (4 scorecards) / What Changed (annotated trend + waterfall) / Where (pivot + status grid) / Customer & Pipeline (funnel + top-N + cohort) / Operations (bullet + calendar heatmap + stacked area). The "cohort", "status grid", and "stacked area" sections need their widgets built first OR can be substituted with what already exists.

3. **Phase 4.5 second half** — cohort retention grid, status grid, stacked area, markdown text tile (proper renderer). 4 widgets remaining. Either ship before Phase 5, or scope Phase 5 to use only the current 8 widgets and slot the remaining 4 into a Phase 6.

## Things to Verify on Railway/Local Boot

1. `applyKpiFixups` log line appears: `Applied execSql fixup for KPI: inventory_turns` (or it's already up to date and skipped silently).
2. `/api/widgets/waterfall?source=otif_bridge` returns 5-stage bridge.
3. `/api/widgets/top-n?metricId=supplier_otd&dimension=supplier&n=10` returns suppliers with values in 40-75% range (NOT shipment value).
4. `/api/widgets/bullet?metricId=otif_rate` returns bands ordered critical → warning → healthy.
5. `/api/widgets/calendar?source=shipments_per_day` returns 365 cells.
6. Filter bar's "Compare to" toggle (None / Prior period / Prior year) flows through to scorecards.
7. Rapid clicks across 7d/30d/YTD presets settle on the correct values within ~10s (race condition fix).

## Constraints to Honor

From memory (`feedback_avoid_demo_theater.md`):
- **No demo-theater UI** — don't add author attribution chips, animated chat-builds-tile transitions, live tile preview during chat composition, or tool-use trail badges.

From memory (`feedback_chat_capabilities.md`):
- **Dashboard chat must never refuse UI / element asks.**

## Skipped Untracked Files (intentionally not committed)

Pre-existing untracked, left alone:
- `.claude/`
- `docs/Dashboard-Demo-Showcase-v2.docx`, `Prompt-Guided-Dashboard-Demo-Showcase.docx`, `demo-walkthrough.webm`, `screenshots/`
- `scripts/` — though this session added 3 new helper scripts here (`verify-filters.py`, `verify-batch2-widgets.py`, `trace-skeletons.py`); the directory is gitignored per the prior session's note.
