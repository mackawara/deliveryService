import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { routes } from '@/app/router';
import { resetMockState } from '@/mocks/handlers';
import { renderRoutes } from './testUtils';

describe('booking queue', () => {
  it('shows delivery and payment state as separate chips and marks a draft quote', async () => {
    resetMockState({ authenticated: true });
    renderRoutes({ routes, initialEntries: ['/bookings'] });

    const row = (await screen.findByText('HWG-000123')).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row!);
    expect(cells.getByText('Ready for dispatch')).toBeInTheDocument();
    expect(cells.getByText('Cash on delivery')).toBeInTheDocument();
    expect(cells.getByText('Cash due at delivery')).toBeInTheDocument();
    expect(cells.getByText('Accepted')).toBeInTheDocument();
    expect(cells.getByText('$3.00')).toBeInTheDocument();
  });

  it('never claims a total the backend does not provide', async () => {
    resetMockState({ authenticated: true });
    renderRoutes({ routes, initialEntries: ['/bookings'] });

    expect(await screen.findByText(/This list has no server total/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Waybill and date search are not accepted list filters yet/i),
    ).toBeInTheDocument();
  });

  it('says plainly that the active-work view narrows only the loaded page', async () => {
    resetMockState({ authenticated: true });
    renderRoutes({ routes, initialEntries: ['/bookings'] });

    expect(
      await screen.findByText(/hidden. This narrows the loaded page only/i),
    ).toBeInTheDocument();
    // A delivered booking is hidden by the default view.
    expect(screen.queryByText('HWG-000120')).not.toBeInTheDocument();
  });

  it('shows completed work when the active-work view is switched off', async () => {
    resetMockState({ authenticated: true });
    const user = userEvent.setup();
    renderRoutes({ routes, initialEntries: ['/bookings'] });

    await screen.findByText('HWG-000123');
    await user.click(screen.getByRole('switch', { name: /Active work only/i }));

    expect(await screen.findByText('HWG-000120')).toBeInTheDocument();
  });

  it('labels capped detail histories as recent rather than exhaustive', async () => {
    resetMockState({ authenticated: true });
    renderRoutes({ routes, initialEntries: ['/bookings/booking-transit'] });

    expect(await screen.findByRole('heading', { name: 'HWG-000124' })).toBeInTheDocument();
    expect(screen.getAllByText(/is not an exhaustive audit/i).length).toBeGreaterThan(0);
    // The accepted assignment reads as accepted, not as a pending offer.
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByText('Awaiting driver acceptance')).not.toBeInTheDocument();
  });
});
