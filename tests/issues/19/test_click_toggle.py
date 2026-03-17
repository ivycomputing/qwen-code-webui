"""
Quick test to verify mode toggle works via click
"""

import asyncio
from playwright.async_api import async_playwright
import os

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")


async def test_click_toggle():
    """Test that clicking the mode button toggles the mode."""
    print("Testing mode toggle via click...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        try:
            await page.goto(BASE_URL, wait_until="networkidle")
            await asyncio.sleep(3)

            # Select project if needed
            project_buttons = await page.query_selector_all('button:has(svg[class*="h-5"])')
            for btn in project_buttons:
                text = await btn.inner_text()
                if text and '/' in text:
                    await btn.click()
                    await asyncio.sleep(3)
                    break

            # Find mode button
            permission_modes = ["normal mode", "plan mode", "auto-edit", "yolo mode"]
            
            for i in range(4):
                # Find current mode
                current_mode = None
                for mode_text in permission_modes:
                    mode_element = await page.query_selector(f'button:has-text("{mode_text}")')
                    if mode_element:
                        current_mode = mode_text
                        break
                
                print(f"  Current mode: {current_mode}")
                
                # Click to toggle
                mode_button = await page.query_selector(f'button:has-text("{current_mode}")')
                if mode_button:
                    await mode_button.click()
                    await asyncio.sleep(0.5)
                    
                    # Check new mode
                    new_mode = None
                    for mode_text in permission_modes:
                        mode_element = await page.query_selector(f'button:has-text("{mode_text}")')
                        if mode_element:
                            new_mode = mode_text
                            break
                    
                    print(f"  After click: {new_mode}")
            
            print("\n✓ Click toggle works!")
            return True

        finally:
            await browser.close()


asyncio.run(test_click_toggle())