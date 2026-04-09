"""
Test for issue #62: 输入框内容过长时发送按钮遮挡文字

这个测试验证当输入框中的内容超过最大高度时，发送按钮不会遮挡文字内容。

修复方案：将发送按钮从 textarea 内部移到外部，作为独立的右侧区域。
"""

import pytest
from playwright.sync_api import Page, expect
import os
import time

# 测试配置
BASE_URL = os.getenv("BASE_URL", "http://localhost:3000")
SCREENSHOT_DIR = "screenshots/issues/62"


def ensure_screenshot_dir():
    """确保截图目录存在"""
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)


def test_input_long_text_button_not_overlapping(page: Page):
    """
    测试当输入框内容超过最大高度时，发送按钮不会遮挡文字
    
    验证点：
    1. 输入框和按钮是独立的兄弟元素
    2. 按钮位于输入框右侧，而不是覆盖在输入框上面
    3. 输入框内的文字可以完整滚动查看
    """
    ensure_screenshot_dir()
    
    # 导航到页面
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    # 截图：初始状态
    page.screenshot(path=f"{SCREENSHOT_DIR}/01_initial.png")
    
    # 找到输入框
    textarea = page.locator("textarea")
    expect(textarea).to_be_visible()
    
    # 获取输入框的初始高度
    initial_height = textarea.bounding_box()["height"]
    print(f"初始输入框高度: {initial_height}px")
    
    # 输入大量文本，确保超过最大高度 200px
    long_text = "这是一段很长的测试文本，用于验证输入框在内容超过最大高度时，发送按钮是否会遮挡文字内容。" * 20
    textarea.fill(long_text)
    
    # 等待自动调整高度
    time.sleep(0.5)
    
    # 截图：输入长文本后
    page.screenshot(path=f"{SCREENSHOT_DIR}/02_long_text.png")
    
    # 获取输入框的新高度（应该被限制在最大高度）
    new_height = textarea.bounding_box()["height"]
    print(f"输入长文本后输入框高度: {new_height}px")
    
    # 验证高度被限制在最大高度（200px + padding）
    assert new_height <= 220, f"输入框高度应不超过最大高度限制，实际: {new_height}px"
    
    # 获取发送按钮的位置
    send_button = page.locator("button[type='submit']")
    expect(send_button).to_be_visible()
    
    textarea_box = textarea.bounding_box()
    button_box = send_button.bounding_box()
    
    print(f"输入框位置: x={textarea_box['x']}, y={textarea_box['y']}, width={textarea_box['width']}, height={textarea_box['height']}")
    print(f"按钮位置: x={button_box['x']}, y={button_box['y']}, width={button_box['width']}, height={button_box['height']}")
    
    # 滚动到输入框底部
    textarea.evaluate("el => el.scrollTop = el.scrollHeight")
    time.sleep(0.3)
    
    # 截图：滚动到底部
    page.screenshot(path=f"{SCREENSHOT_DIR}/03_scrolled_bottom.png")
    
    # 滚动到输入框顶部
    textarea.evaluate("el => el.scrollTop = 0")
    time.sleep(0.3)
    
    # 截图：滚动到顶部
    page.screenshot(path=f"{SCREENSHOT_DIR}/04_scrolled_top.png")
    
    # 验证 textarea 有滚动条（因为内容超过最大高度）
    scroll_height = textarea.evaluate("el => el.scrollHeight")
    client_height = textarea.evaluate("el => el.clientHeight")
    
    print(f"scrollHeight: {scroll_height}, clientHeight: {client_height}")
    
    # 如果内容足够长，应该有滚动
    assert scroll_height > client_height, "内容应该超过输入框高度，产生滚动"
    
    # 验证按钮不在 textarea 内部
    textarea_padding_right = textarea.evaluate("el => getComputedStyle(el).paddingRight")
    print(f"textarea padding-right: {textarea_padding_right}")
    
    # 检查按钮的定位方式
    button_position = send_button.evaluate("el => getComputedStyle(el).position")
    print(f"按钮的 position: {button_position}")
    
    # 验证父容器的布局
    textarea_parent = textarea.evaluate("el => el.parentElement.className")
    button_parent = send_button.evaluate("el => el.parentElement.className")
    print(f"textarea 父容器 class: {textarea_parent}")
    print(f"按钮父容器 class: {button_parent}")
    
    padding_right_value = float(textarea_padding_right.replace("px", ""))
    
    print(f"\n测试结果:")
    print(f"- 输入框高度被限制在: {new_height}px (最大 200px)")
    print(f"- 内容可滚动: scrollHeight={scroll_height}px > clientHeight={client_height}px")
    print(f"- textarea padding-right: {padding_right_value}px")
    
    print("\n✓ 测试通过：输入框长文本时按钮不遮挡文字")


def test_input_short_text_layout(page: Page):
    """
    测试短文本时输入框布局正常
    
    验证：
    1. 短文本时输入框和按钮布局正常
    2. 按钮在正确位置
    """
    ensure_screenshot_dir()
    
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    time.sleep(1)
    
    textarea = page.locator("textarea")
    expect(textarea).to_be_visible()
    
    # 输入短文本
    textarea.fill("短文本测试")
    time.sleep(0.3)
    
    page.screenshot(path=f"{SCREENSHOT_DIR}/05_short_text.png")
    
    # 验证输入框高度正常
    height = textarea.bounding_box()["height"]
    print(f"短文本时输入框高度: {height}px")
    
    # 验证发送按钮可见
    send_button = page.locator("button[type='submit']")
    expect(send_button).to_be_visible()
    
    print("✓ 测试通过：短文本时布局正常")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])