"""Full Manager+Director user-workflow walkthrough.

Walks each step of the user journey, screenshots into scripts/_inspect_out/workflow-NN-*.png,
logs console errors, and emits a JSON summary at the end. Designed to be eyeballed by a human
reviewer for UX/UI critique.

Steps (numbered to match screenshot filenames):
  01 login landing
  02 register (fresh user)
  03 onboarding picker
  04 onboarding chat — Director path (CSCO)
  05 interpretation review
  06 dashboard — initial "My Dashboard"
  07 dashboard chat opened with teaser
  08 chat-add a breakdown tile
  09 chat-add a heatmap tile
  10 drill drawer opened on a scorecard
  11 drill drawer — note added
  12 drill drawer — note persisted after reload
  13 filter bar — region applied (chip + scope update)
  14 standard view toggle
  15 persona switch (Warehouse Director)
  16 sidebar — KPI Catalog tab
  17 sidebar — KPI Studio seeded from chat author phrase

Run: python scripts/workflow-walkthrough.py
Requires: dev server on http://localhost:5173 (server on :3000)
"""
from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeout
import json
import os
import time
from datetime import datetime

OUT = os.path.join(os.path.dirname(__file__), '_inspect_out')
os.makedirs(OUT, exist_ok=True)

# Each finding: { step, severity ('P0'|'P1'|'P2'|'INFO'), title, detail }
findings: list[dict] = []
console_msgs: list[str] = []

def note(step: str, severity: str, title: str, detail: str = "") -> None:
    findings.append({"step": step, "severity": severity, "title": title, "detail": detail})
    print(f"  [{severity}] {step} — {title}: {detail}")

def shoot(page: Page, name: str) -> str:
    path = os.path.join(OUT, f"workflow-{name}.png")
    page.screenshot(path=path, full_page=True)
    print(f"  saved {os.path.basename(path)}")
    return path

def wait_idle(page: Page, ms: int = 600) -> None:
    try:
        page.wait_for_load_state('networkidle', timeout=8000)
    except PWTimeout:
        pass
    page.wait_for_timeout(ms)

def safe(action_name: str, fn):
    try:
        return fn()
    except Exception as e:
        note(action_name, 'P1', 'action failed', str(e)[:200])
        return None

