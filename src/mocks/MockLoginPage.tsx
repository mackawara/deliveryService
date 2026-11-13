import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { NormalizedApiError } from '@/api/errors';
import { ADMIN_HOME, SHOP_HOME, areaOf, isSafeReturnPath, type AppArea } from '@/auth/returnPath';
import { externalNavigation } from '@/lib/externalNavigation';
import { newIdempotencyKey } from '@/lib/idempotency';
import {
  useMockRequestCodeMutation,
  useMockVerifyCodeMutation,
  type MockAccess,
} from '@/mocks/mockLoginApi';

type Access = MockAccess;

const LABELS: Record<AppArea, string> = { ADMIN: 'Admin dashboard', SHOP: 'My shop' };

/**
 * Development-only stand-in for the one login page (`/login`).
 *
 * In a deployment that address is served by the API, outside this app. With the mock
 * API there is no backend to serve it, so this page plays its part: a number, a code,
 * and the same routing by role, so local development and browser tests can sign in. It
 * is registered only in a development build with `VITE_ENABLE_MOCK_API=true`.
 */
export function MockLoginPage() {
  const [searchParams] = useSearchParams();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [choices, setChoices] = useState<Access | null>(null);
  const [error, setError] = useState('');
  const [requestCode, requestState] = useMockRequestCodeMutation();
  const [verifyCode, verifyState] = useMockVerifyCodeMutation();
  const busy = requestState.isLoading || verifyState.isLoading;

  /** Mirrors the real page: the return path counts only for the role allowed to see it. */
  function landing(area: AppArea, access: Access): string {
    const returnTo = searchParams.get('returnTo');
    if (isSafeReturnPath(returnTo) && areaOf(returnTo) === area) return returnTo;
    return access.homes[area] ?? (area === 'ADMIN' ? ADMIN_HOME : SHOP_HOME);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      if (!challengeId) {
        const challenge = await requestCode({ phone, requestKey: newIdempotencyKey() }).unwrap();
        setChallengeId(challenge.challengeId);
        return;
      }
      const access = await verifyCode({ challengeId, code }).unwrap();
      if (access.destinations.length > 1) setChoices(access);
      else externalNavigation.assign(landing(access.destinations[0] ?? 'ADMIN', access));
    } catch (failure) {
      setError((failure as NormalizedApiError).message ?? 'Sign-in failed.');
    }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Card sx={{ width: '100%', maxWidth: 460 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={3}>
            <Box>
              <Typography variant="h1" sx={{ fontSize: '1.5rem' }}>
                Mock sign-in
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Development only. The real login page is served by the API.
              </Typography>
            </Box>
            <Alert severity="info">
              The code is always 123456. A number ending in 2 signs in as a shop owner, ending in 3
              as both staff and a shop owner, and any other number as staff.
            </Alert>
            {searchParams.get('reason') === 'expired' ? (
              <Alert severity="warning">Your session ended. Sign in again to continue.</Alert>
            ) : null}
            {error ? (
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            ) : null}
            {choices ? (
              <Stack spacing={2}>
                <Typography variant="body2">Where would you like to go?</Typography>
                {choices.destinations.map((area, index) => (
                  <Button
                    key={area}
                    variant={index === 0 ? 'contained' : 'outlined'}
                    onClick={() => externalNavigation.assign(landing(area, choices))}
                  >
                    {LABELS[area]}
                  </Button>
                ))}
              </Stack>
            ) : (
              <form onSubmit={(event) => void submit(event)} noValidate>
                <Stack spacing={2}>
                  {challengeId ? (
                    <TextField
                      fullWidth
                      required
                      autoFocus
                      label="Login code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  ) : (
                    <TextField
                      fullWidth
                      required
                      label="WhatsApp number"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      inputMode="tel"
                      autoComplete="tel"
                    />
                  )}
                  <Button type="submit" variant="contained" disabled={busy}>
                    {challengeId ? 'Log in' : 'Send code'}
                  </Button>
                </Stack>
              </form>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
