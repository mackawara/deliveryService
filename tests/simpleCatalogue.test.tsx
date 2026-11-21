import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WireFoodItem } from '@/api/dto/shop';
import { SimpleCataloguePage } from '@/features/shop/simple/SimpleCataloguePage';
import { hasPhoto, parsePriceCents } from '@/features/shop/simple/items';
import { mockServer } from '@/mocks/server';
import { THUMBNAIL, simpleItem, simpleShop } from './simpleShopFixture';
import { withSimpleSetupFlag } from './simpleShopTestUtils';
import { renderRoutes } from './testUtils';

withSimpleSetupFlag({ beforeEach, afterEach });

const PNG = new File([new Uint8Array([137, 80, 78, 71])], 'plate.png', { type: 'image/png' });

/** A small in-memory shop API, so each command's effect shows in the next read. */
function serveCatalogue(initial: WireFoodItem[] = []) {
  let items = [...initial];
  const calls: { method: string; path: string; body: Record<string, unknown> }[] = [];
  const record = async (request: Request) => {
    const body = (await request.json()) as Record<string, unknown>;
    calls.push({ method: request.method, path: new URL(request.url).pathname, body });
    return body;
  };
  mockServer.use(
    http.get('/api/v1/shop/shops/shop-new', () => HttpResponse.json({ shop: simpleShop() })),
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

function mount(onItemSaved = vi.fn()) {
  renderRoutes({
    routes: [
      {
        path: '/shop/:shopId/catalogue',
        element: <SimpleCataloguePage onItemSaved={onItemSaved} />,
      },
    ],
    initialEntries: ['/shop/shop-new/catalogue'],
  });
  return onItemSaved;
}

describe('simple item form (issue 34)', () => {
  beforeEach(() => sessionStorage.clear());

  it('adds the first item from a name and a price, with no size or packing questions', async () => {
    const user = userEvent.setup();
    const calls = serveCatalogue();
    const saved = mount();
    await user.click(await screen.findByRole('button', { name: 'Add your first item' }));
    const dialog = screen.getByRole('dialog', { name: 'Add an item' });
    expect(
      within(dialog).queryByLabelText(/weight|length|width|height|packing|capacity|display order/i),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Price/)).toHaveAttribute('inputmode', 'decimal');

    await user.type(within(dialog).getByLabelText(/Item name/), 'Sadza and beef');
    await user.type(within(dialog).getByLabelText(/Price/), '4,50');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Sadza and beef')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'POST',
        path: '/api/v1/shop/shops/shop-new/items',
        body: { name: 'Sadza and beef', priceCents: 450 },
      },
    ]);
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sadza and beef' }));
    expect(screen.getByText('Hidden from customers: add a photo')).toBeInTheDocument();
  });

  it('keeps the owner in the flow with "Save and add another", and saves a chosen photo', async () => {
    const user = userEvent.setup();
    const calls = serveCatalogue();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Add your first item' }));
    let dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Item name/), 'Chips');
    await user.type(within(dialog).getByLabelText(/Price/), '2');
    await user.upload(within(dialog).getByLabelText('Item photo'), PNG);
    await user.click(within(dialog).getByRole('button', { name: 'Save and add another' }));

    await waitFor(() => expect(calls.map((call) => call.method)).toEqual(['POST', 'POST']));
    dialog = await screen.findByRole('dialog', { name: 'Add an item' });
    await waitFor(() => expect(within(dialog).getByLabelText(/Item name/)).toHaveValue(''));
    expect(calls[1].body).toMatchObject({ itemId: 'item-1', expectedVersion: 1 });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Chips')).toBeInTheDocument();
    expect(screen.queryByText('Hidden from customers: add a photo')).not.toBeInTheDocument();
  });

  it('refuses to save without a name or a valid price, and never blocks on a photo', async () => {
    const user = userEvent.setup();
    const calls = serveCatalogue();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Add your first item' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Enter the item name.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Item name/), 'Tea');
    await user.type(within(dialog).getByLabelText(/Price/), 'free');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText(/Enter a price/)).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('keeps a typed item through a reload', async () => {
    const user = userEvent.setup();
    serveCatalogue();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Add your first item' }));
    await user.type(screen.getByLabelText(/Item name/), 'Half typed');
    expect(JSON.parse(sessionStorage.getItem('shop-item-draft:v1:shop-new')!)).toEqual({
      name: 'Half typed',
      price: '',
    });
  });

  it('adds a photo from the row in one tap and clears the hidden mark', async () => {
    const user = userEvent.setup();
    const calls = serveCatalogue([simpleItem()]);
    const saved = mount();
    expect(await screen.findByText('Hidden from customers: add a photo')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Photo for Sadza and beef'), PNG);
    await waitFor(() =>
      expect(screen.queryByText('Hidden from customers: add a photo')).not.toBeInTheDocument(),
    );
    expect(calls[0]).toMatchObject({ body: { itemId: 'item-1', expectedVersion: 1 } });
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ thumbnailBase64: 'AAAA' }));
  });

  it('switches stock on the row without a dialog', async () => {
    const user = userEvent.setup();
    const calls = serveCatalogue([simpleItem({ thumbnail: THUMBNAIL })]);
    mount();
    const toggle = await screen.findByRole('switch', { name: 'Sadza and beef in stock' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await waitFor(() => expect(screen.getByText('Out of stock')).toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls).toEqual([
      {
        method: 'PATCH',
        path: '/api/v1/shop/shops/shop-new/items/item-1',
        body: { expectedVersion: 1, inStock: false },
      },
    ]);
  });

  it('edits an existing sized item without touching its size, and offers optional details', async () => {
    const user = userEvent.setup();
    const sized = simpleItem({
      thumbnail: THUMBNAIL,
      deliverySize: {
        weightGrams: 900,
        dimensionsCm: { length: 30, width: 20, height: 10 },
        profileVersion: 3,
      },
    });
    const calls = serveCatalogue([sized]);
    mount();
    await user.click(await screen.findByRole('button', { name: 'Edit Sadza and beef' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit item' });
    expect(within(dialog).getByLabelText(/Price/)).toHaveValue('4.50');
    await user.type(within(dialog).getByLabelText(/Description/), 'With greens');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({
      expectedVersion: 1,
      name: 'Sadza and beef',
      priceCents: 450,
      description: 'With greens',
      category: '',
    });
  });

  it('shows the API error and keeps the dialog open when a save fails', async () => {
    const user = userEvent.setup();
    serveCatalogue();
    mockServer.use(
      http.post('/api/v1/shop/shops/shop-new/items', () =>
        HttpResponse.json(
          { code: 'VALIDATION_FAILED', message: 'Price is too high.', correlationId: 'c1' },
          { status: 422 },
        ),
      ),
    );
    mount();
    await user.click(await screen.findByRole('button', { name: 'Add your first item' }));
    await user.type(screen.getByLabelText(/Item name/), 'Gold');
    await user.type(screen.getByLabelText(/Price/), '99999');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Price is too high/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('item helpers', () => {
  it.each([
    ['4.50', 450],
    ['4,5', 450],
    ['$12', 1200],
    [' 0.99 ', 99],
    ['0', undefined],
    ['1.234', undefined],
    ['abc', undefined],
    ['', undefined],
  ])('reads %j as %j cents', (input, cents) => {
    expect(parsePriceCents(input)).toBe(cents);
  });

  it('counts a thumbnail or its derivative as a photo', () => {
    expect(hasPhoto(simpleItem())).toBe(false);
    expect(hasPhoto(simpleItem({ thumbnail: THUMBNAIL }))).toBe(true);
    expect(hasPhoto(simpleItem({ thumbnailBase64: 'AAAA' }))).toBe(true);
  });
});
