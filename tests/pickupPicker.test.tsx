import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PickupPicker } from '@/features/shop/PickupPicker';
import { loadGoogleMaps } from '@/lib/googleMaps';
import { renderWithProviders } from './testUtils';

vi.mock('@/lib/googleMaps', () => ({ loadGoogleMaps: vi.fn() }));

type MapEvent = { latLng: { lat: () => number; lng: () => number } };
function mapsFixture() {
  const listeners: { handler: (event: MapEvent) => void; remove: ReturnType<typeof vi.fn> }[] = [];
  const mapCreated = vi.fn();
  const pinDetached = vi.fn();
  function listen(handler: (event: MapEvent) => void) {
    const remove = vi.fn();
    listeners.push({ handler, remove });
    return { remove };
  }
  const api = {
    Map: class {
      constructor() {
        mapCreated();
      }
      addListener(_name: string, handler: (event: MapEvent) => void) {
        return listen(handler);
      }
      panTo() {}
    },
    Marker: class {
      addListener(_name: string, handler: (event: MapEvent) => void) {
        return listen(handler);
      }
      setPosition() {}
      setMap(value: unknown) {
        pinDetached(value);
      }
    },
  } as unknown as typeof google.maps;
  return { api, listeners, mapCreated, pinDetached };
}
const pickup = { lat: '-18.42', lng: '26.45', address: 'Main Street' };
const point = (lat: number, lng: number): MapEvent => ({
  latLng: { lat: () => lat, lng: () => lng },
});

describe('pickup map lifecycle', () => {
  it('uses the latest pickup/callback without resubscribing and removes listeners on unmount', async () => {
    const maps = mapsFixture();
    vi.mocked(loadGoogleMaps).mockResolvedValue(maps.api);
    const changed = vi.fn();
    const view = renderWithProviders(<PickupPicker value={pickup} onChange={changed} />);
    await waitFor(() => expect(maps.listeners).toHaveLength(2));
    act(() => maps.listeners[0].handler(point(-18.43, 26.46)));
    expect(changed).toHaveBeenCalledWith({ lat: '-18.43', lng: '26.46', address: 'Main Street' });
    const latest = vi.fn();
    view.rerender(
      <PickupPicker value={{ ...pickup, address: 'New entrance' }} onChange={latest} />,
    );
    act(() => maps.listeners[1].handler(point(-18.44, 26.47)));
    expect(latest).toHaveBeenCalledWith({ lat: '-18.44', lng: '26.47', address: 'New entrance' });
    expect(maps.mapCreated).toHaveBeenCalledTimes(1);
    expect(maps.listeners).toHaveLength(2);
    view.unmount();
    for (const listener of maps.listeners) expect(listener.remove).toHaveBeenCalledTimes(1);
    expect(maps.pinDetached).toHaveBeenCalledWith(null);
  });

  it('cleans up on retry and restores the previous authentication callback', async () => {
    const maps = mapsFixture();
    vi.mocked(loadGoogleMaps).mockResolvedValue(maps.api);
    const authWindow = window as Window & { gm_authFailure?: () => void };
    const original = authWindow.gm_authFailure;
    const previous = vi.fn();
    authWindow.gm_authFailure = previous;
    try {
      const user = userEvent.setup();
      const view = renderWithProviders(<PickupPicker value={pickup} onChange={vi.fn()} />);
      await waitFor(() => expect(maps.listeners).toHaveLength(2));
      act(() => authWindow.gm_authFailure?.());
      expect(previous).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'Retry map' }));
      await waitFor(() => expect(maps.listeners).toHaveLength(4));
      expect(maps.listeners[0].remove).toHaveBeenCalledTimes(1);
      expect(maps.listeners[1].remove).toHaveBeenCalledTimes(1);
      expect(maps.listeners[2].remove).not.toHaveBeenCalled();
      expect(maps.listeners[3].remove).not.toHaveBeenCalled();
      view.unmount();
      for (const listener of maps.listeners) expect(listener.remove).toHaveBeenCalledTimes(1);
      expect(authWindow.gm_authFailure).toBe(previous);
    } finally {
      authWindow.gm_authFailure = original;
    }
  });

  it('does not allocate a map when library loading finishes after unmount', async () => {
    const maps = mapsFixture();
    let complete!: (api: typeof google.maps) => void;
    vi.mocked(loadGoogleMaps).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const view = renderWithProviders(<PickupPicker value={pickup} onChange={vi.fn()} />);
    view.unmount();
    await act(async () => complete(maps.api));
    expect(maps.mapCreated).not.toHaveBeenCalled();
    expect(maps.listeners).toHaveLength(0);
  });
});
