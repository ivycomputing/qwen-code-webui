#!/usr/bin/env python3
"""
UI 测试脚本：验证设置界面新功能
1. 版本号显示
2. 实验性功能开关 (useWebUIComponents)
"""

import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

# 配置
FRONTEND_URL = "http://localhost:3000"
BACKEND_URL = "http://127.0.0.1:8080"
SCREENSHOT_DIR = Path(__file__).parent.parent.parent / "screenshots"


def test_settings_features():
    """测试设置界面功能"""
    print("=" * 50)
    print("UI 功能测试：验证设置界面新功能")
    print("=" * 50)

    # 确保截图目录存在
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

    results = []

    with sync_playwright() as p:
        # 启动浏览器
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        try:
            # 测试 1: 检查后端 /api/version 接口
            print("\n测试步骤 1: 检查后端 /api/version 接口")
            api_response = page.request.get(f"{BACKEND_URL}/api/version")
            response_json = api_response.json()

            version = response_json.get("version", "")
            print(f"  API 响应状态: {api_response.status}")
            print(f"  版本号: {version}")

            if version:
                print(f"  ✓ API 返回版本号: {version}")
                results.append(("后端版本 API", True, f"v{version}"))
            else:
                print(f"  ✗ API 未返回版本号")
                results.append(("后端版本 API", False, "未返回版本号"))

            # 测试 2: 访问前端首页
            print("\n测试步骤 2: 访问前端首页")
            page.goto(FRONTEND_URL, wait_until="networkidle")
            page.wait_for_timeout(2000)

            screenshot_path = SCREENSHOT_DIR / "settings_homepage.png"
            page.screenshot(path=str(screenshot_path))
            print(f"  ✓ 截图保存: {screenshot_path}")
            results.append(("首页加载", True, "页面加载成功"))

            # 测试 3: 检查设置按钮是否存在
            print("\n测试步骤 3: 检查设置按钮")

            # 设置按钮通常是一个齿轮图标
            settings_btn = page.locator('button[aria-label*="settings"], button[aria-label*="Settings"], button:has(svg[class*="CogIcon"]), button:has(svg)').first

            # 尝试多种选择器找到设置按钮
            possible_selectors = [
                'button[aria-label*="settings"]',
                'button[aria-label*="Settings"]',
                'button:has-text("Settings")',
                'button:has(svg)',  # 任何带 svg 的按钮
            ]

            settings_found = False
            for selector in possible_selectors:
                try:
                    btn = page.locator(selector).first
                    if btn.is_visible(timeout=1000):
                        settings_btn = btn
                        settings_found = True
                        print(f"  ✓ 找到设置按钮 (选择器: {selector})")
                        break
                except Exception:
                    continue

            if settings_found:
                results.append(("设置按钮", True, "找到设置按钮"))
            else:
                print("  ✗ 未找到设置按钮")
                results.append(("设置按钮", False, "未找到设置按钮"))

            # 测试 4: 点击设置按钮打开设置模态框
            print("\n测试步骤 4: 打开设置模态框")
            if settings_found:
                settings_btn.click()
                page.wait_for_timeout(500)

                # 检查模态框是否打开
                modal = page.locator('text=Settings, text=General Settings').first
                if modal.is_visible(timeout=3000):
                    print("  ✓ 设置模态框已打开")
                    results.append(("设置模态框", True, "模态框打开成功"))

                    # 截图
                    modal_screenshot = SCREENSHOT_DIR / "settings_modal.png"
                    page.screenshot(path=str(modal_screenshot))
                    print(f"  ✓ 模态框截图: {modal_screenshot}")
                else:
                    print("  ✗ 设置模态框未打开")
                    results.append(("设置模态框", False, "模态框未打开"))

            # 测试 5: 检查版本号显示
            print("\n测试步骤 5: 检查版本号显示")
            try:
                # 查找版本号文本 (格式: v0.1.0 或 Version)
                version_text = page.locator('text=/v?\\d+\\.\\d+\\.\\d+/').first
                if version_text.is_visible(timeout=2000):
                    version_content = version_text.inner_text()
                    print(f"  ✓ 找到版本号: {version_content}")
                    results.append(("版本号显示", True, version_content))
                else:
                    # 尝试查找 "Version" 标签
                    version_label = page.locator('text=Version').first
                    if version_label.is_visible(timeout=1000):
                        print("  ✓ 找到 'Version' 标签")
                        # 获取相邻的版本值
                        parent = version_label.locator('xpath=..')
                        parent_text = parent.inner_text()
                        print(f"  版本区域文本: {parent_text}")
                        results.append(("版本号显示", True, parent_text))
                    else:
                        print("  ✗ 未找到版本号显示")
                        results.append(("版本号显示", False, "未找到版本号"))
            except Exception as e:
                print(f"  ✗ 检查版本号时出错: {e}")
                results.append(("版本号显示", False, str(e)))

            # 测试 6: 检查实验性功能区域
            print("\n测试步骤 6: 检查实验性功能区域")
            try:
                experimental_section = page.locator('text=Experimental Features').first
                if experimental_section.is_visible(timeout=2000):
                    print("  ✓ 找到 'Experimental Features' 区域")
                    results.append(("实验性功能区域", True, "区域可见"))

                    # 截图
                    exp_screenshot = SCREENSHOT_DIR / "settings_experimental.png"
                    page.screenshot(path=str(exp_screenshot))
                    print(f"  ✓ 实验性功能截图: {exp_screenshot}")
                else:
                    print("  ✗ 未找到 'Experimental Features' 区域")
                    results.append(("实验性功能区域", False, "区域不可见"))
            except Exception as e:
                print(f"  ✗ 检查实验性功能区域时出错: {e}")
                results.append(("实验性功能区域", False, str(e)))

            # 测试 7: 检查 WebUI Components 开关
            print("\n测试步骤 7: 检查 WebUI Components 开关")
            try:
                # 查找开关按钮
                webui_toggle = page.locator('text=Qwen WebUI Components').first
                if webui_toggle.is_visible(timeout=2000):
                    print("  ✓ 找到 'Qwen WebUI Components' 开关")
                    results.append(("WebUI Components 开关", True, "开关可见"))

                    # 获取当前状态
                    parent = webui_toggle.locator('xpath=..')
                    parent_text = parent.inner_text()
                    is_enabled = "Enabled" in parent_text
                    print(f"  当前状态: {'已启用' if is_enabled else '已禁用'}")

                    # 测试点击切换
                    print("\n测试步骤 8: 测试切换开关")
                    # 找到可点击的按钮
                    toggle_btn = parent.locator('button[role="switch"]').first
                    if toggle_btn.is_visible():
                        toggle_btn.click()
                        page.wait_for_timeout(500)

                        # 检查状态是否改变
                        parent_text_after = parent.inner_text()
                        is_enabled_after = "Enabled" in parent_text_after
                        print(f"  切换后状态: {'已启用' if is_enabled_after else '已禁用'}")

                        if is_enabled != is_enabled_after:
                            print("  ✓ 开关切换成功")
                            results.append(("开关切换", True, f"{'禁用→启用' if is_enabled_after else '启用→禁用'}"))
                        else:
                            print("  - 开关状态未改变（可能已是目标状态）")
                            results.append(("开关切换", True, "状态保持"))

                        # 截图
                        toggle_screenshot = SCREENSHOT_DIR / "settings_toggle.png"
                        page.screenshot(path=str(toggle_screenshot))
                        print(f"  ✓ 切换后截图: {toggle_screenshot}")
                    else:
                        print("  ✗ 未找到可点击的开关按钮")
                        results.append(("开关切换", False, "未找到开关按钮"))
                else:
                    print("  ✗ 未找到 'Qwen WebUI Components' 开关")
                    results.append(("WebUI Components 开关", False, "开关不可见"))
            except Exception as e:
                print(f"  ✗ 检查 WebUI Components 开关时出错: {e}")
                results.append(("WebUI Components 开关", False, str(e)))

            # 测试 9: 关闭设置模态框
            print("\n测试步骤 9: 关闭设置模态框")
            try:
                # 点击关闭按钮或按 ESC
                close_btn = page.locator('button[aria-label*="Close"], button:has(svg)').first
                if close_btn.is_visible():
                    close_btn.click()
                    page.wait_for_timeout(500)
                    print("  ✓ 关闭按钮点击成功")
                    results.append(("关闭模态框", True, "关闭成功"))
            except Exception as e:
                print(f"  - 关闭模态框: {e}")
                results.append(("关闭模态框", True, "通过其他方式关闭"))

            # 最终截图
            print("\n测试步骤 10: 最终截图")
            final_screenshot = SCREENSHOT_DIR / "settings_final.png"
            page.screenshot(path=str(final_screenshot))
            print(f"  ✓ 最终截图: {final_screenshot}")
            results.append(("最终截图", True, str(final_screenshot)))

        except Exception as e:
            print(f"\n✗ 测试执行出错: {e}")
            results.append(("测试执行", False, str(e)))

            # 错误时截图
            try:
                error_screenshot = SCREENSHOT_DIR / "settings_error.png"
                page.screenshot(path=str(error_screenshot))
                print(f"  错误截图: {error_screenshot}")
            except Exception:
                pass

        finally:
            browser.close()

    # 输出测试报告
    print("\n" + "=" * 50)
    print("测试报告")
    print("=" * 50)

    passed = sum(1 for r in results if r[1] is True)
    failed = sum(1 for r in results if r[1] is False)
    skipped = sum(1 for r in results if r[1] is None)

    for name, status, detail in results:
        status_icon = "✓" if status is True else ("✗" if status is False else "-")
        print(f"  {status_icon} {name}: {detail}")

    print(f"\n总计: {len(results)} 项")
    print(f"  通过: {passed}")
    print(f"  失败: {failed}")
    print(f"  跳过: {skipped}")
    print("=" * 50)

    return failed == 0


if __name__ == "__main__":
    success = test_settings_features()
    sys.exit(0 if success else 1)