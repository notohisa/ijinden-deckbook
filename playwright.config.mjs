import { defineConfig } from '@playwright/test';

const externalURL = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: {
    baseURL: externalURL || 'http://127.0.0.1:5190/ijinden-deckbook/',
    viewport: { width: 390, height: 844 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  webServer: externalURL
    ? undefined
    : {
        command:
          'node node_modules/vite/bin/vite.js preview --config vite.pages.config.ts --host 127.0.0.1 --port 5190 --strictPort',
        url: 'http://127.0.0.1:5190/ijinden-deckbook/',
        reuseExistingServer: !process.env.CI,
      },
});
