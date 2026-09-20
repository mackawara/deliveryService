import { createContext, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { baseApi } from '@/api/baseApi';
import { clearCsrfToken } from '@/api/csrf';
import { useGetCsrfQuery, useGetMeQuery, useLogoutMutation } from '@/api/endpoints/session';
import type { NormalizedApiError } from '@/api/errors';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { uiCleared } from '@/app/uiSlice';
import { loginUrlFor } from '@/auth/returnPath';
import {
  sessionCleared,
  sessionTransitionHandled,
  signOutCompleted,
  signOutStarted,
} from '@/auth/sessionSlice';
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

/** How long sign-out waits for the server to confirm before reporting it as unconfirmed. */
const REVOCATION_WAIT_MS = 2000;

/**
 * Bootstraps the CSRF context and the signed-in identity, and owns the single login
 * transition when a session expires (specification sections 5.3 and 6).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const expired = useAppSelector((state) => state.session.expired);
  const transitionHandled = useAppSelector((state) => state.session.transitionHandled);
  const signingOut = useAppSelector((state) => state.session.signingOut);
  const locallySignedOut = useAppSelector((state) => state.session.locallySignedOut);

  // The pre-login CSRF context is needed before any state-changing request, including
  // the OTP endpoints themselves.
  useGetCsrfQuery();

  const meQuery = useGetMeQuery(undefined, { skip: expired || signingOut || locallySignedOut });
  const [logout] = useLogoutMutation();

  const error = meQuery.error as NormalizedApiError | undefined;
  const status: AuthStatus = expired
    ? 'anonymous'
    : locallySignedOut
      ? location.pathname === '/signed-out'
        ? 'anonymous'
        : 'loading'
    : meQuery.data
      ? 'authenticated'
      : meQuery.isLoading || meQuery.isUninitialized
        ? 'loading'
        : 'anonymous';

  // One transition for concurrent unauthenticated failures: stop protected polling by
  // clearing the cache, then return to the login page.
  useEffect(() => {
    if (!expired || transitionHandled) return;
    const target = loginUrlFor(location.pathname, location.search, 'expired');
    dispatch(sessionTransitionHandled({ returnPath: location.pathname + location.search }));
    clearCsrfToken();
    dispatch(baseApi.util.resetApiState());
    navigate(target, { replace: true });
  }, [expired, transitionHandled, dispatch, navigate, location.pathname, location.search]);

  // Reset only after protected route consumers have unmounted. Resetting while they
  // are mounted lets their active subscriptions immediately repopulate the cache.
  useEffect(() => {
    if (!locallySignedOut || location.pathname !== '/signed-out') return;
    dispatch(baseApi.util.resetApiState());
  }, [locallySignedOut, location.pathname, dispatch]);

  const refresh = useCallback(() => {
    if (expired || locallySignedOut || meQuery.isUninitialized) {
      dispatch(sessionCleared());
      return;
    }
    void meQuery.refetch();
  }, [dispatch, expired, locallySignedOut, meQuery]);

  const signOut = useCallback(async () => {
    dispatch(signOutStarted());
    const revocation = logout()
      .unwrap()
      .then(() => 'revoked' as const)
      .catch(() => 'failed' as const);

    // Local identity state is cleared straight away.
    clearCsrfToken();
    dispatch(uiCleared());

    // Wait briefly for the server to confirm the revocation — bounded, so a hanging
    // server never traps the user on this screen. Resetting the query cache or
    // navigating first would abort the request and leave the session live.
    const outcome = await Promise.race([
      revocation,
      new Promise<'pending'>((resolve) => {
        window.setTimeout(() => resolve('pending'), REVOCATION_WAIT_MS);
      }),
    ]);

    navigate(outcome === 'revoked' ? '/signed-out' : '/signed-out?remote=unconfirmed', { replace: true });
    dispatch(signOutCompleted());
  }, [dispatch, logout, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session: meQuery.data ?? null,
      error,
      refresh,
      signOut,
      signingOut,
    }),
    [status, meQuery.data, error, refresh, signOut, signingOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
