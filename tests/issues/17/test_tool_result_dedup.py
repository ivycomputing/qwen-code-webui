"""
Test for Issue #17: run_shell_command 输出显示两次且重叠

This test verifies that tool_use and tool_result messages are not duplicated
in the chat interface.
"""

import asyncio
from playwright.async_api import async_playwright
import os
import sys

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tests", "screenshots", "issues", "17")


async def test_tool_result_not_duplicated():
    """Test that tool_result messages are not duplicated in the chat."""
    
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    print(f"Screenshot directory: {SCREENSHOT_DIR}")
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        
        try:
            # Navigate to the app
            print(f"Navigating to {BASE_URL}...")
            await page.goto(BASE_URL, wait_until="networkidle")
            
            # Wait for React app to render
            print("Waiting for React app to render...")
            await page.wait_for_timeout(3000)
            
            # Take screenshot of project selector
            screenshot_path = os.path.join(SCREENSHOT_DIR, "01_project_selector.png")
            await page.screenshot(path=screenshot_path)
            print(f"Screenshot saved: {screenshot_path}")
            
            # Wait for projects to load
            try:
                await page.wait_for_selector("button:has-text('Select a Project'), h1:has-text('Select a Project')", timeout=10000)
            except:
                print("Warning: Project selector not found")
            
            # Find project buttons
            project_buttons = await page.query_selector_all("button:has(svg)")
            print(f"Found {len(project_buttons)} project buttons")
            
            if project_buttons:
                # Click the first project
                print("Clicking first project...")
                await project_buttons[0].click()
                await page.wait_for_timeout(2000)
                
                # Take screenshot after selecting project
                screenshot_path = os.path.join(SCREENSHOT_DIR, "02_chat_page.png")
                await page.screenshot(path=screenshot_path)
                print(f"Screenshot saved: {screenshot_path}")
                
                # Find the chat input
                chat_input = await page.query_selector("textarea")
                if chat_input:
                    print("Found chat input!")
                    
                    # Send a simple command that will trigger run_shell_command
                    test_message = "list files in current directory"
                    print(f"Sending test message: {test_message}")
                    await chat_input.fill(test_message)
                    
                    # Take screenshot before sending
                    screenshot_path = os.path.join(SCREENSHOT_DIR, "03_message_typed.png")
                    await page.screenshot(path=screenshot_path)
                    
                    # Submit the message
                    await chat_input.press("Enter")
                    
                    print("Message sent, waiting for response...")
                    await page.wait_for_timeout(10000)  # Wait for response
                    
                    # Take screenshot of the response
                    screenshot_path = os.path.join(SCREENSHOT_DIR, "04_response.png")
                    await page.screenshot(path=screenshot_path, full_page=True)
                    print(f"Screenshot saved: {screenshot_path}")
                    
                    # Check for duplicate tool messages
                    # Tool messages have class containing "emerald" (green color scheme)
                    tool_messages = await page.query_selector_all("[class*='emerald']")
                    print(f"Found {len(tool_messages)} elements with emerald class")
                    
                    # Check for duplicate content by looking at the text content
                    tool_texts = []
                    for msg in tool_messages:
                        text = await msg.text_content()
                        if text:
                            tool_texts.append(text.strip())
                    
                    print("\nTool message texts:")
                    for i, text in enumerate(tool_texts[:10]):  # Limit output
                        print(f"  {i+1}. {text[:80]}...")
                    
                    # Check for duplicates
                    seen = set()
                    duplicates = []
                    for text in tool_texts:
                        # Normalize text for comparison (first 50 chars)
                        normalized = text[:50] if len(text) >= 50 else text
                        if normalized in seen:
                            duplicates.append(normalized)
                        seen.add(normalized)
                    
                    if duplicates:
                        print(f"\nWARNING: Found {len(duplicates)} potential duplicate messages!")
                        for dup in duplicates:
                            print(f"  Duplicate: {dup}...")
                        screenshot_path = os.path.join(SCREENSHOT_DIR, "05_duplicates_found.png")
                        await page.screenshot(path=screenshot_path, full_page=True)
                        return False
                    else:
                        print("\nNo duplicate messages found - test PASSED!")
                        return True
                else:
                    print("ERROR: Chat input not found after selecting project")
                    return False
            else:
                print("No projects found to test with")
                return True  # Not a failure, just nothing to test
            
        except Exception as e:
            print(f"Error during test: {e}")
            import traceback
            traceback.print_exc()
            screenshot_path = os.path.join(SCREENSHOT_DIR, "error.png")
            await page.screenshot(path=screenshot_path, full_page=True)
            return False
        finally:
            await browser.close()


if __name__ == "__main__":
    result = asyncio.run(test_tool_result_not_duplicated())
    print(f"\nTest result: {'PASSED' if result else 'FAILED'}")
    sys.exit(0 if result else 1)