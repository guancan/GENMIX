import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const _extensionPath = path.resolve(__dirname, 'dist');

export default defineConfig({
    testDir: './tests',
    timeout: 60_000,
    use: {
        // Extensions require headed mode
        headless: false,
    },
    projects: [
        {
            name: 'chrome-extension',
            use: {
                // Custom launcher is set in fixtures; this is for reference
            },
        },
    ],
});
