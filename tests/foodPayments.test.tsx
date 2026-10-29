import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { WirePaymentAttempt } from '@/api/dto/finance';
import { financeApi } from '@/api/endpoints/finance';
import { routes } from '@/app/router';
import { createAppStore } from '@/app/store';
import { payments, staffSession } from '@/mocks/fixtures';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';
import { renderRoutes } from './testUtils';

const foodPayment = (patch: Partial<WirePaymentAttempt> = {}): WirePaymentAttempt => ({
  ...payments[0],
  _id: 'food-payment-1',
  reference: 'FOOD-012',
  providerReference: 'PN-FOOD-012',
  foodOrderId: 'food-order-1',
  shopId: 'shop-one',
  amountCents: 1200,
  verifiedAmountCents: 1200,
  verifiedCurrency: 'USD',
  allocations: {
    foodSubtotalCents: 1000,
    deliveryFeeCents: 200,
    commissionCents: 100,
    shopNetCents: 900,
  },
  provisionalCreditStatus: 'PENDING',
  walletNumberMasked: '+263771234567',
  canReconcile: false,
  ...patch,
});

function paymentHandler(payment: WirePaymentAttempt) {
  mockServer.use(http.get('/api/v1/admin/payments', () => HttpResponse.json({ items: [payment] })));
}

describe('food customer collections', () => {
  it('shows immutable full collection allocations and masks wallet details while new checkout is off', async () => {
    resetMockState({ authenticated: true });
    paymentHandler(foodPayment());
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/finance/payments?town=town-hwange'] });

    expect(await screen.findByText('Provisional pending')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconcile' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Full customer collection')).toBeInTheDocument();
    expect(within(dialog).getAllByText('$12.00')).toHaveLength(2);
    expect(within(dialog).getByText('Food subtotal')).toBeInTheDocument();
    expect(within(dialog).getByText('$10.00')).toBeInTheDocument();
    expect(within(dialog).getByText('Delivery fee')).toBeInTheDocument();
    expect(within(dialog).getByText('$2.00')).toBeInTheDocument();
    expect(within(dialog).getByText('Snapshotted commission')).toBeInTheDocument();
    expect(within(dialog).getByText('$1.00')).toBeInTheDocument();
    expect(within(dialog).getByText('Net shop food credit')).toBeInTheDocument();
    expect(within(dialog).getByText('$9.00')).toBeInTheDocument();
    expect(within(dialog).getByText('•••• 4567')).toBeInTheDocument();
    expect(screen.queryByText('+263771234567')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Verify with provider' })).toBeDisabled();
    expect(within(dialog).getByRole('link', { name: 'Related refunds' })).toHaveAttribute(
      'href',
      '/finance/refunds?paymentAttemptId=food-payment-1&foodOrderId=food-order-1&shopId=shop-one',
    );
  });

  it('requires both server retry permission and staff reconciliation capability', async () => {
    resetMockState({ authenticated: true });
    paymentHandler(
      foodPayment({ status: 'UNKNOWN', provisionalCreditStatus: 'HELD', canReconcile: true }),
    );
    mockServer.use(
      http.get('/api/v1/admin/me', () =>
        HttpResponse.json({ ...staffSession, capabilities: ['payments.read'] }),
      ),
    );
    renderRoutes({ routes, initialEntries: ['/finance/payments?town=town-hwange'] });
    expect(await screen.findByText('Held for review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reconcile' })).not.toBeInTheDocument();
  });

  it('verifies an unknown original attempt once with an operation key and never starts a charge', async () => {
    resetMockState({ authenticated: true });
    paymentHandler(foodPayment({ status: 'UNKNOWN', canReconcile: true }));
    const requests: Array<{ key: string | null; body: string }> = [];
    mockServer.use(
      http.post('/api/v1/admin/payments/food-payment-1/reconcile', async ({ request }) => {
        requests.push({ key: request.headers.get('Idempotency-Key'), body: await request.text() });
        return HttpResponse.json({
          applied: false,
          status: 'UNKNOWN',
          reason: 'PROVIDER_UNAVAILABLE',
        });
      }),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/finance/payments?town=town-hwange'] });
    await user.click(await screen.findByRole('button', { name: 'Reconcile' }));
    await user.click(screen.getByRole('button', { name: 'Verify with provider' }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].key).toBeTruthy();
    expect(requests[0].body).toBe('');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /charge|force paid/i })).not.toBeInTheDocument();
  });

  it('hides the prior branch payment while a new branch filter is loading', async () => {
    resetMockState({ authenticated: true });
    let release: (() => void) | undefined;
    let requested = false;
    mockServer.use(
      http.get('/api/v1/admin/payments', async ({ request }) => {
        if (new URL(request.url).searchParams.get('shopId') === 'shop-two') {
          requested = true;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return HttpResponse.json({ items: [] });
        }
        return HttpResponse.json({ items: [foodPayment()] });
      }),
    );
    renderRoutes({
      routes,
      initialEntries: ['/finance/payments?town=town-hwange&shopId=shop-one'],
    });
    await screen.findByText('PN-FOOD-012');
    fireEvent.change(screen.getByRole('textbox', { name: 'Shop ID' }), {
      target: { value: 'shop-two' },
    });
    await waitFor(() => expect(requested).toBe(true));
    try {
      expect(screen.queryByText('PN-FOOD-012')).not.toBeInTheDocument();
    } finally {
      release?.();
    }
  });

  it('keeps actor identity in cache keys and sends only supported food/refund filters', async () => {
    const seen: URL[] = [];
    mockServer.use(
      http.get('/api/v1/admin/payments', ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ items: [foodPayment()] });
      }),
      http.get('/api/v1/admin/refunds', ({ request }) => {
        seen.push(new URL(request.url));
        return HttpResponse.json({ items: [] });
      }),
    );
    const store = createAppStore();
    const first = store.dispatch(
      financeApi.endpoints.listPayments.initiate({
        scopeKey: 'staff-a',
        shopId: 'shop-one',
        foodOrderId: 'food-order-1',
      }),
    );
    await first.unwrap();
    const second = store.dispatch(
      financeApi.endpoints.listPayments.initiate({
        scopeKey: 'staff-b',
        shopId: 'shop-one',
        foodOrderId: 'food-order-1',
      }),
    );
    await second.unwrap();
    const refunds = store.dispatch(
      financeApi.endpoints.listRefunds.initiate({
        scopeKey: 'staff-b',
        shopId: 'shop-one',
        foodOrderId: 'food-order-1',
        paymentAttemptId: 'food-payment-1',
      }),
    );
    await refunds.unwrap();
    expect(seen).toHaveLength(3);
    for (const url of seen) {
      expect(url.searchParams.get('shopId')).toBe('shop-one');
      expect(url.searchParams.get('foodOrderId')).toBe('food-order-1');
      expect(url.searchParams.has('scopeKey')).toBe(false);
    }
    expect(seen[2].searchParams.get('paymentAttemptId')).toBe('food-payment-1');
    first.unsubscribe();
    second.unsubscribe();
    refunds.unsubscribe();
    store.dispatch(financeApi.util.resetApiState());
  });
});
