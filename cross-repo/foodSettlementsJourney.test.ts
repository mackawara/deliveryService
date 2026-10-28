import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bypass, http, HttpResponse } from 'msw';
import { completeOrder, createFoodWorld, placeOrder, type FoodWorld } from '@api-test/foodFlow';
import { baseApi } from '@/api/baseApi';
import { clearShopCsrfToken, setCsrfToken } from '@/api/csrf';
import type { FoodSettlementPaidBody } from '@/api/dto/foodFinance';
import { foodFinanceApi } from '@/api/endpoints/foodFinance';
import { sessionApi } from '@/api/endpoints/session';
import { shopApi } from '@/api/endpoints/shop';
import { createAppStore } from '@/app/store';
import { mockServer } from '@/mocks/server';

type StaffRole = 'admin' | 'finance' | 'operator';
const PERIOD = { from: '2026-09-20T22:00:00.000Z', to: '2026-09-21T22:00:00.000Z' };
const BANK_ACCOUNT = '1234567890123456';

/**
 * The browser endpoints reach a real loopback Express application and its services.
 * Only the HTTP bridge supplies the fixture staff credentials; the API checks their
 * actual individual roles/town scope. Owner login uses real OTP, cookies and CSRF.
 * Persistence is in memory and WhatsApp/payment transports are recorded adapters.
 */
