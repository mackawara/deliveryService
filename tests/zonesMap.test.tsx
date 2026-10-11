import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from '@/app/router';
import { appConfig } from '@/config';
import { loadGoogleMaps } from '@/lib/googleMaps';
import { towns, zones } from '@/mocks/fixtures';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';
import { fakeMaps, FakeMap, FakePolygon, resetMaps } from './fakeGoogleMaps';
import { renderRoutes } from './testUtils';

vi.mock('@/lib/googleMaps', () => ({ loadGoogleMaps: vi.fn() }));
const originalKey = appConfig.googleMapsApiKey;
let saved: Record<string, unknown> | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  appConfig.googleMapsApiKey = 'test-browser-key';
  resetMaps();
  saved = undefined;
  resetMockState({ authenticated: true });
  vi.stubGlobal('google', { maps: fakeMaps });
  vi.mocked(loadGoogleMaps).mockResolvedValue(fakeMaps);
  mockServer.use(
    http.get('/api/v1/admin/zones', () => HttpResponse.json({ items: [] })),
    http.post('/api/v1/admin/zones', async ({ request }) => {
      saved = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ zone: { ...zones[0]!, ...saved } }, { status: 201 });
    }),
    http.patch('/api/v1/admin/zones/:id', async ({ request }) => {
      saved = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ zone: { ...zones[0]!, ...saved } });
    }),
  );
});
afterEach(() => {
  appConfig.googleMapsApiKey = originalKey;
  vi.unstubAllGlobals();
});

async function openCreate() {
  const user = userEvent.setup();
  renderRoutes({ routes, initialEntries: ['/configuration/zones?town=town-hwange'] });
  await user.click(await screen.findByRole('button', { name: 'Add zone' }));
  const dialog = await screen.findByRole('dialog', { name: 'Add a zone' });
  await waitFor(() =>
    expect(within(dialog).getByRole('button', { name: 'Draw boundary' })).toBeEnabled(),
  );
  return { user, dialog };
}
function drawTriangle() {
  act(() => FakeMap.instances.at(-1)!.click(26.45, -18.4));
  act(() => FakeMap.instances.at(-1)!.click(26.46, -18.4));
  act(() => FakeMap.instances.at(-1)!.click(26.46, -18.39));
}

