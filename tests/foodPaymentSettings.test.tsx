import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCsrfToken } from '@/api/csrf';
import type { ShopPaymentSettings } from '@/api/dto/foodPayments';
import type { WireShopMe } from '@/api/dto/shop';
import { foodPaymentsApi } from '@/api/endpoints/foodPayments';
import { createAppStore } from '@/app/store';
import { AuthContext } from '@/auth/AuthProvider';
import { OwnerAuthContext } from '@/auth/OwnerAuthProvider';
import { appConfig } from '@/config';
import {
  AdminCustomerPaymentsPanel,
  OwnerCustomerPaymentsPanel,
} from '@/features/shop/CustomerPaymentsPanel';
import type { StaffSession } from '@/lib/permissions';
import { mockServer } from '@/mocks/server';
import { renderRoutes } from './testUtils';

const ready: ShopPaymentSettings = {
  shopId: 'shop-1',
  currency: 'USD',
  codEnabled: true,
  ecoCashEnabled: false,
  status: 'READY',
  version: 3,
  provider: { ready: true, usdSupported: true, checkedAt: '2026-10-28T10:00:00Z' },
};
const admin: StaffSession = {
  user: { id: 'admin-1', name: 'Admin', maskedPhone: '••••0010' },
  roles: ['admin'],
  capabilities: [],
  townAccess: { allTowns: false, towns: [{ id: 'town-1', name: 'Hwange' }] },
  session: { expiresAt: '2099-01-01T00:00:00Z', idleExpiresAt: '2099-01-01T00:00:00Z' },
};
const owner: WireShopMe = {
  owner: { id: 'owner-1', phone: '+263772555010', version: 1 },
  memberships: ['shop-1', 'shop-2'].map((shopId) => ({
    _id: `member-${shopId}`,
    ownerId: 'owner-1',
    shopId,
    townId: 'town-1',
    version: 1,
    createdAt: '2026-10-20T00:00:00Z',
    updatedAt: '2026-10-20T00:00:00Z',
    role: 'OWNER',
    status: 'ACTIVE',
  })),
  capabilities: ['settlements:read'],
  session: { expiresAt: '2099-01-01T00:00:00Z', idleExpiresAt: '2099-01-01T00:00:00Z' },
};
function adminView(session = admin, townId = 'town-1') {
  return renderRoutes({
    routes: [
      {
        path: '/',
        element: (
          <AuthContext.Provider
            value={{
              status: 'authenticated',
              session,
              signingOut: false,
              error: undefined,
              signOut: async () => {},
              refresh: vi.fn(),
            }}
          >
            <AdminCustomerPaymentsPanel shopId="shop-1" townId={townId} />
          </AuthContext.Provider>
        ),
      },
    ],
  });
}
function ownerView(shopId = 'shop-1', session = owner) {
  return renderRoutes({
    routes: [
      {
        path: '/',
        element: (
          <OwnerAuthContext.Provider
            value={{
              status: 'authenticated',
              session,
              signingOut: false,
              error: undefined,
              signOut: async () => {},
              refresh: vi.fn(),
            }}
          >
            <OwnerCustomerPaymentsPanel shopId={shopId} />
          </OwnerAuthContext.Provider>
        ),
      },
    ],
  });
}
const originalFlag = appConfig.enableFoodEcoCash;
beforeEach(() => {
  appConfig.enableFoodEcoCash = true;
  setCsrfToken('staff-csrf');
});
afterEach(() => {
  appConfig.enableFoodEcoCash = originalFlag;
});

