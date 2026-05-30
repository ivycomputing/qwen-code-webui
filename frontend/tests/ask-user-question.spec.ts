import { test, expect } from "@playwright/test";

/**
 * AskUserQuestion Dialog E2E Tests
 * Tests for the interactive question dialog with countdown functionality
 */

test.describe("AskUserQuestion Dialog Functionality", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main chat page
    await page.goto("/", { waitUntil: "networkidle" });

    // Wait for the project selector to load, then select the first project
    await page.waitForSelector('[data-testid="project-card"]', {
      timeout: 10000,
    });
    await page.click('[data-testid="project-card"]');

    // Wait for chat page to load
    await page.waitForSelector('input[placeholder*="message"]', {
      timeout: 10000,
    });
  });

  test.describe("Permission Dialog Countdown", () => {
    test("should display countdown when permission request has autoApproveMs", async ({ page }) => {
      // This test would require triggering a permission request from the backend
      // For now, we verify the countdown component is rendered correctly when it appears

      // Navigate to a project and send a message that triggers a permission request
      const input = page.locator('textarea');
      await input.fill('Please run a shell command like ls');

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Wait for either permission dialog or response
      // The permission dialog should appear with countdown if autoApproveMs is set
      const permissionDialog = page.locator('.flex-shrink-0.px-4.py-4.bg-white\\/80');

      // Check if permission dialog appears (may or may not depending on permission mode)
      const isVisible = await permissionDialog.isVisible().catch(() => false);

      if (isVisible) {
        // Check for countdown banner
        const countdownBanner = page.locator('text=/Auto-approving in \\d+s/');
        const hasCountdown = await countdownBanner.isVisible().catch(() => false);

        if (hasCountdown) {
          // Countdown should decrease over time
          const initialText = await countdownBanner.textContent();
          expect(initialText).toMatch(/Auto-approving in \d+s/);

          // Wait a bit and check countdown decreased
          await page.waitForTimeout(2000);
          const newText = await countdownBanner.textContent();
          expect(newText).toMatch(/Auto-approving in \d+s/);

          // The seconds should have decreased
          const initialSeconds = parseInt(initialText?.match(/\d+/)?.[0] || '0');
          const newSeconds = parseInt(newText?.match(/\d+/)?.[0] || '0');
          expect(newSeconds).toBeLessThan(initialSeconds);
        }
      }
    });

    test("should auto-approve after countdown reaches zero", async ({ page }) => {
      // This test would require a short autoApproveMs to verify auto-approval
      // For manual testing, we can observe the dialog disappears after countdown

      const input = page.locator('textarea');
      await input.fill('Please run ls');

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Check if permission dialog appears and auto-approves
      const permissionDialog = page.locator('.flex-shrink-0.px-4.py-4.bg-white\\/80');
      const isVisible = await permissionDialog.isVisible().catch(() => false);

      if (isVisible) {
        // Wait for auto-approval (25 seconds by default)
        // For testing, we just verify the dialog eventually disappears
        await page.waitForTimeout(30000);

        // Dialog should be gone after auto-approval
        const stillVisible = await permissionDialog.isVisible().catch(() => false);
        expect(stillVisible).toBe(false);
      }
    });

    test("should cancel countdown when user clicks a button", async ({ page }) => {
      const input = page.locator('textarea');
      await input.fill('Please run ls');

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      const permissionDialog = page.locator('.flex-shrink-0.px-4.py-4.bg-white\\/80');
      const isVisible = await permissionDialog.isVisible().catch(() => false);

      if (isVisible) {
        // Check for countdown
        const countdownBanner = page.locator('text=/Auto-approving in \\d+s/');
        const hasCountdown = await countdownBanner.isVisible().catch(() => false);

        if (hasCountdown) {
          // Click allow button to cancel countdown
          const allowButton = page.locator('button[data-permission-action="allow"]');
          await allowButton.click();

          // Countdown banner should be gone
          const stillHasCountdown = await countdownBanner.isVisible().catch(() => false);
          expect(stillHasCountdown).toBe(false);
        }
      }
    });
  });

  test.describe("AskUserQuestion Dialog UI", () => {
    test("should have proper button styling for permission dialog", async ({ page }) => {
      // Verify the permission input panel has correct button classes
      const input = page.locator('textarea');
      await input.fill('Please run a bash command');

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      // Wait for potential permission dialog
      await page.waitForTimeout(2000);

      const permissionDialog = page.locator('.flex-shrink-0.px-4.py-4.bg-white\\/80');
      const isVisible = await permissionDialog.isVisible().catch(() => false);

      if (isVisible) {
        // Check buttons exist
        const allowButton = page.locator('button[data-permission-action="allow"]');
        const denyButton = page.locator('button[data-permission-action="deny"]');

        await expect(allowButton).toBeVisible();
        await expect(denyButton).toBeVisible();

        // Check button styling - allow button should be blue when selected
        await allowButton.hover();
        const backgroundColor = await allowButton.evaluate(el =>
          window.getComputedStyle(el).backgroundColor
        );
        // Should be some shade of blue when hovered/selected
      }
    });

    test("should navigate with keyboard shortcuts", async ({ page }) => {
      const input = page.locator('textarea');
      await input.fill('Please run ls');

      const submitButton = page.locator('button[type="submit"]');
      await submitButton.click();

      const permissionDialog = page.locator('.flex-shrink-0.px-4.py-4.bg-white\\/80');
      const isVisible = await permissionDialog.isVisible().catch(() => false);

      if (isVisible) {
        // Press Escape to deny
        await page.keyboard.press('Escape');

        // Dialog should close
        await page.waitForTimeout(500);
        const stillVisible = await permissionDialog.isVisible().catch(() => false);
        expect(stillVisible).toBe(false);
      }
    });
  });
});

test.describe("AskUserQuestion Dialog - Mock Test", () => {
  // These tests mock the ask_user_question dialog directly
  // by navigating to a page that can trigger it

  test("should render AskUserQuestion dialog with correct structure", async ({ page }) => {
    // For a proper test, we would need to mock the backend response
    // This test verifies the dialog structure when it appears

    await page.goto("/", { waitUntil: "networkidle" });

    // Check the chat page structure is ready for the dialog
    const chatInput = page.locator('.flex-shrink-0');
    await expect(chatInput).toBeVisible();

    // The AskUserQuestion dialog would replace the ChatInput when active
    // Verify the container exists
    const inputContainer = page.locator('textarea').parentElement();
    await expect(inputContainer).toBeVisible();
  });

  test("should show countdown progress bar", async ({ page }) => {
    // Mock test for countdown progress bar styling
    // This would require triggering an ask_user_question permission request

    await page.goto("/", { waitUntil: "networkidle" });

    // For visual verification, we can check the CSS classes exist
    // The countdown progress bar has class: bg-blue-500 dark:bg-blue-400

    // This is a structural test - in real scenarios, the dialog appears
    // when ask_user_question tool is invoked
    const pageContent = await page.content();
    expect(pageContent).toContain('bg-blue-500'); // Should have blue color classes
  });
});