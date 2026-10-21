import { createContext, useCallback, useEffect, useMemo, type ReactNode } from 'react';
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
  const me = useGetShopMeQuery(undefined, { skip: logoutState.isLoading });

  const status: OwnerAuthStatus =
    me.isLoading || me.isUninitialized ? 'loading' : me.data ? 'authenticated' : 'anonymous';

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
      dispatch(baseApi.util.invalidateTags(['Shop', 'ShopItem', 'ShopClaim', 'ShopTerms']));
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
