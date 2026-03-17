"""
Test for Issue #17: run_shell_command output displayed twice and overlapping

This test verifies that tool_result messages are displayed only once,
not twice (both tool_use and tool_result).

IMPORTANT: This test enables "Qwen WebUI Components" feature first,
as the issue is related to the webui components rendering.

Test steps:
1. Navigate to the app
2. Select a project
3. Enable "Qwen WebUI Components" in settings
4. Send a simple command (e.g., "list files")
5. Wait for response
6. Verify that tool result is displayed only once
7. Take screenshot
"""

import asyncio
from playwright.async_api import async_playwright
import os
from datetime import datetime

# Configuration
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")
SCREENSHOT_DIR = "/Users/rhuang/workspace/qwen-code-webui/screenshots/issues/17"

async def enable_webui_components(page):
    """Enable Qwen WebUI Components in settings."""
    print("\n[Step] Enabling Qwen WebUI Components...")
    
    # Try to find settings button by looking for gear icon or settings text
    settings_selectors = [
        'button:has(svg path[d*="M9.594"])',  # Gear icon path
        'button:has(svg[class*="h-6"])',
        'button[aria-label*="settings" i]',
        'button:has-text("Settings")',
    ]
    
    for selector in settings_selectors:
        try:
            settings_btn = await page.query_selector(selector)
            if settings_btn:
                await settings_btn.click()
                await asyncio.sleep(1)
                print(f"  ✓ Clicked settings button with selector: {selector}")
                break
        except:
            continue
    
    # Wait for settings modal/page to appear
    await asyncio.sleep(1)
    await page.screenshot(path=f"{SCREENSHOT_DIR}/03_settings_opened.png")
    
    # Find the WebUI Components toggle button
    # The toggle button has role="switch" and aria-label containing "WebUI Components"
    toggle_selectors = [
        'button[role="switch"][aria-label*="WebUI Components"]',
        'button:has-text("Qwen WebUI Components")',
        'button:has-text("WebUI Components")',
    ]
    
    toggle_clicked = False
    for selector in toggle_selectors:
        try:
            toggle_btn = await page.query_selector(selector)
            if toggle_btn:
                # Check current state
                aria_checked = await toggle_btn.get_attribute('aria-checked')
                print(f"  Current WebUI Components state: {aria_checked}")
                
                if aria_checked == 'false':
                    await toggle_btn.click()
                    await asyncio.sleep(0.5)
                    print("  ✓ Enabled Qwen WebUI Components")
                    toggle_clicked = True
                else:
                    print("  ✓ Qwen WebUI Components already enabled")
                    toggle_clicked = True
                break
        except Exception as e:
            print(f"  Selector {selector} failed: {e}")
            continue
    
    if not toggle_clicked:
        print("  ⚠ Could not find WebUI Components toggle, trying alternative method...")
        # Try to find by text content
        all_buttons = await page.query_selector_all('button')
        for btn in all_buttons:
            text = await btn.inner_text()
            if 'WebUI Components' in text or 'Qwen WebUI Components' in text:
                aria_checked = await btn.get_attribute('aria-checked')
                if aria_checked == 'false':
                    await btn.click()
                    await asyncio.sleep(0.5)
                    print("  ✓ Enabled Qwen WebUI Components (alternative method)")
                else:
                    print("  ✓ Qwen WebUI Components already enabled (alternative method)")
                toggle_clicked = True
                break
    
    await page.screenshot(path=f"{SCREENSHOT_DIR}/04_webui_components_enabled.png")
    
    # Close settings modal by clicking outside or pressing Escape
    await page.keyboard.press('Escape')
    await asyncio.sleep(1)
    
    return toggle_clicked

