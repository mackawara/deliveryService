import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAppSelector } from '@/app/hooks';
import { LOGIN_PATH } from '@/auth/returnPath';
import { useSignOut } from '@/auth/useSignOut';

/**
 * Shown after a deliberate sign-out from either shell (specification section 3).
 *
 * When the server did not confirm that the sessions were ended, the page says so and
 * offers another try, rather than letting the person believe a shared device is safe.
 */
export function SignedOutPage() {
  const [searchParams] = useSearchParams();
  const signedOutHere = useAppSelector((state) => state.session.locallySignedOut);
  const unconfirmedHere = useAppSelector((state) => state.session.signOutUnconfirmed);
  // What this page load knows wins; the address carries it across a refresh.
  const remoteUnconfirmed = signedOutHere
    ? unconfirmedHere
    : searchParams.get('remote') === 'unconfirmed';
  const { retry } = useSignOut();
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);

  async function tryAgain() {
    setRetrying(true);
    setRetryFailed(false);
    const confirmed = await retry();
    setRetrying(false);
    setRetryFailed(!confirmed);
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Card sx={{ maxWidth: 460 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3}>
            <Typography variant="h1" sx={{ fontSize: '1.5rem' }}>
              {remoteUnconfirmed ? 'Sign-out was not confirmed' : 'You are signed out'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Local dashboard data has been cleared from this browser.
            </Typography>
            {remoteUnconfirmed ? (
              <>
                <Alert severity="warning">
                  The server could not confirm that you were signed out, so your account may still
                  be open on this device. Try again before you leave it.
                </Alert>
                {retryFailed ? (
                  <Alert severity="error" role="alert">
                    Still not confirmed. Check your connection and try again. On a shared device,
                    ask the service team to end your sessions.
                  </Alert>
                ) : null}
                <Button variant="contained" onClick={() => void tryAgain()} disabled={retrying}>
                  {retrying ? 'Signing out…' : 'Try again'}
                </Button>
              </>
            ) : null}
            {/* The login page is served outside this app, so this is a plain link. */}
            <Button
              component="a"
              href={LOGIN_PATH}
              variant={remoteUnconfirmed ? 'outlined' : 'contained'}
            >
              Sign in again
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
