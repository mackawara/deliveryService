import { createContext, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { baseApi } from '@/api/baseApi';
import { clearShopCsrfToken } from '@/api/csrf';
import {
  useGetShopCsrfQuery,
  useGetShopMeQuery,
  useShopLogoutMutation,
} from '@/api/endpoints/shop';
import type { NormalizedApiError } from '@/api/errors';
import type { WireShopMe } from '@/api/dto/shop';
import { useAppDispatch } from '@/app/hooks';

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

export function OwnerAuthProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [logout, logoutState] = useShopLogoutMutation();
  useGetShopCsrfQuery();
  const me = useGetShopMeQuery(undefined, {
    skip: logoutState.isLoading,
    pollingInterval: 5000,
    skipPollingIfUnfocused: true,
  });
  const previousAccess = useRef<string | null>(null);
  const access = me.data
    ? JSON.stringify([
        me.data.owner.id,
        me.data.memberships.map((m) => [m.shopId, m.status, m.role, m.version]).sort(),
      ])
    : null;
  useEffect(() => {
    if (access && previousAccess.current && access !== previousAccess.current)
      dispatch(baseApi.util.resetApiState());
    if (access) previousAccess.current = access;
    if (
      me.error &&
      (me.error as NormalizedApiError).kind === 'unauthenticated' &&
      previousAccess.current
    ) {
      previousAccess.current = null;
      dispatch(baseApi.util.resetApiState());
    }
  }, [access, dispatch, me.error]);

  const status: OwnerAuthStatus =
    me.isLoading || me.isUninitialized
      ? 'loading'
      : me.error && (me.error as NormalizedApiError).kind === 'unauthenticated'
        ? 'anonymous'
        : me.data
          ? 'authenticated'
          : 'anonymous';

  useEffect(() => {
    if (
      status === 'anonymous' &&
      location.pathname.startsWith('/shop/') &&
      !location.pathname.includes('/login') &&
      !location.pathname.includes('/signup')
    ) {
      const returnTo = `${location.pathname}${location.search}`;
      navigate(`/shop/login?returnTo=${encodeURIComponent(returnTo)}`, { replace: true });
    }
  }, [location.pathname, location.search, navigate, status]);

  const refresh = useCallback(() => {
    void me.refetch();
  }, [me]);

  const signOut = useCallback(async () => {
    try {
      await logout().unwrap();
    } finally {
      clearShopCsrfToken();
      dispatch(baseApi.util.resetApiState());
      navigate('/shop/login', { replace: true });
    }
  }, [dispatch, logout, navigate]);

  const value = useMemo<OwnerAuthContextValue>(
    () => ({
      status,
      session: me.data ?? null,
      error: me.error as NormalizedApiError | undefined,
      refresh,
      signOut,
      signingOut: logoutState.isLoading,
    }),
    [logoutState.isLoading, me.data, me.error, refresh, signOut, status],
  );

  return <OwnerAuthContext.Provider value={value}>{children}</OwnerAuthContext.Provider>;
}
