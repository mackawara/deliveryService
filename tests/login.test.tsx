import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { clearCsrfToken } from '@/api/csrf';
import { routes } from '@/app/router';
import { mockServer } from '@/mocks/server';
import { resetMockState } from '@/mocks/handlers';
import { renderRoutes } from './testUtils';

async function requestCode(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /WhatsApp number/i }), '772000001');
  await user.click(screen.getByRole('checkbox', { name: /Send a login code/i }));
  await user.click(screen.getByRole('button', { name: /Send code on WhatsApp/i }));
}

describe('WhatsApp OTP sign-in', () => {
  it('acknowledges a request without disclosing whether the number is staff', async () => {
    resetMockState({ authenticated: false });
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/login'] });

    await screen.findByRole('button', { name: /Send code on WhatsApp/i });
    await requestCode(user);

    expect(
      await screen.findByText(
        /If this number is registered and eligible, a code will arrive on WhatsApp/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Verification code/i })).toBeInTheDocument();
  });

  it('fetches the CSRF token again when the first fetch failed, instead of sending without one', async () => {
    resetMockState({ authenticated: false });
    clearCsrfToken();
    let csrfCalls = 0;
    let sentToken: string | null = null;
    mockServer.use(
      // The API was unreachable when the page loaded, then came back.
      http.get('/api/v1/auth/csrf', () => {
        csrfCalls += 1;
        return csrfCalls === 1
          ? HttpResponse.error()
          : HttpResponse.json({ csrfToken: 'recovered-token' });
      }),
      http.post('/api/v1/auth/otp/request', ({ request }) => {
        sentToken = request.headers.get('x-csrf-token');
        const later = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
        return HttpResponse.json(
          { challengeId: 'challenge-recovered', expiresAt: later(300), resendAt: later(60) },
          { status: 202 },
        );
      }),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/login'] });

    await screen.findByRole('button', { name: /Send code on WhatsApp/i });
    await waitFor(() => expect(csrfCalls).toBe(1));
    await requestCode(user);

    await waitFor(() => expect(sentToken).toBe('recovered-token'));
    expect(await screen.findByRole('textbox', { name: /Verification code/i })).toBeInTheDocument();
  });

  it('rejects a wrong code and then signs in with the right one', async () => {
    resetMockState({ authenticated: false });
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/login'] });

    await screen.findByRole('button', { name: /Send code on WhatsApp/i });
    await requestCode(user);

    const codeField = await screen.findByRole('textbox', { name: /Verification code/i });
    await user.type(codeField, '000000');
    await user.click(screen.getByRole('button', { name: /Verify & sign in/i }));

    expect(await screen.findByText(/not valid or has expired/i)).toBeInTheDocument();
    // The field is cleared so the next attempt is deliberate.
    expect(codeField).toHaveValue('');

    await user.type(codeField, '123456');
    await user.click(screen.getByRole('button', { name: /Verify & sign in/i }));

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
  });

  it('keeps an unauthenticated visitor out of a protected route', async () => {
    resetMockState({ authenticated: false });
    renderRoutes({ routes, initialEntries: ['/bookings'] });

    expect(
      await screen.findByRole('button', { name: /Send code on WhatsApp/i }),
    ).toBeInTheDocument();
  });

  it('surfaces a rate limit with the delay the server asked for', async () => {
    resetMockState({ authenticated: false });
    mockServer.use(
      http.post('/api/v1/auth/otp/request', () =>
        HttpResponse.json(
          { code: 'RATE_LIMITED', message: 'Too many requests.', correlationId: 'corr-x' },
          { status: 429, headers: { 'Retry-After': '90' } },
        ),
      ),
    );

    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/login'] });
    await screen.findByRole('button', { name: /Send code on WhatsApp/i });
    await requestCode(user);

    await waitFor(() => expect(screen.getByText(/Try again in 90 seconds/i)).toBeInTheDocument());
    // No code step is offered when no challenge was created.
    expect(screen.queryByRole('textbox', { name: /Verification code/i })).not.toBeInTheDocument();
  });
});