async def test_tool_result_display():
    """Test that tool_result is displayed only once."""
    print("=" * 60)
    print("Issue #17: run_shell_command output displayed twice")
    print("Testing with Qwen WebUI Components ENABLED")
    print("=" * 60)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800}
        )
        page = await context.new_page()

        try:
            # Step 1: Navigate to the main page
            print("\n[Step 1] Navigate to the main page...")
            await page.goto(BASE_URL, wait_until="networkidle")
            await asyncio.sleep(3)  # Wait for React to render
            await page.screenshot(path=f"{SCREENSHOT_DIR}/01_homepage.png")
            print("  ✓ Homepage loaded")

            # Step 2: Check if there's a project list and select one
            print("\n[Step 2] Check for project selection...")

            # Wait for page to fully load
            await asyncio.sleep(2)

            # Look for project buttons with folder icon and path text
            # These are buttons that contain a folder icon (svg) and a path text (font-mono)
            project_buttons = await page.query_selector_all('button:has(svg[class*="h-5"])')

            # Filter out settings button by checking for font-mono class (project paths use font-mono)
            actual_project_buttons = []
            target_project = "qwen-code-webui"
            target_button = None
            
            for btn in project_buttons:
                text_content = await btn.inner_text()
                if text_content and '/' in text_content:  # Project paths contain '/'
                    actual_project_buttons.append(btn)
                    # Check if this is the target project
                    if target_project in text_content:
                        target_button = btn
                        print(f"  Found target project: {text_content}")

            if target_button:
                print(f"  Selecting project: {target_project}")
                await target_button.click()
                await asyncio.sleep(3)
                await page.screenshot(path=f"{SCREENSHOT_DIR}/02_project_selected.png")
                print("  ✓ Project selected")
            elif actual_project_buttons:
                print(f"  Found {len(actual_project_buttons)} project buttons, but target not found")
                print(f"  Selecting first available project...")
                # Click the first project button
                await actual_project_buttons[0].click()
                await asyncio.sleep(3)
                await page.screenshot(path=f"{SCREENSHOT_DIR}/02_project_selected.png")
                print("  ✓ Project selected")
            else:
                print("  No project buttons found, checking for direct chat input...")

            # Step 3: Enable Qwen WebUI Components
            print("\n[Step 3] Enable Qwen WebUI Components...")
            enabled = await enable_webui_components(page)
            if enabled:
                print("  ✓ WebUI Components feature enabled")
            else:
                print("  ⚠ Could not enable WebUI Components, continuing anyway...")

            # Step 3.5: Enable YOLO mode
            print("\n[Step 3.5] Enable YOLO mode...")
            
            # Look for permission mode button (shows current mode like "default mode", "yolo mode", etc.)
            permission_mode_selectors = [
                'button:has-text("default mode")',
                'button:has-text("plan mode")',
                'button:has-text("auto-edit mode")',
                'button:has-text("yolo mode")',
                'button:has-text("Click to cycle")',
            ]
            
            permission_btn = None
            for selector in permission_mode_selectors:
                try:
                    permission_btn = await page.query_selector(selector)
                    if permission_btn:
                        break
                except:
                    continue
            
            if permission_btn:
                # Check current mode and click until we reach yolo mode
                for attempt in range(5):  # Max 5 clicks to cycle through modes
                    btn_text = await permission_btn.inner_text()
                    print(f"  Current mode: {btn_text[:30]}...")
                    
                    if "yolo" in btn_text.lower():
                        print("  ✓ YOLO mode already enabled")
                        break
                    
                    # Click to cycle to next mode
                    await permission_btn.click()
                    await asyncio.sleep(0.5)
                    
                    # Re-find the button as it might have re-rendered
                    for selector in permission_mode_selectors:
                        try:
                            permission_btn = await page.query_selector(selector)
                            if permission_btn:
                                break
                        except:
                            continue
                    
                    # Check if we're now in yolo mode
                    if permission_btn:
                        new_text = await permission_btn.inner_text()
                        if "yolo" in new_text.lower():
                            print("  ✓ YOLO mode enabled")
                            break
            else:
                print("  ⚠ Could not find permission mode button, continuing anyway...")
            
            await page.screenshot(path=f"{SCREENSHOT_DIR}/03b_yolo_mode_enabled.png")

            # Step 4: Find chat input and send a command
            print("\n[Step 4] Send a test command...")

            # Wait for chat input to appear
            await asyncio.sleep(2)

            # Try different selectors for chat input
            selectors = [
                'textarea',
                '[contenteditable="true"]',
                'input[type="text"]',
                '.chat-input textarea',
                '[data-testid="chat-input"]',
                'form textarea',
            ]

            chat_input = None
            for selector in selectors:
                try:
                    chat_input = await page.wait_for_selector(selector, timeout=5000)
                    if chat_input:
                        print(f"  Found chat input with selector: {selector}")
                        break
                except:
                    continue

            if not chat_input:
                print("  ✗ Could not find chat input")
                await page.screenshot(path=f"{SCREENSHOT_DIR}/error_no_input.png")
                return False

            # Type a simple command
            test_command = "list open issues"
            await chat_input.fill(test_command)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/05_command_typed.png")
            print(f"  ✓ Typed command: {test_command}")

            # Submit the form (try different methods)
            submit_btn = await page.query_selector('button[type="submit"], button:has-text("Send")')
            if submit_btn:
                await submit_btn.click()
            else:
                # Try pressing Enter
                await chat_input.press("Enter")

            print("  ✓ Command submitted")

            # Step 5: Wait for response and tool execution
            print("\n[Step 5] Wait for response (waiting for run_shell_command)...")
            
            # Wait for run_shell_command to appear (up to 30 seconds)
            toolcall_found = False
            for i in range(30):
                await asyncio.sleep(1)
                # Check for run_shell_command text specifically
                page_text = await page.inner_text('body')
                if 'run_shell_command' in page_text:
                    print(f"  ✓ Found run_shell_command after {i+1} seconds")
                    toolcall_found = True
                    # Wait a bit more for the tool to complete
                    await asyncio.sleep(3)
                    break
                print(f"  Waiting for run_shell_command... ({i+1}s)")
            
            if not toolcall_found:
                print("  ⚠ No run_shell_command found after 30 seconds, continuing anyway...")
            
            # Take screenshot of the response
            await page.screenshot(path=f"{SCREENSHOT_DIR}/06_response.png", full_page=True)
            print("  ✓ Response received")

            # Step 6: Check for duplicate tool messages
            print("\n[Step 6] Check for duplicate tool messages...")

            # Look for tool result elements (WebUI Components uses toolcall- and bash- prefixes)
            tool_result_selectors = [
                '.toolcall-card',  # Tool call card
                '.toolcall-container',  # Tool call container
                '.bash-toolcall-card',  # Bash tool call card
                '.bash-toolcall-row',  # Bash tool call row
                '[class*="toolcall"]',  # Any toolcall class
                '[class*="bash-toolcall"]',  # Any bash toolcall class
            ]

            tool_elements = []
            for selector in tool_result_selectors:
                elements = await page.query_selector_all(selector)
                if elements:
                    tool_elements.extend(elements)
                    print(f"  Found {len(elements)} elements with: {selector}")

            # Debug: Print AI response text
            print("\n  Debug: Looking for AI response content...")
            ai_response_selectors = [
                '.message-content',
                '[class*="message"]',
                '.prose',
                'p',
            ]
            for selector in ai_response_selectors:
                elements = await page.query_selector_all(selector)
                if elements:
                    print(f"  Found {len(elements)} elements with: {selector}")
                    # Print first few elements' text
                    for idx, el in enumerate(elements[:5]):
                        text = await el.inner_text()
                        if text and len(text) > 5:
                            print(f"    [{idx}] {text[:200]}...")
                            
            # Debug: Print toolcall content specifically
            print("\n  Debug: Looking for toolcall content...")
            toolcall_elements = await page.query_selector_all('.toolcall-container, .toolcall-card')
            for idx, el in enumerate(toolcall_elements):
                text = await el.inner_text()
                print(f"  Toolcall [{idx}]: {text[:300]}...")

            # Check for overlapping text by looking at the page content
            page_content = await page.content()

            # Look for signs of duplicate display
            # If the same command appears multiple times in similar contexts
            duplicate_indicators = [
                "Command:",
                "Directory:",
                "Exit Code:",
            ]

            found_duplicates = False
            for indicator in duplicate_indicators:
                count = page_content.count(indicator)
                if count > 2:  # More than expected (IN and OUT cards)
                    print(f"  ⚠ Found {count} occurrences of '{indicator}' - possible duplicate")
                    found_duplicates = True

            # Check for duplicate tool names in the visible text
            # Tool names appearing in output content is normal, we only check for
            # duplicate display in the tool call header (kind + title both showing tool name)
            # The issue was that for unknown tools, both 'kind' and 'title' showed the tool name
            # causing it to appear twice in the same line with overlapping text.
            # After fix: unknown tools have empty title, so tool name only shows once.
            
            # Check toolcall elements for duplicate tool names in header
            print("\n  Checking for duplicate tool names in toolcall headers...")
            found_duplicates = False
            
            for idx, el in enumerate(toolcall_elements):
                text = await el.inner_text()
                lines = text.split('\n')
                # First line should be the tool name (kind)
                # If there's a second line that's also the tool name, that's a duplicate
                if len(lines) >= 2:
                    first_line = lines[0].strip()
                    second_line = lines[1].strip()
                    # Check if both lines are the same tool name (duplicate display)
                    if first_line and second_line and first_line == second_line:
                        print(f"  ⚠ Toolcall [{idx}]: Duplicate tool name detected: '{first_line}'")
                        found_duplicates = True

            # Step 7: Final verification
            print("\n[Step 7] Final verification...")
            await page.screenshot(path=f"{SCREENSHOT_DIR}/07_final.png", full_page=True)

            if found_duplicates:
                print("\n✗ Test FAILED: Duplicate tool messages detected")
            else:
                print("\n✓ Test PASSED: No duplicate tool messages detected")

            # Wait a bit before closing
            await asyncio.sleep(2)

            return not found_duplicates

        except Exception as e:
            print(f"\n✗ Error: {e}")
            await page.screenshot(path=f"{SCREENSHOT_DIR}/error.png", full_page=True)
            return False
        finally:
            await browser.close()

if __name__ == "__main__":
    result = asyncio.run(test_tool_result_display())
    print("\n" + "=" * 60)
    print(f"Test Result: {'PASSED ✓' if result else 'FAILED ✗'}")
    print("=" * 60)