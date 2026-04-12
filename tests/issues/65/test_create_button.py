#!/usr/bin/env python3
"""
Test script for Issue #65: Add New Project modal - Create button not responding

Issue description:
- Clicking Create button in Add New Project modal has no response
- Works when DevTools open (browser skips/forces CSS animation completion)

Root cause:
- Manually added pointer-events-none/auto interfering with Headless UI v2's internal event handling
- ConfirmModal works fine without these manual styles

Fix:
- Removed all pointer-events-none/auto from AddProjectModal.tsx
- Keep consistent with ConfirmModal.tsx approach

This test will:
1. Navigate to workspace page
2. Click Add New Project button
3. Navigate directory browser
4. Click "Select This Folder" button
5. Click "Create" button in details step
6. Verify project creation or capture errors
"""

import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright, TimeoutError

# Configuration - use environment variables or defaults
# Access webui through OpenACE iframe with token authentication
OPENACE_URL = os.environ.get("OPENACE_URL", "http://192.168.64.3:5000")
WEBUI_URL = os.environ.get("WEBUI_URL", "http://192.168.64.3:3100")
HEADLESS = os.environ.get("HEADLESS", "false").lower() == "true"
TEST_USER = os.environ.get("TEST_USER", "rhuang")
TEST_PASSWORD = os.environ.get("TEST_PASSWORD", "admin123")

# Screenshot directory
SCRIPT_DIR = Path(__file__).parent
SCREENSHOT_DIR = SCRIPT_DIR / "screenshots"
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


