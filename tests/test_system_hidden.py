#!/usr/bin/env python3
"""
Test: System messages should be hidden in chat interface

This script verifies that system messages (init, result, error) are not displayed
in the chat interface after the fix.
"""

import subprocess
import sys

def check_playwright():
    """Check if playwright is installed."""
    try:
        from playwright.sync_api import sync_playwright
        return True
    except ImportError:
        print("Installing playwright...")
        subprocess.run([sys.executable, "-m", "pip", "install", "playwright"], check=True)
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
        return True

def main():
    check_playwright()
    from playwright.sync_api import sync_playwright

    print("Testing: System messages should be hidden")
    print("=" * 50)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.set_viewport_size({"width": 1200, "height": 800})

        # Navigate to the app
        print("\n1. Loading http://localhost:3000...")
        page.goto("http://localhost:3000", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        # Take screenshot of initial state
        print("2. Taking screenshot of initial state...")
        page.screenshot(path="/Users/rhuang/workspace/qwen-code-webui/screenshots/test_system_hidden_1.png")
        print("   Saved: screenshots/test_system_hidden_1.png")

        # Check if there are any system messages visible
        # System messages would have class containing "CollapsibleDetails" or text like "System", "Result"
        system_selectors = [
            "text=System (init)",
            "text=Result (success)",
            "text=System",
            "text=Result",
            ".collapsible-details",
        ]

        found_system = False
        for selector in system_selectors:
            try:
                count = page.locator(selector).count()
                if count > 0:
                    print(f"   ⚠️  Found '{selector}': {count} element(s)")
                    found_system = True
            except Exception as e:
                pass

        if not found_system:
            print("   ✓ No system messages visible (expected)")

        # Try to start a conversation to see if system messages appear
        print("\n3. Testing chat interaction...")
        try:
            # Find input field
            input_field = page.locator("textarea, input[type='text']").first
            if input_field.is_visible():
                input_field.fill("hello")
                print("   Entered 'hello' in input field")

                # Find and click send button
                send_btn = page.locator("button:has-text('Send'), button[type='submit']").first
                if send_btn.is_visible():
                    send_btn.click()
                    print("   Clicked send button")
                    page.wait_for_timeout(3000)

                    # Take screenshot after interaction
                    page.screenshot(path="/Users/rhuang/workspace/qwen-code-webui/screenshots/test_system_hidden_2.png")
                    print("   Saved: screenshots/test_system_hidden_2.png")

                    # Check again for system messages
                    found_system_after = False
                    for selector in system_selectors:
                        try:
                            count = page.locator(selector).count()
                            if count > 0:
                                print(f"   ⚠️  Found '{selector}': {count} element(s)")
                                found_system_after = True
                        except Exception:
                            pass

                    if not found_system_after:
                        print("   ✓ No system messages visible after interaction (expected)")
        except Exception as e:
            print(f"   Note: Could not test chat interaction: {e}")

        print("\n" + "=" * 50)
        print("Test completed. Browser will close in 5 seconds...")
        page.wait_for_timeout(5000)
        browser.close()

    print("\nScreenshots saved to: screenshots/")
    print("- test_system_hidden_1.png (initial state)")
    print("- test_system_hidden_2.png (after interaction)")

if __name__ == "__main__":
    main()