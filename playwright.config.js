import fs from 'fs';
import { defineConfig, chromium } from '@playwright/test';

const LOCAL_CHROME_MAC = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const playwrightChromiumPath = chromium.executablePath();
const useMacChromeFallback = !fs.existsSync(playwrightChromiumPath) && fs.existsSync(LOCAL_CHROME_MAC);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45000,
  expect: {
    timeout: 10000
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    launchOptions: useMacChromeFallback ? { executablePath: LOCAL_CHROME_MAC } : {}
  },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: 'http://127.0.0.1:4173/e2e/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60000
  }
});
