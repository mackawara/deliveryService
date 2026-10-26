import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OwnerAuthContext, type OwnerAuthContextValue } from '@/auth/OwnerAuthProvider';
import { ShopOrdersPage } from '@/features/shop/ShopOrdersPage';
import { newerShopOrder, shopOrdersApi } from '@/api/endpoints/shopOrders';
import { serverTimeAt } from '@/features/shop/orderTime';
import { baseApi } from '@/api/baseApi';
import { mockServer } from '@/mocks/server';
import { renderRoutes } from './testUtils';
import { shopOrderFixture } from './shopOrderFixture';
import type { ShopOrder } from '@/api/dto/shopOrder';
import type { AppStore } from '@/app/store';

const auth: OwnerAuthContextValue = {
  status: 'authenticated',
  signingOut: false,
  error: undefined,
  refresh: () => {},
  signOut: async () => {},
  session: {
    owner: { id: 'owner-a', phone: '+263772000001', version: 1 },
    memberships: [
      {
        _id: 'member',
        shopId: 'branch-a',
        ownerId: 'owner-a',
        townId: 'town',
        role: 'OWNER',
        status: 'ACTIVE',
        version: 1,
        createdAt: '',
        updatedAt: '',
      },
    ],
    capabilities: ['orders:manage'],
    session: { expiresAt: '', idleExpiresAt: '' },
  },
};
let current: ShopOrder;
let reads = 0;
let store: AppStore | undefined;
function mount(path = '/shop/branch-a/orders/order-a', value = auth) {
  const view = renderRoutes({
    routes: [
      {
        path: '/shop/:shopId/orders/:orderId?',
        element: (
          <OwnerAuthContext.Provider value={value}>
            <ShopOrdersPage />
          </OwnerAuthContext.Provider>
        ),
      },
    ],
    initialEntries: [path],
  });
  store = view.store;
  return view;
}
beforeEach(() => {
  current = shopOrderFixture();
  reads = 0;
  mockServer.use(
    http.get('*/shop/food-orders/:id', () => {
      reads++;
      return HttpResponse.json({ order: current, serverNow: current.serverNow });
    }),
    http.get('*/shop/food-orders', () => {
      reads++;
      return HttpResponse.json({
        items: [current],
        nextCursor: null,
        serverNow: current.serverNow,
        pollingIntervalMs: 5000,
      });
    }),
    http.get('*/shop/auth/csrf', () => HttpResponse.json({ csrfToken: 'owner-csrf' })),
  );
});
afterEach(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  store?.dispatch(baseApi.util.resetApiState());
  vi.restoreAllMocks();
});

