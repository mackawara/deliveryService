import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';

import { useGetAccessQuery } from '@/api/endpoints/session';
import { useAppSelector } from '@/app/hooks';
import {
  ADMIN_HOME,
  LOGIN_PATH,
  SHOP_HOME,
  SIGNED_OUT_PATH,
  isSafeReturnPath,
  loginUrlFor,
  type AppArea,
} from '@/auth/returnPath';
import { useOwnerAuth } from '@/auth/useOwnerAuth';
import { useAuth } from '@/auth/useAuth';
import { UNCONFIRMED_SIGN_OUT } from '@/auth/useSignOut';
import { externalNavigation } from '@/lib/externalNavigation';
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
 * Leaves this app for the one login page. It is served outside the app, so this is a
 * full-page navigation rather than a route change.
 */
export function RedirectToLogin({ to }: { to: string }) {
  useEffect(() => {
    externalNavigation.replace(to);
  }, [to]);
  return <FullPageProgress label="Taking you to sign in…" />;
}

/** Old sign-in addresses inside this app now lead to the one login. */
export function LegacyLoginRedirect({ intent }: { intent?: 'shop' }) {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams();
  if (intent) params.set('intent', intent);
  const returnTo = searchParams.get('returnTo');
  if (isSafeReturnPath(returnTo)) params.set('returnTo', returnTo);
  const query = params.toString();
  return <RedirectToLogin to={query ? `${LOGIN_PATH}?${query}` : LOGIN_PATH} />;
}

/**
 * Decides where someone without a session for this part of the app goes.
 *
 * Staff and shop owners are separate sessions. Someone signed in as the other role is
 * sent to their own home rather than to a login page that is not for them; only someone
 * signed in as neither leaves for the login, which brings them back to this page.
 */
function WithoutSession({ area }: { area: AppArea }) {
  const location = useLocation();
  const access = useGetAccessQuery();

  if (access.isLoading || access.isUninitialized) {
    return <FullPageProgress label="Checking your account…" />;
  }
  const other = area === 'ADMIN' ? 'SHOP' : 'ADMIN';
  if (access.data?.destinations.includes(other)) {
    return <Navigate to={other === 'SHOP' ? SHOP_HOME : ADMIN_HOME} replace />;
  }
  return <RedirectToLogin to={loginUrlFor(location.pathname, location.search)} />;
}

/**
 * After a deliberate sign-out nothing protected renders again in this page load:
 * browser Back from the signed-out page comes straight back to it.
 */
function useSignedOutRedirect(): ReactNode | null {
  const locallySignedOut = useAppSelector((state) => state.session.locallySignedOut);
  const unconfirmed = useAppSelector((state) => state.session.signOutUnconfirmed);
  if (!locallySignedOut) return null;
  return <Navigate to={unconfirmed ? UNCONFIRMED_SIGN_OUT : SIGNED_OUT_PATH} replace />;
}

/**
 * Route guard for any authenticated staff route. A direct URL must still pass its
 * guard: hiding a navigation item is not authorization (specification section 3).
 */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const expired = useAppSelector((state) => state.session.expired);
  const signedOut = useSignedOutRedirect();

  if (signedOut) return signedOut;
  // The provider is already leaving for the login page.
  if (expired) return <FullPageProgress label="Your session ended. Taking you to sign in…" />;
  if (status === 'loading') return <FullPageProgress label="Checking your session…" />;
  if (status === 'anonymous') return <WithoutSession area="ADMIN" />;
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

  // Nested inside `RequireAuth`, which owns every signed-out case.
  if (status !== 'authenticated') return <FullPageProgress label="Checking your access…" />;
  if (!meetsRequirement(session, requirement)) {
    return <Navigate to="/forbidden" replace state={{ from: location.pathname }} />;
  }
  return <>{children ?? <Outlet />}</>;
}

/** Owner authentication is intentionally separate from staff roles and API keys. */
export function RequireShopAuth({ children }: { children?: ReactNode }) {
  const { status } = useOwnerAuth();
  const ownerExpired = useAppSelector((state) => state.session.ownerExpired);
  const signedOut = useSignedOutRedirect();

  if (signedOut) return signedOut;
  if (ownerExpired) return <FullPageProgress label="Your session ended. Taking you to sign in…" />;
  if (status === 'loading') return <FullPageProgress label="Checking your shop account…" />;
  if (status === 'anonymous') return <WithoutSession area="SHOP" />;
  return <>{children ?? <Outlet />}</>;
}
