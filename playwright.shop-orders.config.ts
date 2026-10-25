import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'shopOrders.spec.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5176',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : process.platform === 'darwin'
        ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }
        : {},
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'shop-phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } },
    },
    {
      name: 'shop-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: './node_modules/.bin/vite --host 127.0.0.1 --port 5176 --strictPort',
    url: 'http://127.0.0.1:5176',
    reuseExistingServer: false,
    env: { VITE_ENABLE_MOCK_API: 'false' },
  },
});
