import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { loginUrlFor } from '@/auth/returnPath';
import { useOwnerAuth } from '@/auth/useOwnerAuth';
import { useAuth } from '@/auth/useAuth';
import { meetsRequirement, type AccessRequirement } from '@/lib/permissions';

function FullPageProgress({ label }: { label: string }) {
  return (
    <Box
      sx={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
      role="status"
      aria-live="polite"
    >
      <CircularProgress aria-hidden />
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

/**
 * Route guard for any authenticated staff route. A direct URL must still pass its
 * guard: hiding a navigation item is not authorization (specification section 3).
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageProgress label="Checking your session…" />;
  if (status === 'anonymous') {
    return <Navigate to={loginUrlFor(location.pathname, location.search)} replace />;
  }
  return <>{children ?? <Outlet />}</>;
}

/** Route guard for a specific role or capability requirement. */
export function RequireAccess({
  requirement,
  children,
}: {
  requirement: AccessRequirement;
  children?: ReactNode;
}) {
  const { status, session } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageProgress label="Checking your access…" />;
  if (status === 'anonymous') {
    return <Navigate to={loginUrlFor(location.pathname, location.search)} replace />;
  }
  if (!meetsRequirement(session, requirement)) {
    return <Navigate to="/forbidden" replace state={{ from: location.pathname }} />;
  }
  return <>{children ?? <Outlet />}</>;
}

/** Keeps signed-in staff away from the login screen. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function ShopProgress({ label }: { label: string }) {
  return <FullPageProgress label={label} />;
}

/** Owner authentication is intentionally separate from staff roles and API keys. */
export function RequireShopAuth({ children }: { children?: ReactNode }) {
  const { status } = useOwnerAuth();
  const location = useLocation();
  if (status === 'loading') return <ShopProgress label="Checking your shop account…" />;
  if (status === 'anonymous') {
    return (
      <Navigate
        to={`/shop/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }
  return <>{children ?? <Outlet />}</>;
}

export function RedirectIfShopAuthenticated({ children }: { children: ReactNode }) {
  const { status, session } = useOwnerAuth();
  if (status !== 'authenticated') return <>{children}</>;
  const firstShop = session?.memberships.find(
    (membership) => membership.status === 'ACTIVE',
  )?.shopId;
  return <Navigate to={firstShop ? `/shop/${firstShop}/catalogue` : '/shop/setup'} replace />;
}
