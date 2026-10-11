import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { WireTown } from '@/api/dto/configuration';
import { routes } from '@/app/router';
import { townDefaults, towns } from '@/mocks/fixtures';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';
import { renderRoutes } from './testUtils';

const defaults = {
  ...townDefaults,
  policy: {
    ...townDefaults.policy,
    cancellationPolicy: 'Standard supplied by the API.',
  },
};

function mockTown(overrides: Partial<WireTown> = {}) {
  resetMockState({ authenticated: true });
  const town: WireTown = {
    ...towns[0]!,
    policy: { ...defaults.policy },
    operatingHours: defaults.operatingHours,
    ...overrides,
  };
  let saved: Record<string, unknown> | undefined;
  mockServer.use(
    http.get('/api/v1/admin/town-defaults', () => HttpResponse.json(defaults)),
    http.get('/api/v1/admin/towns', () =>
      HttpResponse.json({
        items: [{ town, launchReadiness: { ready: true, missing: [] } }],
      }),
    ),
    http.patch('/api/v1/admin/towns/:id', async ({ request }) => {
      saved = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ town });
    }),
  );
  return () => saved;
}

async function editTown() {
  const user = userEvent.setup();
  renderRoutes({ routes, initialEntries: ['/configuration/towns'] });
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit Hwange' });
  await waitFor(() =>
    expect(within(dialog).getByRole('button', { name: 'Use standard policy' })).toBeEnabled(),
  );
  return { user, dialog };
}

describe('standard town policy', () => {
  it('shows API wording and saves only the edited override', async () => {
    const saved = mockTown();
    const { user, dialog } = await editTown();
    const cancellation = within(dialog).getByRole('textbox', {
      name: 'Cancellation policy',
    });
    expect(cancellation).toHaveValue('Standard supplied by the API.');
    expect(within(dialog).getByLabelText('Saturday closes')).toHaveValue('13:00');
    fireEvent.change(cancellation, {
      target: { value: 'Town-specific cancellation.' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Save town' }));
    await waitFor(() => expect(saved()).toBeDefined());
    expect(saved()!.policy).toEqual({
      cancellationPolicy: 'Town-specific cancellation.',
    });
    expect(saved()!.operatingHours).toEqual([]);
    expect(saved()!.expectedVersion).toBe(towns[0]!.version);
  });

  it('resets all custom policy and hours using the API inheritance contract', async () => {
    const saved = mockTown({
      policy: {
        ...defaults.policy,
        taxTreatment: 'Custom tax.',
        supportHours: 'Custom hours.',
      },
      operatingHours: [{ day: 1, opensAt: '09:00', closesAt: '16:00' }],
    });
    const { user, dialog } = await editTown();
    await user.click(within(dialog).getByRole('button', { name: 'Use standard policy' }));
    await user.click(within(dialog).getByRole('button', { name: 'Use standard hours' }));
    expect(within(dialog).getByRole('textbox', { name: 'Tax treatment' })).toHaveValue('');
    expect(within(dialog).getByLabelText('Monday closes')).toHaveValue('18:00');
    await user.click(within(dialog).getByRole('button', { name: 'Save town' }));
    await waitFor(() => expect(saved()).toBeDefined());
    expect(saved()!.policy).toEqual({});
    expect(saved()!.operatingHours).toEqual([]);
  });

  it('preserves other custom fields and treats a blank field as reset', async () => {
    const saved = mockTown({
      policy: {
        ...defaults.policy,
        cancellationPolicy: 'Old override.',
        supportHours: 'Town support.',
      },
    });
    const { user, dialog } = await editTown();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Cancellation policy' }), {
      target: { value: ' ' },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Save town' }));
    await waitFor(() => expect(saved()).toBeDefined());
    expect(saved()!.policy).toEqual({ supportHours: 'Town support.' });
  });

  it('blocks saving when defaults fail to load and permits retry without losing edits', async () => {
    const saved = mockTown();
    let failing = true;
    mockServer.use(
      http.get('/api/v1/admin/town-defaults', () =>
        failing
          ? HttpResponse.json({ message: 'Standards unavailable.' }, { status: 503 })
          : HttpResponse.json(defaults),
      ),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/towns'] });
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Hwange' });
    await within(dialog).findByText('Standards unavailable.');
    expect(within(dialog).getByRole('button', { name: 'Save town' })).toBeDisabled();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Cancellation policy' }), {
      target: { value: 'Keep my edit.' },
    });
    failing = false;
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Save town' })).toBeEnabled(),
    );
    expect(within(dialog).getByRole('textbox', { name: 'Cancellation policy' })).toHaveValue(
      'Keep my edit.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save town' }));
    await waitFor(() => expect(saved()!.policy).toEqual({ cancellationPolicy: 'Keep my edit.' }));
  });
});
