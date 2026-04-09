"""Capture screenshots of the organic categorical/filter conversation flow."""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
os.environ["PYTHONIOENCODING"] = "utf-8"

from playwright.sync_api import sync_playwright
import time

FRONTEND = "http://localhost:5179"
SCREENSHOT_DIR = "docs/screenshots"

def send_chat(page, msg, wait=8):
    """Send a message in the dashboard chat panel."""
    inp = page.locator(".fixed input[type='text']")
    inp.fill(msg)
    page.locator(".fixed button:has-text('Send')").click()
    time.sleep(wait)

def take_screenshots():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        # === Onboarding ===
        page.goto(FRONTEND)
        page.wait_for_load_state("networkidle")
        time.sleep(3)

        onboarding_msgs = [
            "I manage a vehicle processing facility. We handle Toyota, Honda, Ford, and other makes.",
            "I track throughput by vehicle make and model. We process 72/hr target. Quality above 95%.",
            "I need to see how different makes and models perform compared to each other.",
        ]
        for msg in onboarding_msgs:
            page.locator("input[type='text']:not([disabled])").wait_for(timeout=60000)
            page.locator("input[type='text']").fill(msg)
            page.locator("button:has-text('Send')").click()
            time.sleep(6)

        # Wait for build
        time.sleep(20)
        confirm = page.locator("button:has-text('Looks Good')")
        if confirm.count() > 0:
            confirm.click()
            time.sleep(3)

        # === Screenshot: Base dashboard ===
        page.screenshot(path=f"{SCREENSHOT_DIR}/30_base_dashboard.png", full_page=False)
        print("Done: 30_base_dashboard.png")

        # Open chat
        page.locator("button[title='Modify dashboard']").click()
        time.sleep(1)

        # === Step 1: Ask for visualization recommendations ===
        send_chat(page, "I want to compare throughput across different vehicle makes. What are my visualization options?")
        page.screenshot(path=f"{SCREENSHOT_DIR}/31_viz_recommendations.png", full_page=False)
        print("Done: 31_viz_recommendations.png")

        # === Step 2: User asks about alternatives ===
        send_chat(page, "What about seeing it broken down by model instead? Or by date?")
        page.screenshot(path=f"{SCREENSHOT_DIR}/32_viz_alternatives.png", full_page=False)
        print("Done: 32_viz_alternatives.png")

        # === Step 3: User selects - add breakdown by make ===
        send_chat(page, "Let's start with a breakdown by make", wait=10)
        page.screenshot(path=f"{SCREENSHOT_DIR}/33_breakdown_by_make.png", full_page=False)
        print("Done: 33_breakdown_by_make.png")

        # === Step 4: User asks for quality by model too ===
        send_chat(page, "Now add a quality rate breakdown by model as well", wait=10)
        page.screenshot(path=f"{SCREENSHOT_DIR}/34_breakdown_by_model.png", full_page=False)
        print("Done: 34_breakdown_by_model.png")

        # === Step 5: User applies a filter via chat ===
        send_chat(page, "Filter everything to just Toyota vehicles", wait=10)
        page.screenshot(path=f"{SCREENSHOT_DIR}/35_filter_toyota.png", full_page=False)
        print("Done: 35_filter_toyota.png")

        # === Step 6: User asks for date trend ===
        send_chat(page, "Show me Toyota throughput by date over the last week", wait=10)
        page.screenshot(path=f"{SCREENSHOT_DIR}/36_date_breakdown.png", full_page=False)
        print("Done: 36_date_breakdown.png")

        # Close chat to show final dashboard
        page.locator("button[title='Modify dashboard']").click()
        time.sleep(2)
        page.screenshot(path=f"{SCREENSHOT_DIR}/37_final_categorical_dashboard.png", full_page=True)
        print("Done: 37_final_categorical_dashboard.png")

        browser.close()
    print("\nAll categorical screenshots captured!")

if __name__ == "__main__":
    take_screenshots()
