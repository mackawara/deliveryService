import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { setShopCsrfToken } from '@/api/csrf';
import { shopApi } from '@/api/endpoints/shop';
import { createAppStore } from '@/app/store';
import { deliverySizeLabel, profilePatch } from '@/features/shop/shopUtils';
import { mockServer } from '@/mocks/server';
import { PICKUP, SIMPLE_TERMS, computeOverview, simpleItem, simpleShop } from './simpleShopFixture';

function recordCommand(seen: (call: Record<string, unknown>) => void, response: object) {
  return async ({ request }: { request: Request }) => {
    seen({
      method: request.method,
      csrf: request.headers.get('x-csrf-token'),
      key: request.headers.get('idempotency-key'),
      body: await request.json(),
    });
    return HttpResponse.json(response);
  };
}

describe('simple shop setup API contract (issue 34)', () => {
  it('reads the current terms and treats a missing configuration as closed signup', async () => {
    mockServer.use(
      http.get('/api/v1/shop/terms', () => HttpResponse.json({ terms: SIMPLE_TERMS })),
    );
    const store = createAppStore();
    await expect(
      store.dispatch(shopApi.endpoints.getCurrentShopTerms.initiate()).unwrap(),
    ).resolves.toEqual(SIMPLE_TERMS);

    mockServer.use(http.get('/api/v1/shop/terms', () => HttpResponse.json({ terms: null })));
    await expect(
      createAppStore().dispatch(shopApi.endpoints.getCurrentShopTerms.initiate()).unwrap(),
    ).resolves.toBeNull();
  });

  it('creates a shop from name, town and the agreed terms version only', async () => {
    setShopCsrfToken('shop-csrf');
    const seen = vi.fn();
    mockServer.use(http.post('/api/v1/shop/shops', recordCommand(seen, { shop: simpleShop() })));
    const shop = await createAppStore()
      .dispatch(
        shopApi.endpoints.createSimpleShop.initiate({
          name: 'Mama Rudo Kitchen',
          townId: 'town-hwange',
          termsVersion: SIMPLE_TERMS.version,
          agreeToTerms: true,
          idempotencyKey: 'create-1',
        }),
      )
      .unwrap();
    expect(shop.pickup).toBeUndefined();
    expect(seen).toHaveBeenCalledWith({
      method: 'POST',
      csrf: 'shop-csrf',
      key: 'create-1',
      body: {
        name: 'Mama Rudo Kitchen',
        townId: 'town-hwange',
        termsVersion: SIMPLE_TERMS.version,
        agreeToTerms: true,
      },
    });
  });

  it('reads readiness and suggestions, and an older API without them as empty lists', async () => {
    const shop = simpleShop();
    mockServer.use(
      http.get('/api/v1/shop/shops/shop-new', () =>
        HttpResponse.json(computeOverview(shop, [simpleItem()])),
      ),
    );
    const overview = await createAppStore()
      .dispatch(shopApi.endpoints.getShopOverview.initiate('shop-new'))
      .unwrap();
    expect(overview.readiness.map((check) => [check.code, check.done])).toEqual([
      ['PICKUP_POINT', false],
      ['VISIBLE_ITEM', false],
      ['TERMS_AGREED', true],
    ]);
    expect(overview.suggestions.map((s) => s.code)).toEqual([
      'ADD_PICKUP_PIN',
      'ADD_ITEM_PHOTO',
      'ADD_ITEM_DESCRIPTION',
      'ADD_ITEM_CATEGORY',
    ]);

    mockServer.use(http.get('/api/v1/shop/shops/shop-old', () => HttpResponse.json({ shop })));
    await expect(
      createAppStore().dispatch(shopApi.endpoints.getShopOverview.initiate('shop-old')).unwrap(),
    ).resolves.toEqual({ shop, readiness: [], suggestions: [] });
  });

  it('refetches readiness after an item is saved without a size', async () => {
    setShopCsrfToken('shop-csrf');
    let items = [] as ReturnType<typeof simpleItem>[];
    const seen = vi.fn();
    mockServer.use(
      http.get('/api/v1/shop/shops/shop-new', () =>
        HttpResponse.json(computeOverview(simpleShop(), items)),
      ),
      http.post('/api/v1/shop/shops/shop-new/items', async ({ request }) => {
        seen(await request.json());
        items = [simpleItem()];
        return HttpResponse.json({ item: items[0] });
      }),
    );
    const store = createAppStore();
    const subscription = store.dispatch(shopApi.endpoints.getShopOverview.initiate('shop-new'));
    await subscription.unwrap();
    expect(
      shopApi.endpoints.getShopOverview.select('shop-new')(store.getState()).data?.suggestions,
    ).toHaveLength(1);

    await store
      .dispatch(
        shopApi.endpoints.createShopItem.initiate({
          shopId: 'shop-new',
          name: 'Sadza and beef',
          priceCents: 450,
        }),
      )
      .unwrap();
    expect(seen).toHaveBeenCalledWith({ name: 'Sadza and beef', priceCents: 450 });
    await vi.waitFor(() =>
      expect(
        shopApi.endpoints.getShopOverview.select('shop-new')(store.getState()).data?.suggestions,
      ).toHaveLength(4),
    );
    subscription.unsubscribe();
  });

  it('records a renewed terms agreement with the shop version', async () => {
    setShopCsrfToken('shop-csrf');
    const seen = vi.fn();
    mockServer.use(
      http.post(
        '/api/v1/shop/shops/shop-new/terms-agreement',
        recordCommand(seen, { shop: simpleShop({ version: 2 }) }),
      ),
    );
    await createAppStore()
      .dispatch(
        shopApi.endpoints.agreeShopTerms.initiate({
          shopId: 'shop-new',
          termsVersion: '2026-12',
          expectedVersion: 1,
          idempotencyKey: 'agree-1',
        }),
      )
      .unwrap();
    expect(seen).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'agree-1',
        body: { termsVersion: '2026-12', expectedVersion: 1 },
      }),
    );
  });

  it('sends the admin pin, delivery size and big-order threshold commands', async () => {
    const seen = vi.fn();
    mockServer.use(
      http.put(
        '/api/v1/admin/food/shops/shop-new/pickup',
        recordCommand(seen, { shop: simpleShop({ pickup: PICKUP, version: 2 }) }),
      ),
      http.put(
        '/api/v1/admin/food/shops/shop-new/items/item-1/delivery-size',
        recordCommand(seen, { item: simpleItem({ version: 2 }) }),
      ),
      http.patch(
        '/api/v1/admin/food/towns/town-hwange/settings',
        recordCommand(seen, {
          settings: { townId: 'town-hwange', bigOrderItemThreshold: 12, version: 2 },
        }),
      ),
      http.get('/api/v1/admin/food/towns/town-hwange/settings', () =>
        HttpResponse.json({
          settings: { townId: 'town-hwange', bigOrderItemThreshold: 10, version: 1 },
        }),
      ),
      http.get('/api/v1/admin/food/shops/shop-new/items', ({ request }) => {
        seen({ method: 'GET', limit: new URL(request.url).searchParams.get('limit') });
        return HttpResponse.json({ items: [simpleItem()], limit: 100, skip: 0 });
      }),
    );
    const store = createAppStore();
    const shop = await store
      .dispatch(
        shopApi.endpoints.setAdminShopPickup.initiate({
          shopId: 'shop-new',
          expectedVersion: 1,
          pickup: { lat: -18.36, lng: 26.48, address: 'Next to the market' },
          idempotencyKey: 'pin-1',
        }),
      )
      .unwrap();
    expect(shop.pickup?.zoneCode).toBe('CENTRE');
    await store
      .dispatch(
        shopApi.endpoints.setAdminItemDeliverySize.initiate({
          shopId: 'shop-new',
          itemId: 'item-1',
          expectedVersion: 1,
          deliverySize: null,
          idempotencyKey: 'size-1',
        }),
      )
      .unwrap();
    await expect(
      store.dispatch(shopApi.endpoints.getFoodTownSettings.initiate('town-hwange')).unwrap(),
    ).resolves.toMatchObject({ bigOrderItemThreshold: 10 });
    await store
      .dispatch(
        shopApi.endpoints.updateFoodTownSettings.initiate({
          townId: 'town-hwange',
          expectedVersion: 1,
          bigOrderItemThreshold: 12,
          idempotencyKey: 'threshold-1',
        }),
      )
      .unwrap();
    await expect(
      store
        .dispatch(shopApi.endpoints.listAdminShopItems.initiate({ shopId: 'shop-new' }))
        .unwrap(),
    ).resolves.toMatchObject({ items: [{ _id: 'item-1' }] });
    expect(
      seen.mock.calls.map(([call]) => [call.method, call.key, call.body ?? call.limit]),
    ).toEqual([
      [
        'PUT',
        'pin-1',
        {
          expectedVersion: 1,
          pickup: { lat: -18.36, lng: 26.48, address: 'Next to the market' },
        },
      ],
      ['PUT', 'size-1', { expectedVersion: 1, deliverySize: null }],
      ['PATCH', 'threshold-1', { expectedVersion: 1, bigOrderItemThreshold: 12 }],
      ['GET', undefined, '100'],
    ]);
  });

  it('treats a shop without a pin and an item without a size as valid records', () => {
    const shop = simpleShop();
    const draft = { name: shop.name, branchName: '', phone: shop.contactPhone, lat: '', lng: '' };
    expect(profilePatch(shop, { ...draft, address: '' })).toEqual({});
    expect(
      profilePatch(shop, { ...draft, lat: '-18.36', lng: '26.48', address: 'Market' }),
    ).toEqual({ pickup: { lat: -18.36, lng: 26.48, address: 'Market' } });
    expect(deliverySizeLabel(simpleItem())).toBe('Bike-sized');
    expect(
      deliverySizeLabel(
        simpleItem({
          deliverySize: {
            weightGrams: 900,
            dimensionsCm: { length: 20, width: 15, height: 8 },
            profileVersion: 2,
          },
        }),
      ),
    ).toBe('900g · 20×15×8cm');
  });
});
