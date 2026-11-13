/**
 * Return paths for the one login (`/login`), which is served outside this app.
 *
 * Only a validated same-origin relative path is carried to the login page. The login
 * page validates it again and honours it only when the role that signed in may open
 * it; otherwise the person lands on their own home.
 */
export const ADMIN_HOME = '/dashboard';
export const SHOP_HOME = '/shop';
export const LOGIN_PATH = '/login';
export const SIGNED_OUT_PATH = '/signed-out';

/** Which role's pages a path belongs to. */
export type AppArea = 'ADMIN' | 'SHOP';

const UNSAFE_PREFIXES = ['//', '/\\', 'http:', 'https:', 'javascript:', 'data:'];
/** Authentication screens and retired sign-in addresses are never a place to return to. */
const AUTH_PATHS = ['/login', '/signed-out', '/shop/login', '/shop/signup', '/shop/dashboard'];

function under(path: string, route: string): boolean {
  return path === route || path.startsWith(`${route}/`) || path.startsWith(`${route}?`);
}

export function isSafeReturnPath(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith('/')) return false;
  const lowered = value.toLowerCase();
  if (UNSAFE_PREFIXES.some((prefix) => lowered.startsWith(prefix))) return false;
  if (AUTH_PATHS.some((path) => under(lowered, path))) return false;
  return true;
}

/** Shop-owner pages live under `/shop`; every other page in this app is for staff. */
export function areaOf(pathname: string): AppArea {
  return under(pathname, SHOP_HOME) ? 'SHOP' : 'ADMIN';
}

/** The address of the one login, remembering where the person was. */
export function loginUrlFor(pathname: string, search = '', reason?: 'expired'): string {
  const target = `${pathname}${search}`;
  const params = new URLSearchParams();
  if (target !== '/' && isSafeReturnPath(target)) params.set('returnTo', target);
  if (reason) params.set('reason', reason);
  const query = params.toString();
  return query.length > 0 ? `${LOGIN_PATH}?${query}` : LOGIN_PATH;
}
