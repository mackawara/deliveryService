import { useEffect, useMemo } from 'react';

import { useListTownsQuery } from '@/api/endpoints/configuration';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { townSelected } from '@/app/uiSlice';
import { useStaffSession } from '@/auth/useAuth';
import { canAccessTown, hasAnyRole, selectableTowns, type TownRef } from '@/lib/permissions';
import { useQueryParam } from '@/lib/useUrlState';

export const ALL_TOWNS = 'all';

export interface TownScope {
  /** null means "every town in my scope"; the server still applies the real scope. */
  townId: string | null;
  setTownId: (townId: string | null) => void;
  towns: TownRef[];
  /** True when the signed-in user may work across every town. */
  allTowns: boolean;
  isLoading: boolean;
}

/**
 * Selected town (specification sections 3 and 6).
 *
 * The town lives in the URL so a link reloads into the same scope, and it is part of
 * every town-scoped query argument and cache tag. Reading the town directory needs the
 * operator or admin role, so finance-only users fall back to the towns their session
 * carries.
 */
export function useTownScope(): TownScope {
  const dispatch = useAppDispatch();
  const session = useStaffSession();
  const lastTownId = useAppSelector((state) => state.ui.lastTownId);
  const [param, setParam] = useQueryParam('town');

  const mayReadTownDirectory = hasAnyRole(session, ['operator', 'admin']);
  const townsQuery = useListTownsQuery(undefined, { skip: !session || !mayReadTownDirectory });

  const towns = useMemo(() => {
    const directory: TownRef[] = (townsQuery.data ?? []).map((row) => ({
      id: row.town.id,
      name: row.town.name,
    }));
    return selectableTowns(session, directory);
  }, [townsQuery.data, session]);

  const allTowns = session?.townAccess.allTowns === true;

  // Resolve the effective town: the URL wins, then the last choice, then the only town
  // the account can reach.
  const resolved = useMemo(() => {
    if (param === ALL_TOWNS) return null;
    if (param && canAccessTown(session, param)) return param;
    if (param && allTowns) return param;
    if (lastTownId && (allTowns || canAccessTown(session, lastTownId))) return lastTownId;
    if (!allTowns && towns.length === 1) return towns[0]!.id;
    return null;
  }, [param, session, allTowns, lastTownId, towns]);

  useEffect(() => {
    if (resolved !== lastTownId) dispatch(townSelected(resolved));
  }, [resolved, lastTownId, dispatch]);

  return {
    townId: resolved,
    setTownId: (townId) => setParam(townId ?? ALL_TOWNS),
    towns,
    allTowns,
    isLoading: townsQuery.isLoading,
  };
}
