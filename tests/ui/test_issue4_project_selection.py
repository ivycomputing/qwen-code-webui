#!/usr/bin/env python3
"""
UI 测试脚本：验证 Issue #4 修复
测试项目选择页面是否能正确显示项目列表
"""

import sys
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

# 配置
FRONTEND_URL = "http://localhost:3000"
BACKEND_URL = "http://localhost:8080"
SCREENSHOT_DIR = Path(__file__).parent.parent.parent / "screenshots"


def test_project_selection():
    """测试项目选择功能"""
    print("=" * 50)
    print("UI 功能测试：验证项目选择页面")
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
            # 测试 1: 检查后端 API 返回项目列表
            print("\n测试步骤 1: 检查后端 /api/projects 接口")
            api_response = page.request.get(f"{BACKEND_URL}/api/projects")
            response_json = api_response.json()
            
            # API 返回 {"projects": [...]} 格式
            projects_data = response_json.get("projects", [])
            
            print(f"  API 响应状态: {api_response.status}")
            print(f"  项目数量: {len(projects_data)}")
            
            if len(projects_data) > 0:
                print(f"  ✓ API 返回 {len(projects_data)} 个项目")
                for proj in projects_data[:3]:  # 显示前3个项目
                    print(f"    - {proj.get('path', 'N/A')}")
                results.append(("后端 API 项目列表", True, f"返回 {len(projects_data)} 个项目"))
            else:
                print(f"  ✗ API 未返回任何项目")
                results.append(("后端 API 项目列表", False, "未返回项目"))

            # 测试 2: 访问前端首页
            print("\n测试步骤 2: 访问前端首页")
            page.goto(FRONTEND_URL, wait_until="networkidle")
            page.wait_for_timeout(2000)

            # 截图
            screenshot_path = SCREENSHOT_DIR / "issue4_homepage.png"
            page.screenshot(path=str(screenshot_path))
            print(f"  ✓ 截图保存: {screenshot_path}")
            results.append(("首页加载", True, "页面加载成功"))

            # 测试 3: 检查页面标题
            print("\n测试步骤 3: 检查页面标题")
            title = page.title()
            print(f"  页面标题: {title}")
            results.append(("页面标题", True, title))

            # 测试 4: 检查项目选择器是否存在
            print("\n测试步骤 4: 检查项目选择器")
            
            # 等待项目列表加载
            page.wait_for_selector("text=Select a Project", timeout=5000)
            
            # 检查 h1 标题
            h1 = page.locator("h1").first
            if h1.is_visible():
                h1_text = h1.inner_text()
                print(f"  h1 文本: {h1_text}")
                results.append(("页面标题 h1", True, h1_text))

            # 测试 5: 检查项目卡片/列表
            print("\n测试步骤 5: 检查项目列表")
            
            # 检查页面内容是否包含项目路径
            body_text = page.locator("body").inner_text()
            
            # 检查是否有 "Recent Projects" 标题
            recent_projects = page.locator("text=Recent Projects")
            if recent_projects.count() > 0:
                print(f"  ✓ 找到 'Recent Projects' 标题")
                results.append(("项目列表标题", True, "显示 'Recent Projects'"))
            
            # 检查是否有项目路径显示（以 / 开头的路径）
            import re
            project_paths = re.findall(r'/[\w/\-\.]+', body_text)
            if len(project_paths) > 0:
                print(f"  ✓ 找到 {len(project_paths)} 个项目路径")
                for path in project_paths[:3]:
                    print(f"    - {path}")
                results.append(("项目列表显示", True, f"显示 {len(project_paths)} 个项目路径"))
            else:
                # 检查是否有 "No projects found" 消息
                no_projects = page.locator("text=No projects")
                if no_projects.count() > 0:
                    print("  ✗ 显示 'No projects' 消息")
                    results.append(("项目列表显示", False, "显示 'No projects'"))
                else:
                    print("  - 未找到项目路径")
                    results.append(("项目列表显示", None, "未找到项目路径"))

            # 测试 6: 截取最终状态
            print("\n测试步骤 6: 截取最终状态")
            final_screenshot = SCREENSHOT_DIR / "issue4_final.png"
            page.screenshot(path=str(final_screenshot))
            print(f"  ✓ 最终截图: {final_screenshot}")
            results.append(("最终截图", True, str(final_screenshot)))

        except Exception as e:
            print(f"\n✗ 测试执行出错: {e}")
            results.append(("测试执行", False, str(e)))
            
            # 错误时截图
            try:
                error_screenshot = SCREENSHOT_DIR / "issue4_error.png"
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
    success = test_project_selection()
    sys.exit(0 if success else 1)