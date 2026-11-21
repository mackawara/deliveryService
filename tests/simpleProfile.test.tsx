import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { WireShop } from '@/api/dto/shop';
import { SimpleShopProfilePage } from '@/features/shop/simple/SimpleShopProfilePage';
import { mockServer } from '@/mocks/server';
import { PICKUP, THUMBNAIL, simpleShop } from './simpleShopFixture';
import { asOwner, withSimpleSetupFlag } from './simpleShopTestUtils';
import { renderRoutes } from './testUtils';

withSimpleSetupFlag({ beforeEach, afterEach });

function mount(initial: WireShop) {
  let shop = initial;
  const bodies: unknown[] = [];
  mockServer.use(
    http.get('/api/v1/shop/shops/shop-new', () => HttpResponse.json({ shop })),
    http.patch('/api/v1/shop/shops/shop-new', async ({ request }) => {
      const body = (await request.json()) as Partial<WireShop>;
      bodies.push(body);
      shop = { ...shop, ...body, version: shop.version + 1 };
      return HttpResponse.json({ shop });
    }),
  );
  renderRoutes({
    routes: [{ path: '/shop/:shopId/profile', element: asOwner(<SimpleShopProfilePage />) }],
    initialEntries: ['/shop/shop-new/profile'],
  });
  return bodies;
}

const verified = {
  whatsappOptIn: true,
  whatsappConsent: {
    phone: '+263772000002',
    policy: 'food-shop-orders-v1' as const,
    verifiedAt: '2026-11-21T08:00:00.000Z',
  },
};

describe('simple shop profile (issue 34)', () => {
  it('shows the shop in plain words, with no settlement, branch or second code', async () => {
    mount(simpleShop(verified));
    expect(await screen.findByRole('heading', { name: 'Your shop' })).toBeInTheDocument();
    expect(screen.queryByText(/settlement|branch|packing|capacity/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/code/i)).not.toBeInTheDocument();
    expect(screen.getByText('+263772000002')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Set the pin' })).toHaveAttribute(
      'href',
      '/shop/shop-new/pin',
    );
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.getByText('You can open once your shop is approved.')).toBeInTheDocument();
  });

  it('renames the shop and opens it once approved', async () => {
    const user = userEvent.setup();
    const bodies = mount(simpleShop({ ...verified, approvalState: 'APPROVED', pickup: PICKUP }));
    const name = await screen.findByLabelText('Shop name');
    expect(screen.getByRole('link', { name: 'Move the pin' })).toBeInTheDocument();
    await user.clear(name);
    await user.type(name, 'Mama Rudo');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bodies).toEqual([{ expectedVersion: 1, name: 'Mama Rudo' }]));
    const open = await screen.findByRole('switch');
    await waitFor(() => expect(open).toBeEnabled());
    await user.click(open);
    await waitFor(() => expect(bodies[1]).toEqual({ expectedVersion: 2, isOpen: true }));
  });

  it('lets the owner choose a different order number', async () => {
    const user = userEvent.setup();
    const bodies = mount(simpleShop(verified));
    await user.click(await screen.findByText('Use a different WhatsApp number'));
    const phone = screen.getByLabelText('WhatsApp number for orders');
    await user.clear(phone);
    await user.type(phone, '+263772999999');
    await user.click(screen.getByRole('button', { name: 'Save number' }));
    await waitFor(() =>
      expect(bodies).toEqual([{ expectedVersion: 1, contactPhone: '+263772999999' }]),
    );
  });

  it('saves a shop photo', async () => {
    const user = userEvent.setup();
    const uploads: unknown[] = [];
    mount(simpleShop(verified));
    mockServer.use(
      http.post('/api/v1/shop/shops/shop-new/images', async ({ request }) => {
        uploads.push(await request.json());
        return HttpResponse.json({
          mediaId: 'm',
          thumbnail: THUMBNAIL,
          base64: 'AAAA',
          version: 2,
        });
      }),
    );
    await user.upload(
      await screen.findByLabelText('Shop photo'),
      new File([new Uint8Array([137, 80, 78, 71])], 'shop.png', { type: 'image/png' }),
    );
    await waitFor(() => expect(uploads).toEqual([expect.objectContaining({ expectedVersion: 1 })]));
  });

  it('offers a retry when the shop cannot be loaded', async () => {
    mockServer.use(
      http.get('/api/v1/shop/shops/shop-new', () =>
        HttpResponse.json({ code: 'SERVER', message: 'Down', correlationId: 'c' }, { status: 503 }),
      ),
    );
    renderRoutes({
      routes: [{ path: '/shop/:shopId/profile', element: asOwner(<SimpleShopProfilePage />) }],
      initialEntries: ['/shop/shop-new/profile'],
    });
    expect(
      await screen.findByRole('button', { name: 'Try again' }, { timeout: 15_000 }),
    ).toBeInTheDocument();
  });
});
