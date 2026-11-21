import { defineConfig, devices } from '@playwright/test';

/**
 * The issue 34 first-run path at phone size, against the mock API with the simple shop
 * setup turned on. It runs separately because the flag is read when the routes load.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'simpleShopSetup.spec.ts',
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:5177',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    {
      name: 'shop-phone-360',
      use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 740 }, hasTouch: true },
    },
  ],
  webServer: {
    command: './node_modules/.bin/vite --host 127.0.0.1 --port 5177 --strictPort',
    url: 'http://127.0.0.1:5177/signed-out',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_ENABLE_MOCK_API: 'true', VITE_ENABLE_SIMPLE_SHOP_SETUP: 'true' },
  },
});
