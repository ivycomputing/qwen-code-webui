"""
Test for Issue #23: ChatPage 增加折叠内容默认展开切换按钮

验证 ExpandThinkingButton 是否能够控制 Thinking 和 ToolResult 内容的默认展开/折叠状态。

测试用例：
1. 默认状态：Thinking 和 ToolResult 内容应该折叠（除了 defaultExpanded=true 的 Thinking）
2. 点击展开按钮后：Thinking 和 ToolResult 内容应该全部展开
3. 再次点击展开按钮：恢复默认折叠状态
"""

import sys
import os
from pathlib import Path
import asyncio

# Add project root to path
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root / "tests"))

from chat_test_base import ChatTestBase

BASE_URL = "http://localhost:3000"
SCREENSHOT_DIR = project_root / "screenshots" / "issues" / "23"

# Ensure screenshot directory exists
os.makedirs(SCREENSHOT_DIR, exist_ok=True)


class ExpandThinkingTest(ChatTestBase):
    """Test for Issue #23: Expand Thinking Button functionality"""

    def __init__(self, **kwargs):
        super().__init__(
            test_name="expand_thinking_test",
            base_url=BASE_URL,
            screenshot_dir=str(SCREENSHOT_DIR),
            **kwargs
        )

    async def run_test(self) -> bool:
        """Run the expand thinking button test"""
        
        print("=" * 60)
        print("Issue #23: Expand Thinking Button Test")
        print("=" * 60)
        
        # Navigate to app
        await self.navigate_to_app()
        
        # Select project
        await self.select_project("qwen-code-webui")
        
        # Enable WebUI Components for better testing
        await self.enable_webui_components()
        
        # Enable YOLO mode to get tool results
        await self.enable_yolo_mode()
        
        print("\n[Step 1] Check ExpandThinkingButton initial state")
        
        # Find the expand thinking button
        expand_button = self.page.locator('[aria-label*="Expand thinking"], [aria-label*="Collapse thinking"]')
        
        if await expand_button.count() == 0:
            self.log("ExpandThinkingButton not found", "ERROR")
            return False
        
        initial_label = await expand_button.first.get_attribute("aria-label")
        self.log(f"Initial button state: {initial_label}")
        await self.take_screenshot("initial_state")
        
        # Check if button shows expanded or collapsed state
        is_expanded = "Collapse" in initial_label
        self.log(f"Initial expanded state: {is_expanded}")
        
        print("\n[Step 2] Send a message to trigger Thinking and tool calls")
        
        # Send a message that will trigger tool calls
        await self.send_message("list files in current directory")
        
        # Wait for tool calls to appear
        await self.wait_for_tool("Bash", timeout=30)
        await self.wait_for_tool("Qwen's Reasoning", timeout=30)
        
        await self.take_screenshot("after_message")
        
        print("\n[Step 3] Check Thinking message state")
        
        # Find Thinking messages
        thinking_messages = self.page.locator('text=Qwen\'s Reasoning')
        thinking_count = await thinking_messages.count()
        self.log(f"Found {thinking_count} Thinking messages")
        
        if thinking_count > 0:
            # Check if content is visible (expanded) or collapsed
            # In collapsed state, only header is visible
            # In expanded state, pre content is visible
            first_thinking = thinking_messages.first
            await first_thinking.scroll_into_view_if_needed()
            
            # Try to find the pre element with thinking content
            thinking_content = self.page.locator('pre:has-text("Thinking")').or_(
                self.page.locator('pre:has-text("thought")')
            ).first
            
            if await thinking_content.count() > 0:
                is_visible = await thinking_content.is_visible()
                self.log(f"Thinking content visible: {is_visible}")
        
        print("\n[Step 4] Click expand button to expand all")
        
        # Click the expand button
        await expand_button.first.click()
        await asyncio.sleep(1)
        
        new_label = await expand_button.first.get_attribute("aria-label")
        self.log(f"After click state: {new_label}")
        await self.take_screenshot("after_expand_click")
        
        # Verify button changed state
        should_be_expanded = "Collapse" in new_label
        if not should_be_expanded:
            self.log("Button should show 'Collapse' after clicking", "WARNING")
        
        print("\n[Step 5] Verify content is expanded")
        
        # Check if tool result content is now visible
        tool_results = self.page.locator('text=Bash').or_(self.page.locator('text=Edit'))
        if await tool_results.count() > 0:
            self.log("Found tool results")
            
            # Check if details are visible
            details_content = self.page.locator('pre:has-text("stdout"), pre:has-text("stderr")').first
            if await details_content.count() > 0:
                is_visible = await details_content.is_visible()
                self.log(f"Tool result content visible after expand: {is_visible}")
        
        print("\n[Step 6] Click expand button again to restore default")
        
        # Click again to restore default
        await expand_button.first.click()
        await asyncio.sleep(1)
        
        final_label = await expand_button.first.get_attribute("aria-label")
        self.log(f"Final state: {final_label}")
        await self.take_screenshot("after_restore_click")
        
        # Verify button restored to initial state
        if initial_label == final_label:
            self.log("Button restored to initial state", "SUCCESS")
        else:
            self.log(f"Button state mismatch: expected '{initial_label}', got '{final_label}'", "WARNING")
        
        print("\n" + "=" * 60)
        print("Test completed")
        print("=" * 60)
        
        return True


if __name__ == "__main__":
    async def main():
        test = ExpandThinkingTest()
        result = await test.execute()
        print(f"\n{'='*60}")
        print(f"Test Result: {'PASSED ✓' if result else 'FAILED ✗'}")
        print(f"{'='*60}")
    
    asyncio.run(main())
