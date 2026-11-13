/**
 * Full-page navigation to an address outside this app.
 *
 * The one login page is served by the API on the same origin, so reaching it means
 * leaving the single-page app rather than a client-side route change. Calls go
 * through this object so tests can observe them without a real navigation.
 */
export const externalNavigation = {
  assign(url: string): void {
    window.location.assign(url);
  },
  replace(url: string): void {
    window.location.replace(url);
  },
  reload(): void {
    window.location.reload();
  },
};
