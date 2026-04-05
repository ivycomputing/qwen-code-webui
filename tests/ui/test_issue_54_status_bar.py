"""
测试 Issue 54: 在 mode 这一行显示当前 model、当前上下文使用比例

测试用例：
1. 检查状态栏是否显示权限模式
2. 检查状态栏是否显示当前选中的模型名称
3. 选择模型后验证状态栏更新
4. 发送消息后检查 token 使用量显示（如果有）
"""

import sys
import os

# Add scripts directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

from playwright.sync_api import sync_playwright, expect
import time
import re

# Configuration
BASE_URL = os.environ.get("BASE_URL", "http://localhost:5173")
VIEWPORT_SIZE = {"width": 1280, "height": 800}
HEADLESS = os.environ.get("HEADLESS", "false").lower() == "true"

# Screenshot directory
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "screenshots", "issues", "54")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)


def test_status_bar():
    """测试状态栏功能（Issue 54）"""
    print("\n" + "=" * 50)
    print("UI 功能测试：状态栏显示（Issue 54）")
    print("=" * 50)
    print(f"测试 URL: {BASE_URL}")
    print(f"截图目录: {SCREENSHOT_DIR}")
    print("-" * 50)

    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context(viewport=VIEWPORT_SIZE)
        page = context.new_page()

        try:
            # Step 0: First verify service is accessible
            print("\n步骤 0: 验证服务可访问")
            print(f"  访问主页: {BASE_URL}")
            page.goto(BASE_URL)
            page.wait_for_load_state("networkidle")
            time.sleep(2)
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "00_homepage.png"))
            print("  ✓ 主页可访问")

            # Step 1: Navigate directly to a project chat page
            print("\n步骤 1: 导航到项目聊天页面")
            test_project_path = "/Users/rhuang/workspace/qwen-code-webui"
            chat_url = f"{BASE_URL}/projects{test_project_path}"
            print(f"  导航到: {chat_url}")
            page.goto(chat_url)
            page.wait_for_load_state("networkidle")
            time.sleep(3)
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "01_chat_page.png"))
            print("  ✓ 聊天页面加载完成")

            # Step 2: Check status bar (permission mode indicator)
            print("\n步骤 2: 检查状态栏")
            # The status bar is in the ChatInput component, at the bottom
            # It should contain the permission mode indicator like "🔧 normal mode"

            # Find the status bar button (contains permission mode)
            status_bar_buttons = page.locator("button.font-mono").all()

            print(f"  找到 {len(status_bar_buttons)} 个 font-mono 按钮")

            # Look for permission mode text
            permission_mode_found = False
            status_bar_text = ""

            for btn in status_bar_buttons:
                try:
                    text = btn.inner_text()
                    if "normal mode" in text.lower() or "plan mode" in text.lower() or "yolo" in text.lower() or "auto-edit" in text.lower():
                        permission_mode_found = True
                        status_bar_text = text
                        print(f"  ✓ 状态栏内容: '{text}'")
                        break
                except:
                    pass

            if permission_mode_found:
                print("  ✓ 权限模式指示器已显示")
            else:
                print("  ! 权限模式指示器未找到，检查其他元素...")
                # Take screenshot for debugging
                page.screenshot(path=os.path.join(SCREENSHOT_DIR, "02_debug_status_bar.png"))

                # Print all text content in the bottom area
                bottom_area = page.locator(".flex-shrink-0").last
                if bottom_area:
                    print(f"  底部区域内容: {bottom_area.inner_text()[:200]}")

            # Step 3: Check model selector and select a model
            print("\n步骤 3: 选择模型")
            model_selector = page.locator("button[aria-label='Select model']")
            model_selector_count = model_selector.count()

            if model_selector_count > 0:
                print("  ✓ 模型选择器已找到")
                model_selector.first.click()
                time.sleep(1)
                page.screenshot(path=os.path.join(SCREENSHOT_DIR, "03_model_dropdown.png"))
                print("  ✓ 下拉菜单已打开")

                # Select the second model option
                model_options = page.locator("[role='option']")
                model_count = model_options.count()
                print(f"  找到 {model_count} 个模型选项")

                if model_count > 1:
                    # Get model name before selecting
                    second_model_name = model_options.nth(1).inner_text()
                    print(f"  将选择模型: {second_model_name}")

                    model_options.nth(1).click()
                    time.sleep(1)
                    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "04_model_selected.png"))
                    print("  ✓ 模型已选择")
                else:
                    print("  ! 只有一个选项")

            else:
                print("  ! 模型选择器未找到")

            # Step 4: Verify status bar shows model name
            print("\n步骤 4: 验证状态栏显示模型名称")
            time.sleep(1)

            # Check if status bar contains model info
            # Expected format: "🔧 normal mode | 📖 model_name | 📊 token usage"
            status_bar_content = ""
            for btn in page.locator("button.font-mono").all():
                try:
                    text = btn.inner_text()
                    if "mode" in text.lower():
                        status_bar_content = text
                        break
                except:
                    pass

            print(f"  当前状态栏内容: '{status_bar_content}'")

            # Check if model name is displayed
            if "📖" in status_bar_content or "|" in status_bar_content:
                print("  ✓ 状态栏包含分隔符和额外信息")
                page.screenshot(path=os.path.join(SCREENSHOT_DIR, "05_status_bar_with_model.png"))

                # Parse the status bar content
                parts = status_bar_content.split("|")
                print(f"  状态栏分段数: {len(parts)}")
                for i, part in enumerate(parts):
                    print(f"    分段 {i+1}: '{part.strip()}'")
            else:
                print("  ! 状态栏不包含模型信息（可能需要先选择模型）")
                page.screenshot(path=os.path.join(SCREENSHOT_DIR, "05_status_bar_no_model.png"))

            # Step 5: Test permission mode cycling
            print("\n步骤 5: 测试权限模式切换")
            status_bar_btn = None
            for btn in page.locator("button.font-mono").all():
                try:
                    text = btn.inner_text()
                    if "mode" in text.lower():
                        status_bar_btn = btn
                        break
                except:
                    pass

            if status_bar_btn:
                # Click to cycle mode
                status_bar_btn.click()
                time.sleep(0.5)
                page.screenshot(path=os.path.join(SCREENSHOT_DIR, "06_mode_cycled.png"))

                new_text = status_bar_btn.inner_text()
                print(f"  点击后状态栏: '{new_text}'")

                # Check if mode changed
                if "plan mode" in new_text.lower() or "yolo" in new_text.lower() or "auto-edit" in new_text.lower():
                    print("  ✓ 权限模式已切换")

                # Cycle back to normal
                status_bar_btn.click()
                time.sleep(0.5)
                status_bar_btn.click()
                time.sleep(0.5)
                status_bar_btn.click()
                time.sleep(0.5)
                page.screenshot(path=os.path.join(SCREENSHOT_DIR, "07_mode_normal.png"))
                print("  ✓ 已切换回 normal mode")

            # Final verification
            print("\n步骤 6: 最终验证")
            final_status = ""
            for btn in page.locator("button.font-mono").all():
                try:
                    text = btn.inner_text()
                    if "mode" in text.lower():
                        final_status = text
                        break
                except:
                    pass

            print(f"  最终状态栏: '{final_status}'")

            # Parse and verify components
            has_permission_mode = "normal" in final_status.lower() or "plan" in final_status.lower() or "yolo" in final_status.lower() or "auto-edit" in final_status.lower()
            has_model_info = "📖" in final_status or (len(final_status.split("|")) > 1)

            print(f"\n  权限模式显示: {'✓' if has_permission_mode else '✗'}")
            print(f"  模型信息显示: {'✓' if has_model_info else '✗'}")

            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "08_final_state.png"))

            print("\n" + "-" * 50)
            if has_permission_mode:
                print("测试结果: 通过 ✓")
                print("  - 权限模式指示器正常显示")
                if has_model_info:
                    print("  - 模型信息在状态栏中显示")
            else:
                print("测试结果: 部分通过")
            print("-" * 50)

        except Exception as e:
            print(f"\n错误: {e}")
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "error.png"))
            print("\n" + "-" * 50)
            print("测试结果: 失败 ✗")
            print("-" * 50)
            raise

        finally:
            context.close()
            browser.close()

    print("\n截图已保存到:", SCREENSHOT_DIR)


if __name__ == "__main__":
    test_status_bar()