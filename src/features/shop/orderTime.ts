import { useEffect, useState } from 'react';

/** Monotonic elapsed time from an authoritative response; never trust the device wall clock. */
export function serverTimeAt(
  serverNow: string | undefined,
  receivedAt: number,
  monotonicNow: number,
) {
  return serverNow ? Date.parse(serverNow) + Math.max(0, monotonicNow - receivedAt) : 0;
}
export function useOrderClock(serverNow?: string) {
  const [frame, setFrame] = useState(() => {
    const at = performance.now();
    return { serverNow, receivedAt: at, at };
  });
  useEffect(() => {
    const update = () => {
      const at = performance.now();
      setFrame((previous) => ({
        serverNow,
        receivedAt: previous.serverNow === serverNow ? previous.receivedAt : at,
        at,
      }));
    };
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [serverNow]);
  const elapsed = frame.serverNow === serverNow ? frame.at - frame.receivedAt : 0;
  return {
    now: serverTimeAt(serverNow, 0, elapsed),
    stale: elapsed > 15_000,
    ageSeconds: Math.floor(elapsed / 1000),
  };
}
export function useOrderPolling() {
  const [visible, setVisible] = useState(!document.hidden);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    const connection = () => setOnline(navigator.onLine);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
    };
  }, []);
  return {
    visible,
    online,
    options: {
      pollingInterval: 0,
      skipPollingIfUnfocused: true,
      refetchOnFocus: true,
      refetchOnReconnect: true,
      refetchOnMountOrArgChange: true,
    },
  };
}
export function countdown(deadline: string, now: number) {
  const seconds = Math.ceil((Date.parse(deadline) - now) / 1000);
  return seconds > 0
    ? `${Math.floor(seconds / 60)}m ${seconds % 60}s remaining`
    : 'Deadline passed';
}

/** Own the visible subscription timer so cleanup cancels the next request immediately. */
export function useOrderRefresh(refresh: () => unknown, active: boolean, intervalMs = 5000) {
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(
      () => {
        void refresh();
      },
      Math.min(60000, Math.max(1000, intervalMs)),
    );
    return () => window.clearInterval(timer);
  }, [active, refresh, intervalMs]);
}
