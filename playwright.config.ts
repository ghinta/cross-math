import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

const baseURL = `http://127.0.0.1:4173${process.env.E2E_BASE_PATH ?? '/'}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false, workers: 1, retries: 0,
  use: {
    baseURL,
    headless: true,
    launchOptions: existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {},
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    env: { VITE_BASE_PATH: process.env.E2E_BASE_PATH ?? '/' },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
