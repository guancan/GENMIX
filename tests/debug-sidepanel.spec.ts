/**
 * Debug test: Inspect the Sidepanel for task visibility and tool detection.
 *
 * Run: npx playwright test tests/debug-sidepanel.spec.ts --headed
 */

import { test, expect } from './fixtures';

test.describe('Sidepanel Debugging', () => {

    test('Sidepanel loads and shows tool detection status', async ({ context, extensionId }) => {
        // Genmix sidepanel is accessible via its HTML page directly for debugging
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
        await page.waitForLoadState('networkidle');

        await page.screenshot({ path: 'tests/screenshots/sidepanel.png', fullPage: true });

        // Check the tool detection badge is present
        const toolBadge = page.locator('header span').first();
        const toolText = await toolBadge.textContent();
        console.log('[Debug] Detected tool:', toolText);

        // Check whether tasks are visible
        const taskCards = page.locator('.bg-white.rounded-lg.border');
        const count = await taskCards.count();
        console.log('[Debug] Visible task cards:', count);

        if (count === 0) {
            const emptyMsg = await page.locator('p').filter({ hasText: /No tasks for/ }).textContent();
            console.log('[Debug] Empty state message:', emptyMsg);
        }
    });

    test('Sidepanel on jimeng.jianying.com shows jimeng tasks', async ({ context }) => {
        // Navigate to Jimeng page to verify tool detection
        const page = await context.newPage();
        await page.goto('https://jimeng.jianying.com/ai-tool/generate?type=video');

        // Wait for page load (best-effort — site may require login)
        await page.waitForLoadState('domcontentloaded');
        await page.screenshot({ path: 'tests/screenshots/jimeng-page.png', fullPage: true });

        const url = page.url();
        console.log('[Debug] Navigated to:', url);
        console.log('[Debug] Hostname:', new URL(url).hostname);

        // Verify that the page loaded (may redirect to login — that is OK)
        expect(['jimeng.jianying.com', 'www.jianying.com']).toContain(new URL(page.url()).hostname);
    });
});
