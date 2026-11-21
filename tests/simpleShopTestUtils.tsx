import type { ReactNode } from 'react';
import { HttpResponse, http } from 'msw';

import { OwnerAuthContext, type OwnerAuthContextValue } from '@/auth/OwnerAuthProvider';
import { appConfig } from '@/config';
import { mockServer } from '@/mocks/server';

export function ownerSession(ownerId = 'owner-a', shopIds: string[] = []): OwnerAuthContextValue {
  return {
    status: 'authenticated',
    session: {
      owner: { id: ownerId, phone: '+263772000002', version: 1 },
      memberships: shopIds.map((shopId) => ({
        _id: `m-${shopId}`,
        ownerId,
        shopId,
        townId: 'town-hwange',
        role: 'OWNER',
        status: 'ACTIVE',
        version: 1,
      })),
      capabilities: ['shop:create', 'shop:claim', 'catalogue:manage'],
      session: { expiresAt: '2099-01-01T00:00:00Z', idleExpiresAt: '2099-01-01T00:00:00Z' },
    },
    error: undefined,
    refresh: () => {},
    signOut: async () => {},
    signingOut: false,
  } as OwnerAuthContextValue;
}

/** Wraps a screen in a signed-in owner session. */
export function asOwner(children: ReactNode, ownerId?: string) {
  return (
    <OwnerAuthContext.Provider value={ownerSession(ownerId)}>{children}</OwnerAuthContext.Provider>
  );
}

/** Turns the issue 34 flag on for one test file. */
export function withSimpleSetupFlag(hooks: {
  beforeEach: (fn: () => void) => void;
  afterEach: (fn: () => void) => void;
}) {
  let previous = false;
  hooks.beforeEach(() => {
    previous = appConfig.enableSimpleShopSetup;
    appConfig.enableSimpleShopSetup = true;
  });
  hooks.afterEach(() => {
    appConfig.enableSimpleShopSetup = previous;
  });
}

export const HWANGE = {
  _id: 'town-hwange',
  name: 'Hwange',
  serviceArea: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [26.4, -18.5],
        [26.6, -18.5],
        [26.6, -18.3],
        [26.4, -18.5],
      ],
    ],
  },
};

export function serveTowns() {
  mockServer.use(http.get('/api/v1/shop/towns', () => HttpResponse.json({ items: [HWANGE] })));
}
