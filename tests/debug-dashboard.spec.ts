/**
 * Debug test: Inspect the Dashboard page for the task editing and creation flows.
 *
 * Run: npx playwright test tests/debug-dashboard.spec.ts --headed
 */

import { test, expect } from './fixtures';

test.describe('Dashboard Debugging', () => {

    test('Dashboard loads and shows task list', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`);

        // Wait for the page to be loaded
        await page.waitForLoadState('networkidle');

        // Screenshot for visual inspection
        await page.screenshot({ path: 'tests/screenshots/dashboard.png', fullPage: true });

        // Check heading
        await expect(page.getByRole('heading', { name: /Active Tasks/i })).toBeVisible();
        console.log('[Debug] Dashboard loaded successfully');
    });

    test('Create Task modal opens and submits', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
        await page.waitForLoadState('networkidle');

        // Click "New Task" in the main content area (layout has 2 buttons)
        await page.getByRole('button', { name: /New Task/i }).last().click();

        // Modal should appear
        await expect(page.getByRole('heading', { name: /Create New Task/i })).toBeVisible();
        await page.screenshot({ path: 'tests/screenshots/create-modal.png' });

        const taskName = `PW Debug Task ${Date.now()}`;

        // Fill form
        await page.getByPlaceholder(/e\.g\. Write a poem/i).fill(taskName);
        await page.getByRole('combobox').selectOption('jimeng');
        await page.getByPlaceholder(/Enter your prompt/i).fill('A calm mountain landscape at dawn.');

        // Submit
        await page.getByRole('button', { name: /Create Task/i }).click();

        // Modal should close
        await expect(page.getByRole('heading', { name: /Create New Task/i })).not.toBeVisible({ timeout: 3000 });

        // Task should appear in list
        await expect(page.getByText(taskName).first()).toBeVisible({ timeout: 5000 });
        await page.screenshot({ path: 'tests/screenshots/task-created.png' });
        console.log('[Debug] Task creation flow works, task:', taskName);
    });

    test('Clicking task row opens Edit modal', async ({ context, extensionId }) => {
        const page = await context.newPage();
        await page.goto(`chrome-extension://${extensionId}/dashboard.html`);
        await page.waitForLoadState('networkidle');

        // If there are tasks, click the first row
        const firstRow = page.locator('tbody tr').first();
        const rowCount = await firstRow.count();

        if (rowCount > 0) {
            await firstRow.click();
            await expect(page.getByRole('heading', { name: /Edit Task/i })).toBeVisible({ timeout: 3000 });
            await page.screenshot({ path: 'tests/screenshots/edit-modal.png' });
            console.log('[Debug] Edit modal opens on row click');
        } else {
            console.log('[Debug] No tasks in list — create a task first');
        }
    });
});
