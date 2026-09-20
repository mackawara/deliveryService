import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';

import { useAuth } from '@/auth/useAuth';
import { formatCountdown } from '@/lib/datetime';
import { useCountdown } from '@/lib/useCountdown';

/** Warn this many seconds before the session's idle window closes. */
const WARNING_WINDOW_SECONDS = 5 * 60;

/**
 * Warns before the server-declared idle or absolute expiry so a user is not surprised
 * mid-task. Expiry itself is enforced by the server (specification section 5.3).
 */
export function SessionExpiryNotice() {
  const { session } = useAuth();
  const idleRemaining = useCountdown(session?.session.idleExpiresAt);
  const absoluteRemaining = useCountdown(session?.session.expiresAt);

  if (!session) return null;

  const remaining =
    idleRemaining !== null && absoluteRemaining !== null
      ? Math.min(idleRemaining, absoluteRemaining)
      : (idleRemaining ?? absoluteRemaining);

  if (remaining === null || remaining > WARNING_WINDOW_SECONDS) return null;

  const absoluteFirst =
    absoluteRemaining !== null && absoluteRemaining <= (idleRemaining ?? Infinity);

  return (
    <Box sx={{ mb: 2 }}>
      <Alert severity="warning">
        {absoluteFirst
          ? `This session reaches its maximum length in ${formatCountdown(remaining)}. Sign in again with a WhatsApp code to continue.`
          : `You will be signed out for inactivity in ${formatCountdown(remaining)}. Continue working to stay signed in.`}
      </Alert>
    </Box>
  );
}
