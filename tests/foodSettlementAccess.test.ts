import { afterEach, describe, expect, it } from 'vitest';

import { FINANCE_ONLY } from '@/app/navigation';
import { appConfig } from '@/config';
import { canUseFoodSettlements, foodFinanceScopeKey } from '@/lib/foodSettlementAccess';
import { meetsRequirement, type StaffSession } from '@/lib/permissions';
import { staffSession } from '@/mocks/fixtures';

const original = appConfig.enableFoodSettlements;
afterEach(() => {
  appConfig.enableFoodSettlements = original;
});
function session(roles: StaffSession['roles'], capabilities = ['food.settlements.read']) {
  return { ...staffSession, roles, capabilities };
}

describe('food settlement access', () => {
  it('requires the release gate and an explicit capability for either authorized role', () => {
    appConfig.enableFoodSettlements = false;
    expect(canUseFoodSettlements(session(['admin']))).toBe(false);
    appConfig.enableFoodSettlements = true;
    expect(canUseFoodSettlements(session(['admin']))).toBe(true);
    expect(canUseFoodSettlements(session(['finance']))).toBe(true);
    expect(canUseFoodSettlements(session(['operator']))).toBe(false);
    expect(canUseFoodSettlements(session(['admin'], []))).toBe(false);
    expect(meetsRequirement(session(['admin']), FINANCE_ONLY)).toBe(false);
  });

  it('requires town access, including when an empty town list is returned', () => {
    appConfig.enableFoodSettlements = true;
    const user = {
      ...session(['finance']),
      townAccess: { allTowns: false, towns: [{ id: 'town-a', name: 'A' }] },
    };
    expect(canUseFoodSettlements(user, 'food.settlements.read', 'town-a')).toBe(true);
    expect(canUseFoodSettlements(user, 'food.settlements.read', 'town-b')).toBe(false);
    expect(canUseFoodSettlements({ ...user, townAccess: { allTowns: false, towns: [] } })).toBe(
      false,
    );
  });

  it('partitions protected caches when actor, capabilities or town access changes', () => {
    const user = session(['admin']);
    const key = foodFinanceScopeKey(user);
    expect(foodFinanceScopeKey({ ...user, capabilities: [] })).not.toBe(key);
    expect(foodFinanceScopeKey({ ...user, user: { ...user.user, id: 'other' } })).not.toBe(key);
    expect(foodFinanceScopeKey({ ...user, townAccess: { allTowns: false, towns: [] } })).not.toBe(
      key,
    );
  });
});
