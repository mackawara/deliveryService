import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { clearCsrfToken, clearShopCsrfToken } from '@/api/csrf';
import type { SessionRole } from '@/api/dto/session';
import { sessionApi, useLogoutMutation } from '@/api/endpoints/session';
import { shopApi } from '@/api/endpoints/shop';
import { useAppDispatch } from '@/app/hooks';
import { uiCleared } from '@/app/uiSlice';
import { SIGNED_OUT_PATH } from '@/auth/returnPath';
import { signOutCompleted, signOutStarted } from '@/auth/sessionSlice';

/** How long sign-out waits for the server to confirm before reporting it as unconfirmed. */
export const REVOCATION_WAIT_MS = 2000;

/** The signed-out page shows this when the server did not confirm the revocation. */
export const UNCONFIRMED_SIGN_OUT = `${SIGNED_OUT_PATH}?remote=unconfirmed`;

type Outcome = 'revoked' | 'failed' | 'pending';

/**
 * The one sign-out for both shells (issues 32 and 33).
 *
 * It ends every session the browser holds — staff and shop owner — and always lands on
 * the signed-out page. A sign-out the server did not confirm is reported there rather
 * than hidden: the person is told, and offered another try, instead of being returned
 * to their data by the next identity poll.
 */
export function useSignOut(): {
  /** Signs out from the shell the person is in. */
  signOut: (role: SessionRole) => Promise<void>;
  /** Asks the server again after an unconfirmed sign-out. Resolves true once confirmed. */
  retry: () => Promise<boolean>;
} {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [logout] = useLogoutMutation();

  const revoke = useCallback(
    (role: SessionRole): Promise<'revoked' | 'failed'> =>
      logout(role)
        .unwrap()
        .then(() => 'revoked' as const)
        .catch(() => 'failed' as const),
    [logout],
  );

  const signOut = useCallback(
    async (role: SessionRole) => {
      // Stops `/admin/me`, `/shop/me` and the branch list polling before anything else.
      dispatch(signOutStarted());
      const revocation = revoke(role);

      // Local identity state is cleared straight away; the request above has already
      // read the token it needs.
      clearCsrfToken();
      clearShopCsrfToken();
      dispatch(uiCleared());

      // Wait briefly for the server to confirm — bounded, so a hanging server never
      // traps the person on this screen. Resetting the query cache or navigating first
      // would abort the request and leave the session live.
      const outcome: Outcome = await Promise.race([
        revocation,
        new Promise<'pending'>((resolve) => {
          window.setTimeout(() => resolve('pending'), REVOCATION_WAIT_MS);
        }),
      ]);

      const confirmed = outcome === 'revoked';
      // The outcome is kept in state as well as in the address: the guards also send
      // a signed-out visitor to this page, and must not lose the warning on the way.
      dispatch(signOutCompleted({ confirmed }));
      navigate(confirmed ? SIGNED_OUT_PATH : UNCONFIRMED_SIGN_OUT, { replace: true });
    },
    [dispatch, navigate, revoke],
  );

  const retry = useCallback(async () => {
    // Local tokens were cleared by the first attempt. Whichever sessions are still
    // live hand theirs back, and the server accepts the token of any session it holds.
    for (const role of ['staff', 'owner'] as const) {
      const endpoint =
        role === 'owner' ? shopApi.endpoints.getShopCsrf : sessionApi.endpoints.getCsrf;
      const request = dispatch(endpoint.initiate(undefined, { forceRefetch: true }));
      await request.unwrap().catch(() => undefined);
      request.unsubscribe();
      if ((await revoke(role)) === 'revoked') {
        clearCsrfToken();
        clearShopCsrfToken();
        dispatch(signOutCompleted({ confirmed: true }));
        navigate(SIGNED_OUT_PATH, { replace: true });
        return true;
      }
    }
    return false;
  }, [dispatch, navigate, revoke]);

  return { signOut, retry };
}
