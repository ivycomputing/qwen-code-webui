"""
调试 Enter 键测试
"""
import asyncio
from playwright.async_api import async_playwright
import os

SCREENSHOT_DIR = "/Users/rhuang/workspace/qwen-code-webui/screenshots/issues/53"

async def debug_enter_key():
    """调试 Enter 键处理"""
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
            
            # 查找确认按钮
            confirm_btn = await page.query_selector("button:has-text('清空')")
            
            if confirm_btn:
                print("找到确认按钮")
                
                # 检查按钮是否聚焦
                is_focused = await confirm_btn.evaluate("el => el === document.activeElement")
                print(f"确认按钮是否聚焦: {is_focused}")
                
                # 检查当前聚焦的元素
                active_element = await page.evaluate("document.activeElement.tagName")
                active_text = await page.evaluate("document.activeElement.textContent || document.activeElement.value || ''")
                print(f"当前聚焦元素: {active_element}, 内容: '{active_text[:50]}'")
                
                # 尝试点击确认按钮
                print("\n尝试点击确认按钮...")
                await confirm_btn.click()
                await asyncio.sleep(1)
                
                # 截图
                await page.screenshot(path=f"{SCREENSHOT_DIR}/debug_after_click.png")
                
                # 检查对话框是否关闭
                dialog_visible = await page.is_visible("text=清空对话")
                if not dialog_visible:
                    print("✓ 点击确认按钮成功关闭对话框")
                else:
                    print("⚠️ 点击确认按钮后对话框仍然显示")
                
                # 再次打开对话框测试键盘事件监听
                print("\n再次打开对话框测试键盘...")
                input_elem = await page.query_selector("textarea")
                await input_elem.click()
                await input_elem.fill("/clear")
                await input_elem.press("Enter")
                await asyncio.sleep(1)
                
                # 监听键盘事件
                print("监听 Enter 键事件...")
                
                # 获取 Dialog.Panel 元素
                dialog_panel = await page.query_selector("[role='dialog']")
                if dialog_panel:
                    # 添加事件监听
                    await dialog_panel.evaluate("""
                        el => {
                            el._enterHandler = (e) => {
                                if (e.key === 'Enter') {
                                    console.log('Enter key pressed on dialog panel');
                                    window._enterPressed = true;
                                }
                            };
                            el.addEventListener('keydown', el._enterHandler);
                        }
                    """)
                    
                    # 按 Enter
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(0.5)
                    
                    # 检查事件是否触发
                    enter_pressed = await page.evaluate("window._enterPressed || false")
                    print(f"Enter 事件是否触发: {enter_pressed}")
                    
                    # 清理监听器
                    await dialog_panel.evaluate("""
                        el => {
                            if (el._enterHandler) {
                                el.removeEventListener('keydown', el._enterHandler);
                            }
                        }
                    """)
                
                # 截图最终状态
                await page.screenshot(path=f"{SCREENSHOT_DIR}/debug_final.png")
                
                # 检查对话框状态
                dialog_visible = await page.is_visible("text=清空对话")
                print(f"最终对话框状态: {'显示' if dialog_visible else '已关闭'}")
                
            else:
                print("未找到确认按钮")
        
        except Exception as e:
            print(f"错误: {e}")
            import traceback
            traceback.print_exc()
        
        finally:
            await asyncio.sleep(2)
            await browser.close()
            print("测试完成")

if __name__ == "__main__":
    asyncio.run(debug_enter_key())