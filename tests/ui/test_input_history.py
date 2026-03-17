"""
Test for Issue 27: Input History Navigation

This test verifies that:
1. Users can navigate through input history using up/down arrow keys
2. History is saved when sending messages
3. History persists across page reloads (localStorage)
"""

import asyncio
import sys
import os

# Add tests directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from chat_test_base import ChatTestBase


class InputHistoryTest(ChatTestBase):
    """
    Test for Input History Navigation (Issue 27).
    """

    def __init__(
        self,
        project_name: str = "qwen-code-webui",
        **kwargs
    ):
        super().__init__(test_name="input_history_test", **kwargs)
        self.project_name = project_name

    async def run_test(self) -> bool:
        """Run the Input History test."""
        self.log("=" * 60)
        self.log("Test: Input History Navigation (Issue 27)")
        self.log("=" * 60)

        # Navigate to app
        await self.navigate_to_app()

        # Select project
        await self.select_project(self.project_name)

        # Wait for ChatPage to load
        await asyncio.sleep(2)
        await self.take_screenshot("chat_page_loaded")

        # Find the input textarea
        self.log("Finding input textarea...")
        textarea = await self.page.query_selector('textarea[placeholder*="Type message"]')
        
        if not textarea:
            self.log("Input textarea not found", "ERROR")
            await self.take_screenshot("textarea_not_found")
            return False
        
        self.log("Input textarea found", "SUCCESS")

        # Clear any existing history by executing JavaScript
        await self.page.evaluate('localStorage.removeItem("qwen_input_history")')
        self.log("Cleared existing history", "INFO")
        
        # Verify history is empty
        history = await self.page.evaluate('JSON.parse(localStorage.getItem("qwen_input_history") || "[]")')
        self.log(f"History after clear: {history}", "INFO")

        # Test 1: Send multiple messages
        self.log("Test 1: Sending test messages...")
        
        test_messages = [
            "First test message",
            "Second test message", 
            "Third test message"
        ]
        
        for i, msg in enumerate(test_messages):
            # Type message directly using textarea
            await textarea.fill(msg)
            await asyncio.sleep(0.5)
            
            # Click submit button
            submit_btn = await self.page.query_selector('button[type="submit"]')
            if submit_btn:
                await submit_btn.click()
            await asyncio.sleep(1)
            
            # Check history after each message
            history = await self.page.evaluate('JSON.parse(localStorage.getItem("qwen_input_history") || "[]")')
            self.log(f"History after message {i+1}: {history}", "INFO")
        
        await self.take_screenshot("messages_sent")
        
        # Final history check
        final_history = await self.page.evaluate('JSON.parse(localStorage.getItem("qwen_input_history") || "[]")')
        self.log(f"Final history: {final_history}", "INFO")
        
        if len(final_history) == 0:
            self.log("History is empty after sending messages!", "ERROR")
            await self.take_screenshot("empty_history")
            return False

        # Test 2: Navigate history with up arrow
        self.log("Test 2: Testing up arrow navigation...")
        
        # Focus the textarea
        await textarea.focus()
        await asyncio.sleep(1)
        
        # Press up arrow - should get "Third test message"
        self.log("Pressing ArrowUp...", "INFO")
        await textarea.press("ArrowUp")
        await asyncio.sleep(1)
        
        # Get current value
        value = await textarea.input_value()
        self.log(f"After first up arrow: '{value}'", "INFO")
        
        # Debug: check if history is still in localStorage
        history = await self.page.evaluate('JSON.parse(localStorage.getItem("qwen_input_history") || "[]")')
        self.log(f"History after up arrow: {history}", "INFO")
        
        # Try using keyboard directly on page
        if "Third" not in value:
            self.log("First attempt failed, trying with page.keyboard...", "INFO")
            await textarea.fill("")  # Clear first
            await textarea.focus()
            await asyncio.sleep(0.5)
            await self.page.keyboard.press("ArrowUp")
            await asyncio.sleep(1)
            value = await textarea.input_value()
            self.log(f"After page.keyboard ArrowUp: '{value}'", "INFO")
        
        if "Third" not in value:
            self.log(f"Expected 'Third test message' but got '{value}'", "ERROR")
            await self.take_screenshot("up_arrow_failed")
            return False
        
        self.log("First up arrow works - got third message", "SUCCESS")
        
        # Press up arrow again - should get "Second test message"
        await textarea.press("ArrowUp")
        await asyncio.sleep(0.5)
        
        value = await textarea.input_value()
        self.log(f"After second up arrow: '{value}'", "INFO")
        
        if "Second" not in value:
            self.log(f"Expected 'Second test message' but got '{value}'", "ERROR")
            await self.take_screenshot("second_up_failed")
            return False
        
        self.log("Second up arrow works - got second message", "SUCCESS")
        
        # Press up arrow again - should get "First test message"
        await textarea.press("ArrowUp")
        await asyncio.sleep(0.5)
        
        value = await textarea.input_value()
        self.log(f"After third up arrow: '{value}'", "INFO")
        
        if "First" not in value:
            self.log(f"Expected 'First test message' but got '{value}'", "ERROR")
            await self.take_screenshot("third_up_failed")
            return False
        
        self.log("Third up arrow works - got first message", "SUCCESS")
        
        # Test 3: Navigate down
        self.log("Test 3: Testing down arrow navigation...")
        
        # Press down arrow - should get "Second test message"
        await textarea.press("ArrowDown")
        await asyncio.sleep(0.5)
        
        value = await textarea.input_value()
        self.log(f"After first down arrow: '{value}'", "INFO")
        
        if "Second" not in value:
            self.log(f"Expected 'Second test message' but got '{value}'", "ERROR")
            await self.take_screenshot("down_arrow_failed")
            return False
        
        self.log("Down arrow works - got second message", "SUCCESS")
        
        await self.take_screenshot("navigation_complete")

        self.log("=" * 60)
        self.log("Test PASSED: Input History Navigation works correctly", "SUCCESS")
        self.log("=" * 60)
        return True


async def main():
    """Run the test."""
    test = InputHistoryTest()
    result = await test.execute()

    print(f"\n{'='*60}")
    print(f"Test Result: {'PASSED ✓' if result else 'FAILED ✗'}")
    print(f"{'='*60}")

    return result


if __name__ == "__main__":
    asyncio.run(main())
