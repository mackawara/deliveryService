import { expect, test, type Page } from '@playwright/test';
import { shopOrderFixture } from '../shopOrderFixture';

// Browser tests use contract fixtures. The cross-repo suite exercises these UI actions against real Express services.
async function fixture(page: Page) {
  const state = {
    order: shopOrderFixture(),
    orders: true,
    authenticated: true,
    revoked: false,
    timeout: false,
    calls: [] as { key: string | undefined; body: unknown }[],
  };
  const memberships = ['branch-a', 'branch-b'].map((shopId) => ({
    _id: `m-${shopId}`,
    shopId,
    ownerId: 'owner-a',
    status: 'ACTIVE',
    role: 'OWNER',
  }));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/csrf')) return json({ csrfToken: 'browser-csrf' });
    if (path === '/api/v1/shop/me')
      return state.authenticated
        ? json({
            owner: { id: 'owner-a', phone: '+263772000001', version: 1 },
            memberships: state.revoked ? [] : memberships,
            capabilities: ['orders:manage'],
            session: { expiresAt: '2099-01-01T00:00:00Z', idleExpiresAt: '2099-01-01T00:00:00Z' },
          })
        : json({ code: 'UNAUTHENTICATED', message: 'Sign in again.' }, 401);
    if (path === '/api/v1/shop/shops')
      return json({
        items: state.revoked
          ? []
          : memberships.map((m) => ({
              _id: m.shopId,
              name: m.shopId === 'branch-a' ? 'Town Centre' : 'Baobab',
              branchName: '',
              approvalState: 'APPROVED',
              isOpen: true,
            })),
      });
    if (path === '/api/v1/shop/auth/logout') {
      state.authenticated = false;
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/v1/shop/food-orders')
      return json({
        items: state.orders
          ? [
              {
                ...state.order,
                shopId: url.searchParams.get('shopId'),
                reference:
                  url.searchParams.get('shopId') === 'branch-b'
                    ? 'BRANCH-B-001'
                    : state.order.reference,
              },
            ]
          : [],
        nextCursor: null,
        serverNow: state.order.serverNow,
        pollingIntervalMs: 5000,
      });
    if (path === '/api/v1/shop/food-orders/order-a')
      return json({ order: state.order, serverNow: state.order.serverNow });
    if (path.endsWith('/accept')) {
      state.calls.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() });
      state.order = shopOrderFixture({
        status: 'PREPARING',
        delivery: { ...state.order.delivery, progress: 'PREPARING' },
        version: 2,
        availableActions: ['READY'],
        prepMinutes: 15,
        estimatedReadyAt: '2026-10-25T10:15:00Z',
        acceptedAt: state.order.serverNow,
      });
      if (state.timeout && state.calls.length === 1) return route.abort('timedout');
      return json({ order: state.order, serverNow: state.order.serverNow });
    }
    return json({ code: 'UNAUTHENTICATED', message: 'Sign in required.' }, 401);
  });
  return state;
}

test('phone/desktop order detail supports keyboard preparation, readiness separation and readable USD', async ({
  page,
}, testInfo) => {
  const state = await fixture(page);
  await page.goto('/shop/branch-a/orders/order-a');
  await expect(page.getByRole('heading', { name: 'FOOD-001' })).toBeVisible();
  await expect(page.getByText(/Total: USD \$15.50/)).toBeVisible();
  const accept = page.getByRole('button', { name: 'Accept order' });
  await accept.focus();
  await page.keyboard.press('Enter');
  const input = page.getByLabel(/Preparation minutes/);
  await expect(input).toBeFocused();
  await expect(page.getByRole('button', { name: 'Confirm action' })).toBeDisabled();
  await input.fill('15');
  await page.keyboard.press('Escape');
  await expect(accept).toBeFocused();
  await page.keyboard.press('Enter');
  await input.fill('15');
  const confirm = page.getByRole('button', { name: 'Confirm action' });
  await confirm.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Ready for pickup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reject order' })).toHaveCount(0);
  expect(state.calls).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('shop-order-detail.png'), fullPage: true });
});

test('polling announces arrivals, branch switch clears reviewed data, and sign-out protects it', async ({
  page,
}) => {
  const state = await fixture(page);
  state.orders = false;
  await page.goto('/shop/branch-a/orders');
  await expect(page.getByText('No orders match this filter.')).toBeVisible();
  state.orders = true;
  await expect(page.getByRole('heading', { name: 'FOOD-001' })).toBeVisible({ timeout: 7000 });
  await expect(page.getByText('1 new order arrived.')).toBeVisible();
  await page.getByRole('combobox', { name: 'Current shop branch' }).click();
  await page.getByRole('option', { name: 'Baobab' }).click();
  await expect(page.getByRole('heading', { name: 'BRANCH-B-001' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'FOOD-001' })).toHaveCount(0);
  if (await page.getByRole('button', { name: 'Open shop navigation' }).isVisible())
    await page.getByRole('button', { name: 'Open shop navigation' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/shop\/login/);
  await expect(page.getByText('Original pizza snapshot')).toHaveCount(0);
});

test('unconfirmed retry preserves the original key and payload', async ({ page }) => {
  const state = await fixture(page);
  state.timeout = true;
  await page.goto('/shop/branch-a/orders/order-a');
  await page.getByRole('button', { name: 'Accept order' }).click();
  await page.getByLabel(/Preparation minutes/).fill('12');
  await page.getByRole('button', { name: 'Confirm action' }).click();
  await expect(page.getByText(/Outcome unconfirmed/)).toBeVisible();
  await page.getByRole('button', { name: 'Retry original action' }).click();
  await expect(page.getByText(/Action confirmed by the server/)).toBeVisible();
  expect(state.calls).toHaveLength(2);
  expect(state.calls[1]).toEqual(state.calls[0]);
});

test('membership revocation removes all protected order content', async ({ page }) => {
  const state = await fixture(page);
  await page.goto('/shop/branch-a/orders/order-a');
  await expect(page.getByText(/Original pizza snapshot/)).toBeVisible();
  state.revoked = true;
  await expect(page.getByText(/Original pizza snapshot/)).toHaveCount(0, { timeout: 7000 });
});
