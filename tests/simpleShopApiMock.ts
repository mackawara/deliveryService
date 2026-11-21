import { HttpResponse, http } from 'msw';

import type { WireFoodItem } from '@/api/dto/shop';
import { mockServer } from '@/mocks/server';
import { THUMBNAIL, computeOverview, simpleItem, simpleShop } from './simpleShopFixture';

export const PNG = new File([new Uint8Array([137, 80, 78, 71])], 'plate.png', {
  type: 'image/png',
});

/** A small in-memory shop API, so each command's effect shows in the next read. */
export function serveCatalogue(initial: WireFoodItem[] = [], shop = simpleShop()) {
  let items = [...initial];
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const record = async (request: Request) => {
    const body = (await request.json()) as Record<string, unknown>;
    calls.push({ method: request.method, path: new URL(request.url).pathname, body });
    return body;
  };
  mockServer.use(
    http.get('/api/v1/shop/shops/shop-new', () => HttpResponse.json(computeOverview(shop, items))),
    http.get('/api/v1/shop/shops/shop-new/items', () =>
      HttpResponse.json({ items, limit: 100, skip: 0 }),
    ),
    http.post('/api/v1/shop/shops/shop-new/items', async ({ request }) => {
      const body = await record(request);
      const item = simpleItem({
        _id: `item-${items.length + 1}`,
        name: String(body.name),
        priceCents: Number(body.priceCents),
        displayOrder: items.length,
      });
      items = [...items, item];
      return HttpResponse.json({ item });
    }),
    http.patch('/api/v1/shop/shops/shop-new/items/:itemId', async ({ request, params }) => {
      const body = await record(request);
      const { expectedVersion: _version, ...patch } = body;
      items = items.map((item) =>
        item._id === params.itemId ? { ...item, ...patch, version: item.version + 1 } : item,
      );
      return HttpResponse.json({ item: items.find((item) => item._id === params.itemId) });
    }),
    http.post('/api/v1/shop/shops/shop-new/images', async ({ request }) => {
      const body = await record(request);
      items = items.map((item) =>
        item._id === body.itemId
          ? { ...item, thumbnail: THUMBNAIL, thumbnailBase64: 'AAAA', version: item.version + 1 }
          : item,
      );
      const item = items.find((entry) => entry._id === body.itemId)!;
      return HttpResponse.json({
        mediaId: 'media-1',
        thumbnail: THUMBNAIL,
        base64: 'AAAA',
        version: item.version,
      });
    }),
  );
  return calls;
}
