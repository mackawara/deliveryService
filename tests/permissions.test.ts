import { describe, expect, it } from 'vitest';

import {
  canAccessTown,
  hasAnyRole,
  hasCapability,
  meetsRequirement,
  selectableTowns,
  type StaffSession,
} from '@/lib/permissions';

function session(overrides: Partial<StaffSession> = {}): StaffSession {
  return {
    user: { id: 'staff-1', name: 'Test', maskedPhone: '+263••••01' },
    roles: ['operator'],
    townAccess: { allTowns: false, towns: [{ id: 'town-hwange', name: 'Hwange' }] },
    capabilities: ['bookings.read'],
    session: { expiresAt: '2026-09-20T18:00:00.000Z', idleExpiresAt: '2026-09-20T10:00:00.000Z' },
    ...overrides,
  };
}

describe('staff permissions', () => {
  it('does not treat admin as operator or finance', () => {
    const admin = session({ roles: ['admin'] });
    expect(hasAnyRole(admin, ['admin'])).toBe(true);
    expect(hasAnyRole(admin, ['operator'])).toBe(false);
    expect(meetsRequirement(admin, { anyRole: ['finance'] })).toBe(false);
  });

  it('combines role and capability requirements', () => {
    const user = session({ roles: ['finance'], capabilities: ['refunds.approve'] });
    expect(
      meetsRequirement(user, { anyRole: ['finance'], anyCapability: ['refunds.approve'] }),
    ).toBe(true);
    expect(
      meetsRequirement(user, { anyRole: ['finance'], allCapabilities: ['refunds.settle'] }),
    ).toBe(false);
    expect(hasCapability(user, 'refunds.approve')).toBe(true);
  });

  it('never grants access without a session', () => {
    expect(meetsRequirement(null, { anyRole: ['operator'] })).toBe(false);
    expect(meetsRequirement(undefined, undefined)).toBe(false);
  });

  it('treats an empty town list as no access, not every town', () => {
    const scoped = session({ townAccess: { allTowns: false, towns: [] } });
    expect(canAccessTown(scoped, 'town-hwange')).toBe(false);
    expect(selectableTowns(scoped, [{ id: 'town-hwange', name: 'Hwange' }])).toEqual([]);
  });

  it('allows every town only when the server says so explicitly', () => {
    const global = session({ townAccess: { allTowns: true, towns: [] } });
    expect(canAccessTown(global, 'town-anything')).toBe(true);
    expect(selectableTowns(global, [{ id: 'town-a', name: 'A' }])).toEqual([
      { id: 'town-a', name: 'A' },
    ]);
  });
});
