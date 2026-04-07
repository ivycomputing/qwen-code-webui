"""
调试测试：查看 ConfirmModal 的 DOM 结构
"""
import asyncio
from playwright.async_api import async_playwright
import os

SCREENSHOT_DIR = "/Users/rhuang/workspace/qwen-code-webui/screenshots/issues/53"

async def debug_dialog():
    """调试对话框 DOM 结构"""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await context.new_page()
        
        try:
            # 导航并选择项目
            await page.goto("http://localhost:3000/", wait_until="networkidle")
            await asyncio.sleep(2)
            await page.keyboard.press("Enter")
            await asyncio.sleep(3)
            
            # 输入 /clear
            input_elem = await page.wait_for_selector("textarea")
            await input_elem.click()
            await input_elem.fill("/clear")
            await input_elem.press("Enter")
            await asyncio.sleep(1)
            
            # 截图
            await page.screenshot(path=f"{SCREENSHOT_DIR}/debug_dialog.png")
            
            # 查找所有可能包含对话框的元素
            print("查找对话框元素...")
            
            # 检查各种可能的对话框选择器
            selectors = [
                "[role='dialog']",
                "[role='alertdialog']",
                ".fixed.inset-0",  # 常见的模态框样式
                "[data-headlessui-state]",
                "[aria-modal='true']",
                "div[class*='z-50']",
            ]
            
            for selector in selectors:
                elements = await page.query_selector_all(selector)
                if elements:
                    print(f"\n选择器 '{selector}' 找到 {len(elements)} 个元素:")
                    for i, elem in enumerate(elements[:3]):  # 只显示前3个
                        try:
                            html = await elem.evaluate("el => el.outerHTML.slice(0, 500)")
                            print(f"  元素 {i+1}: {html[:200]}...")
                        except:
                            pass
            
            # 打印整个页面的对话框区域 HTML
            print("\n查找包含 '清空' 文字的区域...")
            elements_with_clear = await page.query_selector_all("*:has-text('清空')")
            print(f"找到 {len(elements_with_clear)} 个包含 '清空' 的元素")
            for elem in elements_with_clear:
                tag = await elem.evaluate("el => el.tagName")
                text = await elem.inner_text()
                print(f"  {tag}: '{text}'")
            
            # 检查是否有 z-50 层级的元素
            print("\n检查 z-50 层级元素...")
            z50_elements = await page.query_selector_all("div[class*='z-50']")
            print(f"找到 {len(z50_elements)} 个 z-50 元素")
            
            # 查找所有按钮
            print("\n对话框区域内的按钮:")
            buttons = await page.query_selector_all("button")
            for btn in buttons:
                is_visible = await btn.is_visible()
                text = await btn.inner_text()
                classes = await btn.get_attribute("class") or ""
                parent = await btn.evaluate("el => el.parentElement?.className || 'unknown'")
                print(f"  按钮 '{text}' (可见: {is_visible})")
                if "z-50" in parent or "fixed" in parent:
                    print(f"    -> 可能在对话框内!")
                    print(f"    -> 按钮类: {classes[:100]}")
            
        except Exception as e:
            print(f"错误: {e}")
            import traceback
            traceback.print_exc()
        
        finally:
            await asyncio.sleep(2)
            await browser.close()

if __name__ == "__main__":
    asyncio.run(debug_dialog())