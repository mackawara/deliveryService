import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bypass, http, HttpResponse } from 'msw';
import {
  createFoodWorld,
  FoodFlowDriver,
  FoodChat,
  rowsOf,
  tapRow,
  inbound,
  DROPOFF_POINTS,
} from '@api-test/foodFlow';
import { FoodWorkflowWorker } from '@api-src/workers/foodWorkflowWorker';
import { goAvailable } from '@api-test/booking';
import { shopApi } from '@/api/endpoints/shop';
import { baseApi } from '@/api/baseApi';
import { createAppStore } from '@/app/store';
import { mockServer } from '@/mocks/server';
import { ShopProfilePage } from '@/features/shop/ShopProfilePage';
import { schedulePayload } from '@/features/shop/settlement';
import { renderRoutes } from '../tests/testUtils';

// This bridge forwards requests and cookies unchanged to a real local Express app.
// No shop, terms, image or command response is mocked. All infrastructure stays in memory.
describe('dashboard + API Order Food journey', () => {
  let world: Awaited<ReturnType<typeof createFoodWorld>>;
  let server: ReturnType<typeof world.harness.app.app.listen>;
  let apiOrigin: string;
  let cookies: Map<string, string>;
  let store: ReturnType<typeof createAppStore>;
  const seen: { method: string; path: string; body: unknown }[] = [];
  async function direct(path: string, body: unknown) {
    const response = await globalThis.fetch(
      bypass(`${apiOrigin}/api/v1${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${world.harness.apiKeys.admin}`,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      }),
    );
    const result = await response.json();
    expect([200, 201], JSON.stringify(result)).toContain(response.status);
    return result;
  }
  async function code() {
    await world.harness.context.services.otp.settled();
    const delivery = world.harness.whatsapp.sent.at(-1)!.body as {
      template: { components: { parameters: { text: string }[] }[] };
    };
    return delivery.template.components[0].parameters[0].text;
  }
  beforeEach(async () => {
    world = await createFoodWorld({
      env: {
        FOOD_SHOP_MANAGEMENT_ENABLED: 'true',
        FOOD_ORDERING_TEST_MODE: 'false',
        WHATSAPP_OTP_TEMPLATE_NAME: 'sandbox_code',
        WHATSAPP_FOOD_ORDER_REQUEST_TEMPLATE: 'sandbox_order',
        WHATSAPP_FOOD_SHOP_STATUS_TEMPLATE: 'sandbox_shop',
        WHATSAPP_FOOD_STATUS_TEMPLATE: 'sandbox_status',
      },
    });
    expect(world.harness.context.store.kind).toBe('memory');
    server = world.harness.app.app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No local test port');
    apiOrigin = `http://127.0.0.1:${address.port}`;
    cookies = new Map();
    seen.length = 0;
    mockServer.use(
      http.all('http://localhost:3000/api/v1/*', async ({ request }) => {
        const source = new URL(request.url);
        const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text();
        seen.push({
          method: request.method,
          path: source.pathname,
          body: body ? JSON.parse(body) : undefined,
        });
        const headers = new Headers(request.headers);
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
          headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
        });
      }),
    );
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

  it('verifies an owner and branch contact, preserves approval on opening, and orders the same photographed catalogue through explicit acceptance and READY', async () => {
    const user = userEvent.setup();
    await store.dispatch(shopApi.endpoints.getShopCsrf.initiate()).unwrap();
    const login = await store
      .dispatch(
        shopApi.endpoints.requestShopOtp.initiate({
          phone: '0772555001',
          consent: true,
          requestKey: crypto.randomUUID(),
        }),
      )
      .unwrap();
    await store
      .dispatch(
        shopApi.endpoints.verifyShopOtp.initiate({
          challengeId: login.challengeId,
          code: await code(),
        }),
      )
      .unwrap();
    const me = await store.dispatch(shopApi.endpoints.getShopMe.initiate()).unwrap();
    expect(me.owner.id).toBeTruthy();
    const towns = await store.dispatch(shopApi.endpoints.listShopTowns.initiate()).unwrap();
    expect(Object.keys(towns[0]).sort()).toEqual(['_id', 'name', 'serviceArea']);
    const schedule = schedulePayload({
      frequency: 'WEEKLY',
      timezone: 'Africa/Harare',
      cutoffTime: '21:30',
      anchor: '0',
    });
    const details = {
      name: 'Lunch Spot',
      contactPhone: '0772555010',
      townId: towns[0]._id,
      pickup: { lat: -18.42, lng: 26.45, address: '4 Main Street' },
      requestedSettlement: schedule,
    };
    let shop = await store
      .dispatch(shopApi.endpoints.createShop.initiate({ ...details, branchName: 'Centre' }))
      .unwrap();
    const second = await store
      .dispatch(
        shopApi.endpoints.createShop.initiate({
          ...details,
          branchName: 'Baobab',
          contactPhone: '0772555011',
        }),
      )
      .unwrap();
    expect(second._id).not.toBe(shop._id);
    expect(shop.whatsappOptIn).toBe(false); // Login consent must never become shop consent.
    const view = renderRoutes({
      routes: [{ path: '/shop/:shopId/profile', element: <ShopProfilePage /> }],
      initialEntries: [`/shop/${shop._id}/profile`],
      store,
    });
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Send contact verification code' }));
    await user.type(await screen.findByLabelText('Branch contact code'), await code());
    await user.click(screen.getByRole('button', { name: 'Verify contact and record consent' }));
    expect(await screen.findByText(/Order messages enabled for/)).toBeInTheDocument();
    shop = await store
      .dispatch(shopApi.endpoints.getShop.initiate(shop._id, { forceRefetch: true }))
      .unwrap();
    await direct('/admin/food/packing-profiles', {
      townId: shop.townId,
      profileVersion: 2,
      name: 'Meal box',
      unitDefinition: '4608 cubic centimetres / 800g',
      capacityRule: { volumeCm3: 4608, weightGrams: 800, minimumUnits: 0.1 },
      vehicleCapacityUnits: { MOTORCYCLE: 4, CAR: 12 },
      packingEfficiency: 0.7,
    });
    const meal = await store
      .dispatch(
        shopApi.endpoints.createShopItem.initiate({
          shopId: shop._id,
          name: 'Lunch box',
          category: 'Lunch',
          priceCents: 650,
          deliverySize: {
            weightGrams: 800,
            dimensionsCm: { length: 32, width: 32, height: 4.5 },
            profileVersion: 2,
          },
        }),
      )
      .unwrap();
    // A real validated source image from the API fixture is uploaded through the dashboard endpoint.
    const { readFile } = await import('node:fs/promises');
    const photo = (await readFile(`${world.seeded.folder}/photos/margherita.png`)).toString(
      'base64',
    );
    await store
      .dispatch(
        shopApi.endpoints.uploadShopImage.initiate({
          shopId: shop._id,
          expectedVersion: shop.version,
          base64: photo,
        }),
      )
      .unwrap();
    await store
      .dispatch(
        shopApi.endpoints.uploadShopImage.initiate({
          shopId: shop._id,
          itemId: meal._id,
          expectedVersion: meal.version,
          base64: photo,
        }),
      )
      .unwrap();
    shop = await store
      .dispatch(shopApi.endpoints.getShop.initiate(shop._id, { forceRefetch: true }))
      .unwrap();
    expect(shop.thumbnailBase64).toBeTruthy();
    const items = await store
      .dispatch(shopApi.endpoints.listShopItems.initiate({ shopId: shop._id }))
      .unwrap();
    expect(items.items[0].thumbnailBase64).toBeTruthy();
    expect(JSON.stringify(items)).not.toContain('originalPhoto');
    const termsBody = {
      basisPoints: 1000,
      reference: 'FIRST',
      schedule,
      businessConfirmed: true,
      effectiveFrom: world.harness.clock.now().toISOString(),
    };
    const first = await direct(`/admin/food/shops/${shop._id}/terms`, {
      ...termsBody,
      expectedVersion: shop.version,
    });
    const latest = await direct(`/admin/food/shops/${shop._id}/terms`, {
      ...termsBody,
      reference: 'LATEST',
      basisPoints: 1250,
      expectedVersion: first.shop.version,
    });
    await act(async () => {
      store.dispatch(baseApi.util.invalidateTags(['Shop', 'ShopTerms']));
    });
    expect(await screen.findByText(/Proposal v2:/)).toHaveTextContent('Sunday');
    await user.click(screen.getByRole('button', { name: 'Acknowledge latest terms' }));
    await waitFor(() =>
      expect(
        seen.some(
          (request) =>
            request.path.endsWith('/terms-requests') &&
            (request.body as { acknowledgeTermsId?: string })?.acknowledgeTermsId ===
              latest.terms._id,
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Acknowledge latest terms' }),
      ).not.toBeInTheDocument(),
    );
    shop = await store
      .dispatch(shopApi.endpoints.getShop.initiate(shop._id, { forceRefetch: true }))
      .unwrap();
    await direct(`/admin/food/shops/${shop._id}/review`, {
      expectedVersion: shop.version,
      decision: 'APPROVED',
      reason: 'Sandbox pickup verified',
      zoneCode: 'A',
      estimate: { minMinutes: 20, maxMinutes: 35 },
    });
    await act(async () => {
      store.dispatch(baseApi.util.invalidateTags(['Shop']));
    });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Open branch for orders' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('switch', { name: 'Open branch for orders' }));
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Open branch for orders' })).toBeChecked(),
    );
    await waitFor(() =>
      expect(seen.filter((request) => request.method === 'PATCH').at(-1)?.body).toEqual(
        expect.objectContaining({ isOpen: true }),
      ),
    );
    expect(seen.filter((request) => request.method === 'PATCH').at(-1)?.body).not.toHaveProperty(
      'pickup',
    );
    shop = await store
      .dispatch(shopApi.endpoints.getShop.initiate(shop._id, { forceRefetch: true }))
      .unwrap();
    expect(shop).toMatchObject({ isOpen: true, approvalState: 'APPROVED', termsVersion: 2 });
    view.unmount();
    // Reload with an empty client cache: thumbnail and acknowledged terms must survive.
    await act(async () => {
      store.dispatch(baseApi.util.resetApiState());
    });
    const reloaded = await store.dispatch(shopApi.endpoints.getShop.initiate(shop._id)).unwrap();
    expect(reloaded.thumbnailBase64).toBe(shop.thumbnailBase64);
    const services = world.harness.context.services;
    const repos = world.harness.context.repositories;
    const { driver, customer } = await FoodFlowDriver.open(world);
    const shops = await driver.init();
    expect(rowsOf(shops).some((row) => row.title === 'Lunch Spot')).toBe(true);
    expect(rowsOf(shops).some((row) => row.payload.shop_id === second._id)).toBe(false);
    const menu = await driver.tap(tapRow(shops, 'Lunch Spot'));
    expect(rowsOf(menu).find((row) => row.title === meal.name)).toMatchObject({ hasImage: true });
    const quantity = await driver.tap(tapRow(menu, meal.name));
    expect(quantity.data?.item_id).toBe(meal._id);
    await driver.tap({ action: 'ADD_TO_CART', item_id: meal._id, quantity: '2' });
    const cartPage = await driver.tap({ action: 'VIEW_CART' });
    const review = await driver.tap(tapRow(cartPage, 'Checkout'));
    await driver.tap({ action: 'SUBMIT_CART', cart_version: review.data?.cart_version });
    await world.harness.drainOutbox();
    const chat = new FoodChat(world);
    await chat.pin(DROPOFF_POINTS.zoneB);
    const confirmation = chat
      .lastButtons()
      .find((button) => button.id.startsWith('FOOD_CONFIRM:'))!;
    await chat.button(confirmation.id);
    let order = await repos.foodOrders.findOne({ customerId: customer._id, shopId: shop._id });
    if (!order) throw new Error('Customer confirmation did not create an order');
    expect(order.status).toBe('AWAITING_SHOP');
    await expect(
      store
        .dispatch(
          shopApi.endpoints.updateShop.initiate({
            shopId: shop._id,
            expectedVersion: shop.version,
            contactPhone: '0772555099',
          }),
        )
        .unwrap(),
    ).rejects.toMatchObject({ code: 'SHOP_CONTACT_IN_USE' });
    expect(order.amounts.foodSubtotalCents).toBe(1300);
    expect(order.amounts.commissionPolicySnapshot.basisPoints).toBe(1250);
    expect(order.amounts.settlementPolicySnapshot).toMatchObject(schedule);
    expect(await repos.assignments.countDocuments({ bookingId: order.bookingId })).toBe(0);
    expect(
      world.harness.whatsapp.sent.some(
        (entry) =>
          (entry.body as { to?: string; template?: { name: string } }).to === shop.contactPhone &&
          (entry.body as { template?: { name: string } }).template?.name === 'sandbox_order',
      ),
    ).toBe(true);
    const original = structuredClone({
      amounts: order.amounts,
      commission: order.amounts.commissionPolicySnapshot,
      settlement: order.amounts.settlementPolicySnapshot,
    });
    await services.router.handleWebhook(
      inbound(shop.contactPhone.slice(1), services.foodShopMessages.action(order, 'A20')),
    );
    order = await services.foodOrders.getById(order._id);
    expect(order.status).toBe('PREPARING');
    await expect(
      store
        .dispatch(
          shopApi.endpoints.updateShop.initiate({
            shopId: shop._id,
            expectedVersion: shop.version,
            contactPhone: '0772555099',
          }),
        )
        .unwrap(),
    ).rejects.toMatchObject({ code: 'SHOP_CONTACT_IN_USE' });
    expect(await repos.assignments.countDocuments({ bookingId: order.bookingId })).toBe(0);
    await goAvailable(world.harness, 'moto');
    await services.router.handleWebhook(
      inbound(shop.contactPhone.slice(1), services.foodShopMessages.action(order, 'READY')),
    );
    await new FoodWorkflowWorker(world.harness.context).runOnce();
    expect((await services.foodOrders.getById(order._id)).status).toBe('READY');
    expect(await repos.assignments.countDocuments({ bookingId: order.bookingId })).toBe(1);
    const confirmedItems = await repos.foodOrderItems.find({ orderId: order._id });
    await store
      .dispatch(
        shopApi.endpoints.updateShopItem.initiate({
          shopId: shop._id,
          itemId: meal._id,
          expectedVersion: items.items[0].version,
          name: 'New meal name',
          priceCents: 900,
        }),
      )
      .unwrap();
    expect(await repos.foodOrderItems.find({ orderId: order._id })).toEqual(confirmedItems);
    const newer = await direct(`/admin/food/shops/${shop._id}/terms`, {
      ...termsBody,
      expectedVersion: shop.version,
      basisPoints: 2000,
      reference: 'NEXT',
      schedule: {
        frequency: 'MONTHLY',
        timezone: 'Africa/Harare',
        cutoffTime: '21:30',
        periodAnchor: 28,
      },
    });
    await store
      .dispatch(
        shopApi.endpoints.requestShopTerms.initiate({
          shopId: shop._id,
          expectedVersion: newer.shop.version,
          acknowledgeTermsId: newer.terms._id,
        }),
      )
      .unwrap();
    const historical = await services.foodOrders.getById(order._id);
    expect({
      amounts: historical.amounts,
      commission: historical.amounts.commissionPolicySnapshot,
      settlement: historical.amounts.settlementPolicySnapshot,
    }).toEqual(original);
    expect(await repos.foodOrders.countDocuments({ customerId: customer._id })).toBe(1);
    expect(await repos.cashLedger.countDocuments({})).toBe(0);
  });
});
