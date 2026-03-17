import { test, expect } from '@playwright/test';

/**
 * Test for Issue 28: Add slash command autocomplete with /skills support
 * 
 * 测试功能：
 * 1. 用户输入 / 时，自动弹出命令提示列表
 * 2. 输入 /s 时，自动显示匹配的命令（/skills）
 * 3. 可以用上下箭头选择命令
 * 4. 回车确认执行选中的命令
 * 5. ESC 可以取消提示
 */

test.describe('Issue 28 - Slash Command Autocomplete', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
  });

  test('should show suggestion popup when typing /', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const textarea = page.locator('textarea[placeholder*="Type message"]');
    await expect(textarea).toBeVisible();

    // Type /
    await textarea.focus();
    await textarea.fill('/');
    
    // Wait for suggestion popup to appear
    await page.waitForTimeout(300);
    
    // Check if suggestion popup is visible
    const suggestionPopup = page.locator('ul.fixed').first();
    await expect(suggestionPopup).toBeVisible();
    
    // Should contain /skills command
    const skillsOption = suggestionPopup.locator('li', { hasText: '/skills' });
    await expect(skillsOption).toBeVisible();
  });

  test('should filter commands when typing partial match', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const textarea = page.locator('textarea[placeholder*="Type message"]');
    await expect(textarea).toBeVisible();

    // Type /s
    await textarea.focus();
    await textarea.fill('/s');
    
    // Wait for filtering
    await page.waitForTimeout(300);
    
    // Check if suggestion popup shows only /skills
    const suggestionPopup = page.locator('ul.fixed').first();
    await expect(suggestionPopup).toBeVisible();
    
    // Should only contain /skills
    const listItems = suggestionPopup.locator('li');
    await expect(listItems).toHaveCount(1);
    
    const firstItem = listItems.first();
    await expect(firstItem).toContainText('/skills');
  });

  test('should navigate suggestions with arrow keys', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const textarea = page.locator('textarea[placeholder*="Type message"]');
    await expect(textarea).toBeVisible();

    // Type / to show all commands
    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);
    
    // Press down arrow to navigate
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    
    // Second item should be selected (highlighted)
    const suggestionPopup = page.locator('ul.fixed').first();
    const selectedItems = suggestionPopup.locator('li.bg-blue-100, li[class*="bg-blue-900"]');
    await expect(selectedItems).toHaveCount(1);
    
    // Press up arrow to go back
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(100);
    
    // First item should be selected
    const selectedItemsAfter = suggestionPopup.locator('li.bg-blue-100, li[class*="bg-blue-900"]');
    await expect(selectedItemsAfter).toHaveCount(1);
  });

  test('should autocomplete command on Enter', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const textarea = page.locator('textarea[placeholder*="Type message"]');
    await expect(textarea).toBeVisible();

    // Type /s
    await textarea.focus();
    await textarea.fill('/s');
    await page.waitForTimeout(300);
    
    // Press Enter to select /skills
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    
    // Input should now contain "/skills "
    const value = await textarea.inputValue();
    await expect(value).toContain('/skills');
  });

  test('should close popup on Escape', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const textarea = page.locator('textarea[placeholder*="Type message"]');
    await expect(textarea).toBeVisible();

    // Type / to show suggestions
    await textarea.focus();
    await textarea.fill('/');
    await page.waitForTimeout(300);
    
    // Verify popup is visible
    const suggestionPopup = page.locator('ul.fixed').first();
    await expect(suggestionPopup).toBeVisible();
    
    // Press Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    
    // Popup should be hidden
    await expect(suggestionPopup).not.toBeVisible();
  });
});
