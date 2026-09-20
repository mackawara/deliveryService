import { screen } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';

import { routes } from '@/app/router';
import { resetMockState } from '@/mocks/handlers';
import { staffSession } from '@/mocks/fixtures';
import { mockServer } from '@/mocks/server';
import { renderRoutes } from './testUtils';

function signInAs(roles: Array<'operator' | 'finance' | 'admin'>, capabilities: string[] = []) {
  resetMockState({ authenticated: true });
  mockServer.use(
    http.get('/api/v1/admin/me', () =>
      HttpResponse.json({
        ...staffSession,
        roles,
        capabilities,
        townAccess: { allTowns: false, towns: [{ id: 'town-hwange', name: 'Hwange' }] },
      }),
    ),
  );
}

describe('role-scoped navigation and route guards', () => {
  it('shows a finance-only account its own section and nothing else', async () => {
    signInAs(['finance']);
    renderRoutes({ routes, initialEntries: ['/'] });

    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    // The Finance navigation group is present; Operations is not rendered at all.
    expect(screen.getAllByText('Finance').length).toBeGreaterThan(0);
    expect(screen.queryByText('Operations')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Payments' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bookings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dispatch' })).not.toBeInTheDocument();
  });

  it('refuses a direct URL that the hidden navigation item would have led to', async () => {
    signInAs(['finance']);
    renderRoutes({ routes, initialEntries: ['/bookings'] });

    expect(
      await screen.findByRole('heading', { name: /Insufficient access/i }),
    ).toBeInTheDocument();
  });

  it('does not treat an admin role as operator or finance access', async () => {
    signInAs(['admin']);
    renderRoutes({ routes, initialEntries: ['/finance/payments'] });

    expect(
      await screen.findByRole('heading', { name: /Insufficient access/i }),
    ).toBeInTheDocument();
  });

  it('lets an admin reach the administration routes', async () => {
    signInAs(['admin']);
    renderRoutes({ routes, initialEntries: ['/restrictions'] });

    expect(await screen.findByRole('heading', { name: 'Restrictions' })).toBeInTheDocument();
  });

  it('hides staff provisioning from an admin without the staff-management capability', async () => {
    signInAs(['admin']);
    renderRoutes({ routes, initialEntries: ['/settings/access'] });

    expect(await screen.findByRole('heading', { name: 'Access & staff' })).toBeInTheDocument();
    expect(
      screen.getByText(/Staff provisioning is restricted to administrators/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add staff member/i })).not.toBeInTheDocument();
  });

  it('offers staff provisioning once the capability is granted', async () => {
    signInAs(['admin'], ['staff.manage']);
    renderRoutes({ routes, initialEntries: ['/settings/access'] });

    expect(await screen.findByRole('button', { name: /Add staff member/i })).toBeInTheDocument();
  });
});
