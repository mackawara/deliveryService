import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

import { baseApi } from '@/api/baseApi';
import { clearShopCsrfToken } from '@/api/csrf';
import { useGetShopCsrfQuery, useGetShopMeQuery } from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import type { WireShopMe } from '@/api/dto/shop';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { loginUrlFor } from '@/auth/returnPath';
import { ownerSessionExpired } from '@/auth/sessionSlice';
import { useSignOut } from '@/auth/useSignOut';
import { externalNavigation } from '@/lib/externalNavigation';

export type OwnerAuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface OwnerAuthContextValue {
  status: OwnerAuthStatus;
  session: WireShopMe | null;
  error: NormalizedApiError | undefined;
  refresh: () => void;
  signOut: () => Promise<void>;
  signingOut: boolean;
}

export const OwnerAuthContext = createContext<OwnerAuthContextValue | null>(null);

/**
 * The shop owner's identity, kept separate from staff roles.
 *
 * `/shop/me` is polled so a revoked branch or a changed role shows up promptly. The
 * poll stops the moment a sign-out starts and does not resume afterwards: a sign-out
 * the server could not confirm must not bring the owner back into their catalogue.
 */
export function OwnerAuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const signingOut = useAppSelector((state) => state.session.signingOut);
  const locallySignedOut = useAppSelector((state) => state.session.locallySignedOut);
  const ownerExpired = useAppSelector((state) => state.session.ownerExpired);
  const { signOut: signOutEverywhere } = useSignOut();
  const stopped = signingOut || locallySignedOut || ownerExpired;

  useGetShopCsrfQuery(undefined, { skip: stopped });
  const me = useGetShopMeQuery(undefined, {
    skip: stopped,
    pollingInterval: 5000,
    skipPollingIfUnfocused: true,
  });
  const unauthenticated =
    Boolean(me.error) && (me.error as NormalizedApiError).kind === 'unauthenticated';

  // An owner who was signed in and no longer is has had their session expire. That is
  // decided while rendering, so the guard never mistakes it for a visitor who was never
  // signed in and races it to the login page without saying why.
  const [hadSession, setHadSession] = useState(false);
  if (me.data && !unauthenticated && !hadSession) setHadSession(true);
  const sessionLost = hadSession && unauthenticated && !stopped;

  const previousAccess = useRef<string | null>(null);
  const access = me.data
    ? JSON.stringify([
        me.data.owner.id,
        [...me.data.capabilities].sort(),
        me.data.memberships.map((m) => [m.shopId, m.status, m.role, m.version]).sort(),
      ])
    : null;
  useEffect(() => {
    if (stopped || sessionLost) return;
    // A changed role or a revoked branch: drop everything read under the old access.
    if (access && previousAccess.current && access !== previousAccess.current)
      dispatch(baseApi.util.resetApiState());
    if (access) previousAccess.current = access;
  }, [access, dispatch, stopped, sessionLost]);

  // Leave for the one login, never the staff transition, remembering this page.
  useEffect(() => {
    if (!sessionLost) return;
    dispatch(ownerSessionExpired());
    clearShopCsrfToken();
    dispatch(baseApi.util.resetApiState());
    externalNavigation.assign(loginUrlFor(location.pathname, location.search, 'expired'));
  }, [sessionLost, dispatch, location.pathname, location.search]);

  // While a sign-out is in flight the last identity stays in place, so the shell does
  // not flash a redirect; once it completes (or the session expired) there is none.
  const status: OwnerAuthStatus =
    locallySignedOut || ownerExpired
      ? 'anonymous'
      : sessionLost
        ? 'loading'
        : me.data && !unauthenticated
          ? 'authenticated'
          : me.isLoading || me.isUninitialized
            ? 'loading'
            : 'anonymous';

  const refresh = useCallback(() => {
    if (!stopped) void me.refetch();
  }, [me, stopped]);

  const signOut = useCallback(() => signOutEverywhere('owner'), [signOutEverywhere]);

  const value = useMemo<OwnerAuthContextValue>(
    () => ({
      status,
      session: status === 'authenticated' ? (me.data ?? null) : null,
      error: me.error as NormalizedApiError | undefined,
      refresh,
      signOut,
      signingOut,
    }),
    [me.data, me.error, refresh, signOut, signingOut, status],
  );

  return <OwnerAuthContext.Provider value={value}>{children}</OwnerAuthContext.Provider>;
}
