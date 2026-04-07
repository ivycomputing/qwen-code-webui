"""
测试清空对话对话框的按钮和键盘快捷键
Issue 53: 弹出的清空对话的对话框，只有取消按钮，没有确认按钮，对话框也要支持键盘快捷键（回车和ESC）
"""
import asyncio
from playwright.async_api import async_playwright
import os
from datetime import datetime

SCREENSHOT_DIR = "/Users/rhuang/workspace/qwen-code-webui/screenshots/issues/53"

async def test_clear_dialog():
    """测试清空对话对话框"""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=300)
        context = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await context.new_page()
        
        try:
            # 导航到页面
            print("导航到项目选择页面...")
            await page.goto("http://localhost:3000/", wait_until="networkidle", timeout=30000)
            await asyncio.sleep(2)
            
            # 截图：项目选择页面
            await page.screenshot(path=f"{SCREENSHOT_DIR}/01_project_selector.png", full_page=True)
            print("已保存项目选择页面截图")
            
            # 查找并点击第一个项目
            print("查找项目...")
            
            # 查找项目卡片或项目按钮
            project_selectors = [
                "button:has-text('Select')",
                "button:has-text('选择')",
                "[data-testid='project-item']",
                ".project-card",
                "button[class*='project']",
            ]
            
            # 尝试找到可点击的项目
            project_clicked = False
            for selector in project_selectors:
                try:
                    elements = await page.query_selector_all(selector)
                    if elements:
                        print(f"找到 {len(elements)} 个元素: {selector}")
                        # 点击第一个可见的
                        for elem in elements:
                            if await elem.is_visible():
                                print(f"点击项目...")
                                await elem.click()
                                project_clicked = True
                                break
                        if project_clicked:
                            break
                except Exception as e:
                    print(f"选择器 {selector} 出错: {e}")
            
            if not project_clicked:
                # 尝试按回车键选择默认项目
                print("尝试按回车键选择项目...")
                await page.keyboard.press("Enter")
            
            # 等待导航到聊天页面
            await asyncio.sleep(3)
            
            # 截图：聊天页面
            await page.screenshot(path=f"{SCREENSHOT_DIR}/02_chat_page.png", full_page=True)
            print("已保存聊天页面截图")
            
            print(f"当前 URL: {page.url}")
            
            # 查找输入框
            print("\n查找输入框...")
            input_element = None
            
            # 等待输入框出现
            try:
                input_element = await page.wait_for_selector("textarea", timeout=5000)
                print("✓ 找到 textarea 输入框")
            except:
                print("未找到 textarea，尝试其他选择器...")
            
            if not input_element:
                # 尝试其他选择器
                for selector in ["div[contenteditable='true']", "input[type='text']"]:
                    try:
                        elem = await page.query_selector(selector)
                        if elem and await elem.is_visible():
                            input_element = elem
                            print(f"✓ 找到输入框: {selector}")
                            break
                    except:
                        pass
            
            if input_element:
                # 点击并聚焦输入框
                print("\n点击输入框...")
                await input_element.scroll_into_view_if_needed()
                await input_element.click()
                await asyncio.sleep(0.5)
                
                # 输入 /clear 命令
                print("输入 /clear 命令...")
                await input_element.fill("/clear")
                await asyncio.sleep(0.5)
                
                # 截图：输入命令后
                await page.screenshot(path=f"{SCREENSHOT_DIR}/03_clear_command.png")
                print("已保存输入命令截图")
                
                # 按 Enter 键
                print("按 Enter 键发送命令...")
                await input_element.press("Enter")
                await asyncio.sleep(2)
                
                # 截图：对话框
                await page.screenshot(path=f"{SCREENSHOT_DIR}/04_dialog.png", full_page=True)
                print("已保存对话框截图")
                
                # 检查对话框内容
                print("\n=== 检查对话框内容 ===")
                
                # 查找对话框
                dialogs = await page.query_selector_all("[role='dialog']")
                print(f"找到 {len(dialogs)} 个对话框")
                
                # 查找对话框中的所有按钮
                all_buttons = await page.query_selector_all("button")
                visible_buttons = []
                print(f"\n页面上所有按钮 ({len(all_buttons)} 个):")
                for i, btn in enumerate(all_buttons):
                    try:
                        text = await btn.inner_text()
                        is_visible = await btn.is_visible()
                        print(f"  按钮 {i+1}: '{text}' (可见: {is_visible})")
                        if is_visible:
                            visible_buttons.append((i+1, text, btn))
                    except:
                        pass
                
                # 检查确认按钮
                print("\n=== 检查确认/取消按钮 ===")
                confirm_btn = None
                cancel_btn = None
                
                for idx, text, btn in visible_buttons:
                    if text in ["清空", "Clear", "确认", "Confirm", "确定", "OK"]:
                        confirm_btn = btn
                        print(f"✓ 找到确认按钮: '{text}'")
                    elif text in ["取消", "Cancel"]:
                        cancel_btn = btn
                        print(f"✓ 找到取消按钮: '{text}'")
                
                if not confirm_btn:
                    print("⚠️ 未找到确认按钮！")
                if not cancel_btn:
                    print("⚠️ 未找到取消按钮！")
                
                # 测试键盘快捷键 - ESC
                print("\n=== 测试键盘快捷键 ===")
                print("测试 ESC 键关闭对话框...")
                await page.keyboard.press("Escape")
                await asyncio.sleep(1)
                
                # 截图：ESC 后
                await page.screenshot(path=f"{SCREENSHOT_DIR}/05_after_esc.png")
                print("已保存 ESC 后截图")
                
                # 检查对话框是否关闭
                dialog_visible = False
                for text in ["清空对话", "Clear conversation"]:
                    if await page.is_visible(f"text={text}"):
                        dialog_visible = True
                        break
                
                if not dialog_visible:
                    print("✓ ESC 键成功关闭对话框")
                else:
                    print("⚠️ ESC 键未能关闭对话框")
                
                # 再次打开对话框测试 Enter 键
                print("\n再次打开对话框测试 Enter 键...")
                input_element = await page.query_selector("textarea")
                if input_element and await input_element.is_visible():
                    await input_element.click()
                    await asyncio.sleep(0.3)
                    await input_element.fill("/clear")
                    await asyncio.sleep(0.3)
                    await input_element.press("Enter")
                    await asyncio.sleep(1)
                    
                    # 截图：再次打开对话框
                    await page.screenshot(path=f"{SCREENSHOT_DIR}/06_dialog_again.png")
                    print("已保存再次打开对话框截图")
                    
                    # 检查对话框是否出现
                    dialog_visible = False
                    for text in ["清空对话", "Clear conversation"]:
                        if await page.is_visible(f"text={text}"):
                            dialog_visible = True
                            break
                    
                    if dialog_visible:
                        print("✓ 对话框已打开")
                        
                        # 测试 Enter 键确认
                        print("测试 Enter 键确认...")
                        await asyncio.sleep(0.5)
                        
                        # 按 Enter 键
                        await page.keyboard.press("Enter")
                        await asyncio.sleep(1)
                        
                        # 截图：Enter 后
                        await page.screenshot(path=f"{SCREENSHOT_DIR}/07_after_enter.png")
                        print("已保存 Enter 后截图")
                        
                        # 检查对话框是否关闭（说明确认成功）
                        dialog_visible = False
                        for text in ["清空对话", "Clear conversation", "清空", "Clear"]:
                            if await page.is_visible(f"text={text}"):
                                dialog_visible = True
                                break
                        
                        if not dialog_visible:
                            print("✓ Enter 键成功确认并关闭对话框")
                        else:
                            print("⚠️ Enter 键未能确认对话框")
                    else:
                        print("⚠️ 未能再次打开对话框")
                    
                    # 最终截图
                    await asyncio.sleep(1)
                    await page.screenshot(path=f"{SCREENSHOT_DIR}/08_final.png")
                    print("已保存最终截图")
                else:
                    print("⚠️ 未找到输入框，无法再次测试")
            else:
                print("⚠️ 未找到输入框")
                await page.screenshot(path=f"{SCREENSHOT_DIR}/error_no_input.png", full_page=True)
        
        except Exception as e:
            print(f"错误: {e}")
            import traceback
            traceback.print_exc()
            await page.screenshot(path=f"{SCREENSHOT_DIR}/error.png", full_page=True)
        
        finally:
            await asyncio.sleep(2)
            await browser.close()
            print("\n测试完成！")
            print(f"截图保存在: {SCREENSHOT_DIR}")

if __name__ == "__main__":
    asyncio.run(test_clear_dialog())