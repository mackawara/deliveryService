import { expect, test, type Locator, type Page } from '@playwright/test';

import { signIn } from './mockSignIn';

// 1×1 PNG: the mock API accepts any image and returns a thumbnail.
const PHOTO = {
  name: 'plate.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
};

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 0) {
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 8)
        .map(
          (el) =>
            `${el.tagName}.${String(el.className).slice(0, 80)} ${Math.round(el.getBoundingClientRect().right)}`,
        ),
    );
    console.log('OVERFLOW', overflow, wide);
  }
  expect(overflow).toBeLessThanOrEqual(0);
}

async function tapTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function openShopNavigation(page: Page) {
  const toggle = page.getByRole('button', { name: 'Open shop navigation' });
  if (await toggle.isVisible()) await toggle.click();
}

test('a new owner gets from first login to a live shop on a phone', async ({ page }) => {
  // A number that is both an owner and on the service team, so one browser plays both.
  await signIn(page, 'both');
  await page.getByRole('button', { name: 'My shop' }).click();

  // 1. Create the shop: two inputs and a tick.
  await expect(page.getByRole('heading', { name: 'Create your shop' })).toBeVisible();
  for (const absent of [/Contact phone/, /Branch label/, /Latitude/, /Settlement/])
    await expect(page.getByLabel(absent)).toHaveCount(0);
  const terms = page.getByRole('link', { name: 'terms and conditions' });
  await expect(terms).toHaveAttribute('href', '/terms');
  await expect(terms).toHaveAttribute('target', '_blank');
  await page.getByLabel('Shop name').fill('Mama Rudo Kitchen');
  await page.getByLabel('Town').click();
  await page.getByRole('option', { name: 'Hwange' }).click();
  const create = page.getByRole('button', { name: 'Create my shop' });
  await expect(create).toBeDisabled();
  await page.getByRole('checkbox', { name: /I agree/ }).check();
  await tapTarget(create);
  await noHorizontalScroll(page);
  await create.click();

  // 2. The pin is asked for straight away, and can be skipped.
  await expect(page.getByRole('heading', { name: 'Where is your shop?' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  // 3. Add an item with two inputs and no photo.
  const pinReminder = page.getByRole('alert').filter({ hasText: 'Pin your shop on the map' });
  await expect(page.getByRole('heading', { name: 'Your items' })).toBeVisible();
  await expect(pinReminder).toBeVisible();
  await expect(page.getByText(/Next, step 2: Add items with photos/)).toBeVisible();
  await page.getByRole('button', { name: 'Add your first item' }).click();
  const form = page.getByRole('dialog', { name: 'Add an item' });
  for (const absent of [/weight/i, /length/i, /packing/i, /capacity/i])
    await expect(form.getByLabel(absent)).toHaveCount(0);
  await form.getByLabel('Item name').fill('Sadza and beef');
  await form.getByLabel('Price').fill('4.50');
  await form.getByRole('button', { name: 'Save', exact: true }).click();

  const popup = page.getByRole('dialog', { name: 'Add a photo of Sadza and beef?' });
  await expect(popup).toBeVisible();
  await popup.getByRole('button', { name: 'Not now' }).click();
  await expect(popup).toBeHidden();
  await expect(page.getByText('Hidden from customers: add a photo')).toBeVisible();
  await noHorizontalScroll(page);

  // 4. Add the photo from the row: the hidden mark clears.
  await page.getByLabel('Photo for Sadza and beef').setInputFiles(PHOTO);
  await expect(page.getByText('Hidden from customers: add a photo')).toBeHidden();

  // 5. Set the pin from the reminder; the reminder goes away.
  await page.getByRole('link', { name: 'Set pin' }).click();
  await expect(page.getByRole('heading', { name: 'Where is your shop?' })).toBeVisible();
  await page.getByLabel('Coordinates or map link').fill('-18.3644, 26.4988');
  await page.getByRole('button', { name: 'Use pasted pin' }).click();
  await page.getByLabel(/Short pickup address/).fill('Next to the market');
  await page.getByRole('button', { name: 'Save my pin' }).click();
  await expect(page.getByRole('heading', { name: 'Your items' })).toBeVisible();
  await expect(pinReminder).toBeHidden();
  await expect(page.getByText(/we will tell you on\s+WhatsApp when it is approved/)).toBeVisible();
  await noHorizontalScroll(page);

  // Plain words on every owner screen: no internal terms, no second code.
  const internal = /branch|packing|capacity|settlement|verification code/i;
  await expect(page.locator('main').getByText(internal)).toHaveCount(0);
  await openShopNavigation(page);
  await page.getByRole('link', { name: 'Your shop' }).click();
  await expect(page.getByRole('heading', { name: 'Your shop' })).toBeVisible();
  await expect(page.locator('main').getByText(internal)).toHaveCount(0);
  await noHorizontalScroll(page);

  // 6. An admin approves in one click.
  await openShopNavigation(page);
  await page.getByRole('link', { name: 'Switch to admin' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await page.goto('/admin/food/shops');
  const card = page.locator('.MuiCard-root', {
    has: page.getByRole('heading', { name: 'Mama Rudo Kitchen' }),
  });
  await expect(card.getByRole('list', { name: 'Readiness checks' })).toBeVisible();
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('No shops in this queue.')).toBeVisible();

  // 7. The owner sees the shop is live.
  await page.goto('/shop');
  await expect(page.getByText('Your shop is live')).toBeVisible();
  await expect(page.getByText('Sadza and beef')).toBeVisible();
});
