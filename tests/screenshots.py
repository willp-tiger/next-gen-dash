"""
Capture screenshots of each phase of the Prompt-Guided Dashboard app.
Drives the UI through onboarding, interpretation review, and dashboard.
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
os.environ["PYTHONIOENCODING"] = "utf-8"
from playwright.sync_api import sync_playwright
import time
import json
import urllib.request

FRONTEND = "http://localhost:5177"
BACKEND = "http://localhost:3000"
SCREENSHOT_DIR = "docs/screenshots"

def api_post(path, data):
    req = urllib.request.Request(
        f"{BACKEND}{path}",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def take_screenshots():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        # === Screenshot 1: Onboarding - initial state ===
        page.goto(FRONTEND)
        page.wait_for_load_state("networkidle")
        time.sleep(2)  # wait for typing animation
        page.screenshot(path=f"{SCREENSHOT_DIR}/01_onboarding_start.png", full_page=True)
        print("✓ 01_onboarding_start.png")

        # === Screenshot 2: Onboarding - mid conversation ===
        # Type first answer
        input_field = page.locator("input[type='text']")
        input_field.fill("I manage a vehicle processing facility. I track inventory in pre-WIP and WIP stages.")
        page.screenshot(path=f"{SCREENSHOT_DIR}/02_onboarding_typing.png", full_page=True)
        print("✓ 02_onboarding_typing.png")

        # Send it
        page.locator("button:has-text('Send')").click()
        time.sleep(4)  # wait for LLM response
        page.screenshot(path=f"{SCREENSHOT_DIR}/03_onboarding_conversation.png", full_page=True)
        print("✓ 03_onboarding_conversation.png")

        # Second answer
        input_field = page.locator("input[type='text']")
        input_field.fill("We need to process 72 vehicles per hour and 600 per day. Below 60/hour is a problem. Pre-WIP should stay above 200 units.")
        page.locator("button:has-text('Send')").click()
        time.sleep(4)
        page.screenshot(path=f"{SCREENSHOT_DIR}/04_onboarding_targets.png", full_page=True)
        print("✓ 04_onboarding_targets.png")

        # Third answer to trigger READY
        input_field = page.locator("input[type='text']")
        input_field.fill("I also track cycle time per vehicle and first-pass quality rate. Quality should be above 95%.")
        page.locator("button:has-text('Send')").click()
        time.sleep(3)

        # Screenshot the building state if visible
        page.screenshot(path=f"{SCREENSHOT_DIR}/05_building_dashboard.png", full_page=True)
        print("✓ 05_building_dashboard.png")

        # Wait for interpretation review or dashboard to load
        time.sleep(15)  # Claude API call takes time
        page.screenshot(path=f"{SCREENSHOT_DIR}/06_interpretation_review.png", full_page=True)
        print("✓ 06_interpretation_review.png")

        # === Screenshot 6: Try to confirm the dashboard ===
        confirm_btn = page.locator("button:has-text('Looks Good')")
        if confirm_btn.count() > 0:
            confirm_btn.click()
            time.sleep(3)
            page.screenshot(path=f"{SCREENSHOT_DIR}/07_dashboard_personal.png", full_page=True)
            print("✓ 07_dashboard_personal.png")

            # === Screenshot 7: Standard view toggle ===
            standard_btn = page.locator("button:has-text('Standard View')")
            if standard_btn.count() > 0:
                standard_btn.click()
                time.sleep(3)
                page.screenshot(path=f"{SCREENSHOT_DIR}/08_dashboard_canonical.png", full_page=True)
                print("✓ 08_dashboard_canonical.png")

                # Switch back
                my_view_btn = page.locator("button:has-text('My View')")
                if my_view_btn.count() > 0:
                    my_view_btn.click()
                    time.sleep(2)
        else:
            # Maybe it went straight to dashboard
            print("  (no confirm button found - may have gone to dashboard directly)")

        # Final full-page screenshot
        page.screenshot(path=f"{SCREENSHOT_DIR}/09_final_state.png", full_page=True)
        print("✓ 09_final_state.png")

        browser.close()

    # === Now do a second run for Quality Manager persona ===
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        page.goto(FRONTEND)
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        # Quick conversation for quality persona
        msgs = [
            "I oversee quality control at a manufacturing plant. I track defect rates and first-pass yield.",
            "First-pass yield should be above 95%. Defect rate under 3% is good, over 5% is bad. I also watch escalations to engineering.",
            "Rework time and cost of defects matter too. We want to minimize both.",
        ]

        for i, msg in enumerate(msgs):
            input_field = page.locator("input[type='text']")
            input_field.fill(msg)
            page.locator("button:has-text('Send')").click()
            time.sleep(5)

        # Wait for build
        time.sleep(12)
        page.screenshot(path=f"{SCREENSHOT_DIR}/10_quality_review.png", full_page=True)
        print("✓ 10_quality_review.png")

        confirm_btn = page.locator("button:has-text('Looks Good')")
        if confirm_btn.count() > 0:
            confirm_btn.click()
            time.sleep(3)
            page.screenshot(path=f"{SCREENSHOT_DIR}/11_quality_dashboard.png", full_page=True)
            print("✓ 11_quality_dashboard.png")

        browser.close()

    # === Third run: Executive ===
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        page.goto(FRONTEND)
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        msgs = [
            "I'm a VP looking at overall facility performance and cost efficiency.",
            "Cost per unit should stay under $20. I want to see trends, not just numbers. SLA compliance and customer satisfaction matter.",
        ]

        for msg in msgs:
            input_field = page.locator("input[type='text']")
            input_field.fill(msg)
            page.locator("button:has-text('Send')").click()
            time.sleep(5)

        time.sleep(12)
        page.screenshot(path=f"{SCREENSHOT_DIR}/12_exec_review.png", full_page=True)
        print("✓ 12_exec_review.png")

        confirm_btn = page.locator("button:has-text('Looks Good')")
        if confirm_btn.count() > 0:
            confirm_btn.click()
            time.sleep(3)
            page.screenshot(path=f"{SCREENSHOT_DIR}/13_exec_dashboard.png", full_page=True)
            print("✓ 13_exec_dashboard.png")

        browser.close()

    print("\n✅ All screenshots captured!")

if __name__ == "__main__":
    take_screenshots()