describe('shop inbox and guarded actions (#22)', () => {
  it('requires a whole preparation estimate, confirms only after server success, and keeps READY separate', async () => {
    const calls: unknown[] = [];
    mockServer.use(
      http.post('*/shop/food-orders/:id/accept', async ({ request }) => {
        calls.push(await request.json());
        expect(request.headers.get('x-csrf-token')).toBe('owner-csrf');
        current = shopOrderFixture({
          status: 'PREPARING',
          version: 2,
          prepMinutes: 15,
          estimatedReadyAt: '2026-10-25T10:15:00.000Z',
          acceptedAt: current.serverNow,
          availableActions: ['READY'],
        });
        return HttpResponse.json({ order: current, serverNow: current.serverNow });
      }),
    );
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Accept order' }));
    expect(screen.getByRole('button', { name: 'Confirm action' })).toBeDisabled();
    await user.type(screen.getByLabelText(/Preparation minutes/), '1.5');
    expect(screen.getByRole('button', { name: 'Confirm action' })).toBeDisabled();
    await user.clear(screen.getByLabelText(/Preparation minutes/));
    await user.type(screen.getByLabelText(/Preparation minutes/), '15');
    await user.dblClick(screen.getByRole('button', { name: 'Confirm action' }));
    expect(await screen.findByRole('button', { name: 'Ready for pickup' })).toBeEnabled();
    expect(calls).toEqual([{ expectedVersion: 1, prepMinutes: 15 }]);
    expect(screen.queryByRole('button', { name: 'Reject order' })).not.toBeInTheDocument();
    expect(screen.getByText(/Original pizza snapshot/)).toBeVisible();
    expect(screen.getByText(/Total: USD \$15.50/)).toBeVisible();
  });
  it('disables an open dialog as soon as a newer WhatsApp state arrives', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Accept order' }));
    await user.type(screen.getByLabelText(/Preparation minutes/), '15');
    current = shopOrderFixture({ status: 'PREPARING', version: 2, availableActions: ['READY'] });
    act(() => store!.dispatch(baseApi.internalActions.onFocus()));
    await screen.findByText('This order changed. Close this dialog and review the current status.');
    expect(screen.getByRole('button', { name: 'Confirm action' })).toBeDisabled();
  });
  it('replays precisely the original timeout payload/key, even after the order changes', async () => {
    let release!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: { key: string | null; body: unknown }[] = [];
    mockServer.use(
      http.post('*/shop/food-orders/:id/accept', async ({ request }) => {
        calls.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
        current = shopOrderFixture({
          status: 'PREPARING',
          version: 2,
          availableActions: ['READY'],
        });
        if (calls.length === 1) {
          await inFlight;
          return HttpResponse.error();
        }
        return HttpResponse.json({ order: current, serverNow: current.serverNow });
      }),
    );
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Accept order' }));
    await user.type(screen.getByLabelText(/Preparation minutes/), '12');
    await user.click(screen.getByRole('button', { name: 'Confirm action' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByRole('button', { name: 'Confirming…' })).toBeDisabled();
    expect(calls).toHaveLength(1);
    act(() => release());
    await screen.findByText(/Outcome unconfirmed/);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Backgrounding a phone must retain the uncertain command above the paused refresh timer.
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(screen.getByRole('button', { name: 'Retry original action' })).toBeVisible();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Retry original action' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toEqual(calls[0]);
    expect(await screen.findByText(/Action confirmed by the server/)).toBeVisible();
  });
  it('shows the winning WhatsApp outcome after conflict and never sends a new key silently', async () => {
    mockServer.use(
      http.post('*/shop/food-orders/:id/reject', () => {
        current = shopOrderFixture({
          status: 'PREPARING',
          version: 2,
          availableActions: ['READY'],
        });
        return HttpResponse.json(
          {
            code: 'FOOD_ORDER_STATE_CHANGED',
            message: 'Refresh its status.',
            correlationId: 'race',
          },
          { status: 409 },
        );
      }),
    );
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Reject order' }));
    expect(screen.getByRole('button', { name: 'Confirm action' })).toBeDisabled();
    await user.click(screen.getByLabelText(/Rejection reason/));
    await user.click(screen.getByRole('option', { name: 'Too busy' }));
    await user.click(screen.getByRole('button', { name: 'Confirm action' }));
    expect(await screen.findByRole('button', { name: 'Ready for pickup' })).toBeVisible();
    expect(screen.getByText(/changed in another tab or WhatsApp/)).toBeVisible();
  });
  it('polls within five seconds, announces arrivals, and recovers immediately on focus', async () => {
    const view = mount('/shop/branch-a/orders');
    await screen.findByRole('heading', { name: 'FOOD-001' });
    current = shopOrderFixture({ id: 'order-new', reference: 'FOOD-NEW' });
    await screen.findByRole('heading', { name: 'FOOD-NEW' }, { timeout: 6500 });
    expect(screen.getByText('1 new order arrived.')).toBeVisible();
    current = shopOrderFixture({ id: 'order-focus', reference: 'FOOD-FOCUS' });
    act(() => store!.dispatch(baseApi.internalActions.onFocus()));
    await screen.findByRole('heading', { name: 'FOOD-FOCUS' });
    view.unmount();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const before = reads;
    await new Promise((resolve) => setTimeout(resolve, 5100));
    expect(reads).toBe(before);
  }, 15000);
  it('pauses when hidden, shows offline state and refetches on reconnect/visibility recovery', async () => {
    mount();
    await screen.findByRole('heading', { name: 'FOOD-001' });
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const before = reads;
    await new Promise((resolve) => setTimeout(resolve, 5100));
    expect(reads).toBe(before);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    act(() => window.dispatchEvent(new Event('offline')));
    expect(screen.getByText(/Offline. Orders may have changed/)).toBeVisible();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(reads).toBeGreaterThan(before));
  }, 12000);
  it('ignores a wrong device clock and displays overdue preparation without dispatching', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2099-01-01T00:00:00Z'));
    current = shopOrderFixture({
      status: 'PREPARING',
      version: 2,
      availableActions: ['READY'],
      estimatedReadyAt: '2026-10-25T09:59:00Z',
    });
    mount();
    expect(await screen.findByText(/Preparation overdue/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ready for pickup' })).toBeVisible();
    expect(screen.queryByText('Finding a rider')).not.toBeInTheDocument();
    expect(serverTimeAt('2026-10-25T10:00:00Z', 100, 2100)).toBe(
      Date.parse('2026-10-25T10:00:02Z'),
    );
  });
  it('keeps a configured one-minute polling cadence fresh until three intervals are missed', async () => {
    let monotonic = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonic);
    current = shopOrderFixture({ pollingIntervalMs: 60000 });
    mount();
    const accept = await screen.findByRole('button', { name: 'Accept order' });
    monotonic = 20000;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(accept).toBeEnabled();
    monotonic = 181000;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    expect(accept).toBeDisabled();
    expect(screen.getByText(/Order information is stale/)).toBeVisible();
  });
  it('hides actions for terminal orders and hides protected stale data on a resource denial', async () => {
    current = shopOrderFixture({
      status: 'CANCELLED',
      availableActions: [],
      delivery: { ...current.delivery, progress: 'CLOSED' },
    });
    mount();
    await screen.findByRole('heading', { name: 'FOOD-001' });
    expect(screen.queryByRole('button', { name: 'Accept order' })).not.toBeInTheDocument();
    mockServer.use(
      http.get('*/shop/food-orders/:id', () =>
        HttpResponse.json(
          { code: 'FOOD_ORDER_NOT_FOUND', message: 'Order not found.' },
          { status: 404 },
        ),
      ),
    );
    act(() => store!.dispatch(baseApi.internalActions.onFocus()));
    await screen.findByText('Order not found.');
    expect(screen.queryByText(/Original pizza snapshot/)).not.toBeInTheDocument();
  });
  it('never queries guessed branches and partitions every detail key by owner and branch', async () => {
    mount('/shop/branch-b/orders/order-a');
    expect(await screen.findByText(/Orders are unavailable/)).toBeVisible();
    expect(reads).toBe(0);
    const first = store!.dispatch(
      shopOrdersApi.endpoints.getShopOrder.initiate({
        ownerId: 'a',
        shopId: 'branch-a',
        id: 'same',
      }),
    );
    const second = store!.dispatch(
      shopOrdersApi.endpoints.getShopOrder.initiate({
        ownerId: 'b',
        shopId: 'branch-b',
        id: 'same',
      }),
    );
    await Promise.all([first, second]);
    const keys = Object.keys(store!.getState().deliveryApi.queries);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
    store!.dispatch(baseApi.util.resetApiState());
    expect(Object.keys(store!.getState().deliveryApi.queries)).toHaveLength(0);
    first.unsubscribe();
    second.unsubscribe();
  });
  it('cannot roll back newer order or delivery versions with reordered reads/replays', () => {
    const newer = shopOrderFixture({ version: 3, status: 'READY' });
    expect(newerShopOrder(newer, shopOrderFixture())).toBe(newer);
    const assigned = {
      ...newer,
      delivery: { ...newer.delivery, version: 8, progress: 'ASSIGNED' },
    };
    expect(newerShopOrder(assigned, newer)).toBe(assigned);
  });
});