describe('paired food settlement and rider cash contract', () => {
  let world: FoodWorld;
  let server: ReturnType<FoodWorld['harness']['app']['app']['listen']>;
  let apiOrigin: string;
  let store: ReturnType<typeof createAppStore>;
  let role: StaffRole;
  let cookies: Map<string, string>;
  const observed: { path: string; method: string; key: string | null; body: unknown }[] = [];
  const finance = foodFinanceApi.endpoints;
  const shopId = () => world.seeded.pizzaInn._id;
  const repos = () => world.harness.context.repositories;
  const shopVersion = async (id = shopId()) =>
    (await world.harness.context.services.shops.getShop(id)).version;

  beforeEach(async () => {
    world = await createFoodWorld({
      env: {
        FOOD_SETTLEMENTS_ENABLED: 'true',
        FOOD_SHOP_MANAGEMENT_ENABLED: 'true',
        WHATSAPP_OTP_TEMPLATE_NAME: 'settlements_test_code',
        AUTH_SECRET: 'paired-food-finance-secret-for-local-tests-only',
      },
    });
    expect(world.harness.context.store.kind).toBe('memory');
    server = world.harness.app.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No loopback test port.');
    apiOrigin = `http://127.0.0.1:${address.port}`;
    role = 'finance';
    cookies = new Map();
    observed.length = 0;
    mockServer.use(
      http.all('http://localhost:3000/api/v1/*', async ({ request }) => {
        const source = new URL(request.url);
        const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
        observed.push({
          path: source.pathname,
          method: request.method,
          key: request.headers.get('idempotency-key'),
          body: body ? JSON.parse(body) : undefined,
        });
        const headers = new Headers(request.headers);
        if (source.pathname.startsWith('/api/v1/admin/'))
          headers.set('authorization', `Bearer ${world.harness.apiKeys[role]}`);
        headers.set('cookie', [...cookies.values()].join('; '));
        const response = await globalThis.fetch(
          bypass(`${apiOrigin}${source.pathname}${source.search}`, {
            method: request.method,
            headers,
            body,
          }),
        );
        for (const cookie of response.headers.getSetCookie()) {
          const pair = cookie.split(';')[0];
          cookies.set(pair.split('=')[0], pair);
        }
        return new HttpResponse(await response.text(), {
          status: response.status,
          headers: {
            'content-type': response.headers.get('content-type') ?? 'application/json',
            'cache-control': response.headers.get('cache-control') ?? '',
            ...(response.headers.has('x-next-cursor')
              ? { 'x-next-cursor': response.headers.get('x-next-cursor')! }
              : {}),
          },
        });
      }),
    );
    // Staff API-key authentication bypasses cookie CSRF only in this fixture bridge.
    setCsrfToken('fixture-staff-key');
    store = createAppStore();
  });

  afterEach(async () => {
    store?.dispatch(baseApi.util.resetApiState());
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    await world?.harness.shutdown();
  });

  async function configure(path: string, body: unknown) {
    const response = await globalThis.fetch(
      bypass(`${apiOrigin}/api/v1/admin/food/shops/${shopId()}/${path}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${world.harness.apiKeys[role]}`,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status, await response.text()).toBe(200);
  }
  async function prepare() {
    await configure('settlement-agreement', {
      expectedVersion: await shopVersion(),
      frequency: 'DAILY',
      payoutLagDays: 0,
      eligibilityPolicy: 'ON_SCHEDULE',
      enabled: true,
      effectiveFrom: world.harness.clock.now().toISOString(),
    });
    await configure('payout-details', {
      expectedVersion: await shopVersion(),
      method: 'BANK_TRANSFER',
      accountName: 'Pizza Inn Hwange',
      accountIdentifier: BANK_ACCOUNT,
      provider: 'Shop bank',
      reason: 'Verified with the shop owner.',
    });
    world.harness.clock.set('2026-09-21T08:00:00.000Z');
    const { order } = await placeOrder(world);
    const delivered = await completeOrder(world, order);
    world.harness.clock.set(PERIOD.to);
    return delivered;
  }
  async function draft() {
    return store
      .dispatch(
        finance.createFoodSettlement.initiate({
          shopId: shopId(),
          expectedVersion: await shopVersion(),
          ...PERIOD,
          idempotencyKey: crypto.randomUUID(),
        }),
      )
      .unwrap();
  }
  async function loginOwner(phone = '0772555001') {
    await store.dispatch(shopApi.endpoints.getShopCsrf.initiate()).unwrap();
    const challenge = await store
      .dispatch(
        shopApi.endpoints.requestShopOtp.initiate({
          phone,
          consent: true,
          requestKey: crypto.randomUUID(),
        }),
      )
      .unwrap();
    await world.harness.context.services.otp.settled();
    const delivery = world.harness.whatsapp.sent.at(-1)!.body as {
      template: { components: { parameters: { text: string }[] }[] };
    };
    await store
      .dispatch(
        shopApi.endpoints.verifyShopOtp.initiate({
          challengeId: challenge.challengeId,
          code: delivery.template.components[0].parameters[0].text,
        }),
      )
      .unwrap();
    return store.dispatch(shopApi.endpoints.getShopMe.initiate()).unwrap();
  }
  async function membership(ownerId: string, branchId: string) {
    const branch = await world.harness.context.services.shops.getShop(branchId);
    await repos().shopMemberships.insertOne({
      _id: crypto.randomUUID(),
      ownerId,
      shopId: branchId,
      townId: branch.townId,
      phone: '+263772555001',
      role: 'OWNER',
      status: 'ACTIVE',
      version: 1,
      createdAt: world.harness.clock.now(),
      updatedAt: world.harness.clock.now(),
    });
  }

  it.each(['admin', 'finance'] as const)(
    'lets a %s-only account generate, approve and record exactly one frozen manual payment',
    async (staffRole) => {
      role = staffRole;
      const me = await store.dispatch(sessionApi.endpoints.getMe.initiate()).unwrap();
      expect(me.roles).toEqual([staffRole]);
      expect(me.capabilities).toContain('food.settlements.pay');
      const order = await prepare();
      const statement = await draft();
      expect(statement).toMatchObject({ status: 'DRAFT', amountCents: 1105 });
      expect(statement.lines.map((line) => line.orderId)).toEqual([order._id]);
      expect(JSON.stringify(statement)).not.toContain(BANK_ACCOUNT);
      const approval = {
        id: statement._id,
        expectedVersion: statement.version,
        idempotencyKey: crypto.randomUUID(),
      };
      const approved = await store
        .dispatch(finance.approveFoodSettlement.initiate(approval))
        .unwrap();
      await configure('payout-details', {
        expectedVersion: await shopVersion(),
        method: 'ECOCASH',
        accountName: 'Future recipient',
        accountIdentifier: '+263772555888',
        provider: 'EcoCash',
        reason: 'New account applies to future statements.',
      });
      const frozen = await store
        .dispatch(finance.getFoodSettlement.initiate({ id: statement._id }, { subscribe: false }))
        .unwrap();
      expect(frozen.destinationSnapshot).toEqual(approved.destinationSnapshot);
      const outstandingBefore = await store
        .dispatch(finance.getRiderCashOutstanding.initiate({}, { subscribe: false }))
        .unwrap();
      expect(outstandingBefore.outstandingCents).toBe(order.amounts.totalCents);
      const payment: FoodSettlementPaidBody = {
        id: statement._id,
        expectedVersion: approved.version,
        amountCents: approved.amountCents,
        method: approved.destinationSnapshot.method,
        destinationId: approved.destinationSnapshot._id,
        destinationVersion: approved.destinationSnapshot.version,
        paidAt: world.harness.clock.now().toISOString(),
        reference: `MANUAL-${staffRole}-001`,
        idempotencyKey: crypto.randomUUID(),
      };
      await expect(
        store
          .dispatch(
            finance.recordFoodSettlementPaid.initiate({
              ...payment,
              amountCents: payment.amountCents + 1,
              idempotencyKey: crypto.randomUUID(),
            }),
          )
          .unwrap(),
      ).rejects.toMatchObject({ status: 422, code: 'SETTLEMENT_AMOUNT_MISMATCH' });
      const paid = await store
        .dispatch(finance.recordFoodSettlementPaid.initiate(payment))
        .unwrap();
      expect(paid).toMatchObject({
        status: 'PAID',
        payment: { amountCents: 1105, method: 'BANK_TRANSFER', reference: payment.reference },
      });
      expect(
        await store.dispatch(finance.recordFoodSettlementPaid.initiate(payment)).unwrap(),
      ).toEqual(paid);
      expect(
        await store.dispatch(finance.approveFoodSettlement.initiate(approval)).unwrap(),
      ).toEqual(approved);
      await expect(
        store
          .dispatch(
            finance.voidFoodSettlement.initiate({
              ...approval,
              idempotencyKey: crypto.randomUUID(),
              reason: 'A stale tab attempts to void the payment.',
            }),
          )
          .unwrap(),
      ).rejects.toMatchObject({ status: 409, kind: 'conflict' });
      expect(await repos().shopPayouts.countDocuments({})).toBe(1);
      const balances = await store
        .dispatch(finance.listFoodShopBalances.initiate({}, { subscribe: false }))
        .unwrap();
      expect(balances.items.find((balance) => balance.shopId === shopId())).toMatchObject({
        balanceCents: 0,
        paidCents: 1105,
      });
      const outstandingAfter = await store
        .dispatch(
          finance.getRiderCashOutstanding.initiate({}, { subscribe: false, forceRefetch: true }),
        )
        .unwrap();
      expect(outstandingAfter.outstandingCents).toBe(outstandingBefore.outstandingCents);
      const paidRequests = observed.filter((request) => request.path.endsWith('/paid'));
      expect(paidRequests.slice(-2).map((request) => request.key)).toEqual([
        payment.idempotencyKey,
        payment.idempotencyKey,
      ]);
      expect(paidRequests.at(-1)?.body).not.toHaveProperty('scopeKey');
    },
  );

  it('keeps two owner branches separate and rechecks access on payout-detail replay', async () => {
    await prepare();
    const statement = await draft();
    const owner = await loginOwner();
    const secondBranch = world.seeded.chickenInn._id;
    await membership(owner.owner.id, shopId());
    await membership(owner.owner.id, secondBranch);
    const scope = { ownerId: owner.owner.id, shopId: shopId() };
    const first = await store
      .dispatch(finance.getShopFoodEarnings.initiate(scope, { subscribe: false }))
      .unwrap();
    const second = await store
      .dispatch(
        finance.getShopFoodEarnings.initiate(
          { ...scope, shopId: secondBranch },
          { subscribe: false },
        ),
      )
      .unwrap();
    expect(first.balance).toMatchObject({ shopId: shopId(), earnedCents: 1105 });
    expect(first.items.every((entry) => entry.shopId === shopId())).toBe(true);
    expect(second.balance).toMatchObject({ shopId: secondBranch, earnedCents: 0 });
    expect(second.items).toEqual([]);
    await expect(
      store
        .dispatch(
          finance.getShopFoodSettlement.initiate(
            {
              ...scope,
              shopId: secondBranch,
              id: statement._id,
            },
            { subscribe: false },
          ),
        )
        .unwrap(),
    ).rejects.toMatchObject({ status: 403 });
    // Authorization denial schedules the app's protected-cache reset. Let it finish
    // before starting an independent authorized request, just as the UI remount does.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const details = await store
      .dispatch(finance.getShopPayoutDetails.initiate(scope, { subscribe: false }))
      .unwrap();
    expect(JSON.stringify(details)).not.toContain(BANK_ACCOUNT);
    const update = {
      ...scope,
      expectedVersion: details.shopVersion,
      method: 'ECOCASH' as const,
      accountName: 'Pizza Inn owner',
      accountIdentifier: '+263772555001',
      provider: 'EcoCash',
      reason: 'Owner verified their replacement account.',
      idempotencyKey: crypto.randomUUID(),
    };
    const saved = await store.dispatch(finance.updateShopPayoutDetails.initiate(update)).unwrap();
    expect(saved.method).toBe('ECOCASH');
    expect(saved.accountIdentifier).not.toBe(update.accountIdentifier);
    const csv = await store
      .dispatch(finance.exportShopFoodEarnings.initiate({ ...scope, limit: 1 }))
      .unwrap();
    expect(csv.csv).toContain('amountCents');
    expect(csv.nextCursor).toEqual(expect.any(String));
    expect(csv.csv).not.toContain(BANK_ACCOUNT);
    await repos().shopMemberships.updateMany(
      { ownerId: scope.ownerId, shopId: scope.shopId },
      { $set: { status: 'REVOKED' } },
    );
    await expect(
      store.dispatch(finance.updateShopPayoutDetails.initiate(update)).unwrap(),
    ).rejects.toMatchObject({ status: 403 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const otherBranch = await store
      .dispatch(
        finance.getShopFoodEarnings.initiate(
          { ...scope, shopId: secondBranch },
          { subscribe: false, forceRefetch: true },
        ),
      )
      .unwrap();
    expect(otherBranch.balance.shopId).toBe(secondBranch);
    cookies.clear();
    clearShopCsrfToken();
    store.dispatch(baseApi.util.resetApiState());
    const outsider = await loginOwner('0772555002');
    const outsideScope = { ownerId: outsider.owner.id, shopId: shopId() };
    await expect(
      store
        .dispatch(finance.getShopFoodEarnings.initiate(outsideScope, { subscribe: false }))
        .unwrap(),
    ).rejects.toMatchObject({ status: 403 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await expect(
      store
        .dispatch(finance.updateShopPayoutDetails.initiate({ ...update, ...outsideScope }))
        .unwrap(),
    ).rejects.toMatchObject({ status: 403 });
  });

  it.each([
    { receivedCents: 1500, differenceCents: -100, resolution: 'CASH_RECEIVED' as const },
    { receivedCents: 1700, differenceCents: 100, resolution: 'CASH_RETURNED' as const },
  ])('preserves original evidence for a $differenceCents-cent cash mismatch', async (example) => {
    const order = await prepare();
    const entry = (await repos().cashLedger.findOne({ bookingId: order.bookingId }))!;
    const handIn = await store
      .dispatch(
        finance.recordRiderCashHandIn.initiate({
          driverId: entry.driverId!,
          ledgerEntryIds: [entry._id],
          collectionVersions: { [entry._id]: entry.version },
          amountReceivedCents: example.receivedCents,
          receiptReference: 'COUNT-SHEET-001',
          reason: 'Counted together at the cash desk.',
          evidence: 'Signed count sheet 001.',
          idempotencyKey: crypto.randomUUID(),
        }),
      )
      .unwrap();
    expect(handIn.entry.handIn).toEqual({
      expectedCents: 1600,
      receivedCents: example.receivedCents,
      differenceCents: example.differenceCents,
    });
    expect(handIn.discrepancy?.foodOrderIds).toContain(order._id);
    const discrepancy = handIn.discrepancy!;
    const resolved = await store
      .dispatch(
        finance.resolveCashDiscrepancy.initiate({
          id: discrepancy._id,
          expectedVersion: discrepancy.version,
          resolution: example.resolution,
          amountCents: 100,
          reason: 'Counted and signed the corrective cash movement.',
          evidence: 'Correction receipt 002.',
          idempotencyKey: crypto.randomUUID(),
        }),
      )
      .unwrap();
    expect(resolved.discrepancy.discrepancy).toMatchObject({
      status: 'RESOLVED',
      expectedCents: 1600,
      receivedCents: example.receivedCents,
      differenceCents: example.differenceCents,
      currentReceivedCents: 1600,
      evidence: 'Signed count sheet 001.',
    });
    const outstanding = await store
      .dispatch(
        finance.getRiderCashOutstanding.initiate(
          { driverId: entry.driverId! },
          { subscribe: false },
        ),
      )
      .unwrap();
    expect(outstanding).toMatchObject({ outstandingCents: 0, overageCents: 0 });
    const balances = await store
      .dispatch(finance.listFoodShopBalances.initiate({}, { subscribe: false }))
      .unwrap();
    expect(balances.items.find((balance) => balance.shopId === shopId())).toMatchObject({
      earnedCents: 1105,
      paidCents: 0,
    });
  });

  it('rejects an operator before financial reads or mutations', async () => {
    role = 'operator';
    await expect(
      store.dispatch(finance.listFoodSettlements.initiate({}, { subscribe: false })).unwrap(),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      store
        .dispatch(
          finance.createFoodSettlement.initiate({
            shopId: shopId(),
            expectedVersion: await shopVersion(),
            ...PERIOD,
            idempotencyKey: crypto.randomUUID(),
          }),
        )
        .unwrap(),
    ).rejects.toMatchObject({ status: 403 });
    expect(await repos().foodSettlements.countDocuments({})).toBe(0);
  });
});
