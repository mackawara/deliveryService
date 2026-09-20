import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { routes } from '@/app/router';
import { createAppStore } from '@/app/store';
import { useGuardedAction } from '@/lib/useGuardedAction';
import { bookings, cashEntries, staffSession } from '@/mocks/fixtures';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';
import { renderRoutes } from './testUtils';

describe('PR review regressions', () => {
  it('defaults remittance to cash retained after giving change', async () => {
    resetMockState({ authenticated: true });
    mockServer.use(
      http.get('/api/v1/admin/cash-ledger', () =>
        HttpResponse.json({
          items: [
            {
              ...cashEntries[0],
              amountDueCents: 300,
              amountReceivedCents: 500,
              changeGivenCents: 200,
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/finance/cash?town=town-hwange&driver=driver-1'] });

    await user.click(await screen.findByRole('checkbox', { name: 'Select ledger entry cash-1' }));
    await user.click(screen.getByRole('button', { name: 'Record remittance' }));

    expect(await screen.findByRole('textbox', { name: /Amount handed in/ })).toHaveValue('3.00');
  });

  it('uses finance-visible ledger references instead of the operator driver directory', async () => {
    resetMockState({ authenticated: true });
    let driverDirectoryRequested = false;
    mockServer.use(
      http.get('/api/v1/admin/me', () =>
        HttpResponse.json({
          ...staffSession,
          roles: ['finance'],
          capabilities: [],
          townAccess: { allTowns: false, towns: [{ id: 'town-hwange', name: 'Hwange' }] },
        }),
      ),
      http.get('/api/v1/admin/drivers', () => {
        driverDirectoryRequested = true;
        return HttpResponse.json(
          { code: 'FORBIDDEN', message: 'Operator role required.' },
          { status: 403 },
        );
      }),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/finance/cash?town=town-hwange'] });

    await screen.findByRole('checkbox', { name: 'Select ledger entry cash-1' });
    await user.click(screen.getByRole('combobox', { name: 'Driver' }));

    expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
    expect(driverDirectoryRequested).toBe(false);
  });

  it('retries an uncertain command with its submit-time payload and key', async () => {
    const store = createAppStore();
    const attempts: Array<{ amountCents: number; key: string }> = [];
    const { result, rerender } = renderHook(
      ({ amountCents }) =>
        useGuardedAction({
          allowUnconfirmedRetry: true,
          run: async (_args: void, key: string) => {
            attempts.push({ amountCents, key });
            if (attempts.length === 1) {
              throw { kind: 'timeout', message: 'Outcome not confirmed' };
            }
            return {};
          },
        }),
      {
        initialProps: { amountCents: 300 },
        wrapper: ({ children }: { children: ReactNode }) => (
          <Provider store={store}>{children}</Provider>
        ),
      },
    );

    await act(async () => {
      await result.current.submit();
    });
    rerender({ amountCents: 500 });
    await act(async () => {
      await result.current.retryUnconfirmed();
    });

    expect(attempts[1]?.key).toBe(attempts[0]?.key);
    expect(attempts[1]?.amountCents).toBe(300);
  });

  it('does not replay a route without verified idempotent semantics', async () => {
    const store = createAppStore();
    let attempts = 0;
    const { result } = renderHook(
      () =>
        useGuardedAction({
          run: async () => {
            attempts += 1;
            throw { kind: 'timeout', message: 'Outcome not confirmed' };
          },
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <Provider store={store}>{children}</Provider>
        ),
      },
    );

    await act(async () => {
      await result.current.submit();
      await result.current.retryUnconfirmed();
    });

    expect(attempts).toBe(1);
    expect(result.current.unconfirmed).toBe('review');
  });

  it('hides prior-town bookings while the selected town loads', async () => {
    resetMockState({ authenticated: true });
    let newTownRequested = false;
    let release: (() => void) | undefined;
    mockServer.use(
      http.get('/api/v1/admin/bookings', async ({ request }) => {
        if (new URL(request.url).searchParams.get('townId') === 'town-victoria-falls') {
          newTownRequested = true;
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return HttpResponse.json({ items: [], limit: 25, skip: 0 });
        }
        return HttpResponse.json({ items: bookings, limit: 25, skip: 0 });
      }),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/bookings?town=town-hwange'] });

    await screen.findByText('HWG-000123');
    await user.click(screen.getByRole('combobox', { name: 'Town' }));
    await user.click(await screen.findByRole('option', { name: 'Victoria Falls' }));
    await waitFor(() => expect(newTownRequested).toBe(true));

    try {
      expect(screen.getByRole('combobox', { name: 'Town' })).toHaveTextContent('Victoria Falls');
      expect(screen.queryByText('HWG-000123')).not.toBeInTheDocument();
    } finally {
      release?.();
    }
  });

  it('labels cash results as capped and does not offer unsupported next-page controls', async () => {
    resetMockState({ authenticated: true });
    renderRoutes({ routes, initialEntries: ['/finance/cash?town=town-hwange'] });

    expect(await screen.findByText(/up to the 100 most recent matching entries/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
  });
});
