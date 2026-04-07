"""
调试测试：检查确认按钮的可见性和样式
"""
import asyncio
from playwright.async_api import async_playwright
import os

SCREENSHOT_DIR = "/Users/rhuang/workspace/qwen-code-webui/screenshots/issues/53"

async def debug_button_visibility():
    """调试按钮可见性"""
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
            await asyncio.sleep(1.5)
            
            # 截图
            await page.screenshot(path=f"{SCREENSHOT_DIR}/debug_visibility.png")
            
            # 查找对话框
            dialog = await page.query_selector("[role='dialog']")
            if dialog:
                print("✓ 找到对话框")
                
                # 查找对话框内的所有按钮
                dialog_buttons = await dialog.query_selector_all("button")
                print(f"\n对话框内找到 {len(dialog_buttons)} 个按钮:")
                
                for i, btn in enumerate(dialog_buttons):
                    text = await btn.inner_text()
                    is_visible = await btn.is_visible()
                    is_enabled = await btn.is_enabled()
                    classes = await btn.get_attribute("class") or ""
                    
                    # 获取按钮的边界框
                    bbox = await btn.bounding_box()
                    bbox_str = f"{bbox['x']:.0f}x{bbox['y']:.0f} {bbox['width']:.0f}x{bbox['height']:.0f}" if bbox else "N/A"
                    
                    print(f"\n按钮 {i+1}:")
                    print(f"  文本: '{text}'")
                    print(f"  可见: {is_visible}")
                    print(f"  启用: {is_enabled}")
                    print(f"  位置大小：{bbox_str}")
                    print(f"  样式类：{classes[:100]}...")
                    
                    # 如果是确认按钮，高亮显示
                    if "清空" in text or "Clear" in text:
                        print(f"  *** 这是确认按钮 ***")
                        # 用红色边框高亮
                        await btn.evaluate("""
                            el => {
                                el.style.outline = "3px solid red";
                                el.style.outlineOffset = "2px";
                            }
                        """)
                    
                    if "取消" in text or "Cancel" in text:
                        print(f"  *** 这是取消按钮 ***")
                
                # 截图高亮后
                await asyncio.sleep(0.5)
                await page.screenshot(path=f"{SCREENSHOT_DIR}/debug_highlighted.png")
                
                # 检查按钮的背景颜色
                confirm_btn = await page.query_selector("button:has-text('清空')")
                if confirm_btn:
                    bg_color = await confirm_btn.evaluate("el => window.getComputedStyle(el).backgroundColor")
                    color = await confirm_btn.evaluate("el => window.getComputedStyle(el).color")
                    print(f"\n确认按钮颜色:")
                    print(f"  背景: {bg_color}")
                    print(f"  文字: {color}")
            else:
                print("✗ 未找到对话框")
            
        except Exception as e:
            print(f"错误：{e}")
            import traceback
            traceback.print_exc()
        
        finally:
            await asyncio.sleep(2)
            await browser.close()
            print("\n测试完成")

if __name__ == "__main__":
    asyncio.run(debug_button_visibility())