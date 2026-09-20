import { expect, test, type Page } from '@playwright/test';

/** The fixed code the mock API accepts; a real deployment sends a WhatsApp OTP. */
const MOCK_CODE = '123456';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /WhatsApp number/i }).fill('772000001');
  await page.getByRole('checkbox', { name: /Send a login code/i }).check();
  await page.getByRole('button', { name: /Send code on WhatsApp/i }).click();
  await expect(page.getByText(/If this number is registered and eligible/i)).toBeVisible();
  await page.getByRole('textbox', { name: /Verification code/i }).fill(MOCK_CODE);
  await page.getByRole('button', { name: /Verify & sign in/i }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
}

test('staff sign in with a WhatsApp code and reach the overview', async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole('button', { name: /Account menu/i })).toBeVisible();
});

test('a reloaded deep link restores the session without another code', async ({ page }) => {
  await signIn(page);
  await page.goto('/bookings?status=READY_FOR_DISPATCH');
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
  // The filter survives the reload because it lives in the URL.
  await expect(page).toHaveURL(/status=READY_FOR_DISPATCH/);
  await expect(page.getByRole('textbox', { name: /Verification code/i })).toHaveCount(0);
});

test('signing out clears the session and returns to sign-in', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: /Account menu/i }).click();

  await page.getByRole('menuitem', { name: /Sign out/i }).click();
  await expect(page.getByRole('heading', { name: /You are signed out/i })).toBeVisible();

  // Local data is cleared before the server confirms the revocation, so retry the
  // protected route until the signed-out session is refused.
  await expect(async () => {
    await page.goto('/bookings');
    await expect(page.getByRole('button', { name: /Send code on WhatsApp/i })).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 20_000 });
});

test('an unknown route offers a way back without breaking the shell', async ({ page }) => {
  await signIn(page);
  await page.goto('/not-a-real-page');
  await expect(page.getByRole('heading', { name: /Page not found/i })).toBeVisible();
});
