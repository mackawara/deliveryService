import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { baseApi } from '@/api/baseApi';
import { isShopRequest } from '@/api/baseQuery';
import { foodPaymentsApi } from '@/api/endpoints/foodPayments';
import { routes } from '@/app/router';
import { externalNavigation } from '@/lib/externalNavigation';
import { staffSession } from '@/mocks/fixtures';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';
import { createAppStore, type RootState } from '@/app/store';
import { renderRoutes } from './testUtils';

/** Cache keys for endpoints that carry delivery-service data, ignoring the session probes. */
function protectedQueryKeys(state: RootState): string[] {
  return Object.keys(state.deliveryApi.queries).filter(
    (key) => !/^(getCsrf|getMe|getAccess|getShopCsrf|getShopMe)/.test(key),
  );
}

const unauthorized = () =>
  HttpResponse.json(
    { code: 'UNAUTHENTICATED', message: 'Authentication required.', correlationId: 'corr' },
    { status: 401 },
  );
const serverError = () =>
  HttpResponse.json({ code: 'INTERNAL_ERROR', message: 'Something went wrong.' }, { status: 500 });

describe('staff session lifecycle', () => {
  it('leaves for the one login once when protected requests are rejected together', async () => {
    resetMockState({ authenticated: true });
    let sessionValid = true;
    mockServer.use(
      http.get('/api/v1/admin/me', () =>
        sessionValid
          ? HttpResponse.json({
              ...staffSession,
              session: {
                expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                idleExpiresAt: new Date(Date.now() + 1_800_000).toISOString(),
              },
            })
          : unauthorized(),
      ),
      // Both list requests on the bookings screen fail at once, as an expiry would.
      http.get('/api/v1/admin/bookings', () => {
        sessionValid = false;
        return unauthorized();
      }),
      http.get('/api/v1/admin/drivers', () => {
        sessionValid = false;
        return unauthorized();
      }),
    );

    const { store } = renderRoutes({ routes, initialEntries: ['/bookings?status=CONFIRMED'] });

    // The login page is outside this app: one full-page move, remembering this page.
    await waitFor(() => expect(externalNavigation.assign).toHaveBeenCalled());
    expect(externalNavigation.assign).toHaveBeenCalledTimes(1);
    expect(externalNavigation.assign).toHaveBeenCalledWith(
      '/login?returnTo=%2Fbookings%3Fstatus%3DCONFIRMED&reason=expired',
    );
    expect(await screen.findByText(/Your session ended/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Bookings' })).not.toBeInTheDocument();
    await waitFor(() => expect(protectedQueryKeys(store.getState())).toEqual([]));
  });

  it('clears local data on sign-out once the server confirmed it', async () => {
    resetMockState({ authenticated: true });
    const user = userEvent.setup();
    const { store } = renderRoutes({ routes, initialEntries: ['/dashboard'] });

    await screen.findByRole('heading', { name: 'Overview' });
    await user.click(screen.getByRole('button', { name: /Account menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: /Sign out/i }));

    expect(await screen.findByRole('heading', { name: /You are signed out/i })).toBeInTheDocument();
    await waitFor(() => expect(protectedQueryKeys(store.getState())).toEqual([]));
    expect(screen.getByRole('link', { name: /Sign in again/i })).toHaveAttribute('href', '/login');
    expect(externalNavigation.assign).not.toHaveBeenCalled();
  });

  it('says so when the server cannot confirm the sign-out', async () => {
    resetMockState({ authenticated: true });
    mockServer.use(http.post('/api/v1/auth/logout', serverError));

    const user = userEvent.setup();
    const { store } = renderRoutes({ routes, initialEntries: ['/dashboard'] });

    await screen.findByRole('heading', { name: 'Overview' });
    await user.click(screen.getByRole('button', { name: /Account menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: /Sign out/i }));

    expect(
      await screen.findByRole('heading', { name: /Sign-out was not confirmed/i }),
    ).toBeInTheDocument();
    await waitFor(() => expect(protectedQueryKeys(store.getState())).toEqual([]));
    expect(screen.getByText(/may still be open on this device/i)).toBeInTheDocument();
  });
});

/**
 * Issue 32: after a shop owner signs out, a refresh or a return visit must not show
 * them signed in. The mock owner has no branch yet, so their home is shop setup.
 */
describe('shop owner sign-out', () => {
  const OWNER_HOME = 'Set up a branch';

  async function openShop(user: ReturnType<typeof userEvent.setup>) {
    const rendered = renderRoutes({ routes, initialEntries: ['/shop/setup'] });
    await screen.findByRole('heading', { name: OWNER_HOME });
    return {
      ...rendered,
      signOut: () => user.click(screen.getByRole('button', { name: /Sign out/i })),
    };
  }

  /** Counts identity reads, and keeps answering as if the session were still live. */
  function countIdentityReads() {
    const reads = { me: 0, shops: 0 };
    mockServer.use(
      http.get('/api/v1/shop/me', () => {
        reads.me += 1;
        return HttpResponse.json({
          owner: { id: 'mock-owner', phone: '+263772000002', version: 1 },
          memberships: [],
          capabilities: ['shop:create'],
          session: { expiresAt: '2099-01-01T00:00:00Z', idleExpiresAt: '2099-01-01T00:00:00Z' },
        });
      }),
      http.get('/api/v1/shop/shops', () => {
        reads.shops += 1;
        return HttpResponse.json({ items: [], limit: 100, skip: 0 });
      }),
    );
    return reads;
  }

  it('ends every session through the one sign-out and shows the signed-out page', async () => {
    resetMockState({ owner: true });
    const logouts: Array<string | null> = [];
    mockServer.use(
      http.post('/api/v1/auth/logout', ({ request }) => {
        logouts.push(request.headers.get('x-csrf-token'));
        resetMockState();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const { store, signOut } = await openShop(user);
    await signOut();

    expect(await screen.findByRole('heading', { name: /You are signed out/i })).toBeInTheDocument();
    // One call, to the unified sign-out, proving itself with the owner's own token.
    expect(logouts).toEqual(['mock-shop-csrf-authenticated']);
    await waitFor(() => expect(protectedQueryKeys(store.getState())).toEqual([]));
    expect(screen.queryByRole('heading', { name: OWNER_HOME })).not.toBeInTheDocument();
    expect(externalNavigation.assign).not.toHaveBeenCalled();
    expect(externalNavigation.replace).not.toHaveBeenCalled();
  });

  it('does not return the owner to the catalogue when the sign-out request fails', async () => {
    resetMockState({ owner: true });
    const reads = countIdentityReads();
    let failing = true;
    mockServer.use(
      http.post('/api/v1/auth/logout', () =>
        failing ? serverError() : new HttpResponse(null, { status: 204 }),
      ),
    );
    const user = userEvent.setup();
    const { store, signOut } = await openShop(user);
    await signOut();

    // The owner is told, instead of the failure being thrown away.
    expect(
      await screen.findByRole('heading', { name: /Sign-out was not confirmed/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/may still be open on this device/i)).toBeInTheDocument();

    // The session is still live on the server, and `/shop/me` would say so. It is
    // not asked: neither a poll nor a cache refresh restores the session.
    const before = { ...reads };
    act(() => {
      store.dispatch(baseApi.util.invalidateTags(['Shop', 'Session']));
    });
    await delay(150);
    expect(reads).toEqual(before);
    expect(screen.queryByRole('heading', { name: OWNER_HOME })).not.toBeInTheDocument();
    expect(store.getState().session.locallySignedOut).toBe(true);

    // "Try again" asks the server again and reports the confirmed result.
    failing = false;
    await user.click(screen.getByRole('button', { name: /Try again/i }));
    expect(await screen.findByRole('heading', { name: /You are signed out/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again/i })).not.toBeInTheDocument();
  });

  it('keeps saying it is unconfirmed while "Try again" still fails', async () => {
    resetMockState({ owner: true });
    mockServer.use(http.post('/api/v1/auth/logout', serverError));
    const user = userEvent.setup();
    const { signOut } = await openShop(user);
    await signOut();

    await user.click(await screen.findByRole('button', { name: /Try again/i }));
    expect(await screen.findByText(/Still not confirmed/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Sign-out was not confirmed/i }),
    ).toBeInTheDocument();
  });

  it('stops waiting for a server that never answers and reports it as unconfirmed', async () => {
    resetMockState({ owner: true });
    mockServer.use(
      http.post('/api/v1/auth/logout', async () => {
        await delay('infinite');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const { signOut } = await openShop(user);
    const started = Date.now();
    await signOut();

    expect(
      await screen.findByRole('heading', { name: /Sign-out was not confirmed/i }),
    ).toBeInTheDocument();
    // Bounded: about two seconds, not the request timeout.
    expect(Date.now() - started).toBeLessThan(6000);
  });

  it('succeeds when the session had already ended on the server', async () => {
    resetMockState({ owner: true });
    const user = userEvent.setup();
    const { signOut } = await openShop(user);
    // The session ends elsewhere; the click arrives late. The server answers success.
    resetMockState();
    await signOut();

    expect(await screen.findByRole('heading', { name: /You are signed out/i })).toBeInTheDocument();
    expect(externalNavigation.assign).not.toHaveBeenCalled();
  });

  it('stops polling the owner and the branch list as soon as sign-out starts', async () => {
    resetMockState({ owner: true });
    const reads = countIdentityReads();
    let release: () => void = () => {};
    mockServer.use(
      http.post('/api/v1/auth/logout', async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const { store, signOut } = await openShop(user);
    await signOut();

    // The request is still in flight: nothing may refetch while it is.
    await waitFor(() => expect(store.getState().session.signingOut).toBe(true));
    const before = { ...reads };
    act(() => {
      store.dispatch(baseApi.util.invalidateTags(['Shop', 'Session']));
    });
    await delay(150);
    expect(reads).toEqual(before);

    release();
    expect(await screen.findByRole('heading', { name: /You are signed out/i })).toBeInTheDocument();
  });

  it('shows the signed-out page, not shop data, when Back returns to a shop page', async () => {
    resetMockState({ owner: true });
    countIdentityReads();
    mockServer.use(http.post('/api/v1/auth/logout', serverError));
    const user = userEvent.setup();
    const { router, signOut } = await openShop(user);
    await signOut();
    await screen.findByRole('heading', { name: /Sign-out was not confirmed/i });

    await act(() => router.navigate('/shop/setup'));
    // Straight back to the signed-out page, with its warning intact.
    await waitFor(() => expect(router.state.location.pathname).toBe('/signed-out'));
    expect(
      await screen.findByRole('heading', { name: /Sign-out was not confirmed/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: OWNER_HOME })).not.toBeInTheDocument();
  });

  it('reloads a page the browser restored from its back/forward cache', async () => {
    resetMockState({ owner: true });
    const user = userEvent.setup();
    await openShop(user);

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    expect(externalNavigation.reload).not.toHaveBeenCalled();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(externalNavigation.reload).toHaveBeenCalledTimes(1);
  });
});

describe('shop owner session expiry', () => {
  it('lands on the one login with the shop page to return to, never the staff transition', async () => {
    resetMockState({ owner: true });
    const { store } = renderRoutes({ routes, initialEntries: ['/shop/setup'] });
    await screen.findByRole('heading', { name: 'Set up a branch' });

    // The session ends; the next identity read finds out.
    resetMockState();
    act(() => {
      store.dispatch(baseApi.util.invalidateTags(['Shop']));
    });

    await waitFor(() => expect(externalNavigation.assign).toHaveBeenCalled());
    expect(externalNavigation.assign).toHaveBeenCalledTimes(1);
    expect(externalNavigation.assign).toHaveBeenCalledWith(
      '/login?returnTo=%2Fshop%2Fsetup&reason=expired',
    );
    expect(store.getState().session).toMatchObject({ ownerExpired: true, expired: false });
    expect(await screen.findByText(/Your session ended/i)).toBeInTheDocument();
  });

  it('recognises every owner request by its path, including ones no list remembered', () => {
    expect(isShopRequest('/shop/me')).toBe(true);
    expect(isShopRequest({ url: '/shop/shops/branch-1/payment-settings' })).toBe(true);
    expect(isShopRequest({ url: '/shop/food-orders?shopId=branch-1' })).toBe(true);
    expect(isShopRequest('/shop')).toBe(true);
    expect(isShopRequest('/admin/food/shops')).toBe(false);
    expect(isShopRequest('/admin/food/shops/branch-1/payment-settings')).toBe(false);
    expect(isShopRequest('/shopping')).toBe(false);
    expect(isShopRequest('/auth/logout')).toBe(false);
  });

  it('does not run the staff transition when the owner payment-settings request is refused', async () => {
    mockServer.use(http.get('/api/v1/shop/shops/branch-1/payment-settings', unauthorized));
    const store = createAppStore();
    const request = store.dispatch(
      foodPaymentsApi.endpoints.getOwnerShopPaymentSettings.initiate({
        shopId: 'branch-1',
        scopeKey: 'owner',
      }),
    );
    const result = await request;
    request.unsubscribe();

    expect(result.error).toMatchObject({ kind: 'unauthenticated' });
    expect(store.getState().session.expired).toBe(false);
  });
});
