import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { setShopCsrfToken } from '@/api/csrf';
import type { WireShopMe } from '@/api/dto/shop';
import { OwnerAuthContext } from '@/auth/OwnerAuthProvider';
import { appConfig } from '@/config';
import { ShopEarningsPage, hararePeriodInput } from '@/features/shop/ShopEarningsPage';
import { ShopPayoutDetailsPage, validPayoutDetails } from '@/features/shop/ShopPayoutDetailsPage';
import { ShopSettlementPage } from '@/features/shop/ShopSettlementPage';
import { mockServer } from '@/mocks/server';
import { foodDestination, foodEarnings, foodSettlement } from './foodFinanceFixture';
import { renderRoutes } from './testUtils';

const session: WireShopMe = {
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
  capabilities: ['settlements:read', 'payout-details:manage'],
  session: { expiresAt: '2099-01-01T00:00:00Z', idleExpiresAt: '2099-01-01T00:00:00Z' },
};

function withOwner(children: ReactNode, owner = session) {
  return (
    <OwnerAuthContext.Provider
      value={{
        status: 'authenticated',
        session: owner,
        error: undefined,
        signingOut: false,
        signOut: async () => {},
        refresh: () => {},
      }}
    >
      {children}
    </OwnerAuthContext.Provider>
  );
}
function showPage(
  kind: 'earnings' | 'payout-details' | 'settlement',
  shopId = 'shop-1',
  owner = session,
) {
  const path = kind === 'settlement' ? '/shop/:shopId/settlements/:id' : `/shop/:shopId/${kind}`;
  const page =
    kind === 'earnings' ? (
      <ShopEarningsPage />
    ) : kind === 'payout-details' ? (
      <ShopPayoutDetailsPage />
    ) : (
      <ShopSettlementPage />
    );
  return renderRoutes({
    routes: [{ path, element: withOwner(page, owner) }],
    initialEntries: [
      kind === 'settlement'
        ? `/shop/${shopId}/settlements/settlement-1`
        : `/shop/${shopId}/${kind}`,
    ],
  });
}

let originalGate = false;
beforeEach(() => {
  originalGate = appConfig.enableFoodSettlements;
  appConfig.enableFoodSettlements = true;
  setShopCsrfToken('owner-csrf');
});
afterEach(() => {
  appConfig.enableFoodSettlements = originalGate;
});

