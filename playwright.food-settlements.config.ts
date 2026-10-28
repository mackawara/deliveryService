import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'foodSettlements.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5177',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : process.platform === 'darwin'
        ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
        : {},
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'settlements-phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
    {
      name: 'settlements-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: './node_modules/.bin/vite --host 127.0.0.1 --port 5177 --strictPort',
    url: 'http://127.0.0.1:5177',
    reuseExistingServer: false,
    env: { VITE_ENABLE_MOCK_API: 'false', VITE_ENABLE_FOOD_SETTLEMENTS: 'true' },
  },
});
