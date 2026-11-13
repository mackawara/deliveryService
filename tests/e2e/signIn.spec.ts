import { expect, test, type Page } from '@playwright/test';

import { expireSession, signIn, submitCode } from './mockSignIn';

const OWNER_HOME = 'Set up a branch';

async function openShopNavigation(page: Page): Promise<void> {
  const toggle = page.getByRole('button', { name: 'Open shop navigation' });
  if (await toggle.isVisible()) await toggle.click();
}

test.describe('staff', () => {
  test('sign in through the one login and reach the overview', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Account menu/i })).toBeVisible();
  });

  test('a reloaded deep link restores the session without another code', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await page.goto('/bookings?status=READY_FOR_DISPATCH');
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
    // The filter survives the reload because it lives in the URL.
    await expect(page).toHaveURL(/status=READY_FOR_DISPATCH/);
  });

  test('a signed-out visitor is sent to the one login and back to the page they wanted', async ({
    page,
  }) => {
    await page.goto('/bookings?status=READY_FOR_DISPATCH');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fbookings%3Fstatus%3DREADY_FOR_DISPATCH$/);
    await submitCode(page, 'staff');
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();
    await expect(page).toHaveURL(/\/bookings\?status=READY_FOR_DISPATCH$/);
  });

  test('signing out stays signed out through a refresh and a return visit', async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: /Account menu/i }).click();
    await page.getByRole('menuitem', { name: /Sign out/i }).click();
    await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible();
    await page.goto('/bookings');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fbookings$/);
    await expect(page.getByRole('heading', { name: 'Mock sign-in' })).toBeVisible();
  });

  test('a session that expires ends at the one login and returns to the same page', async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await page.getByRole('link', { name: 'Bookings' }).click();
    await expect(page.getByRole('heading', { name: 'Bookings' })).toBeVisible();

    await expireSession(page, 'staff');
    // The next protected request finds out.
    await page.getByRole('link', { name: 'Drivers' }).click();

    await expect(page).toHaveURL(/\/login\?returnTo=%2Fdrivers&reason=expired$/);
    await expect(page.getByText(/Your session ended/i)).toBeVisible();
    await submitCode(page, 'staff');
    await expect(page.getByRole('heading', { name: 'Drivers' })).toBeVisible();
  });

  test('opening a shop address goes to the admin dashboard, not a login', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await page.goto('/shop/branch-1/catalogue');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('an unknown route offers a way back without breaking the shell', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await page.goto('/not-a-real-page');
    await expect(page.getByRole('heading', { name: /Page not found/i })).toBeVisible();
  });
});

test.describe('shop owner', () => {
  test('signs in through the same login and lands in their shop', async ({ page }) => {
    await signIn(page, 'owner');
    await expect(page.getByRole('heading', { name: OWNER_HOME })).toBeVisible();
    await expect(page).toHaveURL(/\/shop\/setup$/);
  });

  test('sign out, refresh, reopen: still signed out each time', async ({ page }) => {
    await signIn(page, 'owner');
    await expect(page.getByRole('heading', { name: OWNER_HOME })).toBeVisible();

    await openShopNavigation(page);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible();
    await expect(page).toHaveURL(/\/signed-out$/);

    // Refresh: the signed-out page, not the shop.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible();
    await expect(page.getByRole('heading', { name: OWNER_HOME })).toHaveCount(0);

    // Return visit to the shop: asked to sign in, never shown the shop.
    await page.goto('/shop');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fshop$/);
    await expect(page.getByRole('heading', { name: OWNER_HOME })).toHaveCount(0);

    // Browser Back must not bring cached shop data back either.
    await page.goBack();
    await expect(page.getByRole('heading', { name: OWNER_HOME })).toHaveCount(0);
  });

  test('a session that expires ends at the one login, never a staff sign-in', async ({ page }) => {
    await signIn(page, 'owner');
    await expect(page.getByRole('heading', { name: OWNER_HOME })).toBeVisible();

    await expireSession(page, 'owner');
    // The identity poll notices within a few seconds.
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fshop%2Fsetup&reason=expired$/, {
      timeout: 15_000,
    });
    await submitCode(page, 'owner');
    await expect(page.getByRole('heading', { name: OWNER_HOME })).toBeVisible();
  });

  test('opening an admin address goes to their shop, not a login', async ({ page }) => {
    await signIn(page, 'owner');
    await expect(page.getByRole('heading', { name: OWNER_HOME })).toBeVisible();
    await page.goto('/bookings');
    await expect(page.getByRole('heading', { name: OWNER_HOME })).toBeVisible();
    await expect(page).toHaveURL(/\/shop\/setup$/);
  });

  test('old shop sign-in links arrive at the one login', async ({ page }) => {
    await page.goto('/shop/login');
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/shop/signup');
    await expect(page).toHaveURL(/\/login\?intent=shop$/);
  });
});

test.describe('a number that is both staff and a shop owner', () => {
  test('is asked where to go, then switches sides without signing out', async ({ page }) => {
    await signIn(page, 'both');
    await expect(page.getByText('Where would you like to go?')).toBeVisible();
    await page.getByRole('button', { name: 'Admin dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

    await page.getByRole('button', { name: /Account menu/i }).click();
    await page.getByRole('menuitem', { name: 'Switch to my shop' }).click();
    await expect(page.getByRole('heading', { name: OWNER_HOME })).toBeVisible();

    await openShopNavigation(page);
    await page.getByRole('link', { name: 'Switch to admin' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('one sign-out ends both sides', async ({ page }) => {
    await signIn(page, 'both');
    await page.getByRole('button', { name: 'My shop' }).click();
    await expect(page.getByRole('heading', { name: OWNER_HOME })).toBeVisible();

    await openShopNavigation(page);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'You are signed out' })).toBeVisible();

    for (const address of ['/dashboard', '/shop']) {
      await page.goto(address);
      await expect(page).toHaveURL(/\/login\?returnTo=/);
    }
  });
});
