"""
Test for Issue #17: run_shell_command output displayed twice and overlapping

This test verifies that tool_result messages are displayed only once,
not twice (both tool_use and tool_result).

Test steps:
1. Navigate to the chat page
2. Send a simple command (e.g., "list files")
3. Wait for response
4. Verify that tool result is displayed only once
5. Take screenshot
"""

import asyncio
from playwright.async_api import async_playwright
import os
from datetime import datetime

# Configuration
BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")
SCREENSHOT_DIR = "/Users/rhuang/workspace/qwen-code-webui/screenshots/issues/17"

async def test_tool_result_display():
    """Test that tool_result is displayed only once."""
    print("=" * 60)
    print("Issue #17: run_shell_command output displayed twice")
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
                print("  No project buttons found, checking for direct chat input...")
            
            # Step 3: Find chat input and send a command
            print("\n[Step 3] Send a test command...")
            
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
            test_command = "list the files in current directory"
            await chat_input.fill(test_command)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/03_command_typed.png")
            print(f"  ✓ Typed command: {test_command}")
            
            # Submit the form (try different methods)
            submit_btn = await page.query_selector('button[type="submit"], button:has-text("Send")')
            if submit_btn:
                await submit_btn.click()
            else:
                # Try pressing Enter
                await chat_input.press("Enter")
            
            print("  ✓ Command submitted")
            
            # Step 4: Wait for response
            print("\n[Step 4] Wait for response...")
            await asyncio.sleep(5)  # Wait for AI to process
            
            # Take screenshot of the response
            await page.screenshot(path=f"{SCREENSHOT_DIR}/04_response.png", full_page=True)
            print("  ✓ Response received")
            
            # Step 5: Check for duplicate tool messages
            print("\n[Step 5] Check for duplicate tool messages...")
            
            # Look for tool result elements
            tool_result_selectors = [
                '[class*="tool-result"]',
                '[class*="ToolResult"]',
                '[class*="bash"]',
                '[class*="Bash"]',
                '.tool-call-container',
                '[class*="emerald"]',  # Tool result styling
            ]
            
            tool_elements = []
            for selector in tool_result_selectors:
                elements = await page.query_selector_all(selector)
                if elements:
                    tool_elements.extend(elements)
                    print(f"  Found {len(elements)} elements with: {selector}")
            
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
            
            # Step 6: Final verification
            print("\n[Step 6] Final verification...")
            await page.screenshot(path=f"{SCREENSHOT_DIR}/05_final.png", full_page=True)
            
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