def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
        page = ctx.new_page()

        page.on('console', lambda msg: console_msgs.append(f"[{msg.type}] {msg.text}"))
        page.on('pageerror', lambda exc: console_msgs.append(f"[PAGEERROR] {exc}"))
        page.on('requestfailed', lambda req: console_msgs.append(
            f"[REQFAIL] {req.method} {req.url} - {req.failure}"))

        ts = int(time.time())
        email = f"workflow-{ts}@demo.com"
        password = "password123"
        name = "Workflow Tester"

        # -------- 01: Login landing --------
        print("\n[01] Login landing")
        page.goto('http://localhost:5173')
        wait_idle(page)
        shoot(page, "01-login")

        # -------- 02: Register --------
        print("\n[02] Register fresh user")
        safe('02-register', lambda: page.click('text=Create Account'))
        page.wait_for_timeout(300)
        safe('02-register', lambda: page.fill('input[placeholder="Jane Smith"]', name))
        safe('02-register', lambda: page.fill('input[placeholder="you@company.com"]', email))
        safe('02-register', lambda: page.fill('input[placeholder="Enter your password"]', password))
        safe('02-register', lambda: page.click('button[type="submit"]'))
        wait_idle(page, 1200)
        shoot(page, "02-after-register")

        # -------- 03: Onboarding picker --------
        print("\n[03] Onboarding picker")
        shoot(page, "03-onboarding-picker")
        # Verify both columns visible
        if page.locator('text=Build with AI').count() == 0:
            note('03', 'P0', 'AI build column missing', 'cannot find "Build with AI" header')
        if page.locator('text=Start from a template').count() == 0:
            note('03', 'P0', 'templates column missing')

        # -------- 04: Onboarding chat (AI build path) --------
        print("\n[04] Onboarding chat — type a Director prompt")
        page.click('button:has-text("Start a conversation")')
        wait_idle(page, 1500)
        shoot(page, "04a-chat-opened")
        # Wait for assistant first message
        try:
            page.wait_for_selector('div.flex.justify-start div.bg-slate-50', timeout=15000)
        except PWTimeout:
            note('04', 'P0', 'no assistant greeting after 15s')

        prompt = ("I'm the CSCO of an industrial parts distributor. I care about OTIF, "
                  "working capital tied up in inventory, and exception rates across our regional DCs. "
                  "I review these weekly with the COO.")
        chat_input = page.locator('input[placeholder*="Type your answer"]').first
        chat_input.fill(prompt)
        chat_input.press('Enter')
        wait_idle(page, 1500)
        shoot(page, "04b-after-first-message")

        # Conversational chat may ask follow-up questions; reply briefly until isReady or timeout
        for i in range(4):
            try:
                # If "Looks Good" appears we already advanced to review; bail
                if page.locator('button:has-text("Looks Good")').count() > 0:
                    break
                # If chat input is gone we've advanced
                if page.locator('input[placeholder*="Type your answer"]').count() == 0:
                    break
                # Wait briefly for any new assistant message, then answer generically
                page.wait_for_timeout(2500)
                if page.locator('button:has-text("Looks Good")').count() > 0:
                    break
                chat_input = page.locator('input[placeholder*="Type your answer"]').first
                if chat_input.is_visible():
                    chat_input.fill("Weekly with the COO and the regional VPs. OTIF and inventory turns matter most; exceptions are secondary.")
                    chat_input.press('Enter')
                    wait_idle(page, 2500)
            except Exception as e:
                note('04', 'P1', f'follow-up iteration {i} failed', str(e)[:200])
                break

        # Wait for interpretation review screen (Claude builds the dashboard then routes here)
        confirm_sel = 'button:has-text("Build my dashboard")'
        try:
            page.wait_for_selector(confirm_sel, timeout=45000)
        except PWTimeout:
            note('04', 'P0', 'never reached interpretation review',
                 'Build with AI flow stuck — check Claude/interpret endpoint')
            shoot(page, "04c-stuck")
            browser.close()
            emit_report()
            return

        # -------- 05: Interpretation review --------
        print("\n[05] Interpretation review")
        shoot(page, "05-interpretation-review")
        page.click(confirm_sel)
        wait_idle(page, 2500)

        # -------- 06: Dashboard initial --------
        print("\n[06] Dashboard — initial My Dashboard")
        wait_idle(page, 2500)
        shoot(page, "06-dashboard-initial")
        # Detect first-load teaser
        if page.locator('text=Ask Claude anything about this dashboard').count() > 0:
            note('06', 'INFO', 'chat teaser visible on first load — good discoverability hint')

        # -------- 07: Open dashboard chat panel --------
        print("\n[07] Open dashboard chat panel")
        fab = page.locator('button:has-text("Ask Claude")').first
        if fab.count() > 0:
            fab.click()
            wait_idle(page, 600)
            shoot(page, "07-chat-panel-open")
        else:
            note('07', 'P0', 'Ask Claude FAB not found')

        # -------- 08: Chat-add a breakdown tile --------
        print("\n[08] Chat-add OTIF by region breakdown")
        chat_input_sel = 'input[placeholder*="Break down OTIF" i]'
        if page.locator(chat_input_sel).count() == 0:
            chat_input_sel = 'input[aria-label="Dashboard modification request"]'
        try:
            page.locator(chat_input_sel).first.fill("Break down OTIF by destination region")
            page.locator(chat_input_sel).first.press('Enter')
            wait_idle(page, 8000)
            shoot(page, "08-after-breakdown-added")
        except Exception as e:
            note('08', 'P0', 'chat-add breakdown failed', str(e)[:200])

        # -------- 09: Chat-add a heatmap tile --------
        print("\n[09] Chat-add Category × Region heatmap for OTIF")
        try:
            page.locator(chat_input_sel).first.fill("Show OTIF as a heatmap of category vs region")
            page.locator(chat_input_sel).first.press('Enter')
            wait_idle(page, 10000)
            shoot(page, "09-after-heatmap-added")
        except Exception as e:
            note('09', 'P1', 'chat-add heatmap failed', str(e)[:200])

        # Close chat to get a clean dashboard view
        try:
            close_btn = page.locator('button[title="Close chat"]').first
            if close_btn.count() > 0:
                close_btn.click()
            else:
                # Toggle button has title 'Close chat' when open. Fall back to FAB-toggle.
                fab.click()
            wait_idle(page, 400)
        except Exception:
            pass

        # -------- 10: Drill drawer on a scorecard --------
        print("\n[10] Open drill drawer on a scorecard tile")
        # Switch to All Metrics tab to make sure scorecards are visible (they may live there).
        try:
            all_metrics_tab = page.locator('button:has-text("All Metrics")').first
            if all_metrics_tab.count() > 0:
                all_metrics_tab.click()
                wait_idle(page, 1000)
        except Exception:
            pass
        # Try clicking the first metric-card with role=button (these are the hero KPI cards).
        # If we're on All Metrics there will be ScorecardTile/MetricTile components, also clickable.
        clicked = False
        for sel in [
            'div.metric-card[role="button"]',
            'div.metric-card.cursor-pointer',
            'div.metric-card',
        ]:
            cards = page.locator(sel)
            n = cards.count()
            for i in range(min(n, 5)):
                card = cards.nth(i)
                try:
                    if card.is_visible():
                        card.scroll_into_view_if_needed()
                        card.click()
                        wait_idle(page, 1200)
                        # Drawer is a portal; check for the heading text
                        if page.locator('text=Underlying Records').count() > 0:
                            clicked = True
                            break
                except Exception:
                    continue
            if clicked:
                break
        if clicked:
            shoot(page, "10-drill-drawer-open")
        else:
            note('10', 'P0', 'drill drawer did not open from any metric card')

        # -------- 11: Add a note --------
        print("\n[11] Pin a note in the drawer")
        if clicked:
            note_text = "Reviewed with COO 2026-05-13 — owner: ops-lead@meridian.example"
            try:
                ta = page.locator('textarea[placeholder*="Add a note"]').first
                ta.fill(note_text)
                page.locator('button:has-text("Pin")').first.click()
                wait_idle(page, 1500)
                shoot(page, "11-after-note-pinned")
                if page.locator(f'text={note_text}').count() == 0:
                    note('11', 'P1', 'pinned note did not appear in list')
            except Exception as e:
                note('11', 'P0', 'pinning a note failed', str(e)[:200])

            # -------- 12: Persistence — reload page --------
            print("\n[12] Reload and verify note persisted")
            # Dismiss the drawer using Escape (drawer listens for it).
            page.keyboard.press('Escape')
            wait_idle(page, 300)
            page.reload()
            wait_idle(page, 3000)
            shoot(page, "12a-after-reload")

            # After F1 fix, reload should land back on the dashboard (not login)
            if page.locator('text=Sign In').count() > 0 and page.locator('input[placeholder*="company"]').count() > 0:
                note('12', 'P0', 'reload kicked user back to login (session not persisted)')
            else:
                note('12', 'INFO', 'session survived reload')

            # Re-open a scorecard tile
            try:
                cards = page.locator('div.metric-card[role="button"], div.metric-card.cursor-pointer')
                for i in range(min(cards.count(), 5)):
                    c = cards.nth(i)
                    if c.is_visible():
                        c.click()
                        wait_idle(page, 1500)
                        if page.locator('text=Underlying Records').count() > 0:
                            break
                shoot(page, "12b-drawer-reopened")
                # Check note presence via the drawer body content
                drawer_body_has_note = (
                    page.locator(f'p:has-text("{note_text}")').count() > 0
                    or page.locator(f'text={note_text[:40]}').count() > 0
                )
                if not drawer_body_has_note:
                    note('12', 'P0', 'pinned note did not persist after reload',
                         'note string not found in reopened drawer')
                else:
                    note('12', 'INFO', 'note persisted across reload')
            except Exception as e:
                note('12', 'P1', 'reopening drawer after reload failed', str(e)[:200])
            page.keyboard.press('Escape')
            wait_idle(page, 400)

        # -------- 13: Apply filter (date preset + region via More filters) --------
        print("\n[13] Apply filter")
        try:
            # Period presets are buttons in the FilterBar. Pick 7d.
            preset_btn = page.locator('button:has-text("7d")').first
            if preset_btn.count() > 0 and preset_btn.is_visible():
                preset_btn.click()
                wait_idle(page, 1500)
                note('13', 'INFO', 'applied 7d period preset')
            shoot(page, "13a-7d-applied")

            # Open More filters dropdown and pick a region
            more = page.locator('button:has-text("More filters")').first
            if more.count() > 0:
                more.click()
                wait_idle(page, 500)
                shoot(page, "13b-more-filters-open")
                # The expanded FilterBar uses native <select> for dimensions
                sel = page.locator('select').first
                if sel.count() > 0:
                    options = sel.locator('option').all_text_contents()
                    target = next((o for o in options if o and o.strip()
                                   and o.strip().lower() not in ('all regions', 'all', '')), None)
                    if target:
                        sel.select_option(label=target)
                        wait_idle(page, 1500)
                        shoot(page, "13c-region-filtered")
                        note('13', 'INFO', f'filtered to region "{target}"')
                # Clear period preset back to None so subsequent steps are not narrowed
                none_btn = page.locator('button:has-text("None")').first
                if none_btn.count() > 0 and none_btn.is_visible():
                    none_btn.click()
                    wait_idle(page, 800)
        except Exception as e:
            note('13', 'P1', 'filter apply failed', str(e)[:200])

        # -------- 14: Standard view toggle --------
        print("\n[14] Standard view toggle")
        try:
            std = page.locator('button:has-text("Standard View")').first
            if std.count() > 0 and std.is_visible():
                std.click()
                wait_idle(page, 2200)
                shoot(page, "14a-standard-view")
                note('14', 'INFO', 'switched to Standard View')
                back = page.locator('button:has-text("My View")').first
                if back.count() > 0 and back.is_visible():
                    back.click()
                    wait_idle(page, 1800)
            shoot(page, "14b-back-to-mine")
        except Exception as e:
            note('14', 'P1', 'standard view toggle failed', str(e)[:200])

        # -------- 15: Persona switch — Compare Personas --------
        print("\n[15] Persona switch — Compare Personas")
        try:
            cmp = page.locator('button:has-text("Compare Personas")').first
            if cmp.count() > 0 and cmp.is_visible():
                cmp.click()
                wait_idle(page, 500)
                shoot(page, "15a-persona-dropdown")
                for label in ['Warehouse Director', 'Procurement Lead', 'CSCO']:
                    opt = page.locator(f'text="{label}"').first
                    if opt.count() > 0 and opt.is_visible():
                        opt.click()
                        wait_idle(page, 2000)
                        shoot(page, "15b-persona-switched")
                        note('15', 'INFO', f'switched persona to {label}')
                        break
            else:
                note('15', 'P2', 'Compare Personas button not found')
        except Exception as e:
            note('15', 'P2', 'persona switch failed', str(e)[:200])

        # -------- 16: KPI Catalog (sidebar nav) --------
        print("\n[16] KPI Catalog tab")
        try:
            btn = page.locator('aside button[title="KPI Catalog"], aside button:has-text("KPI Catalog")').first
            if btn.count() == 0:
                btn = page.locator('button:has-text("KPI Catalog")').first
            if btn.count() > 0:
                btn.click()
                wait_idle(page, 1800)
                shoot(page, "16-kpi-catalog")
                note('16', 'INFO', 'navigated to KPI Catalog')
        except Exception as e:
            note('16', 'P2', 'KPI Catalog nav failed', str(e)[:200])

        # -------- 17: KPI Studio --------
        print("\n[17] KPI Studio")
        try:
            btn = page.locator('aside button:has-text("KPI Studio")').first
            if btn.count() == 0:
                btn = page.locator('button:has-text("KPI Studio")').first
            if btn.count() > 0:
                btn.click()
                wait_idle(page, 1500)
                shoot(page, "17-kpi-studio")
                note('17', 'INFO', 'navigated to KPI Studio')
        except Exception as e:
            note('17', 'P2', 'KPI Studio nav failed', str(e)[:200])

        browser.close()
        emit_report()


def emit_report() -> None:
    report = {
        "timestamp": datetime.now().isoformat(),
        "findings": findings,
        "console_msgs": console_msgs[-200:],  # last 200
        "console_count": len(console_msgs),
    }
    out = os.path.join(OUT, 'workflow-report.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)
    print(f"\nReport: {out}")
    print(f"Findings: {len(findings)}, Console msgs: {len(console_msgs)}")


if __name__ == '__main__':
    main()