describe('food customer payment settings', () => {
  it('does not request settings for disabled features, non-admin staff or another town', async () => {
    const request = vi.fn();
    mockServer.use(
      http.get('/api/v1/admin/food/shops/shop-1/payment-settings', () => {
        request();
        return HttpResponse.json({ paymentSettings: ready });
      }),
    );
    appConfig.enableFoodEcoCash = false;
    const first = adminView();
    expect(screen.queryByText('Customer payments')).not.toBeInTheDocument();
    first.unmount();
    appConfig.enableFoodEcoCash = true;
    const second = adminView({ ...admin, roles: ['finance'] });
    second.unmount();
    adminView(admin, 'town-2');
    expect(request).not.toHaveBeenCalled();
  });

  it('shows owner-safe availability without controls and blocks revoked/foreign branches', async () => {
    const reads = vi.fn();
    mockServer.use(
      http.get('/api/v1/shop/shops/:shopId/payment-settings', ({ params }) => {
        reads(params.shopId);
        return HttpResponse.json({ paymentSettings: { ...ready, shopId: params.shopId } });
      }),
    );
    const first = ownerView();
    expect(await screen.findByText('READY')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enable EcoCash' })).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/secret|integration key|wallet number/i),
    ).not.toBeInTheDocument();
    first.unmount();
    const second = ownerView('foreign-branch');
    second.unmount();
    ownerView('shop-1', {
      ...owner,
      memberships: owner.memberships.map((member) => ({ ...member, status: 'REVOKED' })),
    });
    expect(reads).toHaveBeenCalledExactlyOnceWith('shop-1');
  });

  it('blocks unsupported USD and displays provider unavailability accurately', async () => {
    mockServer.use(
      http.get('/api/v1/admin/food/shops/shop-1/payment-settings', () =>
        HttpResponse.json({
          paymentSettings: {
            ...ready,
            status: 'UNAVAILABLE',
            provider: {
              ready: false,
              usdSupported: false,
              blockedReason: 'USD sandbox evidence is required.',
            },
          },
        }),
      ),
    );
    adminView();
    expect(await screen.findByText('USD sandbox evidence is required.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enable EcoCash' })).toBeDisabled();
    expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument();
  });

  it('can disable configured checkouts during a provider outage without hiding historical payments', async () => {
    const user = userEvent.setup();
    const commands: unknown[] = [];
    mockServer.use(
      http.get('/api/v1/admin/food/shops/shop-1/payment-settings', () =>
        HttpResponse.json({
          paymentSettings: {
            ...ready,
            ecoCashEnabled: true,
            status: 'UNAVAILABLE',
            provider: {
              ready: false,
              usdSupported: true,
              blockedReason: 'PLATFORM_PROVIDER_UNAVAILABLE',
            },
          },
        }),
      ),
      http.patch('/api/v1/admin/food/shops/shop-1/payment-settings', async ({ request }) => {
        commands.push(await request.json());
        return HttpResponse.json({ paymentSettings: { ...ready, status: 'DISABLED', version: 4 } });
      }),
    );
    adminView();
    await user.click(await screen.findByRole('button', { name: 'Disable new EcoCash checkouts' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText(/Reason for change/), 'Provider outage pause');
    await user.click(dialog.getByRole('button', { name: 'Save payment setting' }));
    await waitFor(() =>
      expect(commands).toEqual([
        { ecoCashEnabled: false, expectedVersion: 3, reason: 'Provider outage pause' },
      ]),
    );
    expect(
      screen.getByText(/preserves existing payment attempts, reconciliation and refunds/),
    ).toBeInTheDocument();
  });

  it('reloads conflicts before explicit save and sends version, CSRF and an operation key', async () => {
    const user = userEvent.setup();
    let settings = ready;
    const commands: Array<{
      body: Record<string, unknown>;
      key: string | null;
      csrf: string | null;
    }> = [];
    mockServer.use(
      http.get('/api/v1/admin/food/shops/shop-1/payment-settings', () =>
        HttpResponse.json({ paymentSettings: settings }),
      ),
      http.patch('/api/v1/admin/food/shops/shop-1/payment-settings', async ({ request }) => {
        commands.push({
          body: (await request.json()) as Record<string, unknown>,
          key: request.headers.get('idempotency-key'),
          csrf: request.headers.get('x-csrf-token'),
        });
        if (commands.length === 1) {
          settings = { ...settings, version: 4, ecoCashEnabled: true, status: 'ENABLED' };
          return HttpResponse.json(
            { code: 'VERSION_CONFLICT', message: 'Configuration changed.' },
            { status: 409 },
          );
        }
        settings = { ...settings, ecoCashEnabled: true, status: 'ENABLED', version: 5 };
        return HttpResponse.json({ paymentSettings: settings });
      }),
    );
    adminView();
    await user.click(await screen.findByRole('button', { name: 'Enable EcoCash' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText(/Reason for change/), 'Approved pilot shop');
    await user.click(dialog.getByRole('button', { name: 'Save payment setting' }));
    expect(await dialog.findByText(/Another administrator changed/)).toBeInTheDocument();
    await waitFor(() =>
      expect(dialog.getByRole('button', { name: 'Save payment setting' })).toBeEnabled(),
    );
    await user.click(dialog.getByRole('button', { name: 'Save payment setting' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(commands.map((command) => command.body)).toEqual([
      { ecoCashEnabled: true, expectedVersion: 3, reason: 'Approved pilot shop' },
      { ecoCashEnabled: true, expectedVersion: 4, reason: 'Approved pilot shop' },
    ]);
    expect(commands.every((command) => command.csrf === 'staff-csrf' && !!command.key)).toBe(true);
    expect(commands[0].key).not.toBe(commands[1].key);
    expect(
      await screen.findByRole('button', { name: 'Disable new EcoCash checkouts' }),
    ).toBeEnabled();
  });

  it('keeps an uncertain command locked and retries the identical payload and key', async () => {
    const user = userEvent.setup();
    const commands: Array<{ body: unknown; key: string | null }> = [];
    mockServer.use(
      http.get('/api/v1/admin/food/shops/shop-1/payment-settings', () =>
        HttpResponse.json({ paymentSettings: ready }),
      ),
      http.patch('/api/v1/admin/food/shops/shop-1/payment-settings', async ({ request }) => {
        commands.push({ body: await request.json(), key: request.headers.get('idempotency-key') });
        if (commands.length === 1) {
          return HttpResponse.json({ message: 'Provider unavailable' }, { status: 503 });
        }
        return HttpResponse.json({
          paymentSettings: { ...ready, ecoCashEnabled: true, status: 'ENABLED', version: 4 },
        });
      }),
    );
    adminView();
    await user.click(await screen.findByRole('button', { name: 'Enable EcoCash' }));
    const dialog = within(screen.getByRole('dialog'));
    await user.type(dialog.getByLabelText(/Reason for change/), 'Approved pilot shop');
    await user.dblClick(dialog.getByRole('button', { name: 'Save payment setting' }));
    expect(await dialog.findByText(/Outcome not confirmed/)).toBeInTheDocument();
    expect(dialog.getByLabelText(/Reason for change/)).toBeDisabled();
    expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(commands).toHaveLength(1);
    await user.click(dialog.getByRole('button', { name: 'Retry the same request' }));
    await waitFor(() => expect(commands).toHaveLength(2));
    expect(commands[1]).toEqual(commands[0]);
  });

  it('isolates actor and branch caches and never sends identity as authorization data', async () => {
    const requests: string[] = [];
    mockServer.use(
      http.get('/api/v1/shop/shops/:shopId/payment-settings', async ({ params, request }) => {
        requests.push(request.url);
        if (params.shopId === 'shop-2') {
          await delay(20);
        }
        return HttpResponse.json({ paymentSettings: { ...ready, shopId: params.shopId } });
      }),
    );
    const store = createAppStore();
    const args = [
      { scopeKey: 'owner-1', shopId: 'shop-1' },
      { scopeKey: 'owner-2', shopId: 'shop-1' },
      { scopeKey: 'owner-1', shopId: 'shop-2' },
    ];
    const subscriptions = args.map((scope) =>
      store.dispatch(foodPaymentsApi.endpoints.getOwnerShopPaymentSettings.initiate(scope)),
    );
    const values = await Promise.all(subscriptions.map((subscription) => subscription.unwrap()));
    expect(requests).toHaveLength(3);
    expect(requests.every((url) => !url.includes('scopeKey'))).toBe(true);
    expect(values[2].shopId).toBe('shop-2');
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    store.dispatch(foodPaymentsApi.util.resetApiState());
  });
});
