import { setupServer } from 'msw/node';

import { handlers } from '@/mocks/handlers';

/** Mock API used by component and integration tests. */
export const mockServer = setupServer(...handlers);
