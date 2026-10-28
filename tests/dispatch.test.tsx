import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { routes } from '@/app/router';
import { candidateResult, staffSession } from '@/mocks/fixtures';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';
import { renderRoutes } from './testUtils';

function signInAs(roles: Array<'operator' | 'admin'>) {
  resetMockState({ authenticated: true });
  mockServer.use(http.get('/api/v1/admin/me', () => HttpResponse.json({ ...staffSession, roles })));
}

function captureCommand(command: 'offers' | 'reassignments' = 'offers') {
  const requests: Array<{ key: string | null; body: Record<string, unknown> }> = [];
  mockServer.use(
    http.post(`/api/v1/admin/bookings/:id/${command}`, async ({ request }) => {
      requests.push({
        key: request.headers.get('idempotency-key'),
        body: (await request.json()) as Record<string, unknown>,
      });
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
  return requests;
}

describe('dispatch workspace', () => {
  it('labels distance as approximate and separates stale and unsuitable candidates', async () => {
    resetMockState({ authenticated: true });
    renderRoutes({ routes, initialEntries: ['/dispatch?booking=booking-ready'] });

    // Wait for a candidate row rather than the panel description.
    expect(
      (await screen.findAllByText(/km — approximate geographic distance/i))[0],
    ).toBeInTheDocument();
    expect(screen.getByText(/Missing or stale location/i)).toBeInTheDocument();
    expect(screen.getByText(/Unsuitable for this load/i)).toBeInTheDocument();
    // No driving ETA is ever offered.
    expect(screen.queryByText(/ETA/i)).not.toBeInTheDocument();
  });

  it('sends one offer with an idempotency key and reports it as awaiting acceptance', async () => {
    resetMockState({ authenticated: true });
    const seen = captureCommand();

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
    expect(seen[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen[0]?.body).not.toHaveProperty('suitabilityOverrideReason');
    expect(seen[0]?.body).not.toHaveProperty('overrideReason');
    expect(await screen.findByText(/awaiting driver acceptance/i)).toBeInTheDocument();
  });

  it('keeps package mismatches unselectable for operators without admin access', async () => {
    signInAs(['operator']);
    renderRoutes({ routes, initialEntries: ['/dispatch?booking=booking-ready'] });

    const mismatch = await screen.findByRole('region', { name: /Nyasha Dube/ });
    expect(within(mismatch).getByText('ITEM_DOES_NOT_FIT_CARGO_AREA')).toBeInTheDocument();
    expect(within(mismatch).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Select with override/ })).not.toBeInTheDocument();
  });

  it('requires an explicit admin reason and sends it trimmed with the operation key', async () => {
    signInAs(['operator', 'admin']);
    const seen = captureCommand();
    mockServer.use(
      http.get('/api/v1/admin/bookings/:id/candidates', () =>
        HttpResponse.json({
          ...candidateResult,
          unsuitable: candidateResult.unsuitable.map((candidate) => ({
            ...candidate,
            suitability: { ...candidate.suitability, inspectionRequired: true },
          })),
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/dispatch?booking=booking-ready'] });

    await user.click(await screen.findByRole('button', { name: /Select with override/ }));
    await user.click(screen.getByRole('button', { name: /^Send offer$/ }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: /^Send offer$/ });
    const reason = within(dialog).getByLabelText(/Vehicle suitability override reason/);
    expect(dialog).toHaveTextContent('ITEM_DOES_NOT_FIT_CARGO_AREA');
    expect(within(dialog).queryByLabelText(/Packing inspection reason/)).not.toBeInTheDocument();
    expect(submit).toBeDisabled();
    // A direct form submission must respect validation as well as the disabled button.
    fireEvent.submit(submit.closest('form')!);
    expect(seen).toHaveLength(0);
    await user.type(reason, '  ok  ');
    expect(submit).toBeDisabled();
    await user.clear(reason);
    await user.type(reason, '  Checked the actual package dimensions  ');
    await user.click(submit);

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen[0]?.body).toMatchObject({
      driverId: 'driver-4',
      vehicleId: 'vehicle-car-2',
      suitabilityOverrideReason: 'Checked the actual package dimensions',
    });
    expect(seen[0]?.body).not.toHaveProperty('overrideReason');
  });

  it('keeps unavailable drivers and vehicles blocked for administrators', async () => {
    signInAs(['operator', 'admin']);
    renderRoutes({ routes, initialEntries: ['/dispatch?booking=booking-ready'] });

    const blocked = await screen.findByRole('region', { name: /Tapiwa Moyo/ });
    expect(blocked).toHaveTextContent('Vehicle is in maintenance');
    expect(blocked).toHaveTextContent('Driver suspended');
    expect(within(blocked).queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not offer an override when the server omits override eligibility', async () => {
    signInAs(['operator', 'admin']);
    mockServer.use(
      http.get('/api/v1/admin/bookings/:id/candidates', () =>
        HttpResponse.json({
          ...candidateResult,
          unsuitable: candidateResult.unsuitable.map((candidate) => ({
            ...candidate,
            suitability: { ...candidate.suitability, overrideAllowed: undefined },
          })),
        }),
      ),
    );
    renderRoutes({ routes, initialEntries: ['/dispatch?booking=booking-ready'] });

    await screen.findByRole('region', { name: /Nyasha Dube/ });
    expect(screen.queryByRole('button', { name: /Select with override/ })).not.toBeInTheDocument();
  });

  it('records normal packing inspections without requiring an administrator', async () => {
    signInAs(['operator']);
    const seen = captureCommand();
    mockServer.use(
      http.get('/api/v1/admin/bookings/:id/candidates', () =>
        HttpResponse.json({
          ...candidateResult,
          ranked: candidateResult.ranked.map((candidate) => ({
            ...candidate,
            suitability: { ...candidate.suitability, inspectionRequired: true },
          })),
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/dispatch?booking=booking-ready'] });
    const candidate = await screen.findByRole('region', { name: /Blessing Ncube/ });
    await user.click(within(candidate).getByRole('button', { name: /Select driver/ }));
    await user.click(screen.getByRole('button', { name: /^Send offer$/ }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: /^Send offer$/ });
    expect(submit).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText(/Packing inspection reason/),
      '  Packing checked at pickup  ',
    );
    await user.click(submit);

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]?.body.overrideReason).toBe('Packing checked at pickup');
    expect(seen[0]?.body).not.toHaveProperty('suitabilityOverrideReason');
  });

  it('keeps reassignment, suitability and custody reasons separate', async () => {
    signInAs(['operator', 'admin']);
    const seen = captureCommand('reassignments');
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/dispatch?booking=booking-transit'] });

    await user.click(await screen.findByRole('button', { name: /Select with override/ }));
    await user.click(screen.getByRole('button', { name: /^Reassign$/ }));
    const dialog = await screen.findByRole('dialog');
    const submit = within(dialog).getByRole('button', { name: /^Send reassignment$/ });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/^Reason/), '  Original driver needs relief  ');
    await user.type(
      within(dialog).getByLabelText(/Custody handover note/),
      '  Handover at depot  ',
    );
    expect(submit).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText(/Vehicle suitability override reason/),
      '  Verified the replacement vehicle can carry the package  ',
    );
    await user.click(submit);

    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen[0]?.body).toMatchObject({
      reason: 'Original driver needs relief',
      suitabilityOverrideReason: 'Verified the replacement vehicle can carry the package',
      custodyHandoverNote: 'Handover at depot',
    });
  });

  it('clears the override reason when the candidate changes and omits it for normal offers', async () => {
    signInAs(['operator', 'admin']);
    const seen = captureCommand();
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/dispatch?booking=booking-ready'] });

    await user.click(await screen.findByRole('button', { name: /Select with override/ }));
    await user.click(screen.getByRole('button', { name: /^Send offer$/ }));
    let dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/Vehicle suitability override reason/),
      'Old reason',
    );
    await user.click(within(dialog).getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const eligible = screen.getByRole('region', { name: /Blessing Ncube/ });
    await user.click(within(eligible).getByRole('button', { name: /Select driver/ }));
    await user.click(screen.getByRole('button', { name: /Select with override/ }));
    await user.click(screen.getByRole('button', { name: /^Send offer$/ }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/Vehicle suitability override reason/)).toHaveValue('');
    await user.click(within(dialog).getByRole('button', { name: /Cancel/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(within(eligible).getByRole('button', { name: /Select driver/ }));
    await user.click(screen.getByRole('button', { name: /^Send offer$/ }));
    dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).queryByLabelText(/Vehicle suitability override reason/),
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^Send offer$/ }));
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]?.body).not.toHaveProperty('suitabilityOverrideReason');
  });

  it('selects the specific vehicle when a driver has multiple candidate rows', async () => {
    signInAs(['operator']);
    mockServer.use(
      http.get('/api/v1/admin/bookings/:id/candidates', () =>
        HttpResponse.json({
          ...candidateResult,
          ranked: [
            candidateResult.ranked[0],
            {
              ...candidateResult.ranked[0],
              vehicleId: 'vehicle-bike-2',
              registration: 'AEZ 4567',
            },
          ],
        }),
      ),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/dispatch?booking=booking-ready'] });
    const first = await screen.findByRole('region', { name: /Blessing Ncube · AEB 1234/ });
    const second = screen.getByRole('region', { name: /Blessing Ncube · AEZ 4567/ });
    await user.click(within(second).getByRole('button', { name: 'Select driver' }));

    expect(within(second).getByRole('button', { name: 'Selected' })).toBeInTheDocument();
    expect(within(first).getByRole('button', { name: 'Select driver' })).toBeInTheDocument();
  });
});
