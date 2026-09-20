import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { routes } from '@/app/router';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';
import { renderRoutes } from './testUtils';

describe('dispatch workspace', () => {
  it('labels distance as approximate and separates stale and unsuitable candidates', async () => {
    resetMockState({ authenticated: true });
    renderRoutes({ routes, initialEntries: ['/dispatch?booking=booking-ready'] });

    // Wait for a candidate row rather than the panel description.
    expect(await screen.findByText(/km — approximate geographic distance/i)).toBeInTheDocument();
    expect(screen.getByText(/Missing or stale location/i)).toBeInTheDocument();
    expect(screen.getByText(/Unsuitable for this load/i)).toBeInTheDocument();
    // No driving ETA is ever offered.
    expect(screen.queryByText(/ETA/i)).not.toBeInTheDocument();
  });

  it('sends one offer with an idempotency key and reports it as awaiting acceptance', async () => {
    resetMockState({ authenticated: true });
    const seen: Array<string | null> = [];
    mockServer.use(
      http.post('/api/v1/admin/bookings/:id/offers', ({ request }) => {
        seen.push(request.headers.get('idempotency-key'));
        return HttpResponse.json(
          {
            assignmentId: 'assignment-new',
            state: 'OFFERED',
            offerExpiresAt: new Date(Date.now() + 300_000).toISOString(),
            version: 1,
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/dispatch?booking=booking-ready'] });

    // The first Select control belongs to the eligible group.
    const selectButtons = await screen.findAllByRole('button', { name: /Select driver/i });
    await user.click(selectButtons[0]!);
    await user.click(screen.getByRole('button', { name: /^Send offer$/i }));

    // The confirmation dialog repeats booking, driver and vehicle before sending.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Blessing Ncube');
    expect(dialog).toHaveTextContent('AEB 1234');

    await user.click(within(dialog).getByRole('button', { name: /Send offer/i }));

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText(/awaiting driver acceptance/i)).toBeInTheDocument();
  });
});
