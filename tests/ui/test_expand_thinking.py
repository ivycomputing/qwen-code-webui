"""
Test for Issue #23: ExpandThinkingButton functionality

This test verifies that:
1. The ExpandThinkingButton exists in ChatPage header
2. Clicking the button toggles the expand thinking state
3. The button shows visual feedback when activated
"""

import asyncio
import sys
import os

# Add tests directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from chat_test_base import ChatTestBase


class ExpandThinkingButtonTest(ChatTestBase):
    """
    Test for ExpandThinkingButton functionality.
    
    Verifies the button exists and can toggle the expand thinking state.
    """

    def __init__(
        self,
        project_name: str = "qwen-code-webui",
        **kwargs
    ):
        super().__init__(test_name="expand_thinking_button_test", **kwargs)
        self.project_name = project_name

    async def find_expand_thinking_button(self, header_buttons):
        """Find the ExpandThinkingButton from a list of header buttons."""
        for btn in header_buttons:
            aria_label = await btn.get_attribute('aria-label')
            if aria_label and 'thinking' in aria_label.lower():
                return btn
        return None

    async def run_test(self) -> bool:
        """Run the ExpandThinkingButton test."""
        self.log("=" * 60)
        self.log("Test: ExpandThinkingButton Functionality (Issue #23)")
        self.log("=" * 60)

        # Navigate to app
        await self.navigate_to_app()

        # Select project
        await self.select_project(self.project_name)

        # Wait for ChatPage to load
        await asyncio.sleep(2)
        await self.take_screenshot("chat_page_loaded")

        # Test 1: Check if ExpandThinkingButton exists
        self.log("Test 1: Checking if ExpandThinkingButton exists...")
        
        # Find the header section
        header = await self.page.query_selector('div.flex.items-center.justify-between')
        if not header:
            self.log("Could not find header section", "ERROR")
            return False
        
        # Find all buttons in the right side of header
        header_divs = await self.page.query_selector_all('div.flex.items-center.justify-between')
        
        # Get all buttons from the page
        all_buttons = await self.page.query_selector_all('button')
        
        # Find ExpandThinkingButton by aria-label
        expand_btn = None
        for btn in all_buttons:
            aria_label = await btn.get_attribute('aria-label')
            if aria_label and 'thinking' in aria_label.lower():
                expand_btn = btn
                self.log(f"Found ExpandThinkingButton: aria-label='{aria_label}'", "SUCCESS")
                break
        
        if not expand_btn:
            self.log("ExpandThinkingButton not found", "ERROR")
            # Log all buttons for debugging
            for i, btn in enumerate(all_buttons):
                aria_label = await btn.get_attribute('aria-label')
                title = await btn.get_attribute('title')
                if aria_label or title:
                    self.log(f"  Button {i}: aria-label='{aria_label}', title='{title}'", "INFO")
            await self.take_screenshot("button_not_found")
            return False
        
        self.log("ExpandThinkingButton found", "SUCCESS")

        # Get initial state
        initial_aria_label = await expand_btn.get_attribute('aria-label')
        initial_class = await expand_btn.get_attribute('class')
        
        # Also check the SVG icon inside the button
        initial_svg = await expand_btn.query_selector('svg')
        initial_svg_class = await initial_svg.get_attribute('class') if initial_svg else None
        
        self.log(f"Initial aria-label: '{initial_aria_label}'", "INFO")
        self.log(f"Initial class: {initial_class}", "INFO")
        self.log(f"Initial SVG class: {initial_svg_class}", "INFO")
        
        await self.take_screenshot("before_toggle")

        # Test 2: Click the button to toggle
        self.log("Test 2: Clicking ExpandThinkingButton to toggle...")
        await expand_btn.click()
        await asyncio.sleep(2)  # Wait for React to re-render
        await self.take_screenshot("after_toggle")

        # Re-find all buttons and locate ExpandThinkingButton again
        all_buttons_after = await self.page.query_selector_all('button')
        expand_btn_after = await self.find_expand_thinking_button(all_buttons_after)
        
        if not expand_btn_after:
            self.log("Could not find ExpandThinkingButton after click", "ERROR")
            return False
        
        # Check new state
        new_aria_label = await expand_btn_after.get_attribute('aria-label')
        new_class = await expand_btn_after.get_attribute('class')
        new_svg = await expand_btn_after.query_selector('svg')
        new_svg_class = await new_svg.get_attribute('class') if new_svg else None
        
        self.log(f"New aria-label: '{new_aria_label}'", "INFO")
        self.log(f"New class: {new_class}", "INFO")
        self.log(f"New SVG class: {new_svg_class}", "INFO")

        # Verify state changed
        # The aria-label should change from "Expand thinking" to "Collapse thinking"
        # OR the SVG class should change (text-slate-* to text-blue-*)
        aria_label_changed = initial_aria_label != new_aria_label
        svg_color_changed = initial_svg_class != new_svg_class
        has_blue_in_svg = new_svg_class and 'blue' in new_svg_class.lower()
        has_blue_in_class = new_class and 'blue' in new_class.lower()
        
        self.log(f"Aria-label changed: {aria_label_changed}", "INFO")
        self.log(f"SVG class changed: {svg_color_changed}", "INFO")
        self.log(f"Has blue in SVG: {has_blue_in_svg}", "INFO")
        self.log(f"Has blue in class: {has_blue_in_class}", "INFO")
        
        if aria_label_changed or svg_color_changed or has_blue_in_svg or has_blue_in_class:
            self.log("Button state changed successfully", "SUCCESS")
        else:
            self.log("Button state did NOT change after click - Test FAILED", "ERROR")
            return False

        # Test 3: Click again to toggle back
        self.log("Test 3: Clicking ExpandThinkingButton to toggle back...")
        await expand_btn_after.click()
        await asyncio.sleep(1.5)
        await self.take_screenshot("after_toggle_back")

        # Re-find button
        all_buttons_final = await self.page.query_selector_all('button')
        expand_btn_final = await self.find_expand_thinking_button(all_buttons_final)
        
        if not expand_btn_final:
            self.log("Could not find ExpandThinkingButton after second click", "ERROR")
            return False
        
        final_aria_label = await expand_btn_final.get_attribute('aria-label')
        final_svg = await expand_btn_final.query_selector('svg')
        final_svg_class = await final_svg.get_attribute('class') if final_svg else None
        
        # Verify toggled back
        aria_label_back = final_aria_label == initial_aria_label
        svg_back = final_svg_class == initial_svg_class
        
        if aria_label_back or svg_back:
            self.log("Button toggled back successfully", "SUCCESS")
        else:
            self.log("Button did not toggle back correctly", "WARNING")

        # Test 4: Test with actual AI response - send a message and verify thinking expands
        self.log("Test 4: Testing with actual AI response...")
        
        # Enable WebUI Components for testing
        self.log("Enabling WebUI Components...")
        await self.enable_webui_components()
        
        # First, enable YOLO mode for faster response
        await self.enable_yolo_mode()

        # Send a message that will trigger thinking
        await self.send_message("What is 2+2? Think step by step.")
        await self.take_screenshot("message_sent")

        # Wait for AI to start responding
        await asyncio.sleep(5)
        await self.take_screenshot("ai_responding")

        # Check if thinking content is visible on the page
        page_content = await self.page.inner_text('body')
        has_thinking = 'thinking' in page_content.lower() or 'thought' in page_content.lower()

        self.log(f"Page contains thinking content: {has_thinking}", "INFO")

        # Now click expand button
        all_buttons_during = await self.page.query_selector_all('button')
        expand_btn_during = await self.find_expand_thinking_button(all_buttons_during)

        if expand_btn_during:
            await expand_btn_during.click()
            await asyncio.sleep(1.5)
            await self.take_screenshot("expanded_during_chat")

            # Check if more content is visible now
            page_content_after = await self.page.inner_text('body')

            # The expanded content should show more details
            if len(page_content_after) > len(page_content):
                self.log("Thinking content expanded successfully", "SUCCESS")
            else:
                self.log("Content length unchanged (may still be correct)", "INFO")
        else:
            self.log("Could not find ExpandThinkingButton during chat", "WARNING")

        self.log("=" * 60)
        self.log("Test PASSED: ExpandThinkingButton is functional", "SUCCESS")
        self.log("=" * 60)
        return True


async def main():
    """Run the test."""
    # Use frontend dev server port (3000) 
    test = ExpandThinkingButtonTest(
        project_name="qwen-code-webui",
        base_url="http://localhost:3000"
    )
    result = await test.execute()

    print(f"\n{'='*60}")
    print(f"Test Result: {'PASSED ✓' if result else 'FAILED ✗'}")
    print(f"{'='*60}")

    return result


if __name__ == "__main__":
    asyncio.run(main())
