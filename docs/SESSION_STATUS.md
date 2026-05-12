# Session Status

## Current State
**Project**: Meridian Industrial Supply demo (B2B industrial parts distributor)
**Phase**: 4 — Widget library expansion + showcase dashboard (Phases 1–3 of supply-chain migration complete)
**Last Commit**: `07e99bb` (pushed)
**Demo Pitch**: democratization of dashboard authoring for non-technical business users; the artifact itself must read as enterprise-grade BI work.

## Most Recent Completed Work — Session 2026-05-12
Replaced retail sales dataset (single `sales_orders` table + 16 KPIs + 3 sales personas) with a full 11-table B2B supply chain data model under Meridian Industrial Supply: 200 suppliers, 12 warehouses, 18 carriers, 2,000 customers, 5,000 SKUs, ~55k shipments, ~25k PO lines, ~947k inventory snapshots. New 23-KPI library across Fulfillment / Inventory / Procurement / Logistics / Operations. Three new personas (CSCO, Warehouse Director, Procurement Lead). All Claude prompts, filter dimensions, client UI, and 78-test suite updated. Four narrative anomalies seeded into the data (APAC port congestion Nov 8–22, supplier SUP-0042 OTD decline last 120 days, EMEA logistics incident May 6, Cutting Tools category phase-out). See SESSION_HISTORY.md for full detail.

## Open Issues To Resolve Before Showcase Work

**Bug — partial seed (top priority for next session):**
After running migrations once on the Railway-connected Postgres, three tables came up empty when the rest of the seed completed correctly:
- `exceptions`: 0 rows (expected ~15k)
- `returns`: 0 rows (expected ~8k)
- `kpi_definitions`: 0 rows (expected 23)
- `kpi_versions`: 0 rows (expected ~25)

Other tables seeded correctly (947k inventory snapshots and all the dimensions). Most likely either (a) seed was interrupted partway and the next boot skipped because skus had rows, or (b) a logic bug in `generateExceptions`/`generateReturns` or in `seedKpiLibrary`.

**Diagnostic plan:**
1. Run `RESET_DATA=true npm run dev` to force a clean wipe + reseed. Watch the console output for the per-step log lines (`seeded N exceptions`, `seeded N returns`, `Seeded 23 supply chain KPI definitions.`).
2. If exceptions/returns still come up empty, inspect the generation logic in `server/src/services/supplyChain/seedFacts.ts`:
   - `generateExceptions` iterates `shipments` and applies probability gating; if all probabilities are < `rng.next()`, nothing emits. Verify the rate math.
   - `generateReturns` requires `ship.status === 'Delivered' && ship.deliveredDate`. Verify the shipments generator is producing Delivered records (it should — anything more than `carrier.slaDays + 2` days old gets a deliveredDate unless future-dated).
3. If `kpi_definitions` stays empty, add per-KPI insert logging in `seedKpiLibrary` to find the failing row.

## Next Session Goals

1. **Resolve the partial-seed bug** (see above). Don't proceed to widget work until KPIs and exceptions/returns are seeded — KPIs especially block dashboard rendering.

2. **Phase 4 — Widget library expansion**. The simple bar/line/gauge widgets undercut the democratization pitch by making chat output look basic. Net-new widgets needed (per the plan in this session's chat):
   - **Scorecard** (number + sparkline + comparison vs target/prior period + delta badge) — biggest reusable win, upgrades every KPI tile
   - **Annotated time series** (line chart + event-pin overlay for anomalies)
   - **Pivot table** with conditional formatting (color cells by value)
   - **Funnel** (shipment lifecycle: Open → Picking → Packed → Shipped → Delivered, with drop-off %)
   - **Waterfall** (OTIF bridge: prior → on-time impact + in-full impact + exception impact → current)
   - **Cohort retention grid** (customers by acquisition month × monthly retention)
   - **Top-N list with embedded data bars** (e.g., top 10 suppliers by OTD ranked, with bar)
   - **Bullet chart** (actual vs target with qualitative bands)
   - **Calendar heatmap** (daily shipment volume across 12 months)
   - **Status grid** (compact tile-row with badge + spark + count per group)
   - **Stacked area** (status mix over time)
   - **Markdown text tile** (section headers / narrative context within a dashboard)
   - Recommended starting subset for first PR: **Scorecard + Annotated time series + Pivot + Funnel** plus the sectioned layout + filter bar `compareTo` toggle. Lands the ceiling-raise without a multi-week build.

3. **Phase 5 — Showcase dashboard**. Build the seeded "Q4 2025 Global Supply Chain Performance Review" CSCO view as a 16-tile sectioned dashboard. Sections: Headline (4 scorecards) / What Changed (annotated trend + waterfall) / Where (pivot + geo + status grid) / Customer & Pipeline (funnel + cohort + top-N) / Operations (bullet + calendar heatmap + stacked area). Wire it as the default landing for the CSCO persona.

## Constraints to Honor

From memory (`feedback_avoid_demo_theater.md`):
- **No demo-theater UI** — don't add author attribution chips, animated chat-builds-tile transitions, live tile preview during chat composition, or tool-use trail badges. The artifact's quality should make the democratization case on its own, not signage on top of it.

From memory (`feedback_chat_capabilities.md`):
- **Dashboard chat must never refuse UI / element asks.** Never say "can't create UI" or "can only filter by X." Chat is the app's primary mutator.

## Things to Verify on Railway/Local Boot

1. Server log shows full migration sequence on boot (`=== Migrations: starting ===` through `=== Migrations: complete ===`).
2. After boot, table row counts match expectations (see SESSION_HISTORY.md "Outstanding Issue" section).
3. Persona switcher shows the three new personas (CSCO, Warehouse Director, Procurement Lead).
4. Dashboard chat applies new filter dimensions correctly (e.g., "filter to EMEA" sets `destination_region=EMEA`).
5. KPI Catalog shows the 23 supply chain KPIs with their ownership + version history + tags.

## Skipped Untracked Files (intentionally not committed)

Pre-existing untracked, left alone:
- `.claude/` session state directory
- `docs/Dashboard-Demo-Showcase-v2.docx`, `Prompt-Guided-Dashboard-Demo-Showcase.docx`, `demo-walkthrough.webm`, `screenshots/`
- `scripts/`

User to decide whether any of these belong in git.
