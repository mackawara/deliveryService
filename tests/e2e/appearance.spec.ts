import { expect, test } from '@playwright/test';

import { signIn } from './mockSignIn';

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});

test('switching brand preset applies at once and survives a reload', async ({ page }) => {
  await page.goto('/settings/appearance');

  const before = await page
    .locator('body')
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.getByText('Black & white').click();

  await expect
    .poll(async () =>
      page.locator('body').evaluate((node) => getComputedStyle(node).backgroundColor),
    )
    .not.toBe(before);

  // Persisted as the preset identifier only.
  await expect
    .poll(async () =>
      page.evaluate(() => window.localStorage.getItem('delivery-dashboard.brand-preset')),
    )
    .toBe('monochrome');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(() => window.localStorage.getItem('delivery-dashboard.brand-preset')),
    )
    .toBe('monochrome');
});

test('the dispatch workspace stacks on a tablet and keeps a back action', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.startsWith('desktop'), 'Stacking applies below 1200px.');

  await page.goto('/dispatch?booking=booking-ready');
  await expect(page.getByRole('button', { name: /Back to queue/i })).toBeVisible();
  await page.getByRole('button', { name: /Back to queue/i }).click();
  await expect(page.getByText('Dispatch queue')).toBeVisible();
});

test('a booking dialog traps focus and closes cleanly', async ({ page }) => {
  await page.goto('/bookings/booking-ready');
  await page.getByRole('button', { name: /Request location pin/i }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(/shared the exact location|Request a location pin/i).first(),
  ).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
