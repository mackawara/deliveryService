import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WireShop } from '@/api/dto/shop';
import { ShopPinPage } from '@/features/shop/simple/ShopPinPage';
import { ShopReminders } from '@/features/shop/simple/ShopReminders';
import { SimpleShopSetupPage } from '@/features/shop/simple/SimpleShopSetupPage';
import { mockServer } from '@/mocks/server';
import { PICKUP, SIMPLE_TERMS, simpleShop } from './simpleShopFixture';
import { asOwner, serveTowns, withSimpleSetupFlag } from './simpleShopTestUtils';
import { renderRoutes } from './testUtils';

vi.mock('@/lib/googleMaps', () => ({ loadGoogleMaps: () => Promise.reject(new Error('offline')) }));

withSimpleSetupFlag({ beforeEach, afterEach });

function serveTerms(terms: typeof SIMPLE_TERMS | null = SIMPLE_TERMS) {
  mockServer.use(http.get('/api/v1/shop/terms', () => HttpResponse.json({ terms })));
}

function mountSetup(another = false) {
  return renderRoutes({
    routes: [
      {
        path: '/shop/setup',
        element: asOwner(<SimpleShopSetupPage another={another} />),
      },
      { path: '/shop/:shopId/pin', element: <p>Pin page</p> },
    ],
    initialEntries: ['/shop/setup'],
  });
}

describe('two-input shop signup (issue 34)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    serveTowns();
  });

  it('creates a shop from a name, a town and the terms tick, then asks for the pin', async () => {
    const user = userEvent.setup();
    serveTerms();
    const bodies: unknown[] = [];
    mockServer.use(
      http.post('/api/v1/shop/shops', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ shop: simpleShop() });
      }),
    );
    mountSetup();
    const create = await screen.findByRole('button', { name: 'Create my shop' });
    expect(screen.queryByLabelText(/Contact phone|Branch label|Latitude/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Settlement|pilot shop/i)).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'terms and conditions' });
    expect(link).toHaveAttribute('href', '/terms');
    expect(link).toHaveAttribute('target', '_blank');

    await user.type(screen.getByLabelText(/Shop name/), 'Mama Rudo Kitchen');
    await user.click(screen.getByLabelText(/Town/));
    await user.click(await screen.findByRole('option', { name: 'Hwange' }));
    expect(create).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I agree/ }));
    expect(create).toBeEnabled();
    await user.click(create);

    expect(await screen.findByText('Pin page')).toBeInTheDocument();
    expect(bodies).toEqual([
      {
        name: 'Mama Rudo Kitchen',
        townId: 'town-hwange',
        termsVersion: SIMPLE_TERMS.version,
        agreeToTerms: true,
      },
    ]);
    expect(sessionStorage.getItem('shop-setup:v2:owner-a')).toBeNull();
  });

  it('retries an unchanged signup with the same key, and a changed one with a new key', async () => {
    const user = userEvent.setup();
    serveTerms();
    const keys: (string | null)[] = [];
    mockServer.use(
      http.post('/api/v1/shop/shops', ({ request }) => {
        keys.push(request.headers.get('idempotency-key'));
        return HttpResponse.json(
          { code: 'SERVER', message: 'Try again.', correlationId: 'c' },
          { status: 503 },
        );
      }),
    );
    const first = mountSetup();
    await user.type(await screen.findByLabelText(/Shop name/), 'Mama Rudo Kitchen');
    await user.click(screen.getByLabelText(/Town/));
    await user.click(await screen.findByRole('option', { name: 'Hwange' }));
    await user.click(screen.getByRole('checkbox', { name: /I agree/ }));
    await user.click(screen.getByRole('button', { name: 'Create my shop' }));
    await waitFor(() => expect(keys).toHaveLength(1));
    // A reload keeps the key with the unchanged draft.
    first.unmount();
    mountSetup();
    await user.click(await screen.findByRole('checkbox', { name: /I agree/ }));
    await user.click(screen.getByRole('button', { name: 'Create my shop' }));
    await waitFor(() => expect(keys).toHaveLength(2));
    expect(keys[1]).toBe(keys[0]);

    await user.type(screen.getByLabelText(/Shop name/), ' Two');
    await user.click(screen.getByRole('button', { name: 'Create my shop' }));
    await waitFor(() => expect(keys).toHaveLength(3));
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('keeps typed input across a reload but never the terms tick', async () => {
    const user = userEvent.setup();
    serveTerms();
    const first = mountSetup();
    await user.type(await screen.findByLabelText(/Shop name/), 'Keep me');
    await user.click(screen.getByRole('checkbox', { name: /I agree/ }));
    first.unmount();
    mountSetup();
    expect(await screen.findByLabelText(/Shop name/)).toHaveValue('Keep me');
    expect(screen.getByRole('checkbox', { name: /I agree/ })).not.toBeChecked();
    expect(sessionStorage.getItem('shop-setup:v2:owner-a')).not.toMatch(/agree/i);
  });

  it('says signup is closed when no terms are published', async () => {
    serveTerms(null);
    mountSetup();
    expect(await screen.findByText(/Shop signup is closed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create my shop' })).not.toBeInTheDocument();
  });

  it('offers the pilot-shop claim only when adding another shop', async () => {
    serveTerms();
    mountSetup(true);
    expect(await screen.findByRole('heading', { name: 'Add another shop' })).toBeInTheDocument();
    expect(screen.getByText('The delivery team already set up my shop')).toBeInTheDocument();
  });
});

function serveShop(shop: WireShop) {
  mockServer.use(http.get(`/api/v1/shop/shops/${shop._id}`, () => HttpResponse.json({ shop })));
}

function mountPin(shop: WireShop) {
  serveShop(shop);
  return renderRoutes({
    routes: [
      { path: '/shop/:shopId/pin', element: <ShopPinPage /> },
      { path: '/shop/:shopId/catalogue', element: <p>Items page</p> },
    ],
    initialEntries: [`/shop/${shop._id}/pin`],
  });
}

describe('pin prompt straight after signup', () => {
  beforeEach(() => serveTowns());

  it('can be skipped without saving anything', async () => {
    const user = userEvent.setup();
    const patch = vi.fn();
    mockServer.use(http.patch('/api/v1/shop/shops/shop-new', patch));
    mountPin(simpleShop());
    expect(await screen.findByRole('heading', { name: 'Where is your shop?' })).toBeInTheDocument();
    expect(screen.getByText(/Riders need this to find your shop/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use my current location' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save my pin' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(await screen.findByText('Items page')).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });

  it('saves a pin without requiring an address', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    mockServer.use(
      http.patch('/api/v1/shop/shops/shop-new', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ shop: simpleShop({ pickup: PICKUP, version: 2 }) });
      }),
    );
    mountPin(simpleShop());
    await user.type(await screen.findByLabelText('Coordinates or map link'), '-18.36, 26.48');
    await user.click(screen.getByRole('button', { name: 'Use pasted pin' }));
    expect(screen.getByLabelText(/Short pickup address/)).not.toBeRequired();
    await user.click(screen.getByRole('button', { name: 'Save my pin' }));
    expect(await screen.findByText('Items page')).toBeInTheDocument();
    expect(bodies).toEqual([
      { expectedVersion: 1, pickup: { lat: -18.36, lng: 26.48, address: '' } },
    ]);
  });
});

