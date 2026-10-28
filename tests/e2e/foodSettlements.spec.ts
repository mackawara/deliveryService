import { expect, test, type Page } from '@playwright/test';
import { foodDestination, foodEarnings, foodSettlement } from '../foodFinanceFixture';

// Browser checks cover real routing, rendered dialogs and responsive behavior with
// contract fixtures. The separate paired suite validates the real Express services.
async function fixture(page: Page, staffRole: 'admin' | 'finance' = 'finance') {
  const state = {
    authenticated: true,
    statement: structuredClone(foodSettlement),
    protectedReads: [] as string[],
    commands: [] as { path: string; key?: string; body: Record<string, unknown> }[],
  };
  const memberships = ['shop-1', 'shop-2'].map((shopId) => ({
    _id: `membership-${shopId}`,
    shopId,
    ownerId: 'owner-1',
    status: 'ACTIVE',
    role: 'OWNER',
    version: 1,
  }));
  const expiry = { expiresAt: '2099-01-01T00:00:00Z', idleExpiresAt: '2099-01-01T00:00:00Z' };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path.endsWith('/csrf')) return json({ csrfToken: 'browser-settlements-csrf' });
    if (path === '/api/v1/admin/me')
      return json({
        user: { id: `${staffRole}-1`, name: 'Settlement staff', email: 'staff@example.test' },
        roles: [staffRole],
        townAccess: { allTowns: false, towns: [{ id: 'town-1', name: 'Hwange' }] },
        capabilities: ['read', 'create', 'approve', 'void', 'pay', 'reveal'].map(
          (action) => `food.settlements.${action}`,
        ),
        session: expiry,
      });
    if (path === '/api/v1/admin/towns') return json({ items: [] });
    if (path === '/api/v1/auth/session/activity') return json({ session: expiry });
    if (path === '/api/v1/shop/me')
      return state.authenticated
        ? json({
            owner: { id: 'owner-1', phone: '+263772000001', version: 1 },
            memberships,
            capabilities: ['settlements:read', 'payout-details:manage'],
            session: expiry,
          })
        : json({ code: 'UNAUTHENTICATED', message: 'Sign in again.' }, 401);
    if (path === '/api/v1/shop/shops')
      return json({
        items: memberships.map((membership) => ({
          _id: membership.shopId,
          name: membership.shopId === 'shop-1' ? 'Town Centre' : 'Baobab',
          branchName: '',
          approvalState: 'APPROVED',
          isOpen: true,
        })),
      });
    if (path === '/api/v1/shop/auth/logout') {
      state.authenticated = false;
      return route.fulfill({ status: 204 });
    }
    const ownerPath = path.match(/^\/api\/v1\/shop\/shops\/([^/]+)\/(.+)$/);
    if (ownerPath) {
      state.protectedReads.push(path);
      const [, shopId, suffix] = ownerPath;
      if (!memberships.some((membership) => membership.shopId === shopId))
        return json({ code: 'SHOP_FINANCE_ACCESS_DENIED', message: 'Branch access denied.' }, 403);
      if (suffix === 'earnings')
        return json(
          shopId === 'shop-1'
            ? foodEarnings
            : {
                ...foodEarnings,
                items: [
                  {
                    ...foodEarnings.items[0],
                    _id: 'second-branch-entry',
                    shopId,
                    orderId: 'SECOND-BRANCH-ONLY',
                    amountCents: 9900,
                  },
                ],
                balance: {
                  ...foodEarnings.balance,
                  shopId,
                  grossCents: 11000,
                  commissionCents: 1100,
                  earnedCents: 9900,
                  balanceCents: 9900,
                  availableCents: 9900,
                  paidCents: 0,
                },
              },
        );
      if (suffix === 'settlements')
        return json({ items: shopId === 'shop-1' ? [state.statement] : [], nextCursor: null });
      if (suffix === 'payout-details')
        return json({
          payoutDetails: { ...foodDestination, shopId, accountName: 'Baobab owner' },
          shopVersion: 7,
        });
    }
    if (path === '/api/v1/admin/food/settlements/settlement-1')
      return json({ settlement: state.statement });
    if (/\/api\/v1\/admin\/food\/settlements\/settlement-1\/(approve|paid)$/.test(path)) {
      const body = request.postDataJSON() as Record<string, unknown>;
      state.commands.push({ path, key: request.headers()['idempotency-key'], body });
      state.statement = {
        ...state.statement,
        version: state.statement.version + 1,
        updatedAt: '2026-10-28T08:00:00.000Z',
        ...(path.endsWith('/approve')
          ? {
              status: 'APPROVED' as const,
              approvedBy: { type: 'FINANCE' as const, id: `${staffRole}-1` },
              approvedAt: '2026-10-27T08:00:00.000Z',
            }
          : {
              status: 'PAID' as const,
              payment: {
                payoutId: 'payout-1',
                amountCents: Number(body.amountCents),
                method: foodDestination.method,
                paidAt: String(body.paidAt),
                reference: String(body.reference),
                destinationId: String(body.destinationId),
                destinationVersion: Number(body.destinationVersion),
                recordedBy: { type: 'FINANCE' as const, id: `${staffRole}-1` },
              },
            }),
      };
      return json({ settlement: state.statement });
    }
    return json({ code: 'UNEXPECTED_BROWSER_REQUEST', message: path }, 404);
  });
  return state;
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('owner earnings switch branches without retaining another branch and keep payout details masked', async ({
  page,
}, testInfo) => {
  const state = await fixture(page);
  await page.goto('/shop/shop-1/earnings');
  await expect(page.getByRole('heading', { name: 'Earnings', exact: true })).toBeVisible();
  await expect(page.getByText('order-1', { exact: true })).toBeVisible();
  await expect(page.getByText('Pilot history', { exact: true })).toBeVisible();
  await expectNoPageOverflow(page);
  await page.getByRole('combobox', { name: 'Current shop branch' }).click();
  await page.getByRole('option', { name: 'Baobab' }).click();
  await expect(page).toHaveURL(/shop\/shop-2\/earnings/);
  await expect(page.getByText('SECOND-BRANCH-ONLY', { exact: true })).toBeVisible();
  await expect(page.getByText('order-1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('pilot-order', { exact: true })).toHaveCount(0);
  await expectNoPageOverflow(page);
  await page.getByRole('link', { name: 'Payout details', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Current destination' })).toBeVisible();
  await expect(page.getByText('••••0010', { exact: true })).toBeVisible();
  await expect(page.getByText('Baobab owner', { exact: true })).toBeVisible();
  await expect(page.getByText('+263772000010', { exact: true })).toHaveCount(0);
  const changeDetails = page.getByRole('button', { name: 'Change payout details' });
  await changeDetails.focus();
  await page.keyboard.press('Enter');
  const payoutDialog = page.getByRole('dialog');
  await expect(payoutDialog.getByLabel('Full mobile-money number')).toHaveValue('');
  await expect(payoutDialog.getByRole('button', { name: 'Save payout details' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(payoutDialog).toHaveCount(0);
  await expect(changeDetails).toBeFocused();
  await expectNoPageOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('owner-payout-details.png'), fullPage: true });
  await page.goto('/shop/shop-other/earnings');
  await expect(page).toHaveURL(/shop\/shop-1\/earnings/);
  await expect(page.getByText('order-1', { exact: true })).toBeVisible();
  await expect(page.getByText('SECOND-BRANCH-ONLY', { exact: true })).toHaveCount(0);
  expect(state.protectedReads.some((path) => path.includes('/shop-other/'))).toBe(false);
});

for (const role of ['admin', 'finance'] as const) {
  test(`${role}-only staff can approve with keyboard and record the frozen external payment`, async ({
    page,
  }, testInfo) => {
    const state = await fixture(page, role);
    await page.goto('/finance/food-settlements/settlement-1');
    await expect(page.getByRole('heading', { name: 'Shop settlement statement' })).toBeVisible();
    await expectNoPageOverflow(page);
    const approve = page.getByRole('button', { name: 'Approve statement', exact: true });
    await approve.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Approve this statement', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Approve statement' })).toBeDisabled();
    const approval = dialog.getByRole('checkbox', { name: /I reviewed the included orders/ });
    await approval.focus();
    await page.keyboard.press('Space');
    await dialog.getByRole('button', { name: 'Approve statement' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Record external payment' })).toBeVisible();
    await page.getByRole('button', { name: 'Record external payment' }).focus();
    await page.keyboard.press('Enter');
    await expect(
      dialog.getByRole('button', { name: 'Record payment', exact: true }),
    ).toBeDisabled();
    await dialog.getByLabel('Actual external payment amount').fill('10.79');
    await expect(dialog.getByText('Enter exactly the approved positive amount.')).toBeVisible();
    await dialog.getByLabel('Actual external payment amount').fill('10.80');
    await dialog.getByLabel('Actual paid date and time (Harare)').fill('2026-10-28T10:00');
    await dialog.getByLabel('External payment reference').fill(`BROWSER-${role}-001`);
    await dialog.getByRole('checkbox', { name: /I completed this external payment/ }).focus();
    await page.keyboard.press('Space');
    await expect(dialog.getByLabel('External payment method')).toHaveValue('ECOCASH');
    await expect(dialog.getByText('••••0010', { exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`staff-${role}-payment-dialog.png`),
      fullPage: true,
    });
    const record = dialog.getByRole('button', { name: 'Record payment', exact: true });
    await expect(record).toBeEnabled();
    await record.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Record external payment' })).toHaveCount(0);
    await expect(page.getByText(`BROWSER-${role}-001`, { exact: true })).toBeVisible();
    expect(state.commands).toHaveLength(2);
    expect(state.commands.every((command) => command.key && command.key.length >= 8)).toBe(true);
    expect(state.commands[1].body).toMatchObject({
      expectedVersion: 2,
      amountCents: 1080,
      destinationId: foodDestination._id,
      destinationVersion: foodDestination.version,
      method: foodDestination.method,
      paidAt: '2026-10-28T08:00:00.000Z',
      reference: `BROWSER-${role}-001`,
    });
    await expectNoPageOverflow(page);
  });
}
