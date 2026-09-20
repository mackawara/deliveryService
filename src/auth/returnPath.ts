/**
 * Only a validated same-origin relative return path is preserved after sign-in
 * (specification section 5.1). Anything else falls back to the overview.
 */
export const DEFAULT_RETURN_PATH = '/';

const UNSAFE_PREFIXES = ['//', '/\\', 'http:', 'https:', 'javascript:', 'data:'];

export function isSafeReturnPath(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  const lowered = value.toLowerCase();
  if (UNSAFE_PREFIXES.some((prefix) => lowered.startsWith(prefix))) return false;
  // Never send the user back to an authentication screen.
  if (lowered.startsWith('/login') || lowered.startsWith('/signed-out')) return false;
  return true;
}

export function safeReturnPath(value: string | null | undefined): string {
  return isSafeReturnPath(value) ? value : DEFAULT_RETURN_PATH;
}

/** Builds the login URL that remembers where the user was. */
export function loginUrlFor(pathname: string, search = '', reason?: 'expired'): string {
  const target = `${pathname}${search}`;
  const params = new URLSearchParams();
  if (isSafeReturnPath(target)) params.set('returnTo', target);
  if (reason) params.set('reason', reason);
  const query = params.toString();
  return query.length > 0 ? `/login?${query}` : '/login';
}