function mountReminders(shop: WireShop, path = `/shop/${shop._id}/catalogue`) {
  return renderRoutes({
    routes: [
      { path: '/shop/:shopId/catalogue', element: <ShopReminders shop={shop} /> },
      { path: '/shop/:shopId/pin', element: <ShopReminders shop={shop} /> },
    ],
    initialEntries: [path],
  });
}

describe('pin and terms reminders in the shop shell', () => {
  it('reminds about the pin until it is set, with a one-tap link', async () => {
    serveTerms();
    const view = mountReminders(simpleShop());
    const link = await screen.findByRole('link', { name: 'Set pin' });
    expect(link).toHaveAttribute('href', '/shop/shop-new/pin');
    expect(screen.getByText(/Customers cannot order until it is set/)).toBeInTheDocument();
    view.unmount();

    mountReminders(simpleShop({ pickup: PICKUP }));
    await waitFor(() => expect(screen.queryByText(/Pin your shop/)).not.toBeInTheDocument());
  });

  it('does not repeat the pin reminder on the pin page itself', async () => {
    serveTerms();
    mountReminders(simpleShop(), '/shop/shop-new/pin');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText(/Pin your shop/)).not.toBeInTheDocument();
  });

  it('asks once to agree again when the terms version changes', async () => {
    const user = userEvent.setup();
    serveTerms({ version: '2027-01', url: '/terms' });
    const bodies: unknown[] = [];
    mockServer.use(
      http.post('/api/v1/shop/shops/shop-new/terms-agreement', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ shop: simpleShop({ version: 2 }) });
      }),
    );
    mountReminders(simpleShop({ pickup: PICKUP }));
    expect(await screen.findByText('The terms and conditions have changed')).toBeInTheDocument();
    const agree = screen.getByRole('button', { name: 'Agree' });
    expect(agree).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /I agree/ }));
    await user.click(agree);
    await waitFor(() => expect(bodies).toEqual([{ termsVersion: '2027-01', expectedVersion: 1 }]));
  });

  it('stays quiet when the shop agreed to the current terms and has a pin', async () => {
    serveTerms();
    mountReminders(simpleShop({ pickup: PICKUP }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
