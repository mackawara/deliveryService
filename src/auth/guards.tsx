import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { loginUrlFor } from '@/auth/returnPath';
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
