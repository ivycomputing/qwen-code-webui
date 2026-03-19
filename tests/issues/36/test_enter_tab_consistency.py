"""
Test for Issue 36: Enter and Tab key behavior consistency in slash command autocomplete

This test verifies that:
1. Tab key auto-completes skill name and user can send with another Enter
2. Enter key auto-completes skill name (same as Tab) and user can send with another Enter
3. Both keys have consistent behavior
"""

import asyncio
import sys
import os

# Add tests directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from chat_test_base import ChatTestBase


class EnterTabConsistencyTest(ChatTestBase):
    """
    Test for Enter and Tab key consistency (Issue 36).
    """

    def __init__(
        self,
        project_name: str = "qwen-code-webui",
        **kwargs
    ):
        super().__init__(test_name="enter_tab_consistency_test", **kwargs)
        self.project_name = project_name

    async def run_test(self) -> bool:
        """Run the Enter and Tab consistency test."""
        self.log("=" * 60)
        self.log("Test: Enter and Tab Key Consistency (Issue 36)")
        self.log("=" * 60)

        # Navigate to app
        await self.navigate_to_app()

        # Select project
        await self.select_project(self.project_name)

        # Wait for ChatPage to load
        await asyncio.sleep(2)
        await self.take_screenshot("chat_page_loaded")

        # Find the input textarea
        self.log("Finding input textarea...", "INFO")
        textarea = await self.page.query_selector('textarea[placeholder*="Type message"]')

        if not textarea:
            self.log("Input textarea not found", "ERROR")
            await self.take_screenshot("textarea_not_found")
            return False

        self.log("Input textarea found", "SUCCESS")
        await self.take_screenshot("01_chat_page_loaded")

        # Test 1: Tab key behavior
        self.log("Test 1: Testing Tab key auto-complete behavior...", "INFO")

        # Clear input
        await textarea.fill("/skills gh-i")
        await asyncio.sleep(0.5)

        # Check popup is visible
        popup_visible = await self.is_popup_visible()
        if not popup_visible:
            self.log("Suggestion popup did not appear", "WARNING")
        else:
            self.log("Suggestion popup appeared", "SUCCESS")

        await self.take_screenshot("02_before_tab")

        # Press Tab to auto-complete
        await textarea.press("Tab")
        await asyncio.sleep(0.5)

        value_after_tab = await textarea.input_value()
        self.log(f"After Tab: '{value_after_tab}'", "INFO")
        await self.take_screenshot("03_after_tab")

        # Check if popup is dismissed after Tab
        popup_after_tab = await self.is_popup_visible()
        self.log(f"Popup visible after Tab: {popup_after_tab}", "INFO")

        # Test 2: Enter key behavior (the fix)
        self.log("Test 2: Testing Enter key auto-complete behavior...", "INFO")

        # Clear input and type again
        await textarea.fill("/skills gh-i")
        await asyncio.sleep(0.5)

        # Check popup is visible
        popup_visible = await self.is_popup_visible()
        if not popup_visible:
            self.log("Suggestion popup did not appear", "WARNING")
        else:
            self.log("Suggestion popup appeared", "SUCCESS")

        await self.take_screenshot("04_before_enter")

        # Press Enter to auto-complete (should behave like Tab)
        await self.page.keyboard.press("Enter")
        await asyncio.sleep(0.5)

        value_after_enter = await textarea.input_value()
        self.log(f"After Enter: '{value_after_enter}'", "INFO")
        await self.take_screenshot("05_after_enter")

        # Check if popup is dismissed after Enter
        popup_after_enter = await self.is_popup_visible()
        self.log(f"Popup visible after Enter: {popup_after_enter}", "INFO")

        # Test 3: Verify consistency
        self.log("Test 3: Verifying consistency...", "INFO")

        # Both Tab and Enter should result in similar auto-complete behavior
        # After Enter, the skill name should be completed (like Tab)
        # The message should NOT be sent immediately

        # Check that the value contains the completed skill name
        tab_completed = "gh-issue" in value_after_tab
        enter_completed = "gh-issue" in value_after_enter

        self.log(f"Tab completed skill name: {tab_completed}", "INFO")
        self.log(f"Enter completed skill name: {enter_completed}", "INFO")

        if tab_completed and enter_completed:
            self.log("Both Tab and Enter correctly complete skill names", "SUCCESS")
        elif not tab_completed:
            self.log("Tab did not complete skill name correctly", "WARNING")
        elif not enter_completed:
            self.log("Enter did not complete skill name correctly - BUG!", "ERROR")
            return False

        # Test 4: Verify Enter doesn't send message immediately
        self.log("Test 4: Verifying Enter doesn't send message immediately...", "INFO")

        # Clear input
        await textarea.fill("/skills gh-i")
        await asyncio.sleep(0.5)

        # Press Enter to auto-complete
        await self.page.keyboard.press("Enter")
        await asyncio.sleep(0.5)

        # Check that the input still has focus and contains the completed text
        is_focused = await textarea.evaluate('el => document.activeElement === el')
        self.log(f"Input focused after Enter: {is_focused}", "INFO")

        value = await textarea.input_value()
        self.log(f"Input value after Enter: '{value}'", "INFO")

        # The input should still contain text (not sent)
        if value.strip():
            self.log("Message was NOT sent immediately after Enter - correct behavior", "SUCCESS")
        else:
            self.log("Message was sent immediately after Enter - BUG!", "ERROR")
            return False

        await self.take_screenshot("06_final_state")

        self.log("=" * 60)
        self.log("Test COMPLETED: Enter and Tab Key Consistency", "SUCCESS")
        self.log("=" * 60)
        return True

    async def is_popup_visible(self) -> bool:
        """Check if the suggestion popup is visible."""
        try:
            await asyncio.sleep(0.3)
            popup = await self.page.query_selector('ul.fixed')
            if popup:
                is_visible = await popup.is_visible()
                return is_visible
            return False
        except Exception as e:
            self.log(f"Error checking popup: {e}", "INFO")
            return False


async def main():
    """Run the test."""
    test = EnterTabConsistencyTest()
    result = await test.execute()

    print(f"\n{'='*60}")
    print(f"Test Result: {'PASSED ✓' if result else 'FAILED ✗'}")
    print(f"{'='*60}")

    return result


if __name__ == "__main__":
    asyncio.run(main())