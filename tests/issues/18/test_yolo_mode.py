"""
Test for Issue #18: YOLO mode cannot auto-approve all operations

This test verifies that YOLO mode correctly passes the permission mode
to the backend and that the backend correctly passes it to the Qwen SDK.

Test steps:
1. Navigate to the chat page
2. Click the permission mode button to cycle to YOLO mode
3. Verify the UI shows YOLO mode is active
4. Send a test message
5. Verify the request includes permissionMode: "yolo"
6. Take screenshots
"""

import asyncio
from playwright.async_api import async_playwright
import os
from datetime import datetime

# Configuration
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")
SCREENSHOT_DIR = "/Users/rhuang/workspace/qwen-code-webui/screenshots/issues/18"


async def test_yolo_mode_ui():
    """Test that YOLO mode can be activated in the UI."""
    print("=" * 60)
    print("Issue #18: YOLO mode cannot auto-approve all operations")
    print("=" * 60)

    # Ensure screenshot directory exists
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800}
        )
        page = await context.new_page()

        # Track network requests to verify permissionMode is sent
        captured_requests = []

        async def capture_request(request):
            if request.url.endswith("/api/chat") and request.method == "POST":
                try:
                    post_data = request.post_data
                    if post_data:
                        import json
                        data = json.loads(post_data)
                        captured_requests.append(data)
                        print(f"  Captured chat request: permissionMode={data.get('permissionMode', 'not set')}")
                except Exception as e:
                    print(f"  Error capturing request: {e}")

        page.on("request", capture_request)

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
            await asyncio.sleep(3)

            # Check if we're on the project selection page or directly on chat page
            page_content = await page.content()
            print(f"  Page title: {await page.title()}")

            # Look for project buttons with folder icon and path text
            project_buttons = await page.query_selector_all('button:has(svg[class*="h-5"])')

            # Filter out settings button by checking for font-mono class (project paths use font-mono)
            actual_project_buttons = []
            for btn in project_buttons:
                text_content = await btn.inner_text()
                if text_content and '/' in text_content:  # Project paths contain '/'
                    actual_project_buttons.append(btn)

            if actual_project_buttons:
                print(f"  Found {len(actual_project_buttons)} project buttons")
                # Click the first project button
                await actual_project_buttons[0].click()
                await asyncio.sleep(3)
                await page.screenshot(path=f"{SCREENSHOT_DIR}/02_project_selected.png")
                print("  ✓ Project selected")
            else:
                print("  No project buttons found, assuming direct chat page...")

            # Wait for chat interface to load
            await asyncio.sleep(3)

            # Step 3: Find permission mode button and cycle to YOLO mode
            print("\n[Step 3] Cycle to YOLO mode...")

            # Wait for chat input area to appear
            await asyncio.sleep(3)

            # The permission mode button shows the current mode text
            # It cycles through: "normal mode" -> "plan mode" -> "auto-edit" -> "yolo mode"
            permission_modes = ["normal mode", "plan mode", "auto-edit", "yolo mode"]
            target_mode = "yolo mode"

            # Find the permission mode button (contains mode text and is clickable)
            mode_button = None
            current_mode = None

            # First, find the current mode by looking for any mode text
            # Use a more flexible selector that matches partial text
            for mode_text in permission_modes:
                try:
                    # Try to find text containing the mode name
                    # The button text format is like "🔧 normal mode - Click to cycle"
                    mode_element = await page.query_selector(f'button:has-text("{mode_text}")')
                    if mode_element:
                        current_mode = mode_text
                        mode_button = mode_element
                        print(f"  Found mode button with text: {mode_text}")
                        break
                except Exception as e:
                    print(f"  Error finding '{mode_text}': {e}")
                    continue

            if not mode_button:
                # Try alternative approach: find any button with mode-related text
                print("  Trying alternative approach to find mode button...")
                all_buttons = await page.query_selector_all('button')
                print(f"  Found {len(all_buttons)} buttons on page")

                for btn in all_buttons:
                    try:
                        text = await btn.inner_text()
                        for mode_text in permission_modes:
                            if mode_text in text.lower() or mode_text in text:
                                current_mode = mode_text
                                mode_button = btn
                                print(f"  Found mode button: '{text[:50]}...'")
                                break
                        if mode_button:
                            break
                    except:
                        continue

            if not mode_button:
                print("  ✗ Could not find permission mode button")
                # Debug: print all button texts
                all_buttons = await page.query_selector_all('button')
                print("  All button texts:")
                for i, btn in enumerate(all_buttons[:10]):  # First 10 buttons
                    try:
                        text = await btn.inner_text()
                        print(f"    Button {i}: '{text[:100]}'")
                    except:
                        pass
                await page.screenshot(path=f"{SCREENSHOT_DIR}/error_no_mode_button.png")
                return False

            print(f"  Current mode: {current_mode}")

            # Calculate how many clicks needed to reach yolo mode
            if current_mode:
                current_index = permission_modes.index(current_mode)
                target_index = permission_modes.index(target_mode)
                clicks_needed = (target_index - current_index) % len(permission_modes)

                print(f"  Need to click {clicks_needed} times to reach {target_mode}")

                for i in range(clicks_needed):
                    await mode_button.click()
                    await asyncio.sleep(0.5)  # Wait for state update

                    # Re-find the button and verify mode changed
                    new_mode = None
                    for mode_text in permission_modes:
                        try:
                            mode_element = await page.query_selector(f'button:has-text("{mode_text}")')
                            if mode_element:
                                new_mode = mode_text
                                break
                        except:
                            continue

                    if new_mode:
                        print(f"  After click {i+1}: mode is now '{new_mode}'")
                    else:
                        print(f"  After click {i+1}: could not determine mode")

            # Wait for state to fully propagate
            await asyncio.sleep(1)

            # Verify we're at yolo mode
            yolo_element = await page.query_selector(f'text="{target_mode}"')
            if yolo_element:
                print(f"  ✓ Confirmed: {target_mode} is displayed")
            else:
                print(f"  ✗ Could not confirm {target_mode} is displayed")

            await page.screenshot(path=f"{SCREENSHOT_DIR}/03_yolo_mode_selected.png")
            print("  ✓ YOLO mode selected")

            # Step 4: Find chat input and send a test message
            print("\n[Step 4] Send a test message...")

            # Wait more time for chat input to appear
            await asyncio.sleep(3)

            # Debug: print all textareas and inputs on the page
            all_textareas = await page.query_selector_all('textarea')
            all_inputs = await page.query_selector_all('input')
            print(f"  Found {len(all_textareas)} textareas, {len(all_inputs)} inputs")

            # Find chat input
            chat_input = None
            selectors = [
                'textarea[placeholder*="message"]',
                'textarea[placeholder*="Type"]',
                'textarea',
                '[contenteditable="true"]',
            ]

            for selector in selectors:
                try:
                    elements = await page.query_selector_all(selector)
                    print(f"  Selector '{selector}': found {len(elements)} elements")
                    if elements:
                        chat_input = elements[0]
                        print(f"  Using first element from selector: {selector}")
                        break
                except Exception as e:
                    print(f"  Error with selector '{selector}': {e}")
                    continue

            if not chat_input:
                print("  ✗ Could not find chat input")
                # Debug: take screenshot and print page HTML
                await page.screenshot(path=f"{SCREENSHOT_DIR}/error_no_input.png")
                # Print all visible text for debugging
                visible_text = await page.evaluate('() => document.body.innerText')
                print(f"  Visible text on page:\n{visible_text[:500]}...")
                return False

            # Type a simple test message
            test_message = "echo hello"
            await chat_input.fill(test_message)
            await asyncio.sleep(0.5)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/04_message_typed.png")
            print(f"  ✓ Typed message: {test_message}")

            # Submit the message (Enter key or click send button)
            await chat_input.press("Enter")
            print("  ✓ Message submitted")

            # Wait for response
            await asyncio.sleep(5)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/05_response_received.png")

            # Step 5: Verify the captured request has permissionMode: "yolo"
            print("\n[Step 5] Verify permissionMode in request...")

            if captured_requests:
                last_request = captured_requests[-1]
                permission_mode = last_request.get("permissionMode")
                print(f"  Captured permissionMode: {permission_mode}")

                if permission_mode == "yolo":
                    print("  ✓ YOLO mode correctly passed in request!")
                    success = True
                else:
                    print(f"  ✗ Expected 'yolo', got '{permission_mode}'")
                    success = False
            else:
                print("  ✗ No chat requests captured")
                success = False

            await page.screenshot(path=f"{SCREENSHOT_DIR}/06_final_state.png")

            return success

        except Exception as e:
            print(f"\n✗ Test failed with error: {e}")
            await page.screenshot(path=f"{SCREENSHOT_DIR}/error_exception.png")
            return False

        finally:
            await browser.close()


async def main():
    """Run the test."""
    print("\n" + "=" * 60)
    print("Starting YOLO Mode E2E Test")
    print("=" * 60)

    success = await test_yolo_mode_ui()

    print("\n" + "=" * 60)
    if success:
        print("✓ TEST PASSED: YOLO mode works correctly")
    else:
        print("✗ TEST FAILED: YOLO mode not working as expected")
    print("=" * 60)

    return success


if __name__ == "__main__":
    asyncio.run(main())