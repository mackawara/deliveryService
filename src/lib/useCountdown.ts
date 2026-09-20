import { useEffect, useMemo, useState } from 'react';

import { secondsUntil } from '@/lib/datetime';

/**
 * Seconds remaining until an ISO deadline, refreshed once a second.
 *
 * Used for server-returned offer expiry and OTP resend/expiry windows: the deadline
 * always comes from the server, never from a client-side clock guess. The wall clock is
 * the external system this hook subscribes to.
 */
export function useCountdown(deadline: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  return useMemo(() => secondsUntil(deadline, now), [deadline, now]);
}

/** True once the deadline has passed (or when there is no deadline). */
export function useElapsed(deadline: string | null | undefined): boolean {
  const remaining = useCountdown(deadline);
  return remaining === null || remaining <= 0;
}
