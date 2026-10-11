import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import type { WireParcelPreset } from '@/api/dto/configuration';
import { configurationApi } from '@/api/endpoints/configuration';
import { routes } from '@/app/router';
import { createAppStore } from '@/app/store';
import { parcelPresets, towns } from '@/mocks/fixtures';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';
import seededData from './fixtures/seededParcelPresets.json';
import { renderRoutes } from './testUtils';

// Snapshot of the backend's agreed STARTER_PARCEL_PRESET_CATALOG, stored as seeded documents.
const catalog = seededData as WireParcelPreset[];

describe('seeded parcel presets', () => {
  it('renders all nine in menu order with suggestions, unknown sizes and quote requirements', async () => {
    resetMockState({ authenticated: true });
    let requestedTown: string | null = null;
    mockServer.use(
      http.get('/api/v1/admin/parcel-presets', ({ request }) => {
        requestedTown = new URL(request.url).searchParams.get('townId');
        return HttpResponse.json({ items: [...catalog].reverse() });
      }),
    );
    renderRoutes({ routes, initialEntries: ['/configuration/parcels?town=town-hwange'] });

    const table = await screen.findByRole('table', { name: 'Parcel presets' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(9);
    catalog.forEach((preset, index) => {
      expect(within(rows[index]!).getByText(preset.label)).toBeInTheDocument();
      expect(within(rows[index]!).getByText('Suggested')).toBeInTheDocument();
    });
    expect(requestedTown).toBe('town-hwange');
    expect(within(rows[0]!).getByText('0.25 kg')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('32 × 23 × 1 cm')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Required: FRAGILE')).toBeInTheDocument();
    expect(within(rows[3]!).getByText('Required', { exact: true })).toBeInTheDocument();
    expect(within(rows[7]!).getAllByText('Not specified')).toHaveLength(2);
    expect(within(rows[7]!).getByText('Whole shipment')).toBeInTheDocument();
    expect(within(rows[7]!).getByText('Required', { exact: true })).toBeInTheDocument();
    expect(table).not.toHaveTextContent('undefined');
  });

  it('opens and saves a freight preset with no suggested size without inventing measurements', async () => {
    resetMockState({ authenticated: true });
    const freight = catalog.find((preset) => preset.code === 'BUILDING_MATERIALS')!;
    let body: Record<string, unknown> | undefined;
    mockServer.use(
      http.get('/api/v1/admin/parcel-presets', () => HttpResponse.json({ items: [freight] })),
      http.patch('/api/v1/admin/parcel-presets/:id', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ preset: { ...freight, label: body.label } });
      }),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/parcels?town=town-hwange'] });
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Building materials' });
    expect(within(dialog).getByLabelText('Suggested weight')).toHaveValue('');
    expect(within(dialog).getByLabelText('Suggested length')).toHaveValue('');
    expect(within(dialog).getByLabelText('Suggested width')).toHaveValue('');
    expect(within(dialog).getByLabelText('Suggested height')).toHaveValue('');
    expect(within(dialog).getByLabelText('Suggested weight')).toBeDisabled();
    expect(
      within(dialog).getByText(/starting suggestions customers can change/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Save preset' }));

    await waitFor(() => expect(body).toBeDefined());
    expect(body).toEqual({
      label: freight.label,
      examples: freight.examples,
      supportedHandling: freight.supportedHandling,
      status: 'ACTIVE',
      expectedVersion: freight.version,
    });
  });

  it('continues to render and edit legacy fixed limits', async () => {
    resetMockState({ authenticated: true });
    const legacy = parcelPresets[0]!;
    mockServer.use(
      http.get('/api/v1/admin/parcel-presets', () => HttpResponse.json({ items: [legacy] })),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/parcels?town=town-hwange'] });
    expect(await screen.findByText('Upper bounds')).toBeInTheDocument();
    expect(screen.getByText('5 kg')).toBeInTheDocument();
    expect(screen.getByText('40 × 30 × 20 cm')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Small box' });
    expect(within(dialog).getByLabelText('Max weight')).toHaveValue('5');
    expect(within(dialog).getByLabelText('Max length')).toHaveValue('40');
  });
});

describe('parcel preset readiness cache', () => {
  it.each(['create', 'retire'] as const)('refreshes town readiness after %s', async (action) => {
    resetMockState({ authenticated: true });
    let hasActivePreset = action === 'retire';
    const preset = parcelPresets[0]!;
    mockServer.use(
      http.get('/api/v1/admin/towns', () =>
        HttpResponse.json({
          items: [
            {
              town: towns[0],
              launchReadiness: {
                ready: hasActivePreset,
                missing: hasActivePreset ? [] : ['parcelPresets'],
              },
            },
          ],
        }),
      ),
      http.post('/api/v1/admin/parcel-presets', () => {
        hasActivePreset = true;
        return HttpResponse.json({ preset }, { status: 201 });
      }),
      http.patch('/api/v1/admin/parcel-presets/:id', () => {
        hasActivePreset = false;
        return HttpResponse.json({ preset: { ...preset, status: 'RETIRED' } });
      }),
    );
    const store = createAppStore();
    const subscription = store.dispatch(configurationApi.endpoints.listTowns.initiate());
    try {
      await subscription.unwrap();
      expect(
        configurationApi.endpoints.listTowns.select()(store.getState()).data?.[0]?.launchReadiness
          .ready,
      ).toBe(action === 'retire');
      if (action === 'create') {
        await store
          .dispatch(
            configurationApi.endpoints.createParcelPreset.initiate({
              townId: preset.townId,
              code: preset.code,
              label: preset.label,
              examples: preset.examples,
              parcelClass: preset.parcelClass,
              maxWeightKg: preset.maxWeightKg!,
              maxDimensionsCm: preset.maxDimensionsCm!,
            }),
          )
          .unwrap();
      } else {
        await store
          .dispatch(
            configurationApi.endpoints.updateParcelPreset.initiate({
              id: preset._id,
              status: 'RETIRED',
              expectedVersion: preset.version,
            }),
          )
          .unwrap();
      }
      await waitFor(() => {
        const readiness = configurationApi.endpoints.listTowns.select()(store.getState()).data?.[0]
          ?.launchReadiness;
        expect(readiness).toEqual({
          ready: action === 'create',
          missing: action === 'create' ? [] : ['parcelPresets'],
        });
      });
    } finally {
      subscription.unsubscribe();
      store.dispatch(configurationApi.util.resetApiState());
    }
  });
});
