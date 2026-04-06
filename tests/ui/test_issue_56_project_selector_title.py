"""
Test for Issue 56: Change project selector title from "选择项目" to "您的项目"

Changes:
1. Page title changed from "选择项目" to "您的项目" (zh-CN) / "Select a Project" to "Your Projects" (en)
2. Removed redundant "您的项目" subtitle (h2 element)
3. Cleaned up unnecessary empty lines for a more compact layout
"""

import asyncio
from playwright.async_api import async_playwright
import os
from datetime import datetime

SCREENSHOT_DIR = "/Users/rhuang/workspace/qwen-code-webui/screenshots/ui/issue_56"
BASE_URL = "http://localhost:3000/"
USERNAME = "admin"
PASSWORD = "password"

async def run_test():
    """执行 UI 测试"""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await context.new_page()

        try:
            # Step 1: Navigate to app and login
            print("Step 1: 导航到应用并登录...")
            await page.goto(BASE_URL, wait_until="networkidle", timeout=30000)
            
            # Check if already logged in (project selector page)
            is_logged_in = await page.is_visible('h1', timeout=5000)
            
            if not is_logged_in:
                # Need to login
                print("Logging in...")
                await page.fill('[data-testid="login-username"]', USERNAME)
                await page.fill('[data-testid="login-password"]', PASSWORD)
                await page.click('[data-testid="login-button"]')
                await page.wait_for_load_state('networkidle')
            
            # Step 2: Check h1 title
            print("Step 2: 检查页面标题...")
            h1 = page.locator('h1').first
            await expect(h1).to_be_visible()
            h1_text = await h1.text_content()
            h1_text = h1_text.strip()
            print(f"H1 text: {h1_text}")
            
            # Verify title is "您的项目" (not "选择项目")
            if h1_text == "您的项目":
                results.append(("✓ 中文标题测试通过", True))
                print("✓ 中文标题测试通过：标题是'您的项目'")
            else:
                results.append((f"✗ 中文标题测试失败：期望'您的项目'，实际'{h1_text}'", False))
                print(f"✗ 中文标题测试失败：期望'您的项目'，实际'{h1_text}'")
            
            # Step 3: Check no redundant h2 subtitle
            print("Step 3: 检查无重复的小标题...")
            h2_elements = page.locator('h2')
            h2_count = await h2_elements.count()
            print(f"H2 elements count: {h2_count}")
            
            has_redundant_subtitle = False
            for i in range(h2_count):
                h2 = h2_elements.nth(i)
                if await h2.is_visible():
                    h2_text = await h2.text_content()
                    h2_text = h2_text.strip()
                    print(f"H2[{i}]: {h2_text}")
                    if h2_text == "您的项目" or h2_text == "Your Projects":
                        has_redundant_subtitle = True
            
            if not has_redundant_subtitle:
                results.append(("✓ 无重复小标题测试通过", True))
                print("✓ 无重复小标题测试通过")
            else:
                results.append(("✗ 仍存在重复小标题", False))
                print("✗ 仍存在重复小标题")
            
            # Step 4: Check keyboard navigation hint exists
            print("Step 4: 检查键盘导航提示...")
            navigate_hint = page.locator('text=Navigate').first
            is_visible = await navigate_hint.is_visible()
            
            if is_visible:
                results.append(("✓ 键盘导航提示存在", True))
                print("✓ 键盘导航提示存在")
            else:
                results.append(("✗ 键盘导航提示不存在", False))
                print("✗ 键盘导航提示不存在")
            
            # Step 5: Take screenshot
            print("Step 5: 截图...")
            screenshot_path = os.path.join(SCREENSHOT_DIR, "project_selector.png")
            await page.screenshot(path=screenshot_path)
            print(f"Screenshot saved to: {screenshot_path}")
            
            results.append(("截图已保存", True))
            
        except Exception as e:
            print(f"Error: {e}")
            results.append((f"Error: {e}", False))
        finally:
            await browser.close()
    
    # Print summary
    print("\n" + "=" * 50)
    print("测试结果汇总")
    print("=" * 50)
    passed = sum(1 for _, success in results if success)
    total = len(results)
    for msg, _ in results:
        print(msg)
    print(f"\n通过：{passed}/{total}")
    print("=" * 50)
    
    return passed == total


async def expect(locator):
    """Simple expect helper"""
    class ExpectHelper:
        def __init__(self, locator):
            self.locator = locator
        async def to_be_visible(self, timeout=5000):
            try:
                await self.locator.wait_for(state='visible', timeout=timeout)
                return True
            except:
                return False
    return ExpectHelper(locator)


if __name__ == "__main__":
    import sys
    success = asyncio.run(run_test())
    sys.exit(0 if success else 1)
