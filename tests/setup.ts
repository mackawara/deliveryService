import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';

import { clearCsrfToken } from '@/api/csrf';
import { resetMockState } from '@/mocks/handlers';
import { mockServer } from '@/mocks/server';

// MUI reads matchMedia for responsive layout decisions; jsdom does not implement it.
// Every `min-width` query matches, so components render their desktop layout — the
// expanded sidebar and the multi-column dispatch workspace.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// Integration tests mount the whole application, so allow a little longer than the
// one-second default for a loaded CI machine.
configure({ asyncUtilTimeout: 10_000 });

beforeAll(() => {
  mockServer.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  // Vitest runs without globals, so Testing Library's automatic cleanup is registered here.
  cleanup();
  mockServer.resetHandlers();
  resetMockState();
  clearCsrfToken();
  window.localStorage.clear();
});

afterAll(() => {
  mockServer.close();
});
