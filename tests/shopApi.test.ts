import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { setShopCsrfToken } from '@/api/csrf';
import { shopApi } from '@/api/endpoints/shop';
import { createAppStore } from '@/app/store';
import { mockServer } from '@/mocks/server';

const shop = {
  _id: 'shop-1',
  name: 'Lunch Spot',
  branchName: 'Town centre',
  contactPhone: '+263772555010',
  townId: 'town-1',
  pickup: {
    point: { type: 'Point' as const, coordinates: [26.45, -18.42] as [number, number] },
    addressLine: '4 Main Street',
    zoneCode: 'A',
  },
  status: 'ACTIVE' as const,
  approvalState: 'PENDING' as const,
  ownerManaged: true,
  isOpen: false,
  version: 1,
  createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z',
};

describe('shop API contracts', () => {
  it('keeps owner commands scoped and sends CSRF, idempotency and version metadata', async () => {
    setShopCsrfToken('shop-csrf');
    const seen = vi.fn();
    mockServer.use(
      http.patch('/api/v1/shop/shops/shop-1', async ({ request }) => {
        seen({
          csrf: request.headers.get('x-csrf-token'),
          key: request.headers.get('idempotency-key'),
          body: await request.json(),
        });
        return HttpResponse.json({ shop: { ...shop, version: 2, isOpen: true } });
      }),
    );

    const result = await createAppStore()
      .dispatch(
        shopApi.endpoints.updateShop.initiate({
          shopId: 'shop-1',
          expectedVersion: 1,
          isOpen: true,
          idempotencyKey: 'owner-command-1',
        }),
      )
      .unwrap();

    expect(result).toMatchObject({ _id: 'shop-1', version: 2, isOpen: true });
    expect(seen).toHaveBeenCalledWith({
      csrf: 'shop-csrf',
      key: 'owner-command-1',
      body: { expectedVersion: 1, isOpen: true },
    });
  });

  it('uses the selected branch in list and item cache requests', async () => {
    const seen = vi.fn();
    mockServer.use(
      http.get('/api/v1/shop/shops/shop-2/items', ({ request }) => {
        seen(new URL(request.url).search);
        return HttpResponse.json({ items: [], limit: 25, skip: 0 });
      }),
    );

    const result = await createAppStore()
      .dispatch(shopApi.endpoints.listShopItems.initiate({ shopId: 'shop-2', limit: 25, skip: 50 }))
      .unwrap();

    expect(result).toEqual({ items: [], limit: 25, skip: 0 });
    expect(seen).toHaveBeenCalledWith('?limit=25&skip=50');
  });

  it('does not turn an owner 401 into a staff session-expiry transition', async () => {
    mockServer.use(
      http.get('/api/v1/shop/shops/no-access', () =>
        HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 }),
      ),
    );

    await expect(
      createAppStore().dispatch(shopApi.endpoints.getShop.initiate('no-access')).unwrap(),
    ).rejects.toMatchObject({ kind: 'unauthenticated' });
  });
});
