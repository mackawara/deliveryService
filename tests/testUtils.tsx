import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import { createAppStore, type AppStore } from '@/app/store';
import { ThemeController } from '@/theme/ThemeController';

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  store?: AppStore;
}

/** Renders a component with the store and theme, but without the router. */
export function renderWithProviders(
  ui: ReactElement,
  { store = createAppStore(), ...options }: RenderWithProvidersOptions = {},
): RenderResult & { store: AppStore } {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <ThemeController>{children}</ThemeController>
      </Provider>
    );
  }

  return { store, ...render(ui, { wrapper: Wrapper, ...options }) };
}

export interface RenderRouteOptions {
  /** Route definitions, as passed to a data router. */
  routes: Parameters<typeof createMemoryRouter>[0];
  initialEntries?: string[];
  store?: AppStore;
}

/** Renders a data router so guards, blockers and URL state behave as in the app. */
export function renderRoutes({
  routes,
  initialEntries = ['/'],
  store = createAppStore(),
}: RenderRouteOptions): RenderResult & { store: AppStore } {
  const router = createMemoryRouter(routes, { initialEntries });
  return {
    store,
    ...render(
      <Provider store={store}>
        <ThemeController>
          <RouterProvider router={router} />
        </ThemeController>
      </Provider>,
    ),
  };
}