describe('owner earnings and payout safety', () => {
  it('keeps disabled, unauthorized and revoked branches out of the financial query flow', async () => {
    appConfig.enableFoodSettlements = false;
    const view = showPage('earnings');
    expect(screen.getByText(/unavailable for this branch/)).toBeInTheDocument();
    view.unmount();
    appConfig.enableFoodSettlements = true;
    const revoked = {
      ...session,
      memberships: session.memberships.map((membership) => ({
        ...membership,
        status: 'REVOKED' as const,
      })),
    };
    const second = showPage('payout-details', 'shop-1', revoked);
    expect(screen.getByText(/unavailable for this branch/)).toBeInTheDocument();
    second.unmount();
    showPage('earnings', 'another-owner-branch');
    expect(screen.getByText(/unavailable for this branch/)).toBeInTheDocument();
    expect(screen.queryByText(/Gross food earnings/)).not.toBeInTheDocument();
  });

  it('uses complete server totals across ledger pages and removes old branch data during switching', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    mockServer.use(
      http.get('/api/v1/shop/shops/:shopId/earnings', async ({ params, request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        seen.push(`${params.shopId}:${cursor ?? 'first'}`);
        if (params.shopId === 'shop-2') {
          await delay(120);
          return HttpResponse.json({
            ...foodEarnings,
            items: [
              {
                ...foodEarnings.items[0],
                _id: 'branch-two',
                orderId: 'BRANCH-TWO-ORDER',
                shopId: 'shop-2',
              },
            ],
            balance: { ...foodEarnings.balance, shopId: 'shop-2', grossCents: 9900 },
          });
        }
        return HttpResponse.json({
          ...foodEarnings,
          nextCursor: cursor ? null : 'ledger-page-two',
          items: cursor
            ? [
                {
                  ...foodEarnings.items[0],
                  _id: 'late-entry',
                  orderId: 'SECOND-PAGE-ORDER',
                  amountCents: 1,
                },
              ]
            : foodEarnings.items,
        });
      }),
      http.get('/api/v1/shop/shops/:shopId/settlements', () =>
        HttpResponse.json({ items: [], nextCursor: null }),
      ),
    );
    renderRoutes({
      routes: [
        {
          path: '/shop/:shopId/earnings',
          element: withOwner(
            <>
              <Link to="/shop/shop-2/earnings">Switch to second branch</Link>
              <ShopEarningsPage />
            </>,
          ),
        },
      ],
      initialEntries: ['/shop/shop-1/earnings'],
    });
    expect(await screen.findByLabelText('Gross food earnings: $22.00')).toBeInTheDocument();
    expect(screen.getByLabelText('Paid: $9.00')).toBeInTheDocument();
    expect(screen.getByText('pilot-order')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next ledger page' }));
    expect(await screen.findByText('SECOND-PAGE-ORDER')).toBeInTheDocument();
    expect(screen.getByLabelText('Gross food earnings: $22.00')).toBeInTheDocument();
    expect(seen).toContain('shop-1:ledger-page-two');
    await user.click(screen.getByRole('link', { name: 'Switch to second branch' }));
    expect(screen.queryByText('SECOND-PAGE-ORDER')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Gross food earnings: $22.00')).not.toBeInTheDocument();
    expect(await screen.findByText('BRANCH-TWO-ORDER')).toBeInTheDocument();
    expect(screen.getByLabelText('Gross food earnings: $99.00')).toBeInTheDocument();
  });

  it('preserves a payout draft on conflict and confirms the latest shop version before saving', async () => {
    const user = userEvent.setup();
    let shopVersion = 7;
    const requests: Array<{ key: string | null; body: Record<string, unknown> }> = [];
    mockServer.use(
      http.get('/api/v1/shop/shops/shop-1/payout-details', () =>
        HttpResponse.json({
          payoutDetails: {
            ...foodDestination,
            accountIdentifier: shopVersion === 7 ? '••••0010' : '••••0099',
          },
          shopVersion,
        }),
      ),
      http.put('/api/v1/shop/shops/shop-1/payout-details', async ({ request }) => {
        requests.push({
          key: request.headers.get('idempotency-key'),
          body: (await request.json()) as Record<string, unknown>,
        });
        if (requests.length === 1) {
          shopVersion = 8;
          return HttpResponse.json(
            { code: 'VERSION_CONFLICT', message: 'Another user changed the branch.' },
            { status: 409 },
          );
        }
        shopVersion = 9;
        return HttpResponse.json({
          payoutDetails: { ...foodDestination, accountIdentifier: '••••0022', version: 2 },
        });
      }),
    );
    showPage('payout-details');
    await user.click(await screen.findByRole('button', { name: 'Change payout details' }));
    const identifier = screen.getByLabelText(/Full mobile-money number/);
    expect(identifier).toHaveValue('');
    await user.click(identifier);
    await user.paste('+263772550022');
    await user.click(screen.getByLabelText(/Reason for adding or changing details/));
    await user.paste('Changed mobile money destination');
    await user.click(screen.getByLabelText(/I checked these details/));
    await user.click(screen.getByRole('button', { name: 'Save payout details' }));
    expect(await screen.findByText(/Your draft is preserved/)).toBeInTheDocument();
    expect(identifier).toHaveValue('+263772550022');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save payout details' })).toBeDisabled(),
    );
    await user.click(screen.getByLabelText(/I reviewed the latest destination/));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save payout details' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Save payout details' }));
    expect(
      await screen.findByText(/Payout details saved by the delivery service/),
    ).toBeInTheDocument();
    expect(requests.map((request) => request.body.expectedVersion)).toEqual([7, 8]);
    expect(requests[0].key).toBeTruthy();
    expect(requests[1].key).not.toBe(requests[0].key);
    expect(screen.queryByDisplayValue('+263772550022')).not.toBeInTheDocument();
  });

  it('replays an unconfirmed payout request with identical payload and key after closing and reopening', async () => {
    const user = userEvent.setup();
    const requests: Array<{ key: string | null; body: unknown }> = [];
    mockServer.use(
      http.get('/api/v1/shop/shops/shop-1/payout-details', () =>
        HttpResponse.json({ payoutDetails: foodDestination, shopVersion: 7 }),
      ),
      http.put('/api/v1/shop/shops/shop-1/payout-details', async ({ request }) => {
        requests.push({ key: request.headers.get('idempotency-key'), body: await request.json() });
        return requests.length === 1
          ? HttpResponse.json({ message: 'Response lost after commit' }, { status: 503 })
          : HttpResponse.json({
              payoutDetails: { ...foodDestination, accountIdentifier: '••••0044', version: 2 },
            });
      }),
    );
    showPage('payout-details');
    await user.click(await screen.findByRole('button', { name: 'Change payout details' }));
    await user.click(screen.getByLabelText(/Full mobile-money number/));
    await user.paste('+263772550044');
    await user.click(screen.getByLabelText(/Reason for adding or changing details/));
    await user.paste('Owner confirmed new number');
    await user.click(screen.getByLabelText(/I checked these details/));
    await user.click(screen.getByRole('button', { name: 'Save payout details' }));
    expect(
      await screen.findByRole('button', { name: 'Retry the same request' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Payout details saved by the delivery service/),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(await screen.findByRole('button', { name: 'Review unconfirmed request' }));
    await user.click(screen.getByRole('button', { name: 'Retry the same request' }));
    expect(
      await screen.findByText(/Payout details saved by the delivery service/),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
  }, 60_000);

  it('shows statement snapshots and masks a full identifier even if an API returns it', async () => {
    mockServer.use(
      http.get('/api/v1/shop/shops/shop-1/settlements/settlement-1', () =>
        HttpResponse.json({
          settlement: {
            ...foodSettlement,
            destinationSnapshot: { ...foodDestination, accountIdentifier: '+263772550010' },
          },
        }),
      ),
    );
    showPage('settlement');
    expect(await screen.findByText('FOOD-001')).toBeInTheDocument();
    expect(screen.getByText('••••0010')).toBeInTheDocument();
    expect(screen.queryByText('+263772550010')).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole('table', { name: 'Statement included orders and adjustments' }),
      ).getByText(/1000 basis points/),
    ).toBeInTheDocument();
    expect(screen.getByText(/26 Oct 2026, 00:00/)).toBeInTheDocument();
  });

  it('retains entered payout details and shows server field errors without reporting success', async () => {
    const user = userEvent.setup();
    mockServer.use(
      http.get('/api/v1/shop/shops/shop-1/payout-details', () =>
        HttpResponse.json({ payoutDetails: null, shopVersion: 7 }),
      ),
      http.put('/api/v1/shop/shops/shop-1/payout-details', () =>
        HttpResponse.json(
          {
            code: 'PAYOUT_DESTINATION_INVALID',
            message: 'Check your payout destination.',
            fieldErrors: [
              {
                field: 'accountIdentifier',
                message: 'This destination cannot receive the agreed payout.',
              },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    showPage('payout-details');
    await user.click(await screen.findByRole('button', { name: 'Add payout details' }));
    await user.click(screen.getByLabelText(/Account or recipient name/));
    await user.paste('Branch owner');
    await user.click(screen.getByLabelText(/Full mobile-money number/));
    await user.paste('+263772550055');
    await user.click(screen.getByLabelText(/Reason for adding or changing details/));
    await user.paste('First manual payout');
    await user.click(screen.getByLabelText(/I checked these details/));
    await user.click(screen.getByRole('button', { name: 'Save payout details' }));
    expect(await screen.findByText('Check your payout destination.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Full mobile-money number/)).toHaveValue('+263772550055');
    expect(screen.getByLabelText(/Full mobile-money number/)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      screen.queryByText(/Payout details saved by the delivery service/),
    ).not.toBeInTheDocument();
  });

  it('converts local half-open period dates and validates destination input without accepting masks', () => {
    expect(hararePeriodInput('2026-10-28')).toBe('2026-10-27T22:00:00.000Z');
    expect(hararePeriodInput('2026-02-30')).toBeUndefined();
    const draft = {
      method: 'BANK_TRANSFER' as const,
      accountName: 'Owner',
      accountIdentifier: 'ACC-0012',
      provider: 'Bank',
      reason: 'First destination',
    };
    expect(validPayoutDetails(draft)).toBe(true);
    expect(validPayoutDetails({ ...draft, accountIdentifier: '••••0012' })).toBe(false);
    expect(validPayoutDetails({ ...draft, reason: 'x' })).toBe(false);
  });
});
