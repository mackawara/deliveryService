import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { setCsrfToken, setShopCsrfToken } from '@/api/csrf';
import { foodFinanceApi } from '@/api/endpoints/foodFinance';
import { createAppStore } from '@/app/store';
import { mockServer } from '@/mocks/server';
import {
  cashCollection,
  cashDiscrepancy,
  foodDestination,
  foodEarnings,
  foodSettlement,
} from './foodFinanceFixture';

describe('food settlement API contracts', () => {
  it('partitions earnings caches by owner and branch and keeps server totals intact', async () => {
    const requests: string[] = [];
    mockServer.use(
      http.get('/api/v1/shop/shops/:shopId/earnings', ({ params, request }) => {
        requests.push(request.url);
        return HttpResponse.json({
          ...foodEarnings,
          items: [],
          balance: { ...foodEarnings.balance, shopId: params.shopId, availableCents: -80 },
        });
      }),
    );
    const store = createAppStore();
    const first = store.dispatch(
      foodFinanceApi.endpoints.getShopFoodEarnings.initiate({
        ownerId: 'owner-1',
        shopId: 'shop-1',
        cursor: 'server-cursor',
        limit: 20,
      }),
    );
    const second = store.dispatch(
      foodFinanceApi.endpoints.getShopFoodEarnings.initiate({
        ownerId: 'owner-2',
        shopId: 'shop-1',
        cursor: 'server-cursor',
        limit: 20,
      }),
    );
    const otherBranch = store.dispatch(
      foodFinanceApi.endpoints.getShopFoodEarnings.initiate({
        ownerId: 'owner-1',
        shopId: 'shop-2',
      }),
    );
    const values = await Promise.all([first.unwrap(), second.unwrap(), otherBranch.unwrap()]);
    expect(values[0].balance).toMatchObject({ availableCents: -80, paidCents: 900 });
    expect(values[2].balance.shopId).toBe('shop-2');
    expect(requests).toHaveLength(3);
    expect(requests.every((url) => !url.includes('ownerId'))).toBe(true);
    expect(new URL(requests[0]).searchParams.get('cursor')).toBe('server-cursor');
    expect(new URL(requests[0]).searchParams.get('limit')).toBe('20');
    first.unsubscribe();
    second.unsubscribe();
    otherBranch.unsubscribe();
    store.dispatch(foodFinanceApi.util.resetApiState());
  });

  it('sends owner CSRF, shop version and a stable supplied key when replacing payout details', async () => {
    setShopCsrfToken('owner-csrf');
    setCsrfToken('staff-csrf');
    const seen = vi.fn();
    mockServer.use(
      http.put('/api/v1/shop/shops/shop-1/payout-details', async ({ request }) => {
        seen({
          key: request.headers.get('idempotency-key'),
          csrf: request.headers.get('x-csrf-token'),
          body: await request.json(),
        });
        return HttpResponse.json({ payoutDetails: foodDestination });
      }),
    );
    const store = createAppStore();
    const args = {
      ownerId: 'owner-1',
      shopId: 'shop-1',
      expectedVersion: 7,
      method: 'ECOCASH' as const,
      accountName: 'Lunch Spot',
      accountIdentifier: '+263772550010',
      provider: 'EcoCash',
      reason: 'Owner confirmed destination',
      idempotencyKey: 'destination-command-1',
    };
    const first = await store
      .dispatch(foodFinanceApi.endpoints.updateShopPayoutDetails.initiate(args))
      .unwrap();
    await store.dispatch(foodFinanceApi.endpoints.updateShopPayoutDetails.initiate(args)).unwrap();
    expect(first.accountIdentifier).toBe('••••0010');
    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen).toHaveBeenLastCalledWith({
      key: 'destination-command-1',
      csrf: 'owner-csrf',
      body: {
        expectedVersion: 7,
        method: 'ECOCASH',
        accountName: 'Lunch Spot',
        accountIdentifier: '+263772550010',
        provider: 'EcoCash',
        reason: 'Owner confirmed destination',
      },
    });
    store.dispatch(foodFinanceApi.util.resetApiState());
  });

  it('preserves server-side filters and excludes staff cache identity from strict draft bodies', async () => {
    setCsrfToken('staff-csrf');
    const list = vi.fn();
    const create = vi.fn();
    mockServer.use(
      http.get('/api/v1/admin/food/settlements', ({ request }) => {
        list(Object.fromEntries(new URL(request.url).searchParams));
        return HttpResponse.json({ items: [foodSettlement], nextCursor: 'next-page' });
      }),
      http.post('/api/v1/admin/food/settlements', async ({ request }) => {
        create({
          body: await request.json(),
          key: request.headers.get('idempotency-key'),
          csrf: request.headers.get('x-csrf-token'),
        });
        return HttpResponse.json({ settlement: foodSettlement }, { status: 201 });
      }),
    );
    const store = createAppStore();
    const subscription = store.dispatch(
      foodFinanceApi.endpoints.listFoodSettlements.initiate({
        scopeKey: 'finance-town-1',
        shopId: 'shop-1',
        townId: 'town-1',
        status: 'DRAFT',
        periodStart: foodSettlement.from,
        periodEnd: foodSettlement.to,
        cursor: 'previous-page',
        limit: 25,
      }),
    );
    expect((await subscription.unwrap()).nextCursor).toBe('next-page');
    expect(list).toHaveBeenCalledWith({
      shopId: 'shop-1',
      townId: 'town-1',
      status: 'DRAFT',
      periodStart: foodSettlement.from,
      periodEnd: foodSettlement.to,
      cursor: 'previous-page',
      limit: '25',
    });
    await store
      .dispatch(
        foodFinanceApi.endpoints.createFoodSettlement.initiate({
          scopeKey: 'finance-town-1',
          shopId: 'shop-1',
          expectedVersion: 7,
          from: foodSettlement.from,
          to: foodSettlement.to,
          agreementId: 'agreement-1',
          idempotencyKey: 'draft-1',
        }),
      )
      .unwrap();
    expect(create).toHaveBeenCalledWith({
      key: 'draft-1',
      csrf: 'staff-csrf',
      body: {
        shopId: 'shop-1',
        expectedVersion: 7,
        from: foodSettlement.from,
        to: foodSettlement.to,
        agreementId: 'agreement-1',
      },
    });
    subscription.unsubscribe();
    store.dispatch(foodFinanceApi.util.resetApiState());
  });

  it('does not optimistically mark paid and returns structured 409 and 422 failures', async () => {
    setCsrfToken('staff-csrf');
    const approved = { ...foodSettlement, status: 'APPROVED' as const, version: 2 };
    const received = vi.fn();
    mockServer.use(
      http.get('/api/v1/admin/food/settlements/settlement-1', () =>
        HttpResponse.json({ settlement: approved }),
      ),
      http.post('/api/v1/admin/food/settlements/settlement-1/paid', async ({ request }) => {
        received({ key: request.headers.get('idempotency-key'), body: await request.json() });
        return HttpResponse.json(
          {
            code: 'VERSION_CONFLICT',
            message: 'Another staff member changed this statement.',
          },
          { status: 409 },
        );
      }),
      http.post('/api/v1/admin/food/settlements/settlement-1/approve', () =>
        HttpResponse.json(
          {
            code: 'PAYOUT_DESTINATION_REQUIRED',
            message: 'Enter the payout destination.',
            fieldErrors: [{ field: 'destinationId', message: 'Payout destination is missing.' }],
          },
          { status: 422 },
        ),
      ),
    );
    const store = createAppStore();
    const queryArgs = { scopeKey: 'finance-town-1', id: 'settlement-1' };
    const query = store.dispatch(foodFinanceApi.endpoints.getFoodSettlement.initiate(queryArgs));
    await query.unwrap();
    const paid = store.dispatch(
      foodFinanceApi.endpoints.recordFoodSettlementPaid.initiate({
        ...queryArgs,
        expectedVersion: 2,
        amountCents: 1080,
        method: 'ECOCASH',
        paidAt: '2026-10-27T08:00:00+02:00',
        reference: 'EXTERNAL-001',
        destinationId: 'destination-1',
        destinationVersion: 1,
        idempotencyKey: 'payment-1',
      }),
    );
    expect(
      foodFinanceApi.endpoints.getFoodSettlement.select(queryArgs)(store.getState()).data?.status,
    ).toBe('APPROVED');
    await expect(paid.unwrap()).rejects.toMatchObject({
      kind: 'conflict',
      code: 'VERSION_CONFLICT',
    });
    expect(received).toHaveBeenCalledWith({
      key: 'payment-1',
      body: {
        expectedVersion: 2,
        amountCents: 1080,
        method: 'ECOCASH',
        paidAt: '2026-10-27T08:00:00+02:00',
        reference: 'EXTERNAL-001',
        destinationId: 'destination-1',
        destinationVersion: 1,
      },
    });
    await expect(
      store
        .dispatch(
          foodFinanceApi.endpoints.approveFoodSettlement.initiate({
            ...queryArgs,
            expectedVersion: 2,
            idempotencyKey: 'approve-1',
          }),
        )
        .unwrap(),
    ).rejects.toMatchObject({
      kind: 'validation',
      fieldErrors: [{ field: 'destinationId', message: 'Payout destination is missing.' }],
    });
    query.unsubscribe();
    store.dispatch(foodFinanceApi.util.resetApiState());
  });

  it('rejects a later stale read that would roll a paid statement back to approved', async () => {
    let statement = { ...foodSettlement, status: 'PAID' as 'PAID' | 'APPROVED', version: 3 };
    mockServer.use(
      http.get('/api/v1/admin/food/settlements/settlement-1', () =>
        HttpResponse.json({ settlement: statement }),
      ),
    );
    const store = createAppStore();
    const args = { id: 'settlement-1' };
    const query = store.dispatch(foodFinanceApi.endpoints.getFoodSettlement.initiate(args));
    await query.unwrap();
    statement = { ...statement, status: 'APPROVED', version: 2 };
    await query.refetch().unwrap();
    expect(
      foodFinanceApi.endpoints.getFoodSettlement.select(args)(store.getState()).data,
    ).toMatchObject({ status: 'PAID', version: 3 });
    query.unsubscribe();
    store.dispatch(foodFinanceApi.util.resetApiState());
  });

  it('exports server-produced bounded CSV with its next cursor', async () => {
    const csv = 'orderId,amountCents\r\norder-1,1200\r\n';
    mockServer.use(
      http.get('/api/v1/shop/shops/shop-1/earnings/export', ({ request }) => {
        expect(request.headers.get('accept')).toBe('text/csv');
        expect(new URL(request.url).searchParams.get('cursor')).toBe('page-1');
        return new HttpResponse(csv, {
          headers: { 'Content-Type': 'text/csv', 'X-Next-Cursor': 'page-2' },
        });
      }),
    );
    const store = createAppStore();
    const result = store.dispatch(
      foodFinanceApi.endpoints.exportShopFoodEarnings.initiate({
        ownerId: 'owner-1',
        shopId: 'shop-1',
        cursor: 'page-1',
        limit: 100,
      }),
    );
    expect(await result.unwrap()).toEqual({ csv, nextCursor: 'page-2' });
    result.unsubscribe();
    store.dispatch(foodFinanceApi.util.resetApiState());
  });

  it('preserves expected collection versions and actual hand-in amounts, then resolves by version', async () => {
    setCsrfToken('staff-csrf');
    const seen = vi.fn();
    mockServer.use(
      http.post('/api/v1/admin/drivers/driver-1/cash-remittances', async ({ request }) => {
        seen({ key: request.headers.get('idempotency-key'), body: await request.json() });
        return HttpResponse.json(
          { entry: cashCollection, discrepancy: cashDiscrepancy },
          { status: 201 },
        );
      }),
      http.post('/api/v1/admin/cash-discrepancies/discrepancy-1/resolve', async ({ request }) => {
        seen({ key: request.headers.get('idempotency-key'), body: await request.json() });
        return HttpResponse.json({ discrepancy: cashDiscrepancy, correction: cashCollection });
      }),
    );
    const store = createAppStore();
    const result = await store
      .dispatch(
        foodFinanceApi.endpoints.recordRiderCashHandIn.initiate({
          scopeKey: 'finance-town-1',
          driverId: 'driver-1',
          ledgerEntryIds: ['collection-1'],
          collectionVersions: { 'collection-1': 1 },
          amountReceivedCents: 1300,
          receiptReference: 'RECEIPT-1',
          reason: 'Rider short hand-in',
          evidence: 'Signed receipt',
          idempotencyKey: 'hand-in-1',
        }),
      )
      .unwrap();
    expect(result.discrepancy?.discrepancy).toMatchObject({
      expectedCents: 1400,
      receivedCents: 1300,
      differenceCents: -100,
    });
    expect(seen).toHaveBeenCalledWith({
      key: 'hand-in-1',
      body: {
        ledgerEntryIds: ['collection-1'],
        collectionVersions: { 'collection-1': 1 },
        amountReceivedCents: 1300,
        receiptReference: 'RECEIPT-1',
        reason: 'Rider short hand-in',
        evidence: 'Signed receipt',
      },
    });
    await store
      .dispatch(
        foodFinanceApi.endpoints.resolveCashDiscrepancy.initiate({
          scopeKey: 'finance-town-1',
          id: 'discrepancy-1',
          expectedVersion: 1,
          resolution: 'CASH_RECEIVED',
          amountCents: 100,
          reason: 'Remaining cash received',
          idempotencyKey: 'resolve-1',
        }),
      )
      .unwrap();
    expect(seen).toHaveBeenLastCalledWith({
      key: 'resolve-1',
      body: {
        expectedVersion: 1,
        resolution: 'CASH_RECEIVED',
        amountCents: 100,
        reason: 'Remaining cash received',
      },
    });
    store.dispatch(foodFinanceApi.util.resetApiState());
  });
});
