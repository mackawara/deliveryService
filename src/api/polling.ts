/**
 * Visible-page refresh intervals (specification section 6). These are refresh
 * intervals, not live GPS or server push: polling pauses when the page is not
 * focused and off-screen panels unsubscribe.
 */
export const POLLING = {
  /** Dispatch workspace and the active booking. */
  dispatch: 10_000,
  /** Booking queue, fleet and alerts. */
  queue: 15_000,
  /** Finance and enquiries. */
  finance: 30_000,
} as const;

/** Options shared by every polled query hook. */
export function polled(intervalMs: number) {
  return { pollingInterval: intervalMs, skipPollingIfUnfocused: true } as const;
}
