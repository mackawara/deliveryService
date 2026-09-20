import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { routes } from '@/app/router';
import { staffSession } from '@/mocks/fixtures';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';
import type { RootState } from '@/app/store';
import { renderRoutes } from './testUtils';

/** Cache keys for endpoints that carry delivery-service data, ignoring the session probes. */
function protectedQueryKeys(state: RootState): string[] {
  return Object.keys(state.deliveryApi.queries).filter(
    (key) => !key.startsWith('getCsrf') && !key.startsWith('getMe'),
  );
}

describe('session lifecycle', () => {
  it('returns to the login page once when protected requests are rejected together', async () => {
    resetMockState({ authenticated: true });
    let sessionValid = true;
    const unauthorized = () =>
      HttpResponse.json(
        { code: 'UNAUTHENTICATED', message: 'Authentication required.', correlationId: 'corr' },
        { status: 401 },
      );

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

    const { store } = renderRoutes({ routes, initialEntries: ['/bookings'] });

    expect(
      await screen.findByRole('button', { name: /Send code on WhatsApp/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Your session ended/i)).toBeInTheDocument();
    await waitFor(() => expect(protectedQueryKeys(store.getState())).toEqual([]));
  });

  it('clears local data on sign-out even though the server confirmed it', async () => {
    resetMockState({ authenticated: true });
    const user = userEvent.setup();
    const { store } = renderRoutes({ routes, initialEntries: ['/'] });

    await screen.findByRole('heading', { name: 'Overview' });
    await user.click(screen.getByRole('button', { name: /Account menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: /Sign out/i }));

    expect(await screen.findByRole('heading', { name: /You are signed out/i })).toBeInTheDocument();
    await waitFor(() => expect(protectedQueryKeys(store.getState())).toEqual([]));
  });

  it('signs out locally when the server cannot confirm the revocation', async () => {
    resetMockState({ authenticated: true });
    mockServer.use(
      http.post('/api/v1/auth/logout', () =>
        HttpResponse.json(
          { code: 'INTERNAL_ERROR', message: 'Something went wrong.' },
          { status: 500 },
        ),
      ),
    );

    const user = userEvent.setup();
    const { store } = renderRoutes({ routes, initialEntries: ['/'] });

    await screen.findByRole('heading', { name: 'Overview' });
    await user.click(screen.getByRole('button', { name: /Account menu/i }));
    await user.click(await screen.findByRole('menuitem', { name: /Sign out/i }));

    expect(await screen.findByRole('heading', { name: /You are signed out/i })).toBeInTheDocument();
    await waitFor(() => expect(protectedQueryKeys(store.getState())).toEqual([]));
    // The page says plainly that the server did not confirm the revocation.
    expect(await screen.findByText(/could not confirm that this session was revoked/i)).toBeInTheDocument();
  });
});
