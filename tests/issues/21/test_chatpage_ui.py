"""
Test for Issue 21: ChatPage UI Optimization

This test verifies the following UI improvements:
1. Removed redundant "Qwen Code Web UI" title when project is selected
2. Smaller History and Settings buttons (p-2 instead of p-3, w-4 h-4 icons)
3. Tooltip on buttons (title attribute)
4. Reduced header margin (mb-4 instead of mb-8)
"""

import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "tests"))

from playwright.sync_api import sync_playwright, expect
import time

BASE_URL = "http://localhost:3000"
SCREENSHOT_DIR = project_root / "screenshots" / "issues" / "21"


def test_chatpage_ui():
    """Test ChatPage UI improvements"""
    
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        
        try:
            print("=" * 60)
            print("Issue 21: ChatPage UI Optimization Test")
            print("=" * 60)
            
            # Step 1: Navigate to home page
            print("\n[Step 1] Navigate to home page...")
            page.goto(BASE_URL)
            page.wait_for_load_state("networkidle")
            time.sleep(2)
            
            # Debug: print page content
            print(f"  Page title: {page.title()}")
            print(f"  Page URL: {page.url}")
            
            # Take screenshot of project selection page
            page.screenshot(path=str(SCREENSHOT_DIR / "01_project_selection.png"))
            print(f"  Screenshot saved: 01_project_selection.png")
            
            # Debug: find all buttons
            all_buttons = page.locator("button")
            print(f"  Found {all_buttons.count()} buttons on page")
            
            # Step 2: Click on a project to enter ChatPage
            print("\n[Step 2] Select a project to enter ChatPage...")
            
            # Look for project buttons with FolderIcon (svg inside button)
            project_btns = page.locator("button:has(svg)").filter(has_text="/")
            print(f"  Found {project_btns.count()} project buttons")
            
            if project_btns.count() > 0:
                project_btns.first.click()
                page.wait_for_load_state("networkidle")
                time.sleep(2)
            else:
                # Try alternative: any button with path-like text
                all_btns = page.locator("button")
                for i in range(all_btns.count()):
                    btn_text = all_btns.nth(i).text_content()
                    if btn_text and "/" in btn_text:
                        print(f"  Clicking button with text: {btn_text[:50]}...")
                        all_btns.nth(i).click()
                        page.wait_for_load_state("networkidle")
                        time.sleep(2)
                        break
            
            # Take screenshot of ChatPage
            page.screenshot(path=str(SCREENSHOT_DIR / "02_chatpage.png"))
            print(f"  Screenshot saved: 02_chatpage.png")
            
            # Step 3: Verify header does NOT contain "Qwen Code Web UI"
            print("\n[Step 3] Verify header optimization...")
            
            # Check that "Qwen Code Web UI" text is NOT visible in header
            header_text = page.locator("header, nav, .flex.items-center.justify-between").first.text_content()
            print(f"  Header text: {header_text[:100]}...")
            
            if "Qwen Code Web UI" in header_text:
                print("  [FAIL] 'Qwen Code Web UI' should NOT be in header")
            else:
                print("  [PASS] 'Qwen Code Web UI' is not in header")
            
            # Step 4: Verify button sizes
            print("\n[Step 4] Verify button sizes...")
            
            # Find History button (ClockIcon)
            history_btn = page.locator("button[aria-label='View conversation history'], button:has(svg[class*='w-4'])").first
            
            if history_btn:
                btn_class = history_btn.get_attribute("class") or ""
                print(f"  History button classes: {btn_class}")
                
                # Check for p-2 (smaller padding)
                if "p-2" in btn_class:
                    print("  [PASS] History button has p-2 padding")
                elif "p-3" in btn_class:
                    print("  [FAIL] History button still has p-3 padding (should be p-2)")
                else:
                    print(f"  [INFO] History button padding: {btn_class}")
            
            # Find Settings button
            settings_btn = page.locator("button[aria-label='Open settings']").first
            
            if settings_btn:
                btn_class = settings_btn.get_attribute("class") or ""
                print(f"  Settings button classes: {btn_class}")
                
                if "p-2" in btn_class:
                    print("  [PASS] Settings button has p-2 padding")
                elif "p-3" in btn_class:
                    print("  [FAIL] Settings button still has p-3 padding (should be p-2)")
                else:
                    print(f"  [INFO] Settings button padding: {btn_class}")
            
            # Step 5: Verify tooltips
            print("\n[Step 5] Verify button tooltips...")
            
            # Check History button tooltip
            history_title = history_btn.get_attribute("title") if history_btn else None
            if history_title:
                print(f"  [PASS] History button has tooltip: '{history_title}'")
            else:
                print("  [FAIL] History button missing tooltip (title attribute)")
            
            # Check Settings button tooltip
            settings_title = settings_btn.get_attribute("title") if settings_btn else None
            if settings_title:
                print(f"  [PASS] Settings button has tooltip: '{settings_title}'")
            else:
                print("  [FAIL] Settings button missing tooltip (title attribute)")
            
            # Step 6: Verify header margin
            print("\n[Step 6] Verify header margin...")
            
            header = page.locator(".flex.items-center.justify-between").first
            if header:
                header_class = header.get_attribute("class") or ""
                print(f"  Header classes: {header_class}")
                
                if "mb-4" in header_class:
                    print("  [PASS] Header has mb-4 margin")
                elif "mb-8" in header_class:
                    print("  [FAIL] Header still has mb-8 margin (should be mb-4)")
                else:
                    print(f"  [INFO] Header margin class: {header_class}")
            
            # Step 7: Hover over buttons to see tooltip
            print("\n[Step 7] Hover over buttons...")
            
            if history_btn:
                history_btn.hover()
                time.sleep(0.5)
                page.screenshot(path=str(SCREENSHOT_DIR / "03_history_hover.png"))
                print(f"  Screenshot saved: 03_history_hover.png")
            
            if settings_btn:
                settings_btn.hover()
                time.sleep(0.5)
                page.screenshot(path=str(SCREENSHOT_DIR / "04_settings_hover.png"))
                print(f"  Screenshot saved: 04_settings_hover.png")
            
            print("\n" + "=" * 60)
            print("Test completed. Screenshots saved to:")
            print(f"  {SCREENSHOT_DIR}")
            print("=" * 60)
            
        finally:
            browser.close()


if __name__ == "__main__":
    test_chatpage_ui()