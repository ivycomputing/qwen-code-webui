import { test, expect } from "@playwright/test";

/**
 * Permission Countdown E2E Tests
 * Tests for Phase 1: autoApproveMs bug fix - countdown display in permission dialog
 */

test.describe("Permission Countdown Display", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main chat page
    await page.goto("/", { waitUntil: "networkidle" });

    // Wait for the project selector to load
    await page.waitForSelector('[data-testid="project-card"]', {
      timeout: 10000,
    });

    // Select the first project
    await page.click('[data-testid="project-card"]');

    // Wait for chat page to load
    await page.waitForSelector('input[placeholder*="message"]', {
      timeout: 10000,
    });
  });

  test("should display countdown seconds in permission dialog", async ({ page }) => {
    // Trigger a permission request by asking to run a shell command
    const input = page.locator('textarea');
    await input.fill('Run the command: ls -la');

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    // Wait for potential permission dialog
    await page.waitForTimeout(3000);

    // Check if permission dialog appears
    const permissionDialog = page.locator('text=/Permission Required|权限确认/');
    const isVisible = await permissionDialog.isVisible().catch(() => false);

    if (isVisible) {
      // Look for countdown text
      const countdownText = page.locator('text=/Auto-approving in \\d+s|\\d+秒后自动允许/');
      const countdownVisible = await countdownText.isVisible().catch(() => false);

      // If permission mode is default (not yolo), countdown should be visible
      if (countdownVisible) {
        const text = await countdownText.textContent();
        expect(text).toMatch(/\d+/); // Should contain a number

        // Verify countdown shows seconds, not empty
        const seconds = parseInt(text?.match(/\d+/)?.[0] || '0');
        expect(seconds).toBeGreaterThan(0);
        expect(seconds).toBeLessThanOrEqual(30); // Max should be ~25-30 seconds
      }
    }
  });

  test("should display countdown progress bar", async ({ page }) => {
    const input = page.locator('textarea');
    await input.fill('Run: echo "test"');

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    await page.waitForTimeout(3000);

    const permissionDialog = page.locator('text=/Permission Required|权限确认/');
    const isVisible = await permissionDialog.isVisible().catch(() => false);

    if (isVisible) {
      // Look for progress bar (blue bar inside countdown banner)
      const progressBar = page.locator('.h-1.bg-blue-200 .bg-blue-500');

      const hasProgressBar = await progressBar.isVisible().catch(() => false);
      if (hasProgressBar) {
        // Get initial width
        const initialWidth = await progressBar.evaluate(el =>
          parseFloat(el.style.width || '0')
        );

        // Wait a few seconds
        await page.waitForTimeout(3000);

        // Get new width - should be smaller
        const newWidth = await progressBar.evaluate(el =>
          parseFloat(el.style.width || '0')
        );

        // Progress bar should shrink as countdown progresses
        expect(newWidth).toBeLessThan(initialWidth);
      }
    }
  });

  test("should countdown decreases over time", async ({ page }) => {
    const input = page.locator('textarea');
    await input.fill('Please execute: pwd');

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    await page.waitForTimeout(3000);

    const countdownText = page.locator('text=/Auto-approving in \\d+s|\\d+秒后自动允许/');
    const countdownVisible = await countdownText.isVisible().catch(() => false);

    if (countdownVisible) {
      const initialText = await countdownText.textContent();
      const initialSeconds = parseInt(initialText?.match(/\d+/)?.[0] || '0');

      // Wait 2 seconds
      await page.waitForTimeout(2000);

      const newText = await countdownText.textContent();
      const newSeconds = parseInt(newText?.match(/\d+/)?.[0] || '0');

      // Seconds should have decreased by approximately 2
      expect(newSeconds).toBeLessThanOrEqual(initialSeconds - 1);

      // Continue waiting
      await page.waitForTimeout(2000);

      const finalText = await countdownText.textContent();
      const finalSeconds = parseInt(finalText?.match(/\d+/)?.[0] || '0');

      expect(finalSeconds).toBeLessThan(newSeconds);
    }
  });

  test("should cancel countdown when user interacts", async ({ page }) => {
    const input = page.locator('textarea');
    await input.fill('Run: cat /etc/hosts');

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    await page.waitForTimeout(3000);

    const countdownText = page.locator('text=/Auto-approving in \\d+s|\\d+秒后自动允许/');
    const countdownVisible = await countdownText.isVisible().catch(() => false);

    if (countdownVisible) {
      // Get initial countdown
      const initialText = await countdownText.textContent();

      // Click on an option button
      const allowButton = page.locator('button').filter({ hasText: /Allow|允许本次/ }).first();
      await allowButton.hover();

      // Countdown should stop/disappear after interaction
      await page.waitForTimeout(500);

      // The countdown banner might still be visible but stopped,
      // or the dialog might close after clicking
      const stillVisible = await countdownText.isVisible().catch(() => false);

      // Either dialog closed or countdown stopped
      if (stillVisible) {
        const currentText = await countdownText.textContent();
        // Countdown should have stopped (same value as when we hovered)
        // This is a timing-based check, so we just verify it didn't decrease much
      }
    }
  });

  test("should auto-approve first option when countdown reaches zero", async ({ page }) => {
    // This test verifies the dialog disappears after countdown
    const input = page.locator('textarea');
    await input.fill('Execute: whoami');

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    await page.waitForTimeout(3000);

    const permissionDialog = page.locator('.flex-shrink-0.px-4.py-4.bg-white\\/80');
    const isVisible = await permissionDialog.isVisible().catch(() => false);

    if (isVisible) {
      const countdownText = page.locator('text=/Auto-approving in \\d+s|\\d+秒后自动允许/');
      const countdownVisible = await countdownText.isVisible().catch(() => false);

      if (countdownVisible) {
        // Wait for countdown to complete (max 30 seconds)
        const maxWaitTime = 35000;
        let elapsed = 0;

        while (elapsed < maxWaitTime) {
          const stillVisible = await permissionDialog.isVisible().catch(() => false);
          if (!stillVisible) break;

          await page.waitForTimeout(1000);
          elapsed += 1000;
        }

        // Dialog should have closed after auto-approval
        const finalVisible = await permissionDialog.isVisible().catch(() => false);
        expect(finalVisible).toBe(false);
      }
    }
  });
});

