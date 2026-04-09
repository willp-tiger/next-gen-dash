"""Capture screenshots of the dashboard chat feature."""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')
os.environ["PYTHONIOENCODING"] = "utf-8"

from playwright.sync_api import sync_playwright
import time
import json
import urllib.request

FRONTEND = "http://localhost:5178"
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

        # Go through onboarding quickly
        page.goto(FRONTEND)
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        msgs = [
            "I manage a vehicle processing facility. I track throughput, inventory levels, and quality rates.",
            "We process 72 vehicles per hour. Quality should be above 95%. Inventory in pre-WIP should stay above 200.",
            "I also need to see cycle time and daily production targets.",
        ]

        for msg in msgs:
            # Wait for input to be enabled
            page.locator("input[type='text']:not([disabled])").wait_for(timeout=60000)
            inp = page.locator("input[type='text']")
            inp.fill(msg)
            page.locator("button:has-text('Send')").click()
            time.sleep(6)

        # Wait for either review page or dashboard to appear
        time.sleep(20)

        # Click confirm if on review page
        confirm = page.locator("button:has-text('Looks Good')")
        if confirm.count() > 0:
            confirm.click()
            time.sleep(3)

        # Screenshot: Dashboard before chat
        page.screenshot(path=f"{SCREENSHOT_DIR}/20_dashboard_before_chat.png", full_page=False)
        print("Done: 20_dashboard_before_chat.png")

        # Open the chat panel
        chat_btn = page.locator("button[title='Modify dashboard']")
        if chat_btn.count() > 0:
            chat_btn.click()
            time.sleep(1)
            page.screenshot(path=f"{SCREENSHOT_DIR}/21_chat_panel_open.png", full_page=False)
            print("Done: 21_chat_panel_open.png")

            # Add a metric
            chat_input = page.locator("input[placeholder*='Add abandon rate']")
            if chat_input.count() == 0:
                chat_input = page.locator(".fixed input[type='text']")
            chat_input.fill("Add abandon rate as a line chart with green under 5% and yellow under 12%")
            page.locator(".fixed button:has-text('Send')").click()
            time.sleep(8)
            page.screenshot(path=f"{SCREENSHOT_DIR}/22_chat_add_metric.png", full_page=False)
            print("Done: 22_chat_add_metric.png")

            # Edit a metric
            chat_input = page.locator(".fixed input[type='text']")
            chat_input.fill("Make the quality metric a large gauge chart")
            page.locator(".fixed button:has-text('Send')").click()
            time.sleep(8)
            page.screenshot(path=f"{SCREENSHOT_DIR}/23_chat_edit_metric.png", full_page=False)
            print("Done: 23_chat_edit_metric.png")

            # Remove a metric
            chat_input = page.locator(".fixed input[type='text']")
            chat_input.fill("Remove the cycle time metric")
            page.locator(".fixed button:has-text('Send')").click()
            time.sleep(8)
            page.screenshot(path=f"{SCREENSHOT_DIR}/24_chat_remove_metric.png", full_page=False)
            print("Done: 24_chat_remove_metric.png")

            # Close chat and show final dashboard
            close_btn = page.locator("button[title='Modify dashboard']")
            close_btn.click()
            time.sleep(2)
            page.screenshot(path=f"{SCREENSHOT_DIR}/25_dashboard_after_chat.png", full_page=False)
            print("Done: 25_dashboard_after_chat.png")
        else:
            print("Chat button not found!")

        browser.close()
    print("\nAll chat screenshots captured!")

if __name__ == "__main__":
    take_screenshots()
