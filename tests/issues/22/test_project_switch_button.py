"""
Test for Issue 22: Add method to return to project selection page

This test verifies:
1. ProjectSwitchButton is visible in ChatPage header
2. Clicking the button returns to project selection page
"""

import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "tests"))

from playwright.sync_api import sync_playwright
import time

BASE_URL = "http://localhost:3000"
SCREENSHOT_DIR = project_root / "screenshots" / "issues" / "22"


def test_project_switch_button():
    """Test project switch button functionality"""
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        
        try:
            print("=" * 60)
            print("Issue 22: Project Switch Button Test")
            print("=" * 60)
            
            # Step 1: Navigate to home page
            print("\n[Step 1] Navigate to home page...")
            page.goto(BASE_URL)
            page.wait_for_load_state("networkidle")
            time.sleep(2)
            
            page.screenshot(path=str(SCREENSHOT_DIR / "01_project_selection.png"))
            print(f"  Screenshot saved: 01_project_selection.png")
            
            # Step 2: Select a project
            print("\n[Step 2] Select a project...")
            project_btns = page.locator("button:has(svg)").filter(has_text="/")
            
            if project_btns.count() > 0:
                project_btns.first.click()
                page.wait_for_load_state("networkidle")
                time.sleep(2)
            else:
                print("  [ERROR] No project buttons found")
                return
            
            page.screenshot(path=str(SCREENSHOT_DIR / "02_chatpage.png"))
            print(f"  Screenshot saved: 02_chatpage.png")
            
            # Step 3: Verify ProjectSwitchButton exists
            print("\n[Step 3] Verify ProjectSwitchButton...")
            
            # Look for the button with FolderIcon
            switch_btn = page.locator("button[aria-label='Switch project'], button[title='Switch project']").first
            
            if switch_btn.count() > 0:
                print("  [PASS] ProjectSwitchButton found")
                
                # Check button has correct attributes
                btn_title = switch_btn.get_attribute("title")
                btn_aria = switch_btn.get_attribute("aria-label")
                print(f"  Button title: {btn_title}")
                print(f"  Button aria-label: {btn_aria}")
                
                if btn_title == "Switch project":
                    print("  [PASS] Button has correct title")
                else:
                    print(f"  [FAIL] Expected title 'Switch project', got '{btn_title}'")
            else:
                print("  [FAIL] ProjectSwitchButton not found")
                return
            
            # Step 4: Click the switch button
            print("\n[Step 4] Click ProjectSwitchButton...")
            switch_btn.click()
            page.wait_for_load_state("networkidle")
            time.sleep(1)
            
            page.screenshot(path=str(SCREENSHOT_DIR / "03_after_switch.png"))
            print(f"  Screenshot saved: 03_after_switch.png")
            
            # Step 5: Verify we're back on project selection page
            print("\n[Step 5] Verify returned to project selection...")
            
            current_url = page.url
            print(f"  Current URL: {current_url}")
            
            if current_url == BASE_URL + "/" or current_url == BASE_URL:
                print("  [PASS] Successfully returned to project selection page")
            else:
                # Check if we're on the project selection page by looking for the header
                page_header = page.locator("h1:has-text('Select a Project')")
                if page_header.count() > 0:
                    print("  [PASS] Successfully returned to project selection page")
                else:
                    print(f"  [FAIL] Did not return to project selection page. URL: {current_url}")
            
            print("\n" + "=" * 60)
            print("Test completed. Screenshots saved to:")
            print(f"  {SCREENSHOT_DIR}")
            print("=" * 60)
            
        finally:
            browser.close()


if __name__ == "__main__":
    test_project_switch_button()