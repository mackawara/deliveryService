import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { routes } from '@/app/router';
import { externalNavigation } from '@/lib/externalNavigation';
import { resetMockState } from '@/mocks/handlers';
import { renderRoutes } from './testUtils';

describe('landing page', () => {
  it('is open to a signed-out visitor and links to the shop and the one login', async () => {
    resetMockState();
    renderRoutes({ routes, initialEntries: ['/welcome'] });

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      /From the shop counter/i,
    );
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: 'Shop' })).toHaveAttribute('href', '/shop');
    expect(within(header).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Register a shop' })).toHaveAttribute(
      'href',
      '/login?intent=shop',
    );
    expect(screen.getByRole('link', { name: 'Open the dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    // Reading the page never sends the visitor to the login.
    expect(externalNavigation.replace).not.toHaveBeenCalled();
    expect(externalNavigation.assign).not.toHaveBeenCalled();
  });

  it('explains the four steps of an order with a picture of the route', async () => {
    resetMockState();
    renderRoutes({ routes, initialEntries: ['/welcome'] });

    expect(await screen.findByRole('heading', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByRole('img', { name: /route from a shop/i })).toBeInTheDocument();
  });
});
