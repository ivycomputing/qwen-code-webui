"""
UI 测试：Issue 53 清空对话对话框
测试目标：
1. 确认对话框有确认按钮和取消按钮
2. 确认按钮可点击
3. ESC 键关闭对话框
4. Enter 键确认对话框（当确认按钮聚焦时）
"""
import asyncio
from playwright.async_api import async_playwright
import os
from datetime import datetime

SCREENSHOT_DIR = "/Users/rhuang/workspace/qwen-code-webui/screenshots/ui/issue_53"

async def run_test():
    """执行 UI 测试"""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    
    results = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await context.new_page()
        
        try:
            # Step 1: 导航到应用
            print("Step 1: 导航到应用...")
            await page.goto("http://localhost:3000/", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(2)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/01_home.png")
            
            # Step 2: 选择项目进入聊天页面
            print("Step 2: 选择项目...")
            await page.keyboard.press("Enter")
            await asyncio.sleep(3)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/02_chat_page.png")
            
            # 验证是否进入聊天页面
            current_url = page.url
            if "/projects/" in current_url:
                results.append({"step": "导航到聊天页面", "status": "通过", "detail": current_url})
            else:
                results.append({"step": "导航到聊天页面", "status": "失败", "detail": current_url})
                raise Exception("未能导航到聊天页面")
            
            # Step 3: 输入 /clear 命令
            print("Step 3: 输入 /clear 命令...")
            input_elem = await page.wait_for_selector("textarea", timeout=5000)
            await input_elem.click()
            await asyncio.sleep(0.5)
            await input_elem.fill("/clear")
            await asyncio.sleep(0.5)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/03_clear_input.png")
            
            # Step 4: 按 Enter 发送命令
            print("Step 4: 按 Enter 发送命令...")
            await input_elem.press("Enter")
            await asyncio.sleep(1.5)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/04_dialog.png")
            
            # 验证对话框是否出现
            dialog_visible = await page.is_visible("text=清空对话") or await page.is_visible("text=Clear conversation")
            if dialog_visible:
                results.append({"step": "对话框显示", "status": "通过", "detail": "对话框正确弹出"})
            else:
                results.append({"step": "对话框显示", "status": "失败", "detail": "对话框未弹出"})
                raise Exception("对话框未弹出")
            
            # Step 5: 检查对话框按钮
            print("Step 5: 检查对话框按钮...")
            
            # 查找所有按钮
            buttons = await page.query_selector_all("button")
            visible_buttons = []
            for btn in buttons:
                try:
                    text = await btn.inner_text()
                    is_visible = await btn.is_visible()
                    if is_visible and text.strip():
                        visible_buttons.append(text.strip())
                except:
                    pass
            
            print(f"可见按钮: {visible_buttons}")
            
            # 检查确认按钮
            confirm_btn = await page.query_selector("button:has-text('清空')")
            if confirm_btn:
                is_visible = await confirm_btn.is_visible()
                is_enabled = await confirm_btn.is_enabled()
                btn_class = await confirm_btn.get_attribute("class") or ""
                print(f"确认按钮状态: 可见={is_visible}, 启用={is_enabled}")
                print(f"确认按钮样式: {btn_class[:100]}")
                
                if is_visible:
                    results.append({"step": "确认按钮存在且可见", "status": "通过", "detail": f"按钮文本: 清空"})
                else:
                    results.append({"step": "确认按钮存在且可见", "status": "失败", "detail": "按钮不可见"})
            else:
                results.append({"step": "确认按钮存在且可见", "status": "失败", "detail": "未找到确认按钮"})
            
            # 检查取消按钮
            cancel_btn = await page.query_selector("button:has-text('取消')")
            if cancel_btn:
                is_visible = await cancel_btn.is_visible()
                print(f"取消按钮状态: 可见={is_visible}")
                
                if is_visible:
                    results.append({"step": "取消按钮存在且可见", "status": "通过", "detail": f"按钮文本: 取消"})
                else:
                    results.append({"step": "取消按钮存在且可见", "status": "失败", "detail": "按钮不可见"})
            else:
                results.append({"step": "取消按钮存在且可见", "status": "失败", "detail": "未找到取消按钮"})
            
            # Step 6: 测试 ESC 键关闭对话框
            print("Step 6: 测试 ESC 键...")
            await page.keyboard.press("Escape")
            await asyncio.sleep(1)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/05_after_esc.png")
            
            # 验证对话框是否关闭
            dialog_visible = await page.is_visible("text=清空对话") or await page.is_visible("text=Clear conversation")
            if not dialog_visible:
                results.append({"step": "ESC 键关闭对话框", "status": "通过", "detail": "ESC 成功关闭对话框"})
            else:
                results.append({"step": "ESC 键关闭对话框", "status": "失败", "detail": "ESC 未关闭对话框"})
            
            # Step 7: 再次打开对话框测试点击确认按钮
            print("Step 7: 再次打开对话框测试点击确认...")
            input_elem = await page.wait_for_selector("textarea", timeout=5000)
            await input_elem.click()
            await asyncio.sleep(0.5)
            await input_elem.fill("/clear")
            await asyncio.sleep(0.5)
            await input_elem.press("Enter")
            await asyncio.sleep(1.5)
            await page.screenshot(path=f"{SCREENSHOT_DIR}/06_dialog_again.png")
            
            # 点击确认按钮
            confirm_btn = await page.query_selector("button:has-text('清空')")
            if confirm_btn:
                await confirm_btn.click()
                await asyncio.sleep(1)
                await page.screenshot(path=f"{SCREENSHOT_DIR}/07_after_click_confirm.png")
                
                # 验证对话框是否关闭
                dialog_visible = await page.is_visible("text=清空对话")
                if not dialog_visible:
                    results.append({"step": "点击确认按钮关闭对话框", "status": "通过", "detail": "点击确认成功"})
                else:
                    results.append({"step": "点击确认按钮关闭对话框", "status": "失败", "detail": "对话框仍然显示"})
            
            # Step 8: 再次测试 Enter 键（当确认按钮聚焦时）
            print("Step 8: 测试 Enter 键确认...")
            input_elem = await page.wait_for_selector("textarea", timeout=5000)
            await input_elem.click()
            await asyncio.sleep(0.5)
            await input_elem.fill("/clear")
            await asyncio.sleep(0.5)
            await input_elem.press("Enter")
            await asyncio.sleep(1.5)
            
            # 检查焦点状态
            active_element = await page.evaluate("document.activeElement.tagName")
            active_text = await page.evaluate("document.activeElement.textContent || ''")
            print(f"当前焦点元素: {active_element}, 内容: '{active_text.strip()}'")
            
            # 手动聚焦到确认按钮
            confirm_btn = await page.query_selector("button:has-text('清空')")
            if confirm_btn:
                await confirm_btn.focus()
                await asyncio.sleep(0.3)
                
                # 验证焦点
                focused_tag = await page.evaluate("document.activeElement.tagName")
                focused_text = await page.evaluate("document.activeElement.textContent || ''")
                print(f"聚焦后元素: {focused_tag}, 内容: '{focused_text.strip()}'")
                
                await page.keyboard.press("Enter")
                await asyncio.sleep(1)
                await page.screenshot(path=f"{SCREENSHOT_DIR}/08_after_enter_focused.png")
                
                # 验证结果
                dialog_visible = await page.is_visible("text=清空对话")
                if not dialog_visible:
                    results.append({"step": "Enter 键确认（聚焦确认按钮）", "status": "通过", "detail": "聚焦后 Enter 成功确认"})
                else:
                    results.append({"step": "Enter 键确认（聚焦确认按钮）", "status": "失败", "detail": "对话框仍然显示"})
            
        except Exception as e:
            print(f"错误: {e}")
            import traceback
            traceback.print_exc()
            await page.screenshot(path=f"{SCREENSHOT_DIR}/error.png")
            results.append({"step": "测试执行", "status": "错误", "detail": str(e)})
        
        finally:
            await asyncio.sleep(2)
            await browser.close()
    
    # 输出测试报告
    print("\n" + "="*60)
    print("UI 测试报告 - Issue 53 清空对话对话框")
    print("="*60)
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"测试步骤: {len(results)} 个")
    
    passed = sum(1 for r in results if r["status"] == "通过")
    failed = sum(1 for r in results if r["status"] == "失败")
    
    print(f"通过: {passed} 个")
    print(f"失败: {failed} 个")
    print("-"*60)
    
    for r in results:
        status_icon = "✓" if r["status"] == "通过" else "✗" if r["status"] == "失败" else "!"
        print(f"{status_icon} {r['step']}: {r['detail']}")
    
    print("-"*60)
    print(f"截图目录: {SCREENSHOT_DIR}")
    print("="*60)
    
    return results

if __name__ == "__main__":
    asyncio.run(run_test())