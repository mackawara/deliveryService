import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the built application with the mock API enabled, which
 * serves the documented contracts (specification section 12). Staging runs point
 * `VITE_API_BASE_URL` at the real backend instead.
 */
const PORT = 5174;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    // Environments that ship their own Chromium (containers, CI images) can point at it
    // instead of downloading a second copy.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    // Specification section 12 asks for 1440×900, 1280×800, 1024×768 and 768×1024.
    {
      name: 'desktop-1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'desktop-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'tablet-landscape',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'tablet-portrait',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
  ],
  webServer: {
    // Bind the dev server to 127.0.0.1 explicitly: on CI runners `localhost` can resolve
    // to ::1 only, and Playwright would then wait for a port nothing is listening on.
    command: `yarn dev --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Surface the server's own output when it fails to start.
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      VITE_ENABLE_MOCK_API: 'true',
    },
  },
});
