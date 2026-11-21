import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WireFoodItem, WireShop } from '@/api/dto/shop';
import { routes } from '@/app/router';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';
import { PICKUP, THUMBNAIL, computeOverview, simpleItem, simpleShop } from './simpleShopFixture';
import { withSimpleSetupFlag } from './simpleShopTestUtils';
import { renderRoutes } from './testUtils';

vi.mock('@/lib/googleMaps', () => ({ loadGoogleMaps: () => Promise.reject(new Error('offline')) }));

withSimpleSetupFlag({ beforeEach, afterEach });

type Call = { method: string; path: string; body: Record<string, unknown> };

function serveAdmin(initialShop: WireShop, initialItems: WireFoodItem[]) {
  let shop = initialShop;
  let items = initialItems;
  let settings = { townId: 'town-hwange', bigOrderItemThreshold: 10, version: 1 };
  const calls: Call[] = [];
  const record = async (request: Request) => {
    const body = (await request.json()) as Record<string, unknown>;
    calls.push({ method: request.method, path: new URL(request.url).pathname, body });
    return body;
  };
  mockServer.use(
    http.get('/api/v1/admin/food/shops', () =>
      HttpResponse.json({ items: [shop], limit: 25, skip: 0 }),
    ),
    http.get('/api/v1/admin/food/shops/shop-new', () => {
      const { readiness, suggestions } = computeOverview(shop, items);
      return HttpResponse.json({
        shop,
        memberships: [],
        terms: [],
        requests: [],
        readiness,
        suggestions,
      });
    }),
    http.get('/api/v1/admin/food/shops/shop-new/items', () =>
      HttpResponse.json({ items, limit: 100, skip: 0 }),
    ),
    http.put('/api/v1/admin/food/shops/shop-new/pickup', async ({ request }) => {
      await record(request);
      shop = { ...shop, pickup: PICKUP, version: shop.version + 1 };
      return HttpResponse.json({ shop });
    }),
    http.post('/api/v1/admin/food/shops/shop-new/review', async ({ request }) => {
      const body = await record(request);
      shop = {
        ...shop,
        approvalState: body.decision as WireShop['approvalState'],
        version: shop.version + 1,
      };
      return HttpResponse.json({ shop });
    }),
    http.put(
      '/api/v1/admin/food/shops/shop-new/items/:itemId/delivery-size',
      async ({ request, params }) => {
        const body = await record(request);
        items = items.map((item) =>
          item._id === params.itemId
            ? {
                ...item,
                deliverySize: (body.deliverySize ?? undefined) as WireFoodItem['deliverySize'],
                version: item.version + 1,
              }
            : item,
        );
        return HttpResponse.json({ item: items.find((item) => item._id === params.itemId) });
      },
    ),
    http.get('/api/v1/admin/food/towns/town-hwange/settings', () =>
      HttpResponse.json({ settings }),
    ),
    http.patch('/api/v1/admin/food/towns/town-hwange/settings', async ({ request }) => {
      const body = await record(request);
      settings = {
        ...settings,
        bigOrderItemThreshold: Number(body.bigOrderItemThreshold),
        version: 2,
      };
      return HttpResponse.json({ settings });
    }),
  );
  return calls;
}

function mount() {
  resetMockState({ authenticated: true });
  renderRoutes({ routes, initialEntries: ['/admin/food/shops?town=town-hwange'] });
}

async function shopCard() {
  const name = await screen.findByRole('heading', { name: 'Mama Rudo Kitchen' });
  return within(name.closest('.MuiCard-root') as HTMLElement);
}

