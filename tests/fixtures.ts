/**
 * Shared Playwright fixture that launches Chrome with the Genmix extension loaded.
 *
 * Usage in test files:
 *   import { test, expect, extensionId } from './fixtures';
 *
 * Prerequisites:
 *   - Run `npm run build` (or `npm run dev`) before running tests so `dist/` exists.
 */

import { test as base, chromium, type BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.resolve(__dirname, '../dist');

// Verify dist exists before launching
if (!fs.existsSync(extensionPath)) {
    throw new Error(
        `Extension dist not found at ${extensionPath}.\n` +
        `Please run: npm run build (for stable builds) or ensure npm run dev has generated dist/`
    );
}

export const test = base.extend<{
    context: BrowserContext;
    extensionId: string;
}>({
    // Override context with a persistent context that loads the extension
    context: async ({ }, use) => {
        const userDataDir = path.resolve(__dirname, '../.playwright-data');
        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`,
                '--no-sandbox',
            ],
        });
        await use(context);
        await context.close();
    },

    // Resolves the actual extension ID from the service worker
    extensionId: async ({ context }, use) => {
        // Service worker URL pattern: chrome-extension://<ID>/...
        let [background] = context.serviceWorkers();
        if (!background) {
            background = await context.waitForEvent('serviceworker');
        }
        const extensionId = background.url().split('/')[2];
        console.log('[Playwright] Extension ID:', extensionId);
        await use(extensionId);
    },
});

export const expect = test.expect;
