import { setupWorker } from 'msw/browser';

import { handlers } from '@/mocks/handlers';

/**
 * Starts the in-browser mock API. Enabled only when `VITE_ENABLE_MOCK_API=true` in a
 * development build, never in production.
 */
export async function startMockWorker(): Promise<void> {
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
}