describe('Google Maps zone editor', () => {
  it('loads no map for the listing, draws a zone and saves closed GeoJSON with a suggested code', async () => {
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/zones?town=town-hwange'] });
    const add = await screen.findByRole('button', { name: 'Add zone' });
    expect(loadGoogleMaps).not.toHaveBeenCalled();
    await user.click(add);
    const dialog = await screen.findByRole('dialog', { name: 'Add a zone' });
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Draw boundary' })).toBeEnabled(),
    );
    await user.type(within(dialog).getByRole('textbox', { name: 'Zone name' }), 'Empumalanga');
    await user.click(within(dialog).getByRole('button', { name: 'Draw boundary' }));
    drawTriangle();
    expect(within(dialog).getByRole('button', { name: 'Create zone' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Finish boundary' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create zone' }));
    await waitFor(() => expect(saved).toBeDefined());
    expect(saved).toMatchObject({
      townId: towns[0]!._id,
      code: 'EMPUMALANGA',
      label: 'Empumalanga',
      priority: 100,
      polygon: {
        type: 'Polygon',
        coordinates: [
          [
            [26.45, -18.4],
            [26.46, -18.4],
            [26.46, -18.39],
            [26.45, -18.4],
          ],
        ],
      },
    });
  });

  it('edits an existing corner while preserving the code and expected version', async () => {
    mockServer.use(
      http.get('/api/v1/admin/zones', () => HttpResponse.json({ items: [zones[0]!] })),
    );
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/zones?town=town-hwange'] });
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: `Edit ${zones[0]!.code}` });
    await waitFor(() =>
      expect(FakePolygon.instances.some((polygon) => polygon.options.editable)).toBe(true),
    );
    const editable = FakePolygon.instances.find((polygon) => polygon.options.editable)!;
    const old = zones[0]!.polygon;
    const corner = old.type === 'Polygon' ? old.coordinates[0]![0]! : old.coordinates[0]![0]![0]!;
    act(() => editable.moveCorner(0, corner[0] + 0.001, corner[1] + 0.001));
    expect(editable.map).not.toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Save zone' }));
    await waitFor(() => expect(saved).toBeDefined());
    expect(saved!.expectedVersion).toBe(zones[0]!.version);
    expect(saved).not.toHaveProperty('code');
    expect(saved!.polygon).not.toEqual(old);
  });

  it('blocks an outside-town boundary in the advanced fallback', async () => {
    const { user, dialog } = await openCreate();
    await user.type(within(dialog).getByRole('textbox', { name: 'Zone name' }), 'Outside');
    await user.click(within(dialog).getByRole('button', { name: 'Advanced settings' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Boundary GeoJSON' }), {
      target: { value: '{"type":"Polygon","coordinates":[[[30,0],[31,0],[31,1],[30,0]]]}' },
    });
    expect(await within(dialog).findByText(/Part of this zone is outside/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create zone' })).toBeDisabled();
  });

  it('supports manual entry when a key is missing without loading Google', async () => {
    appConfig.googleMapsApiKey = '';
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/zones?town=town-hwange'] });
    await user.click(await screen.findByRole('button', { name: 'Add zone' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a zone' });
    expect(await within(dialog).findByText(/map has not been enabled/)).toBeInTheDocument();
    expect(loadGoogleMaps).not.toHaveBeenCalled();
    await user.type(within(dialog).getByRole('textbox', { name: 'Zone name' }), 'Fallback');
    await user.click(within(dialog).getByRole('button', { name: 'Advanced settings' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Boundary GeoJSON' }), {
      target: {
        value:
          '{"type":"Polygon","coordinates":[[[26.45,-18.40],[26.46,-18.40],[26.46,-18.39],[26.45,-18.40]]]}',
      },
    });
    await user.click(within(dialog).getByRole('button', { name: 'Create zone' }));
    await waitFor(() => expect(saved?.code).toBe('FALLBACK'));
  });
  it('requires distinct priorities and explicit confirmation for an intentional overlap', async () => {
    mockServer.use(
      http.get('/api/v1/admin/zones', () =>
        HttpResponse.json({ items: [{ ...zones[0]!, priority: 100 }] }),
      ),
    );
    const { user, dialog } = await openCreate();
    await user.type(within(dialog).getByRole('textbox', { name: 'Zone name' }), 'Inner');
    await user.click(within(dialog).getByRole('button', { name: 'Draw boundary' }));
    act(() => FakeMap.instances.at(-1)!.click(26.495, -18.365));
    act(() => FakeMap.instances.at(-1)!.click(26.505, -18.365));
    act(() => FakeMap.instances.at(-1)!.click(26.505, -18.355));
    await user.click(within(dialog).getByRole('button', { name: 'Finish boundary' }));
    expect(await within(dialog).findByText(/same priority/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Create zone' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Advanced settings' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Priority' }), {
      target: { value: '90' },
    });
    expect(within(dialog).getByRole('button', { name: 'Create zone' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /This overlap is intentional/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Create zone' }));
    await waitFor(() => expect(saved?.priority).toBe(90));
  });

  it('offers retry when Google fails to load', async () => {
    vi.mocked(loadGoogleMaps).mockRejectedValueOnce(new Error('Network unavailable'));
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/configuration/zones?town=town-hwange'] });
    await user.click(await screen.findByRole('button', { name: 'Add zone' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a zone' });
    expect(await within(dialog).findByText(/Google Maps could not load/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Draw boundary' })).toBeEnabled(),
    );
    expect(loadGoogleMaps).toHaveBeenCalledTimes(2);
  });
});
