"""
测试 Issue #55: Model 选择器默认值和持久化

测试用例：
1. 首次访问时自动选择第一个可用 model
2. 用户选择持久化到 localStorage
3. 如果保存的 model 不再可用，自动选择默认 model
"""

import sys
import os

# Add scripts directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

from playwright.sync_api import sync_playwright, expect
import time
import json

# Configuration
BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
VIEWPORT_SIZE = {"width": 1280, "height": 800}
HEADLESS = os.environ.get("HEADLESS", "false").lower() == "true"

# Screenshot directory for issue 55
SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "screenshots", "issues", "55")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)


def get_model_selector(page):
    """获取模型选择器按钮（支持中文和英文 aria-label）"""
    # Try Chinese aria-label first (default language)
    selector = page.locator("button[aria-label='选择模型']").first
    if selector.count() > 0:
        return selector
    # Try English aria-label
    selector = page.locator("button[aria-label='Select model']").first
    if selector.count() > 0:
        return selector
    return selector


def test_default_model_selection():
    """测试默认 model 选择功能"""
    print("\n" + "=" * 50)
    print("UI 功能测试：Issue #55 - 默认 model 选择和持久化")
    print("=" * 50)
    print(f"测试 URL: {BASE_URL}")
    print(f"截图目录：{SCREENSHOT_DIR}")
    print("-" * 50)

    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context(viewport=VIEWPORT_SIZE)
        page = context.new_page()

        try:
            # Test 1: Clear localStorage and verify default model selection
            print("\n测试 1: 首次访问自动选择默认 model")
            print("-" * 40)

            # Navigate to a project chat page
            test_project_path = "/Users/rhuang/workspace/qwen-code-webui"
            chat_url = f"{BASE_URL}/projects{test_project_path}"
            print(f"  导航到：{chat_url}")
            page.goto(chat_url)
            page.wait_for_load_state("networkidle")
            time.sleep(3)  # Wait for models to load

            # Clear localStorage to simulate first visit
            print("  清除 localStorage...")
            page.evaluate("localStorage.removeItem('qwen-selected-model')")
            page.reload()
            page.wait_for_load_state("networkidle")
            time.sleep(3)

            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "01_first_visit.png"))
            print("  ✓ 页面已加载（首次访问状态）")

            # Check model selector button text - should NOT be "Select model"
            model_selector = get_model_selector(page)
            expect(model_selector).to_be_visible()

            selector_text = model_selector.inner_text()
            print(f"  模型选择器文本: '{selector_text}'")

            # The text should be a model name, not placeholder
            if "Select model" in selector_text or "选择模型" in selector_text:
                print("  ✗ 失败：首次访问时显示占位符而非默认 model")
                raise AssertionError("首次访问时没有自动选择默认 model")
            else:
                print(f"  ✓ 首次访问自动选择了 model: {selector_text}")

            # Verify localStorage has the selected model
            saved_model = page.evaluate("localStorage.getItem('qwen-selected-model')")
            print(f"  localStorage 保存的 model: {saved_model}")
            assert saved_model is not None, "localStorage 中没有保存选择的 model"
            print("  ✓ localStorage 已保存选择的 model")

            # Test 2: Verify selection persists after reload
            print("\n测试 2: 验证选择持久化")
            print("-" * 40)

            # Open dropdown and select a different model
            model_selector.click()
            time.sleep(0.5)
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "02_dropdown_open.png"))

            model_options = page.locator("[role='option']")
            model_count = model_options.count()
            print(f"  可用 model 数量: {model_count}")

            if model_count > 1:
                # Select the second model
                second_model = model_options.nth(1)
                second_model_name = second_model.inner_text().split('\n')[0]  # Get first line
                print(f"  选择第二个 model: {second_model_name}")
                second_model.click()
                time.sleep(1)

                # Verify localStorage updated
                saved_model_after = page.evaluate("localStorage.getItem('qwen-selected-model')")
                print(f"  localStorage 更新后的 model: {saved_model_after}")

                # Reload page
                print("  重新加载页面...")
                page.reload()
                page.wait_for_load_state("networkidle")
                time.sleep(3)

                page.screenshot(path=os.path.join(SCREENSHOT_DIR, "03_after_reload.png"))

                # Check selector text matches selected model
                model_selector_text = model_selector.inner_text()
                print(f"  重新加载后选择器文本: '{model_selector_text}'")

                # Verify localStorage still has the model
                saved_model_reload = page.evaluate("localStorage.getItem('qwen-selected-model')")
                print(f"  localStorage 中的 model: {saved_model_reload}")

                if saved_model_after == saved_model_reload:
                    print("  ✓ 用户选择的 model 已持久化")
                else:
                    print(f"  ✗ 失败：持久化失败，期望 {saved_model_after}，实际 {saved_model_reload}")
                    raise AssertionError("用户选择的 model 没有正确持久化")
            else:
                print("  ! 只有一个 model，跳过持久化测试")

            # Test 3: Verify invalid model in localStorage gets replaced with default
            print("\n测试 3: 验证无效 model 自动切换到默认")
            print("-" * 40)

            # Set an invalid model ID in localStorage
            invalid_model_id = "invalid-model-id-12345"
            print(f"  设置无效 model ID: {invalid_model_id}")
            page.evaluate(f"localStorage.setItem('qwen-selected-model', '{invalid_model_id}')")

            # Reload page
            print("  重新加载页面...")
            page.reload()
            page.wait_for_load_state("networkidle")
            time.sleep(3)

            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "04_invalid_model_recovery.png"))

            # Check that the selector shows a valid model (not placeholder)
            model_selector_text = model_selector.inner_text()
            print(f"  选择器文本: '{model_selector_text}'")

            # Verify localStorage has been updated to a valid model
            saved_model_invalid = page.evaluate("localStorage.getItem('qwen-selected-model')")
            print(f"  localStorage 更新后的 model: {saved_model_invalid}")

            if saved_model_invalid == invalid_model_id:
                print("  ✗ 失败：无效 model 没有被替换")
                raise AssertionError("无效 model 没有被自动替换为默认 model")
            else:
                print(f"  ✓ 无效 model 已自动替换为: {saved_model_invalid}")

            print("\n" + "-" * 50)
            print("测试结果：通过 ✓")
            print("-" * 50)

        except Exception as e:
            print(f"\n错误：{e}")
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "error.png"))
            print("\n" + "-" * 50)
            print("测试结果：失败 ✗")
            print("-" * 50)
            raise

        finally:
            context.close()
            browser.close()

    print("\n截图已保存到:", SCREENSHOT_DIR)


if __name__ == "__main__":
    test_default_model_selection()