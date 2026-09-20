import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

/** Shown after a deliberate sign-out (specification section 3). */
export function SignedOutPage() {
  const [searchParams] = useSearchParams();
  const remoteUnconfirmed = searchParams.get('remote') === 'unconfirmed';

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
              You are signed out
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Local dashboard data has been cleared from this browser.
            </Typography>
            {remoteUnconfirmed ? (
              <Alert severity="warning">
                The server could not confirm that this session was revoked. If you are on a shared
                device, ask an administrator to revoke your sessions.
              </Alert>
            ) : null}
            <Button component={RouterLink} to="/login" variant="contained">
              Sign in again
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
