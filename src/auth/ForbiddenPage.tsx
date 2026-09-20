import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';

import { useStaffSession } from '@/auth/useAuth';
import { describeRoles } from '@/lib/permissions';

/**
 * Insufficient access. Roles are explicit: holding admin does not grant operator or
 * finance, so the page states what the account actually holds.
 */
export function ForbiddenPage() {
  const session = useStaffSession();

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
        minHeight: '60vh',
      }}
    >
      <Card sx={{ maxWidth: 520 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={2}>
            <Typography variant="h1" sx={{ fontSize: '1.5rem' }}>
              Insufficient access
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your account does not have the role or capability this page requires.
            </Typography>
            {session ? (
              <Typography variant="body2">
                Signed in as <strong>{session.user.name}</strong> — {describeRoles(session.roles)}.
              </Typography>
            ) : null}
            <Typography variant="body2" color="text.secondary">
              An administrator can adjust roles and town access in Settings → Staff access.
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button component={RouterLink} to="/" variant="contained">
                Go to overview
              </Button>
              <Button component={RouterLink} to="/settings/access" variant="outlined">
                View my access
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