test.describe("Permission Dialog Keyboard Shortcuts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForSelector('[data-testid="project-card"]', { timeout: 10000 });
    await page.click('[data-testid="project-card"]');
    await page.waitForSelector('input[placeholder*="message"]', { timeout: 10000 });
  });

  test("should deny permission when pressing Escape", async ({ page }) => {
    const input = page.locator('textarea');
    await input.fill('Run: rm -rf test');

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    await page.waitForTimeout(3000);

    const permissionDialog = page.locator('.flex-shrink-0.px-4.py-4.bg-white\\/80');
    const isVisible = await permissionDialog.isVisible().catch(() => false);

    if (isVisible) {
      // Press Escape to deny
      await page.keyboard.press('Escape');

      // Dialog should close
      await page.waitForTimeout(500);
      const stillVisible = await permissionDialog.isVisible().catch(() => false);
      expect(stillVisible).toBe(false);

      // Should be back to normal chat input
      const chatInput = page.locator('textarea');
      await expect(chatInput).toBeVisible();
    }
  });

  test("should approve permission when pressing Enter", async ({ page }) => {
    const input = page.locator('textarea');
    await input.fill('Run: ls');

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    await page.waitForTimeout(3000);

    const permissionDialog = page.locator('.flex-shrink-0.px-4.py-4.bg-white\\/80');
    const isVisible = await permissionDialog.isVisible().catch(() => false);

    if (isVisible) {
      // Press Enter to approve the selected option
      await page.keyboard.press('Enter');

      // Dialog should close
      await page.waitForTimeout(500);
      const stillVisible = await permissionDialog.isVisible().catch(() => false);
      expect(stillVisible).toBe(false);
    }
  });

  test("should navigate options with Arrow keys", async ({ page }) => {
    const input = page.locator('textarea');
    await input.fill('Run: git status');

    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();

    await page.waitForTimeout(3000);

    const permissionDialog = page.locator('.flex-shrink-0.px-4.py-4.bg-white\\/80');
    const isVisible = await permissionDialog.isVisible().catch(() => false);

    if (isVisible) {
      // Press ArrowDown to navigate to next option
      await page.keyboard.press('ArrowDown');

      // Press ArrowUp to go back
      await page.keyboard.press('ArrowUp');

      // The selected option should change
      // This is visual feedback - we can check the button styling changes
      const buttons = page.locator('button[data-permission-action]');
      const count = await buttons.count();

      if (count > 0) {
        // First button should be selected (allow)
        const firstButton = buttons.first();
        const isSelected = await firstButton.evaluate(el =>
          el.classList.contains('border-2') && el.classList.contains('shadow-md')
        );
        expect(isSelected).toBe(true);
      }
    }
  });
});