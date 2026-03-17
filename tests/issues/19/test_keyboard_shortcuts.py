"""
Test for Issue #19: macOS 上无法使用快捷键切换 mode

This test verifies that keyboard shortcuts work correctly for toggling permission mode:
1. Ctrl+Shift+M should work on all platforms
2. Cmd+Shift+M should work on macOS

Test steps:
1. Navigate to the chat page
2. Test Ctrl+Shift+M keyboard shortcut
3. Verify mode changes
4. Test Cmd+Shift+M keyboard shortcut (simulating macOS)
5. Verify mode changes
6. Take screenshots
"""

import asyncio
from playwright.async_api import async_playwright
import os

# Configuration
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")
SCREENSHOT_DIR = "/Users/rhuang/workspace/qwen-code-webui/screenshots/issues/19"


async def test_keyboard_shortcuts():
    """Test that keyboard shortcuts work for toggling permission mode."""
    print("=" * 60)
    print("Issue #19: macOS 上无法使用快捷键切换 mode")
    print("=" * 60)

    # Ensure screenshot directory exists
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

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
            await asyncio.sleep(3)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/01_homepage.png")
            print("  ✓ Homepage loaded")

            # Step 2: Check for project selection
            print("\n[Step 2] Check for project selection...")
            await asyncio.sleep(3)

            # Look for project buttons with folder icon and path text
            project_buttons = await page.query_selector_all('button:has(svg[class*="h-5"])')
            actual_project_buttons = []
            for btn in project_buttons:
                text_content = await btn.inner_text()
                if text_content and '/' in text_content:
                    actual_project_buttons.append(btn)

            if actual_project_buttons:
                print(f"  Found {len(actual_project_buttons)} project buttons")
                await actual_project_buttons[0].click()
                await asyncio.sleep(3)
                await page.screenshot(path=f"{SCREENSHOT_DIR}/02_project_selected.png")
                print("  ✓ Project selected")
            else:
                print("  No project buttons found, assuming direct chat page...")

            await asyncio.sleep(3)

            # Step 3: Find permission mode button
            print("\n[Step 3] Find permission mode button...")
            permission_modes = ["normal mode", "plan mode", "auto-edit", "yolo mode"]
            mode_button = None
            current_mode = None

            for mode_text in permission_modes:
                try:
                    mode_element = await page.query_selector(f'button:has-text("{mode_text}")')
                    if mode_element:
                        current_mode = mode_text
                        mode_button = mode_element
                        print(f"  Found mode button with text: {mode_text}")
                        break
                except Exception as e:
                    continue

            if not mode_button:
                print("  ✗ Could not find permission mode button")
                await page.screenshot(path=f"{SCREENSHOT_DIR}/error_no_mode_button.png")
                return False

            print(f"  Current mode: {current_mode}")
            await page.screenshot(path=f"{SCREENSHOT_DIR}/03_initial_mode.png")

            # Step 4: Test Ctrl+Shift+M keyboard shortcut
            print("\n[Step 4] Test Ctrl+Shift+M keyboard shortcut...")

            # Find the textarea to focus
            chat_input = await page.query_selector('textarea')
            if chat_input:
                await chat_input.focus()
                await asyncio.sleep(0.5)
                
                # Verify textarea is focused
                is_focused = await chat_input.evaluate('el => document.activeElement === el')
                print(f"  Textarea focused: {is_focused}")

                # Press Ctrl+Shift+M using keyboard.press with modifiers
                print("  Pressing Ctrl+Shift+M...")
                await page.keyboard.press("Control+Shift+m")
                await asyncio.sleep(1)

                # Check if mode changed
                new_mode = None
                for mode_text in permission_modes:
                    try:
                        mode_element = await page.query_selector(f'button:has-text("{mode_text}")')
                        if mode_element:
                            new_mode = mode_text
                            break
                    except:
                        continue

                if new_mode and new_mode != current_mode:
                    print(f"  ✓ Ctrl+Shift+M worked! Mode changed from '{current_mode}' to '{new_mode}'")
                    current_mode = new_mode
                else:
                    print(f"  ✗ Ctrl+Shift+M did not change mode (still '{current_mode}')")
                    await page.screenshot(path=f"{SCREENSHOT_DIR}/error_ctrl_shift_m.png")
                    return False

                await page.screenshot(path=f"{SCREENSHOT_DIR}/04_after_ctrl_shift_m.png")
            else:
                print("  ✗ Could not find chat input")
                return False

            # Step 5: Test Cmd+Shift+M keyboard shortcut (Meta key on macOS)
            print("\n[Step 5] Test Cmd+Shift+M keyboard shortcut (macOS)...")

            await chat_input.focus()
            await asyncio.sleep(0.5)
            
            # Verify textarea is focused
            is_focused = await chat_input.evaluate('el => document.activeElement === el')
            print(f"  Textarea focused: {is_focused}")

            # Press Meta+Shift+M (Cmd on macOS)
            print("  Pressing Meta+Shift+M (Cmd+Shift+M)...")
            await page.keyboard.press("Meta+Shift+m")
            await asyncio.sleep(1)

            # Check if mode changed
            new_mode = None
            for mode_text in permission_modes:
                try:
                    mode_element = await page.query_selector(f'button:has-text("{mode_text}")')
                    if mode_element:
                        new_mode = mode_text
                        break
                except:
                    continue

            if new_mode and new_mode != current_mode:
                print(f"  ✓ Cmd+Shift+M worked! Mode changed from '{current_mode}' to '{new_mode}'")
                current_mode = new_mode
            else:
                print(f"  ✗ Cmd+Shift+M did not change mode (still '{current_mode}')")
                await page.screenshot(path=f"{SCREENSHOT_DIR}/error_cmd_shift_m.png")
                return False

            await page.screenshot(path=f"{SCREENSHOT_DIR}/05_after_cmd_shift_m.png")

            # Step 6: Verify UI shows correct shortcut hint
            print("\n[Step 6] Verify UI shows correct shortcut hint...")
            mode_button_text = await mode_button.inner_text()
            if "Ctrl/Cmd+Shift+M" in mode_button_text or "Ctrl/Cmd" in mode_button_text:
                print("  ✓ UI shows correct shortcut hint (Ctrl/Cmd+Shift+M)")
            else:
                print(f"  ! UI shortcut hint: '{mode_button_text}'")

            await page.screenshot(path=f"{SCREENSHOT_DIR}/06_final_state.png")

            print("\n" + "=" * 60)
            print("✓ TEST PASSED: Both Ctrl+Shift+M and Cmd+Shift+M work correctly")
            print("=" * 60)
            return True

        except Exception as e:
            print(f"\n✗ Test failed with error: {e}")
            await page.screenshot(path=f"{SCREENSHOT_DIR}/error_exception.png")
            return False

        finally:
            await browser.close()


async def main():
    """Run the test."""
    print("\n" + "=" * 60)
    print("Starting Keyboard Shortcut E2E Test")
    print("=" * 60)

    success = await test_keyboard_shortcuts()

    return success


if __name__ == "__main__":
    asyncio.run(main())