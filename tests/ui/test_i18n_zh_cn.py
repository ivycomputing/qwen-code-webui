"""
测试 i18n 中文翻译功能

测试用例：
1. 导航到聊天页面
2. 检查初始状态（默认语言）
3. 打开设置，切换语言为中文
4. 验证以下文本已翻译为中文：
   - Select model -> 选择模型
   - Type message... -> 输入消息...
   - Send -> 发送
   - Start a conversation with Qwen -> 开始与 Qwen 对话
   - Type your message below to begin -> 在下方输入消息开始
"""

import sys
import os

# Add scripts directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

from playwright.sync_api import sync_playwright, expect
import time

# Configuration
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
VIEWPORT_SIZE = {"width": 1280, "height": 800}
HEADLESS = os.environ.get("HEADLESS", "false").lower() == "true"

# Screenshot directory
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "screenshots", "issues", "51")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)


def test_i18n_zh_cn():
    """测试 i18n 中文翻译功能"""
    print("\n" + "=" * 50)
    print("UI 功能测试：i18n 中文翻译")
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
            # Step 1: Navigate directly to a project chat page
            print("\n步骤 1: 导航到项目聊天页面")
            test_project_path = "/Users/rhuang/workspace/qwen-code-webui"
            chat_url = f"{BASE_URL}/projects{test_project_path}"
            print(f"  导航到: {chat_url}")
            page.goto(chat_url)
            page.wait_for_load_state("networkidle")
            time.sleep(3)
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "01_chat_page_initial.png"))
            print("  ✓ 聊天页面加载完成")

            # Step 2: Open settings and switch language to Chinese
            print("\n步骤 2: 打开设置，切换语言为中文")
            
            # Find and click settings button (gear icon)
            settings_button = page.locator("button[aria-label='Open settings']").first
            if settings_button.count() > 0:
                settings_button.click()
                time.sleep(1)
                page.screenshot(path=os.path.join(SCREENSHOT_DIR, "02_settings_opened.png"))
                print("  ✓ 设置面板已打开")
                
                # Find language select element and select Chinese
                language_select = page.locator("select").first
                if language_select.count() > 0:
                    current_lang = language_select.input_value()
                    print(f"  当前语言: {current_lang}")
                    
                    # Select Chinese (zh-CN)
                    language_select.select_option("zh-CN")
                    time.sleep(1)
                    new_lang = language_select.input_value()
                    print(f"  新语言: {new_lang}")
                    page.screenshot(path=os.path.join(SCREENSHOT_DIR, "03_language_selected_zh.png"))
                    print("  ✓ 语言已切换为中文")
                else:
                    print("  ! 语言选择框未找到")
                
                # Close settings
                settings_close = page.locator("button[aria-label='Close settings']").first
                if settings_close.count() > 0:
                    settings_close.click()
                    time.sleep(1)
                    print("  ✓ 设置面板已关闭")
            else:
                print("  ! 设置按钮未找到")

            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "04_after_language_change.png"))

            # Step 3: Verify translated texts
            print("\n步骤 3: 验证中文翻译")
            
            # Check model selector (Select model -> 选择模型)
            print("\n  检查模型选择器...")
            model_selector_zh = page.locator("button").filter(has_text="选择模型")
            model_selector_en = page.locator("button").filter(has_text="Select model")
            
            if model_selector_zh.count() > 0:
                print("    ✓ 模型选择器已翻译: '选择模型'")
            elif model_selector_en.count() > 0:
                print("    ✗ 模型选择器未翻译: 仍显示 'Select model'")
            else:
                # Try aria-label
                model_selector_aria = page.locator("button[aria-label='选择模型']")
                if model_selector_aria.count() > 0:
                    print("    ✓ 模型选择器 aria-label 已翻译")
                else:
                    print("    ! 模型选择器未找到")

            # Check input placeholder (Type message... -> 输入消息...)
            print("\n  检查输入框 placeholder...")
            textarea = page.locator("textarea")
            placeholder = textarea.get_attribute("placeholder")
            print(f"    当前 placeholder: '{placeholder}'")
            if placeholder and "输入消息" in placeholder:
                print("    ✓ 输入框 placeholder 已翻译")
            elif placeholder and "Type message" in placeholder:
                print("    ✗ 输入框 placeholder 未翻译: 仍显示 'Type message...'")
            else:
                print("    ! placeholder 值异常")

            # Check Send button (Send -> 发送)
            print("\n  检查发送按钮...")
            send_button_zh = page.locator("button[type='submit']").filter(has_text="发送")
            send_button_en = page.locator("button[type='submit']").filter(has_text="Send")
            
            if send_button_zh.count() > 0:
                print("    ✓ 发送按钮已翻译: '发送'")
            elif send_button_en.count() > 0:
                print("    ✗ 发送按钮未翻译: 仍显示 'Send'")
            else:
                submit_button = page.locator("button[type='submit']")
                if submit_button.count() > 0:
                    btn_text = submit_button.first.inner_text()
                    print(f"    ! 发送按钮文本: '{btn_text}'")

            # Check empty state message (Start a conversation -> 开始与 Qwen 对话)
            print("\n  检查空状态消息...")
            empty_state_zh = page.locator("text=开始与 Qwen 对话")
            empty_state_en = page.locator("text=Start a conversation")
            
            if empty_state_zh.count() > 0:
                print("    ✓ 空状态标题已翻译: '开始与 Qwen 对话'")
            elif empty_state_en.count() > 0:
                print("    ✗ 空状态标题未翻译: 仍显示 'Start a conversation'")
            else:
                print("    ! 空状态标题未找到")

            # Check subtitle (Type your message below to begin -> 在下方输入消息开始)
            print("\n  检查副标题...")
            subtitle_zh = page.locator("text=在下方输入消息开始")
            subtitle_en = page.locator("text=Type your message below")
            
            if subtitle_zh.count() > 0:
                print("    ✓ 副标题已翻译: '在下方输入消息开始'")
            elif subtitle_en.count() > 0:
                print("    ✗ 副标题未翻译: 仍显示 'Type your message below to begin'")
            else:
                print("    ! 副标题未找到")

            # Final screenshot
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "06_final_verification.png"))

            print("\n" + "-" * 50)
            print("测试完成，请检查截图验证结果")
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
    test_i18n_zh_cn()