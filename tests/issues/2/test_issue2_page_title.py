#!/usr/bin/env python3
"""
UI 测试脚本：验证 Issue #2 修复
测试浏览器 tab 标题是否正确显示 "Qwen Code Web UI"
"""

import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

# 配置
BASE_URL = "http://localhost:3000"
SCREENSHOT_DIR = Path(__file__).parent.parent.parent / "screenshots"

def test_page_title():
    """测试页面标题是否正确"""
    print("=" * 50)
    print("UI 功能测试：验证页面标题")
    print("=" * 50)
    
    # 确保截图目录存在
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    
    with sync_playwright() as p:
        # 启动浏览器
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        
        results = []
        
        try:
            # 测试 1: 访问首页并检查标题
            print("\n测试步骤 1: 访问首页")
            page.goto(BASE_URL, wait_until="networkidle")
            page.wait_for_timeout(1000)
            
            # 截图
            screenshot_path = SCREENSHOT_DIR / "issue2_homepage.png"
            page.screenshot(path=str(screenshot_path))
            print(f"  ✓ 截图保存: {screenshot_path}")
            
            # 获取页面标题
            title = page.title()
            print(f"  页面标题: {title}")
            
            # 验证标题
            expected_title = "Qwen Code Web UI"
            if title == expected_title:
                print(f"  ✓ 标题验证通过: '{title}'")
                results.append(("页面标题验证", True, f"标题正确: {title}"))
            else:
                print(f"  ✗ 标题验证失败: 期望 '{expected_title}'，实际 '{title}'")
                results.append(("页面标题验证", False, f"期望 '{expected_title}'，实际 '{title}'"))
            
            # 测试 2: 检查 h1 元素（主页显示项目选择器，这是正常的）
            print("\n测试步骤 2: 检查页面 h1 元素")
            try:
                h1 = page.locator("h1").first
                if h1.is_visible():
                    h1_text = h1.inner_text()
                    print(f"  h1 文本: {h1_text}")
                    # 主页 h1 显示 "Select a Project" 是正常的
                    # Demo 页面才会显示 "Qwen Code Web UI"
                    print(f"  ✓ h1 正常显示: {h1_text}")
                    results.append(("h1 元素验证", True, f"h1 显示: {h1_text}"))
            except Exception as e:
                print(f"  ! h1 检查跳过: {e}")
                results.append(("h1 元素验证", None, str(e)))
            
            # 测试 3: 检查 localStorage key
            print("\n测试步骤 3: 检查 localStorage key")
            localStorage = page.evaluate("() => Object.keys(localStorage)")
            print(f"  localStorage keys: {localStorage}")
            
            theme_key_exists = any("qwen-code-webui" in key for key in localStorage)
            old_key_exists = any("claude-code-webui" in key for key in localStorage)
            
            if theme_key_exists:
                print(f"  ✓ 发现新的 localStorage key (qwen-code-webui)")
                results.append(("localStorage key", True, "使用新 key"))
            elif old_key_exists:
                print(f"  ✗ 仍在使用旧的 localStorage key (claude-code-webui)")
                results.append(("localStorage key", False, "仍使用旧 key"))
            else:
                print(f"  - localStorage 中暂无主题设置")
                results.append(("localStorage key", None, "暂无主题设置"))
            
        except Exception as e:
            print(f"\n✗ 测试执行出错: {e}")
            results.append(("测试执行", False, str(e)))
        
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
    success = test_page_title()
    sys.exit(0 if success else 1)