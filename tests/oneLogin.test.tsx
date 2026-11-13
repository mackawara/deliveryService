import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { baseApi } from '@/api/baseApi';
import { sessionApi } from '@/api/endpoints/session';
import { routes } from '@/app/router';
import { externalNavigation } from '@/lib/externalNavigation';
import { MockLoginPage } from '@/mocks/MockLoginPage';
import { mockRolesFor, resetMockState } from '@/mocks/handlers';
import { renderRoutes } from './testUtils';

const OWNER_HOME = 'Set up a branch';

/** Every address the app might be asked for by someone who is not signed in. */
const leftForLogin = () =>
  [externalNavigation.replace, externalNavigation.assign].flatMap((spy) =>
    (spy as unknown as { mock: { calls: string[][] } }).mock.calls.map(([url]) => url),
  );

/**
 * Issue 33: this app has no login page of its own. Anyone who needs to sign in is sent
 * to the one login, which is served outside the app, and comes back to the right place
 * for their role.
 */
describe('no login form in this app', () => {
  it.each(['/login', '/login?returnTo=%2Fbookings'])(
    'has no route of its own at %s',
    async (address) => {
      resetMockState();
      renderRoutes({ routes, initialEntries: [address] });
      expect(await screen.findByRole('heading', { name: /Page not found/i })).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    },
  );

  it.each([
    ['/shop/login', '/login'],
    ['/shop/signup', '/login?intent=shop'],
    [
      '/shop/login?returnTo=%2Fshop%2Fbranch-1%2Forders',
      '/login?returnTo=%2Fshop%2Fbranch-1%2Forders',
    ],
    ['/shop/login?returnTo=https%3A%2F%2Fevil.example', '/login'],
  ])('sends the old link %s to the one login', async (address, expected) => {
    resetMockState();
    renderRoutes({ routes, initialEntries: [address] });
    await waitFor(() => expect(externalNavigation.replace).toHaveBeenCalledWith(expected));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it.each([
    ['/bookings?status=CONFIRMED', '/login?returnTo=%2Fbookings%3Fstatus%3DCONFIRMED'],
    ['/', '/login?returnTo=%2Fdashboard'],
    ['/shop/branch-1/orders', '/login?returnTo=%2Fshop%2Fbranch-1%2Forders'],
    ['/shop', '/login?returnTo=%2Fshop'],
  ])('sends a signed-out visitor at %s to the one login and back', async (address, expected) => {
    resetMockState();
    renderRoutes({ routes, initialEntries: [address] });
    await waitFor(() => expect(leftForLogin()).toEqual([expected]));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('opens the retired read-only shop page as the shop itself', async () => {
    resetMockState({ owner: true });
    renderRoutes({ routes, initialEntries: ['/shop/dashboard'] });
    expect(await screen.findByRole('heading', { name: OWNER_HOME })).toBeInTheDocument();
  });
});

describe('someone signed in as the other role', () => {
  it('takes a shop owner who opens an admin address to their shop, not to a login', async () => {
    resetMockState({ owner: true });
    const { router } = renderRoutes({ routes, initialEntries: ['/bookings'] });

    expect(await screen.findByRole('heading', { name: OWNER_HOME })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/shop/setup');
    expect(leftForLogin()).toEqual([]);
    expect(screen.queryByRole('heading', { name: 'Bookings' })).not.toBeInTheDocument();
  });

  it('takes staff who open a shop address to the admin dashboard, not to a login', async () => {
    resetMockState({ authenticated: true });
    const { router } = renderRoutes({ routes, initialEntries: ['/shop/branch-1/catalogue'] });

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(leftForLogin()).toEqual([]);
  });

  it('offers neither shell a switch link when the number holds one role', async () => {
    resetMockState({ authenticated: true });
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/dashboard'] });
    await screen.findByRole('heading', { name: 'Overview' });
    await user.click(screen.getByRole('button', { name: /Account menu/i }));
    await screen.findByRole('menuitem', { name: /Sign out/i });
    expect(screen.queryByRole('menuitem', { name: /Switch to my shop/i })).not.toBeInTheDocument();
  });
});

describe('a number that is both staff and a shop owner', () => {
  it('switches between the two shells without signing out', async () => {
    resetMockState({ authenticated: true, owner: true });
    const user = userEvent.setup();
    const { router } = renderRoutes({ routes, initialEntries: ['/dashboard'] });

    await screen.findByRole('heading', { name: 'Overview' });
    await user.click(screen.getByRole('button', { name: /Account menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: /Switch to my shop/i }));

    expect(await screen.findByRole('heading', { name: OWNER_HOME })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/shop/setup');

    await user.click(await screen.findByRole('link', { name: /Switch to admin/i }));
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(leftForLogin()).toEqual([]);
  });

  it('ends both sessions from either shell, on the same signed-out page', async () => {
    for (const start of ['/dashboard', '/shop/setup']) {
      resetMockState({ authenticated: true, owner: true });
      const user = userEvent.setup();
      const { store, unmount } = renderRoutes({ routes, initialEntries: [start] });

      if (start === '/dashboard') {
        await screen.findByRole('heading', { name: 'Overview' });
        await user.click(screen.getByRole('button', { name: /Account menu/i }));
        await user.click(await screen.findByRole('menuitem', { name: /Sign out/i }));
      } else {
        await screen.findByRole('heading', { name: OWNER_HOME });
        await user.click(screen.getByRole('button', { name: /Sign out/i }));
      }

      expect(
        await screen.findByRole('heading', { name: /You are signed out/i }),
      ).toBeInTheDocument();
      // The mock API, like the real one, ended both sessions with the one call.
      const access = await store
        .dispatch(sessionApi.endpoints.getAccess.initiate(undefined, { forceRefetch: true }))
        .unwrap();
      expect(access.destinations).toEqual([]);
      unmount();
    }
  });

  it('goes to the login, not the other shell, when the session in use expires', async () => {
    resetMockState({ authenticated: true, owner: true });
    const { store } = renderRoutes({ routes, initialEntries: ['/shop/setup'] });
    await screen.findByRole('heading', { name: OWNER_HOME });

    // Only the shop session ends; the staff one is still live.
    resetMockState({ authenticated: true, owner: false });
    act(() => {
      store.dispatch(baseApi.util.invalidateTags(['Shop']));
    });

    await waitFor(() =>
      expect(externalNavigation.assign).toHaveBeenCalledWith(
        '/login?returnTo=%2Fshop%2Fsetup&reason=expired',
      ),
    );
    expect(screen.queryByRole('heading', { name: 'Overview' })).not.toBeInTheDocument();
  });
});

/** Mock mode has no API to serve `/login`, so a development-only page stands in for it. */
describe('the mock-mode stand-in for the external login', () => {
  const standIn = [{ path: '/login', element: <MockLoginPage /> }];

  async function signIn(phone: string, address = '/login') {
    resetMockState();
    const user = userEvent.setup();
    renderRoutes({ routes: standIn, initialEntries: [address] });
    await user.type(screen.getByRole('textbox', { name: /WhatsApp number/i }), phone);
    await user.click(screen.getByRole('button', { name: /Send code/i }));
    await user.type(await screen.findByRole('textbox', { name: /Login code/i }), '123456');
    await user.click(screen.getByRole('button', { name: /Log in/i }));
    return user;
  }

  it('is not part of the application route table outside mock mode', () => {
    const paths = (list: typeof routes): string[] =>
      list.flatMap((route) => [route.path ?? '', ...paths(route.children ?? [])]);
    expect(paths(routes)).not.toContain('/login');
    expect(paths(routes)).not.toContain('login');
  });

  it('gives each kind of number its roles', () => {
    expect(mockRolesFor('0772000001')).toEqual({ staff: true, owner: false });
    expect(mockRolesFor('0772000002')).toEqual({ staff: false, owner: true });
    expect(mockRolesFor('+263 77 200 0003')).toEqual({ staff: true, owner: true });
  });

  it('signs staff in and returns them to the page they asked for', async () => {
    await signIn('0772000001', '/login?returnTo=%2Fbookings%3Fstatus%3DCONFIRMED');
    await waitFor(() =>
      expect(externalNavigation.assign).toHaveBeenCalledWith('/bookings?status=CONFIRMED'),
    );
  });

  it('sends a shop owner to their shop, ignoring a return page for the other role', async () => {
    await signIn('0772000002', '/login?returnTo=%2Fbookings');
    await waitFor(() => expect(externalNavigation.assign).toHaveBeenCalledWith('/shop/setup'));
  });

  it('asks a dual-role number where to go, every time', async () => {
    const user = await signIn('0772000003', '/login?returnTo=%2Fshop%2Fbranch-1%2Forders');
    const choices = await screen.findByText(/Where would you like to go/i);
    expect(choices).toBeInTheDocument();
    expect(externalNavigation.assign).not.toHaveBeenCalled();

    const form = within(document.body);
    await user.click(form.getByRole('button', { name: 'My shop' }));
    expect(externalNavigation.assign).toHaveBeenLastCalledWith('/shop/branch-1/orders');
    await user.click(form.getByRole('button', { name: 'Admin dashboard' }));
    expect(externalNavigation.assign).toHaveBeenLastCalledWith('/dashboard');
  });

  it('reports a wrong code', async () => {
    resetMockState();
    const user = userEvent.setup();
    renderRoutes({ routes: standIn, initialEntries: ['/login'] });
    await user.type(screen.getByRole('textbox', { name: /WhatsApp number/i }), '0772000001');
    await user.click(screen.getByRole('button', { name: /Send code/i }));
    await user.type(await screen.findByRole('textbox', { name: /Login code/i }), '000000');
    await user.click(screen.getByRole('button', { name: /Log in/i }));
    expect(await screen.findByText(/not valid or has expired/i)).toBeInTheDocument();
    expect(externalNavigation.assign).not.toHaveBeenCalled();
  });
});
