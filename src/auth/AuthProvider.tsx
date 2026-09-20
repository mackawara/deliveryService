import { createContext, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { baseApi } from '@/api/baseApi';
import { clearCsrfToken } from '@/api/csrf';
import { useGetCsrfQuery, useGetMeQuery, useLogoutMutation } from '@/api/endpoints/session';
import type { NormalizedApiError } from '@/api/errors';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { uiCleared } from '@/app/uiSlice';
import { loginUrlFor } from '@/auth/returnPath';
import { sessionCleared, sessionTransitionHandled, signOutStarted } from '@/auth/sessionSlice';
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
 * Bootstraps the CSRF context and the signed-in identity, and owns the single login
 * transition when a session expires (specification sections 5.3 and 6).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const expired = useAppSelector((state) => state.session.expired);
  const transitionHandled = useAppSelector((state) => state.session.transitionHandled);

  // The pre-login CSRF context is needed before any state-changing request, including
  // the OTP endpoints themselves.
  useGetCsrfQuery();

  const meQuery = useGetMeQuery();
  const [logout, logoutState] = useLogoutMutation();

  const error = meQuery.error as NormalizedApiError | undefined;
  const status: AuthStatus = meQuery.data
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

  const refresh = useCallback(() => {
    void meQuery.refetch();
  }, [meQuery]);

  const signOut = useCallback(async () => {
    dispatch(signOutStarted());
    const revocation = logout().unwrap();

    // Local data is cleared immediately, whether or not the server answers.
    clearCsrfToken();
    dispatch(baseApi.util.resetApiState());
    dispatch(uiCleared());
    dispatch(sessionCleared());
    navigate('/signed-out', { replace: true });
    // Screens that were still mounted when the cache was cleared re-subscribe for one
    // tick, so the protected cache is dropped again once they have unmounted.
    window.setTimeout(() => dispatch(baseApi.util.resetApiState()), 0);

    try {
      await revocation;
    } catch {
      // The session may still be live server-side; say so rather than implying it is gone.
      navigate('/signed-out?remote=unconfirmed', { replace: true });
    }
  }, [dispatch, logout, navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session: meQuery.data ?? null,
      error,
      refresh,
      signOut,
      signingOut: logoutState.isLoading,
    }),
    [status, meQuery.data, error, refresh, signOut, logoutState.isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
