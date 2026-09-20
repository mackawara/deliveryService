import { useEffect, useRef } from 'react';

import { useRecordActivityMutation } from '@/api/endpoints/session';

/** Never send more than one activity signal per this interval. */
const THROTTLE_MS = 5 * 60_000;

const INTERACTION_EVENTS = ['pointerdown', 'keydown'] as const;

/**
 * Throttled foreground activity signal (specification section 5.3).
 *
 * Background query polling must not extend session inactivity, so the signal is sent
 * only in response to real user interaction, only while the page is visible, and at
 * most once per throttle window. The server still bounds it by absolute expiry.
 */
export function useActivitySignal(enabled: boolean): void {
  const [recordActivity] = useRecordActivityMutation();
  const lastSentAt = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    function onInteraction() {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastSentAt.current < THROTTLE_MS) return;
      lastSentAt.current = now;
      // A failed signal is not worth interrupting the user: the next protected request
      // reports an expired session through the normal 401 path.
      void recordActivity()
        .unwrap()
        .catch(() => undefined);
    }

    for (const event of INTERACTION_EVENTS) {
      window.addEventListener(event, onInteraction, { passive: true });
    }
    return () => {
      for (const event of INTERACTION_EVENTS) {
        window.removeEventListener(event, onInteraction);
      }
    };
  }, [enabled, recordActivity]);
}