describe('admin approval for simple shops (issue 34)', () => {
  it('names the missing check and keeps Approve off until the shop is ready', async () => {
    serveAdmin(simpleShop(), [simpleItem()]);
    mount();
    const card = await shopCard();
    const checks = await card.findByRole('list', { name: 'Readiness checks' });
    expect(within(checks).getAllByTitle('Missing')).toHaveLength(2);
    expect(card.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(
      card.getByText(
        /Approve becomes available once this is done: Pin your shop, Add items with photos\./,
      ),
    ).toBeInTheDocument();
    expect(card.getByText(/No photo, hidden · In stock · Bike-sized/)).toBeInTheDocument();
  });

  it('lets an admin place the pin, then approve in one click', async () => {
    const user = userEvent.setup();
    const calls = serveAdmin(simpleShop(), [simpleItem({ thumbnail: THUMBNAIL })]);
    mount();
    const card = await shopCard();
    expect(await card.findByText('No pickup pin yet.')).toBeInTheDocument();
    await user.click(card.getByRole('button', { name: 'Set pin' }));
    const dialog = screen.getByRole('dialog', { name: /Pickup pin for/ });
    await user.type(within(dialog).getByLabelText('Coordinates or map link'), '-18.36, 26.48');
    await user.click(within(dialog).getByRole('button', { name: 'Use pasted pin' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save pin' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await card.findByText(/zone CENTRE/)).toBeInTheDocument();

    const approve = card.getByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    await user.click(approve);
    await waitFor(() => expect(card.getByText('APPROVED')).toBeInTheDocument());
    expect(calls.map((call) => [call.method, call.path.split('/').pop(), call.body])).toEqual([
      ['PUT', 'pickup', { expectedVersion: 1, pickup: { lat: -18.36, lng: 26.48, address: '' } }],
      [
        'POST',
        'review',
        { expectedVersion: 2, decision: 'APPROVED', reason: 'All readiness checks passed.' },
      ],
    ]);
  });

  it('asks for a reason before rejecting', async () => {
    const user = userEvent.setup();
    const calls = serveAdmin(simpleShop(), []);
    mount();
    const card = await shopCard();
    await user.click(card.getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog', { name: /Reject/ });
    const submit = within(dialog).getByRole('button', { name: 'Reject' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/Reason the owner will see/), 'Not in town');
    await user.click(submit);
    await waitFor(() =>
      expect(calls[0].body).toEqual({
        expectedVersion: 1,
        decision: 'REJECTED',
        reason: 'Not in town',
      }),
    );
  });

  it('shows the API refusal when a check failed on the server', async () => {
    const user = userEvent.setup();
    serveAdmin(simpleShop({ pickup: PICKUP }), [simpleItem({ thumbnail: THUMBNAIL })]);
    mockServer.use(
      http.post('/api/v1/admin/food/shops/shop-new/review', () =>
        HttpResponse.json(
          { code: 'SHOP_NOT_READY', message: 'Terms are not agreed.', correlationId: 'c' },
          { status: 422 },
        ),
      ),
    );
    mount();
    const card = await shopCard();
    const approve = card.getByRole('button', { name: 'Approve' });
    await waitFor(() => expect(approve).toBeEnabled());
    await user.click(approve);
    expect(await card.findByText(/Terms are not agreed/)).toBeInTheDocument();
  });

  it('sets an admin-only delivery size and returns an item to the bike size', async () => {
    const user = userEvent.setup();
    const calls = serveAdmin(simpleShop(), [simpleItem()]);
    mount();
    const card = await shopCard();
    await user.click(await card.findByRole('button', { name: 'Delivery size' }));
    let dialog = screen.getByRole('dialog', { name: /Delivery size/ });
    await user.type(within(dialog).getByLabelText('Packaged weight (g)'), '5000');
    for (const [label, value] of [
      ['Length (cm)', '60'],
      ['Width (cm)', '40'],
      ['Height (cm)', '30'],
    ])
      await user.type(within(dialog).getByLabelText(label), value);
    await user.click(within(dialog).getByRole('button', { name: 'Save size' }));
    expect(await card.findByText(/5000g · 60×40×30cm/)).toBeInTheDocument();

    await user.click(card.getByRole('button', { name: 'Delivery size' }));
    dialog = screen.getByRole('dialog', { name: /Delivery size/ });
    await user.click(within(dialog).getByRole('button', { name: 'Use standard bike size' }));
    expect(await card.findByText(/Bike-sized/)).toBeInTheDocument();
    expect(calls.map((call) => call.body.deliverySize)).toEqual([
      { weightGrams: 5000, dimensionsCm: { length: 60, width: 40, height: 30 }, profileVersion: 1 },
      null,
    ]);
  });

  it('edits the big-order threshold for the selected town', async () => {
    const user = userEvent.setup();
    const calls = serveAdmin(simpleShop(), []);
    mount();
    const field = await screen.findByLabelText('Items per order');
    await waitFor(() => expect(field).toHaveValue(10));
    await user.clear(field);
    await user.type(field, '0');
    expect(screen.getByText(/whole number from 1 to 1000/)).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, '15');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(calls).toEqual([
        expect.objectContaining({
          method: 'PATCH',
          body: { expectedVersion: 1, bigOrderItemThreshold: 15 },
        }),
      ]),
    );
  });
});
