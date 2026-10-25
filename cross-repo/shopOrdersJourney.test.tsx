import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bypass, http, HttpResponse } from 'msw';
import { createFoodWorld, inbound, placeOrder } from '@api-test/foodFlow';
import { FoodWorkflowWorker } from '@api-src/workers/foodWorkflowWorker';
import { goAvailable } from '@api-test/booking';
import { shopApi } from '@/api/endpoints/shop';
import { baseApi } from '@/api/baseApi';
import { createAppStore } from '@/app/store';
import { mockServer } from '@/mocks/server';
import { OwnerAuthProvider } from '@/auth/OwnerAuthProvider';
import { ShopOrdersPage } from '@/features/shop/ShopOrdersPage';
import { renderRoutes } from '../tests/testUtils';

// This bridge forwards requests and cookies unchanged to a real local Express app.
// No shop, terms, image or command response is mocked. All infrastructure stays in memory.
describe('dashboard + API cross-channel order management', () => {
  let world: Awaited<ReturnType<typeof createFoodWorld>>;
  let server: ReturnType<typeof world.harness.app.app.listen>;
  let apiOrigin: string;
  let cookies: Map<string, string>;
  let store: ReturnType<typeof createAppStore>;
  const seen: { method: string; path: string; body: unknown }[] = [];
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

  it.each(['dashboard-first', 'whatsapp-first'])(
    'runs %s through the actual shop UI, shared WhatsApp bot, rider and delivery services',
    async (combination) => {
      await store.dispatch(shopApi.endpoints.getShopCsrf.initiate()).unwrap();
      const challenge = await store
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
            challengeId: challenge.challengeId,
            code: await code(),
          }),
        )
        .unwrap();
      const me = await store.dispatch(shopApi.endpoints.getShopMe.initiate()).unwrap();
      const { services, repositories } = world.harness.context;
      const shop = world.seeded.pizzaInn;
      await repositories.shopMemberships.insertOne({
        _id: crypto.randomUUID(),
        ownerId: me.owner.id,
        shopId: shop._id,
        townId: shop.townId,
        phone: me.owner.phone,
        role: 'OWNER',
        status: 'ACTIVE',
        version: 1,
        createdAt: world.harness.clock.now(),
        updatedAt: world.harness.clock.now(),
      });
      await store
        .dispatch(shopApi.endpoints.getShopMe.initiate(undefined, { forceRefetch: true }))
        .unwrap();
      const { order } = await placeOrder(world);
      const user = userEvent.setup();
      const view = renderRoutes({
        routes: [
          {
            path: '/shop/:shopId/orders/:orderId',
            element: (
              <OwnerAuthProvider>
                <ShopOrdersPage />
              </OwnerAuthProvider>
            ),
          },
        ],
        initialEntries: [`/shop/${shop._id}/orders/${order._id}`],
        store,
      });
      await screen.findByRole('heading', { name: order.reference });
      const wa = (token: string) =>
        services.router.handleWebhook(inbound(shop.contactPhone.replace('+', ''), token));
      if (combination === 'dashboard-first') {
        await user.click(await screen.findByRole('button', { name: 'Accept order' }));
        await user.type(screen.getByLabelText(/Preparation minutes/), '15');
        await user.click(screen.getByRole('button', { name: 'Confirm action' }));
        await screen.findByRole('button', { name: 'Ready for pickup' });
      } else {
        await wa(services.foodShopMessages.action(order, 'A20'));
        act(() => window.dispatchEvent(new Event('focus')));
        await screen.findByRole('button', { name: 'Ready for pickup' });
      }
      const accepted = await services.foodOrders.getById(order._id);
      expect(accepted.status).toBe('PREPARING');
      expect(await repositories.assignments.countDocuments({ bookingId: order.bookingId })).toBe(0);
      if (combination === 'dashboard-first')
        await wa(services.foodShopMessages.action(accepted, 'READY'));
      else {
        await user.click(screen.getByRole('button', { name: 'Ready for pickup' }));
        await user.click(screen.getByRole('button', { name: 'Confirm action' }));
        await waitFor(async () =>
          expect((await services.foodOrders.getById(order._id)).status).toBe('READY'),
        );
      }
      await goAvailable(world.harness, 'moto');
      await new FoodWorkflowWorker(world.harness.context).runOnce();
      const offer = (await repositories.assignments.findOne({
        bookingId: order.bookingId,
        active: true,
      }))!;
      const actor = { type: 'DRIVER' as const, id: offer.driverId };
      act(() => window.dispatchEvent(new Event('focus')));
      await screen.findByText(/Offer awaiting rider acceptance/);
      await services.dispatch.acceptOffer(offer._id, actor);
      for (const newState of [
        'HEADING_TO_PICKUP',
        'AT_PICKUP',
        'COLLECTED',
        'IN_TRANSIT',
        'AT_DROPOFF',
      ] as const)
        await services.bookings.recordDeliveryEvent(order.bookingId, { newState, actor });
      await services.finance.recordCashReceipt(
        order.bookingId,
        { amountReceivedCents: order.amounts.totalCents, driverId: actor.id },
        actor,
      );
      await services.bookings.recordDeliveryEvent(order.bookingId, {
        newState: 'DELIVERED',
        actor,
        proofReference: 'HANDOVER_CODE',
        evidence: { recipientName: 'Test customer' },
      });
      act(() => window.dispatchEvent(new Event('focus')));
      await screen.findByText(/Ready for pickup · Delivered/);
      expect(await repositories.assignments.countDocuments({ bookingId: order.bookingId })).toBe(1);
      expect(
        seen.some(
          (request) =>
            request.path.endsWith(combination === 'dashboard-first' ? '/accept' : '/ready') &&
            request.method === 'POST',
        ),
      ).toBe(true);
      view.unmount();
    },
  );
});
