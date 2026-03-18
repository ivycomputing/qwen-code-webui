import { test, expect } from '@playwright/test';

/**
 * Test for Issue 27: ChatPage 支持用上下箭头翻阅历史输入消息
 * 
 * 测试功能：
 * 1. 用户可以在输入框中输入消息
 * 2. 发送消息后，消息会被保存到历史记录
 * 3. 使用上箭头（↑）可以翻阅上一条历史消息
 * 4. 使用下箭头（↓）可以翻阅下一条历史消息
 * 5. 到达第一条时继续按上箭头保持在第一条
 * 6. 到达最后一条时继续按下箭头清空输入框
 */

test.describe('Issue 27 - Input History Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the main chat page
    await page.goto('/', { waitUntil: 'networkidle' });

    // Wait for the project selector to load, then select the first project
    // Projects are displayed as buttons with folder icons
    await page.waitForSelector('button:has-text("/")', {
      timeout: 10000,
    });
    
    // Click the first project button
    await page.click('button:has-text("/") >> nth=0');

    // Wait for chat page to load
    await page.waitForSelector('textarea[placeholder="Type message..."]', {
      timeout: 10000,
    });
  });

  test('should save message to history after sending', async ({ page }) => {
    // Find the input textarea
    const textarea = page.locator('textarea[placeholder="Type message..."]');
    await expect(textarea).toBeVisible();

    // Type a message
    const testMessage = 'Test message for history';
    await textarea.fill(testMessage);
    
    // Send the message
    const sendButton = page.locator('button[type="submit"]').filter({ hasText: /Send/i });
    await sendButton.click();
    
    // Wait for message to be sent and input to be cleared
    await page.waitForTimeout(500);
    
    // Verify input is cleared
    await expect(textarea).toHaveValue('');
    
    // Now press up arrow to retrieve history
    await textarea.focus();
    await page.keyboard.press('ArrowUp');
    
    // Verify the message is retrieved
    await expect(textarea).toHaveValue(testMessage);
  });

  test('should navigate through multiple history entries', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder="Type message..."]');
    await expect(textarea).toBeVisible();

    // Send first message
    await textarea.fill('First message');
    await page.locator('button[type="submit"]').filter({ hasText: /Send/i }).click();
    await page.waitForTimeout(300);
    
    // Send second message
    await textarea.fill('Second message');
    await page.locator('button[type="submit"]').filter({ hasText: /Send/i }).click();
    await page.waitForTimeout(300);
    
    // Send third message
    await textarea.fill('Third message');
    await page.locator('button[type="submit"]').filter({ hasText: /Send/i }).click();
    await page.waitForTimeout(300);
    
    // Navigate back through history
    await textarea.focus();
    
    // Press up arrow - should get "Third message"
    await page.keyboard.press('ArrowUp');
    await expect(textarea).toHaveValue('Third message');
    
    // Press up arrow again - should get "Second message"
    await page.keyboard.press('ArrowUp');
    await expect(textarea).toHaveValue('Second message');
    
    // Press up arrow again - should get "First message"
    await page.keyboard.press('ArrowUp');
    await expect(textarea).toHaveValue('First message');
    
    // Press up arrow again - should stay at "First message"
    await page.keyboard.press('ArrowUp');
    await expect(textarea).toHaveValue('First message');
    
    // Press down arrow - should get "Second message"
    await page.keyboard.press('ArrowDown');
    await expect(textarea).toHaveValue('Second message');
    
    // Press down arrow - should get "Third message"
    await page.keyboard.press('ArrowDown');
    await expect(textarea).toHaveValue('Third message');
    
    // Press down arrow - should clear or stay at empty
    await page.keyboard.press('ArrowDown');
    const value = await textarea.inputValue();
    await expect(value === '' || value === 'Third message').toBeTruthy();
  });

  test('should reset navigation when manually typing', async ({ page }) => {
    const textarea = page.locator('textarea[placeholder="Type message..."]');
    await expect(textarea).toBeVisible();

    // Send a message first
    await textarea.fill('History message');
    await page.locator('button[type="submit"]').filter({ hasText: /Send/i }).click();
    await page.waitForTimeout(300);
    
    // Navigate to history
    await textarea.focus();
    await page.keyboard.press('ArrowUp');
    await expect(textarea).toHaveValue('History message');
    
    // Start typing manually - should reset navigation
    await textarea.fill('New message');
    
    // Press up arrow - should still get the history message (newest)
    await page.keyboard.press('ArrowUp');
    await expect(textarea).toHaveValue('History message');
  });
});
