"""
Debug keyboard events to see what e.key value is received
"""

import asyncio
from playwright.async_api import async_playwright
import os

BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000")


async def debug_keyboard():
    """Debug keyboard events."""
    print("Debugging keyboard events...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()
        
        # Capture console logs
        console_logs = []
        page.on("console", lambda msg: console_logs.append(msg.text))

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

            # Find textarea and add event listener
            textarea = await page.query_selector('textarea')
            if textarea:
                # Add event listener to log key events
                await page.evaluate('''
                    const textarea = document.querySelector('textarea');
                    textarea.addEventListener('keydown', (e) => {
                        console.log('KEY_EVENT:', JSON.stringify({
                            key: e.key,
                            shiftKey: e.shiftKey,
                            ctrlKey: e.ctrlKey,
                            metaKey: e.metaKey
                        }));
                    });
                ''')
                
                await textarea.focus()
                await asyncio.sleep(0.5)
                
                # Press Ctrl+Shift+M
                print("\nPressing Control+Shift+m...")
                console_logs.clear()
                await page.keyboard.press("Control+Shift+m")
                await asyncio.sleep(0.5)
                for log in console_logs:
                    if 'KEY_EVENT' in log:
                        print(f"  {log}")
                
                # Try with uppercase M
                print("\nPressing Control+Shift+M (uppercase)...")
                console_logs.clear()
                await page.keyboard.press("Control+Shift+M")
                await asyncio.sleep(0.5)
                for log in console_logs:
                    if 'KEY_EVENT' in log:
                        print(f"  {log}")
                
                # Try Meta+Shift+M
                print("\nPressing Meta+Shift+m...")
                console_logs.clear()
                await page.keyboard.press("Meta+Shift+m")
                await asyncio.sleep(0.5)
                for log in console_logs:
                    if 'KEY_EVENT' in log:
                        print(f"  {log}")
                
                print("\nPressing Meta+Shift+M (uppercase)...")
                console_logs.clear()
                await page.keyboard.press("Meta+Shift+M")
                await asyncio.sleep(0.5)
                for log in console_logs:
                    if 'KEY_EVENT' in log:
                        print(f"  {log}")

            await asyncio.sleep(2)

        finally:
            await browser.close()


asyncio.run(debug_keyboard())