async def test_create_button():
    """Test Create button in AddProjectModal"""
    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="zh-CN"
        )
        page = await context.new_page()

        # Capture console messages
        console_messages = []
        page.on("console", lambda msg: console_messages.append({
            "type": msg.type,
            "text": msg.text
        }))

        # Capture network requests and responses
        api_requests = []
        page.on("request", lambda req: api_requests.append({
            "url": req.url,
            "method": req.method,
            "time": asyncio.get_event_loop().time()
        }) if "api" in req.url or "project" in req.url.lower() else None)

        api_responses = []
        page.on("response", lambda res: api_responses.append({
            "url": res.url,
            "status": res.status,
            "time": asyncio.get_event_loop().time()
        }) if "api" in res.url or "project" in res.url.lower() else None)

        try:
            # Step 1: Login to OpenACE first
            print("\n[1] Login to OpenACE...")
            await page.goto(f"{OPENACE_URL}/login", wait_until="networkidle", timeout=30000)
            
            # Fill login form
            username_input = page.locator("input[name='username'], input[type='text']").first
            password_input = page.locator("input[name='password'], input[type='password']").first
            submit_btn = page.locator("button[type='submit']").first
            
            await username_input.fill(TEST_USER)
            await password_input.fill(TEST_PASSWORD)
            await submit_btn.click()
            
            # Wait for login to complete and redirect
            await page.wait_for_timeout(3000)
            current_url = page.url
            print(f"  After login URL: {current_url}")
            
            # Check if login was successful
            if "login" in current_url:
                print("  Login failed - still on login page")
                await page.screenshot(path=str(SCREENSHOT_DIR / "01_login_failed.png"))
                results.append(("Login", False, "Still on login page"))
                return results
            
            print("  Login successful")
            await page.screenshot(path=str(SCREENSHOT_DIR / "01_login_success.png"))
            results.append(("Login", True, ""))

            # Step 2: Navigate to OpenACE workspace page (contains iframe with webui)
            print("\n[2] Navigate to OpenACE workspace page...")
            await page.goto(f"{OPENACE_URL}/work/workspace", wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(5000)  # Wait for iframe to load
            
            current_url = page.url
            print(f"  Current URL: {current_url}")
            await page.screenshot(path=str(SCREENSHOT_DIR / "02_openace_workspace.png"))
            results.append(("Navigate to OpenACE workspace", True, current_url))

            # Step 3: Find and switch to webui iframe
            print("\n[3] Find and switch to webui iframe...")
            
            iframe_locator = page.locator("iframe")
            iframe_count = await iframe_locator.count()
            print(f"  Found {iframe_count} iframe(s)")
            
            if iframe_count == 0:
                print("  No iframe found - webui not embedded")
                await page.screenshot(path=str(SCREENSHOT_DIR / "03_no_iframe.png"))
                results.append(("iframe found", False, "No iframe"))
                return results
            
            iframe = iframe_locator.first
            iframe_src = await iframe.get_attribute("src")
            print(f"  iframe src: {iframe_src}")
            await iframe.wait_for(state="attached", timeout=15000)
            
            # Wait for iframe content to load
            await page.wait_for_timeout(5000)
            await page.screenshot(path=str(SCREENSHOT_DIR / "03_iframe_loaded.png"))
            results.append(("iframe found", True, iframe_src or ""))
            
            # Get frame locator for interacting with iframe content
            frame = page.frame_locator("iframe").first

            # Step 4: Find and click "Add New Project" button in iframe
            print("\n[4] Find and click 'Add New Project' button in iframe...")
            
            # Try different selectors for the add project button
            add_btn = None
            selectors = [
                "button:has-text('Add')",
                "button:has-text('添加')",
                "button:has-text('New')",
                "button:has-text('新建')",
                "button[data-testid='add-project']",
                "[aria-label='Add project']",
                "button:has(svg[class*='plus'])",
                ".add-project-btn",
            ]
            
            for selector in selectors:
                try:
                    locator = frame.locator(selector).first
                    if await locator.is_visible(timeout=2000):
                        add_btn = locator
                        print(f"  Found button: {selector}")
                        break
                except TimeoutError:
                    continue
            
            if not add_btn:
                # Try to find any button that might be add project
                print("  Looking for potential add buttons...")
                buttons = await frame.locator("button").all()
                for i, btn in enumerate(buttons):
                    try:
                        text = await btn.text_content()
                        is_visible = await btn.is_visible()
                        if is_visible and text:
                            print(f"  Button {i}: '{text.strip()}'")
                    except:
                        pass
                
                await page.screenshot(path=str(SCREENSHOT_DIR / "04_no_add_button.png"))
                results.append(("Find Add button", False, "No add button found"))
                return results
            
            # Click the button
            await add_btn.click()
            await page.wait_for_timeout(3000)  # Wait longer for modal animation
            await page.screenshot(path=str(SCREENSHOT_DIR / "05_modal_opened.png"))
            print("  Clicked Add button")
            results.append(("Click Add button", True, ""))

            # Step 5: Check if modal is open
            print("\n[5] Check if modal is open...")
            
            # Look for modal/dialog in iframe - try multiple selectors
            # Headless UI Dialog may use different attributes
            modal_selectors = [
                "[role='dialog']",
                ".relative.z-50",  # Dialog wrapper class
                "div[data-state='open']",  # Some dialog libraries use this
                ".fixed.inset-0",  # Backdrop class
                "[data-headlessui-state='open']",
            ]
            
            modal_found = False
            modal = None
            for selector in modal_selectors:
                try:
                    locator = frame.locator(selector).first
                    if await locator.is_visible(timeout=3000):
                        modal = locator
                        modal_found = True
                        print(f"  Modal found with selector: {selector}")
                        break
                except TimeoutError:
                    continue
            
            if not modal_found:
                # Try to find any fixed positioned element (modal backdrop)
                try:
                    # Check for the dialog backdrop or panel
                    backdrop = frame.locator("div.fixed.inset-0").first
                    if await backdrop.is_visible(timeout=2000):
                        modal = backdrop
                        modal_found = True
                        print("  Found modal backdrop")
                except:
                    pass
            
            if not modal_found:
                await page.screenshot(path=str(SCREENSHOT_DIR / "06_modal_not_open.png"))
                print("  Modal not visible")
                results.append(("Modal visible", False, "Modal not found"))
                return results
            
            results.append(("Modal visible", True, ""))
            
            await page.screenshot(path=str(SCREENSHOT_DIR / "07_modal_content.png"))

            # Step 6: Navigate directory browser to select a folder
            print("\n[6] Navigate directory browser...")
            
            # Try to find a directory item to click
            # The directory browser shows folders - click on one to navigate
            folder_item = modal.locator("button:has(svg[class*='folder'])").first
            try:
                if await folder_item.is_visible(timeout=3000):
                    await folder_item.click()
                    await page.wait_for_timeout(1000)
                    print("  Clicked a folder item")
            except:
                pass

            # Click "Select This Folder" button
            # Use frame instead of modal since modal might be backdrop
            select_btn = frame.locator("button:has-text('Select This Folder'), button:has-text('选择此目录'), button:has-text('Select'), button:has-text('选择')").first
            try:
                await select_btn.wait_for(state="visible", timeout=3000)
                await select_btn.click()
                await page.wait_for_timeout(2000)
                print("  Clicked 'Select This Folder' button")
                await page.screenshot(path=str(SCREENSHOT_DIR / "08_after_select_folder.png"))
                results.append(("Select folder", True, ""))
            except TimeoutError:
                print("  Select button not found, may already be in details step")
                await page.screenshot(path=str(SCREENSHOT_DIR / "08_select_not_found.png"))

            # Step 7: Check if we're in details step
            print("\n[7] Check if in details step...")
            
            # Look for form elements (project name input, description textarea) in frame
            name_input = frame.locator("input[type='text']").first
            try:
                await name_input.wait_for(state="visible", timeout=3000)
                print("  In details step, form visible")
                results.append(("Details step", True, ""))
                
                # Take screenshot of details form
                await page.screenshot(path=str(SCREENSHOT_DIR / "09_details_form.png"))
            except TimeoutError:
                print("  Not in details step")
                results.append(("Details step", False, "Form not visible"))
                await page.screenshot(path=str(SCREENSHOT_DIR / "09_not_details.png"))
                return results

            # Step 8: Click Create button
            print("\n[8] Click Create button...")
            
            # The Create button should be visible in the details step
            # Use frame instead of modal
            create_btn = frame.locator("button:has-text('Create'), button:has-text('创建'), button:has-text('Add Project'), button:has-text('添加项目'), button[type='submit']").first
            
            try:
                await create_btn.wait_for(state="visible", timeout=3000)
                print(f"  Create button visible")
                
                # Take screenshot before clicking
                await page.screenshot(path=str(SCREENSHOT_DIR / "10_before_create_click.png"))
                
                # Click the Create button
                await page.wait_for_timeout(1000); await create_btn.click(force=True)
                print("  Clicked Create button")
                results.append(("Click Create button", True, ""))
                
                # Wait for response
                await page.wait_for_timeout(3000)
                
                # Take screenshot after clicking
                await page.screenshot(path=str(SCREENSHOT_DIR / "11_after_create_click.png"))
                
            except TimeoutError:
                print("  Create button not found")
                await page.screenshot(path=str(SCREENSHOT_DIR / "10_create_not_found.png"))
                results.append(("Click Create button", False, "Create button not found"))
                return results

            # Step 9: Check for API call or state change
            print("\n[9] Check for API call or state change...")
            
            # Check if there's an API request for creating project
            create_api_calls = [r for r in api_requests if "project" in r["url"].lower() and r["method"] in ["POST", "PUT"]]
            if create_api_calls:
                print(f"  API call detected: {len(create_api_calls)} requests")
                for call in create_api_calls:
                    print(f"    - {call['method']} {call['url']}")
                results.append(("API call made", True, str(len(create_api_calls)) + " calls"))
            else:
                print("  No API call detected")
                results.append(("API call made", False, "No POST/PUT to project API"))

            # Check for success/error state in frame (modal content)
            success_indicator = frame.locator("text=/Created|Success|成功|完成/i")
            error_indicator = frame.locator("text=/Error|Failed|错误|失败/i")
            creating_indicator = frame.locator("text=/Creating|创建中/i")
            
            try:
                if await success_indicator.is_visible(timeout=2000):
                    print("  Success state detected!")
                    results.append(("Project created", True, ""))
                    await page.screenshot(path=str(SCREENSHOT_DIR / "12_success.png"))
                elif await creating_indicator.is_visible(timeout=2000):
                    print("  Creating state detected")
                    results.append(("Creating state", True, ""))
                    # Wait longer for creation to complete
                    await page.wait_for_timeout(5000)
                    await page.screenshot(path=str(SCREENSHOT_DIR / "12_creating.png"))
                elif await error_indicator.is_visible(timeout=2000):
                    error_text = await error_indicator.first.text_content()
                    print(f"  Error state detected: {error_text}")
                    results.append(("Project created", False, error_text or ""))
                    await page.screenshot(path=str(SCREENSHOT_DIR / "12_error.png"))
                else:
                    print("  No state change detected")
                    # Check if modal is still open (backdrop still visible)
                    try:
                        backdrop = frame.locator("div.fixed.inset-0").first
                        await backdrop.wait_for(state="visible", timeout=1000)
                        print("  Modal still open - button click may have been blocked")
                        results.append(("Button click effect", False, "Modal still open, no state change"))
                        await page.screenshot(path=str(SCREENSHOT_DIR / "12_no_change.png"))
                    except:
                        print("  Modal closed")
                        results.append(("Button click effect", True, "Modal closed"))
            except Exception as e:
                print(f"  Exception checking state: {e}")

            # Step 10: Check console for errors
            print("\n[10] Check console for errors...")
            
            errors = [m for m in console_messages if m["type"] == "error"]
            if errors:
                print(f"  Console errors found: {len(errors)}")
                for err in errors[:5]:  # Show first 5 errors
                    print(f"    - {err['text'][:100]}")
                results.append(("Console clean", False, str(len(errors)) + " errors"))
            else:
                print("  Console clean")
                results.append(("Console clean", True, ""))

        except Exception as e:
            print(f"\nException: {e}")
            import traceback
            traceback.print_exc()
            results.append(("Test execution", False, str(e)))
            await page.screenshot(path=str(SCREENSHOT_DIR / "exception.png"))

        finally:
            await browser.close()

    return results


async def main():
    print("=" * 60)
    print("Issue #65: Create Button Test")
    print("=" * 60)
    print(f"WEBUI_URL: {WEBUI_URL}")
    print(f"HEADLESS: {HEADLESS}")
    print(f"Screenshots: {SCREENSHOT_DIR}")
    print("=" * 60)

    results = await test_create_button()

    print("\n" + "=" * 60)
    print("Test Results Summary")
    print("=" * 60)

    passed = sum(1 for _, success, _ in results if success)
    failed = sum(1 for _, success, _ in results if not success)

    for name, success, detail in results:
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"  {name}: {status}")
        if detail:
            print(f"    Detail: {detail}")

    print(f"\nTotal: {passed} passed, {failed} failed")
    print(f"Screenshots saved in: {SCREENSHOT_DIR}")
    print("=" * 60)
    
    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)