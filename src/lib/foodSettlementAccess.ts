import { appConfig } from '@/config';
import { canAccessTown, meetsRequirement, type StaffSession } from '@/lib/permissions';

export const FOOD_SETTLEMENTS_READ = {
  anyRole: ['admin', 'finance'] as Array<'admin' | 'finance'>,
  allCapabilities: ['food.settlements.read'],
};

/** Food permissions never imply access to the unrelated finance routes. */
export function canUseFoodSettlements(
  session: StaffSession | null | undefined,
  capability = 'food.settlements.read',
  townId?: string,
): boolean {
  return (
    appConfig.enableFoodSettlements &&
    meetsRequirement(session, { anyRole: ['admin', 'finance'], allCapabilities: [capability] }) &&
    Boolean(session?.townAccess.allTowns || session?.townAccess.towns.length) &&
    (townId === undefined || canAccessTown(session, townId))
  );
}

/** Permission changes partition caches and unmount pending financial forms. */
export function foodFinanceScopeKey(session: StaffSession | null | undefined): string {
  if (!session) return 'signed-out';
  return JSON.stringify([
    session.user.id,
    session.session.expiresAt,
    [...session.roles].sort(),
    [...session.capabilities].sort(),
    session.townAccess.allTowns,
    session.townAccess.towns.map((town) => town.id).sort(),
  ]);
}
