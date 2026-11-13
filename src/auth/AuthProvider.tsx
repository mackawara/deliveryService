import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { baseApi } from '@/api/baseApi';
import { clearCsrfToken } from '@/api/csrf';
import { useGetCsrfQuery, useGetMeQuery } from '@/api/endpoints/session';
import type { NormalizedApiError } from '@/api/errors';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { SIGNED_OUT_PATH, loginUrlFor } from '@/auth/returnPath';
import { sessionExpired, sessionTransitionHandled } from '@/auth/sessionSlice';
import { useSignOut } from '@/auth/useSignOut';
import { externalNavigation } from '@/lib/externalNavigation';
import type { StaffSession } from '@/lib/permissions';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  session: StaffSession | null;
  error: NormalizedApiError | undefined;
  /** Re-reads `/me`, e.g. after an admin changed roles or town access. */
  refresh: () => void;
  signOut: () => Promise<void>;
  signingOut: boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Bootstraps the staff CSRF context and identity, and owns the single move to the
 * login page when a staff session expires (specification sections 5.3 and 6).
 *
 * This app has no login page of its own: the one login is served outside it, so
 * leaving for it is a full-page navigation.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const expired = useAppSelector((state) => state.session.expired);
  const transitionHandled = useAppSelector((state) => state.session.transitionHandled);
  const signingOut = useAppSelector((state) => state.session.signingOut);
  const locallySignedOut = useAppSelector((state) => state.session.locallySignedOut);
  const { signOut: signOutEverywhere } = useSignOut();

  // Needed before any state-changing staff request.
  useGetCsrfQuery(undefined, { skip: signingOut || locallySignedOut });

  // After a deliberate sign-out the identity is not read again, so a session the
  // server could not confirm as revoked is never restored.
  const meQuery = useGetMeQuery(undefined, { skip: expired || signingOut || locallySignedOut });

  const error = meQuery.error as NormalizedApiError | undefined;
  const unauthenticated = error?.kind === 'unauthenticated';

  // Staff who were signed in and whose identity is now refused have had their session
  // expire, even when no other request has failed yet. Decided while rendering, so the
  // guard never treats them as a visitor who was never signed in.
  const [hadSession, setHadSession] = useState(false);
  if (meQuery.data && !unauthenticated && !hadSession) setHadSession(true);
  const sessionLost = hadSession && unauthenticated && !expired && !signingOut && !locallySignedOut;
  useEffect(() => {
    if (sessionLost) dispatch(sessionExpired());
  }, [sessionLost, dispatch]);

  const status: AuthStatus =
    expired || locallySignedOut
      ? 'anonymous'
      : sessionLost
        ? 'loading'
        : meQuery.data && !unauthenticated
          ? 'authenticated'
          : meQuery.isLoading || meQuery.isUninitialized
            ? 'loading'
            : 'anonymous';

  // One transition for concurrent unauthenticated failures: stop protected polling by
  // clearing the cache, then leave for the login page, remembering this page.
  useEffect(() => {
    if (!expired || transitionHandled) return;
    dispatch(sessionTransitionHandled());
    clearCsrfToken();
    dispatch(baseApi.util.resetApiState());
    externalNavigation.assign(loginUrlFor(location.pathname, location.search, 'expired'));
  }, [expired, transitionHandled, dispatch, location.pathname, location.search]);

  // Reset only after protected route consumers have unmounted. Resetting while they
  // are mounted lets their active subscriptions immediately repopulate the cache.
  useEffect(() => {
    if (!locallySignedOut || location.pathname !== SIGNED_OUT_PATH) return;
    dispatch(baseApi.util.resetApiState());
  }, [locallySignedOut, location.pathname, dispatch]);

  const refresh = useCallback(() => {
    if (expired || locallySignedOut || meQuery.isUninitialized) return;
    void meQuery.refetch();
  }, [expired, locallySignedOut, meQuery]);

  const signOut = useCallback(() => signOutEverywhere('staff'), [signOutEverywhere]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session: status === 'authenticated' ? (meQuery.data ?? null) : null,
      error,
      refresh,
      signOut,
      signingOut,
    }),
    [status, meQuery.data, error, refresh, signOut, signingOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
